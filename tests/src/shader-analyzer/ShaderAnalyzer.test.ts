import { DiagnosticSeverity, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import type { Diagnostic } from "@galacean/engine-shader-analyzer";
import { Logger } from "@galacean/engine-core";
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
    expect(d.code).to.equal("SyntaxError");
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
    expect(fragDataDiag!.code).to.equal("GlFragData");
  });

  it("surfaces an undeclared identifier as an error diagnostic", () => {
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
    const err = diagnostics.find((d: Diagnostic) => d.code === "UseBeforeDeclaration");
    expect(err, "expected a C0-07 error for the undeclared identifier").to.be.ok;
    expect(err!.severity).to.equal("error");
    expect(err!.message).to.include("undeclared_color");
    expect(err!.range.start.line).to.be.greaterThan(0);
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
    const undef = diagnostics.find((d: Diagnostic) => d.code === "UndefinedFunction");
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
    const redef = diagnostics.find((d: Diagnostic) => d.code === "Redefinition");
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
    const redef = diagnostics.find((d: Diagnostic) => d.code === "Redefinition");
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
    const sw = diagnostics.find((d: Diagnostic) => d.code === "InvalidSwizzle");
    expect(sw, "expected a C1-01 swizzle diagnostic").to.be.ok;
    expect(sw!.message).to.include("out of range");
  });

  it("reports an incompatible-type assignment (C1-02)", () => {
    const source = `Shader "c1-02" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() {
        float a = 1.0;
        vec3 b = vec3(0.0, 0.0, 0.0);
        a = b;
        gl_FragColor = vec4(a, a, a, 1.0);
      }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const { diagnostics } = analyzer.analyze(source);
    const mismatch = diagnostics.find((d: Diagnostic) => d.code === "AssignTypeMismatch");
    expect(mismatch, "expected a C1-02 type-mismatch diagnostic").to.be.ok;
    expect(mismatch!.message).to.include("float");
  });

  it("does not flag a valid implicit conversion (int -> float)", () => {
    const source = `Shader "implicit" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() {
        float a = 0.0;
        int i = 1;
        a = i;
        gl_FragColor = vec4(a, a, a, 1.0);
      }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const { diagnostics } = analyzer.analyze(source);
    const mismatch = diagnostics.find((d: Diagnostic) => d.code === "AssignTypeMismatch");
    expect(mismatch, "int -> float is a valid implicit conversion, must not flag").to.be.undefined;
  });

  it("reports a return type that does not match the function (C1-03)", () => {
    const source = `Shader "c1-03" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      vec3 getColor() { return 1.0; }
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(getColor(), 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const { diagnostics } = analyzer.analyze(source);
    const ret = diagnostics.find((d: Diagnostic) => d.code === "ReturnTypeMismatch");
    expect(ret, "expected a C1-03 return-type diagnostic").to.be.ok;
    expect(ret!.message).to.include("vec3");
  });

  it("does not flag a return value that implicitly converts (int -> float)", () => {
    const source = `Shader "ret-implicit" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      float getF() { return 1; }
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(getF(), 0.0, 0.0, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const { diagnostics } = analyzer.analyze(source);
    const ret = diagnostics.find((d: Diagnostic) => d.code === "ReturnTypeMismatch");
    expect(ret, "int -> float return is a valid implicit conversion").to.be.undefined;
  });

  it("isolates analyze() calls — a prior parse failure must not corrupt the next", () => {
    // The extra `)` is a GLSL syntax error, so parser.parse() bails early (returns null) — which
    // used to leave the shared singleton parser's trace stack / macro level dirty.
    const broken = `Shader "broken" {
  SubShader "Default" {
    Pass "test" {
      void frag() { gl_FragColor = vec4(1.0)) ; }
      FragmentShader = frag;
    }
  }
}`;
    const brokenResult = analyzer.analyze(broken);
    expect(brokenResult.diagnostics.length, "the broken shader should produce a diagnostic").to.be.greaterThan(0);

    // The same valid shader must be clean afterwards — proving the failed parse left no residue.
    const valid = `Shader "valid" {
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
    const { diagnostics } = analyzer.analyze(valid);
    expect(diagnostics, "a valid shader must stay clean even after a prior parse failure").to.be.empty;
  });

  it("runs a registered custom rule and namespaces its code", () => {
    const ra = new ShaderAnalyzer();
    ra.registerRule({
      name: "myteam/no-discard",
      check(ctx) {
        const idx = ctx.source.indexOf("discard");
        if (idx >= 0) {
          ctx.report({
            severity: DiagnosticSeverity.Warning,
            code: "banned",
            message: "`discard` is banned by team policy.",
            range: { start: ctx.positionAt(idx), end: ctx.positionAt(idx + 7) }
          });
        }
      }
    });
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { discard; gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const custom = ra.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "myteam/no-discard/banned");
    expect(custom, "expected the namespaced custom-rule diagnostic").to.be.ok;
    expect(custom!.severity).to.equal("warning");
    expect(custom!.message).to.include("discard");
    expect(custom!.range.start.line).to.be.greaterThan(0);
  });

  it("does not let a throwing custom rule break analysis", () => {
    const ra = new ShaderAnalyzer();
    ra.registerRule({
      name: "bad",
      check() {
        throw new Error("boom");
      }
    });
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const ruleError = ra.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "bad/rule-error");
    expect(ruleError, "a throwing rule surfaces a rule-error diagnostic instead of crashing").to.be.ok;
    expect(ruleError!.severity).to.equal("warning");
  });

  it("prints diagnostics through Logger", () => {
    const ra = new ShaderAnalyzer();
    const logged: string[] = [];
    const origError = Logger.error;
    Logger.error = (...args: unknown[]) => {
      logged.push(args.join(" "));
    };
    try {
      ra.analyze(`Shader "log" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(doesNotExist(1.0)); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`);
    } finally {
      Logger.error = origError;
    }
    expect(
      logged.some((l) => l.includes("doesNotExist")),
      "the analyzer should print the diagnostic via Logger"
    ).to.be.true;
  });
});
