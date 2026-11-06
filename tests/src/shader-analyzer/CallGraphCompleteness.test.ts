import { DiagnosticType, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { describe, expect, it } from "vitest";

function shader(helpers: string, vertex: string, fragment = "gl_FragColor = vec4(1.0);"): string {
  return `Shader "call-graph-completeness" { SubShader "s" { Pass "p" {
${helpers}
void vert() { ${vertex} }
void frag() { ${fragment} }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function names(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `helper${String(index).padStart(3, "0")}`);
}

function callAll(functions: readonly string[]): string {
  return functions.map((name) => `${name}();`).join(" ");
}

function conditionalDiamond(depth: number): string {
  let helpers = "void leaf() { float value = dFdx(1.0); }\n";
  for (let index = 0; index < depth; index++) {
    const callee = index ? `layer${index - 1}` : "leaf";
    helpers += `void layer${index}() {
#ifdef OPTION${index}
${callee}();
#else
${callee}();
#endif
}\n`;
  }
  return shader(helpers, `layer${depth - 1}(); gl_Position = vec4(0.0);`);
}

describe("complete call-graph diagnostics", () => {
  it.each([255, 256, 300])("retains diagnostics after %i repeated calls", (count) => {
    const helpers = "void harmless() {}\nvoid bad() { float value = dFdx(1.0); }";
    const repeated = callAll(Array(count).fill("harmless"));
    for (const calls of [`bad(); ${repeated}`, `${repeated} bad();`]) {
      const diagnostics = ShaderAnalyzer.analyze(shader(helpers, `${calls} gl_Position = vec4(0.0);`)).diagnostics;
      expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([DiagnosticType.DerivativeInVertexShader]);
    }
  });

  it.each([255, 256, 300])("retains every one of %i different reachable errors", (count) => {
    const functions = names(count);
    const helpers = functions.map((name) => `void ${name}() { float value = dFdx(1.0); }`).join("\n");
    for (const order of [functions, functions.slice().reverse(), functions.concat(functions)]) {
      const diagnostics = ShaderAnalyzer.analyze(
        shader(helpers, `${callAll(order)} gl_Position = vec4(0.0);`)
      ).diagnostics;
      expect(diagnostics).toHaveLength(count);
      expect(diagnostics.every((diagnostic) => diagnostic.code === DiagnosticType.DerivativeInVertexShader)).toBe(true);
      expect(new Set(diagnostics.map((diagnostic) => diagnostic.range.start.offset)).size).toBe(count);
    }
  });

  it.each([false, true])("completes write coverage through 300 distinct functions, writes: %s", (writes) => {
    const functions = names(300);
    const helpers = functions
      .map(
        (name, index) =>
          `void ${name}() { ${index ? `${functions[index - 1]}();` : writes ? "gl_Position = vec4(0.0);" : ""} }`
      )
      .join("\n");
    expect(
      ShaderAnalyzer.analyze(shader(helpers, `${functions[299]}();`)).diagnostics.map((diagnostic) => diagnostic.code)
    ).toEqual(writes ? [] : [DiagnosticType.MissingVertexPosition]);
  });

  it("retains legacy output conflicts after more than 255 distinct helpers", () => {
    const functions = names(300);
    const helpers =
      functions.map((name) => `void ${name}() {}`).join("\n") +
      "\nvoid color() { gl_FragColor = vec4(1.0); }\nvoid outputs() { gl_FragData[0] = vec4(1.0); }";
    for (const order of [functions, functions.slice().reverse()]) {
      const diagnostics = ShaderAnalyzer.analyze(
        shader(helpers, "gl_Position = vec4(0.0);", `color(); ${callAll(order)} outputs();`)
      ).diagnostics;
      expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([DiagnosticType.LegacyFragmentOutputConflict]);
    }
  });

  it.each([8, 12, 16])("merges complete sibling calls through a diamond of depth %i", (depth) => {
    const diagnostics = ShaderAnalyzer.analyze(conditionalDiamond(depth)).diagnostics;
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([DiagnosticType.DerivativeInVertexShader]);
  });

  it.each([256, 257])("retains %i independent conditional paths without truncation", (count) => {
    const calls = Array.from({ length: count }, (_, index) => `#ifdef OPTION${index}\nleaf();\n#endif`).join("\n");
    const source = shader("void leaf() { float value = dFdx(1.0); }", `\n${calls}\ngl_Position = vec4(0.0);`);
    const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
    expect(
      diagnostics.filter((diagnostic) => diagnostic.code === DiagnosticType.DerivativeInVertexShader)
    ).toHaveLength(1);
    expect(diagnostics.every((diagnostic) => diagnostic.severity === "error")).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.code === DiagnosticType.MissingVertexPosition)).toBe(false);
  });

  it("does not merge an incomplete sibling set", () => {
    const source = shader(
      "void position() { gl_Position = vec4(0.0); }",
      "\n#ifdef OPTION\nposition();\n#else\n#endif"
    );
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticType.MissingVertexPosition
    ]);
  });

  it("retains an outer condition after merging complete inner siblings", () => {
    const source = shader(
      "void position() { gl_Position = vec4(0.0); }",
      `
#ifdef OUTER
#ifdef INNER
position();
#else
position();
#endif
#endif`
    );
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticType.MissingVertexPosition
    ]);
  });

  it("merges nested sibling paths while retaining their incomplete outer guard", () => {
    let helpers = "void layer0() { gl_Position = vec4(0.0); }\n";
    for (let index = 1; index <= 16; index++) {
      helpers += `void layer${index}() {
#ifdef OUTER
#ifdef INNER${index}
layer${index - 1}();
#else
layer${index - 1}();
#endif
#endif
}\n`;
    }
    expect(
      ShaderAnalyzer.analyze(shader(helpers, "layer16();")).diagnostics.map((diagnostic) => diagnostic.code)
    ).toEqual([DiagnosticType.MissingVertexPosition]);
  });

  it("does not merge equal macro names across mutations and distinct conditional groups", () => {
    const source = shader(
      "void position() { gl_Position = vec4(0.0); }",
      `
#ifdef OPTION
position();
#else
#endif
#undef OPTION
#define OPTION
#ifdef OPTION
#else
position();
#endif`
    );
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticType.MissingVertexPosition
    ]);
  });

  it("keeps previously unknown macro paths silent instead of claiming a missing write", () => {
    const source = shader("void position() { gl_Position = vec4(0.0); }", "\n#if UNKNOWN(1)\nposition();\n#endif");
    const codes = ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).not.toContain(DiagnosticType.MissingVertexPosition);
  });
});
