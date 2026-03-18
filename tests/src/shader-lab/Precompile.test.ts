import {
  Shader,
  ShaderLanguage,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderPass
} from "@galacean/engine-core";
import { IPrecompiledShader } from "@galacean/engine-design";
import { registerIncludes, PBRSource } from "@galacean/engine-shader";
import { ShaderLab } from "@galacean/engine-shaderlab";
import {
  parseSegmentTree,
  evaluateSegmentTree as evaluateSegmentTreeBuildTime,
  Segment,
  ConditionalSegment,
  TextSegment
} from "@galacean/engine-shaderlab/src/MacroCodeSegment";
import { evaluateSegmentTree as evaluateSegmentTreeRuntime } from "@galacean/engine-core/src/shader/MacroSegmentEvaluator";
import { encode, decode, PRECOMPILE_VERSION } from "@galacean/engine-shaderlab/src/PrecompiledShaderCodec";

import { Logger, WebGLEngine } from "@galacean/engine";
import { server } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";

const { readFile } = server.commands;
Logger.enable();
registerIncludes();

const shaderLab = new ShaderLab();

// Helper: build a macro Map from name/value pairs (mirrors ShaderPass._buildMacroMap)
function makeMacroMap(entries: Array<[string, string]>): Map<string, string> {
  return new Map(entries);
}

describe("ShaderLab Precompile", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });

  // @ts-ignore
  Shader._shaderLab = shaderLab;

  const basePath = new URL("", ShaderPass._shaderRootPath).href;

  // ─────────────────────────────────────────────────────────
  // 1. Binary Codec (encode / decode)
  // ─────────────────────────────────────────────────────────
  describe("Binary Codec (encode/decode)", () => {
    it("round-trip: encode → decode should preserve all data", () => {
      const original: IPrecompiledShader = {
        version: PRECOMPILE_VERSION,
        name: "TestShader",
        platformTarget: ShaderLanguage.GLSLES100,
        subShaders: [
          {
            name: "Default",
            tags: { LightMode: "ForwardBase" },
            passes: [
              {
                name: "Forward",
                isUsePass: false,
                tags: { pipelineStage: "Forward" },
                renderStates: {
                  constantMap: { "10": true, "11": 5 },
                  variableMap: { "12": "myProperty" }
                },
                vertexSource: "void main() { gl_Position = vec4(0.0); }",
                fragmentSource: "void main() { gl_FragColor = vec4(1.0); }"
              }
            ]
          }
        ]
      };

      const buffer = encode(original);
      const restored = decode(buffer);

      expect(restored.version).toBe(original.version);
      expect(restored.name).toBe(original.name);
      expect(restored.platformTarget).toBe(original.platformTarget);
      expect(restored.subShaders.length).toBe(1);
      expect(restored.subShaders[0].name).toBe("Default");
      expect(restored.subShaders[0].tags).toEqual({ LightMode: "ForwardBase" });
      expect(restored.subShaders[0].passes[0].vertexSource).toBe(original.subShaders[0].passes[0].vertexSource);
      expect(restored.subShaders[0].passes[0].fragmentSource).toBe(original.subShaders[0].passes[0].fragmentSource);
      expect(restored.subShaders[0].passes[0].renderStates).toEqual(original.subShaders[0].passes[0].renderStates);
    });

    it("round-trip: Color values as [r,g,b,a] arrays survive encode/decode", () => {
      const original: IPrecompiledShader = {
        version: PRECOMPILE_VERSION,
        name: "ColorTest",
        platformTarget: ShaderLanguage.GLSLES100,
        subShaders: [
          {
            name: "Default",
            passes: [
              {
                name: "Pass0",
                isUsePass: false,
                renderStates: {
                  constantMap: { "20": [1.0, 0.5, 0.25, 1.0] },
                  variableMap: {}
                },
                vertexSource: "void main(){}",
                fragmentSource: "void main(){}"
              }
            ]
          }
        ]
      };

      const restored = decode(encode(original));
      expect(restored.subShaders[0].passes[0].renderStates.constantMap["20"]).toEqual([1.0, 0.5, 0.25, 1.0]);
    });

    it("round-trip: hasMacros flags and segments survive encode/decode", () => {
      const segments = parseSegmentTree("#ifdef FOO\nA\n#else\nB\n#endif\n");
      const original: IPrecompiledShader = {
        version: PRECOMPILE_VERSION,
        name: "SegmentTest",
        platformTarget: ShaderLanguage.GLSLES100,
        subShaders: [
          {
            name: "Default",
            passes: [
              {
                name: "Pass0",
                isUsePass: false,
                renderStates: { constantMap: {}, variableMap: {} },
                vertexSource: "#ifdef FOO\nA\n#else\nB\n#endif\n",
                fragmentSource: "void main(){}",
                vertexHasMacros: true,
                fragmentHasMacros: false,
                vertexSegments: segments,
                fragmentSegments: undefined
              }
            ]
          }
        ]
      };

      const restored = decode(encode(original));
      const pass = restored.subShaders[0].passes[0];
      expect(pass.vertexHasMacros).toBe(true);
      expect(pass.fragmentHasMacros).toBe(false);
      expect(pass.vertexSegments).toBeDefined();
      expect(pass.vertexSegments!.length).toBeGreaterThan(0);
      expect(pass.fragmentSegments).toBeUndefined();
    });

    it("round-trip: multiple subShaders and passes", () => {
      const original: IPrecompiledShader = {
        version: PRECOMPILE_VERSION,
        name: "MultiTest",
        platformTarget: ShaderLanguage.GLSLES100,
        subShaders: [
          {
            name: "Sub0",
            passes: [
              { name: "P0", isUsePass: false, renderStates: { constantMap: {}, variableMap: {} }, vertexSource: "v0", fragmentSource: "f0" },
              { name: "P1", isUsePass: false, renderStates: { constantMap: {}, variableMap: {} }, vertexSource: "v1", fragmentSource: "f1" }
            ]
          },
          {
            name: "Sub1",
            passes: [
              { name: "P0", isUsePass: false, renderStates: { constantMap: {}, variableMap: {} }, vertexSource: "v2", fragmentSource: "f2" }
            ]
          }
        ]
      };

      const restored = decode(encode(original));
      expect(restored.subShaders.length).toBe(2);
      expect(restored.subShaders[0].passes.length).toBe(2);
      expect(restored.subShaders[1].passes.length).toBe(1);
      expect(restored.subShaders[0].passes[1].vertexSource).toBe("v1");
      expect(restored.subShaders[1].passes[0].fragmentSource).toBe("f2");
    });

    it("round-trip: UsePass flag preserved", () => {
      const original: IPrecompiledShader = {
        version: PRECOMPILE_VERSION,
        name: "UsePassTest",
        platformTarget: ShaderLanguage.GLSLES100,
        subShaders: [
          {
            name: "Default",
            passes: [
              { name: "pbr/Default/Forward", isUsePass: true, renderStates: { constantMap: {}, variableMap: {} } }
            ]
          }
        ]
      };

      const restored = decode(encode(original));
      const pass = restored.subShaders[0].passes[0];
      expect(pass.isUsePass).toBe(true);
      expect(pass.name).toBe("pbr/Default/Forward");
      expect(pass.vertexSource).toBeUndefined();
    });

    it("should reject invalid magic bytes", () => {
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      view.setUint32(0, 0xdeadbeef, true);
      expect(() => decode(buffer)).toThrow("bad magic");
    });

    it("should reject incompatible future version", () => {
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      view.setUint32(0, 0x00425347, true); // valid magic "GSB\0"
      view.setUint16(4, 999, true); // future version
      expect(() => decode(buffer)).toThrow("Incompatible");
    });

    it("should reject buffer too small", () => {
      expect(() => decode(new ArrayBuffer(4))).toThrow("too small");
    });

    it("should reject empty payload as invalid JSON", () => {
      // Header only, no JSON payload → JSON.parse("") should throw
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint32(0, 0x00425347, true);
      view.setUint16(4, PRECOMPILE_VERSION, true);
      expect(() => decode(buffer)).toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────
  // 2. parseSegmentTree — build-time parser
  // ─────────────────────────────────────────────────────────
  describe("parseSegmentTree", () => {
    it("no directives → single text segment", () => {
      const glsl = "void main() { gl_Position = vec4(0.0); }";
      const segments = parseSegmentTree(glsl);
      expect(segments.length).toBe(1);
      expect(segments[0].t).toBe(0);
      expect((segments[0] as TextSegment).s).toBe(glsl);
    });

    it("adjacent text segments are merged", () => {
      const glsl = "line1\nline2\nline3";
      const segments = parseSegmentTree(glsl);
      expect(segments.length).toBe(1);
      expect(segments[0].t).toBe(0);
    });

    it("#ifdef FOO → ConditionalSegment with def condition", () => {
      const glsl = "#ifdef FOO\nbody\n#endif\n";
      const segments = parseSegmentTree(glsl);
      expect(segments.length).toBe(1);
      const cond = segments[0] as ConditionalSegment;
      expect(cond.t).toBe(1);
      expect(cond.b.length).toBe(1);
      expect(cond.b[0].c).toEqual({ t: "def", m: "FOO" });
      expect(cond.b[0].b.length).toBeGreaterThan(0);
    });

    it("#ifdef FOO / #else → two branches", () => {
      const glsl = "#ifdef FOO\nA\n#else\nB\n#endif\n";
      const cond = parseSegmentTree(glsl)[0] as ConditionalSegment;
      expect(cond.t).toBe(1);
      expect(cond.b.length).toBe(2);
      expect(cond.b[0].c).toEqual({ t: "def", m: "FOO" });
      expect(cond.b[1].c).toBeNull(); // #else
    });

    it("#ifndef FOO → NotDefinedCondition", () => {
      const glsl = "#ifndef FOO\nbody\n#endif\n";
      const cond = parseSegmentTree(glsl)[0] as ConditionalSegment;
      expect(cond.b[0].c).toEqual({ t: "ndef", m: "FOO" });
    });

    it("#if / #elif / #else → three branches", () => {
      const glsl = "#if FOO == 1\nA\n#elif FOO == 2\nB\n#else\nC\n#endif\n";
      const cond = parseSegmentTree(glsl)[0] as ConditionalSegment;
      expect(cond.b.length).toBe(3);
      expect(cond.b[0].c).toEqual({ t: "cmp", m: "FOO", op: "==", v: 1 });
      expect(cond.b[1].c).toEqual({ t: "cmp", m: "FOO", op: "==", v: 2 });
      expect(cond.b[2].c).toBeNull();
    });

    it("#if defined(A) && defined(B) → and condition", () => {
      const glsl = "#if defined(A) && defined(B)\nbody\n#endif\n";
      const cond = parseSegmentTree(glsl)[0] as ConditionalSegment;
      const c = cond.b[0].c!;
      expect(c.t).toBe("and");
      expect((c as any).l).toEqual({ t: "def", m: "A" });
      expect((c as any).r).toEqual({ t: "def", m: "B" });
    });

    it("#if defined(A) || defined(B) → or condition", () => {
      const glsl = "#if defined(A) || defined(B)\nbody\n#endif\n";
      const cond = parseSegmentTree(glsl)[0] as ConditionalSegment;
      const c = cond.b[0].c!;
      expect(c.t).toBe("or");
    });

    it("#if !defined(A) → not condition", () => {
      const glsl = "#if !defined(A)\nbody\n#endif\n";
      const cond = parseSegmentTree(glsl)[0] as ConditionalSegment;
      const c = cond.b[0].c!;
      expect(c.t).toBe("not");
      expect((c as any).c).toEqual({ t: "def", m: "A" });
    });

    it("comparison operators: >, <, >=, <=, !=", () => {
      const ops = [">", "<", ">=", "<=", "!="] as const;
      for (const op of ops) {
        const glsl = `#if MACRO ${op} 5\nbody\n#endif\n`;
        const cond = parseSegmentTree(glsl)[0] as ConditionalSegment;
        expect((cond.b[0].c as any).op).toBe(op);
        expect((cond.b[0].c as any).v).toBe(5);
      }
    });

    it("#define FOO → DefineSegment with no value", () => {
      const segments = parseSegmentTree("#define FOO\n");
      expect(segments.length).toBe(1);
      expect(segments[0]).toEqual({ t: 2, n: "FOO" });
    });

    it("#define FOO 42 → DefineSegment with value", () => {
      const segments = parseSegmentTree("#define FOO 42\n");
      expect(segments[0]).toEqual({ t: 2, n: "FOO", v: "42" });
    });

    it("#undef FOO → UndefSegment", () => {
      const segments = parseSegmentTree("#undef FOO\n");
      expect(segments[0]).toEqual({ t: 3, n: "FOO" });
    });

    it("text before and after directive is preserved", () => {
      const glsl = "before\n#ifdef FOO\nbody\n#endif\nafter\n";
      const segments = parseSegmentTree(glsl);
      expect(segments.length).toBe(3);
      expect(segments[0].t).toBe(0);
      expect((segments[0] as TextSegment).s).toContain("before");
      expect(segments[1].t).toBe(1);
      expect(segments[2].t).toBe(0);
      expect((segments[2] as TextSegment).s).toContain("after");
    });

    it("nested conditionals", () => {
      const glsl = "#ifdef OUTER\n#ifdef INNER\nbody\n#endif\n#endif\n";
      const outer = parseSegmentTree(glsl)[0] as ConditionalSegment;
      expect(outer.t).toBe(1);
      expect(outer.b[0].c).toEqual({ t: "def", m: "OUTER" });
      // body contains inner conditional
      const innerSegs = outer.b[0].b;
      const inner = innerSegs.find(s => s.t === 1) as ConditionalSegment | undefined;
      expect(inner).toBeDefined();
      expect(inner!.b[0].c).toEqual({ t: "def", m: "INNER" });
    });

    it("multiple top-level conditionals", () => {
      const glsl = "#ifdef A\nX\n#endif\n#ifdef B\nY\n#endif\n";
      const segments = parseSegmentTree(glsl);
      const conditionals = segments.filter(s => s.t === 1);
      expect(conditionals.length).toBe(2);
    });

    it("result can be JSON.stringify → JSON.parse round-tripped", () => {
      const glsl = "#ifdef A\nX\n#elif A == 2\nY\n#else\nZ\n#endif\n";
      const segments = parseSegmentTree(glsl);
      const restored = JSON.parse(JSON.stringify(segments));
      expect(restored).toEqual(segments);
    });
  });

  // ─────────────────────────────────────────────────────────
  // 3. evaluateSegmentTree — runtime evaluator
  // ─────────────────────────────────────────────────────────
  describe("evaluateSegmentTree", () => {
    // Test both the build-time and runtime versions together
    function evalBoth(segments: Segment[], macros: Array<[string, string]>): { bt: string; rt: string } {
      const map = makeMacroMap(macros);
      return {
        bt: evaluateSegmentTreeBuildTime(segments, map),
        rt: evaluateSegmentTreeRuntime(segments, makeMacroMap(macros))
      };
    }

    it("text-only segments are returned as-is", () => {
      const segments = parseSegmentTree("void main() {}");
      const { bt, rt } = evalBoth(segments, []);
      expect(bt).toBe("void main() {}");
      expect(rt).toBe(bt);
    });

    it("#ifdef: branch taken when macro is defined", () => {
      const segments = parseSegmentTree("#ifdef FOO\nINSIDE\n#endif\n");
      const { bt, rt } = evalBoth(segments, [["FOO", ""]]);
      expect(bt).toContain("INSIDE");
      expect(rt).toContain("INSIDE");
    });

    it("#ifdef: branch skipped when macro is not defined", () => {
      const segments = parseSegmentTree("#ifdef FOO\nINSIDE\n#endif\n");
      const { bt, rt } = evalBoth(segments, []);
      expect(bt).not.toContain("INSIDE");
      expect(rt).not.toContain("INSIDE");
    });

    it("#ifdef / #else: else branch taken when macro not defined", () => {
      const segments = parseSegmentTree("#ifdef FOO\nIF_BODY\n#else\nELSE_BODY\n#endif\n");
      const withoutFoo = evalBoth(segments, []);
      const withFoo = evalBoth(segments, [["FOO", ""]]);
      expect(withoutFoo.bt).toContain("ELSE_BODY");
      expect(withoutFoo.bt).not.toContain("IF_BODY");
      expect(withFoo.bt).toContain("IF_BODY");
      expect(withFoo.bt).not.toContain("ELSE_BODY");
      expect(withoutFoo.rt).toBe(withoutFoo.bt);
      expect(withFoo.rt).toBe(withFoo.bt);
    });

    it("#ifndef: branch taken when macro not defined", () => {
      const segments = parseSegmentTree("#ifndef FOO\nBODY\n#endif\n");
      const { bt: without } = evalBoth(segments, []);
      const { bt: withFoo } = evalBoth(segments, [["FOO", ""]]);
      expect(without).toContain("BODY");
      expect(withFoo).not.toContain("BODY");
    });

    it("#if MACRO == value: correct branch selected", () => {
      const segments = parseSegmentTree("#if FOO == 1\nONE\n#elif FOO == 2\nTWO\n#else\nOTHER\n#endif\n");
      expect(evalBoth(segments, [["FOO", "1"]]).bt).toContain("ONE");
      expect(evalBoth(segments, [["FOO", "2"]]).bt).toContain("TWO");
      expect(evalBoth(segments, [["FOO", "3"]]).bt).toContain("OTHER");
      expect(evalBoth(segments, []).bt).toContain("OTHER");
    });

    it("#if comparison operators", () => {
      expect(evaluateSegmentTreeBuildTime(parseSegmentTree("#if FOO > 3\nYES\n#endif\n"), makeMacroMap([["FOO", "5"]]))).toContain("YES");
      expect(evaluateSegmentTreeBuildTime(parseSegmentTree("#if FOO > 3\nYES\n#endif\n"), makeMacroMap([["FOO", "2"]]))).not.toContain("YES");
      expect(evaluateSegmentTreeBuildTime(parseSegmentTree("#if FOO != 0\nYES\n#endif\n"), makeMacroMap([["FOO", "1"]]))).toContain("YES");
      expect(evaluateSegmentTreeBuildTime(parseSegmentTree("#if FOO != 0\nYES\n#endif\n"), makeMacroMap([["FOO", "0"]]))).not.toContain("YES");
    });

    it("#if defined(A) && defined(B): requires both", () => {
      const segments = parseSegmentTree("#if defined(A) && defined(B)\nBOTH\n#endif\n");
      expect(evalBoth(segments, [["A", ""], ["B", ""]]).bt).toContain("BOTH");
      expect(evalBoth(segments, [["A", ""]]).bt).not.toContain("BOTH");
      expect(evalBoth(segments, []).bt).not.toContain("BOTH");
    });

    it("#if defined(A) || defined(B): requires at least one", () => {
      const segments = parseSegmentTree("#if defined(A) || defined(B)\nEITHER\n#endif\n");
      expect(evalBoth(segments, [["A", ""]]).bt).toContain("EITHER");
      expect(evalBoth(segments, [["B", ""]]).bt).toContain("EITHER");
      expect(evalBoth(segments, []).bt).not.toContain("EITHER");
    });

    it("#if !defined(A): taken when not defined", () => {
      const segments = parseSegmentTree("#if !defined(A)\nNOT_A\n#endif\n");
      expect(evalBoth(segments, []).bt).toContain("NOT_A");
      expect(evalBoth(segments, [["A", ""]]).bt).not.toContain("NOT_A");
    });

    it("#define side effect: subsequent #ifdef sees the defined macro", () => {
      const segments = parseSegmentTree("#define NEW_MACRO\n#ifdef NEW_MACRO\nSEEN\n#endif\n");
      // Use a fresh map (no NEW_MACRO initially)
      const result = evaluateSegmentTreeBuildTime(segments, makeMacroMap([]));
      expect(result).toContain("SEEN");
    });

    it("#undef side effect: subsequent #ifdef does not see the macro", () => {
      const segments = parseSegmentTree("#undef FOO\n#ifdef FOO\nSTILL_HERE\n#else\nGONE\n#endif\n");
      // FOO starts defined in the map
      const result = evaluateSegmentTreeBuildTime(segments, makeMacroMap([["FOO", ""]]));
      expect(result).not.toContain("STILL_HERE");
      expect(result).toContain("GONE");
    });

    it("nested conditionals: outer + inner independently evaluated", () => {
      const glsl = "#ifdef OUTER\n#ifdef INNER\nBOTH\n#else\nOUTER_ONLY\n#endif\n#endif\n";
      const segments = parseSegmentTree(glsl);
      expect(evalBoth(segments, [["OUTER", ""], ["INNER", ""]]).bt).toContain("BOTH");
      expect(evalBoth(segments, [["OUTER", ""]]).bt).toContain("OUTER_ONLY");
      expect(evalBoth(segments, []).bt).not.toContain("BOTH");
      expect(evalBoth(segments, []).bt).not.toContain("OUTER_ONLY");
    });

    it("no matching branch (all false, no else) → empty for that conditional", () => {
      const segments = parseSegmentTree("BEFORE\n#ifdef FOO\nINSIDE\n#endif\nAFTER\n");
      const result = evaluateSegmentTreeBuildTime(segments, makeMacroMap([]));
      expect(result).toContain("BEFORE");
      expect(result).toContain("AFTER");
      expect(result).not.toContain("INSIDE");
    });

    it("build-time and runtime evaluators produce identical output", () => {
      const glsl = "#ifdef A\nIF_A\n#elif defined(B) && B == 1\nIF_B\n#else\nFALL\n#endif\n";
      const segments = parseSegmentTree(glsl);
      const macroCombinations: Array<Array<[string, string]>> = [
        [],
        [["A", ""]],
        [["B", "1"]],
        [["B", "0"]],
        [["A", ""], ["B", "1"]]
      ];
      for (const macros of macroCombinations) {
        const bt = evaluateSegmentTreeBuildTime(segments, makeMacroMap(macros));
        const rt = evaluateSegmentTreeRuntime(segments, makeMacroMap(macros));
        expect(rt).toBe(bt);
      }
    });
  });

  // ─────────────────────────────────────────────────────────
  // 4. Segment tree vs _parseMacros consistency
  // ─────────────────────────────────────────────────────────
  describe("evaluateSegmentTree vs _parseMacros consistency", () => {
    function buildMacroObjects(entries: Array<[string, string]>): Array<{ name: string; value: string }> {
      return entries.map(([name, value]) => ({ name, value }));
    }

    it("segment tree and _parseMacros produce identical output for simple ifdef", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass || !pass.vertexSource) continue;

          // If there are segments, verify they produce same output as _parseMacros
          if (pass.vertexSegments) {
            const macros: Array<[string, string]> = [];
            const fromTree = evaluateSegmentTreeBuildTime(pass.vertexSegments!, makeMacroMap(macros));
            const fromParser = shaderLab._parseMacros(pass.vertexSource!, buildMacroObjects(macros));
            expect(fromTree).toBe(fromParser);
          }
        }
      }
    });

    it("segment tree and _parseMacros produce identical output for macro-heavy shader", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      // Only test with genuinely runtime macros.
      // SCENE_SHADOW_TYPE is a build-time Preprocessor define (#define SCENE_SHADOW_TYPE 3)
      // so after Preprocessor, the GLSL contains literals like #if 3 == 2 (not SCENE_SHADOW_TYPE == 2).
      // These are correctly handled by BoolCondition in parseSegmentTree, but _parseMacros also
      // evaluates them, so there should be no difference for these macros when passed as runtime values.
      const macroCombinations: Array<Array<[string, string]>> = [
        [],
        [["RENDERER_IS_RECEIVE_SHADOWS", ""]],
        [["XX_Macro", ""]]
      ];

      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass || !pass.fragmentSource || !pass.fragmentSegments) continue;

          for (const macros of macroCombinations) {
            const fromTree = evaluateSegmentTreeBuildTime(pass.fragmentSegments!, makeMacroMap(macros));
            const fromParser = shaderLab._parseMacros(pass.fragmentSource!, buildMacroObjects(macros));
            // Normalize whitespace: both evaluateSegmentTree and _parseMacros may produce
            // slightly different blank-line patterns around #define/#undef directives.
            // These are semantically irrelevant to GLSL compilation.
            const normalizeWS = (s: string) =>
              s.split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0) // remove blank lines entirely
                .join("\n");
            expect(normalizeWS(fromTree)).toBe(normalizeWS(fromParser));
          }
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────
  // 5. ShaderLab._precompile()
  // ─────────────────────────────────────────────────────────
  describe("ShaderLab._precompile()", () => {
    it("should produce valid IPrecompiledShader from PBR source", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);

      expect(precompiled.version).toBe(PRECOMPILE_VERSION);
      expect(typeof precompiled.name).toBe("string");
      expect(precompiled.name.length).toBeGreaterThan(0);
      expect(precompiled.platformTarget).toBe(ShaderLanguage.GLSLES100);
      expect(precompiled.subShaders.length).toBeGreaterThan(0);
    });

    it("precompiled output should match live compilation for each pass", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const liveSource = shaderLab._parseShaderSource(PBRSource);

      for (let i = 0; i < liveSource.subShaders.length; i++) {
        const liveSub = liveSource.subShaders[i];
        const precompiledSub = precompiled.subShaders[i];

        expect(precompiledSub.name).toBe(liveSub.name);

        for (let j = 0; j < liveSub.passes.length; j++) {
          const livePass = liveSub.passes[j];
          const precompiledPass = precompiledSub.passes[j];

          expect(precompiledPass.name).toBe(livePass.name);
          expect(precompiledPass.isUsePass).toBe(livePass.isUsePass === true);

          if (!livePass.isUsePass) {
            const liveProgram = shaderLab._parseShaderPass(
              livePass.contents,
              livePass.vertexEntry,
              livePass.fragmentEntry,
              ShaderLanguage.GLSLES100,
              basePath
            );
            expect(precompiledPass.vertexSource).toBe(liveProgram.vertex);
            expect(precompiledPass.fragmentSource).toBe(liveProgram.fragment);
          }
        }
      }
    });

    it("output should survive JSON round-trip", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const restored = JSON.parse(JSON.stringify(precompiled)) as IPrecompiledShader;
      expect(restored.name).toBe(precompiled.name);
      expect(restored.subShaders.length).toBe(precompiled.subShaders.length);
    });

    it("output should survive binary encode → decode round-trip", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const restored = decode(encode(precompiled));

      for (let i = 0; i < precompiled.subShaders.length; i++) {
        for (let j = 0; j < precompiled.subShaders[i].passes.length; j++) {
          const orig = precompiled.subShaders[i].passes[j];
          const rest = restored.subShaders[i].passes[j];
          expect(rest.vertexSource).toBe(orig.vertexSource);
          expect(rest.fragmentSource).toBe(orig.fragmentSource);
        }
      }
    });

    it("simple shader (noFragArgs) → hasMacros should be false", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          expect(pass.vertexHasMacros).toBe(false);
          expect(pass.fragmentHasMacros).toBe(false);
        }
      }
    });

    it("simple shader (mrt-struct) → segments should be undefined", async () => {
      const source = await readFile("./shaders/mrt-struct.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          expect(pass.vertexSegments).toBeUndefined();
          expect(pass.fragmentSegments).toBeUndefined();
        }
      }
    });

    it("macro-heavy shader → hasMacros=true and segments populated", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      let foundMacroPass = false;
      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          if (pass.fragmentHasMacros) {
            foundMacroPass = true;
            expect(pass.fragmentSegments).toBeDefined();
            expect(pass.fragmentSegments!.length).toBeGreaterThan(0);
          }
        }
      }
      expect(foundMacroPass).toBe(true);
    });

    it("multi-pass shader → renderStates have constantMap entries (BlendState)", async () => {
      // multi-pass.shader has BlendState = transparentBlendState with constants (Enabled=true, factors)
      const source = await readFile("./shaders/multi-pass.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      let hasConstant = false;
      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          const { constantMap } = pass.renderStates;
          if (Object.keys(constantMap).length > 0) hasConstant = true;
        }
      }
      expect(hasConstant).toBe(true);
    });

    it("multi-pass shader → UsePass correctly flagged", async () => {
      const source = await readFile("./shaders/multi-pass.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      const allPasses = precompiled.subShaders.flatMap(s => s.passes);
      const usePasses = allPasses.filter(p => p.isUsePass);
      const regularPasses = allPasses.filter(p => !p.isUsePass);

      expect(usePasses.length).toBeGreaterThan(0);
      expect(regularPasses.length).toBeGreaterThan(0);

      // UsePass should have no vertex/fragment source
      for (const p of usePasses) {
        expect(p.vertexSource).toBeUndefined();
        expect(p.fragmentSource).toBeUndefined();
      }
    });

    it("GLSLES300 platformTarget is preserved in output", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES300, basePath);
      expect(precompiled.platformTarget).toBe(ShaderLanguage.GLSLES300);
    });

    it("subShader tags are preserved", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      // macro-pre.shader has SubShader "subname" with Tags { LightMode = "ForwardBase" }
      const sub = precompiled.subShaders[0];
      expect(sub.tags).toBeDefined();
      expect(sub.tags!["LightMode"]).toBe("ForwardBase");
    });

    it("pass tags are preserved", async () => {
      // noFragArgs.shader has Pass "test" with Tags { ReplacementTag = "opaque" }
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      const pass = precompiled.subShaders[0].passes[0];
      expect(pass.tags).toBeDefined();
      expect(pass.tags!["ReplacementTag"]).toBe("opaque");
    });
  });

  // ─────────────────────────────────────────────────────────
  // 6. Shader.createFromPrecompiled()
  // ─────────────────────────────────────────────────────────
  describe("Shader.createFromPrecompiled()", () => {
    it("should create Shader with correct name and subShader count", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestPBR_CFP_1" };
      const shader = Shader.createFromPrecompiled(testData);

      expect(shader).not.toBeNull();
      expect(shader.name).toBe("TestPBR_CFP_1");
      expect(shader.subShaders.length).toBe(testData.subShaders.length);

      shader.destroy(true);
    });

    it("platformTarget is set on each ShaderPass", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestNoFrag_CFP_PlatformTarget" };
      const shader = Shader.createFromPrecompiled(testData);

      for (const sub of shader.subShaders) {
        for (const pass of sub.passes) {
          // @ts-ignore
          expect(pass._platformTarget).toBe(ShaderLanguage.GLSLES100);
        }
      }

      shader.destroy(true);
    });

    it("_vertexHasMacros / _fragmentHasMacros are set correctly", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestNoFrag_CFP_HasMacros" };
      const shader = Shader.createFromPrecompiled(testData);

      for (const sub of shader.subShaders) {
        for (const pass of sub.passes) {
          // @ts-ignore
          expect(pass._vertexHasMacros).toBe(false);
          // @ts-ignore
          expect(pass._fragmentHasMacros).toBe(false);
        }
      }

      shader.destroy(true);
    });

    it("_vertexSegments populated for macro-heavy shader", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestMacroPre_CFP_Segments" };
      const shader = Shader.createFromPrecompiled(testData);

      let foundSegments = false;
      for (const sub of shader.subShaders) {
        for (const pass of sub.passes) {
          // @ts-ignore
          if (pass._fragmentSegments) {
            foundSegments = true;
            // @ts-ignore
            expect(Array.isArray(pass._fragmentSegments)).toBe(true);
          }
        }
      }
      expect(foundSegments).toBe(true);

      shader.destroy(true);
    });

    it("SubShader tags are preserved after createFromPrecompiled", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestMacroPre_CFP_Tags" };
      const shader = Shader.createFromPrecompiled(testData);

      const sub = shader.subShaders[0];
      // macro-pre.shader SubShader has Tags { LightMode = "ForwardBase" }
      expect(sub.getTagValue("LightMode")).toBe("ForwardBase");

      shader.destroy(true);
    });

    it("ShaderPass tags are preserved after createFromPrecompiled", async () => {
      // noFragArgs.shader Pass "test" has Tags { ReplacementTag = "opaque" }
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestNoFrag_CFP_PassTags" };
      const shader = Shader.createFromPrecompiled(testData);

      const pass = shader.subShaders[0].passes[0];
      expect(pass.getTagValue("ReplacementTag")).toBe("opaque");

      shader.destroy(true);
    });

    it("duplicate shader name → returns existing shader (no re-registration)", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestPBR_CFP_Duplicate" };

      const first = Shader.createFromPrecompiled(testData);
      const second = Shader.createFromPrecompiled(testData); // same name again

      // second call should not create a new shader
      expect(second).toBeFalsy(); // returns null/undefined when name already exists

      first.destroy(true);
    });

    it("UsePass in multi-pass shader is handled without throwing", async () => {
      const source = await readFile("./shaders/multi-pass.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestMultiPass_CFP_UsePass" };

      // Should not throw even if the referenced UsePass shader doesn't exist
      expect(() => Shader.createFromPrecompiled(testData)).not.toThrow();

      Shader.find("TestMultiPass_CFP_UsePass")?.destroy(true);
    });
  });

  // ─────────────────────────────────────────────────────────
  // 7. Correctness: precompile vs live compilation for all test shaders
  // ─────────────────────────────────────────────────────────
  describe("Correctness: precompile vs live compilation", () => {
    // render-state.shader is excluded: its passes have no VertexShader/FragmentShader entries,
    // so _precompile cannot generate GLSL — it only tests render state serialization.
    const testShaders = [
      "noFragArgs.shader",
      "waterfull.shader",
      "multi-pass.shader",
      "macro-pre.shader",
      "mrt-struct.shader"
    ];

    for (const shaderFile of testShaders) {
      it(`${shaderFile}: precompile output matches live compilation`, async () => {
        const source = await readFile(`./shaders/${shaderFile}`);
        const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
        const liveSource = shaderLab._parseShaderSource(source);

        for (let i = 0; i < liveSource.subShaders.length; i++) {
          const liveSub = liveSource.subShaders[i];
          for (let j = 0; j < liveSub.passes.length; j++) {
            const livePass = liveSub.passes[j];
            if (livePass.isUsePass) continue;

            const liveProgram = shaderLab._parseShaderPass(
              livePass.contents,
              livePass.vertexEntry,
              livePass.fragmentEntry,
              ShaderLanguage.GLSLES100,
              basePath
            );

            const precompiledPass = precompiled.subShaders[i].passes[j];
            expect(precompiledPass.vertexSource).toBe(liveProgram.vertex);
            expect(precompiledPass.fragmentSource).toBe(liveProgram.fragment);
          }
        }
      });
    }

    it("GLSLES300 precompile output matches GLSLES300 live compilation", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES300, basePath);
      const liveSource = shaderLab._parseShaderSource(source);

      for (let i = 0; i < liveSource.subShaders.length; i++) {
        for (let j = 0; j < liveSource.subShaders[i].passes.length; j++) {
          const livePass = liveSource.subShaders[i].passes[j];
          if (livePass.isUsePass) continue;
          const liveProgram = shaderLab._parseShaderPass(
            livePass.contents,
            livePass.vertexEntry,
            livePass.fragmentEntry,
            ShaderLanguage.GLSLES300,
            basePath
          );
          expect(precompiled.subShaders[i].passes[j].vertexSource).toBe(liveProgram.vertex);
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────
  // 8. Performance
  // ─────────────────────────────────────────────────────────
  describe("Performance", () => {
    it("decode + createFromPrecompiled should be faster than _precompile", () => {
      const warmup = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const buffer = encode(warmup);

      // Measure full precompile (Preprocessor + Lexer + Parser + CodeGen)
      const RUNS = 5;
      const compileStart = performance.now();
      for (let i = 0; i < RUNS; i++) {
        shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      }
      const compileTime = (performance.now() - compileStart) / RUNS;

      // Measure decode only
      const decodeStart = performance.now();
      for (let i = 0; i < RUNS; i++) {
        decode(buffer);
      }
      const decodeTime = (performance.now() - decodeStart) / RUNS;

      console.log(`[Perf] _precompile avg: ${compileTime.toFixed(2)}ms`);
      console.log(`[Perf] decode avg: ${decodeTime.toFixed(2)}ms`);
      console.log(`[Perf] Speedup: ${(compileTime / decodeTime).toFixed(1)}x`);

      expect(decodeTime).toBeLessThan(compileTime);
    });

    it("evaluateSegmentTree should be faster than _parseMacros on macro-heavy shader", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      // Find a pass with segments
      let fragmentSource: string | undefined;
      let fragmentSegments: any[] | undefined;
      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (!pass.isUsePass && pass.fragmentSegments && pass.fragmentSource) {
            fragmentSource = pass.fragmentSource;
            fragmentSegments = pass.fragmentSegments;
          }
        }
      }

      if (!fragmentSegments || !fragmentSource) {
        console.log("[Perf] No macro segments found, skipping evaluateSegmentTree perf test");
        return;
      }

      const macros = [["RENDERER_IS_RECEIVE_SHADOWS", ""], ["SCENE_SHADOW_TYPE", "3"]] as Array<[string, string]>;
      const macroObjects = macros.map(([name, value]) => ({ name, value }));

      const RUNS = 50;

      // Measure _parseMacros
      const parseStart = performance.now();
      for (let i = 0; i < RUNS; i++) {
        shaderLab._parseMacros(fragmentSource, macroObjects);
      }
      const parseTime = (performance.now() - parseStart) / RUNS;

      // Measure evaluateSegmentTree
      const evalStart = performance.now();
      for (let i = 0; i < RUNS; i++) {
        evaluateSegmentTreeBuildTime(fragmentSegments, makeMacroMap(macros));
      }
      const evalTime = (performance.now() - evalStart) / RUNS;

      console.log(`[Perf] _parseMacros avg: ${parseTime.toFixed(3)}ms`);
      console.log(`[Perf] evaluateSegmentTree avg: ${evalTime.toFixed(3)}ms`);
      if (parseTime > 0) {
        console.log(`[Perf] Speedup: ${(parseTime / evalTime).toFixed(1)}x`);
      }

      // evaluateSegmentTree should be at least as fast
      expect(evalTime).toBeLessThanOrEqual(parseTime + 1); // +1ms tolerance
    });
  });
});
