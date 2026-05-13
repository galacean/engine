import { Shader, ShaderLanguage, ShaderMacro, ShaderMacroCollection } from "@galacean/engine-core";
import { IPrecompiledShader } from "@galacean/engine-design";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderInstructionEncoder, ShaderInstruction } from "@galacean/engine-shader-compiler/src/ShaderInstructionEncoder";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";

import { Logger, WebGLEngine } from "@galacean/engine";
import { server } from "@vitest/browser/context";
import { beforeAll, describe, expect, it } from "vitest";

const { readFile } = server.commands;
Logger.enable();

const shaderCompiler = new ShaderCompiler();

// Helper: build a macro Map from name/value pairs
function makeMacroMap(entries: Array<[string, string]>): Map<string, string> {
  return new Map(entries);
}

describe("ShaderCompiler Precompile", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas, shaderCompiler });
  const PBRSource = await readFile("../../../packages/shader/src/Shaders/PBR.shader");


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
                vertexShaderInstructions: [[0, "void main() { gl_Position = vec4(0.0); }"]],
                fragmentShaderInstructions: [[0, "void main() { gl_FragColor = vec4(1.0); }"]]
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
      expect(restored.subShaders[0].passes[0].vertexShaderInstructions).toEqual(
        original.subShaders[0].passes[0].vertexShaderInstructions
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
                vertexShaderInstructions: [[0, "void main(){}"]],
                fragmentShaderInstructions: [[0, "void main(){}"]]
              }
            ]
          }
        ]
      };

      const restored: IPrecompiledShader = JSON.parse(JSON.stringify(original));
      expect(restored.subShaders[0].passes[0].renderStates.constantMap["20"]).toEqual([1.0, 0.5, 0.25, 1.0]);
    });

    it("instructions survive round-trip", () => {
      const instructions = ShaderInstructionEncoder.parse("#ifdef FOO\nA\n#else\nB\n#endif\n");
      const original: IPrecompiledShader = {
        name: "ShaderInstructionTest",
        platformTarget: ShaderLanguage.GLSLES100,
        subShaders: [
          {
            name: "Default",
            passes: [
              {
                name: "Pass0",
                isUsePass: false,
                renderStates: { constantMap: {}, variableMap: {} },
                vertexShaderInstructions: instructions,
                fragmentShaderInstructions: [[0, "void main(){}"]]
              }
            ]
          }
        ]
      };

      const restored: IPrecompiledShader = JSON.parse(JSON.stringify(original));
      const pass = restored.subShaders[0].passes[0];
      expect(pass.vertexShaderInstructions).toBeDefined();
      expect(pass.vertexShaderInstructions!.length).toBeGreaterThan(0);
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
                vertexShaderInstructions: [[0, "v0"]],
                fragmentShaderInstructions: [[0, "f0"]]
              },
              {
                name: "P1",
                isUsePass: false,
                renderStates: { constantMap: {}, variableMap: {} },
                vertexShaderInstructions: [[0, "v1"]],
                fragmentShaderInstructions: [[0, "f1"]]
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
                vertexShaderInstructions: [[0, "v2"]],
                fragmentShaderInstructions: [[0, "f2"]]
              }
            ]
          }
        ]
      };

      const restored: IPrecompiledShader = JSON.parse(JSON.stringify(original));
      expect(restored.subShaders.length).toBe(2);
      expect(restored.subShaders[0].passes.length).toBe(2);
      expect(restored.subShaders[0].passes[1].vertexShaderInstructions).toEqual([[0, "v1"]]);
      expect(restored.subShaders[1].passes[0].fragmentShaderInstructions).toEqual([[0, "f2"]]);
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
      expect(restored.subShaders[0].passes[0].vertexShaderInstructions).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────
  // 2. parseShaderInstructions — build-time parser
  // ─────────────────────────────────────────────────────────
  describe("parseShaderInstructions", () => {
    it("no directives → single TEXT instruction", () => {
      const glsl = "void main() { gl_Position = vec4(0.0); }";
      const inst = ShaderInstructionEncoder.parse(glsl);
      expect(inst.length).toBe(1);
      expect(inst[0][0]).toBe(0); // TEXT
      expect(inst[0][1]).toBe(glsl);
    });

    it("adjacent text is merged", () => {
      const glsl = "line1\nline2\nline3";
      const inst = ShaderInstructionEncoder.parse(glsl);
      expect(inst.length).toBe(1);
      expect(inst[0][0]).toBe(0);
    });

    it("#ifdef FOO → IF_DEF instruction", () => {
      const glsl = "#ifdef FOO\nbody\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      // Should have: IF_DEF, TEXT(body), ENDIF
      const ifInst = inst.find((i) => i[0] === 1); // IF_DEF
      expect(ifInst).toBeDefined();
      expect(ifInst![1]).toBe("FOO");
    });

    it("#ifdef FOO / #else → IF_DEF + ELSE + ENDIF", () => {
      const glsl = "#ifdef FOO\nA\n#else\nB\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const ops = inst.map((i) => i[0]);
      expect(ops).toContain(1); // IF_DEF
      expect(ops).toContain(5); // ELSE
      expect(ops).toContain(6); // ENDIF
    });

    it("#ifndef FOO → IF_NDEF instruction", () => {
      const glsl = "#ifndef FOO\nbody\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const ifInst = inst.find((i) => i[0] === 2); // IF_NDEF
      expect(ifInst).toBeDefined();
      expect(ifInst![1]).toBe("FOO");
    });

    it("#if / #elif / #else → proper instruction sequence", () => {
      const glsl = "#if FOO == 1\nA\n#elif FOO == 2\nB\n#else\nC\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const ops = inst.map((i) => i[0]);
      // Should contain IF_CMP, ELSE, IF_CMP, ELSE, ENDIF
      expect(ops.filter((o) => o === 6).length).toBe(1); // one ENDIF
    });

    it("#if defined(A) && defined(B) → IF_EXPR instruction", () => {
      const glsl = "#if defined(A) && defined(B)\nbody\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const ifInst = inst.find((i) => i[0] === 4); // IF_EXPR
      expect(ifInst).toBeDefined();
      expect(ifInst![1].t).toBe("and");
    });

    it("#define FOO → DEFINE instruction", () => {
      const inst = ShaderInstructionEncoder.parse("#define FOO\n");
      expect(inst.length).toBe(1);
      expect(inst[0][0]).toBe(7); // DEFINE
      expect(inst[0][1]).toBe("FOO");
    });

    it("#define FOO 42 → DEFINE_VAL instruction", () => {
      const inst = ShaderInstructionEncoder.parse("#define FOO 42\n");
      expect(inst[0][0]).toBe(8); // DEFINE_VAL
      expect(inst[0][1]).toBe("FOO");
      expect(inst[0][2]).toBe("42");
    });

    it("#define FOO(x, y) x + y → DEFINE_FUNC instruction", () => {
      const inst = ShaderInstructionEncoder.parse("#define FOO(x, y) x + y\n");
      expect(inst[0][0]).toBe(9); // DEFINE_FUNC
      expect(inst[0][1]).toBe("FOO");
      expect(inst[0][2]).toEqual(["x", "y"]);
      expect(inst[0][3]).toBe("x + y");
    });

    it("#undef FOO → UNDEF instruction", () => {
      const inst = ShaderInstructionEncoder.parse("#undef FOO\n");
      expect(inst[0][0]).toBe(10); // UNDEF
      expect(inst[0][1]).toBe("FOO");
    });

    it("text before and after directive is preserved", () => {
      const glsl = "before\n#ifdef FOO\nbody\n#endif\nafter\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const texts = inst.filter((i) => i[0] === 0).map((i) => i[1]);
      expect(texts.some((t) => t.includes("before"))).toBe(true);
      expect(texts.some((t) => t.includes("after"))).toBe(true);
    });

    it("nested conditionals", () => {
      const glsl = "#ifdef OUTER\n#ifdef INNER\nbody\n#endif\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      // Should have two IF_DEF and two ENDIF
      expect(inst.filter((i) => i[0] === 1).length).toBe(2); // two IF_DEF
      expect(inst.filter((i) => i[0] === 6).length).toBe(2); // two ENDIF
    });

    it("multiple top-level conditionals", () => {
      const glsl = "#ifdef A\nX\n#endif\n#ifdef B\nY\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      expect(inst.filter((i) => i[0] === 1).length).toBe(2);
    });

    it("result can be JSON.stringify → JSON.parse round-tripped", () => {
      const glsl = "#ifdef A\nX\n#elif A == 2\nY\n#else\nZ\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const restored = JSON.parse(JSON.stringify(inst));
      expect(restored).toEqual(inst);
    });

    it("#define with inline comment → strips comment, DEFINE_VAL with value only", () => {
      const inst = ShaderInstructionEncoder.parse("#define HALF_EPS 4.8828125e-4 // machine epsilon\n");
      expect(inst[0][0]).toBe(8); // DEFINE_VAL
      expect(inst[0][1]).toBe("HALF_EPS");
      expect(inst[0][2]).toBe("4.8828125e-4");
    });

    it("#if without spaces around operator parses the same as with spaces", () => {
      const noSpaces = ShaderInstructionEncoder.parse("#if SCENE_SHADOW_CASCADED_COUNT==1\nbody\n#endif\n");
      const withSpaces = ShaderInstructionEncoder.parse("#if SCENE_SHADOW_CASCADED_COUNT == 1\nbody\n#endif\n");
      const noSp = noSpaces.find((i) => i[0] === 3); // IF_CMP
      const withSp = withSpaces.find((i) => i[0] === 3);
      expect(noSp).toBeDefined();
      expect(noSp![1]).toBe(withSp![1]); // same macro name
      expect(noSp![2]).toBe(withSp![2]); // same operator
      expect(noSp![3]).toBe(withSp![3]); // same value
    });

    it("#ifdef + #elif defined() mix (normal_get.glsl pattern)", () => {
      const glsl = [
        "#ifdef RENDERER_HAS_NORMAL",
        "  vec3 n = v_normal;",
        "#elif defined(HAS_DERIVATIVES)",
        "  vec3 n = cross(dFdx(v_pos), dFdy(v_pos));",
        "#else",
        "  vec3 n = vec3(0.0, 0.0, 1.0);",
        "#endif",
        ""
      ].join("\n");
      const inst = ShaderInstructionEncoder.parse(glsl);
      const ops = inst.map((i) => i[0]);
      // Should have IF_DEF for #ifdef, and the #elif defined() decomposes into ELSE + IF_DEF
      expect(ops.filter((o) => o === 1).length).toBe(2); // two IF_DEF
      expect(ops).toContain(5); // ELSE
      expect(ops).toContain(6); // ENDIF
    });

    it("#if defined(X) && !defined(Y) (skinning_vert.glsl pattern)", () => {
      const glsl = "#if defined(RENDERER_HAS_NORMAL) && !defined(MATERIAL_OMIT_NORMAL)\nbody\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const ifInst = inst.find((i) => i[0] === 4); // IF_EXPR
      expect(ifInst).toBeDefined();
      const cond = ifInst![1] as any;
      expect(cond.t).toBe("and");
      expect(cond.l.t).toBe("def");
      expect(cond.l.m).toBe("RENDERER_HAS_NORMAL");
      expect(cond.r.t).toBe("not");
      expect(cond.r.c.t).toBe("def");
      expect(cond.r.c.m).toBe("MATERIAL_OMIT_NORMAL");
    });

    it("#if defined(A) || (defined(B) && defined(C)) — mixed precedence with parens", () => {
      const glsl = "#if defined(A) || (defined(B) && defined(C))\nbody\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const ifInst = inst.find((i) => i[0] === 4); // IF_EXPR
      expect(ifInst).toBeDefined();
      const cond = ifInst![1] as any;
      expect(cond.t).toBe("or");
      expect(cond.l.t).toBe("def");
      expect(cond.l.m).toBe("A");
      expect(cond.r.t).toBe("and");
      expect(cond.r.l.m).toBe("B");
      expect(cond.r.r.m).toBe("C");
    });

    it("3-way #elif chain (FogFragmentDeclaration.glsl pattern)", () => {
      const glsl = [
        "#if SCENE_FOG_MODE == 1",
        "  float fogFactor = linear;",
        "#elif SCENE_FOG_MODE == 2",
        "  float fogFactor = exp;",
        "#elif SCENE_FOG_MODE == 3",
        "  float fogFactor = exp2;",
        "#endif",
        ""
      ].join("\n");
      const inst = ShaderInstructionEncoder.parse(glsl);
      // Three IF_CMP instructions (one for #if, two for #elif)
      expect(inst.filter((i) => i[0] === 3).length).toBe(3);
      // Two ELSE instructions (one per #elif)
      expect(inst.filter((i) => i[0] === 5).length).toBe(2);
      // One ENDIF
      expect(inst.filter((i) => i[0] === 6).length).toBe(1);
    });

    it("conditional #define + immediate #ifdef (ShadowFragmentDeclaration.glsl pattern)", () => {
      const glsl = [
        "#if defined(SCENE_SHADOW_TYPE) && defined(RENDERER_IS_RECEIVE_SHADOWS)",
        "  #define SCENE_IS_CALCULATE_SHADOWS",
        "#endif",
        "#ifdef SCENE_IS_CALCULATE_SHADOWS",
        "  shadow_code;",
        "#endif",
        ""
      ].join("\n");
      const inst = ShaderInstructionEncoder.parse(glsl);
      // Should have IF_EXPR, DEFINE, ENDIF, IF_DEF, TEXT, ENDIF
      const ops = inst.map((i) => i[0]);
      expect(ops).toContain(4); // IF_EXPR for the compound condition
      expect(ops).toContain(7); // DEFINE for SCENE_IS_CALCULATE_SHADOWS
      expect(inst.filter((i) => i[0] === 6).length).toBe(2); // two ENDIFs
      expect(inst.filter((i) => i[0] === 1).length).toBe(1); // one IF_DEF
    });

    it("same macro redefined in different branches (SAMPLE_TEXTURE2D_SHADOW pattern)", () => {
      const glsl = [
        "#ifdef GRAPHICS_API_WEBGL2",
        "  #define SAMPLE(tex, coord) textureLod(tex, coord, 0.0)",
        "#else",
        "  #define SAMPLE(tex, coord) texture2D(tex, coord)",
        "#endif",
        "SAMPLE(myTex, uv)",
        ""
      ].join("\n");
      const inst = ShaderInstructionEncoder.parse(glsl);
      // Two DEFINE_FUNC instructions (one per branch)
      const funcDefs = inst.filter((i) => i[0] === 9);
      expect(funcDefs.length).toBe(2);
      expect(funcDefs[0][1]).toBe("SAMPLE");
      expect(funcDefs[1][1]).toBe("SAMPLE");
      // One contains textureLod, the other texture2D
      expect(funcDefs[0][3]).toContain("textureLod");
      expect(funcDefs[1][3]).toContain("texture2D");
    });

    it("deep nesting (4 levels) — jump offsets work correctly", () => {
      const glsl = [
        "#ifdef L1",
        "#ifdef L2",
        "#ifdef L3",
        "#ifdef L4",
        "deepest",
        "#endif",
        "#endif",
        "#endif",
        "#endif",
        ""
      ].join("\n");
      const inst = ShaderInstructionEncoder.parse(glsl);
      expect(inst.filter((i) => i[0] === 1).length).toBe(4); // four IF_DEF
      expect(inst.filter((i) => i[0] === 6).length).toBe(4); // four ENDIF
      // Verify all jump offsets are valid (not -1)
      const ifDefs = inst.filter((i) => i[0] === 1);
      for (const ifDef of ifDefs) {
        expect(ifDef[2]).toBeGreaterThan(0);
        expect(ifDef[2]).toBeLessThanOrEqual(inst.length);
      }
    });

    it("identity function macro — #define COLOR_2_LINEAR(color) color", () => {
      const inst = ShaderInstructionEncoder.parse("#define COLOR_2_LINEAR(color) color\n");
      expect(inst[0][0]).toBe(9); // DEFINE_FUNC
      expect(inst[0][1]).toBe("COLOR_2_LINEAR");
      expect(inst[0][2]).toEqual(["color"]);
      expect(inst[0][3]).toBe("color");
    });
  });

  // ─────────────────────────────────────────────────────────
  // 3. evaluateShaderInstructions — runtime evaluator
  // ─────────────────────────────────────────────────────────
  describe("evaluateShaderInstructions", () => {
    function eval_(inst: ShaderInstruction[], macros: Array<[string, string]>): string {
      return ShaderMacroProcessor.evaluate(inst, makeMacroMap(macros));
    }

    it("text-only instructions are returned as-is", () => {
      const inst = ShaderInstructionEncoder.parse("void main() {}");
      expect(eval_(inst, [])).toBe("void main() {}");
    });

    it("#ifdef: branch taken when macro is defined", () => {
      const inst = ShaderInstructionEncoder.parse("#ifdef FOO\nINSIDE\n#endif\n");
      expect(eval_(inst, [["FOO", ""]])).toContain("INSIDE");
    });

    it("#ifdef: branch skipped when macro is not defined", () => {
      const inst = ShaderInstructionEncoder.parse("#ifdef FOO\nINSIDE\n#endif\n");
      expect(eval_(inst, [])).not.toContain("INSIDE");
    });

    it("#ifdef / #else: else branch taken when macro not defined", () => {
      const inst = ShaderInstructionEncoder.parse("#ifdef FOO\nIF_BODY\n#else\nELSE_BODY\n#endif\n");
      const withoutFoo = eval_(inst, []);
      const withFoo = eval_(inst, [["FOO", ""]]);
      expect(withoutFoo).toContain("ELSE_BODY");
      expect(withoutFoo).not.toContain("IF_BODY");
      expect(withFoo).toContain("IF_BODY");
      expect(withFoo).not.toContain("ELSE_BODY");
    });

    it("#ifndef: branch taken when macro not defined", () => {
      const inst = ShaderInstructionEncoder.parse("#ifndef FOO\nBODY\n#endif\n");
      expect(eval_(inst, [])).toContain("BODY");
      expect(eval_(inst, [["FOO", ""]])).not.toContain("BODY");
    });

    it("#if MACRO == value: correct branch selected", () => {
      const inst = ShaderInstructionEncoder.parse("#if FOO == 1\nONE\n#elif FOO == 2\nTWO\n#else\nOTHER\n#endif\n");
      expect(eval_(inst, [["FOO", "1"]])).toContain("ONE");
      expect(eval_(inst, [["FOO", "2"]])).toContain("TWO");
      expect(eval_(inst, [["FOO", "3"]])).toContain("OTHER");
      expect(eval_(inst, [])).toContain("OTHER");
    });

    it("#if comparison operators", () => {
      expect(
        ShaderMacroProcessor.evaluate(ShaderInstructionEncoder.parse("#if FOO > 3\nYES\n#endif\n"), makeMacroMap([["FOO", "5"]]))
      ).toContain("YES");
      expect(
        ShaderMacroProcessor.evaluate(ShaderInstructionEncoder.parse("#if FOO > 3\nYES\n#endif\n"), makeMacroMap([["FOO", "2"]]))
      ).not.toContain("YES");
      expect(
        ShaderMacroProcessor.evaluate(ShaderInstructionEncoder.parse("#if FOO != 0\nYES\n#endif\n"), makeMacroMap([["FOO", "1"]]))
      ).toContain("YES");
      expect(
        ShaderMacroProcessor.evaluate(ShaderInstructionEncoder.parse("#if FOO != 0\nYES\n#endif\n"), makeMacroMap([["FOO", "0"]]))
      ).not.toContain("YES");
    });

    it("#if defined(A) && defined(B): requires both", () => {
      const inst = ShaderInstructionEncoder.parse("#if defined(A) && defined(B)\nBOTH\n#endif\n");
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
      const inst = ShaderInstructionEncoder.parse("#if defined(A) || defined(B)\nEITHER\n#endif\n");
      expect(eval_(inst, [["A", ""]])).toContain("EITHER");
      expect(eval_(inst, [["B", ""]])).toContain("EITHER");
      expect(eval_(inst, [])).not.toContain("EITHER");
    });

    it("#if !defined(A): taken when not defined", () => {
      const inst = ShaderInstructionEncoder.parse("#if !defined(A)\nNOT_A\n#endif\n");
      expect(eval_(inst, [])).toContain("NOT_A");
      expect(eval_(inst, [["A", ""]])).not.toContain("NOT_A");
    });

    it("#define side effect: subsequent #ifdef sees the defined macro", () => {
      const inst = ShaderInstructionEncoder.parse("#define NEW_MACRO\n#ifdef NEW_MACRO\nSEEN\n#endif\n");
      const result = ShaderMacroProcessor.evaluate(inst, makeMacroMap([]));
      expect(result).toContain("SEEN");
    });

    it("#undef side effect: subsequent #ifdef does not see the macro", () => {
      const inst = ShaderInstructionEncoder.parse("#undef FOO\n#ifdef FOO\nSTILL_HERE\n#else\nGONE\n#endif\n");
      const result = ShaderMacroProcessor.evaluate(inst, makeMacroMap([["FOO", ""]]));
      expect(result).not.toContain("STILL_HERE");
      expect(result).toContain("GONE");
    });

    it("nested conditionals: outer + inner independently evaluated", () => {
      const glsl = "#ifdef OUTER\n#ifdef INNER\nBOTH\n#else\nOUTER_ONLY\n#endif\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
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
      const inst = ShaderInstructionEncoder.parse("BEFORE\n#ifdef FOO\nINSIDE\n#endif\nAFTER\n");
      const result = ShaderMacroProcessor.evaluate(inst, makeMacroMap([]));
      expect(result).toContain("BEFORE");
      expect(result).toContain("AFTER");
      expect(result).not.toContain("INSIDE");
    });

    it("complex condition: #elif with && and value comparison", () => {
      const glsl = "#ifdef A\nIF_A\n#elif defined(B) && B == 1\nIF_B\n#else\nFALL\n#endif\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      expect(eval_(inst, [["A", ""]])).toContain("IF_A");
      expect(eval_(inst, [["B", "1"]])).toContain("IF_B");
      expect(eval_(inst, [["B", "0"]])).toContain("FALL");
      expect(eval_(inst, [])).toContain("FALL");
    });

    it("#define with comment stripped — comment not in output", () => {
      const inst = ShaderInstructionEncoder.parse("#define HALF_EPS 4.8828125e-4 // machine epsilon\nfloat x = HALF_EPS;\n");
      const result = eval_(inst, []);
      expect(result).toContain("4.8828125e-4");
      expect(result).not.toContain("machine epsilon");
      expect(result).not.toContain("//");
    });

    it("#elif defined(A) && !defined(B) — different macro combos select correct branch", () => {
      const glsl = [
        "#ifdef X",
        "BRANCH_X",
        "#elif defined(A) && !defined(B)",
        "BRANCH_A_NOT_B",
        "#else",
        "FALLBACK",
        "#endif",
        ""
      ].join("\n");
      const inst = ShaderInstructionEncoder.parse(glsl);
      expect(eval_(inst, [["X", ""]])).toContain("BRANCH_X");
      expect(eval_(inst, [["A", ""]])).toContain("BRANCH_A_NOT_B");
      expect(
        eval_(inst, [
          ["A", ""],
          ["B", ""]
        ])
      ).toContain("FALLBACK");
      expect(eval_(inst, [])).toContain("FALLBACK");
    });

    it("function macro expansion — SAMPLE(tex, coord) → textureLod(tex, coord, 0.0)", () => {
      const glsl = "#define SAMPLE(tex, coord) textureLod(tex, coord, 0.0)\nSAMPLE(myTex, uv)\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, []);
      expect(result).toContain("textureLod(myTex, uv, 0.0)");
    });

    it("circular macro reference — does not infinite loop (C preprocessor standard)", () => {
      // #define A B / #define B A → expanding A should terminate, not loop forever
      const glsl = "#define A B\n#define B A\nA\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, []);
      // Should terminate with either "A" or "B", not hang
      expect(result.trim().length).toBeGreaterThan(0);
    });

    it("indirect circular reference through 3 macros — terminates safely", () => {
      const glsl = "#define X Y\n#define Y Z\n#define Z X\nX\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, []);
      expect(result.trim().length).toBeGreaterThan(0);
    });

    // ── GLSL/C99 standard conformance: immediate expansion with current macro state ──

    it("#define value macro then #undef — text before #undef should be expanded", () => {
      const glsl = "#define FOO 1.0\nvec3 a = FOO;\n#undef FOO\nvec3 b = FOO;\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, []);
      expect(result).toContain("vec3 a = 1.0");
      expect(result).toContain("vec3 b = FOO");
    });

    it("#define value macro then redefine — each usage gets the value at that point", () => {
      const glsl = "#define FOO 1.0\nvec3 a = FOO;\n#define FOO 2.0\nvec3 b = FOO;\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, []);
      expect(result).toContain("vec3 a = 1.0");
      expect(result).toContain("vec3 b = 2.0");
    });

    it("#define value macro then #define no-value — text before should be expanded", () => {
      const glsl = "#define FOO 1.0\nvec3 a = FOO;\n#define FOO\nvec3 b = FOO;\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, []);
      expect(result).toContain("vec3 a = 1.0");
      expect(result).not.toContain("vec3 b = 1.0");
    });

    it("engine-passed value macro then #undef — text before #undef should be expanded", () => {
      const glsl = "vec3 a = FOO;\n#undef FOO\nvec3 b = FOO;\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, [["FOO", "1"]]);
      expect(result).toContain("vec3 a = 1");
      expect(result).toContain("vec3 b = FOO");
    });

    it("function macro then #undef — invocation before #undef should be expanded", () => {
      const glsl = "#define MUL(a,b) a*b\nvec3 c = MUL(x,y);\n#undef MUL\nvec3 d = MUL(x,y);\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, []);
      expect(result).toContain("vec3 c = x*y");
      expect(result).toContain("vec3 d = MUL(x,y)");
    });

    it("function macro redefine — each invocation gets definition at that point", () => {
      const glsl = "#define F(x) x+1\nvec3 a = F(v);\n#define F(x) x*2\nvec3 b = F(v);\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, []);
      expect(result).toContain("vec3 a = v+1");
      expect(result).toContain("vec3 b = v*2");
    });

    it("multi-level nested macro expansion — expands correctly", () => {
      const glsl = [
        "#define TRANSFORM_UV(uv) APPLY_TILING(uv, offset)",
        "#define APPLY_TILING(uv, to) ((uv) * (to).xy)",
        "TRANSFORM_UV(v_uv)",
        ""
      ].join("\n");
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, []);
      expect(result).toContain("((v_uv) * (offset).xy)");
    });

    it("conditional #define then #ifdef — with and without triggering macros", () => {
      const glsl = [
        "#if defined(SCENE_SHADOW_TYPE) && defined(RENDERER_IS_RECEIVE_SHADOWS)",
        "  #define SCENE_IS_CALCULATE_SHADOWS",
        "#endif",
        "#ifdef SCENE_IS_CALCULATE_SHADOWS",
        "SHADOW_CODE",
        "#else",
        "NO_SHADOW",
        "#endif",
        ""
      ].join("\n");
      const inst = ShaderInstructionEncoder.parse(glsl);
      // Both macros present → conditional define triggers → shadow code active
      expect(
        eval_(inst, [
          ["SCENE_SHADOW_TYPE", "1"],
          ["RENDERER_IS_RECEIVE_SHADOWS", ""]
        ])
      ).toContain("SHADOW_CODE");
      // Only one macro → conditional define doesn't trigger → no shadow
      expect(eval_(inst, [["SCENE_SHADOW_TYPE", "1"]])).toContain("NO_SHADOW");
      // No macros → no shadow
      expect(eval_(inst, [])).toContain("NO_SHADOW");
    });

    it("3-way #elif == chain — correct branch for each value", () => {
      const glsl = [
        "#if SCENE_FOG_MODE == 1",
        "LINEAR_FOG",
        "#elif SCENE_FOG_MODE == 2",
        "EXP_FOG",
        "#elif SCENE_FOG_MODE == 3",
        "EXP2_FOG",
        "#endif",
        ""
      ].join("\n");
      const inst = ShaderInstructionEncoder.parse(glsl);
      expect(eval_(inst, [["SCENE_FOG_MODE", "1"]])).toContain("LINEAR_FOG");
      expect(eval_(inst, [["SCENE_FOG_MODE", "2"]])).toContain("EXP_FOG");
      expect(eval_(inst, [["SCENE_FOG_MODE", "3"]])).toContain("EXP2_FOG");
      // No match — none of the branches taken
      expect(eval_(inst, [["SCENE_FOG_MODE", "99"]])).not.toContain("FOG");
      expect(eval_(inst, [])).not.toContain("FOG");
    });

    it("same macro redefined in different branches — WebGL2 vs WebGL1", () => {
      const glsl = [
        "#ifdef GRAPHICS_API_WEBGL2",
        "  #define SAMPLE(tex, coord) textureLod(tex, coord, 0.0)",
        "#else",
        "  #define SAMPLE(tex, coord) texture2D(tex, coord)",
        "#endif",
        "SAMPLE(myTex, uv)",
        ""
      ].join("\n");
      const inst = ShaderInstructionEncoder.parse(glsl);
      const webgl2 = eval_(inst, [["GRAPHICS_API_WEBGL2", ""]]);
      const webgl1 = eval_(inst, []);
      expect(webgl2).toContain("textureLod(myTex, uv, 0.0)");
      expect(webgl2).not.toContain("texture2D");
      expect(webgl1).toContain("texture2D(myTex, uv)");
      expect(webgl1).not.toContain("textureLod");
    });

    it("deep nesting evaluation — 4-level nesting with different macro combos", () => {
      const glsl = [
        "#ifdef L1",
        "L1_START",
        "#ifdef L2",
        "L2_START",
        "#ifdef L3",
        "L3_START",
        "#ifdef L4",
        "L4_BODY",
        "#else",
        "L4_ELSE",
        "#endif",
        "L3_END",
        "#endif",
        "L2_END",
        "#endif",
        "L1_END",
        "#endif",
        ""
      ].join("\n");
      const inst = ShaderInstructionEncoder.parse(glsl);
      // All four levels defined
      const all = eval_(inst, [
        ["L1", ""],
        ["L2", ""],
        ["L3", ""],
        ["L4", ""]
      ]);
      expect(all).toContain("L4_BODY");
      expect(all).not.toContain("L4_ELSE");
      // L1-L3 defined, L4 not
      const noL4 = eval_(inst, [
        ["L1", ""],
        ["L2", ""],
        ["L3", ""]
      ]);
      expect(noL4).toContain("L4_ELSE");
      expect(noL4).not.toContain("L4_BODY");
      // Only L1
      const onlyL1 = eval_(inst, [["L1", ""]]);
      expect(onlyL1).toContain("L1_START");
      expect(onlyL1).toContain("L1_END");
      expect(onlyL1).not.toContain("L2_START");
      // Nothing
      expect(eval_(inst, [])).not.toContain("L1_START");
    });

    it("identity function macro — #define F(x) x → F(someValue) → someValue", () => {
      const glsl = "#define F(x) x\nF(someValue)\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, []);
      expect(result).toContain("someValue");
    });

    it("#define with complex expression body expands correctly", () => {
      const glsl = "#define RAYLEIGH (mix(0.0, 0.025, pow(x, 2.5)))\nfloat r = RAYLEIGH;\n";
      const inst = ShaderInstructionEncoder.parse(glsl);
      const result = eval_(inst, []);
      expect(result).toContain("(mix(0.0, 0.025, pow(x, 2.5)))");
      expect(result).not.toContain("RAYLEIGH");
    });
  });

  // ─────────────────────────────────────────────────────────
  // 4. evaluateShaderInstructions consistency
  // ─────────────────────────────────────────────────────────
  describe("evaluateShaderInstructions consistency", () => {
    // Note: This first test is a self-check (idempotency) — it verifies that calling
    // evaluateShaderInstructions twice with the same inputs produces identical output.
    it("evaluateShaderInstructions is deterministic (same input → same output)", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);

      const macroCombinations: Array<Array<[string, string]>> = [
        [],
        [["RENDERER_IS_RECEIVE_SHADOWS", ""]],
        [["XX_Macro", ""]]
      ];

      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass || !pass.fragmentShaderInstructions) continue;

          for (const macros of macroCombinations) {
            const first = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, makeMacroMap(macros));
            const second = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, makeMacroMap(macros));
            expect(first).toBe(second);
          }
        }
      }
    });

    it("evaluateShaderInstructions output survives JSON round-trip of instructions", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);

      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass || !pass.fragmentShaderInstructions) continue;

          const macros = makeMacroMap([["RENDERER_IS_RECEIVE_SHADOWS", ""]]);
          const original = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros);
          const restored = JSON.parse(JSON.stringify(pass.fragmentShaderInstructions));
          const fromRestored = ShaderMacroProcessor.evaluate(restored, macros);
          expect(fromRestored).toBe(original);
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────
  // 5. ShaderCompiler._precompile()
  // ─────────────────────────────────────────────────────────
  describe("ShaderCompiler._precompile()", () => {
    it("should produce valid IPrecompiledShader from PBR source", () => {
      const precompiled = shaderCompiler._precompile(PBRSource, ShaderLanguage.GLSLES100);

      expect(typeof precompiled.name).toBe("string");
      expect(precompiled.name.length).toBeGreaterThan(0);
      expect(precompiled.platformTarget).toBe(ShaderLanguage.GLSLES100);
      expect(precompiled.subShaders.length).toBeGreaterThan(0);
    });

    it("precompiled output should match live compilation for each pass", () => {
      const precompiled = shaderCompiler._precompile(PBRSource, ShaderLanguage.GLSLES100);
      const liveSource = shaderCompiler._parseShaderSource(PBRSource);

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
            const liveProgram = shaderCompiler._parseShaderPass(
              livePass.contents,
              livePass.vertexEntry,
              livePass.fragmentEntry,
              ShaderLanguage.GLSLES100
            );
            // Both paths produce instructions from the same CodeGen output
            expect(precompiledPass.vertexShaderInstructions).toEqual(liveProgram.vertexShaderInstructions);
            expect(precompiledPass.fragmentShaderInstructions).toEqual(liveProgram.fragmentShaderInstructions);
          }
        }
      }
    });

    it("output should survive JSON round-trip", () => {
      const precompiled = shaderCompiler._precompile(PBRSource, ShaderLanguage.GLSLES100);
      const restored = JSON.parse(JSON.stringify(precompiled)) as IPrecompiledShader;
      expect(restored.name).toBe(precompiled.name);
      expect(restored.subShaders.length).toBe(precompiled.subShaders.length);
    });

    it("output should survive JSON stringify → parse round-trip", () => {
      const precompiled = shaderCompiler._precompile(PBRSource, ShaderLanguage.GLSLES100);
      const restored: IPrecompiledShader = JSON.parse(JSON.stringify(precompiled));

      for (let i = 0; i < precompiled.subShaders.length; i++) {
        for (let j = 0; j < precompiled.subShaders[i].passes.length; j++) {
          const orig = precompiled.subShaders[i].passes[j];
          const rest = restored.subShaders[i].passes[j];
          expect(rest.vertexShaderInstructions).toEqual(orig.vertexShaderInstructions);
          expect(rest.fragmentShaderInstructions).toEqual(orig.fragmentShaderInstructions);
        }
      }
    });

    it("simple shader (noFragArgs) → instructions should be single TEXT", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);

      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          // No-macro shaders should have single TEXT instruction
          expect(pass.vertexShaderInstructions!.length).toBe(1);
          expect(pass.vertexShaderInstructions![0][0]).toBe(0);
          expect(pass.fragmentShaderInstructions!.length).toBe(1);
          expect(pass.fragmentShaderInstructions![0][0]).toBe(0);
        }
      }
    });

    it("macro-heavy shader → instructions with conditionals", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);

      let foundMacroPass = false;
      for (const subShader of precompiled.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          if (pass.fragmentShaderInstructions && pass.fragmentShaderInstructions.length > 1) {
            foundMacroPass = true;
            // Should contain conditional opcodes
            const ops = pass.fragmentShaderInstructions.map((i) => i[0]);
            expect(ops.some((o) => (o as number) >= 1 && (o as number) <= 4)).toBe(true); // IF_DEF/IF_NDEF/IF_CMP/IF_EXPR
          }
        }
      }
      expect(foundMacroPass).toBe(true);
    });

    it("multi-pass shader → renderStates have constantMap entries (BlendState)", async () => {
      const source = await readFile("./shaders/multi-pass.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);

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
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);

      const allPasses = precompiled.subShaders.flatMap((s) => s.passes);
      const usePasses = allPasses.filter((p) => p.isUsePass);
      const regularPasses = allPasses.filter((p) => !p.isUsePass);

      expect(usePasses.length).toBeGreaterThan(0);
      expect(regularPasses.length).toBeGreaterThan(0);

      for (const p of usePasses) {
        expect(p.vertexShaderInstructions).toBeUndefined();
        expect(p.fragmentShaderInstructions).toBeUndefined();
      }
    });

    it("GLSLES300 platformTarget is preserved in output", () => {
      const precompiled = shaderCompiler._precompile(PBRSource, ShaderLanguage.GLSLES300);
      expect(precompiled.platformTarget).toBe(ShaderLanguage.GLSLES300);
    });

    // Numeric literal coverage. `shaders/numeric-literals.shader` exercises
    // every form from GLSL ES 3.00 §4.1.3 (integer constants) and §4.1.4
    // (floating-point constants) — decimal/hex ints with optional `u`/`U`,
    // float decimal/exponent variants with optional `f`/`F`, plus the
    // Hammersley `radicalInverse_VdC` bit twiddle (from
    // `galacean-tools/baker/IBLBaker.shader`) so `<<`/`>>` are covered too.
    it("preserves every GLSL ES 3.00 numeric literal form", async () => {
      const source = await readFile("./shaders/numeric-literals.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES300);
      const pass = precompiled.subShaders[0].passes[0];
      const text = [
        ...((pass.vertexShaderInstructions as ShaderInstruction[]) ?? []),
        ...((pass.fragmentShaderInstructions as ShaderInstruction[]) ?? [])
      ]
        .filter((i) => i[0] === 0)
        .map((i) => i[1])
        .join("");

      for (const literal of [
        // §4.1.3 integers
        "42",
        "0",
        "123u",
        "5U",
        "0xFF",
        "0xFFu",
        "0xDEADBEEFu",
        "0XABCDu",
        "0xdeadbeefu",
        // §4.1.4 floats
        "1.5",
        "1.",
        ".5",
        "1e10",
        "1.5E-3",
        ".5e+2",
        "2e+3",
        "1.5f",
        ".5F",
        "1.f",
        "1e10f",
        "5f",
        "100F",
        // Bit operators on uint (frag body)
        "0x55555555u",
        "0xAAAAAAAAu",
        "<<",
        ">>"
      ]) {
        expect(text, `missing literal: ${literal}`).toContain(literal);
      }
    });

    it("subShader tags are preserved", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);

      const sub = precompiled.subShaders[0];
      expect(sub.tags).toBeDefined();
      expect(sub.tags!["LightMode"]).toBe("ForwardBase");
    });

    it("pass tags are preserved", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);

      const pass = precompiled.subShaders[0].passes[0];
      expect(pass.tags).toBeDefined();
      expect(pass.tags!["ReplacementTag"]).toBe("opaque");
    });
  });

  // After LALR enforces shift on `macro_call_symbol . '('`, the visitor at
  // `K(args)` must distinguish three callee kinds derived from the macro's
  // replacement and apply IO-struct formal flattening only when the callee is
  // a user-declared function. Earlier the filter ran for every object-like
  // macro and silently dropped member-access / literal args (e.g. emitting
  // `vec3()` from `MyVec3(attr.POSITION.x, attr.POSITION.y, attr.POSITION.z)`).
  describe("MacroCallFunction calleeKind-aware arg filtering", () => {
    let evaluated: string;
    beforeAll(async () => {
      const source = await readFile("./shaders/macro-as-type-args.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);
      const vi = precompiled.subShaders[0].passes[0].vertexShaderInstructions ?? [];
      evaluated = ShaderMacroProcessor.evaluate(vi as any, new Map());
    });

    // (1) builtin type alias: constructor call, no formal flattening
    it("builtin type alias keeps member-access args", () => {
      // After flatten, `attr.POSITION.x/y/z` → `POSITION.x/y/z`.
      expect(evaluated).toMatch(/vec3\s*\(\s*POSITION\.x\s*,\s*POSITION\.y\s*,\s*POSITION\.z\s*\)/);
    });
    it("builtin type alias keeps literal args", () => {
      expect(evaluated).toMatch(/vec3\s*\(\s*0\.1\s*,\s*0\.2\s*,\s*0\.3\s*\)/);
    });
    it("builtin type alias never emits an empty constructor call", () => {
      // Defends against the original bug where every arg was filtered.
      expect(evaluated).not.toMatch(/vec3\s*\(\s*\)/);
    });

    // (2) builtin function alias: args are values, no flattening
    it("builtin function alias keeps all args verbatim", () => {
      expect(evaluated).toMatch(/mix\s*\(\s*v_member\s*,\s*v_literal\s*,\s*0\.5\s*\)/);
    });

    // (3) user-fn alias: formal flattening DOES apply — bare IO-struct arg
    //     must be dropped so the call site matches the flattened signature.
    it("user-fn alias drops bare IO-struct arg paired with flattened formal", () => {
      // `computeColor(Attributes a)` flattens to `computeColor()` and call
      // becomes `computeColor()` (the `attr` arg drops).
      expect(evaluated).toMatch(/computeColor\s*\(\s*\)/);
      // The macro name `MyHelper` should still appear in the macro define
      // table (the directive itself), but never as `MyHelper(attr)` text.
      expect(evaluated).not.toMatch(/MyHelper\s*\(\s*attr\s*\)/);
    });
  });

  // ─────────────────────────────────────────────────────────
  // 6. Shader._createFromPrecompiled()
  // ─────────────────────────────────────────────────────────
  describe("Shader._createFromPrecompiled()", () => {
    it("should create Shader with correct name and subShader count", () => {
      const precompiled = shaderCompiler._precompile(PBRSource, ShaderLanguage.GLSLES100);
      const testData = { ...precompiled, name: "TestPBR_CFP_1" };
      const shader = Shader._createFromPrecompiled(testData);

      expect(shader).not.toBeNull();
      expect(shader.name).toBe("TestPBR_CFP_1");
      expect(shader.subShaders.length).toBe(testData.subShaders.length);

      shader.destroy(true);
    });

    it("platformTarget is set on each ShaderPass", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);
      const testData = { ...precompiled, name: "TestNoFrag_CFP_PlatformTarget" };
      const shader = Shader._createFromPrecompiled(testData);

      for (const sub of shader.subShaders) {
        for (const pass of sub.passes) {
          // @ts-ignore
          expect(pass._platformTarget).toBe(ShaderLanguage.GLSLES100);
        }
      }

      shader.destroy(true);
    });

    it("_vertexShaderInstructions / _fragmentShaderInstructions are set correctly", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);
      const testData = { ...precompiled, name: "TestNoFrag_CFP_ShaderInstructions" };
      const shader = Shader._createFromPrecompiled(testData);

      for (const sub of shader.subShaders) {
        for (const pass of sub.passes) {
          // @ts-ignore
          expect(pass._vertexShaderInstructions).toBeDefined();
          // @ts-ignore
          expect(pass._fragmentShaderInstructions).toBeDefined();
        }
      }

      shader.destroy(true);
    });

    it("_vertexShaderInstructions populated for macro-heavy shader", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);
      const testData = { ...precompiled, name: "TestMacroPre_CFP_ShaderInstructions" };
      const shader = Shader._createFromPrecompiled(testData);

      let foundShaderInstructions = false;
      for (const sub of shader.subShaders) {
        for (const pass of sub.passes) {
          // @ts-ignore
          if (pass._fragmentShaderInstructions && pass._fragmentShaderInstructions.length > 1) {
            foundShaderInstructions = true;
            // @ts-ignore
            expect(Array.isArray(pass._fragmentShaderInstructions)).toBe(true);
          }
        }
      }
      expect(foundShaderInstructions).toBe(true);

      shader.destroy(true);
    });

    it("SubShader tags are preserved after _createFromPrecompiled", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);
      const testData = { ...precompiled, name: "TestMacroPre_CFP_Tags" };
      const shader = Shader._createFromPrecompiled(testData);

      const sub = shader.subShaders[0];
      expect(sub.getTagValue("LightMode")).toBe("ForwardBase");

      shader.destroy(true);
    });

    it("ShaderPass tags are preserved after _createFromPrecompiled", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);
      const testData = { ...precompiled, name: "TestNoFrag_CFP_PassTags" };
      const shader = Shader._createFromPrecompiled(testData);

      const pass = shader.subShaders[0].passes[0];
      expect(pass.getTagValue("ReplacementTag")).toBe("opaque");

      shader.destroy(true);
    });

    it("duplicate shader name → returns existing shader (no re-registration)", () => {
      const precompiled = shaderCompiler._precompile(PBRSource, ShaderLanguage.GLSLES100);
      const testData = { ...precompiled, name: "TestPBR_CFP_Duplicate" };

      const first = Shader._createFromPrecompiled(testData);
      const second = Shader._createFromPrecompiled(testData);

      expect(second).toBeFalsy();

      first.destroy(true);
    });

    it("UsePass in multi-pass shader is handled without throwing", async () => {
      const source = await readFile("./shaders/multi-pass.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);
      const testData = { ...precompiled, name: "TestMultiPass_CFP_UsePass" };

      expect(() => Shader._createFromPrecompiled(testData)).not.toThrow();

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
        const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);
        const liveSource = shaderCompiler._parseShaderSource(source);

        for (let i = 0; i < liveSource.subShaders.length; i++) {
          const liveSub = liveSource.subShaders[i];
          for (let j = 0; j < liveSub.passes.length; j++) {
            const livePass = liveSub.passes[j];
            if (livePass.isUsePass) continue;

            const liveProgram = shaderCompiler._parseShaderPass(
              livePass.contents,
              livePass.vertexEntry,
              livePass.fragmentEntry,
              ShaderLanguage.GLSLES100
            );

            const precompiledPass = precompiled.subShaders[i].passes[j];
            // Compare instructions directly — both paths use parseShaderInstructions on the same CodeGen output
            expect(precompiledPass.vertexShaderInstructions).toEqual(liveProgram.vertexShaderInstructions);
            expect(precompiledPass.fragmentShaderInstructions).toEqual(liveProgram.fragmentShaderInstructions);
          }
        }
      });
    }

    it("GLSLES300 precompile output matches GLSLES300 live compilation", async () => {
      const source = await readFile("./shaders/noFragArgs.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES300);
      const liveSource = shaderCompiler._parseShaderSource(source);

      for (let i = 0; i < liveSource.subShaders.length; i++) {
        for (let j = 0; j < liveSource.subShaders[i].passes.length; j++) {
          const livePass = liveSource.subShaders[i].passes[j];
          if (livePass.isUsePass) continue;
          const liveProgram = shaderCompiler._parseShaderPass(
            livePass.contents,
            livePass.vertexEntry,
            livePass.fragmentEntry,
            ShaderLanguage.GLSLES300
          );
          expect(precompiled.subShaders[i].passes[j].vertexShaderInstructions).toEqual(liveProgram.vertexShaderInstructions);
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────
  // 8. Performance
  // ─────────────────────────────────────────────────────────
  describe("Performance", () => {
    it("JSON.parse should be faster than _precompile", () => {
      const warmup = shaderCompiler._precompile(PBRSource, ShaderLanguage.GLSLES100);
      const jsonStr = JSON.stringify(warmup);

      const RUNS = 5;
      const compileStart = performance.now();
      for (let i = 0; i < RUNS; i++) {
        shaderCompiler._precompile(PBRSource, ShaderLanguage.GLSLES100);
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

    it("evaluateShaderInstructions is fast on macro-heavy shader", async () => {
      const source = await readFile("./shaders/macro-pre.shader");
      const precompiled = shaderCompiler._precompile(source, ShaderLanguage.GLSLES100);

      let fragmentShaderInstructions: ShaderInstruction[] | undefined;
      for (const sub of precompiled.subShaders) {
        for (const pass of sub.passes) {
          if (!pass.isUsePass && pass.fragmentShaderInstructions && pass.fragmentShaderInstructions.length > 1) {
            fragmentShaderInstructions = pass.fragmentShaderInstructions;
          }
        }
      }

      if (!fragmentShaderInstructions) {
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
        ShaderMacroProcessor.evaluate(fragmentShaderInstructions, makeMacroMap(macros));
      }
      const evalTime = (performance.now() - evalStart) / RUNS;

      console.log(`[Perf] evaluateShaderInstructions avg: ${evalTime.toFixed(3)}ms`);
      expect(evalTime).toBeLessThan(5); // should be sub-ms
    });
  });
});
