import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderLanguage } from "@galacean/engine-core";
import {
  GSError,
  GSErrorName,
  parseShaderPass,
  Preprocessor,
  ShaderSourceParser
} from "@galacean/engine-shader-parser/internal/analyzer";
import { describe, expect, it } from "vitest";

function shader(declarations: string, fragmentBody = "gl_FragColor = vec4(1.0);"): string {
  return `Shader "analyzer-regression" { SubShader "s" { Pass "p" {
struct Attributes { vec3 POSITION; };
${declarations}
void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
void frag() { ${fragmentBody} }
VertexShader = vert;
FragmentShader = frag;
} } }`;
}

function codes(source: string): string[] {
  return ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code);
}

describe("shader analyzer regressions", () => {
  it("accepts vector truncation constructors", () => {
    expect(codes(shader("vec3 shortValue = vec3(vec4(1.0));"))).to.not.include("ConstructorArgCount");
  });

  it("keeps loop declarations inside their lexical scope", () => {
    const source = shader(
      "",
      `
  float sum = 0.0;
  for (int i = 0; i < 2; i++) { sum += float(i); }
  for (int i = 0; i < 2; i++) { sum += float(i); }
  gl_FragColor = vec4(sum);`
    );
    const result = codes(source);
    expect(result).to.not.include("Redefinition");
    expect(result).to.not.include("UnknownVariable");
  });

  it("does not leak a loop declaration into the enclosing scope", () => {
    const result = codes(
      shader(
        "",
        `
  for (int i = 0; i < 2; i++) { }
  gl_FragColor = vec4(float(i));`
      )
    );
    expect(result).to.include("UnknownVariable");
  });

  it("rejects incompatible vector and matrix arithmetic shapes", () => {
    const result = codes(
      shader(
        "",
        `
  vec2 a = vec2(0.0);
  vec3 b = vec3(0.0);
  mat2 m = mat2(1.0);
  a = a + b;
  a = m + a;
  gl_FragColor = vec4(a, 0.0, 1.0);`
      )
    );
    expect(result.filter((code) => code === "InvalidBinaryOperands")).to.have.lengthOf(2);
  });

  it("keeps valid matrix-vector multiplication valid", () => {
    expect(
      codes(
        shader(
          "",
          `
  vec2 value = mat2(1.0) * vec2(1.0);
  gl_FragColor = vec4(value, 0.0, 1.0);`
        )
      )
    ).to.not.include("InvalidBinaryOperands");
  });

  it("uses matrix dimensions for non-square multiplication", () => {
    const result = codes(
      shader(
        "",
        `
  mat3 validProduct = mat2x3(1.0) * mat3x2(1.0);
  mat2x3 invalidProduct = mat2x3(1.0) * mat2x3(1.0);
  gl_FragColor = vec4(validProduct[0], 1.0);`
      )
    );
    expect(result.filter((code) => code === "InvalidBinaryOperands")).to.have.lengthOf(1);
  });

  it("validates compound arithmetic through the shared type operation", () => {
    const result = codes(
      shader(
        "",
        `
  mat2x3 value = mat2x3(1.0);
  value *= mat2x3(1.0);
  gl_FragColor = vec4(1.0);`
      )
    );
    expect(result).to.include("InvalidBinaryOperands");
  });

  it("rejects a bare return from a non-void function", () => {
    expect(codes(shader("float missingValue() { return; }"))).to.include("InvalidReturnType");
  });

  it("recognizes bool literals as constant initializers", () => {
    expect(codes(shader("const bool enabled = true;"))).to.not.include("NonConstInitializer");
  });

  it("validates a global const initializer through the shared declarator facts", () => {
    const result = codes(shader("float runtimeValue; const float invalidValue = runtimeValue;"));
    expect(result.filter((code) => code === "NonConstInitializer")).to.have.lengthOf(1);
  });

  it("validates a local array initializer through the shared declarator facts", () => {
    const result = codes(
      shader(
        "",
        `float runtimeValue = 1.0;
  const float invalidValues[2] = runtimeValue;
  gl_FragColor = vec4(invalidValues[0]);`
      )
    );
    expect(result).to.include("NonConstInitializer");
  });

  it("preserves const qualification and initializer checks for every declarator", () => {
    const result = codes(
      shader(
        "",
        `
  float runtimeValue = 1.0;
  const float first = 1.0, second = runtimeValue;
  gl_FragColor = vec4(first + second);`
      )
    );
    expect(result).to.include("NonConstInitializer");
  });

  it("treats every const declarator as a constant for later initializers", () => {
    const result = codes(
      shader(
        "",
        `
  const int first = 1, second = 2;
  const int third = second;
  gl_FragColor = vec4(float(first + third));`
      )
    );
    expect(result).to.not.include("NonConstInitializer");
  });

  it("keeps array shape local to each comma-separated declarator", () => {
    const result = codes(shader("float first, values[2], last;", "gl_FragColor = vec4(values[0] + last[0]);"));
    expect(result.filter((code) => code === "NonIndexableType")).to.have.lengthOf(1);
  });

  it("uses strict comparison facts to satisfy inclusive declaration guards", () => {
    expect(
      codes(
        shader(
          `
#if QUALITY >= 0
float guardedValue;
#endif
`,
          `
#if QUALITY > 0
  gl_FragColor = vec4(guardedValue);
#else
  gl_FragColor = vec4(0.0);
#endif`
        )
      )
    ).to.not.include("UseBeforeDeclaration");
  });

  it("does not infer mutual recursion from an unresolved overloaded call", () => {
    const result = codes(
      shader(`float first(float value) { return second(vec2(value)); }
float second(vec2 value) { return first(value.x); }`)
    );
    expect(result).to.include("UndefinedFunction");
    expect(result).to.not.include("RecursiveFunction");
  });

  it("reports missing includes as preprocessing errors", () => {
    const result = ShaderAnalyzer.analyze(shader('#include "missing.glsl"'));
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "error")).to.equal(true);
    expect(result.diagnostics[0].message).to.include("was not found");
  });

  it("accepts an empty registered include", () => {
    const result = ShaderAnalyzer.analyze(shader('#include "empty.glsl"'), {
      includeMap: { "empty.glsl": "" }
    });
    expect(result.diagnostics, JSON.stringify(result.diagnostics)).to.be.empty;
  });

  it("resolves relative includes from the supplied shader base path", () => {
    const result = ShaderAnalyzer.analyze(shader('#include "./common.glsl"'), {
      sourceFile: "folder/main.shader",
      includeMap: { "folder/common.glsl": "float includedValue;" }
    });
    expect(result.diagnostics, JSON.stringify(result.diagnostics)).to.be.empty;
  });

  it("resolves and maps relative includes from an absolute source URL", () => {
    const sourceFile = "file:///workspace/Assets/Shaders/main.shader";
    const includedFile = "file:///workspace/Assets/Shaders/common.glsl";
    const included = "float includedValue;\nfloat includedValue;";
    const result = ShaderAnalyzer.analyze(shader('#include "./common.glsl"'), {
      sourceFile,
      includeMap: { [includedFile]: included }
    });
    const diagnostic = result.diagnostics.find((candidate) => candidate.code === "Redefinition");
    expect(diagnostic).to.be.ok;
    expect(diagnostic!.sourceFile).to.equal(includedFile);
    expect(diagnostic!.relatedSource).to.equal(included);
  });

  it("resolves nested relative includes from absolute source URLs", () => {
    const result = ShaderAnalyzer.analyze(shader('#include "./chunks/common.glsl"'), {
      sourceFile: "file:///workspace/Assets/Shaders/main.shader",
      includeMap: {
        "file:///workspace/Assets/Shaders/chunks/common.glsl": '#include "../values.glsl"',
        "file:///workspace/Assets/Shaders/values.glsl": "float includedValue;"
      }
    });
    expect(result.diagnostics, JSON.stringify(result.diagnostics)).to.be.empty;
  });

  it("normalizes a project-root source path before resolving relative includes", () => {
    const result = ShaderAnalyzer.analyze(shader('#include "./common.glsl"'), {
      sourceFile: "/Assets/Shaders/main.shader",
      includeMap: { "Assets/Shaders/common.glsl": "float includedValue;" }
    });
    expect(result.diagnostics, JSON.stringify(result.diagnostics)).to.be.empty;
  });

  it("maps included diagnostics to the include source", () => {
    const included = "float includedValue;\nfloat includedValue;";
    const result = ShaderAnalyzer.analyze(shader('#include "folder/common.glsl"'), {
      sourceFile: "main.shader",
      includeMap: { "folder/common.glsl": included }
    });
    const diagnostic = result.diagnostics.find((candidate) => candidate.code === "Redefinition");
    expect(diagnostic).to.be.ok;
    expect(diagnostic!.sourceFile).to.equal("folder/common.glsl");
    expect(diagnostic!.relatedSource).to.equal(included);
    expect(diagnostic!.range.start.line).to.equal(2);
    expect(diagnostic!.range.start.column).to.equal(7);
  });

  it("diagnoses malformed preprocessor expressions inside includes", () => {
    const included = "#if 0\n#elif 123 defined(USE_VALUE)\nfloat includedValue;\n#endif";
    const result = ShaderAnalyzer.analyze(shader('#include "folder/broken.glsl"'), {
      sourceFile: "main.shader",
      includeMap: { "folder/broken.glsl": included }
    });
    const diagnostic = result.diagnostics.find((candidate) => candidate.code === "PreprocessorError");
    expect(diagnostic).to.be.ok;
    expect(diagnostic!.sourceFile).to.equal("folder/broken.glsl");
    expect(diagnostic!.relatedSource).to.equal(included);
    expect(diagnostic!.range.start.line).to.equal(2);
    expect(diagnostic!.range.start.column).to.equal(11);
    expect(diagnostic!.range.end.column - diagnostic!.range.start.column).to.equal("defined".length);
  });

  it("does not retain include inputs between analyses", () => {
    const source = shader('#include "shared.glsl"');
    expect(ShaderAnalyzer.analyze(source, { includeMap: { "shared.glsl": "float includedValue;" } }).diagnostics).to.be
      .empty;

    const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("was not found"))).to.equal(true);
  });

  it("resolves a nested relative include from the included chunk path", () => {
    const includeMap = {
      "shared/chunk.glsl": '#include "./local.glsl"',
      "shared/local.glsl": "float sharedValue;",
      "left/local.glsl": "float leftValue;",
      "right/local.glsl": "float rightValue;"
    };
    const cache = new Map();
    const left = Preprocessor.parseWithErrors(
      '#include "shared/chunk.glsl"',
      "shaders://root/left/main.shader",
      includeMap,
      cache
    );
    const right = Preprocessor.parseWithErrors(
      '#include "shared/chunk.glsl"',
      "shaders://root/right/main.shader",
      includeMap,
      cache
    );
    expect(left.content).to.include("sharedValue");
    expect(right.content).to.include("sharedValue");
  });

  it("reports an include cycle without recursing indefinitely", () => {
    const includeMap = {
      "cycle/a.glsl": '#include "./b.glsl"',
      "cycle/b.glsl": '#include "./a.glsl"'
    };
    const result = Preprocessor.parseWithErrors(
      '#include "cycle/a.glsl"',
      "shaders://root/main.shader",
      includeMap,
      new Map()
    );
    expect(result.errors, result.content).to.have.lengthOf(1);
    expect(result.errors[0].message).to.include('cycle detected at "cycle/a.glsl"');
    expect(result.errors[0].file).to.equal("cycle/b.glsl");
  });

  it.each([
    ["left then right", ["left", "right"]],
    ["right then left", ["right", "left"]]
  ])("keeps canonical include cache entries independent: %s", (_name, roots) => {
    const includeMap = {
      "left/chunk.glsl": '#include "./local.glsl"',
      "left/local.glsl": "float leftValue;",
      "right/chunk.glsl": '#include "./local.glsl"',
      "right/local.glsl": "float rightValue;"
    };
    const cache = new Map();
    const outputs = new Map(
      roots.map((root) => [
        root,
        Preprocessor.parseWithErrors('#include "./chunk.glsl"', `shaders://root/${root}/main.shader`, includeMap, cache)
          .content
      ])
    );
    expect(outputs.get("left")).to.include("leftValue");
    expect(outputs.get("right")).to.include("rightValue");
  });

  it("keeps analyzer include expansion identical to runtime preprocessing", () => {
    const source = '#include "shared/chunk.glsl"\nvoid frag() { gl_FragColor = vec4(includedValue); }';
    const includeMap = {
      "shared/chunk.glsl": '#include "./local.glsl"',
      "shared/local.glsl": "float includedValue;"
    };
    const basePath = "shaders://root/left/main.shader";
    const runtime = Preprocessor.parseWithErrors(source, basePath, includeMap, new Map());
    const analyzer = parseShaderPass(source, includeMap, new Map(), "left/main.shader");
    expect(analyzer.expandedSource).to.equal(runtime.content);
  });

  it("formats source-parser positions that are not pooled ShaderPosition instances", () => {
    const error = new GSError(
      GSErrorName.CompilationError,
      "entry is missing",
      { index: 0, line: 0, column: 0 },
      undefined
    );
    expect(() => error.toString()).to.not.throw();
  });

  it("does not retain an unresolved RenderQueueType binding", () => {
    const result = ShaderSourceParser.parseWithErrors(`Shader "queue" { SubShader "s" {
RenderQueueType = MissingQueue;
Pass "p" {
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert;
FragmentShader = frag;
}
} }`);
    expect(result.errors.some((error) => error.message.includes("MissingQueue"))).to.equal(true);
    expect(Object.values(result.shaderSource.subShaders[0].renderStates.variableMap)).to.not.include("MissingQueue");
  });

  it("keeps source-parser diagnostics attached to their parse result", () => {
    const invalid = ShaderSourceParser.parseWithErrors(`Shader "bad" { SubShader "s" { Pass "p" {
void vert() { gl_Position = vec4(0.0); }
VertexShader = vert;
} } }`);
    const valid = ShaderSourceParser.parseWithErrors(shader(""));
    expect(invalid.errors.some((error) => error.message.includes("both VertexShader and FragmentShader"))).to.equal(
      true
    );
    expect(valid.errors).to.be.empty;
  });

  it("keeps the first entry binding and its source range", () => {
    const source = `Shader "entry" { SubShader "s" { Pass "p" {
VertexShader = firstVert;
VertexShader = secondVert;
FragmentShader = frag;
void firstVert() { gl_Position = vec4(0.0); }
void secondVert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
} } }`;
    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    expect(pass.vertexEntry).to.equal("firstVert");
    expect(pass.vertexEntryLocation!.start.index).to.equal(source.indexOf("firstVert"));
  });

  it("does not let a prior source-structure error suppress an independent pass compile", () => {
    const compiler = new ShaderCompiler();
    expect(() =>
      compiler._parseShaderSource(`Shader "bad" { SubShader "s" { Pass "p" {
void vert() { gl_Position = vec4(0.0); }
VertexShader = vert;
} } }`)
    ).to.throw("Pass must bind both VertexShader and FragmentShader entries");
    expect(
      compiler._parseShaderPass(
        "void vert() { gl_Position = vec4(0.0); } void frag() { gl_FragColor = vec4(1.0); }",
        "vert",
        "frag",
        ShaderLanguage.GLSLES100,
        ""
      )
    ).to.not.be.undefined;
  });

  it("rejects precompilation when an invalid RenderState property was discarded", () => {
    const source = `Shader "invalid-state" { SubShader "s" { Pass "p" {
BlendState blend { NotARealProperty = true; }
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    expect(() => new ShaderCompiler()._precompile(source, ShaderLanguage.GLSLES100, "")).to.throw(
      "Invalid render state property"
    );
  });

  it("rejects precompilation after a duplicate entry assignment", () => {
    const source = `Shader "duplicate-entry" { SubShader "s" { Pass "p" {
void firstVert() { gl_Position = vec4(0.0); }
void secondVert() { gl_Position = vec4(1.0); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = firstVert;
VertexShader = secondVert;
FragmentShader = frag;
} } }`;
    expect(() => new ShaderCompiler()._precompile(source, ShaderLanguage.GLSLES100, "")).to.throw(
      "Reassignment of VertexShader entry"
    );
  });

  it("does not let a dead macro branch satisfy the vertex-position requirement", () => {
    const result = ShaderAnalyzer.analyze(`Shader "dead-position" { SubShader "s" { Pass "p" {
struct Attributes { vec3 POSITION; };
void vert(Attributes attr) {
#if 0
  gl_Position = vec4(attr.POSITION, 1.0);
#endif
}
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("MissingVertexPosition");
  });

  it("does not treat a dead gl_FragColor write as an MRT conflict", () => {
    const result = ShaderAnalyzer.analyze(`Shader "dead-frag-color" { SubShader "s" { Pass "p" {
struct MRT { vec4 color; };
void vert() { gl_Position = vec4(0.0); }
MRT frag() {
  MRT outputValue;
  outputValue.color = vec4(1.0);
#if 0
  gl_FragColor = vec4(1.0);
#endif
  return outputValue;
}
VertexShader = vert;
FragmentShader = frag;
} } }`);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.not.include("GlFragColorWithMrt");
  });

  it("does not apply an opposite-stage struct role to a local with the same name", () => {
    const source = `Shader "stage-local" { SubShader "s" { Pass "p" {
struct Attributes { vec3 POSITION; };
struct Varyings { vec4 color; };
Varyings vert(Attributes input) {
  Varyings outputValue;
  outputValue.color = vec4(input.POSITION, 1.0);
  gl_Position = vec4(input.POSITION, 1.0);
  return outputValue;
}
void frag(Varyings varyingInput) {
  float input = varyingInput.color.x;
  gl_FragColor = vec4(input.x);
}
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const result = ShaderAnalyzer.analyze(source);
    expect(result.diagnostics, JSON.stringify(result.diagnostics)).to.be.empty;
    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    const generated = new ShaderCompiler()._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES100,
      ""
    );
    expect(generated!.fragment).to.include("input.x");
  });
});
