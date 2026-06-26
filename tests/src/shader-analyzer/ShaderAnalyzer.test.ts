import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import type { Diagnostic } from "@galacean/engine-shader-analyzer";
import { Logger } from "@galacean/engine-core";
import { server } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";

const { readFile } = server.commands;

describe("ShaderAnalyzer", () => {
  const analyzer = new ShaderAnalyzer();

  it("surfaces a macro author error as a structured diagnostic", async () => {
    const source = await readFile("src/shader-compiler/shaders/macro-author-error-unbalanced-paren.shader");
    const { diagnostics } = analyzer.analyze(source);
    expect(diagnostics.length).to.be.greaterThan(0);
    const d = diagnostics[0];
    expect(d.code).to.equal("SyntaxError");
    expect(d.severity).to.equal("error");
    expect(d.message).to.include("#define BAD");
    expect(d.range.start.line).to.be.greaterThan(0);
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

  it("flags a Pass that does not bind both vertex and fragment entries (MissingEntry)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
    }
  }
}`;
    const diag = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MissingEntry");
    expect(diag, "a Pass missing FragmentShader must report MissingEntry").to.be.ok;
    expect(diag!.severity).to.equal("error");
    expect(diag!.range.start.line, "diagnostic points at the Pass").to.be.greaterThan(0);
  });

  it("does not flag a Pass that binds both entries", () => {
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
    const diag = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MissingEntry");
    expect(diag, "a Pass binding both entries must not report MissingEntry").to.be.undefined;
  });

  it("flags a non-bool 'if' condition (NonBoolCondition)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float a = 1.0; if (a) { gl_FragColor = vec4(0.0); } }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonBoolCondition");
    expect(diag, "if (float) must report NonBoolCondition").to.be.ok;
    expect(diag!.severity).to.equal("error");
    expect(diag!.range.start.line, "diagnostic points at the condition").to.be.greaterThan(0);
  });

  it("does not flag a bool 'if' condition", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float a = 1.0; if (a > 0.0) { gl_FragColor = vec4(0.0); } }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonBoolCondition");
    expect(diag, "if (bool) must not report NonBoolCondition").to.be.undefined;
  });

  it("flags a directly recursive function (RecursiveFunction)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      float fib(float x) { return fib(x); }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diags = analyzer.analyze(source).diagnostics;
    const rec = diags.find((d: Diagnostic) => d.code === "RecursiveFunction");
    expect(rec, "a self-calling function must report RecursiveFunction").to.be.ok;
    expect(rec!.severity).to.equal("error");
    expect(
      diags.find((d: Diagnostic) => d.code === "UndefinedFunction"),
      "recursion must not be mis-reported as UndefinedFunction"
    ).to.be.undefined;
  });

  it("does not flag a non-recursive function", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      float dbl(float x) { return x + x; }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(dbl(0.5)); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const rec = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "RecursiveFunction");
    expect(rec, "a non-recursive function must not report RecursiveFunction").to.be.undefined;
  });

  it("does not flag a call to a different overload of the same name", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      float pick(float x) { return x; }
      float pick(vec2 v) { return pick(v.x); }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const rec = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "RecursiveFunction");
    expect(rec, "calling a different overload of the same name is not recursion").to.be.undefined;
  });

  it("flags a sampler return type (NonConstructibleReturnType)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      mediump sampler2D u_tex;
      struct Attributes { vec3 POSITION; };
      sampler2D getTex() { return u_tex; }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonConstructibleReturnType");
    expect(diag, "a function returning a sampler must report NonConstructibleReturnType").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag a normal return type", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      float getX() { return 1.0; }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(getX()); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonConstructibleReturnType");
    expect(diag, "a normal return type must not report NonConstructibleReturnType").to.be.undefined;
  });

  it("flags a struct-typed member in an IO struct (NestedIOStruct)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      struct Inner { vec4 v; };
      struct Varyings { Inner nested; };
      Varyings vert(Attributes attr) { Varyings o; o.nested.v = vec4(attr.POSITION, 1.0); return o; }
      void frag(Varyings i) { gl_FragColor = i.nested.v; }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NestedIOStruct");
    expect(diag, "a struct member of an IO struct must report NestedIOStruct").to.be.ok;
    expect(diag!.severity).to.equal("error");
    expect(diag!.message).to.include("nested");
  });

  it("does not flag an IO struct with only primitive members", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      struct Varyings { vec4 v; };
      Varyings vert(Attributes attr) { Varyings o; o.v = vec4(attr.POSITION, 1.0); return o; }
      void frag(Varyings i) { gl_FragColor = i.v; }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NestedIOStruct");
    expect(diag, "a flat IO struct must not report NestedIOStruct").to.be.undefined;
  });

  it("flags division by a constant zero (ConstDivideByZero)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float x = 1.0 / 0.0; gl_FragColor = vec4(x); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ConstDivideByZero");
    expect(diag, "division by constant zero must report ConstDivideByZero").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag division by a non-zero constant", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float x = 1.0 / 2.0; gl_FragColor = vec4(x); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = analyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ConstDivideByZero");
    expect(diag, "division by a non-zero constant must not report ConstDivideByZero").to.be.undefined;
  });
});
