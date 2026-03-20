/**
 * Precompile Benchmark — performance comparison between old and new paths
 */

import { Shader, ShaderLanguage, ShaderMacro, ShaderMacroCollection, ShaderPass } from "@galacean/engine-core";
import type { Instruction } from "@galacean/engine-design";
import { registerIncludes, PBRSource } from "@galacean/engine-shader";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { parseInstructions } from "@galacean/engine-shaderlab/src/InstructionEncoder";
import { evaluateInstructions } from "@galacean/engine-core/src/shader/InstructionDecoder";

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
  // 2. Per-stage: parseInstructions
  // ═══════════════════════════════════════════════════════════
  describe("2. Per-stage: parseInstructions", () => {
    it("parseInstructions timing for PBR vertex/fragment", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const results: BenchResult[] = [];

      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass || !pass.vertexInstructions) continue;
          // Get raw source for re-parsing timing
          const rawVertex = evaluateInstructions(pass.vertexInstructions, new Map());
          const rawFragment = pass.fragmentInstructions
            ? evaluateInstructions(pass.fragmentInstructions, new Map())
            : "";
          if (pass.vertexInstructions.length > 1) {
            results.push(
              bench(
                `${pass.name} vertex`,
                () => {
                  parseInstructions(rawVertex);
                },
                20,
                5
              )
            );
          }
          if (pass.fragmentInstructions && pass.fragmentInstructions.length > 1) {
            results.push(
              bench(
                `${pass.name} fragment`,
                () => {
                  parseInstructions(rawFragment);
                },
                20,
                5
              )
            );
          }
        }
      }

      logTable("parseInstructions (build-time cost)", results);
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
    it("createFromPrecompiled vs Shader.create (PBR)", () => {
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
        "JSON.parse + createFromPrecompiled",
        () => {
          const parsed = JSON.parse(jsonStr);
          const name = uid("PBR_pre");
          const shader = Shader.createFromPrecompiled({ ...parsed, name });
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
  // 5. Macro expansion: evaluateInstructions benchmark
  // ═══════════════════════════════════════════════════════════
  describe("5. Macro expansion: evaluateInstructions", () => {
    it("PBR fragment with different macro combos", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);

      let fragInstructions: Instruction[] | undefined;
      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (!pass.isUsePass && pass.fragmentInstructions && pass.fragmentInstructions.length > 1) {
            fragInstructions = pass.fragmentInstructions;
            break;
          }
        }
        if (fragInstructions) break;
      }

      if (!fragInstructions) {
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
            `evaluateInstructions [${label}]`,
            () => {
              evaluateInstructions(fragInstructions!, new Map(macroMap));
            },
            50,
            10
          )
        );
      }

      logTable("evaluateInstructions (PBR fragment)", results);

      const rtResult = bench(
        "runtime evaluator [base]",
        () => {
          evaluateInstructions(fragInstructions!, new Map(makeMacroMap(baseMacros)));
        },
        50,
        10
      );
      console.log(`\nRuntime evaluator: ${rtResult.avg.toFixed(3)}ms avg`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Variant switch breakdown: CPU macro processing + GPU compile (isolated)
  //    Simulates what happens when the engine switches a shader variant at runtime.
  //    Both paths start from an already-created ShaderPass — only measures the
  //    per-variant work, NOT ShaderLab compilation or .gsp loading.
  //
  //    GSP path:  evaluateInstructions → convertTo300 → assemble → new ShaderProgram (GPU)
  //    GLSL path: parseCustomMacros → prepend → convertTo300 → assemble → new ShaderProgram (GPU)
  //
  //    CPU = evaluateInstructions or parseCustomMacros (measured via _getCanonicalShaderProgram minus GPU)
  //    GPU = new ShaderProgram (isolated via _getCanonicalShaderProgram with same final GLSL)
  // ═══════════════════════════════════════════════════════════
  describe("6. Variant switch: CPU + GPU breakdown (PBR)", () => {
    it("precompiled (GSP) vs raw GLSL path", () => {
      // @ts-ignore
      Shader._shaderLab = shaderLab;
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);

      // ── Prepare GSP ShaderPass (with instructions) ──
      const forwardPassData = precompiled.subShaders[0].passes.find((p) => !p.isUsePass)!;
      const gspShaderPass = new ShaderPass(
        forwardPassData.name,
        forwardPassData.vertexInstructions!,
        forwardPassData.fragmentInstructions!,
        ShaderLanguage.GLSLES100,
        forwardPassData.tags
      );

      // ── Prepare raw GLSL ShaderPass (no instructions, no _platformTarget → compilePlatformSource) ──
      const parsed = shaderLab._parseShaderSource(PBRSource);
      const livePassSource = parsed.subShaders[0].passes.find((p) => !p.isUsePass)!;
      const liveProg = shaderLab._parseShaderPass(
        livePassSource.contents,
        livePassSource.vertexEntry,
        livePassSource.fragmentEntry,
        ShaderLanguage.GLSLES100,
        basePath
      )!;
      // No _platformTarget → _getCanonicalShaderProgram uses compilePlatformSource (raw GLSL path)
      // Evaluate instructions with empty macros to get raw GLSL strings
      const rawVertex = evaluateInstructions(liveProg.vertexInstructions!, new Map());
      const rawFragment = evaluateInstructions(liveProg.fragmentInstructions!, new Map());
      const glslShaderPass = new ShaderPass(livePassSource.name, rawVertex, rawFragment, livePassSource.tags);

      // ── Macro scenarios ──
      const emptyMacros = new ShaderMacroCollection();
      const baseMacroCollection = buildMacroCollection(baseMacros);
      const fullMacroCollection = buildMacroCollection([...baseMacros, ...materialVariantMacros]);

      // ── CPU-only: evaluateInstructions timing (no GPU) ──
      function benchCpuGsp(macroCollection: ShaderMacroCollection): BenchResult {
        const macroList: ShaderMacro[] = [];
        // @ts-ignore - internal API
        ShaderMacro._getMacrosElements(macroCollection, macroList);
        // @ts-ignore
        const isWebGL2: boolean = engine._hardwareRenderer.isWebGL2;
        macroList.push(ShaderMacro.getByName(isWebGL2 ? "GRAPHICS_API_WEBGL2" : "GRAPHICS_API_WEBGL1"));
        const macroMap = new Map<string, string>();
        for (const m of macroList) macroMap.set(m.name, m.value ?? "");

        return bench(
          "gsp-cpu",
          () => {
            evaluateInstructions(forwardPassData.vertexInstructions!, new Map(macroMap));
            evaluateInstructions(forwardPassData.fragmentInstructions!, new Map(macroMap));
          },
          30,
          5
        );
      }

      // ── Full variant switch: _getCanonicalShaderProgram (CPU + GPU) ──
      function benchTotalGsp(macroCollection: ShaderMacroCollection): BenchResult {
        return bench(
          "gsp-total",
          () => {
            // @ts-ignore
            gspShaderPass._getCanonicalShaderProgram(engine, macroCollection);
          },
          5,
          2
        );
      }

      function benchTotalGlsl(macroCollection: ShaderMacroCollection): BenchResult {
        return bench(
          "glsl-total",
          () => {
            // @ts-ignore
            glslShaderPass._getCanonicalShaderProgram(engine, macroCollection);
          },
          5,
          2
        );
      }

      Logger.disable();

      const scenarios: Array<{ label: string; macros: ShaderMacroCollection }> = [
        { label: "empty", macros: emptyMacros },
        { label: "base (11)", macros: baseMacroCollection },
        { label: "full (18)", macros: fullMacroCollection }
      ];

      console.log("\n=== Variant Switch Breakdown (PBR Forward Pass) ===");
      console.log(
        "| Scenario | GSP CPU (ms) | GSP Total (ms) | GLSL Total (ms) | GSP GPU ≈ (ms) | GLSL GPU ≈ (ms) | Speedup |"
      );
      console.log(
        "|----------|-------------|---------------|----------------|---------------|----------------|---------|"
      );

      for (const { label, macros } of scenarios) {
        const gspCpu = benchCpuGsp(macros);
        const gspTotal = benchTotalGsp(macros);
        const glslTotal = benchTotalGlsl(macros);
        const gspGpuApprox = Math.max(0, gspTotal.avg - gspCpu.avg);
        const glslGpuApprox = Math.max(0, glslTotal.avg - 0.01); // GLSL path CPU ≈ 0 (just string concat)
        const speedup = glslTotal.avg > 0 ? (glslTotal.avg / gspTotal.avg).toFixed(1) + "x" : "N/A";

        console.log(
          `| ${label.padEnd(8)} | ${gspCpu.avg.toFixed(3).padStart(11)} | ${gspTotal.avg.toFixed(2).padStart(13)} | ${glslTotal.avg.toFixed(2).padStart(14)} | ${gspGpuApprox.toFixed(2).padStart(13)} | ${glslGpuApprox.toFixed(2).padStart(14)} | ${speedup.padStart(7)} |`
        );
      }

      Logger.enable();
    });
  });
});
