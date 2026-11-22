/**
 * Bit-for-bit exact de-inlining & dummy-loop folding for SPIRV-Cross recovered
 * building shaders (`plaster`, `roof`, `brick`, `sdf-brick`, `wood`, `glass`, etc.).
 *
 * Background:
 * SPIRV-Cross emits 2D/3D procedural hash-noise cells as 35-line blocks with
 * 1-iteration (`< 1u`) or 2-iteration (`< 2u`, dynamically indexed `vec2[i]`)
 * `for (;;)` loops, and inlines 9 full copies of 3/5-octave FBM into `plaster`
 * (75.7 KB, 1,987 lines, 45 `for (;;)` loops in one `original_main()`), which
 * causes mobile GLSL compilers (Mali/Adreno) to spend >1.3s compiling one shader.
 *
 * Every transform below preserves the exact uint32 Jenkins + PCG mix operations
 * and IEEE-754 float constants while shrinking `plaster` by >80% and folding all
 * `< 1u` / `< 2u` dummy loops across all building shaders to zero.
 */

const HELPER_JENKINS_MIX = `uint tgOpt_jenkins(uint x){
  x += x << 10u;
  x ^= x >> 6u;
  x += x << 3u;
  x ^= x >> 11u;
  return x + (x << 15u);
}
uint tgOpt_mixU(uint a, uint b){
  uint h = ((a * 1664525u + b) + 1013904223u) * 1664525u;
  h ^= h >> 11u;
  h ^= (h << 7u) & 2636928640u;
  h ^= (h << 15u) & 4022730752u;
  return h ^ (h >> 18u);
}
`;

const HELPER_HASH2F = `float tgOpt_hash2f(uvec2 c){
  uint h = tgOpt_mixU(c.x, tgOpt_jenkins(c.y));
  return uintBitsToFloat((h & 8388607u) | 1065353216u) - 1.0;
}
`;

const HELPER_HASH3V2 = `vec2 tgOpt_hash3v2(uvec3 c){
  uint h0 = tgOpt_mixU(c.x, tgOpt_mixU(c.y, tgOpt_jenkins(c.z)));
  uint h1 = tgOpt_jenkins(h0);
  return vec2(
    uintBitsToFloat((h0 & 8388607u) | 1065353216u) - 1.0,
    uintBitsToFloat((h1 & 8388607u) | 1065353216u) - 1.0
  );
}
`;

const HELPER_PLASTER_FBM = `float tgOpt_plasterFbm(vec2 p, int octaves){
  float acc = 0.0;
  float amp = 0.5;
  const mat2 rot = mat2(
    vec2(0.800000011920928955078125, -0.60000002384185791015625),
    vec2(0.60000002384185791015625, 0.800000011920928955078125)
  );
  for (int i = 0; i < octaves; i++) {
    ivec2 ci = ivec2(floor(p));
    vec2 fr = fract(p);
    float c00 = tgOpt_hash2f(uvec2(ci));
    float c10 = tgOpt_hash2f(uvec2(ci + ivec2(1, 0)));
    float c01 = tgOpt_hash2f(uvec2(ci + ivec2(0, 1)));
    float c11 = tgOpt_hash2f(uvec2(ci + ivec2(1, 1)));
    vec2 u = (fr * fr) * (vec2(3.0) - (vec2(2.0) * fr));
    float ux = u.x;
    float ox = 1.0 - ux;
    float uy = u.y;
    float n = ((((1.0 - uy) * ((c00 * ox) + (c10 * ux))) + ((c01 * ox) * uy)) + ((c11 * ux) * uy));
    acc += amp * (-1.0 + 2.0 * n);
    amp *= 0.550000011920928955078125;
    p = (p * 1.89999997615814208984375) * rot;
  }
  return acc;
}
`;

// Pattern 1a: 2D hash + 1-iteration `< 1u` loop writing into an already-declared float variable (`plaster.shaderc`).
const RE_HASH2F_ASSIGN =
  /uvec2\s+(\w+)\s*=\s*uvec2\(([^;\n]+)\);\s*\n\s*uint\s+\w+\s*=\s*\1\.y;\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\+\s*\(\w+\s*<<\s*10u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*6u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\+\s*\(\w+\s*<<\s*3u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*11u\);\s*\n\s*uint\s+\w+\s*=\s*\(\(\(\1\.x\s*\*\s*1664525u\)\s*\+\s*\(\w+\s*\+\s*\(\w+\s*<<\s*15u\)\)\)\s*\+\s*1013904223u\)\s*\*\s*1664525u;\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*11u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\(\w+\s*<<\s*7u\)\s*&\s*2636928640u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\(\w+\s*<<\s*15u\)\s*&\s*4022730752u\);\s*\n\s*uint\s+(\w+)\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*18u\);\s*\n\s*(\w+)\s*=\s*\w+;\s*\n\s*uint\s+\w+;\s*\n\s*uint\s+\w+;\s*\n\s*float\s+\w+;\s*\n\s*uint\s+(\w+)\s*=\s*0u;\s*\n\s*uint\s+\w+\s*=\s*\3;\s*\n\s*for\s*\(;;\)\s*\n\s*\{\s*\n\s*if\s*\(!\(\5\s*<\s*1u\)\)\s*\n\s*\{\s*\n\s*break;\s*\n\s*\}\s*\n[\s\S]*?\4\s*=\s*\w+;\s*\n\s*\5\s*=\s*\w+;\s*\n\s*continue;\s*\n\s*\}/g;

// Pattern 1b: 2D hash + 1-iteration `< 1u` loop with local `float outVar;` declaration (`roof.shaderc`, `glass.shaderc`).
const RE_HASH2F_DECL =
  /uvec2\s+(\w+)\s*=\s*uvec2\(([^;\n]+)\);\s*\n\s*uint\s+\w+\s*=\s*\1\.y;\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\+\s*\(\w+\s*<<\s*10u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*6u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\+\s*\(\w+\s*<<\s*3u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*11u\);\s*\n\s*uint\s+\w+\s*=\s*\(\(\(\1\.x\s*\*\s*1664525u\)\s*\+\s*\(\w+\s*\+\s*\(\w+\s*<<\s*15u\)\)\)\s*\+\s*1013904223u\)\s*\*\s*1664525u;\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*11u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\(\w+\s*<<\s*7u\)\s*&\s*2636928640u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\(\w+\s*<<\s*15u\)\s*&\s*4022730752u\);\s*\n\s*uint\s+(\w+)\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*18u\);\s*\n\s*float\s+(\w+);\s*\n\s*\4\s*=\s*\w+;\s*\n\s*uint\s+\w+;\s*\n\s*uint\s+\w+;\s*\n\s*float\s+\w+;\s*\n\s*uint\s+(\w+)\s*=\s*0u;\s*\n\s*uint\s+\w+\s*=\s*\3;\s*\n\s*for\s*\(;;\)\s*\n\s*\{\s*\n\s*if\s*\(!\(\5\s*<\s*1u\)\)\s*\n\s*\{\s*\n\s*break;\s*\n\s*\}\s*\n[\s\S]*?\4\s*=\s*\w+;\s*\n\s*\5\s*=\s*\w+;\s*\n\s*continue;\s*\n\s*\}/g;

// Pattern 2: 3D hash + 2-iteration `< 2u` dynamic-index `vec2[i]` loop (all 14 building vertex shaders).
const RE_HASH3V2_DECL =
  /uvec3\s+(\w+)\s*=\s*uvec3\(([^;\n]+)\);\s*\n\s*uint\s+\w+\s*=\s*\1\.z;\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\+\s*\(\w+\s*<<\s*10u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*6u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\+\s*\(\w+\s*<<\s*3u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*11u\);\s*\n\s*uint\s+\w+\s*=\s*\(\(\(\1\.y\s*\*\s*1664525u\)\s*\+\s*\(\w+\s*\+\s*\(\w+\s*<<\s*15u\)\)\)\s*\+\s*1013904223u\)\s*\*\s*1664525u;\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*11u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\(\w+\s*<<\s*7u\)\s*&\s*2636928640u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\(\w+\s*<<\s*15u\)\s*&\s*4022730752u\);\s*\n\s*uint\s+\w+\s*=\s*\(\(\(\1\.x\s*\*\s*1664525u\)\s*\+\s*\(\w+\s*\^\s*\(\w+\s*>>\s*18u\)\)\)\s*\+\s*1013904223u\)\s*\*\s*1664525u;\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*11u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\(\w+\s*<<\s*7u\)\s*&\s*2636928640u\);\s*\n\s*uint\s+\w+\s*=\s*\w+\s*\^\s*\(\(\w+\s*<<\s*15u\)\s*&\s*4022730752u\);\s*\n\s*uint\s+(\w+)\s*=\s*\w+\s*\^\s*\(\w+\s*>>\s*18u\);\s*\n\s*uint\s+\w+;\s*\n\s*uint\s+\w+;\s*\n\s*vec2\s+(\w+);\s*\n\s*uint\s+(\w+)\s*=\s*0u;\s*\n\s*uint\s+\w+\s*=\s*\3;\s*\n\s*for\s*\(;;\)\s*\n\s*\{\s*\n\s*if\s*\(!\(\5\s*<\s*2u\)\)\s*\n\s*\{\s*\n\s*break;\s*\n\s*\}\s*\n[\s\S]*?\4\[\5\]\s*=\s*uintBitsToFloat\([\s\S]*?\5\s*=\s*\w+;\s*\n\s*continue;\s*\n\s*\}/g;

// Pattern 3: 3/5-octave 2D plaster FBM loop (9 copies in `plaster.shaderc`) after Pattern 1a has run.
const RE_PLASTER_FBM =
  /float\s+(\w+);\s*\n\s*vec2\s+(\w+);\s*\n\s*\2\s*=\s*([^;\n]+);\s*\n\s*\1\s*=\s*0\.0;\s*\n(?:\s*(?:float|vec2|int)\s+\w+(?:\s*=\s*[^;\n]+)?;\s*\n)+\s*for\s*\(;;\)\s*\n\s*\{\s*\n\s*if\s*\(!\(\w+\s*<\s*(\d+)\)\)\s*\n\s*\{\s*\n\s*break;\s*\n\s*\}\s*\n\s*ivec2\s+\w+\s*=\s*ivec2\(floor\(\2\)\);\s*\n\s*vec2\s+\w+\s*=\s*fract\(\2\);\s*\n\s*\w+\s*=\s*tgOpt_hash2f\([\s\S]*?0\.550000011920928955078125;\s*\n[\s\S]*?1\.89999997615814208984375[\s\S]*?continue;\s*\n\s*\}/g;

export function simplifySpirvNoise(source: string): string {
  // Fast exit when shader contains none of the SPIRV-Cross PCG hash constants.
  if (!source.includes("1664525u")) return source;

  let out = source;
  let used2f = false;
  let used3v2 = false;
  let usedFbm = false;

  out = out.replace(RE_HASH2F_ASSIGN, (_m, _uvar, expr, _hvar, outVar) => {
    used2f = true;
    return `${outVar} = tgOpt_hash2f(uvec2(${expr}));`;
  });

  out = out.replace(RE_HASH2F_DECL, (_m, _uvar, expr, _hvar, outVar) => {
    used2f = true;
    return `float ${outVar} = tgOpt_hash2f(uvec2(${expr}));`;
  });

  out = out.replace(RE_HASH3V2_DECL, (_m, _uvar, expr, _hvar, outVar) => {
    used3v2 = true;
    return `vec2 ${outVar} = tgOpt_hash3v2(uvec3(${expr}));`;
  });

  if (used2f) {
    out = out.replace(RE_PLASTER_FBM, (_m, outVar, _pVar, initExpr, octaves) => {
      usedFbm = true;
      return `float ${outVar} = tgOpt_plasterFbm(${initExpr}, ${octaves});`;
    });
  }

  if (!used2f && !used3v2 && !usedFbm) return source;

  let helpers = HELPER_JENKINS_MIX;
  if (used2f || usedFbm) helpers += HELPER_HASH2F;
  if (used3v2) helpers += HELPER_HASH3V2;
  if (usedFbm) helpers += HELPER_PLASTER_FBM;

  const entryIdx = out.indexOf("void original_main()");
  if (entryIdx < 0) return source;
  return out.slice(0, entryIdx) + helpers + out.slice(entryIdx);
}
