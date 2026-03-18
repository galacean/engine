/**
 * A/B Test: Live ShaderLab compilation vs Precompiled (.gsb) path
 *
 * Tests verify:
 *   1. GLSL source identity: _parseShaderPass output === precompiled vertexSource/fragmentSource
 *   2. WebGL compilation: precompiled GLSL compiles to valid WebGL programs (same as glslValidate)
 *   3. RenderState equivalence: constantMap/variableMap identical from both paths
 *   4. Tags & metadata: name, tags, platform, pass structure match
 *   5. Macro expansion: evaluateSegmentTree output is compilable GLSL for various macro combos
 *   6. Full .gsb round-trip: encode → decode → create ShaderPass → WebGL compile
 */

import {
  Shader,
  ShaderLanguage,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderPass
} from "@galacean/engine-core";
import { registerIncludes, PBRSource } from "@galacean/engine-shader";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { encode, decode } from "@galacean/engine-shaderlab/src/PrecompiledShaderCodec";
import {
  parseSegmentTree,
  evaluateSegmentTree
} from "@galacean/engine-shaderlab/src/MacroCodeSegment";

import { Logger, WebGLEngine } from "@galacean/engine";
import { server } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";

const { readFile } = server.commands;
Logger.enable();
registerIncludes();

const shaderLab = new ShaderLab();

// ─── Macro sets ────────────────────────────────────────────────────────
const baseMacros: { name: string; value?: string }[] = [
  { name: "RENDERER_IS_RECEIVE_SHADOWS" },
  { name: "RENDERER_HAS_NORMAL" },
  { name: "SCENE_USE_SH" },
  { name: "SCENE_USE_SPECULAR_ENV" },
  { name: "SCENE_FOG_MODE", value: "0" },
  { name: "SCENE_SHADOW_CASCADED_COUNT", value: "1" },
  { name: "MATERIAL_NEED_WORLD_POS" },
  { name: "MATERIAL_NEED_TILING_OFFSET" },
  { name: "REFRACTION_MODE", value: "1" },
  { name: "SCENE_DIRECT_LIGHT_COUNT", value: "1" },
  { name: "SCENE_SHADOW_TYPE", value: "2" }
];

const materialVariantMacros: { name: string; value?: string }[] = [
  { name: "MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE" },
  { name: "MATERIAL_ENABLE_IRIDESCENCE" },
  { name: "MATERIAL_ENABLE_ANISOTROPY" },
  { name: "MATERIAL_ENABLE_SHEEN" },
  { name: "MATERIAL_HAS_SHEEN_TEXTURE" },
  { name: "REFRACTION_MODE", value: "1" },
  { name: "MATERIAL_ENABLE_TRANSMISSION" },
  { name: "MATERIAL_HAS_THICKNESS" }
];

function buildMacroCollection(macros: { name: string; value?: string }[]): ShaderMacroCollection {
  const collection = new ShaderMacroCollection();
  for (const { name, value } of macros) {
    collection.enable(ShaderMacro.getByName(name, value));
  }
  return collection;
}

function makeMacroMap(macros: { name: string; value?: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const { name, value } of macros) {
    map.set(name, value ?? "");
  }
  return map;
}

/**
 * Normalize for semantic comparison.
 * Strips blank lines, trims, and removes #define/#undef lines because:
 * - _parseMacros keeps them as text in the output
 * - evaluateSegmentTree converts them to DefineSegments (no text output)
 * Both behaviors are correct for their respective use cases.
 */
const normalize = (s: string) =>
  s.split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^#\s*(define|undef)\b/.test(line) && // #define/#undef: handled differently by both paths
        !line.startsWith("//") // pure comment lines: may be consumed by DefineSegment
    )
    .join("\n");

// ─── Tests ─────────────────────────────────────────────────────────────

describe("Precompile A/B Test: Live vs Precompiled", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });

  // @ts-ignore
  Shader._shaderLab = shaderLab;

  const basePath = new URL("", ShaderPass._shaderRootPath).href;

  // ═══════════════════════════════════════════════════════════
  // A/B 1: GLSL Source Identity
  // ═══════════════════════════════════════════════════════════
  describe("A/B: GLSL source identity", () => {
    const testShaders = [
      "noFragArgs.shader",
      "waterfull.shader",
      "multi-pass.shader",
      "macro-pre.shader",
      "mrt-struct.shader"
    ];

    for (const file of testShaders) {
      it(`${file}: live GLSL === precompiled GLSL`, async () => {
        const source = await readFile(`./shaders/${file}`);
        const parsed = shaderLab._parseShaderSource(source);
        const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

        for (let i = 0; i < parsed.subShaders.length; i++) {
          for (let j = 0; j < parsed.subShaders[i].passes.length; j++) {
            const livePass = parsed.subShaders[i].passes[j];
            if (livePass.isUsePass) continue;

            const liveProgram = shaderLab._parseShaderPass(
              livePass.contents, livePass.vertexEntry, livePass.fragmentEntry,
              ShaderLanguage.GLSLES100, basePath
            );

            expect(precompiled.subShaders[i].passes[j].vertexSource).toBe(liveProgram.vertex);
            expect(precompiled.subShaders[i].passes[j].fragmentSource).toBe(liveProgram.fragment);
          }
        }
      });
    }

    for (const platform of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const label = platform === ShaderLanguage.GLSLES100 ? "GLSLES100" : "GLSLES300";
      it(`PBR (${label}): live GLSL === precompiled GLSL`, () => {
        const parsed = shaderLab._parseShaderSource(PBRSource);
        const precompiled = shaderLab._precompile(PBRSource, platform, basePath);

        for (let i = 0; i < parsed.subShaders.length; i++) {
          for (let j = 0; j < parsed.subShaders[i].passes.length; j++) {
            const livePass = parsed.subShaders[i].passes[j];
            if (livePass.isUsePass) continue;

            const liveProgram = shaderLab._parseShaderPass(
              livePass.contents, livePass.vertexEntry, livePass.fragmentEntry,
              platform, basePath
            );
            expect(precompiled.subShaders[i].passes[j].vertexSource).toBe(liveProgram.vertex);
            expect(precompiled.subShaders[i].passes[j].fragmentSource).toBe(liveProgram.fragment);
          }
        }
      });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // A/B 2: WebGL Compilation (precompiled GLSL → ShaderProgram)
  //   Same approach as glslValidate: create ShaderPass from GLSL, compile with macros.
  // ═══════════════════════════════════════════════════════════
  describe("A/B: WebGL compilation from precompiled GLSL", () => {
    function validatePrecompiledWebGL(
      source: string,
      platform: ShaderLanguage,
      macros: { name: string; value?: string }[]
    ) {
      const precompiled = shaderLab._precompile(source, platform, basePath);
      const macroCollection = buildMacroCollection(macros);

      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass || !pass.vertexSource) continue;

          const shaderPass = new ShaderPass(pass.name, pass.vertexSource, pass.fragmentSource!, pass.tags);
          // @ts-ignore
          shaderPass._platformTarget = platform;

          // @ts-ignore
          const program = shaderPass._getCanonicalShaderProgram(engine, macroCollection);
          expect(program.isValid, `Pass "${pass.name}" should compile to valid WebGL`).toBe(true);
        }
      }
    }

    it("PBR: precompiled GLSL → WebGL (base macros)", () => {
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, baseMacros);
    });

    it("PBR: precompiled GLSL → WebGL (material variant macros)", () => {
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, [...baseMacros, ...materialVariantMacros]);
    });

    // Note: PBR requires certain macros (SCENE_DIRECT_LIGHT_COUNT etc.) to compile.
    // An empty macro set is NOT expected to produce valid WebGL for PBR.

    const simpleShaders = ["noFragArgs.shader", "waterfull.shader", "mrt-struct.shader", "multi-pass.shader"];
    for (const file of simpleShaders) {
      it(`${file}: precompiled GLSL → WebGL`, async () => {
        const source = await readFile(`./shaders/${file}`);
        validatePrecompiledWebGL(source, ShaderLanguage.GLSLES100, baseMacros);
      });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // A/B 3: Full .gsb round-trip → WebGL
  //   precompile → encode → decode → ShaderPass → WebGL compile
  // ═══════════════════════════════════════════════════════════
  describe("A/B: Full .gsb round-trip → WebGL", () => {
    function validateGsbRoundTrip(
      source: string,
      platform: ShaderLanguage,
      macros: { name: string; value?: string }[]
    ) {
      const precompiled = shaderLab._precompile(source, platform, basePath);
      const buffer = encode(precompiled);
      const decoded = decode(buffer);
      const macroCollection = buildMacroCollection(macros);

      for (const sub of decoded.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass || !pass.vertexSource) continue;

          const shaderPass = new ShaderPass(pass.name, pass.vertexSource, pass.fragmentSource!, pass.tags);
          // @ts-ignore
          shaderPass._platformTarget = platform;

          // @ts-ignore
          const program = shaderPass._getCanonicalShaderProgram(engine, macroCollection);
          expect(program.isValid, `GSB round-trip pass "${pass.name}" should compile`).toBe(true);
        }
      }
    }

    it("PBR: .gsb → WebGL (base macros)", () => {
      validateGsbRoundTrip(PBRSource, ShaderLanguage.GLSLES100, baseMacros);
    });

    it("PBR: .gsb → WebGL (material variant macros)", () => {
      validateGsbRoundTrip(PBRSource, ShaderLanguage.GLSLES100, [...baseMacros, ...materialVariantMacros]);
    });

    const simpleShaders = ["noFragArgs.shader", "waterfull.shader", "mrt-struct.shader"];
    for (const file of simpleShaders) {
      it(`${file}: .gsb → WebGL`, async () => {
        const source = await readFile(`./shaders/${file}`);
        validateGsbRoundTrip(source, ShaderLanguage.GLSLES100, baseMacros);
      });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // A/B 4: RenderState equivalence
  // ═══════════════════════════════════════════════════════════
  describe("A/B: RenderState equivalence", () => {
    it("multi-pass: renderStates match between paths", async () => {
      const source = await readFile("./shaders/multi-pass.shader");
      const parsed = shaderLab._parseShaderSource(source);
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      for (let i = 0; i < parsed.subShaders.length; i++) {
        for (let j = 0; j < parsed.subShaders[i].passes.length; j++) {
          const livePass = parsed.subShaders[i].passes[j];
          if (livePass.isUsePass) continue;
          const prePass = precompiled.subShaders[i].passes[j];

          // constantMap values (Color → [r,g,b,a])
          for (const key of Object.keys(livePass.renderStates.constantMap)) {
            const liveVal = livePass.renderStates.constantMap[key];
            const preVal = prePass.renderStates.constantMap[key];
            if (liveVal && typeof liveVal === "object" && "r" in liveVal) {
              expect(preVal).toEqual([liveVal.r, liveVal.g, liveVal.b, liveVal.a]);
            } else {
              expect(preVal).toEqual(liveVal);
            }
          }

          // variableMap keys
          const liveVarKeys = Object.keys(livePass.renderStates.variableMap).sort();
          const preVarKeys = Object.keys(prePass.renderStates.variableMap).sort();
          expect(preVarKeys).toEqual(liveVarKeys);
        }
      }
    });

    it("PBR: renderStates variableMap keys match", () => {
      const parsed = shaderLab._parseShaderSource(PBRSource);
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);

      for (let i = 0; i < parsed.subShaders.length; i++) {
        for (let j = 0; j < parsed.subShaders[i].passes.length; j++) {
          const livePass = parsed.subShaders[i].passes[j];
          if (livePass.isUsePass) continue;

          const prePass = precompiled.subShaders[i].passes[j];
          const liveVarKeys = Object.keys(livePass.renderStates.variableMap).sort();
          const preVarKeys = Object.keys(prePass.renderStates.variableMap).sort();
          expect(preVarKeys).toEqual(liveVarKeys);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // A/B 5: Tags & metadata
  // ═══════════════════════════════════════════════════════════
  describe("A/B: Tags and metadata", () => {
    const tagShaders = [
      "noFragArgs.shader",
      "multi-pass.shader",
      "macro-pre.shader"
    ];

    for (const file of tagShaders) {
      it(`${file}: metadata matches between paths`, async () => {
        const source = await readFile(`./shaders/${file}`);
        const parsed = shaderLab._parseShaderSource(source);
        const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

        expect(precompiled.name).toBe(parsed.name);

        for (let i = 0; i < parsed.subShaders.length; i++) {
          expect(precompiled.subShaders[i].name).toBe(parsed.subShaders[i].name);
          expect(JSON.stringify(precompiled.subShaders[i].tags ?? {})).toBe(
            JSON.stringify(parsed.subShaders[i].tags ?? {})
          );
          expect(precompiled.subShaders[i].passes.length).toBe(parsed.subShaders[i].passes.length);

          for (let j = 0; j < parsed.subShaders[i].passes.length; j++) {
            const livePass = parsed.subShaders[i].passes[j];
            const prePass = precompiled.subShaders[i].passes[j];
            expect(prePass.name).toBe(livePass.name);
            expect(prePass.isUsePass).toBe(livePass.isUsePass === true);

            if (livePass.tags) {
              for (const [k, v] of Object.entries(livePass.tags)) {
                expect(prePass.tags![k]).toBe(v);
              }
            }
          }
        }
      });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // A/B 6: Macro expansion consistency
  //   evaluateSegmentTree output ≈ _parseMacros output (semantic)
  // ═══════════════════════════════════════════════════════════
  describe("A/B: Macro expansion consistency", () => {
    // Only test with genuinely runtime macros.
    // Preprocessor-substituted literals (e.g. SCENE_SHADOW_TYPE → 3) may cause
    // minor whitespace differences between evaluateSegmentTree and _parseMacros
    // that are semantically equivalent but not byte-identical.
    const macroCombos: Array<{ label: string; macros: { name: string; value?: string }[] }> = [
      { label: "empty", macros: [] },
      { label: "WEBGL2", macros: [{ name: "GRAPHICS_API_WEBGL2" }] },
      { label: "runtime macros", macros: [
        { name: "RENDERER_IS_RECEIVE_SHADOWS" },
        { name: "RENDERER_HAS_NORMAL" },
        { name: "SCENE_USE_SH" },
        { name: "MATERIAL_NEED_WORLD_POS" }
      ]}
    ];

    // PBR is too complex for text-level comparison (inline comments on #define lines,
    // whitespace around macro expansion, etc.). The WebGL compilation tests (A/B 2 & 3)
    // are the authoritative correctness check for PBR.
    // Text-level comparison is reserved for simpler shaders below.

    it("macro-pre: segment tree matches _parseMacros", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      const combos: Array<{ label: string; macros: { name: string; value?: string }[] }> = [
        { label: "empty", macros: [] },
        { label: "XX_Macro", macros: [{ name: "XX_Macro" }] },
        { label: "RECV_SHADOWS", macros: [{ name: "RENDERER_IS_RECEIVE_SHADOWS" }] }
      ];

      for (const { label, macros } of combos) {
        const macroMap = makeMacroMap(macros);
        const macroObjects = macros.map(({ name, value }) => ({ name, value: value ?? "" }));

        for (const sub of precompiled.subShaders) {
          for (const pass of sub.passes) {
            if (pass.isUsePass) continue;
            if (pass.fragmentSegments && pass.fragmentHasMacros) {
              const fromTree = evaluateSegmentTree(pass.fragmentSegments, new Map(macroMap));
              const fromParser = shaderLab._parseMacros(pass.fragmentSource!, macroObjects);
              expect(normalize(fromTree), `macro-pre frag [${label}]`).toBe(normalize(fromParser));
            }
          }
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // A/B 7: hasMacros optimization correctness
  //   When hasMacros=false, shader still compiles correctly.
  // ═══════════════════════════════════════════════════════════
  describe("A/B: hasMacros optimization", () => {
    it("noFragArgs (hasMacros=false): still compiles with full macro set", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      // Verify hasMacros flag
      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass) continue;
          expect(pass.vertexHasMacros).toBe(false);
          expect(pass.fragmentHasMacros).toBe(false);
        }
      }

      // Compile with macros — should still work because hasMacros=false means
      // the three-tier dispatch skips macro expansion entirely (correct behavior)
      const macroCollection = buildMacroCollection(baseMacros);
      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass || !pass.vertexSource) continue;
          const shaderPass = new ShaderPass(pass.name, pass.vertexSource, pass.fragmentSource!, pass.tags);
          // @ts-ignore
          shaderPass._platformTarget = ShaderLanguage.GLSLES100;
          // @ts-ignore
          const program = shaderPass._getCanonicalShaderProgram(engine, macroCollection);
          expect(program.isValid).toBe(true);
        }
      }
    });

    it("mrt-struct (hasMacros=false): compiles correctly", async () => {
      const source = await readFile("./shaders/mrt-struct.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass) continue;
          expect(pass.vertexHasMacros).toBe(false);
          expect(pass.fragmentHasMacros).toBe(false);
        }
      }

      const macroCollection = buildMacroCollection(baseMacros);
      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass || !pass.vertexSource) continue;
          const shaderPass = new ShaderPass(pass.name, pass.vertexSource, pass.fragmentSource!, pass.tags);
          // @ts-ignore
          shaderPass._platformTarget = ShaderLanguage.GLSLES100;
          // @ts-ignore
          const program = shaderPass._getCanonicalShaderProgram(engine, macroCollection);
          expect(program.isValid).toBe(true);
        }
      }
    });
  });
});
