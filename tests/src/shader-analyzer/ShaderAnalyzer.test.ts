import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import type { Diagnostic } from "@galacean/engine-shader-analyzer";
import { server } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";

const { readFile } = server.commands;

describe("ShaderAnalyzer", () => {
  const analyzer = new ShaderAnalyzer();

  it("surfaces a macro author error as a structured diagnostic", async () => {
    const source = await readFile("../shader-compiler/shaders/macro-author-error-unbalanced-paren.shader");
    const { diagnostics } = analyzer.analyze(source);
    expect(diagnostics.length).to.be.greaterThan(0);
    const d = diagnostics[0];
    expect(d.code).to.equal("A1-01");
    expect(d.severity).to.equal("error");
    expect(d.message).to.include("#define BAD");
    expect(d.range.start.line).to.be.greaterThan(0);
    expect(d.source).to.equal("galacean-shader-analyzer");
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

  it("surfaces a codegen-level diagnostic (gl_FragData) with structured code", () => {
    const source = `Shader "codegen" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragData[0] = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const { diagnostics } = analyzer.analyze(source);
    expect(diagnostics.length).to.be.greaterThan(0);
    const fragDataDiag = diagnostics.find((d: Diagnostic) => d.message.includes("gl_FragData"));
    expect(fragDataDiag).to.be.ok;
    expect(fragDataDiag!.code).to.equal("C0-12");
  });

  it("surfaces an undeclared identifier as a warning diagnostic", () => {
    const source = `Shader "c2" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(undeclared_color, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const { diagnostics } = analyzer.analyze(source);
    const warn = diagnostics.find((d: Diagnostic) => d.code === "C0-07");
    expect(warn, "expected a C0-07 warning for the undeclared identifier").to.be.ok;
    expect(warn!.severity).to.equal("warning");
    expect(warn!.message).to.include("undeclared_color");
    expect(warn!.range.start.line).to.be.greaterThan(0);
  });
});
