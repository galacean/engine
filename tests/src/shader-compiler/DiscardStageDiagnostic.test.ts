import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import {
  DIAGNOSTIC_CATEGORY,
  DiagnosticCategory,
  DiagnosticType,
  ShaderAnalyzer,
  type AnalyzerOptions
} from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, describe, expect, it } from "vitest";

function shader(vertex = "gl_Position = vec4(0.0);", fragment = "gl_FragColor = vec4(1.0);", helpers = ""): string {
  return `Shader "stage-restrictions" { SubShader "s" { Pass "p" {
${helpers}
void vert() { ${vertex} }
void frag() { ${fragment} }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function stageDiagnostics(source: string, options?: AnalyzerOptions) {
  return ShaderAnalyzer.analyze(source, options).diagnostics.filter((diagnostic) =>
    ["MisplacedControlFlow", "InvalidBuiltinStage", "DerivativeInVertexShader"].includes(diagnostic.code)
  );
}

describe("stage restrictions through exact entry call paths", () => {
  it("reports direct vertex discard as a control-flow error at the statement", () => {
    const source = shader("gl_Position = vec4(0.0); discard;");
    const diagnostics = stageDiagnostics(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(DiagnosticType.MisplacedControlFlow);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("vertex");
    expect(source.slice(diagnostics[0].range.start.offset, diagnostics[0].range.end.offset)).toBe("discard;");
  });

  it("reports one discard site reached transitively from both stages", () => {
    const source = shader(
      "middle(); gl_Position = vec4(0.0);",
      "middle(); gl_FragColor = vec4(1.0);",
      "void leaf() { discard; }\nvoid middle() { leaf(); }"
    );
    expect(stageDiagnostics(source).map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticType.MisplacedControlFlow
    ]);
  });

  it.each([
    shader(undefined, "discard;"),
    shader(undefined, "leaf(); gl_FragColor = vec4(1.0);", "void leaf() { discard; }"),
    shader(undefined, undefined, "void unused() { discard; }"),
    shader("gl_Position = vec4(0.0);\n#if 0\ndiscard;\n#endif"),
    shader(
      "leaf(vec2(1.0)); gl_Position = vec4(0.0);",
      undefined,
      "void leaf(float value) { discard; }\nvoid leaf(vec2 value) {}"
    )
  ])("does not report fragment-only, uncalled, disabled or different-overload discard", (source) => {
    expect(stageDiagnostics(source)).toEqual([]);
  });

  it.each([false, true])("respects macro constraints across transitive calls, compatible: %s", (compatible) => {
    const source = shader(
      `\n#if ${compatible ? "defined" : "!defined"}(KILL)\nmiddle();\n#endif\ngl_Position = vec4(0.0);`,
      undefined,
      "void leaf() { discard; }\nvoid middle() {\n#ifdef KILL\nleaf();\n#endif\n}"
    );
    expect(stageDiagnostics(source).map((diagnostic) => diagnostic.code)).toEqual(
      compatible ? [DiagnosticType.MisplacedControlFlow] : []
    );
  });

  it("preserves include attribution for a reachable discard site", () => {
    const chunk = "void leaf() { discard; }";
    const source = shader("leaf(); gl_Position = vec4(0.0);", undefined, '#include "./kill.glsl"');
    const diagnostics = stageDiagnostics(source, {
      sourceFile: "file:///shaders/main.shader",
      includeMap: { "file:///shaders/kill.glsl": chunk }
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].sourceFile).toBe("file:///shaders/kill.glsl");
    expect(diagnostics[0].relatedSource).toBe(chunk);
    expect(chunk.slice(diagnostics[0].range.start.offset, diagnostics[0].range.end.offset)).toBe("discard;");
  });

  it.each([
    { name: "gl_FragCoord", source: shader("gl_Position = vec4(gl_FragCoord.x);") },
    { name: "gl_VertexID", source: shader(undefined, "gl_FragColor = vec4(float(gl_VertexID));") },
    {
      name: "gl_InstanceID",
      source: shader(undefined, "gl_FragColor = vec4(float(gl_InstanceID));")
    },
    { name: "gl_PointCoord", source: shader("gl_Position = vec4(gl_PointCoord, 0.0, 1.0);") }
  ])("reports $name in the wrong stage using builtin metadata", ({ name, source }) => {
    const diagnostics = stageDiagnostics(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(DiagnosticType.InvalidBuiltinStage);
    expect(diagnostics[0].message).toContain(name);
    expect(DIAGNOSTIC_CATEGORY[diagnostics[0].code]).toBe(DiagnosticCategory.PipelineIO);
  });

  it("reports a shared builtin helper only for its incompatible stage", () => {
    const source = shader(
      "gl_Position = middle();",
      "gl_FragColor = middle();",
      "vec4 leaf() { return gl_FragCoord; }\nvec4 middle() { return leaf(); }"
    );
    const diagnostics = stageDiagnostics(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(DiagnosticType.InvalidBuiltinStage);
    expect(diagnostics[0].message).toContain("vertex");
  });

  it("accepts correct-stage builtins, shared constants, unused helpers and member names", () => {
    const source = shader(
      "Data value; value.gl_FragCoord = vec4(float(gl_VertexID + gl_MaxDrawBuffers)); gl_Position = value.gl_FragCoord;",
      "gl_FragColor = gl_FragCoord + vec4(float(gl_MaxDrawBuffers));",
      "struct Data { vec4 gl_FragCoord; };\nvec4 unused() { return gl_FragCoord; }"
    );
    expect(stageDiagnostics(source)).toEqual([]);
  });

  it("does not join mutually exclusive paths to a builtin reference", () => {
    const source = shader(
      "\n#ifndef FRAGMENT_ONLY\nhelper();\n#endif\ngl_Position = vec4(0.0);",
      undefined,
      "void helper() {\n#ifdef FRAGMENT_ONLY\nvec4 value = gl_FragCoord;\n#endif\n}"
    );
    expect(stageDiagnostics(source)).toEqual([]);
  });

  it("reports builtin aliases at the macro use and skips unused definitions", () => {
    const source = shader("gl_Position = COORD;", undefined, "#define COORD gl_FragCoord\n#define UNUSED gl_VertexID");
    const diagnostics = stageDiagnostics(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(DiagnosticType.InvalidBuiltinStage);
    expect(source.slice(diagnostics[0].range.start.offset, diagnostics[0].range.end.offset)).toBe("COORD");
  });

  it("uses the macro definition's branch when reporting a builtin alias", () => {
    const source = shader(
      "\n#ifndef FRAGMENT_ONLY\ngl_Position = COORD;\n#else\ngl_Position = vec4(0.0);\n#endif",
      undefined,
      "#ifdef FRAGMENT_ONLY\n#define COORD gl_FragCoord\n#else\n#define COORD vec4(0.0)\n#endif"
    );
    expect(stageDiagnostics(source)).toEqual([]);
  });

  it("keeps derivative diagnostic codes when using the shared stage reporter", () => {
    const source = shader("gl_Position = vec4(helper());", undefined, "float helper() { return dFdx(1.0); }");
    expect(stageDiagnostics(source).map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticType.DerivativeInVertexShader
    ]);
  });

  it.each([
    { definition: "#define IGNORE(x) 1.0", expression: "IGNORE(gl_FragCoord)", expected: [] },
    {
      definition: "#define ID(x) x",
      expression: "ID(gl_FragCoord)",
      expected: [DiagnosticType.InvalidBuiltinStage]
    },
    {
      definition: "#define ADD(x) (x + 1.0)",
      expression: "ADD(gl_FragCoord)",
      expected: [DiagnosticType.InvalidBuiltinStage]
    }
  ])(
    "checks effective macro arguments for $expression without duplicate reports",
    ({ definition, expression, expected }) => {
      const source = shader(`gl_Position = vec4(${expression});`, undefined, definition);
      expect(stageDiagnostics(source).map((diagnostic) => diagnostic.code)).toEqual(expected);
    }
  );

  it("reports macro-expanded discard only when the vertex stage reaches the invocation", () => {
    const definition = "#define KILL discard";
    expect(
      stageDiagnostics(shader("KILL; gl_Position = vec4(0.0);", undefined, definition)).map(
        (diagnostic) => diagnostic.code
      )
    ).toEqual([DiagnosticType.MisplacedControlFlow]);
    expect(stageDiagnostics(shader(undefined, "KILL;", definition))).toEqual([]);
    expect(stageDiagnostics(shader("\n#if 0\nKILL;\n#endif\ngl_Position = vec4(0.0);", undefined, definition))).toEqual(
      []
    );
  });

  it.each([
    { definition: "", expression: "EXTERNAL(gl_FragCoord)" },
    { definition: "", expression: "EXTERNAL(dFdx(1.0))" },
    { definition: "#define IGNORE(x) 1.0", expression: "IGNORE(dFdx(1.0))" },
    { definition: "#define EXTERNAL(x) vec4(0.0)", expression: "EXTERNAL(gl_FragCoord)" }
  ])("does not prove execution of discarded or unknown arguments: $expression", ({ definition, expression }) => {
    expect(stageDiagnostics(shader(`gl_Position = vec4(${expression});`, undefined, definition))).toEqual([]);
  });

  it.each([false, true])("follows a helper argument only when retained by its macro: %s", (retained) => {
    const source = shader(
      "gl_Position = vec4(APPLY(kill()));",
      undefined,
      `#define APPLY(x) ${retained ? "x" : "1.0"}\nfloat kill() { discard; return 1.0; }`
    );
    expect(stageDiagnostics(source).map((diagnostic) => diagnostic.code)).toEqual(
      retained ? [DiagnosticType.MisplacedControlFlow] : []
    );
  });

  it("does not infer a macro-expanded overload without its argument types", () => {
    const source = shader(
      "gl_Position = vec4(CALL(vec2(1.0)));",
      undefined,
      "#define CALL(x) helper(x)\nfloat helper(float x) { discard; return x; }\nfloat helper(vec2 x) { return x.x; }"
    );
    expect(stageDiagnostics(source)).toEqual([]);
  });

  it("reports a macro use once when both definition arms reference the same builtin", () => {
    const source = shader(
      "gl_Position = COORD;",
      undefined,
      "#ifdef A\n#define COORD gl_FragCoord\n#else\n#define COORD gl_FragCoord\n#endif"
    );
    expect(stageDiagnostics(source).map((diagnostic) => diagnostic.code)).toEqual([DiagnosticType.InvalidBuiltinStage]);
  });

  it("does not inherit the first statement's macro condition into later siblings", () => {
    const source = shader(
      "\n#ifndef FRAGMENT\ngl_Position = vec4(OP(1.0));\n#else\ngl_Position = vec4(0.0);\n#endif",
      undefined,
      "#ifdef FRAGMENT\n#define OP(x) dFdx(x)\n#else\n#define OP(x) abs(x)\n#endif"
    );
    expect(ShaderAnalyzer.analyze(source).diagnostics).toEqual([]);
  });

  it.each([
    { definition: "", expression: "EXTERNAL(gl_Position = vec4(0.0));", missing: false },
    { definition: "#define DROP(x) 1.0", expression: "DROP(gl_Position = vec4(0.0));", missing: true },
    {
      definition: "#define DROP(x) x\n#undef DROP\n#define DROP(x) 1.0",
      expression: "DROP(gl_Position = vec4(0.0));",
      missing: true
    },
    { definition: "#define KEEP(x) x", expression: "KEEP(gl_Position = vec4(0.0));", missing: false },
    { definition: "#define WRAP(x) EXTERNAL(x)", expression: "WRAP(gl_Position = vec4(0.0));", missing: false }
  ])(
    "distinguishes unknown write effects from known discarded arguments: $expression",
    ({ definition, expression, missing }) => {
      const diagnostics = ShaderAnalyzer.analyze(shader(expression, undefined, definition)).diagnostics;
      expect(diagnostics.some((diagnostic) => diagnostic.code === DiagnosticType.MissingVertexPosition)).toBe(missing);
    }
  );

  it("retains the macro argument's condition for output parameter writes", () => {
    const source = shader(
      "APPLY(setPosition(gl_Position));",
      undefined,
      "#ifdef WRITE\n#define APPLY(x) x\n#else\n#define APPLY(x) 1.0\n#endif\nfloat setPosition(out vec4 position) { position = vec4(0.0); return 1.0; }"
    );
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      DiagnosticType.MissingVertexPosition
    );
  });

  it("keeps partially shadowed macro replacements unknown instead of inventing an active binding", () => {
    const source = shader(
      "gl_Position = vec4(OP(1.0));",
      undefined,
      "#define OP(x) dFdx(x)\n#ifdef SAFE\n#undef OP\n#define OP(x) abs(x)\n#endif"
    );
    // Without a branch-complement projection the old replacement on !SAFE is unproven.
    expect(stageDiagnostics(source)).toEqual([]);
  });

  it("keeps effects unknown when the shared macro expansion budget is exhausted", () => {
    const definitions = Array.from({ length: 300 }, (_, index) => `#define M${index} M${index + 1}`).join("\n");
    const source = shader("M0;", undefined, `${definitions}\n#define M300 gl_Position = vec4(0.0)`);
    const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
    expect(diagnostics.some((diagnostic) => diagnostic.code === DiagnosticType.MissingVertexPosition)).toBe(false);
    expect(stageDiagnostics(source)).toEqual([]);
  });
});

describe.runIf(typeof document !== "undefined")("stage diagnostics and native GLSL compilation", () => {
  const contexts: (WebGLRenderingContext | WebGL2RenderingContext)[] = [];
  afterAll(() => {
    for (const gl of contexts) gl.getExtension("WEBGL_lose_context")?.loseContext();
  });

  it.each([ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300])(
    "rejects vertex discard and wrong-stage builtins, accepts fragment discard for target %s",
    (target) => {
      const gl = document
        .createElement("canvas")
        .getContext(target === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl") as
        | WebGLRenderingContext
        | WebGL2RenderingContext;
      expect(gl).not.toBeNull();
      contexts.push(gl);
      for (const [source, invalidStage] of [
        [shader("gl_Position = vec4(0.0); discard;"), "vertex"],
        [shader("gl_Position = vec4(gl_FragCoord.x);"), "vertex"],
        [shader(undefined, "gl_FragColor = vec4(float(gl_VertexID));"), "fragment"],
        [shader(undefined, "discard;"), undefined]
      ] as const) {
        const compiler = new ShaderCompiler();
        const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
        const program = compiler._parseShaderPass(pass.contents, pass.vertexEntry, pass.fragmentEntry, target);
        expect(program).toBeDefined();
        for (const [stage, type, instructions] of [
          ["vertex", gl.VERTEX_SHADER, program!.vertexShaderInstructions!],
          ["fragment", gl.FRAGMENT_SHADER, program!.fragmentShaderInstructions!]
        ] as const) {
          const shaderObject = gl.createShader(type)!;
          const version = target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
          const generated = ShaderMacroProcessor.evaluate(instructions, new Map());
          gl.shaderSource(shaderObject, `${version}precision highp float;\n${generated}`);
          gl.compileShader(shaderObject);
          expect(gl.getShaderParameter(shaderObject, gl.COMPILE_STATUS), gl.getShaderInfoLog(shaderObject) ?? "").toBe(
            stage !== invalidStage
          );
          gl.deleteShader(shaderObject);
        }
      }
    }
  );
});
