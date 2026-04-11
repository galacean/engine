/**
 * Precompile Benchmark — performance comparison between old and new paths
 */

import { Shader, ShaderLanguage, ShaderMacro, ShaderMacroCollection, ShaderPass } from "@galacean/engine-core";
import { ShaderProgram } from "@galacean/engine-core/src/shader/ShaderProgram";
import type { ShaderInstruction } from "@galacean/engine-design";
import { registerIncludes, PBRSource } from "@galacean/engine-shader";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { ShaderInstructionEncoder } from "@galacean/engine-shaderlab/src/ShaderInstructionEncoder";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";

import { Logger, WebGLEngine } from "@galacean/engine";
import { server } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";

const { readFile } = server.commands;
Logger.enable();
registerIncludes();

const shaderLab = new ShaderLab();

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
  // @ts-ignore
  Shader._shaderLab = shaderLab;
  // @ts-ignore
  const basePath = new URL("", ShaderPass._shaderRootPath).href;

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
      entry.source = await readFile(`./shaders/${entry.file}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 1. Full _precompile() pipeline
  // ═══════════════════════════════════════════════════════════
  describe("1. Full _precompile() pipeline", () => {
    it("benchmark each shader", () => {
      Logger.disable();
      const results: BenchResult[] = [];
      for (const { label, source } of shaderFiles) {
        results.push(
          bench(
            label,
            () => {
              shaderLab._precompile(source!, ShaderLanguage.GLSLES100, basePath);
            },
            10,
            2
          )
        );
      }
      Logger.enable();
      logTable("Full _precompile() Pipeline", results);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Per-stage: parseShaderInstructions
  // ═══════════════════════════════════════════════════════════
  describe("2. Per-stage: parseShaderInstructions", () => {
    it("parseShaderInstructions timing for PBR vertex/fragment", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
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
        const precompiled = shaderLab._precompile(source!, ShaderLanguage.GLSLES100, basePath);
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
      console.log("| Shader | .gsp Size | Stringify (ms) | Parse (ms) |");
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
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
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
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);

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

  // ═══════════════════════════════════════════════════════════
  // 6. Variant switch breakdown: CPU / GPU / Total
  //
  //    CPU measured via _compileShaderLabSource / compilePlatformSource
  //    Total measured via _compileShaderProgram (CPU + GPU)
  //    GPU = Total - CPU
  //
  //    GSP CPU:  buildMacroList + evaluateShaderInstructions + convertTo300 + assemble
  //    GLSL CPU: buildMacroList + parseIncludes + parseCustomMacros + convertTo300 + assemble
  //    GPU:      new ShaderProgram(engine, vs, fs) — WebGL compile + link
  // ═══════════════════════════════════════════════════════════
  describe("6. Variant switch: CPU / GPU / Total (PBR)", () => {
    it("precompiled (GSP) vs raw GLSL path", () => {
      // @ts-ignore
      Shader._shaderLab = shaderLab;
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const forwardPassData = precompiled.subShaders[0].passes.find((p) => !p.isUsePass)!;

      // GSP ShaderPass (with instructions)
      const gspShaderPass = new ShaderPass(
        forwardPassData.name,
        forwardPassData.vertexShaderInstructions!,
        forwardPassData.fragmentShaderInstructions!,
        ShaderLanguage.GLSLES100,
        forwardPassData.tags
      );

      // GLSL ShaderPass (raw source, no instructions → compilePlatformSource path)
      const parsed = shaderLab._parseShaderSource(PBRSource);
      const livePassSource = parsed.subShaders[0].passes.find((p) => !p.isUsePass)!;
      const liveProg = shaderLab._parseShaderPass(
        livePassSource.contents,
        livePassSource.vertexEntry,
        livePassSource.fragmentEntry,
        ShaderLanguage.GLSLES100,
        basePath
      )!;
      // Use original CodeGen GLSL (with all #ifdef branches preserved)
      const glslShaderPass = new ShaderPass(
        livePassSource.name,
        liveProg.vertex,
        liveProg.fragment,
        livePassSource.tags
      );

      Logger.disable();

      const scenarios: Array<{ label: string; macros: ShaderMacroCollection }> = [
        { label: "empty", macros: new ShaderMacroCollection() },
        { label: "base (11)", macros: buildMacroCollection(baseMacros) },
        { label: "full (18)", macros: buildMacroCollection([...baseMacros, ...materialVariantMacros]) }
      ];

      console.log("\n=== Variant Switch Breakdown (PBR Forward Pass) ===");
      console.log(
        "| Scenario | GSP CPU (ms) | GLSL CPU (ms) | GSP GPU (ms) | GLSL GPU (ms) | GSP Total (ms) | GLSL Total (ms) | GSP Size | GLSL Size  |"
      );
      console.log(
        "|----------|-------------|--------------|-------------|--------------|---------------|----------------|----------|------------|"
      );

      // Split-timing bench: measure CPU and GPU within the same iteration
      function benchSplit(
        shaderPass: ShaderPass,
        macroCollection: ShaderMacroCollection,
        compileMethod: string,
        runs: number,
        warmup: number
      ): { cpu: number; gpu: number; total: number; vsLen: number; fsLen: number } {
        // Warmup
        for (let i = 0; i < warmup; i++) {
          // @ts-ignore
          shaderPass._compileShaderProgram(engine, macroCollection);
        }

        const cpuTimes: number[] = [];
        const gpuTimes: number[] = [];
        let vsLen = 0;
        let fsLen = 0;

        for (let i = 0; i < runs; i++) {
          // CPU: compile source
          const t0 = performance.now();
          // @ts-ignore
          const { vertexSource, fragmentSource } = shaderPass[compileMethod](engine, macroCollection);
          const t1 = performance.now();
          vsLen = vertexSource.length;
          fsLen = fragmentSource.length;

          // GPU: create ShaderProgram
          // @ts-ignore
          new ShaderProgram(engine, vertexSource, fragmentSource);
          const t2 = performance.now();

          cpuTimes.push(t1 - t0);
          gpuTimes.push(t2 - t1);
        }

        cpuTimes.sort((a, b) => a - b);
        gpuTimes.sort((a, b) => a - b);
        const cpuAvg = cpuTimes.reduce((s, t) => s + t, 0) / cpuTimes.length;
        const gpuAvg = gpuTimes.reduce((s, t) => s + t, 0) / gpuTimes.length;
        return { cpu: cpuAvg, gpu: gpuAvg, total: cpuAvg + gpuAvg, vsLen, fsLen };
      }

      for (const { label, macros } of scenarios) {
        const gsp = benchSplit(gspShaderPass, macros, "_compileShaderLabSource", 10, 3);
        const glsl = benchSplit(glslShaderPass, macros, "_compilePlatformSource", 10, 3);

        console.log(
          `| ${label.padEnd(8)} | ${gsp.cpu.toFixed(3).padStart(11)} | ${glsl.cpu.toFixed(3).padStart(12)} | ${gsp.gpu.toFixed(2).padStart(11)} | ${glsl.gpu.toFixed(2).padStart(12)} | ${gsp.total.toFixed(2).padStart(13)} | ${glsl.total.toFixed(2).padStart(14)} | ${(gsp.vsLen + gsp.fsLen).toString().padStart(9)} | ${(glsl.vsLen + glsl.fsLen).toString().padStart(10)} |`
        );
      }

      Logger.enable();
    });
  });
});
