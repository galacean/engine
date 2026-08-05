import { DiagnosticSeverity, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { describe, expect, it } from "vitest";

function shader(condition: string): string {
  return `Shader "condition" {
  SubShader "Default" {
    Pass "p" {
      #if ${condition}
        float branchValue;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
}

describe("preprocessor expression diagnostics", () => {
  for (const condition of ["A + B > 1", "defined(A) && (B << 2) >= 4", "A ? B : C", "~A & 0xffu", "A || B && C"]) {
    it(`accepts valid ESSL syntax without evaluating '${condition}'`, () => {
      const diagnostics = new ShaderAnalyzer().analyze(shader(condition)).diagnostics;
      expect(diagnostics.filter((diagnostic) => diagnostic.code === "PreprocessorError")).to.be.empty;
    });
  }

  for (const [condition, token] of [
    ["123 defined(A)", "defined"],
    ["defined()", "macro name"],
    ["A +", "operand"],
    ["A + * B", "operand"]
  ]) {
    it(`reports provably malformed syntax '${condition}'`, () => {
      const diagnostic = new ShaderAnalyzer()
        .analyze(shader(condition), { file: "condition.shader" })
        .diagnostics.find((candidate) => candidate.code === "PreprocessorError");
      expect(diagnostic).to.be.ok;
      expect(diagnostic!.message).to.include(token);
      expect(diagnostic!.file).to.equal("condition.shader");
      expect(diagnostic!.range.start.line).to.equal(4);
    });
  }

  it("points at the unexpected token in a malformed expression", () => {
    const source = shader("123 defined(A)");
    const diagnostic = new ShaderAnalyzer()
      .analyze(source)
      .diagnostics.find((candidate) => candidate.code === "PreprocessorError");
    expect(diagnostic).to.be.ok;
    expect(source.slice(diagnostic!.range.start.offset, diagnostic!.range.end.offset)).to.equal("defined");
  });

  it("does not reject adjacent unknown macro tokens that expansion may make valid", () => {
    const diagnostics = new ShaderAnalyzer().analyze(shader("A CONDITION_TAIL")).diagnostics;
    expect(
      diagnostics.filter((diagnostic) => diagnostic.code === "PreprocessorError"),
      JSON.stringify(diagnostics)
    ).to.be.empty;
  });

  it("does not reject a function-like macro invocation before expansion", () => {
    const source = shader("IS_SET(A)").replace(
      "#if IS_SET(A)",
      "#define IS_SET(value) ((value) > 0)\n      #if IS_SET(A)"
    );
    const diagnostics = new ShaderAnalyzer().analyze(source).diagnostics;
    expect(
      diagnostics.filter((diagnostic) => diagnostic.code === "PreprocessorError"),
      JSON.stringify(diagnostics)
    ).to.be.empty;
  });

  it("contains an unexpected validator failure as a diagnostic", () => {
    const nestedCondition = `${"(".repeat(20000)}1${")".repeat(20000)}`;
    expect(() => new ShaderAnalyzer().analyze(shader(nestedCondition))).to.not.throw();
  });

  it("ignores preprocessor-looking text inside comments", () => {
    const source = shader("A")
      .replace("#if A", "/* #if 123 defined(A) */\n      #if A")
      .replace("#endif", "#endif\n      // #elif 123 defined(A)");
    const diagnostics = new ShaderAnalyzer().analyze(source).diagnostics;
    expect(diagnostics.filter((diagnostic) => diagnostic.code === "PreprocessorError")).to.be.empty;
  });

  it("validates a backslash-continued expression as one logical line", () => {
    const source = shader("A && \\\n        defined(B)");
    const diagnostics = new ShaderAnalyzer().analyze(source).diagnostics;
    expect(
      diagnostics.filter((diagnostic) => diagnostic.code === "PreprocessorError"),
      JSON.stringify(diagnostics)
    ).to.be.empty;
  });

  it("does not diagnose valid token-fragment macro replacement lists", () => {
    const source = shader("A").replace(
      "#if A",
      "#define ADD +\n      #define OPEN (\n      #define TRAILING value +\n      #if A"
    );
    const diagnostics = new ShaderAnalyzer().analyze(source).diagnostics;
    expect(
      diagnostics.filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error),
      JSON.stringify(diagnostics)
    ).to.be.empty;
  });

  it("maps semantic diagnostics back to the full ShaderLab source", () => {
    const source = `Shader "mapping" {
  float headerValue;
  SubShader "Default" {
    float subValue;
    Pass "p" {
      float branchValue;
      float branchValue;
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(branchValue); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diagnostic = new ShaderAnalyzer()
      .analyze(source, { file: "mapping.shader" })
      .diagnostics.find((candidate) => candidate.code === "Redefinition");
    expect(diagnostic).to.be.ok;
    expect(diagnostic!.range.start.line).to.equal(7);
    expect(diagnostic!.range.start.column).to.equal(13);
    expect(diagnostic!.file).to.equal("mapping.shader");
  });
});
