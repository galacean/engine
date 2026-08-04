import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderInstructionEncoder } from "@galacean/engine-shader-compiler/src/ShaderInstructionEncoder";
import {
  parsePreprocessorCondition,
  ShaderSourceParser,
  type PreprocessorCondition
} from "@galacean/engine-shader-parser/internal";
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

const malformedExpressions = ["123 defined(USE)", "defined()", "USE &&", "!", "USE || || OTHER"] as const;

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

function evaluateNativeCondition(
  expression: string,
  macros: readonly (readonly [string, string])[]
): { supported: true; firstArm: boolean } | { supported: false; log: string } | "no-webgl" {
  const macroNames = new Set(macros.map(([name]) => name));
  const normalizedExpression = expression
    .replace(
      /\bdefined\s*(?:\(\s*([A-Za-z_]\w*)\s*\)|([A-Za-z_]\w*))/g,
      (_match, parenthesized: string | undefined, bare: string | undefined) =>
        macroNames.has(parenthesized ?? bare!) ? "1" : "0"
    )
    .replace(/\b[A-Za-z_]\w*\b/g, (name) => (macroNames.has(name) ? name : "0"));
  const definitions = macros.map(([name, value]) => `#define ${name} ${value}`).join("\n");
  const invalidDeclaration = "float native_condition_selected_the_wrong_arm = ;";
  const compileProbe = (firstArm: boolean) =>
    compileInWebGL(
      "void main() { gl_Position = vec4(0.0); }",
      `${definitions}
#if ${normalizedExpression}
${firstArm ? "const float native_condition_value = 1.0;" : invalidDeclaration}
#else
${firstArm ? invalidDeclaration : "const float native_condition_value = 0.0;"}
#endif
void main() { gl_FragColor = vec4(native_condition_value); }`
    );
  const firstProbe = compileProbe(true);
  if (firstProbe === "no-webgl") return firstProbe;
  if (firstProbe.ok) return { supported: true, firstArm: true };
  const secondProbe = compileProbe(false);
  if (secondProbe === "no-webgl") return secondProbe;
  if (secondProbe.ok) return { supported: true, firstArm: false };
  return { supported: false, log: `first=${firstProbe.log} second=${secondProbe.log}` };
}

describe("preprocessor condition conformance", () => {
  for (const conditionCase of conditionCases) {
    it(`${conditionCase.name}: fast parser, analyzer, runtime, and WebGL agree`, () => {
      expect(parsePreprocessorCondition(conditionCase.expression)).to.have.property("t", conditionCase.root);

      const source = shader(conditionCase.expression);
      const result = new ShaderAnalyzer().analyze(source);
      expect(result.diagnostics).to.be.empty;
      const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
      const generated = new ShaderCompiler()._parseShaderPass(
        pass.contents,
        pass.vertexEntry,
        pass.fragmentEntry,
        ShaderLanguage.GLSLES100,
        ""
      );
      expect(generated).to.not.be.undefined;
      expect(generated!.vertexShaderInstructions).to.not.be.undefined;
      expect(generated!.fragmentShaderInstructions).to.not.be.undefined;

      for (const configuration of conditionCase.configurations) {
        const native = evaluateNativeCondition(conditionCase.expression, configuration.macros);
        if (native !== "no-webgl") {
          expect(native.supported, native.supported ? "" : native.log).to.be.true;
          if (native.supported) expect(native.firstArm).to.equal(configuration.firstArm);
        }

        const macros = new Map(configuration.macros);
        const vertex = ShaderMacroProcessor.evaluate(generated!.vertexShaderInstructions!, macros);
        const fragment = ShaderMacroProcessor.evaluate(
          generated!.fragmentShaderInstructions!,
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

  for (const [expression, macros, firstArm] of [
    [
      "A + B > 1",
      [
        ["A", "1"],
        ["B", "1"]
      ],
      true
    ],
    [
      "A + B > 1",
      [
        ["A", "0"],
        ["B", "1"]
      ],
      false
    ],
    ["(MASK & 3) == 2", [["MASK", "6"]], true],
    [
      "A ? B : C",
      [
        ["A", "0"],
        ["B", "0"],
        ["C", "1"]
      ],
      true
    ],
    [
      "((A == B || A == C))",
      [
        ["A", "2"],
        ["B", "1"],
        ["C", "2"]
      ],
      true
    ],
    ["(MASK >> 1) == 3", [["MASK", "6"]], true],
    ["(~MASK & 0xffu) != 0", [["MASK", "255"]], false],
    ["0xffffffffu + 1u == 0u", [], true],
    ["-1 < 1u", [], true],
    ["0xffffffffu > 0u", [], false],
    ["2147483648", [], true],
    ["MODE == 2147483648", [["MODE", "2147483648"]], true],
    [
      "A && (10 / B)",
      [
        ["A", "0"],
        ["B", "0"]
      ],
      false
    ],
    [
      "A ? (10 / B) : C",
      [
        ["A", "0"],
        ["B", "0"],
        ["C", "1"]
      ],
      true
    ],
    [
      "FIRST SECOND == 22",
      [
        ["FIRST", "17"],
        ["SECOND", "+ 5"]
      ],
      true
    ]
  ] as const) {
    it(`evaluates full preprocessor expression '${expression}' through codegen and WebGL`, () => {
      expect(() => parsePreprocessorCondition(expression)).to.throw();
      const native = evaluateNativeCondition(expression, macros);
      if (native !== "no-webgl" && !expression.includes("?")) {
        expect(native.supported, native.supported ? "" : native.log).to.be.true;
        if (native.supported) expect(native.firstArm).to.equal(firstArm);
      }

      const source = shader(expression);
      const diagnostics = new ShaderAnalyzer().analyze(source).diagnostics;
      expect(diagnostics.filter((diagnostic) => diagnostic.severity === "error")).to.be.empty;

      const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
      const generated = new ShaderCompiler()._parseShaderPass(
        pass.contents,
        pass.vertexEntry,
        pass.fragmentEntry,
        ShaderLanguage.GLSLES100,
        ""
      );
      expect(generated).to.not.be.undefined;

      const vertex = ShaderMacroProcessor.evaluate(generated!.vertexShaderInstructions!, new Map(macros));
      const fragment = ShaderMacroProcessor.evaluate(generated!.fragmentShaderInstructions!, new Map(macros));
      const selectedArm = firstArm ? "1.0" : "2.0";
      const otherArm = firstArm ? "2.0" : "1.0";
      expect(fragment.match(/uniform\s+float\s+u_value\s*;/g)).to.have.lengthOf(1);
      expect(fragment).to.contain(`const float u_selectedArm = ${selectedArm};`);
      expect(fragment).not.to.contain(`const float u_selectedArm = ${otherArm};`);

      const webgl = compileInWebGL(vertex, fragment);
      if (webgl !== "no-webgl") expect(webgl.ok, webgl.log).to.be.true;
    });
  }

  for (const expression of [...malformedExpressions, "1.5"] as const) {
    it(`diagnoses malformed expression '${expression}' without making encoding a diagnostic gate`, () => {
      expect(() => parsePreprocessorCondition(expression)).to.throw("Unsupported or malformed preprocessor condition");
      const instructions = ShaderInstructionEncoder.parse(`#if ${expression}\nBODY\n#endif\n`);

      const result = new ShaderAnalyzer().analyze(shader(expression));
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("PreprocessorError");
      expect(() => ShaderMacroProcessor.evaluate(instructions, new Map())).to.throw("Invalid preprocessor expression");
    });
  }
});
