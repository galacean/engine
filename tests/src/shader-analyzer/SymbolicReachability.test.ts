import { DiagnosticSeverity, DiagnosticType, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { describe, expect, it } from "vitest";

function shader(helpers: string, vertex: string, fragment = "gl_FragColor = vec4(1.0);"): string {
  return `Shader "symbolic-reachability" { SubShader "s" { Pass "p" {
${helpers}
void vert() {
${vertex}
}
void frag() {
${fragment}
}
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function guardedCalls(count: number, reverse = false): string {
  const values = Array.from({ length: count }, (_, index) => index + 1);
  if (reverse) values.reverse();
  return values.map((value) => `#if MODE == ${value}\nleaf();\n#endif`).join("\n");
}

function outsideRangeWrite(count: number): string {
  return `#if MODE < 1 || MODE > ${count}\ngl_Position = vec4(0.0);\n#endif`;
}

function diamond(depth: number, leaf: string): string {
  let helpers = `void layer0() {\n${leaf}\n}\n`;
  for (let index = 1; index <= depth; index++) {
    helpers += `void layer${index}() {
#ifdef OPTION${index}
layer${index - 1}();
#else
layer${index - 1}();
#endif
}\n`;
  }
  return helpers;
}

function independentFanIn(count: number, viaHelpers: boolean, reverse: boolean): string {
  let helpers = "void leaf() {\n#ifdef LAST\ndiscard;\n#endif\n}\n";
  const calls: string[] = [];
  for (let index = 0; index < count; index++) {
    const guardedCall = `#if defined(A${index}) && !defined(LAST)\nleaf();\n#endif`;
    if (viaHelpers) {
      helpers += `void helper${index}() {\n${guardedCall}\n}\n`;
      calls.push(`helper${index}();`);
    } else {
      calls.push(guardedCall);
    }
  }
  calls.push("#ifdef LAST\nleaf();\n#endif");
  if (reverse) calls.reverse();
  return shader(helpers, `${calls.join("\n")}\ngl_Position = vec4(0.0);`);
}

describe("symbolic call-path reachability", () => {
  it("retains the terminal witness through 4096 independent conditions without overflowing the stack", () => {
    const source = independentFanIn(4096, false, false);
    const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([DiagnosticType.MisplacedControlFlow]);
    const { start, end } = diagnostics[0].range;
    expect(source.slice(start.offset, end.offset)).toBe("discard;");
  });

  it.each([false, true])(
    "retains the terminal witness after 1024 independent conditions, helpers: %s",
    (viaHelpers) => {
      for (const reverse of [false, true]) {
        const source = independentFanIn(1024, viaHelpers, reverse);
        const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
        expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([DiagnosticType.MisplacedControlFlow]);
        const { start, end } = diagnostics[0].range;
        expect(source.slice(start.offset, end.offset)).toBe("discard;");
      }
    }
  );

  it.each([257, 512, 1024])("retains a stage error exclusive to the last of %i conditions", (count) => {
    for (const [effect, code] of [
      ["discard;", DiagnosticType.MisplacedControlFlow],
      ["float value = dFdx(1.0);", DiagnosticType.DerivativeInVertexShader]
    ] as const) {
      const helpers = `void leaf() {\n#if MODE == ${count}\n${effect}\n#endif\n}`;
      for (const reverse of [false, true]) {
        const source = shader(helpers, `${guardedCalls(count, reverse)}\ngl_Position = vec4(0.0);`);
        const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
        expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([code]);
        expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
        const { start, end } = diagnostics[0].range;
        expect(source.slice(start.offset, end.offset)).toBe(effect === "discard;" ? "discard;" : "dFdx(1.0)");
      }
    }
  });

  it.each([257, 512, 1024])("finds the sole missing-write configuration after %i call conditions", (count) => {
    const helpers = `void leaf() {\n#if MODE != ${count}\ngl_Position = vec4(0.0);\n#endif\n}`;
    for (const reverse of [false, true]) {
      const diagnostics = ShaderAnalyzer.analyze(
        shader(helpers, `${guardedCalls(count, reverse)}\n${outsideRangeWrite(count)}`)
      ).diagnostics;
      expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([DiagnosticType.MissingVertexPosition]);
    }
  });

  it.each([257, 512, 1024])("proves complete writes through %i numeric alternatives", (count) => {
    for (const reverse of [false, true]) {
      expect(
        ShaderAnalyzer.analyze(
          shader(
            "void leaf() { gl_Position = vec4(0.0); }",
            `${guardedCalls(count, reverse)}\n${outsideRangeWrite(count)}`
          )
        ).diagnostics
      ).toEqual([]);
    }
  });

  it.each([257, 512, 1024])("finds a legacy output conflict exclusive to the last of %i conditions", (count) => {
    const helpers = `void leaf() {\n#if MODE == ${count}\ngl_FragData[0] = vec4(1.0);\n#endif\n}`;
    for (const reverse of [false, true]) {
      const source = shader(
        helpers,
        "gl_Position = vec4(0.0);",
        `gl_FragColor = vec4(1.0);\n${guardedCalls(count, reverse)}`
      );
      const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
      expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([DiagnosticType.LegacyFragmentOutputConflict]);
      const { start, end } = diagnostics[0].range;
      expect(source.slice(start.offset, end.offset)).toBe("gl_FragData");
    }
  });

  it.each([257, 512, 1024])("keeps mutually exclusive outputs disjoint across %i conditions", (count) => {
    const helpers = `void leaf() {\n#if MODE == ${count}\ngl_FragData[0] = vec4(1.0);\n#endif\n}`;
    for (const reverse of [false, true]) {
      expect(
        ShaderAnalyzer.analyze(
          shader(
            helpers,
            "gl_Position = vec4(0.0);",
            `#if MODE != ${count}\ngl_FragColor = vec4(1.0);\n#endif\n${guardedCalls(count, reverse)}`
          )
        ).diagnostics
      ).toEqual([]);
    }
  });

  it.each([12, 20])("preserves stage and write facts through a complete diamond of depth %i", (depth) => {
    expect(
      ShaderAnalyzer.analyze(
        shader(diamond(depth, "float value = dFdx(1.0);"), `layer${depth}(); gl_Position = vec4(0.0);`)
      ).diagnostics.map((diagnostic) => diagnostic.code)
    ).toEqual([DiagnosticType.DerivativeInVertexShader]);
    expect(
      ShaderAnalyzer.analyze(shader(diamond(depth, "gl_Position = vec4(0.0);"), `layer${depth}();`)).diagnostics
    ).toEqual([]);
    expect(
      ShaderAnalyzer.analyze(
        shader(
          diamond(depth, "#ifndef OUTER\ndiscard;\n#endif"),
          `#ifdef OUTER\nlayer${depth}();\n#endif\ngl_Position = vec4(0.0);`
        )
      ).diagnostics
    ).toEqual([]);
  });

  it.each([
    ["defined(A)", "!defined(A)", false],
    ["defined(A) && defined(B)", "!defined(A) || !defined(B)", false],
    ["defined(A) || defined(B)", "!defined(A) && !defined(B)", false],
    ["A != 0", "A == 0", false],
    ["A == 1", "A != 1", false],
    ["defined(A) || defined(B)", "!defined(A) && defined(B)", true],
    ["A == 0 || A == 1", "A != 0", true]
  ] as const)("correlates caller %s with effect %s", (caller, site, reachable) => {
    const diagnostics = ShaderAnalyzer.analyze(
      shader(
        `void leaf() {\n#if ${site}\ndiscard;\n#endif\n}`,
        `#if ${caller}\nleaf();\n#endif\ngl_Position = vec4(0.0);`
      )
    ).diagnostics;
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      reachable ? [DiagnosticType.MisplacedControlFlow] : []
    );
  });

  it("does not turn an opaque macro path into a definite stage error or missing write", () => {
    expect(
      ShaderAnalyzer.analyze(
        shader("void leaf() { discard; }", "#if UNKNOWN(1)\nleaf();\n#endif\ngl_Position = vec4(0.0);")
      ).diagnostics
    ).toEqual([]);
    expect(
      ShaderAnalyzer.analyze(shader("void leaf() { gl_Position = vec4(0.0); }", "#if UNKNOWN(1)\nleaf();\n#endif"))
        .diagnostics
    ).toEqual([]);
    expect(
      ShaderAnalyzer.analyze(
        shader("void leaf() {\n#if UNKNOWN(1)\ndiscard;\n#endif\n}", "leaf(); gl_Position = vec4(0.0);")
      ).diagnostics
    ).toEqual([]);
  });

  it.each([
    ["#ifdef FLAG", "#undef FLAG\n#ifndef FLAG"],
    ["#ifndef FLAG", "#undef FLAG\n#define FLAG\n#ifdef FLAG"]
  ])("keeps macro versions separate across %s and a later mutation", (site, caller) => {
    expect(
      ShaderAnalyzer.analyze(
        shader(`void leaf() {\n${site}\ndiscard;\n#endif\n}`, `${caller}\nleaf();\n#endif\ngl_Position = vec4(0.0);`)
      ).diagnostics.map((diagnostic) => diagnostic.code)
    ).toEqual([DiagnosticType.MisplacedControlFlow]);
  });

  it("retains a known witness when another incoming path is opaque", () => {
    const paths = ["#if UNKNOWN(1)\nleaf();\n#endif", "#ifdef OPTION\nleaf();\n#endif"];
    for (const order of [paths, paths.slice().reverse()]) {
      expect(
        ShaderAnalyzer.analyze(
          shader("void leaf() { discard; }", `${order.join("\n")}\ngl_Position = vec4(0.0);`)
        ).diagnostics.map((diagnostic) => diagnostic.code)
      ).toEqual([DiagnosticType.MisplacedControlFlow]);
    }
  });

  it.each([256, 257, 1024])("proves return coverage across %i numeric conditions", (count) => {
    const returns = Array.from({ length: count }, (_, index) => `#if MODE == ${index + 1}\nreturn 1.0;\n#endif`).join(
      "\n"
    );
    expect(
      ShaderAnalyzer.analyze(shader(`float pick() {\n${returns}\n}`, "gl_Position = vec4(pick());")).diagnostics.map(
        (diagnostic) => diagnostic.code
      )
    ).toEqual([DiagnosticType.MissingReturn]);
    expect(
      ShaderAnalyzer.analyze(
        shader(
          `float pick() {\n#if MODE >= 1 && MODE <= ${count}\n${returns}\n#else\nreturn 0.0;\n#endif\n}`,
          "gl_Position = vec4(pick());"
        )
      ).diagnostics
    ).toEqual([]);
  });

  it("intersects 17 conditional returns in both runtime arms without dropping their final missing combination", () => {
    const returns = (name: string, other: string): string => {
      const conditions = Array.from({ length: 16 }, (_, index) => `${name} == ${index + 1}`);
      conditions.push(`${name} == 17 && ${other} != 17`);
      return conditions.map((condition) => `#if ${condition}\nreturn 1.0;\n#endif`).join("\n");
    };
    const body = `
#if A < 1 || A > 17 || B < 1 || B > 17
return 0.0;
#endif
if (flag) {
${returns("A", "B")}
} else {
${returns("B", "A")}
}`;
    expect(
      ShaderAnalyzer.analyze(
        shader(`float pick(bool flag) {\n${body}\n}`, "gl_Position = vec4(pick(true));")
      ).diagnostics.map((diagnostic) => diagnostic.code)
    ).toEqual([DiagnosticType.MissingReturn]);
    expect(
      ShaderAnalyzer.analyze(
        shader(
          `float pick(bool flag) {\n${body}\n#if A == 17 && B == 17\nreturn 1.0;\n#endif\n}`,
          "gl_Position = vec4(pick(true));"
        )
      ).diagnostics
    ).toEqual([]);
  });

  it("keeps return coverage under an opaque macro inconclusive", () => {
    expect(
      ShaderAnalyzer.analyze(
        shader("float pick() {\n#if UNKNOWN(1)\nreturn 1.0;\n#endif\n}", "gl_Position = vec4(pick());")
      ).diagnostics
    ).toEqual([]);
    expect(
      ShaderAnalyzer.analyze(
        shader(
          "float pick() {\n#if UNKNOWN(1)\nreturn 1.0;\n#else\nreturn 0.0;\n#endif\n}",
          "gl_Position = vec4(pick());"
        )
      ).diagnostics
    ).toEqual([]);
  });

  it("retains return coverage inside a self-defining include guard", () => {
    const helpers = "float helper() {\n#ifndef RETURN_GUARD\n#define RETURN_GUARD\nreturn 1.0;\n#endif\n}";
    expect(
      ShaderAnalyzer.analyze(shader(helpers, "gl_Position = vec4(0.0);", "gl_FragColor = vec4(helper());")).diagnostics
    ).toEqual([]);
  });

  it("retains the missing-return diagnostic for an empty body under an opaque declaration guard", () => {
    const source = shader("#if UNKNOWN(1)\nfloat helper() {}\n#endif", "gl_Position = vec4(0.0);");
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticType.MissingReturn
    ]);
  });

  it("combines 1024 independent conditional returns across sequential statement containers", () => {
    const returns = Array.from({ length: 1024 }, (_, index) => `#ifdef OPTION${index}\nreturn 1.0;\n#endif`).join("\n");
    expect(
      ShaderAnalyzer.analyze(shader(`float pick() {\n${returns}\n}`, "gl_Position = vec4(pick());")).diagnostics.map(
        (diagnostic) => diagnostic.code
      )
    ).toEqual([DiagnosticType.MissingReturn]);
    expect(
      ShaderAnalyzer.analyze(shader(`float pick() {\n${returns}\nreturn 0.0;\n}`, "gl_Position = vec4(pick());"))
        .diagnostics
    ).toEqual([]);
  });
});
