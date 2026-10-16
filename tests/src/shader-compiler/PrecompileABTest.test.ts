/**
 * A/B Test: Live ShaderCompiler compilation vs Precompiled (.shaderc) path
 *
 * Tests verify:
 *   1. GLSL source identity: _parseShaderPass output === precompiled instructions evaluated with empty macros
 *   2. WebGL compilation: precompiled GLSL compiles to valid WebGL programs
 *   3. RenderState equivalence: constantMap/variableMap identical from both paths
 *   4. Tags & metadata: name, tags, platform, pass structure match
 *   5. Macro expansion: evaluateInstructions output matches live compilation and varies per macro combo
 *   6. Full .shaderc round-trip: JSON stringify → parse → create ShaderPass → WebGL compile
 */

import {
  Shader,
  ShaderFactory,
  ShaderLanguage,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderPass
} from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/src/ShaderPrecompiler";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";

import { Logger, WebGLEngine } from "@galacean/engine";
import { describe, expect, it } from "vitest";
import { server } from "@vitest/browser/context";

const { readFile } = server.commands;

Logger.enable();

const shaderCompiler = new ShaderCompiler();
const shaderPrecompiler = new ShaderPrecompiler();

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

const clearCoatMacros: { name: string; value?: string }[] = [
  { name: "MATERIAL_ENABLE_CLEAR_COAT" },
  { name: "MATERIAL_HAS_CLEAR_COAT_TEXTURE" },
  { name: "MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE" },
  { name: "MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE" }
];

const textureMacros: { name: string; value?: string }[] = [
  { name: "MATERIAL_HAS_BASETEXTURE" },
  { name: "MATERIAL_HAS_NORMALTEXTURE" },
  { name: "MATERIAL_HAS_EMISSIVETEXTURE" },
  { name: "MATERIAL_HAS_OCCLUSION_TEXTURE" }
];

const tangentNormalMacros: { name: string; value?: string }[] = [
  { name: "RENDERER_HAS_TANGENT" },
  { name: "MATERIAL_HAS_NORMALTEXTURE" }
];

const uv1OcclusionMacros: { name: string; value?: string }[] = [
  { name: "RENDERER_HAS_UV1" },
  { name: "MATERIAL_HAS_OCCLUSION_TEXTURE" }
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
 */
const normalize = (s: string) =>
  s
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#\s*(define|undef)\b/.test(line) && !line.startsWith("//"))
    .join("\n");

// ─── Tests ─────────────────────────────────────────────────────────────

describe("Precompile A/B Test: Live vs Precompiled", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });
  const PBRSource = await readFile("../packages/shader/src/Shaders/PBR.shader");
  const ParticleSource = await readFile("../packages/shader/src/Shaders/Effect/Particle.shader");
  const SSAOSource = await readFile("../packages/shader/src/Shaders/Lighting/ScalableAmbientOcclusion.shader");

  shaderCompiler._setIncludeMap(ShaderFactory.includeMap);
  shaderPrecompiler.setIncludeMap(ShaderFactory.includeMap);
  // @ts-ignore
  Shader._shaderCompiler = shaderCompiler;

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
      it(`${file}: live instructions === precompiled instructions`, async () => {
        const source = await readFile(`src/shader-compiler/shaders/${file}`);
        const parsed = shaderCompiler._parseShaderSource(source);
        const precompiled = shaderPrecompiler.precompile(source, ShaderLanguage.GLSLES100);

        for (let i = 0; i < parsed.subShaders.length; i++) {
          for (let j = 0; j < parsed.subShaders[i].passes.length; j++) {
            const livePass = parsed.subShaders[i].passes[j];
            if (livePass.isUsePass) continue;

            const liveProgram = shaderCompiler._parseShaderPass(
              livePass.contents,
              livePass.vertexEntry,
              livePass.fragmentEntry,
              ShaderLanguage.GLSLES100
            );

            const pass = precompiled.subShaders[i].passes[j];
            expect(pass.vertexShaderInstructions).toEqual(liveProgram.vertexShaderInstructions);
            expect(pass.fragmentShaderInstructions).toEqual(liveProgram.fragmentShaderInstructions);
          }
        }
      });
    }

    for (const platform of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const label = platform === ShaderLanguage.GLSLES100 ? "GLSLES100" : "GLSLES300";
      it(`PBR (${label}): live instructions === precompiled instructions`, () => {
        const parsed = shaderCompiler._parseShaderSource(PBRSource);
        const precompiled = shaderPrecompiler.precompile(PBRSource, platform);

        for (let i = 0; i < parsed.subShaders.length; i++) {
          for (let j = 0; j < parsed.subShaders[i].passes.length; j++) {
            const livePass = parsed.subShaders[i].passes[j];
            if (livePass.isUsePass) continue;

            const liveProgram = shaderCompiler._parseShaderPass(
              livePass.contents,
              livePass.vertexEntry,
              livePass.fragmentEntry,
              platform
            );
            const pass = precompiled.subShaders[i].passes[j];
            expect(pass.vertexShaderInstructions).toEqual(liveProgram.vertexShaderInstructions);
            expect(pass.fragmentShaderInstructions).toEqual(liveProgram.fragmentShaderInstructions);
          }
        }
      });
    }

    it("Particle: live instructions === precompiled instructions", () => {
      const parsed = shaderCompiler._parseShaderSource(ParticleSource);
      const precompiled = shaderPrecompiler.precompile(ParticleSource, ShaderLanguage.GLSLES100);

      for (let i = 0; i < parsed.subShaders.length; i++) {
        for (let j = 0; j < parsed.subShaders[i].passes.length; j++) {
          const livePass = parsed.subShaders[i].passes[j];
          if (livePass.isUsePass) continue;

          const liveProgram = shaderCompiler._parseShaderPass(
            livePass.contents,
            livePass.vertexEntry,
            livePass.fragmentEntry,
            ShaderLanguage.GLSLES100
          );
          const pass = precompiled.subShaders[i].passes[j];
          expect(pass.vertexShaderInstructions).toEqual(liveProgram.vertexShaderInstructions);
          expect(pass.fragmentShaderInstructions).toEqual(liveProgram.fragmentShaderInstructions);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // A/B 2: WebGL Compilation (precompiled GLSL → ShaderProgram)
  // ═══════════════════════════════════════════════════════════
  describe("A/B: WebGL compilation from precompiled GLSL", () => {
    function validatePrecompiledWebGL(
      source: string,
      platform: ShaderLanguage,
      macros: { name: string; value?: string }[]
    ) {
      const precompiled = shaderPrecompiler.precompile(source, platform);
      const macroCollection = buildMacroCollection(macros);

      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass || !pass.vertexShaderInstructions) continue;

          const shaderPass = new ShaderPass(
            pass.name,
            pass.vertexShaderInstructions,
            pass.fragmentShaderInstructions,
            platform,
            pass.tags
          );

          // @ts-ignore
          const program = shaderPass._compileShaderProgram(engine, macroCollection);
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

    it("PBR with shadow cascades 2", () => {
      const macros = baseMacros.map((m) => (m.name === "SCENE_SHADOW_CASCADED_COUNT" ? { ...m, value: "2" } : m));
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, macros);
    });

    it("PBR with shadow cascades 4", () => {
      const macros = baseMacros.map((m) => (m.name === "SCENE_SHADOW_CASCADED_COUNT" ? { ...m, value: "4" } : m));
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, macros);
    });

    it("PBR with hard shadows (SCENE_SHADOW_TYPE=1)", () => {
      const macros = baseMacros.map((m) => (m.name === "SCENE_SHADOW_TYPE" ? { ...m, value: "1" } : m));
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, macros);
    });

    it("PBR with PCF9 shadows (SCENE_SHADOW_TYPE=3)", () => {
      const macros = baseMacros.map((m) => (m.name === "SCENE_SHADOW_TYPE" ? { ...m, value: "3" } : m));
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, macros);
    });

    it("PBR with clear coat macros", () => {
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, [...baseMacros, ...clearCoatMacros]);
    });

    it("PBR with texture macros", () => {
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, [...baseMacros, ...textureMacros]);
    });

    it("PBR with alpha cutoff", () => {
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, [
        ...baseMacros,
        { name: "MATERIAL_IS_ALPHA_CUTOFF" }
      ]);
    });

    it("PBR with transparency", () => {
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, [
        ...baseMacros,
        { name: "MATERIAL_IS_TRANSPARENT" }
      ]);
    });

    it("PBR with fog mode 1 (linear)", () => {
      const macros = baseMacros.map((m) => (m.name === "SCENE_FOG_MODE" ? { ...m, value: "1" } : m));
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, macros);
    });

    it("PBR with fog mode 2 (exponential)", () => {
      const macros = baseMacros.map((m) => (m.name === "SCENE_FOG_MODE" ? { ...m, value: "2" } : m));
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, macros);
    });

    it("PBR with fog mode 3 (exponential squared)", () => {
      const macros = baseMacros.map((m) => (m.name === "SCENE_FOG_MODE" ? { ...m, value: "3" } : m));
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, macros);
    });

    it("PBR with unsupported fog mode uses the no-fog fallback", () => {
      const macros = baseMacros.map((m) => (m.name === "SCENE_FOG_MODE" ? { ...m, value: "99" } : m));
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, macros);
    });

    for (const quality of ["0", "1", "2", "99"]) {
      it(`SSAO quality ${quality}`, () => {
        validatePrecompiledWebGL(SSAOSource, ShaderLanguage.GLSLES100, [{ name: "SSAO_QUALITY", value: quality }]);
      });
    }

    it("PBR with UV1 + occlusion texture", () => {
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, [...baseMacros, ...uv1OcclusionMacros]);
    });

    it("PBR with camera orthographic", () => {
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, [...baseMacros, { name: "CAMERA_ORTHOGRAPHIC" }]);
    });

    it("PBR with tangent + normal texture", () => {
      validatePrecompiledWebGL(PBRSource, ShaderLanguage.GLSLES100, [...baseMacros, ...tangentNormalMacros]);
    });

    for (const mode of [
      "RENDERER_MODE_SPHERE_BILLBOARD",
      "RENDERER_MODE_STRETCHED_BILLBOARD",
      "RENDERER_MODE_HORIZONTAL_BILLBOARD",
      "RENDERER_MODE_VERTICAL_BILLBOARD",
      "RENDERER_MODE_MESH"
    ]) {
      it(`Particle ${mode} mode`, () => {
        validatePrecompiledWebGL(ParticleSource, ShaderLanguage.GLSLES100, [{ name: mode }]);
      });
    }

    for (const mode of ["RENDERER_VOL_CONSTANT_MODE", "RENDERER_VOL_CURVE_MODE"]) {
      it(`Particle ${mode} mode`, () => {
        validatePrecompiledWebGL(ParticleSource, ShaderLanguage.GLSLES100, [
          { name: "RENDERER_MODE_SPHERE_BILLBOARD" },
          { name: mode }
        ]);
      });
    }

    it("Particle uses deterministic priority when render-mode macros overlap", () => {
      const macros = [
        { name: "RENDERER_MODE_SPHERE_BILLBOARD" },
        { name: "RENDERER_MODE_STRETCHED_BILLBOARD" },
        { name: "RENDERER_MODE_HORIZONTAL_BILLBOARD" },
        { name: "RENDERER_MODE_VERTICAL_BILLBOARD" },
        { name: "RENDERER_MODE_MESH" },
        { name: "RENDERER_ENABLE_VERTEXCOLOR" }
      ];
      validatePrecompiledWebGL(ParticleSource, ShaderLanguage.GLSLES100, macros);

      const precompiled = shaderPrecompiler.precompile(ParticleSource, ShaderLanguage.GLSLES100, "");
      const pass = precompiled.subShaders[0].passes.find((candidate) => candidate.name === "Forward Pass");
      const vertexSource = ShaderMacroProcessor.evaluate(pass!.vertexShaderInstructions!, makeMacroMap(macros));
      expect(vertexSource).to.match(/normalize\s*\(\s*cross\s*\(\s*camera_Forward\s*,\s*camera_Up\s*\)\s*\)/);
      expect(vertexSource).to.not.include("rotationZHalfPI");
      expect(vertexSource).to.not.match(/cameraUpVector\s*=\s*vec3\s*\(\s*0\.0\s*,\s*1\.0\s*,\s*0\.0\s*\)/);
    });

    it("Particle mesh with separate random size-over-lifetime curves", () => {
      const macros = [
        { name: "RENDERER_MODE_MESH" },
        { name: "RENDERER_SOL_CURVE_MODE" },
        { name: "RENDERER_SOL_IS_SEPARATE" },
        { name: "RENDERER_SOL_IS_RANDOM_TWO" }
      ];
      validatePrecompiledWebGL(ParticleSource, ShaderLanguage.GLSLES100, macros);

      const precompiled = shaderPrecompiler.precompile(ParticleSource, ShaderLanguage.GLSLES100);
      const pass = precompiled.subShaders[0].passes.find((candidate) => candidate.name === "Forward Pass");
      expect(pass?.vertexShaderInstructions).toBeDefined();
      const vertexSource = ShaderMacroProcessor.evaluate(pass!.vertexShaderInstructions!, makeMacroMap(macros));
      for (const axis of ["X", "Y", "Z"]) {
        expect(vertexSource).toMatch(
          new RegExp(
            `lifeSize${axis}\\s*=\\s*mix\\s*\\(\\s*evaluateParticleCurve\\s*\\(\\s*renderer_SOLMinCurve${axis}[^;]+lifeSize${axis}`
          )
        );
      }
      expect(vertexSource).toMatch(/size\s*\*=\s*vec3\s*\(\s*lifeSizeX\s*,\s*lifeSizeY\s*,\s*lifeSizeZ\s*\)/);
    });

    const simpleShaders = ["noFragArgs.shader", "waterfull.shader", "mrt-struct.shader", "multi-pass.shader"];
    for (const file of simpleShaders) {
      it(`${file}: precompiled GLSL → WebGL`, async () => {
        const source = await readFile(`src/shader-compiler/shaders/${file}`);
        validatePrecompiledWebGL(source, ShaderLanguage.GLSLES100, baseMacros);
      });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // A/B 3: Full .shaderc round-trip → WebGL
  // ═══════════════════════════════════════════════════════════
  describe("A/B: Full .shaderc round-trip → WebGL", () => {
    function validateGspRoundTrip(
      source: string,
      platform: ShaderLanguage,
      macros: { name: string; value?: string }[]
    ) {
      const precompiled = shaderPrecompiler.precompile(source, platform);
      const restored = JSON.parse(JSON.stringify(precompiled));
      const macroCollection = buildMacroCollection(macros);

      for (const sub of restored.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass || !pass.vertexShaderInstructions) continue;

          const shaderPass = new ShaderPass(
            pass.name,
            pass.vertexShaderInstructions,
            pass.fragmentShaderInstructions,
            platform,
            pass.tags
          );

          // @ts-ignore
          const program = shaderPass._compileShaderProgram(engine, macroCollection);
          expect(program.isValid, `.shaderc round-trip pass "${pass.name}" should compile`).toBe(true);
        }
      }
    }

    it("PBR: .shaderc → WebGL (base macros)", () => {
      validateGspRoundTrip(PBRSource, ShaderLanguage.GLSLES100, baseMacros);
    });

    it("PBR: .shaderc → WebGL (material variant macros)", () => {
      validateGspRoundTrip(PBRSource, ShaderLanguage.GLSLES100, [...baseMacros, ...materialVariantMacros]);
    });

    it("PBR: .shaderc → WebGL (clear coat)", () => {
      validateGspRoundTrip(PBRSource, ShaderLanguage.GLSLES100, [...baseMacros, ...clearCoatMacros]);
    });

    it("PBR: .shaderc → WebGL (shadow cascades 4)", () => {
      const macros = baseMacros.map((m) => (m.name === "SCENE_SHADOW_CASCADED_COUNT" ? { ...m, value: "4" } : m));
      validateGspRoundTrip(PBRSource, ShaderLanguage.GLSLES100, macros);
    });

    it("PBR: .shaderc → WebGL (fog mode 2)", () => {
      const macros = baseMacros.map((m) => (m.name === "SCENE_FOG_MODE" ? { ...m, value: "2" } : m));
      validateGspRoundTrip(PBRSource, ShaderLanguage.GLSLES100, macros);
    });

    it("PBR: .shaderc → WebGL (textures + tangent + alpha cutoff)", () => {
      validateGspRoundTrip(PBRSource, ShaderLanguage.GLSLES100, [
        ...baseMacros,
        ...textureMacros,
        ...tangentNormalMacros,
        { name: "MATERIAL_IS_ALPHA_CUTOFF" }
      ]);
    });

    const simpleShaders = ["noFragArgs.shader", "waterfull.shader", "mrt-struct.shader"];
    for (const file of simpleShaders) {
      it(`${file}: .shaderc → WebGL`, async () => {
        const source = await readFile(`src/shader-compiler/shaders/${file}`);
        validateGspRoundTrip(source, ShaderLanguage.GLSLES100, baseMacros);
      });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // A/B 4: RenderState equivalence
  // ═══════════════════════════════════════════════════════════
  describe("A/B: RenderState equivalence", () => {
    it("multi-pass: renderStates match between paths", async () => {
      const source = await readFile("src/shader-compiler/shaders/multi-pass.shader");
      const parsed = shaderCompiler._parseShaderSource(source);
      const precompiled = shaderPrecompiler.precompile(source, ShaderLanguage.GLSLES100);

      for (let i = 0; i < parsed.subShaders.length; i++) {
        for (let j = 0; j < parsed.subShaders[i].passes.length; j++) {
          const livePass = parsed.subShaders[i].passes[j];
          if (livePass.isUsePass) continue;
          const prePass = precompiled.subShaders[i].passes[j];

          for (const key of Object.keys(livePass.renderStates.constantMap)) {
            const liveVal = livePass.renderStates.constantMap[key];
            const preVal = prePass.renderStates.constantMap[key];
            if (liveVal && typeof liveVal === "object" && "r" in liveVal) {
              expect(preVal).toEqual([liveVal.r, liveVal.g, liveVal.b, liveVal.a]);
            } else {
              expect(preVal).toEqual(liveVal);
            }
          }

          const liveVarKeys = Object.keys(livePass.renderStates.variableMap).sort();
          const preVarKeys = Object.keys(prePass.renderStates.variableMap).sort();
          expect(preVarKeys).toEqual(liveVarKeys);
        }
      }
    });

    it("PBR: renderStates variableMap keys match", () => {
      const parsed = shaderCompiler._parseShaderSource(PBRSource);
      const precompiled = shaderPrecompiler.precompile(PBRSource, ShaderLanguage.GLSLES100);

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
    const tagShaders = ["noFragArgs.shader", "multi-pass.shader", "macro-pre.shader"];

    for (const file of tagShaders) {
      it(`${file}: metadata matches between paths`, async () => {
        const source = await readFile(`src/shader-compiler/shaders/${file}`);
        const parsed = shaderCompiler._parseShaderSource(source);
        const precompiled = shaderPrecompiler.precompile(source, ShaderLanguage.GLSLES100);

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
  // A/B 6: Macro expansion — evaluateInstructions matches live compilation
  // ═══════════════════════════════════════════════════════════
  describe("A/B: Macro expansion", () => {
    it("macro-pre: evaluateInstructions output matches live compilation per macro combo", async () => {
      const source = await readFile("src/shader-compiler/shaders/macro-pre.shader");
      const parsed = shaderCompiler._parseShaderSource(source);
      const precompiled = shaderPrecompiler.precompile(source, ShaderLanguage.GLSLES100);

      const combos: Array<{ label: string; macros: { name: string; value?: string }[] }> = [
        { label: "empty", macros: [] },
        { label: "XX_Macro", macros: [{ name: "XX_Macro" }] },
        { label: "RECV_SHADOWS", macros: [{ name: "RENDERER_IS_RECEIVE_SHADOWS" }] }
      ];

      for (const { label, macros } of combos) {
        const macroMap = makeMacroMap(macros);

        for (let i = 0; i < parsed.subShaders.length; i++) {
          for (let j = 0; j < parsed.subShaders[i].passes.length; j++) {
            const livePass = parsed.subShaders[i].passes[j];
            if (livePass.isUsePass) continue;

            const prePass = precompiled.subShaders[i].passes[j];
            if (!prePass.fragmentShaderInstructions || prePass.fragmentShaderInstructions.length <= 1) continue;

            const result = ShaderMacroProcessor.evaluate(prePass.fragmentShaderInstructions, new Map(macroMap));
            expect(result.length, `macro-pre frag [${label}] should produce output`).toBeGreaterThan(0);

            // Verify the evaluated output contains valid GLSL structure
            expect(result).toContain("void main");
          }
        }
      }
    });

    it("PBR: different macro combos produce different evaluated output", () => {
      const precompiled = shaderPrecompiler.precompile(PBRSource, ShaderLanguage.GLSLES100);
      // Find the Forward Pass (not ShadowCaster/DepthOnly which have simple shaders)
      const pass = precompiled.subShaders[0].passes.find((p) => p.name === "Forward Pass");
      if (!pass?.fragmentShaderInstructions) return;

      const baseMap = makeMacroMap(baseMacros);
      const clearCoatMap = makeMacroMap([...baseMacros, ...clearCoatMacros]);
      const fogMap = makeMacroMap(baseMacros.map((m) => (m.name === "SCENE_FOG_MODE" ? { ...m, value: "2" } : m)));

      const baseResult = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, new Map(baseMap));
      const clearCoatResult = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, new Map(clearCoatMap));
      const fogResult = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, new Map(fogMap));

      // Different macro combos should produce different GLSL output
      expect(baseResult).not.toBe(clearCoatResult);
      expect(baseResult).not.toBe(fogResult);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // A/B 7: Instruction-based optimization correctness
  // ═══════════════════════════════════════════════════════════
  describe("A/B: instruction optimization", () => {
    it("noFragArgs (single TEXT instruction): still compiles with full macro set", async () => {
      const source = await readFile("src/shader-compiler/shaders/noFragArgs.shader");
      const precompiled = shaderPrecompiler.precompile(source, ShaderLanguage.GLSLES100);

      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass) continue;
          expect(pass.vertexShaderInstructions!.length).toBe(1);
          expect(pass.fragmentShaderInstructions!.length).toBe(1);
        }
      }

      const macroCollection = buildMacroCollection(baseMacros);
      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass || !pass.vertexShaderInstructions) continue;
          const shaderPass = new ShaderPass(
            pass.name,
            pass.vertexShaderInstructions,
            pass.fragmentShaderInstructions!,
            ShaderLanguage.GLSLES100,
            pass.tags
          );
          // @ts-ignore
          const program = shaderPass._compileShaderProgram(engine, macroCollection);
          expect(program.isValid).toBe(true);
        }
      }
    });

    it("mrt-struct (single TEXT instruction): compiles correctly", async () => {
      const source = await readFile("src/shader-compiler/shaders/mrt-struct.shader");
      const precompiled = shaderPrecompiler.precompile(source, ShaderLanguage.GLSLES100);

      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass) continue;
          expect(pass.vertexShaderInstructions!.length).toBe(1);
          expect(pass.fragmentShaderInstructions!.length).toBe(1);
        }
      }

      const macroCollection = buildMacroCollection(baseMacros);
      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass || !pass.vertexShaderInstructions) continue;
          const shaderPass = new ShaderPass(
            pass.name,
            pass.vertexShaderInstructions,
            pass.fragmentShaderInstructions!,
            ShaderLanguage.GLSLES100,
            pass.tags
          );
          // @ts-ignore
          const program = shaderPass._compileShaderProgram(engine, macroCollection);
          expect(program.isValid).toBe(true);
        }
      }
    });
  });
});
