import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderInstructionEncoder } from "@galacean/engine-shader-compiler/src/ShaderInstructionEncoder";
import { parsePreprocessorCondition, type PreprocessorCondition } from "@galacean/engine-shader-parser";
import { describe, expect, it } from "vitest";

interface MacroConfiguration {
  macros: Array<[string, string]>;
  firstArm: boolean;
}

interface ConditionCase {
  name: string;
  expression: string;
  root: PreprocessorCondition["t"];
  configurations: MacroConfiguration[];
}

const conditionCases: readonly ConditionCase[] = [
  {
    name: "defined macro",
    expression: "defined(USE)",
    root: "def",
    configurations: [
      { macros: [], firstArm: false },
      { macros: [["USE", "0"]], firstArm: true },
      { macros: [["USE", "1"]], firstArm: true }
    ]
  },
  {
    name: "bare macro numeric value",
    expression: "USE",
    root: "cmp",
    configurations: [
      { macros: [], firstArm: false },
      { macros: [["USE", "0"]], firstArm: false },
      { macros: [["USE", "1"]], firstArm: true },
      { macros: [["USE", "-2"]], firstArm: true }
    ]
  },
  {
    name: "numeric equality",
    expression: "MODE == 1",
    root: "cmp",
    configurations: [
      { macros: [], firstArm: false },
      { macros: [["MODE", "0"]], firstArm: false },
      { macros: [["MODE", "1"]], firstArm: true },
      { macros: [["MODE", "2"]], firstArm: false }
    ]
  },
  {
    name: "numeric inequality",
    expression: "MODE != 0",
    root: "cmp",
    configurations: [
      { macros: [], firstArm: false },
      { macros: [["MODE", "0"]], firstArm: false },
      { macros: [["MODE", "1"]], firstArm: true },
      { macros: [["MODE", "-1"]], firstArm: true }
    ]
  },
  {
    name: "defined and numeric conjunction",
    expression: "defined(A) && B",
    root: "and",
    configurations: [
      { macros: [], firstArm: false },
      {
        macros: [
          ["A", "1"],
          ["B", "0"]
        ],
        firstArm: false
      },
      {
        macros: [
          ["A", "1"],
          ["B", "2"]
        ],
        firstArm: true
      }
    ]
  },
  {
    name: "mixed precedence",
    expression: "defined(A) || defined(B) && MODE > 1",
    root: "or",
    configurations: [
      { macros: [], firstArm: false },
      {
        macros: [
          ["B", "1"],
          ["MODE", "1"]
        ],
        firstArm: false
      },
      {
        macros: [
          ["B", "1"],
          ["MODE", "2"]
        ],
        firstArm: true
      },
      { macros: [["A", "0"]], firstArm: true }
    ]
  },
  {
    name: "nested negation",
    expression: "!(defined(A) && MODE == 0)",
    root: "not",
    configurations: [
      { macros: [], firstArm: true },
      {
        macros: [
          ["A", "1"],
          ["MODE", "0"]
        ],
        firstArm: false
      },
      {
        macros: [
          ["A", "1"],
          ["MODE", "1"]
        ],
        firstArm: true
      }
    ]
  },
  {
    name: "hexadecimal literal",
    expression: "MODE == 0x10",
    root: "cmp",
    configurations: [
      { macros: [], firstArm: false },
      { macros: [["MODE", "15"]], firstArm: false },
      { macros: [["MODE", "16"]], firstArm: true }
    ]
  }
];

const malformedExpressions = [
  "123 defined(USE)",
  "defined()",
  "defined(USE",
  "USE &&",
  "(USE",
  "USE OTHER",
  "USE == OTHER",
  "!",
  "USE || || OTHER"
] as const;

function shader(condition: string): string {
  return `Shader "preprocessor-condition-conformance" { SubShader "s" { Pass "p" {
#if ${condition}
float u_value;
const float u_selectedArm = 1.0;
#elif !(${condition})
float u_value;
const float u_selectedArm = 2.0;
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(u_value * u_selectedArm); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
}

function compileInWebGL(vertex: string, fragment: string): { ok: boolean; log: string } | "no-webgl" {
  const gl = document.createElement("canvas").getContext("webgl");
  if (!gl) return "no-webgl";

  const compile = (source: string, type: number): { ok: boolean; log: string } => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, type === gl.FRAGMENT_SHADER ? `precision mediump float;\n${source}` : source);
    gl.compileShader(shader);
    return { ok: gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean, log: gl.getShaderInfoLog(shader) || "" };
  };

  const vertexResult = compile(vertex, gl.VERTEX_SHADER);
  const fragmentResult = compile(fragment, gl.FRAGMENT_SHADER);
  return {
    ok: vertexResult.ok && fragmentResult.ok,
    log: `vertex=${vertexResult.log} fragment=${fragmentResult.log}`
  };
}

describe("preprocessor condition conformance", () => {
  for (const conditionCase of conditionCases) {
    it(`${conditionCase.name}: parser, analyzer, encoder, and WebGL agree`, () => {
      expect(parsePreprocessorCondition(conditionCase.expression)).to.have.property("t", conditionCase.root);

      const result = new ShaderAnalyzer().analyze(shader(conditionCase.expression));
      expect(result.diagnostics).to.be.empty;
      const pass = result.passes[0];
      expect(pass).to.not.be.undefined;

      const generated = new ShaderCompiler().generate(
        pass.program,
        pass.vertexEntry,
        pass.fragmentEntry,
        ShaderLanguage.GLSLES100
      );
      expect(generated.vertexShaderInstructions).to.not.be.undefined;
      expect(generated.fragmentShaderInstructions).to.not.be.undefined;

      for (const configuration of conditionCase.configurations) {
        const macros = new Map(configuration.macros);
        const vertex = ShaderMacroProcessor.evaluate(generated.vertexShaderInstructions!, macros);
        const fragment = ShaderMacroProcessor.evaluate(
          generated.fragmentShaderInstructions!,
          new Map(configuration.macros)
        );
        const selectedArm = configuration.firstArm ? "1.0" : "2.0";
        const otherArm = configuration.firstArm ? "2.0" : "1.0";
        expect(fragment.match(/uniform\s+float\s+u_value\s*;/g)).to.have.lengthOf(1);
        expect(fragment).to.contain(`const float u_selectedArm = ${selectedArm};`);
        expect(fragment).not.to.contain(`const float u_selectedArm = ${otherArm};`);

        const webgl = compileInWebGL(vertex, fragment);
        if (webgl !== "no-webgl") expect(webgl.ok, webgl.log).to.be.true;
      }
    });
  }

  for (const expression of malformedExpressions) {
    it(`rejects malformed expression '${expression}' before codegen`, () => {
      expect(() => parsePreprocessorCondition(expression)).to.throw("Unsupported or malformed preprocessor condition");
      expect(() => ShaderInstructionEncoder.parse(`#if ${expression}\nBODY\n#endif\n`)).to.throw(
        "Unsupported or malformed preprocessor condition"
      );

      const result = new ShaderAnalyzer().analyze(shader(expression));
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.deep.equal(["SyntaxError"]);
      expect(result.passes).to.be.empty;
    });
  }
});
