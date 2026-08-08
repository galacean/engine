import { Logger, ShaderLanguage } from "@galacean/engine-core";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it, vi } from "vitest";

const passWithIssue = `
struct Attributes { vec3 POSITION; };
struct Varyings { vec4 color; };
Varyings vert(Attributes attr) { Varyings o; o.color = vec4(attr.POSITION, 1.0); return o; }
void frag(Varyings i) { gl_FragColor = i.notAField; }`;

describe("standalone analyzer and runtime compiler", () => {
  it("reports an analyzer error without blocking compiler code generation", () => {
    const source = `Shader "separate" { SubShader "Default" { Pass "p" {
${passWithIssue}
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
    expect(diagnostics.some((diagnostic) => diagnostic.code === "UndeclaredStructMember")).to.be.true;

    const output = new ShaderCompiler()._parseShaderPass(passWithIssue, "vert", "frag", ShaderLanguage.GLSLES300, "");
    expect(output, "diagnostics are not a compiler gate").to.not.be.undefined;
  });

  it("preserves a valid condition that is opaque to branch reasoning", () => {
    const pass = `
#if A + B > 1
float branchValue;
#else
vec3 branchValue;
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }`;
    const output = new ShaderCompiler()._parseShaderPass(pass, "vert", "frag", ShaderLanguage.GLSLES300, "");
    expect(output).to.not.be.undefined;
    expect(output!.vertex).to.include("#if A + B > 1");
    expect(output!.fragment).to.include("#if A + B > 1");
  });

  it("parses and emits legal non-square matrix types", () => {
    const pass = `
mat2x3 makeMatrix() { return mat2x3(1.0); }
void vert() {
  mat3x2 transposed = transpose(makeMatrix());
  gl_Position = vec4(transposed[0][0]);
}
void frag() { gl_FragColor = vec4(1.0); }`;
    const output = new ShaderCompiler()._parseShaderPass(pass, "vert", "frag", ShaderLanguage.GLSLES300, "");
    expect(output).to.not.be.undefined;
    expect(output!.vertex).to.include("mat2x3 makeMatrix");
    expect(output!.vertex).to.include("mat3x2 transposed");

    const source = `Shader "matrix" { SubShader "Default" { Pass "p" {
${pass}
VertexShader = vert;
FragmentShader = frag;
} } }`;
    expect(ShaderAnalyzer.analyze(source).diagnostics).to.have.lengthOf(0);
  });

  it("still rejects a missing include as a preprocessing failure", () => {
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    try {
      const output = new ShaderCompiler()._parseShaderPass(
        '#include "missing.glsl"\nvoid vert() { gl_Position = vec4(0.0); }\nvoid frag() { gl_FragColor = vec4(1.0); }',
        "vert",
        "frag",
        ShaderLanguage.GLSLES300,
        ""
      );
      expect(output).to.be.undefined;
    } finally {
      errorSpy.mockRestore();
    }
  });
});
