import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/src/ShaderPrecompiler";
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

const malformedExpressions = [
  "123 defined(USE)",
  "defined()",
  "USE &&",
  "!",
  "USE || || OTHER",
  "1uuu",
  "1value",
  "4294967296",
  "A ? B : C"
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
      const result = ShaderAnalyzer.analyze(source);
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

  for (const [expression, macros, firstArm, hasCompactBranchRepresentation = macros.length === 0] of [
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
    ["MODE == 2147483648", [["MODE", "2147483648"]], true, true],
    ["(-1 >> 1) == 2147483647", [], true],
    ["2147483647 + 1 == -2147483648", [], true],
    ["(-2147483648 - 1) == 2147483647", [], true],
    ["65536 * 65536 == 0", [], true],
    ["(-2147483648 / -1) == 2147483647", [], true],
    ["(-2147483648 % -1) == 0", [], true],
    [
      "A && (10 / B)",
      [
        ["A", "0"],
        ["B", "0"]
      ],
      false
    ],
    [
      "FIRST SECOND == 22",
      [
        ["FIRST", "17"],
        ["SECOND", "+ 5"]
      ],
      true
    ],
    [
      "CONNECT defined(FLAG)",
      [
        ["CONNECT", "1 &&"],
        ["FLAG", "1"]
      ],
      true
    ],
    ["OPEN 1)", [["OPEN", "("]], true]
  ] as const) {
    it(`evaluates full preprocessor expression '${expression}' through codegen and WebGL`, () => {
      if (hasCompactBranchRepresentation) expect(() => parsePreprocessorCondition(expression)).not.to.throw();
      else expect(() => parsePreprocessorCondition(expression)).to.throw();
      const native = evaluateNativeCondition(expression, macros);
      if (native !== "no-webgl") {
        expect(native.supported, native.supported ? "" : native.log).to.be.true;
        if (native.supported) expect(native.firstArm).to.equal(firstArm);
      }

      const source = shader(expression);
      const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
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

  for (const expression of [...malformedExpressions, "1.5", "1L", "1ll"] as const) {
    it(`blocks malformed expression '${expression}' before runtime variant selection`, () => {
      expect(() => parsePreprocessorCondition(expression)).to.throw("Unsupported or malformed preprocessor condition");
      expect(() => ShaderInstructionEncoder.parse(`#if ${expression}\nBODY\n#endif\n`)).to.throw();

      const result = ShaderAnalyzer.analyze(shader(expression));
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("PreprocessorError");
      const pass = ShaderSourceParser.parse(shader(expression)).subShaders[0].passes[0];
      expect(
        new ShaderCompiler()._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          ShaderLanguage.GLSLES100,
          ""
        )
      ).to.be.undefined;
    });
  }

  it("surfaces evaluator failures caused by the active macro configuration", () => {
    const instructions = ShaderInstructionEncoder.parse("#if VALUE / ZERO\nBODY\n#endif\n");
    expect(() =>
      ShaderMacroProcessor.evaluate(
        instructions,
        new Map([
          ["VALUE", "1"],
          ["ZERO", "0"]
        ])
      )
    ).to.throw("Division by zero in active preprocessor expression");
  });

  it.each([
    "1 / 0",
    "1 % 0",
    "1 << -1",
    "1 << 32",
    "1 >> -1",
    "1 >> 32",
    "EXTERNAL / 0",
    "EXTERNAL % 0",
    "EXTERNAL << 32",
    "EXTERNAL >> -1"
  ])(
    "blocks a definite evaluation failure before variant selection: %s",
    (expression) => {
      const native = evaluateNativeCondition(expression, []);
      if (native !== "no-webgl") expect(native.supported).to.be.false;
      expect(() => ShaderInstructionEncoder.parse(`#if ${expression}\nBODY\n#endif\n`)).to.throw();

      const source = shader(expression);
      const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
      expect(diagnostics.map((diagnostic) => diagnostic.code)).to.include("PreprocessorError");
      const diagnostic = diagnostics.find((candidate) => candidate.code === "PreprocessorError")!;
      expect(source.slice(diagnostic.range.start.offset, diagnostic.range.end.offset).trim()).to.equal(expression);
      const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
      expect(
        new ShaderCompiler()._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          ShaderLanguage.GLSLES100,
          ""
        )
      ).to.be.undefined;
      expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).to.throw();
    }
  );

  it("blocks a definite failure after expanding a source-defined macro", () => {
    const expression = "1 << SHIFT";
    const source = shader(expression).replace(`#if ${expression}`, `#define SHIFT 32\n#if ${expression}`);
    const native = evaluateNativeCondition(expression, [["SHIFT", "32"]]);
    if (native !== "no-webgl") expect(native.supported).to.be.false;

    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).to.include(
      "PreprocessorError"
    );
    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    expect(
      new ShaderCompiler()._parseShaderPass(
        pass.contents,
        pass.vertexEntry,
        pass.fragmentEntry,
        ShaderLanguage.GLSLES100,
        ""
      )
    ).to.be.undefined;
  });

  it.each([
    ["1 / 0", "VALUE + 0", "Division by zero"],
    ["4294967296", "VALUE + 0", "Integer literal exceeds 32 bits"],
    ["/", "1 VALUE 0", "Division by zero"]
  ])("blocks a definite source replacement failure: #define VALUE %s", (replacement, expression, message) => {
    const source = shader(expression).replace(`#if ${expression}`, `#define VALUE ${replacement}\n#if ${expression}`);
    const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
    expect(diagnostics.map((diagnostic) => diagnostic.code)).to.include("PreprocessorError");
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes(message))).to.be.true;
    const diagnostic = diagnostics.find((candidate) => candidate.message.includes(message))!;
    expect(source.slice(diagnostic.range.start.offset, diagnostic.range.end.offset).trim()).to.equal(expression);

    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    expect(
      new ShaderCompiler()._parseShaderPass(
        pass.contents,
        pass.vertexEntry,
        pass.fragmentEntry,
        ShaderLanguage.GLSLES100,
        ""
      )
    ).to.be.undefined;
    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).to.throw(message);
  });

  it.each([
    ["EXTERNAL && 1 / 0", "0", "1"],
    ["EXTERNAL || 1 / 0", "1", "0"]
  ])("defers a conditionally reachable source error to runtime: %s", (expression, safeValue, failingValue) => {
    const source = shader(expression);
    expect(ShaderAnalyzer.analyze(source).diagnostics).to.be.empty;

    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    const program = new ShaderCompiler()._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES100,
      ""
    );
    expect(program).not.to.be.undefined;
    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).not.to.throw();
    expect(() =>
      ShaderMacroProcessor.evaluate(program!.fragmentShaderInstructions!, new Map([["EXTERNAL", safeValue]]))
    ).not.to.throw();
    expect(() =>
      ShaderMacroProcessor.evaluate(program!.fragmentShaderInstructions!, new Map([["EXTERNAL", failingValue]]))
    ).to.throw("Division by zero");
  });

  it("rejects a source macro whose expanded integer literal exceeds 32 bits", () => {
    const instructions = ShaderInstructionEncoder.parse("#define VALUE 4294967296\n#if VALUE\nBODY\n#endif\n");
    expect(() => ShaderMacroProcessor.evaluate(instructions, new Map())).to.throw(
      "Integer literal exceeds 32 bits in preprocessor expression"
    );
  });

  it("rejects an empty replacement used as a preprocessor expression", () => {
    const expression = "EMPTY";
    const source = shader(expression).replace(`#if ${expression}`, `#define EMPTY\n#if ${expression}`);
    const native = evaluateNativeCondition(expression, [["EMPTY", ""]]);
    if (native !== "no-webgl") expect(native.supported).to.be.false;

    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).to.include(
      "PreprocessorError"
    );
    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    expect(
      new ShaderCompiler()._parseShaderPass(
        pass.contents,
        pass.vertexEntry,
        pass.fragmentEntry,
        ShaderLanguage.GLSLES100,
        ""
      )
    ).to.be.undefined;

    const instructions = ShaderInstructionEncoder.parse("#if EMPTY\nBODY\n#endif\n");
    expect(() => ShaderMacroProcessor.evaluate(instructions, new Map([["EMPTY", ""]]))).to.throw(
      "Expected an operand before the end of the preprocessor expression"
    );
  });

  it("does not evaluate invalid arithmetic in an inactive short-circuit branch", () => {
    const trueInstructions = ShaderInstructionEncoder.parse("#if 1 || 1 / 0\nBODY\n#endif\n");
    const falseInstructions = ShaderInstructionEncoder.parse("#if 0 && 1 / 0\nBODY\n#endif\n");

    expect(ShaderMacroProcessor.evaluate(trueInstructions, new Map())).to.contain("BODY");
    expect(ShaderMacroProcessor.evaluate(falseInstructions, new Map())).not.to.contain("BODY");
  });

  it("evaluates multiline if and elif expressions from one logical directive", () => {
    const instructions = ShaderInstructionEncoder.parse(`#if 0
FIRST
#elif defined(ENABLED) && \\
  VALUE == 2
BODY
#else
FALLBACK
#endif
`);

    expect(
      ShaderMacroProcessor.evaluate(
        instructions,
        new Map([
          ["ENABLED", "1"],
          ["VALUE", "2"]
        ])
      )
    ).to.contain("BODY");
    expect(ShaderMacroProcessor.evaluate(instructions, new Map())).to.contain("FALLBACK");
  });

  it("evaluates multiline macro replacement text before a condition", () => {
    const instructions = ShaderInstructionEncoder.parse(`#define VALUE 1 + \\
  1
#if VALUE == 2
BODY
#endif
`);

    expect(ShaderMacroProcessor.evaluate(instructions, new Map())).to.contain("BODY");
  });

  it("uses parser tokenization for comments inside the defined operator", () => {
    const instructions = ShaderInstructionEncoder.parse(`#define JOIN 1 &&
#define FLAG 1
#if JOIN defined/* comment */(FLAG)
BODY
#endif
`);

    expect(ShaderMacroProcessor.evaluate(instructions, new Map())).to.contain("BODY");
  });

  it("does not expand macro names inside preprocessor comments", () => {
    const instructions = ShaderInstructionEncoder.parse(`#define BAD */ 1 / 0
#if EXTERNAL || 1 /* BAD */
BODY
#endif
`);

    expect(ShaderMacroProcessor.evaluate(instructions, new Map([["EXTERNAL", "1"]]))).to.contain("BODY");
  });

  it("preserves continued conditions through analyzer, compiler, and offline precompile", () => {
    const source = `Shader "continued-condition" { SubShader "s" { Pass "p" {
#if defined(ENABLED) && \\
  VALUE == 2
const float selectedValue = 1.0;
#else
const float selectedValue = 0.0;
#endif
void vert() { gl_Position = vec4(selectedValue); }
void frag() { gl_FragColor = vec4(selectedValue); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    expect(ShaderAnalyzer.analyze(source).diagnostics).to.be.empty;

    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    const program = new ShaderCompiler()._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES100,
      ""
    );
    expect(program).not.to.be.undefined;
    const enabled = new Map([
      ["ENABLED", "1"],
      ["VALUE", "2"]
    ]);
    expect(ShaderMacroProcessor.evaluate(program!.vertexShaderInstructions!, enabled)).to.contain(
      "selectedValue = 1.0"
    );
    expect(ShaderMacroProcessor.evaluate(program!.vertexShaderInstructions!, new Map())).to.contain(
      "selectedValue = 0.0"
    );

    const precompiled = new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100);
    const precompiledPass = precompiled.subShaders[0].passes[0];
    expect(precompiledPass.isUsePass).to.be.false;
    if (!precompiledPass.isUsePass) {
      expect(ShaderMacroProcessor.evaluate(precompiledPass.vertexShaderInstructions!, enabled)).to.contain(
        "selectedValue = 1.0"
      );
    }
  });

  it("preserves commented defined operators through compiler and offline precompile", () => {
    const source = `Shader "commented-defined" { SubShader "s" { Pass "p" {
#define JOIN 1 &&
#define FLAG 1
#if JOIN defined/* comment */(FLAG)
const float selectedValue = 1.0;
#else
const float selectedValue = 0.0;
#endif
void vert() { gl_Position = vec4(selectedValue); }
void frag() { gl_FragColor = vec4(selectedValue); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    expect(ShaderAnalyzer.analyze(source).diagnostics).to.be.empty;

    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    const program = new ShaderCompiler()._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES100,
      ""
    );
    expect(program).not.to.be.undefined;
    expect(ShaderMacroProcessor.evaluate(program!.fragmentShaderInstructions!, new Map())).to.contain(
      "selectedValue = 1.0"
    );

    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).not.to.throw();
  });

  it("does not expand macro names inside replacement-list comments", () => {
    const source = `Shader "commented-replacement" { SubShader "s" { Pass "p" {
#define BAD */ 1 / 0
#define VALUE 1 /* BAD */
#if VALUE
const float selectedValue = 1.0;
#else
const float selectedValue = 0.0;
#endif
void vert() { gl_Position = vec4(selectedValue); }
void frag() { gl_FragColor = vec4(selectedValue); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    expect(ShaderAnalyzer.analyze(source).diagnostics).to.be.empty;

    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    const program = new ShaderCompiler()._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES100,
      ""
    );
    expect(program).not.to.be.undefined;
    expect(ShaderMacroProcessor.evaluate(program!.fragmentShaderInstructions!, new Map())).to.contain(
      "selectedValue = 1.0"
    );
    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).not.to.throw();
  });
});
