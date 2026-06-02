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

  it("reports an undefined function call distinctly from an overload mismatch", () => {
    const source = `Shader "c0-09" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = doesNotExist(1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const { diagnostics } = analyzer.analyze(source);
    const undef = diagnostics.find((d: Diagnostic) => d.code === "C0-09");
    expect(undef, "expected a C0-09 undefined-function diagnostic").to.be.ok;
    expect(undef!.severity).to.equal("error");
    expect(undef!.message).to.include("doesNotExist");
  });

  it("warns on a variable redeclared in the same scope", () => {
    const source = `Shader "c0-10" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      float u_a;
      float u_a;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(u_a); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const { diagnostics } = analyzer.analyze(source);
    const redef = diagnostics.find((d: Diagnostic) => d.code === "C0-10");
    expect(redef, "expected a C0-10 redefinition warning").to.be.ok;
    expect(redef!.severity).to.equal("warning");
    expect(redef!.message).to.include("u_a");
  });

  it("does not flag the same name across exclusive macro branches", () => {
    const source = `Shader "macro-arms" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() {
        #ifdef FOO
          float c = 1.0;
        #else
          float c = 0.0;
        #endif
        gl_FragColor = vec4(c);
      }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const { diagnostics } = analyzer.analyze(source);
    const redef = diagnostics.find((d: Diagnostic) => d.code === "C0-10");
    expect(redef, "macro-arm siblings must not be flagged as redefinition").to.be.undefined;
  });

  it("reports an out-of-range vector swizzle", () => {
    const source = `Shader "c1-01" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      vec2 u_uv;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(u_uv.z, 0.0, 0.0, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const { diagnostics } = analyzer.analyze(source);
    const sw = diagnostics.find((d: Diagnostic) => d.code === "C1-01");
    expect(sw, "expected a C1-01 swizzle diagnostic").to.be.ok;
    expect(sw!.message).to.include("out of range");
  });
});
