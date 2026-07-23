/**
 * Branch-aware symbol lookup — proves the analyzer resolves references against declarations
 * visible from the reference's own `#ifdef` branch, mirroring codegen's per-branch model.
 *
 * Before this test's baseline: `SymbolTable.getSymbol` skipped every macro-branch symbol by default,
 * so a variable declared in `#ifdef X` was invisible to references in the same branch. Its type
 * fell back to TypeAny and cascaded into false-positive `NonIndexableType` / `IndexOutOfBounds` /
 * `AssignTypeMismatch` on the shipping shaders.
 *
 * After: SymbolInfo carries `branchSignature`; lookup filters by `isBranchVisibleFrom` against the
 * calling AST node's branch. The reference branch must imply the declaration branch; merely
 * non-conflicting branches are not sufficient.
 */

import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { describe, expect, it } from "vitest";

const analyzer = new ShaderAnalyzer();

const HEADER = `Shader "cov" { SubShader "s" { Pass "p" {\n`;
const FOOTER = `\n} } }`;

function pass(body: string): string {
  return HEADER + body + FOOTER;
}

function errorsOf(source: string, code?: string) {
  const { diagnostics } = analyzer.analyze(source);
  const errs = diagnostics.filter((d) => d.severity === "error");
  return code ? errs.filter((d) => d.code === code) : errs;
}

// Type-mismatch diagnostics are the cleanest signal that lookup resolved: a hit gives a concrete
// type; a miss yields TypeAny which suppresses `AssignTypeMismatch`. So we assert its presence /
// absence to prove the resolver did or didn't find a same-branch declaration.
describe("branch-aware SymbolTable lookup", () => {
  it("same-branch reference resolves same-branch declaration (assign type checks)", () => {
    // `u_a` declared inside `#ifdef X`, assigned an `int` inside the same branch. Type must resolve
    // to `float` — otherwise TypeAny suppresses the mismatch and the test never catches the miss.
    const src = pass(
      `#ifdef X
        void frag() {
          float u_a;
          u_a = 1;
          gl_FragColor = vec4(u_a);
        }
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    const errs = errorsOf(src, "AssignTypeMismatch");
    expect(errs.length, "same-branch decl → assign-mismatch fires").to.be.greaterThan(0);
  });

  it("outer-scope declaration is visible from inner branch (type propagates)", () => {
    // Top-level `float u_t` — unconditional. Reference inside `#ifdef X` writes an int to it.
    // The mismatch must be reported, proving the branch lookup resolved to the outer decl.
    const src = pass(
      `void frag() {
        float u_t;
        #ifdef X
          u_t = 1;
        #endif
        gl_FragColor = vec4(u_t);
      }
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    const errs = errorsOf(src, "AssignTypeMismatch");
    expect(errs.length, "outer decl visible in nested #ifdef").to.be.greaterThan(0);
  });

  it("preserves type check inside macro branch — `float a = 1;` still errors", () => {
    const src = pass(
      `#ifdef X
        void frag() { float a = 1; gl_FragColor = vec4(a); }
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "AssignTypeMismatch").length, "no implicit int→float even inside #ifdef").to.be.greaterThan(0);
  });

  it("accepts a declaration guarded by a macro defined earlier in the same arm", () => {
    const src = pass(
      `#ifndef G
        #define G
        #ifdef G
          float u_value;
        #endif
        void frag() { gl_FragColor = vec4(u_value); }
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
  });

  it("rejects a reference that is not guaranteed by its declaration branch", () => {
    const src = pass(
      `#ifdef A
        #ifdef B
          float u_value;
        #endif
        void frag() { gl_FragColor = vec4(u_value); }
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    const errors = errorsOf(src, "UseBeforeDeclaration");
    expect(errors).to.have.lengthOf(1);
    expect(errors[0].message).to.contain("not guaranteed");
  });

  it("accepts a helper implemented in every complete branch", () => {
    const src = pass(
      `#ifdef A
        float branchValue() { return 0.0; }
      #else
        float branchValue() { return 1.0; }
      #endif
      void frag() { gl_FragColor = vec4(branchValue()); }
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
  });

  it("rejects an unconditional helper call missing a macro branch", () => {
    const src = pass(
      `#ifdef A
        float branchValue() { return 0.0; }
      #endif
      void frag() { gl_FragColor = vec4(branchValue()); }
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.have.lengthOf(1);
  });

  it("rejects a struct type that is missing on a macro path", () => {
    const result = analyzer.analyze(
      pass(
        `#ifdef A
          struct Data { float value; };
        #endif
        Data data;
        void frag() { gl_FragColor = vec4(0.0); }
        void vert() { gl_Position = vec4(0.0); }
        VertexShader = vert; FragmentShader = frag;`
      )
    );
    const errors = result.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error" && diagnostic.code === "UseBeforeDeclaration"
    );
    expect(errors).to.have.lengthOf(1);
    expect(errors[0].message).to.contain("Type 'Data'");
    expect(result.passes, "an uncovered type declaration must block codegen").to.be.empty;
  });

  it("accepts a struct type declared by every arm of an exhaustive macro chain", () => {
    const result = analyzer.analyze(
      pass(
        `#ifdef A
          struct Data { float value; };
        #else
          struct Data { float value; };
        #endif
        Data data;
        void frag() { gl_FragColor = vec4(0.0); }
        void vert() { gl_Position = vec4(0.0); }
        VertexShader = vert; FragmentShader = frag;`
      )
    );
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).to.be.empty;
    expect(result.passes).to.have.lengthOf(1);
  });

  it.each([
    ["global variable", "Data globalValue;"],
    ["local variable", "void helper() { Data localValue; }"],
    ["function parameter", "void helper(Data parameter) { }"],
    ["function return", "Data helper() { return; }"],
    ["struct member", "struct Container { Data member; };"]
  ])("rejects an uncovered struct type in a %s declaration", (_name, declaration) => {
    const result = analyzer.analyze(
      pass(
        `#ifdef A
          struct Data { float value; };
        #endif
        ${declaration}
        void frag() { gl_FragColor = vec4(0.0); }
        void vert() { gl_Position = vec4(0.0); }
        VertexShader = vert; FragmentShader = frag;`
      )
    );
    const errors = result.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error" && diagnostic.code === "UseBeforeDeclaration"
    );
    expect(errors).to.have.lengthOf(1);
    expect(result.passes).to.be.empty;
  });
});
