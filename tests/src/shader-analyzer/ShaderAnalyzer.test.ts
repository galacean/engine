import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { server } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";

const { readFile } = server.commands;

describe("ShaderAnalyzer", () => {
  const analyzer = new ShaderAnalyzer();

  it("surfaces a macro author error as a diagnostic (parity with verbose compiler)", async () => {
    const source = await readFile("../shader-compiler/shaders/macro-author-error-unbalanced-paren.shader");
    const { diagnostics } = analyzer.analyze(source);
    expect(diagnostics.length).to.be.greaterThan(0);
    const messages = diagnostics.map((d) => d.message).join("\n");
    expect(messages).to.match(/#define BAD: invalid replacement list/);
    expect(messages).to.include("u_a(");
  });

  it("yields no diagnostics for a valid self-contained shader", () => {
    const source = `Shader "valid" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      float u_a;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const { diagnostics } = analyzer.analyze(source);
    expect(diagnostics).to.be.empty;
  });
});
