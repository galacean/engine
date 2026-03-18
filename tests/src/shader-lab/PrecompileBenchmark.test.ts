/**
 * Precompile Benchmark — 各阶段独立计时，对比优化前后性能
 *
 * 测量维度：
 *   1. 全量编译：_precompile() 各 shader 耗时
 *   2. 阶段拆解：Preprocessor / Parser / CodeGen / parseSegmentTree 独立计时
 *   3. 解码耗时：.gsb decode 速度 + encode 参考
 *   4. Shader 重建：createFromPrecompiled vs Shader.create 对比
 *   5. 宏展开对比：evaluateSegmentTree vs _parseMacros（不同宏组合）
 *   6. 端到端对比：源码→WebGL 编译完成，Live vs Precompiled 全链路
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
  evaluateSegmentTree as evalBuildTime
} from "@galacean/engine-shaderlab/src/MacroCodeSegment";
import { evaluateSegmentTree as evalRuntime } from "@galacean/engine-core/src/shader/MacroSegmentEvaluator";

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
  // 1. 全量编译 _precompile()
  // ═══════════════════════════════════════════════════════════
  describe("1. Full _precompile() pipeline", () => {
    it("benchmark each shader", () => {
      Logger.disable();
      const results: BenchResult[] = [];
      for (const { label, source } of shaderFiles) {
        results.push(bench(label, () => {
          shaderLab._precompile(source!, ShaderLanguage.GLSLES100, basePath);
        }, 10, 2));
      }
      Logger.enable();
      logTable("Full _precompile() Pipeline", results);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. 阶段拆解：parseSegmentTree 独立计时
  // ═══════════════════════════════════════════════════════════
  describe("2. Per-stage: parseSegmentTree", () => {
    it("parseSegmentTree timing for PBR vertex/fragment", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const results: BenchResult[] = [];

      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (pass.isUsePass || !pass.vertexSource) continue;
          if (pass.vertexHasMacros) {
            results.push(bench(`${pass.name} vertex`, () => {
              parseSegmentTree(pass.vertexSource!);
            }, 20, 5));
          }
          if (pass.fragmentHasMacros) {
            results.push(bench(`${pass.name} fragment`, () => {
              parseSegmentTree(pass.fragmentSource!);
            }, 20, 5));
          }
        }
      }

      logTable("parseSegmentTree (build-time cost)", results);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. 解码耗时：encode / decode
  // ═══════════════════════════════════════════════════════════
  describe("3. Encode / Decode", () => {
    it("encode + decode timing for each shader", () => {
      const results: Array<{ label: string; size: number; encode: BenchResult; decode: BenchResult }> = [];

      for (const { label, source } of shaderFiles) {
        const precompiled = shaderLab._precompile(source!, ShaderLanguage.GLSLES100, basePath);
        const encResult = bench(`${label} encode`, () => { encode(precompiled); }, 20, 5);
        const buffer = encode(precompiled);
        const decResult = bench(`${label} decode`, () => { decode(buffer); }, 20, 5);
        results.push({ label, size: buffer.byteLength, encode: encResult, decode: decResult });
      }

      console.log("\n=== Encode / Decode ===");
      console.log("| Shader | .gsb Size | Encode (ms) | Decode (ms) |");
      console.log("|--------|-----------|-------------|-------------|");
      for (const r of results) {
        const sizeKB = (r.size / 1024).toFixed(1) + "KB";
        console.log(
          `| ${r.label.padEnd(20)} | ${sizeKB.padStart(9)} | ${r.encode.avg.toFixed(3).padStart(11)} | ${r.decode.avg.toFixed(3).padStart(11)} |`
        );
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Shader 重建：createFromPrecompiled vs Shader.create
  // ═══════════════════════════════════════════════════════════
  describe("4. Shader reconstruction", () => {
    it("createFromPrecompiled vs Shader.create (PBR)", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const buffer = encode(precompiled);

      Logger.disable();

      // Live path
      const liveResult = bench("Shader.create (live)", () => {
        const name = uid("PBR_live");
        Shader.create(PBRSource);
        Shader.find(name)?.destroy(true);
        // Shader.create uses the shader name from source, need to clean by that name
      }, 5, 1);

      // Precompiled path
      const preResult = bench("decode + createFromPrecompiled", () => {
        const decoded = decode(buffer);
        const name = uid("PBR_pre");
        const shader = Shader.createFromPrecompiled({ ...decoded, name });
        shader?.destroy(true);
      }, 5, 1);

      Logger.enable();

      logComparison("Shader Reconstruction (PBR)", [{
        label: "PBR reconstruction",
        live: liveResult.avg,
        precompiled: preResult.avg
      }]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. 宏展开对比：evaluateSegmentTree vs _parseMacros
  // ═══════════════════════════════════════════════════════════
  describe("5. Macro expansion: segment tree vs _parseMacros", () => {
    it("PBR fragment with different macro combos", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);

      // Find the first non-UsePass with segments
      let fragSource: string | undefined;
      let fragSegments: any[] | undefined;
      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (!pass.isUsePass && pass.fragmentSegments && pass.fragmentSource) {
            fragSource = pass.fragmentSource;
            fragSegments = pass.fragmentSegments;
            break;
          }
        }
        if (fragSegments) break;
      }

      if (!fragSource || !fragSegments) {
        console.log("No PBR pass with fragment segments found, skipping.");
        return;
      }

      const macroSets: Array<{ label: string; macros: { name: string; value?: string }[] }> = [
        { label: "empty", macros: [] },
        { label: "base (11 macros)", macros: baseMacros },
        { label: "full (18 macros)", macros: [...baseMacros, ...materialVariantMacros] }
      ];

      const rows: Array<{ label: string; live: number; precompiled: number }> = [];

      for (const { label, macros } of macroSets) {
        const macroMap = makeMacroMap(macros);
        const macroObjects = macros.map(({ name, value }) => ({ name, value: value ?? "" }));

        const parseResult = bench(`_parseMacros [${label}]`, () => {
          shaderLab._parseMacros(fragSource!, macroObjects);
        }, 50, 10);

        const treeResult = bench(`evaluateSegmentTree [${label}]`, () => {
          evalBuildTime(fragSegments!, new Map(macroMap));
        }, 50, 10);

        rows.push({ label, live: parseResult.avg, precompiled: treeResult.avg });
      }

      logComparison("Macro Expansion: _parseMacros vs evaluateSegmentTree (PBR fragment)", rows);

      // Also verify runtime evaluator has same performance
      const rtResult = bench("runtime evaluator [base]", () => {
        evalRuntime(fragSegments!, new Map(makeMacroMap(baseMacros)));
      }, 50, 10);
      console.log(`\nRuntime evaluator (MacroSegmentEvaluator): ${rtResult.avg.toFixed(3)}ms avg`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. 端到端：源码 → WebGL 编译完成
  // ═══════════════════════════════════════════════════════════
  describe("6. End-to-end: source → WebGL ShaderProgram", () => {
    it("Live vs Precompiled full path (PBR, base macros)", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const buffer = encode(precompiled);
      const macroCollection = buildMacroCollection(baseMacros);

      Logger.disable();

      // Live path: Shader.create(string) → _getCanonicalShaderProgram → WebGL
      const liveResult = bench("Live (full pipeline + WebGL)", () => {
        const name = uid("e2e_live");
        // Create shader via live compilation
        // @ts-ignore
        Shader._shaderLab = shaderLab;
        const source = shaderLab._parseShaderSource(PBRSource);
        for (const sub of source.subShaders) {
          for (const pass of sub.passes) {
            if (pass.isUsePass) continue;
            const prog = shaderLab._parseShaderPass(
              pass.contents, pass.vertexEntry, pass.fragmentEntry,
              ShaderLanguage.GLSLES100, basePath
            );
            const sp = new ShaderPass(pass.name, prog.vertex, prog.fragment, pass.tags);
            // @ts-ignore
            sp._platformTarget = ShaderLanguage.GLSLES100;
            // @ts-ignore
            sp._getCanonicalShaderProgram(engine, macroCollection);
          }
        }
      }, 3, 1);

      // Precompiled path: decode → createFromPrecompiled → _getCanonicalShaderProgram → WebGL
      const preResult = bench("Precompiled (decode + rebuild + WebGL)", () => {
        const decoded = decode(buffer);
        const name = uid("e2e_pre");
        const shader = Shader.createFromPrecompiled({ ...decoded, name });
        if (shader) {
          for (const sub of shader.subShaders) {
            for (const pass of sub.passes) {
              if (!pass) continue;
              // @ts-ignore
              if (pass._platformTarget === undefined) continue;
              // @ts-ignore
              pass._getCanonicalShaderProgram(engine, macroCollection);
            }
          }
          shader.destroy(true);
        }
      }, 3, 1);

      Logger.enable();

      logComparison("End-to-End: Source → WebGL (PBR, base macros)", [{
        label: "PBR total",
        live: liveResult.avg,
        precompiled: preResult.avg
      }]);

      // Sanity check
      expect(liveResult.avg).toBeGreaterThan(0);
      expect(preResult.avg).toBeGreaterThan(0);
    });
  });
});
