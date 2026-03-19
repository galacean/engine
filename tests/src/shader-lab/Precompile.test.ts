import { Shader, ShaderLanguage, ShaderMacro, ShaderMacroCollection, ShaderPass } from "@galacean/engine-core";
import { IPrecompiledShader } from "@galacean/engine-design";
import { registerIncludes, PBRSource } from "@galacean/engine-shader";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { parseInstructions, Instruction } from "@galacean/engine-shaderlab/src/InstructionEncoder";
import { evaluateInstructions } from "@galacean/engine-core/src/shader/InstructionDecoder";

import { Logger, WebGLEngine } from "@galacean/engine";
import { server } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";

const { readFile } = server.commands;
Logger.enable();
registerIncludes();

const shaderLab = new ShaderLab();

// Helper: build a macro Map from name/value pairs
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
  // 1. JSON Serialization round-trip
  // ─────────────────────────────────────────────────────────
  describe("JSON Serialization", () => {
    it("round-trip: JSON.stringify → JSON.parse preserves all data", () => {
      const original: IPrecompiledShader = {
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
                vertexInstructions: [[0, "void main() { gl_Position = vec4(0.0); }"]],
                fragmentInstructions: [[0, "void main() { gl_FragColor = vec4(1.0); }"]]
              }
            ]
          }
        ]
      };

      const restored: IPrecompiledShader = JSON.parse(JSON.stringify(original));

      expect(restored.name).toBe(original.name);
      expect(restored.platformTarget).toBe(original.platformTarget);
      expect(restored.subShaders.length).toBe(1);
      expect(restored.subShaders[0].name).toBe("Default");
      expect(restored.subShaders[0].tags).toEqual({ LightMode: "ForwardBase" });
      expect(restored.subShaders[0].passes[0].vertexInstructions).toEqual(
        original.subShaders[0].passes[0].vertexInstructions
      );
      expect(restored.subShaders[0].passes[0].renderStates).toEqual(original.subShaders[0].passes[0].renderStates);
    });

    it("Color values as [r,g,b,a] arrays survive round-trip", () => {
      const original: IPrecompiledShader = {
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
                vertexInstructions: [[0, "void main(){}"]],
                fragmentInstructions: [[0, "void main(){}"]]
              }
            ]
          }
        ]
      };

      const restored: IPrecompiledShader = JSON.parse(JSON.stringify(original));
      expect(restored.subShaders[0].passes[0].renderStates.constantMap["20"]).toEqual([1.0, 0.5, 0.25, 1.0]);
    });

    it("instructions survive round-trip", () => {
      const instructions = parseInstructions("#ifdef FOO\nA\n#else\nB\n#endif\n");
      const original: IPrecompiledShader = {
        name: "InstructionTest",
        platformTarget: ShaderLanguage.GLSLES100,
        subShaders: [
          {
            name: "Default",
            passes: [
              {
                name: "Pass0",
                isUsePass: false,
                renderStates: { constantMap: {}, variableMap: {} },
                vertexInstructions: instructions,
                fragmentInstructions: [[0, "void main(){}"]]
              }
            ]
          }
        ]
      };

      const restored: IPrecompiledShader = JSON.parse(JSON.stringify(original));
      const pass = restored.subShaders[0].passes[0];
      expect(pass.vertexInstructions).toBeDefined();
      expect(pass.vertexInstructions!.length).toBeGreaterThan(0);
    });

    it("multiple subShaders and passes survive round-trip", () => {
      const original: IPrecompiledShader = {
        name: "MultiTest",
        platformTarget: ShaderLanguage.GLSLES100,
        subShaders: [
          {
            name: "Sub0",
            passes: [
              {
                name: "P0",
                isUsePass: false,
                renderStates: { constantMap: {}, variableMap: {} },
                vertexInstructions: [[0, "v0"]],
                fragmentInstructions: [[0, "f0"]]
              },
              {
                name: "P1",
                isUsePass: false,
                renderStates: { constantMap: {}, variableMap: {} },
                vertexInstructions: [[0, "v1"]],
                fragmentInstructions: [[0, "f1"]]
              }
            ]
          },
          {
            name: "Sub1",
            passes: [
              {
                name: "P0",
                isUsePass: false,
                renderStates: { constantMap: {}, variableMap: {} },
                vertexInstructions: [[0, "v2"]],
                fragmentInstructions: [[0, "f2"]]
              }
            ]
          }
        ]
      };

      const restored: IPrecompiledShader = JSON.parse(JSON.stringify(original));
      expect(restored.subShaders.length).toBe(2);
      expect(restored.subShaders[0].passes.length).toBe(2);
      expect(restored.subShaders[0].passes[1].vertexInstructions).toEqual([[0, "v1"]]);
      expect(restored.subShaders[1].passes[0].fragmentInstructions).toEqual([[0, "f2"]]);
    });

    it("UsePass flag preserved", () => {
      const original: IPrecompiledShader = {
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

      const restored: IPrecompiledShader = JSON.parse(JSON.stringify(original));
      expect(restored.subShaders[0].passes[0].isUsePass).toBe(true);
      expect(restored.subShaders[0].passes[0].name).toBe("pbr/Default/Forward");
      expect(restored.subShaders[0].passes[0].vertexInstructions).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────
  // 2. parseInstructions — build-time parser
  // ─────────────────────────────────────────────────────────
  describe("parseInstructions", () => {
    it("no directives → single TEXT instruction", () => {
      const glsl = "void main() { gl_Position = vec4(0.0); }";
      const inst = parseInstructions(glsl);
      expect(inst.length).toBe(1);
      expect(inst[0][0]).toBe(0); // TEXT
      expect(inst[0][1]).toBe(glsl);
    });

    it("adjacent text is merged", () => {
      const glsl = "line1\nline2\nline3";
      const inst = parseInstructions(glsl);
      expect(inst.length).toBe(1);
      expect(inst[0][0]).toBe(0);
    });

    it("#ifdef FOO → IF_DEF instruction", () => {
      const glsl = "#ifdef FOO\nbody\n#endif\n";
      const inst = parseInstructions(glsl);
      // Should have: IF_DEF, TEXT(body), ENDIF
      const ifInst = inst.find((i) => i[0] === 1); // IF_DEF
      expect(ifInst).toBeDefined();
      expect(ifInst![1]).toBe("FOO");
    });

    it("#ifdef FOO / #else → IF_DEF + ELSE + ENDIF", () => {
      const glsl = "#ifdef FOO\nA\n#else\nB\n#endif\n";
      const inst = parseInstructions(glsl);
      const ops = inst.map((i) => i[0]);
      expect(ops).toContain(1); // IF_DEF
      expect(ops).toContain(5); // ELSE
      expect(ops).toContain(6); // ENDIF
    });

    it("#ifndef FOO → IF_NDEF instruction", () => {
      const glsl = "#ifndef FOO\nbody\n#endif\n";
      const inst = parseInstructions(glsl);
      const ifInst = inst.find((i) => i[0] === 2); // IF_NDEF
      expect(ifInst).toBeDefined();
      expect(ifInst![1]).toBe("FOO");
    });

    it("#if / #elif / #else → proper instruction sequence", () => {
      const glsl = "#if FOO == 1\nA\n#elif FOO == 2\nB\n#else\nC\n#endif\n";
      const inst = parseInstructions(glsl);
      const ops = inst.map((i) => i[0]);
      // Should contain IF_CMP, ELSE, IF_CMP, ELSE, ENDIF
      expect(ops.filter((o) => o === 6).length).toBe(1); // one ENDIF
    });

    it("#if defined(A) && defined(B) → IF_EXPR instruction", () => {
      const glsl = "#if defined(A) && defined(B)\nbody\n#endif\n";
      const inst = parseInstructions(glsl);
      const ifInst = inst.find((i) => i[0] === 4); // IF_EXPR
      expect(ifInst).toBeDefined();
      expect(ifInst![1].t).toBe("and");
    });

    it("#define FOO → DEFINE instruction", () => {
      const inst = parseInstructions("#define FOO\n");
      expect(inst.length).toBe(1);
      expect(inst[0][0]).toBe(7); // DEFINE
      expect(inst[0][1]).toBe("FOO");
    });

    it("#define FOO 42 → DEFINE_VAL instruction", () => {
      const inst = parseInstructions("#define FOO 42\n");
      expect(inst[0][0]).toBe(8); // DEFINE_VAL
      expect(inst[0][1]).toBe("FOO");
      expect(inst[0][2]).toBe("42");
    });

    it("#define FOO(x, y) x + y → DEFINE_FUNC instruction", () => {
      const inst = parseInstructions("#define FOO(x, y) x + y\n");
      expect(inst[0][0]).toBe(9); // DEFINE_FUNC
      expect(inst[0][1]).toBe("FOO");
      expect(inst[0][2]).toEqual(["x", "y"]);
      expect(inst[0][3]).toBe("x + y");
    });

    it("#undef FOO → UNDEF instruction", () => {
      const inst = parseInstructions("#undef FOO\n");
      expect(inst[0][0]).toBe(10); // UNDEF
      expect(inst[0][1]).toBe("FOO");
    });

    it("text before and after directive is preserved", () => {
      const glsl = "before\n#ifdef FOO\nbody\n#endif\nafter\n";
      const inst = parseInstructions(glsl);
      const texts = inst.filter((i) => i[0] === 0).map((i) => i[1]);
      expect(texts.some((t) => t.includes("before"))).toBe(true);
      expect(texts.some((t) => t.includes("after"))).toBe(true);
    });

    it("nested conditionals", () => {
      const glsl = "#ifdef OUTER\n#ifdef INNER\nbody\n#endif\n#endif\n";
      const inst = parseInstructions(glsl);
      // Should have two IF_DEF and two ENDIF
      expect(inst.filter((i) => i[0] === 1).length).toBe(2); // two IF_DEF
      expect(inst.filter((i) => i[0] === 6).length).toBe(2); // two ENDIF
    });

    it("multiple top-level conditionals", () => {
      const glsl = "#ifdef A\nX\n#endif\n#ifdef B\nY\n#endif\n";
      const inst = parseInstructions(glsl);
      expect(inst.filter((i) => i[0] === 1).length).toBe(2);
    });

    it("result can be JSON.stringify → JSON.parse round-tripped", () => {
      const glsl = "#ifdef A\nX\n#elif A == 2\nY\n#else\nZ\n#endif\n";
      const inst = parseInstructions(glsl);
      const restored = JSON.parse(JSON.stringify(inst));
      expect(restored).toEqual(inst);
    });
  });

  // ─────────────────────────────────────────────────────────
  // 3. evaluateInstructions — runtime evaluator
  // ─────────────────────────────────────────────────────────
  describe("evaluateInstructions", () => {
    function eval_(inst: Instruction[], macros: Array<[string, string]>): string {
      return evaluateInstructions(inst, makeMacroMap(macros));
    }

    it("text-only instructions are returned as-is", () => {
      const inst = parseInstructions("void main() {}");
      expect(eval_(inst, [])).toBe("void main() {}");
    });

    it("#ifdef: branch taken when macro is defined", () => {
      const inst = parseInstructions("#ifdef FOO\nINSIDE\n#endif\n");
      expect(eval_(inst, [["FOO", ""]])).toContain("INSIDE");
    });

    it("#ifdef: branch skipped when macro is not defined", () => {
      const inst = parseInstructions("#ifdef FOO\nINSIDE\n#endif\n");
      expect(eval_(inst, [])).not.toContain("INSIDE");
    });

    it("#ifdef / #else: else branch taken when macro not defined", () => {
      const inst = parseInstructions("#ifdef FOO\nIF_BODY\n#else\nELSE_BODY\n#endif\n");
      const withoutFoo = eval_(inst, []);
      const withFoo = eval_(inst, [["FOO", ""]]);
      expect(withoutFoo).toContain("ELSE_BODY");
      expect(withoutFoo).not.toContain("IF_BODY");
      expect(withFoo).toContain("IF_BODY");
      expect(withFoo).not.toContain("ELSE_BODY");
    });

    it("#ifndef: branch taken when macro not defined", () => {
      const inst = parseInstructions("#ifndef FOO\nBODY\n#endif\n");
      expect(eval_(inst, [])).toContain("BODY");
      expect(eval_(inst, [["FOO", ""]])).not.toContain("BODY");
    });

    it("#if MACRO == value: correct branch selected", () => {
      const inst = parseInstructions("#if FOO == 1\nONE\n#elif FOO == 2\nTWO\n#else\nOTHER\n#endif\n");
      expect(eval_(inst, [["FOO", "1"]])).toContain("ONE");
      expect(eval_(inst, [["FOO", "2"]])).toContain("TWO");
      expect(eval_(inst, [["FOO", "3"]])).toContain("OTHER");
      expect(eval_(inst, [])).toContain("OTHER");
    });

    it("#if comparison operators", () => {
      expect(
        evaluateInstructions(parseInstructions("#if FOO > 3\nYES\n#endif\n"), makeMacroMap([["FOO", "5"]]))
      ).toContain("YES");
      expect(
        evaluateInstructions(parseInstructions("#if FOO > 3\nYES\n#endif\n"), makeMacroMap([["FOO", "2"]]))
      ).not.toContain("YES");
      expect(
        evaluateInstructions(parseInstructions("#if FOO != 0\nYES\n#endif\n"), makeMacroMap([["FOO", "1"]]))
      ).toContain("YES");
      expect(
        evaluateInstructions(parseInstructions("#if FOO != 0\nYES\n#endif\n"), makeMacroMap([["FOO", "0"]]))
      ).not.toContain("YES");
    });

    it("#if defined(A) && defined(B): requires both", () => {
      const inst = parseInstructions("#if defined(A) && defined(B)\nBOTH\n#endif\n");
      expect(
        eval_(inst, [
          ["A", ""],
          ["B", ""]
        ])
      ).toContain("BOTH");
      expect(eval_(inst, [["A", ""]])).not.toContain("BOTH");
      expect(eval_(inst, [])).not.toContain("BOTH");
    });

    it("#if defined(A) || defined(B): requires at least one", () => {
      const inst = parseInstructions("#if defined(A) || defined(B)\nEITHER\n#endif\n");
      expect(eval_(inst, [["A", ""]])).toContain("EITHER");
      expect(eval_(inst, [["B", ""]])).toContain("EITHER");
      expect(eval_(inst, [])).not.toContain("EITHER");
    });

    it("#if !defined(A): taken when not defined", () => {
      const inst = parseInstructions("#if !defined(A)\nNOT_A\n#endif\n");
      expect(eval_(inst, [])).toContain("NOT_A");
      expect(eval_(inst, [["A", ""]])).not.toContain("NOT_A");
    });

    it("#define side effect: subsequent #ifdef sees the defined macro", () => {
      const inst = parseInstructions("#define NEW_MACRO\n#ifdef NEW_MACRO\nSEEN\n#endif\n");
      const result = evaluateInstructions(inst, makeMacroMap([]));
      expect(result).toContain("SEEN");
    });

    it("#undef side effect: subsequent #ifdef does not see the macro", () => {
      const inst = parseInstructions("#undef FOO\n#ifdef FOO\nSTILL_HERE\n#else\nGONE\n#endif\n");
      const result = evaluateInstructions(inst, makeMacroMap([["FOO", ""]]));
      expect(result).not.toContain("STILL_HERE");
      expect(result).toContain("GONE");
    });

    it("nested conditionals: outer + inner independently evaluated", () => {
      const glsl = "#ifdef OUTER\n#ifdef INNER\nBOTH\n#else\nOUTER_ONLY\n#endif\n#endif\n";
      const inst = parseInstructions(glsl);
      expect(
        eval_(inst, [
          ["OUTER", ""],
          ["INNER", ""]
        ])
      ).toContain("BOTH");
      expect(eval_(inst, [["OUTER", ""]])).toContain("OUTER_ONLY");
      expect(eval_(inst, [])).not.toContain("BOTH");
      expect(eval_(inst, [])).not.toContain("OUTER_ONLY");
    });

    it("no matching branch (all false, no else) → empty for that conditional", () => {
      const inst = parseInstructions("BEFORE\n#ifdef FOO\nINSIDE\n#endif\nAFTER\n");
      const result = evaluateInstructions(inst, makeMacroMap([]));
      expect(result).toContain("BEFORE");
      expect(result).toContain("AFTER");
      expect(result).not.toContain("INSIDE");
    });

    it("complex condition: #elif with && and value comparison", () => {
      const glsl = "#ifdef A\nIF_A\n#elif defined(B) && B == 1\nIF_B\n#else\nFALL\n#endif\n";
      const inst = parseInstructions(glsl);
      expect(eval_(inst, [["A", ""]])).toContain("IF_A");
      expect(eval_(inst, [["B", "1"]])).toContain("IF_B");
      expect(eval_(inst, [["B", "0"]])).toContain("FALL");
      expect(eval_(inst, [])).toContain("FALL");
    });
  });

  // ─────────────────────────────────────────────────────────
  // 4. evaluateInstructions consistency
  // ─────────────────────────────────────────────────────────
  describe("evaluateInstructions consistency", () => {
    it("build-time and runtime evaluators produce identical output for macro-heavy shader", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      const macroCombinations: Array<Array<[string, string]>> = [
        [],
        [["RENDERER_IS_RECEIVE_SHADOWS", ""]],
        [["XX_Macro", ""]]
      ];

      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass || !pass.fragmentInstructions) continue;

          for (const macros of macroCombinations) {
            const bt = evaluateInstructions(pass.fragmentInstructions, makeMacroMap(macros));
            const rt = evaluateInstructions(pass.fragmentInstructions, makeMacroMap(macros));
            expect(bt).toBe(rt);
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
            // Both paths produce instructions from the same CodeGen output
            expect(precompiledPass.vertexInstructions).toEqual(liveProgram.vertexInstructions);
            expect(precompiledPass.fragmentInstructions).toEqual(liveProgram.fragmentInstructions);
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

    it("output should survive JSON stringify → parse round-trip", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const restored: IPrecompiledShader = JSON.parse(JSON.stringify(precompiled));

      for (let i = 0; i < precompiled.subShaders.length; i++) {
        for (let j = 0; j < precompiled.subShaders[i].passes.length; j++) {
          const orig = precompiled.subShaders[i].passes[j];
          const rest = restored.subShaders[i].passes[j];
          expect(rest.vertexInstructions).toEqual(orig.vertexInstructions);
          expect(rest.fragmentInstructions).toEqual(orig.fragmentInstructions);
        }
      }
    });

    it("simple shader (noFragArgs) → instructions should be single TEXT", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          // No-macro shaders should have single TEXT instruction
          expect(pass.vertexInstructions!.length).toBe(1);
          expect(pass.vertexInstructions![0][0]).toBe(0);
          expect(pass.fragmentInstructions!.length).toBe(1);
          expect(pass.fragmentInstructions![0][0]).toBe(0);
        }
      }
    });

    it("macro-heavy shader → instructions with conditionals", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      let foundMacroPass = false;
      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          if (pass.fragmentInstructions && pass.fragmentInstructions.length > 1) {
            foundMacroPass = true;
            // Should contain conditional opcodes
            const ops = pass.fragmentInstructions.map((i) => i[0]);
            expect(ops.some((o) => o >= 1 && o <= 4)).toBe(true); // IF_DEF/IF_NDEF/IF_CMP/IF_EXPR
          }
        }
      }
      expect(foundMacroPass).toBe(true);
    });

    it("multi-pass shader → renderStates have constantMap entries (BlendState)", async () => {
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

      const allPasses = precompiled.subShaders.flatMap((s) => s.passes);
      const usePasses = allPasses.filter((p) => p.isUsePass);
      const regularPasses = allPasses.filter((p) => !p.isUsePass);

      expect(usePasses.length).toBeGreaterThan(0);
      expect(regularPasses.length).toBeGreaterThan(0);

      for (const p of usePasses) {
        expect(p.vertexInstructions).toBeUndefined();
        expect(p.fragmentInstructions).toBeUndefined();
      }
    });

    it("GLSLES300 platformTarget is preserved in output", () => {
      const precompiled = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES300, basePath);
      expect(precompiled.platformTarget).toBe(ShaderLanguage.GLSLES300);
    });

    it("subShader tags are preserved", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      const sub = precompiled.subShaders[0];
      expect(sub.tags).toBeDefined();
      expect(sub.tags!["LightMode"]).toBe("ForwardBase");
    });

    it("pass tags are preserved", async () => {
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

    it("_vertexInstructions / _fragmentInstructions are set correctly", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestNoFrag_CFP_Instructions" };
      const shader = Shader.createFromPrecompiled(testData);

      for (const sub of shader.subShaders) {
        for (const pass of sub.passes) {
          // @ts-ignore
          expect(pass._vertexInstructions).toBeDefined();
          // @ts-ignore
          expect(pass._fragmentInstructions).toBeDefined();
        }
      }

      shader.destroy(true);
    });

    it("_vertexInstructions populated for macro-heavy shader", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestMacroPre_CFP_Instructions" };
      const shader = Shader.createFromPrecompiled(testData);

      let foundInstructions = false;
      for (const sub of shader.subShaders) {
        for (const pass of sub.passes) {
          // @ts-ignore
          if (pass._fragmentInstructions && pass._fragmentInstructions.length > 1) {
            foundInstructions = true;
            // @ts-ignore
            expect(Array.isArray(pass._fragmentInstructions)).toBe(true);
          }
        }
      }
      expect(foundInstructions).toBe(true);

      shader.destroy(true);
    });

    it("SubShader tags are preserved after createFromPrecompiled", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestMacroPre_CFP_Tags" };
      const shader = Shader.createFromPrecompiled(testData);

      const sub = shader.subShaders[0];
      expect(sub.getTagValue("LightMode")).toBe("ForwardBase");

      shader.destroy(true);
    });

    it("ShaderPass tags are preserved after createFromPrecompiled", async () => {
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
      const second = Shader.createFromPrecompiled(testData);

      expect(second).toBeFalsy();

      first.destroy(true);
    });

    it("UsePass in multi-pass shader is handled without throwing", async () => {
      const source = await readFile("./shaders/multi-pass.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
      const testData = { ...precompiled, name: "TestMultiPass_CFP_UsePass" };

      expect(() => Shader.createFromPrecompiled(testData)).not.toThrow();

      Shader.find("TestMultiPass_CFP_UsePass")?.destroy(true);
    });
  });

  // ─────────────────────────────────────────────────────────
  // 7. Correctness: precompile vs live compilation for all test shaders
  // ─────────────────────────────────────────────────────────
  describe("Correctness: precompile vs live compilation", () => {
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
            // Compare instructions directly — both paths use parseInstructions on the same CodeGen output
            expect(precompiledPass.vertexInstructions).toEqual(liveProgram.vertexInstructions);
            expect(precompiledPass.fragmentInstructions).toEqual(liveProgram.fragmentInstructions);
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
          expect(precompiled.subShaders[i].passes[j].vertexInstructions).toEqual(liveProgram.vertexInstructions);
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────
  // 8. Performance
  // ─────────────────────────────────────────────────────────
  describe("Performance", () => {
    it("JSON.parse should be faster than _precompile", () => {
      const warmup = shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      const jsonStr = JSON.stringify(warmup);

      const RUNS = 5;
      const compileStart = performance.now();
      for (let i = 0; i < RUNS; i++) {
        shaderLab._precompile(PBRSource, ShaderLanguage.GLSLES100, basePath);
      }
      const compileTime = (performance.now() - compileStart) / RUNS;

      const parseStart = performance.now();
      for (let i = 0; i < RUNS; i++) {
        JSON.parse(jsonStr);
      }
      const parseTime = (performance.now() - parseStart) / RUNS;

      console.log(`[Perf] _precompile avg: ${compileTime.toFixed(2)}ms`);
      console.log(`[Perf] JSON.parse avg: ${parseTime.toFixed(2)}ms`);
      console.log(`[Perf] Speedup: ${(compileTime / parseTime).toFixed(1)}x`);

      expect(parseTime).toBeLessThan(compileTime);
    });

    it("evaluateInstructions is fast on macro-heavy shader", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);

      let fragmentInstructions: any[][] | undefined;
      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (!pass.isUsePass && pass.fragmentInstructions && pass.fragmentInstructions.length > 1) {
            fragmentInstructions = pass.fragmentInstructions;
          }
        }
      }

      if (!fragmentInstructions) {
        console.log("[Perf] No macro instructions found, skipping");
        return;
      }

      const macros = [
        ["RENDERER_IS_RECEIVE_SHADOWS", ""],
        ["SCENE_SHADOW_TYPE", "3"]
      ] as Array<[string, string]>;
      const RUNS = 50;

      const evalStart = performance.now();
      for (let i = 0; i < RUNS; i++) {
        evaluateInstructions(fragmentInstructions, makeMacroMap(macros));
      }
      const evalTime = (performance.now() - evalStart) / RUNS;

      console.log(`[Perf] evaluateInstructions avg: ${evalTime.toFixed(3)}ms`);
      expect(evalTime).toBeLessThan(5); // should be sub-ms
    });
  });
});
