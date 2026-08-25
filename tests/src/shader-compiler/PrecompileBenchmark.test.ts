/**
 * Precompile Benchmark — performance comparison between old and new paths
 */

import {
  Shader,
  ShaderFactory,
  ShaderLanguage,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderPass
} from "@galacean/engine-core";
import { ShaderProgram } from "@galacean/engine-core/src/shader/ShaderProgram";
import type { ShaderInstruction } from "@galacean/engine-design";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/src/ShaderPrecompiler";
import { ShaderInstructionEncoder } from "@galacean/engine-shader-compiler/src/ShaderInstructionEncoder";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { shaders as builtinShaders } from "@galacean/engine-shader/sources";

import { Logger, WebGLEngine } from "@galacean/engine";
import { describe, expect, it } from "vitest";
import { server } from "@vitest/browser/context";

const { readFile } = server.commands;

function builtinSource(path: string): string {
  const entry = builtinShaders.find((s) => s.path === path);
  if (!entry) throw new Error(`Built-in shader not found: ${path}`);
  return entry.source;
}

Logger.enable();

const shaderCompiler = new ShaderCompiler();
const shaderPrecompiler = new ShaderPrecompiler();

// ─── Bench utility ─────────────────────────────────────────────────────

interface BenchResult {
  label: string;
  avg: number;
  min: number;
  max: number;
  median: number;
}

function bench(label: string, fn: () => void, runs = 10, warmup = 3): BenchResult {
  for (let i = 0; i < warmup; i++) fn();

  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }

  times.sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const median = times[Math.floor(times.length / 2)];
  return { label, avg, min: times[0], max: times[times.length - 1], median };
}

function logTable(title: string, results: BenchResult[]) {
  console.log(`\n=== ${title} ===`);
  console.log("| Shader | Avg (ms) | Min (ms) | Max (ms) | Median (ms) |");
  console.log("|--------|----------|----------|----------|-------------|");
  for (const r of results) {
    console.log(
      `| ${r.label.padEnd(20)} | ${r.avg.toFixed(2).padStart(8)} | ${r.min.toFixed(2).padStart(8)} | ${r.max.toFixed(2).padStart(8)} | ${r.median.toFixed(2).padStart(11)} |`
    );
  }
}

function logComparison(title: string, rows: Array<{ label: string; live: number; precompiled: number }>) {
  console.log(`\n=== ${title} ===`);
  console.log("| Item | Live (ms) | Precompiled (ms) | Speedup |");
  console.log("|------|-----------|------------------|---------|");
  for (const r of rows) {
    const speedup = r.live > 0 ? (r.live / r.precompiled).toFixed(1) + "x" : "N/A";
    console.log(
      `| ${r.label.padEnd(20)} | ${r.live.toFixed(2).padStart(9)} | ${r.precompiled.toFixed(2).padStart(16)} | ${speedup.padStart(7)} |`
    );
  }
}

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
  return new Map(macros.map(({ name, value }) => [name, value ?? ""]));
}

let nameCounter = 0;
function uid(base: string) {
  return `__bench_${base}_${nameCounter++}`;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("Precompile Benchmark", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });
  shaderCompiler._setIncludeMap(ShaderFactory.includeMap);
  shaderPrecompiler.setIncludeMap(ShaderFactory.includeMap);
  // @ts-ignore
  Shader._shaderCompiler = shaderCompiler;

  const PBRSource = builtinSource("Shaders/PBR.shader");
  const ShadowCasterSource = builtinSource("Shaders/Pipeline/ShadowCaster.shader");
  const DepthOnlySource = builtinSource("Shaders/Pipeline/DepthOnly.shader");

  // Create Pipeline shaders first — PBR uses UsePass from them
  if (!Shader.find("Pipeline/ShadowCaster")) Shader.create(ShadowCasterSource);
  if (!Shader.find("Pipeline/DepthOnly")) Shader.create(DepthOnlySource);

  // Load all test shaders upfront
  const shaderFiles = [
    { label: "PBR (complex)", source: PBRSource, file: null },
    { label: "waterfull (medium)", source: null as string | null, file: "waterfull.shader" },
    { label: "multi-pass", source: null as string | null, file: "multi-pass.shader" },
    { label: "macro-pre", source: null as string | null, file: "macro-pre.shader" },
    { label: "noFragArgs (simple)", source: null as string | null, file: "noFragArgs.shader" },
    { label: "mrt-struct", source: null as string | null, file: "mrt-struct.shader" }
  ];

  for (const entry of shaderFiles) {
    if (!entry.source && entry.file) {
      entry.source = await readFile(`src/shader-compiler/shaders/${entry.file}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 1. Full precompile() pipeline
  // ═══════════════════════════════════════════════════════════
  describe("1. Full precompile() pipeline", () => {
    it("benchmark each shader", () => {
      Logger.disable();
      const results: BenchResult[] = [];
      for (const { label, source } of shaderFiles) {
        results.push(
          bench(
            label,
            () => {
              shaderPrecompiler.precompile(source!, ShaderLanguage.GLSLES100);
            },
            10,
            2
          )
        );
      }
      Logger.enable();
      logTable("Full precompile() Pipeline", results);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Per-stage: parseShaderInstructions
  // ═══════════════════════════════════════════════════════════
  describe("2. Per-stage: parseShaderInstructions", () => {
    it("parseShaderInstructions timing for PBR vertex/fragment", () => {
      const precompiled = shaderPrecompiler.precompile(PBRSource, ShaderLanguage.GLSLES100);
      const results: BenchResult[] = [];

      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass || !pass.vertexShaderInstructions) continue;
          // Get raw source for re-parsing timing
          const rawVertex = ShaderMacroProcessor.evaluate(pass.vertexShaderInstructions, new Map());
          const rawFragment = pass.fragmentShaderInstructions
            ? ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, new Map())
            : "";
          if (pass.vertexShaderInstructions.length > 1) {
            results.push(
              bench(
                `${pass.name} vertex`,
                () => {
                  ShaderInstructionEncoder.parse(rawVertex);
                },
                20,
                5
              )
            );
          }
          if (pass.fragmentShaderInstructions && pass.fragmentShaderInstructions.length > 1) {
            results.push(
              bench(
                `${pass.name} fragment`,
                () => {
                  ShaderInstructionEncoder.parse(rawFragment);
                },
                20,
                5
              )
            );
          }
        }
      }

      logTable("parseShaderInstructions (build-time cost)", results);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. JSON Serialize / Parse
  // ═══════════════════════════════════════════════════════════
  describe("3. JSON Serialize / Parse", () => {
    it("stringify + parse timing for each shader", () => {
      const results: Array<{ label: string; size: number; stringify: BenchResult; parse: BenchResult }> = [];

      for (const { label, source } of shaderFiles) {
        const precompiled = shaderPrecompiler.precompile(source!, ShaderLanguage.GLSLES100);
        const strResult = bench(
          `${label} stringify`,
          () => {
            JSON.stringify(precompiled);
          },
          20,
          5
        );
        const jsonStr = JSON.stringify(precompiled);
        const parseResult = bench(
          `${label} parse`,
          () => {
            JSON.parse(jsonStr);
          },
          20,
          5
        );
        results.push({ label, size: jsonStr.length, stringify: strResult, parse: parseResult });
      }

      console.log("\n=== JSON Serialize / Parse ===");
      console.log("| Shader | .shaderc Size | Stringify (ms) | Parse (ms) |");
      console.log("|--------|-----------|----------------|------------|");
      for (const r of results) {
        const sizeKB = (r.size / 1024).toFixed(1) + "KB";
        console.log(
          `| ${r.label.padEnd(20)} | ${sizeKB.padStart(9)} | ${r.stringify.avg.toFixed(3).padStart(14)} | ${r.parse.avg.toFixed(3).padStart(10)} |`
        );
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Shader reconstruction
  // ═══════════════════════════════════════════════════════════
  describe("4. Shader reconstruction", () => {
    it("_createFromPrecompiled vs Shader.create (PBR)", () => {
      const precompiled = shaderPrecompiler.precompile(PBRSource, ShaderLanguage.GLSLES100);
      const jsonStr = JSON.stringify(precompiled);

      Logger.disable();

      const liveResult = bench(
        "Shader.create (live)",
        () => {
          const name = uid("PBR_live");
          Shader.create(PBRSource);
          Shader.find(name)?.destroy(true);
        },
        5,
        1
      );

      const preResult = bench(
        "JSON.parse + _createFromPrecompiled",
        () => {
          const parsed = JSON.parse(jsonStr);
          const name = uid("PBR_pre");
          const shader = Shader._createFromPrecompiled({ ...parsed, name });
          shader?.destroy(true);
        },
        5,
        1
      );

      Logger.enable();

      logComparison("Shader Reconstruction (PBR)", [
        {
          label: "PBR reconstruction",
          live: liveResult.avg,
          precompiled: preResult.avg
        }
      ]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Macro expansion: evaluateShaderInstructions benchmark
  // ═══════════════════════════════════════════════════════════
  describe("5. Macro expansion: evaluateShaderInstructions", () => {
    it("PBR fragment with different macro combos", () => {
      const precompiled = shaderPrecompiler.precompile(PBRSource, ShaderLanguage.GLSLES100);

      let fragShaderInstructions: ShaderInstruction[] | undefined;
      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (!pass.isUsePass && pass.fragmentShaderInstructions && pass.fragmentShaderInstructions.length > 1) {
            fragShaderInstructions = pass.fragmentShaderInstructions;
            break;
          }
        }
        if (fragShaderInstructions) break;
      }

      if (!fragShaderInstructions) {
        console.log("No PBR pass with fragment instructions found, skipping.");
        return;
      }

      const macroSets: Array<{ label: string; macros: { name: string; value?: string }[] }> = [
        { label: "empty", macros: [] },
        { label: "base (11 macros)", macros: baseMacros },
        { label: "full (18 macros)", macros: [...baseMacros, ...materialVariantMacros] }
      ];

      const results: BenchResult[] = [];
      for (const { label, macros } of macroSets) {
        const macroMap = makeMacroMap(macros);
        results.push(
          bench(
            `evaluateShaderInstructions [${label}]`,
            () => {
              ShaderMacroProcessor.evaluate(fragShaderInstructions!, new Map(macroMap));
            },
            50,
            10
          )
        );
      }

      logTable("evaluateShaderInstructions (PBR fragment)", results);

      const rtResult = bench(
        "runtime evaluator [base]",
        () => {
          ShaderMacroProcessor.evaluate(fragShaderInstructions!, new Map(makeMacroMap(baseMacros)));
        },
        50,
        10
      );
      console.log(`\nRuntime evaluator: ${rtResult.avg.toFixed(3)}ms avg`);
    });
  });
});
