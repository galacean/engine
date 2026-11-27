import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { engineShaderSource } from "../src/building/runtime/EngineShaderSource";
import { flattenShaderSource, optimizeStorageReads } from "../src/building/runtime/OptimizeStorageReads";
import { injectConstructionEntrance } from "../src/building/runtime/ConstructionEntranceShader";

const SHADERS_DIR = path.resolve(__dirname, "../src/building/assets/native/Shaders");

function countTotalWordOps(src: string): { texelFetches: number; instTernaries: number; readCalls: number } {
  const mainIdx = src.indexOf("void original_main()");
  const header = mainIdx >= 0 ? src.slice(0, mainIdx) : src;
  const body = mainIdx >= 0 ? src.slice(mainIdx) : "";

  const wordCost = new Map<string, { fetches: number; ternaries: number }>();
  for (const m of header.matchAll(/uint\s+(word_\w+)\(int\s+p\)\{([^}]+)\}/g)) {
    const fnBody = m[2]!;
    wordCost.set(m[1]!, {
      fetches: (fnBody.match(/\btexelFetch\(/g) ?? []).length,
      ternaries: (fnBody.match(/\?/g) ?? []).length
    });
  }

  const readCost = new Map<string, { fetches: number; ternaries: number }>();
  for (const m of header.matchAll(/\b\w+\s+(read_\w+)\(int\s+i\)\{([^}]+)\}/g)) {
    const fnBody = m[2]!;
    let fetches = (fnBody.match(/\btexelFetch\(/g) ?? []).length;
    let ternaries = 0;
    for (const wm of fnBody.matchAll(/\b(word_\w+)\(/g)) {
      const c = wordCost.get(wm[1]!);
      if (c) {
        fetches += c.fetches;
        ternaries += c.ternaries;
      }
    }
    readCost.set(m[1]!, { fetches, ternaries });
  }

  let texelFetches = 0;
  let instTernaries = 0;
  let readCalls = 0;
  for (const m of body.matchAll(/\b(read_\w+)\(/g)) {
    const c = readCost.get(m[1]!);
    if (c) {
      readCalls++;
      texelFetches += c.fetches;
      instTernaries += c.ternaries;
    }
  }
  return { texelFetches, instTernaries, readCalls };
}

function balancedDelimiters(src: string): boolean {
  const clean = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  let braces = 0;
  let parens = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "(") parens++;
    else if (ch === ")") parens--;
    if (braces < 0 || parens < 0) return false;
  }
  return braces === 0 && parens === 0;
}

describe("optimizeStorageReads", () => {
  it("packs uvec4 struct readers and hoists repeated immutable loads across all 16 recovered .shaderc shaders", () => {
    const files = fs
      .readdirSync(SHADERS_DIR)
      .filter((f) => f.endsWith(".shaderc"))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(16);

    const summary: Record<string, any> = {};
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(SHADERS_DIR, file), "utf8"));
      const pass = raw.subShaders[0].passes[0];
      const vsRaw = pass.vertexShaderInstructions.map((x: any) => (typeof x === "string" ? x : x[1] || "")).join("");
      const fsRaw = pass.fragmentShaderInstructions.map((x: any) => (typeof x === "string" ? x : x[1] || "")).join("");

      const vsBefore = countTotalWordOps(vsRaw);
      const fsBefore = countTotalWordOps(fsRaw);

      const vsOpt = optimizeStorageReads(vsRaw);
      const fsOpt = optimizeStorageReads(fsRaw);

      expect(balancedDelimiters(vsOpt), `${file} VS delimiters`).toBe(true);
      expect(balancedDelimiters(fsOpt), `${file} FS delimiters`).toBe(true);
      expect(vsOpt, `${file} VS no reserved __`).not.toMatch(/__/);
      expect(fsOpt, `${file} FS no reserved __`).not.toMatch(/__/);

      // Verify full engineShaderSource pipeline runs cleanly on every shader.
      const vEng = engineShaderSource(
        vsRaw
          .replace(/gl_Position = (.+) \* current_view\.world_to_sample;/g, "gl_Position = renderer_MVPMat * $1;")
          .replace("gl_Position.z=gl_Position.z*2.0-gl_Position.w;", "")
      );
      const fEng = engineShaderSource(fsRaw);
      expect(balancedDelimiters(vEng.source), `${file} engine VS`).toBe(true);
      expect(balancedDelimiters(fEng.source), `${file} engine FS`).toBe(true);

      const vsAfter = countTotalWordOps(vsOpt);
      const fsAfter = countTotalWordOps(fsOpt);

      // Strictly never increases fetches or dynamic instance ternaries.
      expect(vsAfter.texelFetches).toBeLessThanOrEqual(vsBefore.texelFetches);
      expect(fsAfter.texelFetches).toBeLessThanOrEqual(fsBefore.texelFetches);
      expect(vsAfter.instTernaries).toBeLessThanOrEqual(vsBefore.instTernaries);
      expect(fsAfter.instTernaries).toBeLessThanOrEqual(fsBefore.instTernaries);

      summary[file] = { vsBefore, vsAfter, fsBefore, fsAfter };
    }

    // Verify massive reductions on the top Android #160 compile-time hogs:
    // 1. roof.shaderc (`Masonry/4b8047e4`, 1,136ms + 1,032ms on Adreno 740):
    expect(summary["roof.shaderc"].vsBefore.instTernaries).toBeGreaterThan(500);
    expect(summary["roof.shaderc"].vsAfter.instTernaries).toBe(0);
    expect(summary["roof.shaderc"].vsAfter.texelFetches).toBeLessThanOrEqual(2);
    expect(summary["roof.shaderc"].fsBefore.instTernaries).toBeGreaterThan(1000);
    expect(summary["roof.shaderc"].fsAfter.instTernaries).toBe(0);
    expect(summary["roof.shaderc"].fsBefore.texelFetches).toBeGreaterThan(100);
    expect(summary["roof.shaderc"].fsAfter.texelFetches).toBeLessThanOrEqual(5);

    // 2. brick.shaderc (`Masonry/beb62df6` & `f393f98f`):
    expect(summary["brick.shaderc"].vsBefore.texelFetches).toBeGreaterThan(500);
    expect(summary["brick.shaderc"].vsAfter.texelFetches).toBeLessThanOrEqual(10);

    // 3. wood.shaderc (`Masonry/d9fd2c41`):
    expect(summary["wood.shaderc"].vsBefore.texelFetches).toBeGreaterThan(500);
    expect(summary["wood.shaderc"].vsAfter.texelFetches).toBeLessThanOrEqual(10);

    // 4. Verify injectConstructionEntrance still attaches cleanly to roof, brick, wood.
    for (const [file, family] of [
      ["roof.shaderc", "roof"],
      ["brick.shaderc", "brick"],
      ["wood.shaderc", "wood"]
    ] as const) {
      const raw = JSON.parse(fs.readFileSync(path.join(SHADERS_DIR, file), "utf8"));
      const pass = raw.subShaders[0].passes[0];
      const vsRaw = pass.vertexShaderInstructions.map((x: any) => (typeof x === "string" ? x : x[1] || "")).join("");
      const fsRaw = pass.fragmentShaderInstructions.map((x: any) => (typeof x === "string" ? x : x[1] || "")).join("");
      const vEng = engineShaderSource(
        vsRaw
          .replace(/gl_Position = (.+) \* current_view\.world_to_sample;/g, "gl_Position = renderer_MVPMat * $1;")
          .replace("gl_Position.z=gl_Position.z*2.0-gl_Position.w;", "")
      );
      const fEng = engineShaderSource(fsRaw);
      const ent = injectConstructionEntrance(vEng.source, fEng.source, family);
      expect(balancedDelimiters(ent.vertex), `${file} entrance VS`).toBe(true);
      expect(balancedDelimiters(ent.fragment), `${file} entrance FS`).toBe(true);
    }

    console.log("OptimizeStorageReads summary:");
    for (const [file, s] of Object.entries(summary)) {
      console.log(
        `  ${file.padEnd(28)} VS: ${s.vsBefore.texelFetches}F/${s.vsBefore.instTernaries}T -> ${s.vsAfter.texelFetches}F/${s.vsAfter.instTernaries}T | FS: ${s.fsBefore.texelFetches}F/${s.fsBefore.instTernaries}T -> ${s.fsAfter.texelFetches}F/${s.fsAfter.instTernaries}T`
      );
    }
  });

  it("never hoists texture-backed reads past a braceless if guard", () => {
    const guarded = `#version 300 es
uniform highp usampler2D storage_0_0;
flat in uint v0;
uint word_buf(int p){ivec2 sz=textureSize(storage_0_0,0);return texelFetch(storage_0_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint read_buf(int i){return word_buf((i*1)+0);}
void original_main(){
  uint x = 0u;
  if (v0 < 10u) x = read_buf(int(v0)) + read_buf(int(v0));
}
void main(){original_main();}`;
    const out = optimizeStorageReads(guarded);
    expect(out).not.toContain("es_h0=");
    expect(out).toContain("if (v0 < 10u) x = read_buf(int(v0)) + read_buf(int(v0));");
  });

  it("never splits for(init; cond; step) headers when hoisting reads", () => {
    const forHeader = `#version 300 es
uniform highp usampler2D storage_0_0;
flat in uint v0;
uint word_buf(int p){ivec2 sz=textureSize(storage_0_0,0);return texelFetch(storage_0_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint read_buf(int i){return word_buf((i*1)+0);}
void original_main(){
  uint sum = 0u;
  for (uint i = 0u; i < read_buf(int(v0)); i += read_buf(int(v0))) {
    sum += i;
  }
}
void main(){original_main();}`;
    const out = optimizeStorageReads(forHeader);
    expect(balancedDelimiters(out)).toBe(true);
    expect(out).not.toContain("es_h0=");
    expect(out).toContain("for (uint i = 0u; i < read_buf(int(v0)); i += read_buf(int(v0)))");
  });

  it("never hoists pureInstance reads directly before an else branch", () => {
    const elseBranch = `#version 300 es
struct Inst_natural { uint a; uint b; uint c; uint d; uint e; uint f; uint g; uint h; uint i; uint j; uint k; uint l; uint m; uint n; uint o; uint p; };
flat in uvec4 instanceRecord0;
flat in uvec4 instanceRecord1;
flat in uvec4 instanceRecord2;
flat in uvec4 instanceRecord3;
flat in uint v6;
uint word_inst(int p){int q=p%16;return q<4?instanceRecord0[q%4]:q<8?instanceRecord1[q%4]:q<12?instanceRecord2[q%4]:instanceRecord3[q%4];}
Inst_natural read_inst(int i){return Inst_natural(word_inst((i*16)+0),word_inst((i*16)+1),word_inst((i*16)+2),word_inst((i*16)+3),word_inst((i*16)+4),word_inst((i*16)+5),word_inst((i*16)+6),word_inst((i*16)+7),word_inst((i*16)+8),word_inst((i*16)+9),word_inst((i*16)+10),word_inst((i*16)+11),word_inst((i*16)+12),word_inst((i*16)+13),word_inst((i*16)+14),word_inst((i*16)+15));}
void original_main(){
  uint x = 0u;
  if (v6 == 0u) {
    x = 1u;
  } else {
    x = read_inst(int(v6)).a + read_inst(int(v6)).b;
  }
}
void main(){original_main();}`;
    const out = optimizeStorageReads(elseBranch);
    expect(balancedDelimiters(out)).toBe(true);
    // Must not inject a statement between `}` and `else` (which would be a GLSL syntax error).
    expect(out).not.toMatch(/es_h\d+[^;]*;\s*else\b/);
    expect(out).toMatch(/\}\s*else\s*\{/);
  });

  it("never hoists texture-backed reads past &&, ||, or ?: short-circuit guards", () => {
    const shortCircuit = `#version 300 es
uniform highp usampler2D storage_0_0;
flat in uint v0;
uint word_buf(int p){ivec2 sz=textureSize(storage_0_0,0);return texelFetch(storage_0_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint read_buf(int i){return word_buf((i*1)+0);}
void original_main(){
  bool a = (v0 < 10u) && (read_buf(int(v0)) > 0u) && (read_buf(int(v0)) < 5u);
  bool b = (v0 >= 10u) || (read_buf(int(v0)) == 1u);
  uint c = (v0 < 10u) ? (read_buf(int(v0)) + read_buf(int(v0))) : 0u;
}
void main(){original_main();}`;
    const out = optimizeStorageReads(shortCircuit);
    expect(out).not.toContain("es_h0=");
  });

  it("detects struct-field and element mutations and ignores braces inside comments during inner-block hoisting", () => {
    const mutatedField = `#version 300 es
struct Pair_natural { uint slot; uint arr[2]; };
uniform highp usampler2D storage_0_0;
uint word_buf(int p){ivec2 sz=textureSize(storage_0_0,0);return texelFetch(storage_0_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint read_buf(int i){return word_buf((i*1)+0);}
void original_main(){
  Pair_natural s = Pair_natural(0u, uint[2](0u, 1u));
  uint a = read_buf(int(s.slot));
  ++s.slot;
  uint b = read_buf(int(s.slot));
  Pair_natural t = Pair_natural(1u, uint[2](0u, 1u));
  uint c = read_buf(int(t.slot));
  t.arr[0] = 2u;
  uint d = read_buf(int(t.slot));
}
void main(){original_main();}`;
    const outMut = optimizeStorageReads(mutatedField);
    expect(outMut).not.toContain("es_h0=");

    // Inner-block hoisting must skip `{` / `}` inside comments when locating the enclosing block.
    const commentBrace = `#version 300 es
uniform highp usampler2D storage_0_0;
flat in uint v0;
uint word_buf(int p){ivec2 sz=textureSize(storage_0_0,0);return texelFetch(storage_0_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint read_buf(int i){return word_buf((i*1)+0);}
void original_main(){
  if (v0 < 10u) {
    // stray comment brace { that must be ignored
    /* another comment brace } { */
    int idx = int(v0) + 1;
    uint sum = read_buf(int(idx)) + read_buf(int(idx));
  }
}
void main(){original_main();}`;
    const outComment = optimizeStorageReads(commentBrace);
    expect(balancedDelimiters(outComment)).toBe(true);
    expect(outComment).toContain("uint es_h0=read_buf(int(idx));");
    expect(outComment).toContain("uint sum = es_h0 + es_h0;");
  });

  it("flattens ConsString ropes and SlicedString parents without altering content", () => {
    expect(flattenShaderSource("")).toBe("");
    expect(flattenShaderSource("abc")).toBe("abc");
    const big = "x".repeat(4096) + "marker" + "y".repeat(4096);
    const sliced = big.slice(4090, 4110);
    const rope = sliced + "\nvec3 x = vec3(1.0);\n" + sliced;
    expect(flattenShaderSource(sliced)).toBe(sliced);
    expect(flattenShaderSource(rope)).toBe(rope);
    const withNull = "abc\u0000def\u0000ghi";
    expect(flattenShaderSource(withNull)).toBe(withNull);
  });
});
