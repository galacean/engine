import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import type { Diagnostic } from "@galacean/engine-shader-analyzer";
import { server } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";

const { readFile } = server.commands;

describe("ShaderAnalyzer", () => {
  it("keeps the static API callable without a class receiver", () => {
    const analyze = ShaderAnalyzer.analyze;
    const source = `Shader "detached-static" { SubShader "Default" { Pass "p" {
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;
    } } }`;

    expect(analyze(source).diagnostics).to.be.empty;
  });

  it("accepts legal preprocessing-token fragments as macro replacement lists", async () => {
    for (const name of ["trailing-comma", "unbalanced-bracket", "unbalanced-paren"]) {
      const source = await readFile(`tests/src/shader-compiler/shaders/macro-token-fragment-${name}.shader`);
      const { diagnostics } = ShaderAnalyzer.analyze(source);
      expect(
        diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
        `${name} is legal until its expansion site forms an invalid shader`
      ).to.be.empty;
    }
  });

  it("defers macro replacement-list references to the expansion site", () => {
    const unused = `Shader "macro" { SubShader "s" { Pass "p" {
      #define VALUE value
      float value;
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;
    } } }`;
    expect(ShaderAnalyzer.analyze(unused).diagnostics).to.be.empty;

    const expanded = unused.replace("vec4(1.0)", "vec4(VALUE)");
    expect(ShaderAnalyzer.analyze(expanded).diagnostics).to.be.empty;

    const missing = expanded.replace("float value;", "");
    const diagnostic = ShaderAnalyzer.analyze(missing).diagnostics.find(
      (candidate) => candidate.code === "UnknownVariable"
    );
    expect(diagnostic).to.be.ok;
    expect(diagnostic!.range.start.line).to.equal(5);
    expect(diagnostic!.range.start.column).to.equal(41);
  });

  it("continues checking a replacement list after a macro-defined reference", () => {
    const source = `Shader "macro-references" { SubShader "s" { Pass "p" {
      #define KNOWN_VALUE 1.0
      #define COMBINED_VALUE KNOWN_VALUE + missingValue
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(COMBINED_VALUE); }
      VertexShader = vert; FragmentShader = frag;
    } } }`;
    const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
    const unknown = diagnostics.filter((diagnostic) => diagnostic.code === "UnknownVariable");
    expect(unknown, JSON.stringify(diagnostics)).to.have.lengthOf(1);
    expect(unknown[0].message).to.include("missingValue");
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
    const { diagnostics } = ShaderAnalyzer.analyze(source);
    expect(diagnostics).to.be.empty;
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
    const { diagnostics } = ShaderAnalyzer.analyze(source);
    const err = diagnostics.find((d: Diagnostic) => d.code === "UnknownVariable");
    expect(err, "expected a warning for the undeclared identifier").to.be.ok;
    expect(err!.severity).to.equal("warning");
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
    const { diagnostics } = ShaderAnalyzer.analyze(source);
    const undef = diagnostics.find((d: Diagnostic) => d.code === "UndefinedFunction");
    expect(undef, "expected a C0-09 undefined-function diagnostic").to.be.ok;
    // Warning — an unknown function name may resolve to a builtin from a runtime macro / conditional
    // #include that precompile doesn't see. Overload mismatch on a known name is still an error.
    expect(undef!.severity).to.equal("warning");
    expect(undef!.message).to.include("doesNotExist");
  });

  it("rejects a variable redeclared in the same scope (first-wins, spec alignment)", () => {
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
    const { diagnostics } = ShaderAnalyzer.analyze(source);
    const redef = diagnostics.find((d: Diagnostic) => d.code === "Redefinition");
    expect(redef, "expected a C0-10 redefinition error").to.be.ok;
    expect(redef!.severity).to.equal("error");
    expect(redef!.message).to.include("u_a");
  });

  it("reports redefinition without exposing a codegen gate", () => {
    const source = `Shader "first-wins" {
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
    const { diagnostics } = ShaderAnalyzer.analyze(source);
    const redef = diagnostics.find((d: Diagnostic) => d.code === "Redefinition");
    expect(redef).to.be.ok;
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
    const { diagnostics } = ShaderAnalyzer.analyze(source);
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
    const { diagnostics } = ShaderAnalyzer.analyze(source);
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
    const { diagnostics } = ShaderAnalyzer.analyze(source);
    const mismatch = diagnostics.find((d: Diagnostic) => d.code === "AssignTypeMismatch");
    expect(mismatch, "expected a C1-02 type-mismatch diagnostic").to.be.ok;
    expect(mismatch!.message).to.include("float");
  });

  it("flags an int-to-float assignment as AssignTypeMismatch (§4 no implicit conversions)", () => {
    // GLSL ES §4 states the language has no implicit type conversions; §5.8 requires assignment
    // operands to have the same type. A real driver rejects `a = i;` where a:float, i:int with
    // "cannot convert from 'const int' to 'mediump float'". The analyzer must match.
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
    const { diagnostics } = ShaderAnalyzer.analyze(source);
    const mismatch = diagnostics.find((d: Diagnostic) => d.code === "AssignTypeMismatch");
    expect(mismatch, "int -> float has no implicit conversion — must flag AssignTypeMismatch").to.be.ok;
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
    const { diagnostics } = ShaderAnalyzer.analyze(source);
    const ret = diagnostics.find((d: Diagnostic) => d.code === "InvalidReturnType");
    expect(ret, "expected a C1-03 return-type diagnostic").to.be.ok;
    expect(ret!.message).to.include("vec3");
  });

  it("flags an int-returning literal from a float-returning function (§4 no implicit conversions)", () => {
    // Same rationale as the int→float assignment check: no implicit conversion in return
    // statements either. `return 1;` from a `float`-returning function is an InvalidReturnType.
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
    const { diagnostics } = ShaderAnalyzer.analyze(source);
    const ret = diagnostics.find((d: Diagnostic) => d.code === "InvalidReturnType");
    expect(ret, "int -> float return is not a valid implicit conversion — must flag").to.be.ok;
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
    const brokenResult = ShaderAnalyzer.analyze(broken);
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
    const { diagnostics } = ShaderAnalyzer.analyze(valid);
    expect(diagnostics, "a valid shader must stay clean even after a prior parse failure").to.be.empty;
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
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MissingEntry");
    expect(diag, "a Pass missing FragmentShader must report MissingEntry").to.be.ok;
    expect(diag!.severity).to.equal("error");
    expect(diag!.range.start.line, "diagnostic points at the Pass").to.equal(3);
    expect(diag!.range.start.column).to.equal(9);
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
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MissingEntry");
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
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonBoolCondition");
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
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonBoolCondition");
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
    const diags = ShaderAnalyzer.analyze(source).diagnostics;
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
    const rec = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "RecursiveFunction");
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
    const rec = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "RecursiveFunction");
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
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find(
      (d: Diagnostic) => d.code === "NonConstructibleReturnType"
    );
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
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find(
      (d: Diagnostic) => d.code === "NonConstructibleReturnType"
    );
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
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NestedIOStruct");
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
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NestedIOStruct");
    expect(diag, "a flat IO struct must not report NestedIOStruct").to.be.undefined;
  });

  it("flags integer division by a constant zero (ConstDivideByZero)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { int x = 1 / 0; gl_FragColor = vec4(float(x)); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ConstDivideByZero");
    expect(diag, "integer division by constant zero must report ConstDivideByZero").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag float division by a constant zero (1.0/0.0 is Inf, not an error)", () => {
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
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ConstDivideByZero");
    expect(diag, "float division by zero yields Inf, must not report ConstDivideByZero").to.be.undefined;
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
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ConstDivideByZero");
    expect(diag, "division by a non-zero constant must not report ConstDivideByZero").to.be.undefined;
  });

  it("flags a shift amount out of range (ShiftOutOfRange)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { int x = 1 << 40; gl_FragColor = vec4(float(x)); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ShiftOutOfRange");
    expect(diag, "a shift amount >= 32 must report ShiftOutOfRange").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag an in-range shift amount", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { int x = 1 << 4; gl_FragColor = vec4(float(x)); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ShiftOutOfRange");
    expect(diag, "an in-range shift must not report ShiftOutOfRange").to.be.undefined;
  });

  it("flags a constant vector index out of bounds (IndexOutOfBounds)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v = vec3(0.0); float y = v[5]; gl_FragColor = vec4(y); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "IndexOutOfBounds");
    expect(diag, "indexing a vec3 at 5 must report IndexOutOfBounds").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag an in-bounds vector index", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v = vec3(0.0); float y = v[1]; gl_FragColor = vec4(y); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "IndexOutOfBounds");
    expect(diag, "an in-bounds index must not report IndexOutOfBounds").to.be.undefined;
  });

  it("flags a constant array index out of bounds (IndexOutOfBounds)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float a[3]; float y = a[5]; gl_FragColor = vec4(y); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "IndexOutOfBounds");
    expect(diag, "indexing a 3-element array at 5 must report IndexOutOfBounds").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag an in-bounds array index", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float a[3]; float y = a[2]; gl_FragColor = vec4(y); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "IndexOutOfBounds");
    expect(diag, "an in-bounds array index must not report IndexOutOfBounds").to.be.undefined;
  });

  it("flags '!' applied to a non-bool (InvalidUnaryOperand)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float u_f = 1.0; bool ok = !u_f; gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "InvalidUnaryOperand");
    expect(diag, "'!' on a float must report InvalidUnaryOperand").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag a valid unary operand", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { bool b = true; bool ok = !b; gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "InvalidUnaryOperand");
    expect(diag, "'!' on a bool must not report InvalidUnaryOperand").to.be.undefined;
  });

  it("flags arithmetic on a bool operand (InvalidBinaryOperands)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { bool b = true; float x = b + 1.0; gl_FragColor = vec4(x); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "InvalidBinaryOperands");
    expect(diag, "bool + float must report InvalidBinaryOperands").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag arithmetic on numeric operands", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float x = 1.0 + 2.0; vec3 v = vec3(1.0) * 2.0; gl_FragColor = vec4(v, x); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "InvalidBinaryOperands");
    expect(diag, "numeric arithmetic must not report InvalidBinaryOperands").to.be.undefined;
  });

  it("flags a non-integer index (NonIntegerIndex)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v = vec3(0.0); float y = v[1.5]; gl_FragColor = vec4(y); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonIntegerIndex");
    expect(diag, "a float index must report NonIntegerIndex").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag an integer index", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v = vec3(0.0); float y = v[1]; gl_FragColor = vec4(y); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonIntegerIndex");
    expect(diag, "an integer index must not report NonIntegerIndex").to.be.undefined;
  });

  it("flags a single-arg sampler cast (ConstructorArgType)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      mediump sampler2D u_tex;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float x = float(u_tex); gl_FragColor = vec4(x); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ConstructorArgType");
    expect(diag, "float(sampler) must report ConstructorArgType").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("flags a sampler constructor argument (ConstructorArgType)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      mediump sampler2D u_tex;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec2 v = vec2(u_tex, 1.0); gl_FragColor = vec4(v, 0.0, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ConstructorArgType");
    expect(diag, "vec2(sampler, ...) must report ConstructorArgType").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag a numeric constructor", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v = vec3(1.0, 2.0, 3.0); gl_FragColor = vec4(v, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diags = ShaderAnalyzer.analyze(source).diagnostics;
    expect(
      diags.find((d: Diagnostic) => d.code === "ConstructorArgType"),
      "numeric ctor: no ConstructorArgType"
    ).to.be.undefined;
  });

  it("flags too few constructor components (ConstructorArgCount)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v = vec3(1.0, 2.0); gl_FragColor = vec4(v, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ConstructorArgCount");
    expect(diag, "vec3(1.0, 2.0) must report ConstructorArgCount").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag a valid constructor (splat or exact components)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 a = vec3(1.0); vec4 b = vec4(a, 1.0); gl_FragColor = b; }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ConstructorArgCount");
    expect(diag, "splat / exact-component constructors must not report ConstructorArgCount").to.be.undefined;
  });

  it("flags a vertex that never writes gl_Position (MissingVertexPosition)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MissingVertexPosition");
    expect(diag, "a vertex without gl_Position must report MissingVertexPosition").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag a vertex that writes gl_Position", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MissingVertexPosition");
    expect(diag, "a vertex writing gl_Position must not report MissingVertexPosition").to.be.undefined;
  });

  it("deduces an arithmetic result type (vec3+vec3 -> vec3 enables AssignTypeMismatch)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 a = vec3(0.0); vec3 b = vec3(1.0); float x = 0.0; x = a + b; gl_FragColor = vec4(x); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "AssignTypeMismatch");
    expect(diag, "assigning vec3 (a+b) to float must report AssignTypeMismatch").to.be.ok;
  });

  it("does not flag a matching arithmetic assignment", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 a = vec3(0.0); vec3 b = vec3(1.0); vec3 x = vec3(0.0); x = a + b; gl_FragColor = vec4(x, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "AssignTypeMismatch");
    expect(diag, "vec3 = vec3 + vec3 must not report AssignTypeMismatch").to.be.undefined;
  });

  it("flags break outside a loop (MisplacedControlFlow)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); break; }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MisplacedControlFlow");
    expect(diag, "break outside a loop must report MisplacedControlFlow").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag break inside a loop", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { for (int i = 0; i < 4; i++) { break; } gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MisplacedControlFlow");
    expect(diag, "break inside a loop must not report MisplacedControlFlow").to.be.undefined;
  });

  it("flags continue outside a loop (MisplacedControlFlow)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); continue; }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MisplacedControlFlow");
    expect(diag, "continue outside a loop must report MisplacedControlFlow").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag continue inside a loop", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { for (int i = 0; i < 4; i++) { continue; } gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MisplacedControlFlow");
    expect(diag, "continue inside a loop must not report MisplacedControlFlow").to.be.undefined;
  });

  it("flags indexing a scalar (NonIndexableType)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float f = 1.0; float y = f[0]; gl_FragColor = vec4(y); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonIndexableType");
    expect(diag, "indexing a scalar must report NonIndexableType").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag indexing an array or a vector", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float a[3]; vec3 v = vec3(0.0); float y = a[0] + v[0]; gl_FragColor = vec4(y); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonIndexableType");
    expect(diag, "indexing an array or a vector must not report NonIndexableType").to.be.undefined;
  });

  it("flags a texture sample whose first arg is not a sampler (ExpectedSampler)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec2 uv = vec2(0.0); vec4 c = texture(uv, uv); gl_FragColor = c; }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ExpectedSampler");
    expect(diag, "texture() with a non-sampler first arg must report ExpectedSampler").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag a texture sample with a real sampler", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      mediump sampler2D u_tex;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec2 uv = vec2(0.0); vec4 c = texture(u_tex, uv); gl_FragColor = c; }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ExpectedSampler");
    expect(diag, "texture(sampler2D, uv) must not report ExpectedSampler").to.be.undefined;
  });

  it("flags an integer varying without flat (NonFlatIntegerVarying)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      struct Varyings { vec4 pos; int id; };
      Varyings vert(Attributes attr) { Varyings o; o.pos = vec4(attr.POSITION, 1.0); o.id = 0; gl_Position = o.pos; return o; }
      void frag(Varyings i) { gl_FragColor = vec4(float(i.id)); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonFlatIntegerVarying");
    expect(diag, "an integer varying without flat must report NonFlatIntegerVarying").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag a flat integer varying or a float varying", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      struct Varyings { vec4 pos; flat int id; float w; };
      Varyings vert(Attributes attr) { Varyings o; o.pos = vec4(attr.POSITION, 1.0); o.id = 0; o.w = 1.0; gl_Position = o.pos; return o; }
      void frag(Varyings i) { gl_FragColor = vec4(float(i.id) + i.w); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonFlatIntegerVarying");
    expect(diag, "a flat integer varying or a float varying must not report NonFlatIntegerVarying").to.be.undefined;
  });

  it("flags a const initialized from a non-constant (NonConstInitializer)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      float u_scale;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { const float c = u_scale; gl_FragColor = vec4(c); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonConstInitializer");
    expect(diag, "const initialized from a uniform must report NonConstInitializer").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag a const initialized from a literal or another const", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { const float a = 1.0; const float b = a; gl_FragColor = vec4(b); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonConstInitializer");
    expect(diag, "const = literal / const = const must not report NonConstInitializer").to.be.undefined;
  });

  it("flags an array sized by a non-const variable (NonConstArraySize)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { int n = 3; float a[n]; gl_FragColor = vec4(a[0]); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonConstArraySize");
    expect(diag, "an array sized by a non-const variable must report NonConstArraySize").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag an array sized by a literal or a const", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { const int N = 3; float a[N]; float b[4]; gl_FragColor = vec4(a[0] + b[0]); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonConstArraySize");
    expect(diag, "an array sized by a literal or a const must not report NonConstArraySize").to.be.undefined;
  });

  it("does not flag an array sized by a #define macro", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      #define ARR_LEN 3
      void frag() { float a[ARR_LEN]; gl_FragColor = vec4(a[0]); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonConstArraySize");
    expect(diag, "a macro-sized array must not report NonConstArraySize").to.be.undefined;
  });

  it("flags a bound entry that is not a function (EntryNotFound)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vrt;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "EntryNotFound");
    expect(diag, "binding an entry name that is not a function must report EntryNotFound").to.be.ok;
    expect(diag!.severity).to.equal("error");
    expect(source.slice(diag!.range.start.offset, diag!.range.end.offset)).to.equal("vrt");
    expect(diag!.relatedSource).to.equal(source);
  });

  it("does not flag valid bound entries", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "EntryNotFound");
    expect(diag, "valid bound entries must not report EntryNotFound").to.be.undefined;
  });

  it("flags dFdx used in a vertex shader (DerivativeInVertexShader)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { float d = dFdx(1.0); gl_Position = vec4(attr.POSITION * d, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find(
      (d: Diagnostic) => d.code === "DerivativeInVertexShader"
    );
    expect(diag, "dFdx in a vertex entry must report DerivativeInVertexShader").to.be.ok;
    expect(diag!.severity).to.equal("error");
    expect(diag!.message).to.include("dFdx");
  });

  it("does not flag dFdx used in a fragment shader", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float d = dFdx(1.0); gl_FragColor = vec4(d); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find(
      (d: Diagnostic) => d.code === "DerivativeInVertexShader"
    );
    expect(diag, "dFdx in the fragment stage must not report DerivativeInVertexShader").to.be.undefined;
  });

  it("flags a non-float argument to dFdx (NonFloatDerivativeArg)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { int i = 1; float d = dFdx(i); gl_FragColor = vec4(d); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonFloatDerivativeArg");
    expect(diag, "dFdx(int) must report NonFloatDerivativeArg").to.be.ok;
    expect(diag!.severity).to.equal("error");
  });

  it("does not flag a float argument to dFdx", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec2 v = vec2(0.5); vec2 d = dFdx(v); gl_FragColor = vec4(d, 0.0, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonFloatDerivativeArg");
    expect(diag, "dFdx(vec2) must not report NonFloatDerivativeArg").to.be.undefined;
  });

  it("flags too many constructor components (ConstructorArgCount)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v = vec3(1.0, 2.0, 3.0, 4.0); gl_FragColor = vec4(v, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ConstructorArgCount");
    expect(diag, "vec3(1.0, 2.0, 3.0, 4.0) must report ConstructorArgCount").to.be.ok;
    expect(diag!.severity).to.equal("error");
    expect(diag!.message).to.include("3 components");
    expect(diag!.message).to.include("provide 4");
  });

  it("does not flag a single-scalar splat vec4(1.0)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec4 v = vec4(1.0); gl_FragColor = v; }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "ConstructorArgCount");
    expect(diag, "single-scalar splat must not report ConstructorArgCount").to.be.undefined;
  });

  it("warns on a function redefined in the same scope (Redefinition)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      float dbl(float x) { return x + x; }
      float dbl(float x) { return x * 2.0; }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(dbl(0.5)); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "Redefinition");
    expect(diag, "a function redeclared with the same signature must report Redefinition").to.be.ok;
    expect(diag!.message).to.include("dbl");
  });

  it("does not flag a function overload with a different signature", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      float pick(float x) { return x; }
      float pick(vec2 v) { return v.x; }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(pick(0.5)); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "Redefinition");
    expect(diag, "a different-signature overload must not report Redefinition").to.be.undefined;
  });

  it("flags a non-bool 'while' condition (NonBoolCondition)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float a = 1.0; while (a) { break; } gl_FragColor = vec4(a); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonBoolCondition");
    expect(diag, "while (float) must report NonBoolCondition").to.be.ok;
  });

  it("flags a non-bool 'for' condition (NonBoolCondition)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { for (int i = 0; i; i++) { break; } gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonBoolCondition");
    expect(diag, "for (…; int; …) must report NonBoolCondition").to.be.ok;
  });

  it("flags a non-bool ternary condition (NonBoolCondition)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float a = 1.0; float b = a ? 1.0 : 0.0; gl_FragColor = vec4(b); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonBoolCondition");
    expect(diag, "float ? … : … must report NonBoolCondition").to.be.ok;
  });

  it("does not flag a bool 'while' / 'for' / ternary condition", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() {
        int j = 0;
        while (j < 3) { j++; }
        for (int i = 0; i < 3; i++) { j++; }
        float b = (j > 0) ? 1.0 : 0.0;
        gl_FragColor = vec4(b);
      }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "NonBoolCondition");
    expect(diag, "bool conditions must not report NonBoolCondition").to.be.undefined;
  });

  it("flags MissingReturn when only one branch of an if returns", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      float pickIf(float x) { if (x > 0.0) return 1.0; }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(pickIf(1.0)); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MissingReturn");
    expect(diag, "an if without else must not guarantee return").to.be.ok;
  });

  it("flags MissingReturn when if/else's else branch is missing return", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      float pickIfElse(float x) { if (x > 0.0) return 1.0; else { float y = x; } }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(pickIfElse(1.0)); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MissingReturn");
    expect(diag, "an if/else missing a return in one arm must report MissingReturn").to.be.ok;
  });

  it("does not flag MissingReturn when both if/else arms return", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      float pickBoth(float x) { if (x > 0.0) return 1.0; else return 0.0; }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(pickBoth(1.0)); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MissingReturn");
    expect(diag, "both arms returning must not report MissingReturn").to.be.undefined;
  });

  it("flags a vertex shader that only reads gl_Position (MissingVertexPosition)", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { vec4 x = gl_Position; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MissingVertexPosition");
    expect(diag, "a vertex that only reads gl_Position must report MissingVertexPosition").to.be.ok;
  });

  it("does not flag a vertex that writes gl_Position.xyz component-wise", () => {
    const source = `Shader "x" {
  SubShader "Default" {
    Pass "test" {
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position.xyz = attr.POSITION; gl_Position.w = 1.0; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find((d: Diagnostic) => d.code === "MissingVertexPosition");
    expect(diag, "component-wise writes to gl_Position must count as a write").to.be.undefined;
  });

  // RenderState errors take an early return in ShaderSourceParser, so the property never reaches
  // constantMap/variableMap. The message must state "will not be applied" so a user reading only
  // the diagnostic can tell the engine did not receive their intended state.
  it("InvalidRenderStateProperty message states the property will not be applied", () => {
    const source = `Shader "rs-drop" { SubShader "s" { Pass "p" {
      BlendState bs { NotARealProperty = true; }
    } } }`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find(
      (d: Diagnostic) => d.code === "InvalidRenderStateProperty"
    );
    expect(diag, "invalid render state property must report").to.be.ok;
    expect(diag!.message, "message must warn the user the property is dropped").to.include("not be applied");
    expect(ShaderAnalyzer.analyze(source).diagnostics.some((item) => item.code === "SyntaxError")).to.equal(false);
  });

  it("InvalidRenderStateVariable message states the property will not be applied", () => {
    const source = `Shader "rs-drop-var" { SubShader "s" { Pass "p" {
      DepthState = undefinedDepthVar;
    } } }`;
    const diag = ShaderAnalyzer.analyze(source).diagnostics.find(
      (d: Diagnostic) => d.code === "InvalidRenderStateVariable"
    );
    expect(diag, "invalid render state variable must report").to.be.ok;
    expect(diag!.message, "message must warn the user the property is dropped").to.include("not be applied");
  });

  it("stops render-state recovery at a closing brace when a semicolon is missing", () => {
    const source = `Shader "rs-recovery" { SubShader "s" { Pass "p" {
      BlendState broken { NotARealProperty = true }
    } } }`;
    const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
    expect(diagnostics.some((diagnostic) => diagnostic.code === "InvalidRenderStateProperty")).to.equal(true);
  });
});
