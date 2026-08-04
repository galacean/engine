/** Branch-aware symbol lookup resolves only declarations visible from the reference branch. */

import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import {
  areConditionsComplementary,
  getBranchCoverage,
  type BranchSignature
} from "@galacean/engine-shader-parser/internal/analyzer";
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

function warningsOf(source: string, code?: string) {
  const { diagnostics } = analyzer.analyze(source);
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  return code ? warnings.filter((diagnostic) => diagnostic.code === code) : warnings;
}

// Type-mismatch diagnostics are the cleanest signal that lookup resolved: a hit gives a concrete
// type; a miss yields TypeAny which suppresses `AssignTypeMismatch`. So we assert its presence /
// absence to prove the resolver did or didn't find a same-branch declaration.
describe("branch-aware SymbolTable lookup", () => {
  it("classifies adjacent integer ranges as complementary", () => {
    const left: BranchSignature = [
      {
        name: "MODE",
        defined: true,
        condition: { kind: "comparison", name: "MODE", operator: "<=", value: 0, version: 0 }
      }
    ];
    const right: BranchSignature = [
      {
        name: "MODE",
        defined: true,
        condition: { kind: "comparison", name: "MODE", operator: ">=", value: 1, version: 0 }
      }
    ];
    expect(areConditionsComplementary(left[0].condition, right[0].condition)).toBe(true);
    expect(getBranchCoverage([left, right], [])).toBe("covered");
  });

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

  it("covers an unconditional reference with #ifdef and #elif !MACRO", () => {
    const src = pass(
      `#ifdef USE_BRANCH_VALUE
        float branchValue;
      #elif !USE_BRANCH_VALUE
        float branchValue;
      #endif
      void frag() { gl_FragColor = vec4(branchValue); }
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
    expect(errors[0].message).to.contain("unavailable under at least one macro configuration");
  });

  it("reports a tangent reference guarded less strictly than its declaration", () => {
    const src = pass(
      `void frag() {
        #ifdef RENDERER_HAS_NORMAL
          vec3 normal = vec3(0.0);
          #ifdef RENDERER_HAS_TANGENT
            vec4 tangent = vec4(0.0);
          #endif
        #endif
        #ifdef RENDERER_HAS_TANGENT
          gl_FragColor = tangent;
        #else
          gl_FragColor = vec4(0.0);
        #endif
      }
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.have.lengthOf(1);
  });

  it("reports when a blend-shape tangent argument can outlive its declaration", () => {
    const src = pass(
      `void calculateBlendShape(inout vec4 position
        #ifdef RENDERER_HAS_NORMAL
          , inout vec3 normal
          #ifdef RENDERER_HAS_TANGENT
            , inout vec4 tangent
          #endif
        #endif
      ) {}
      void frag() {
        vec4 position = vec4(0.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normal = vec3(0.0);
          #ifdef RENDERER_HAS_TANGENT
            vec4 tangent = vec4(0.0);
          #endif
        #endif
        #ifdef RENDERER_HAS_BLENDSHAPE
          calculateBlendShape(position
            #ifdef RENDERER_HAS_NORMAL
              , normal
            #endif
            #ifdef RENDERER_HAS_TANGENT
              , tangent
            #endif
          );
        #endif
        gl_FragColor = vec4(0.0);
      }
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    const result = analyzer.analyze(src);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === "UseBeforeDeclaration")).to.have.lengthOf(1);
  });

  it("recognizes a simple condition implied by a conjunction", () => {
    const src = pass(
      `#ifdef A
        float branchValue;
      #endif
      #if defined(A) && defined(B)
        void frag() { gl_FragColor = vec4(branchValue); }
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
  });

  it("recognizes a disjunction implied by one of its operands", () => {
    const src = pass(
      `#if defined(A) || defined(B)
        float branchValue;
      #endif
      #ifdef A
        void frag() { gl_FragColor = vec4(branchValue); }
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
  });

  it("combines branch facts to prove a remaining disjunct", () => {
    const src = pass(
      `#ifdef B
        float branchValue;
      #endif
      #if defined(A) || defined(B)
        #ifndef A
          void frag() { gl_FragColor = vec4(branchValue); }
        #endif
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
  });

  it("proves local boolean facts with unrelated outer conditions", () => {
    const src = pass(
      `#ifdef B
        float branchValue;
      #endif
      #if defined(C) || defined(D) || defined(E) || defined(F) || defined(G) || defined(H)
        #if defined(A) || defined(B)
          #ifndef A
            void frag() { gl_FragColor = vec4(branchValue); }
          #endif
        #endif
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
  });

  it("covers a reference from independent declarations across many macros", () => {
    const src = pass(
      `#ifdef A
        float branchValue;
      #endif
      #ifdef B
        float branchValue;
      #endif
      #ifdef C
        float branchValue;
      #endif
      #ifdef D
        float branchValue;
      #endif
      #ifdef E
        float branchValue;
      #endif
      #ifdef F
        float branchValue;
      #endif
      #ifdef G
        float branchValue;
      #endif
      #if defined(A) || defined(B) || defined(C) || defined(D) || defined(E) || defined(F) || defined(G)
        void frag() { gl_FragColor = vec4(branchValue); }
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
  });

  it("does not treat selected numeric values as an exhaustive macro domain", () => {
    const src = pass(
      `#if MODE == 1
        float branchValue;
      #elif MODE == 2
        float branchValue;
      #endif
      void frag() {
        #if MODE != 0
          gl_FragColor = vec4(branchValue);
        #else
          gl_FragColor = vec4(0.0);
        #endif
      }
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );

    expect(errorsOf(src, "UseBeforeDeclaration")).to.have.lengthOf(1);
  });

  it("recognizes adjacent integer ranges as exhaustive", () => {
    const src = pass(
      `#if MODE <= 0
        float branchValue;
      #endif
      #if MODE >= 1
        float branchValue;
      #endif
      void frag() { gl_FragColor = vec4(branchValue); }
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );

    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
    expect(warningsOf(src, "UseBeforeDeclaration")).to.be.empty;
  });

  it("does not report an integer-only coverage gap as an error", () => {
    // These ranges cover every integer, but the non-backtracking witness search intentionally leaves coverage unknown.
    const src = pass(
      `#if MODE <= 0
        float branchValue;
      #endif
      #if MODE == 1
        float branchValue;
      #endif
      #if MODE >= 2
        float branchValue;
      #endif
      void frag() { gl_FragColor = vec4(branchValue); }
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );

    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
    expect(warningsOf(src, "UseBeforeDeclaration")).to.have.lengthOf(1);
  });

  it("reports a numeric branch gap without host-specific macro assumptions", () => {
    const src = pass(
      `#if MODE == 1
        float branchValue;
      #endif
      void frag() {
        #if MODE != 0
          gl_FragColor = vec4(branchValue);
        #else
          gl_FragColor = vec4(0.0);
        #endif
      }
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.have.lengthOf(1);
  });

  it("propagates a derived macro's defining branch", () => {
    const src = pass(
      `#if defined(A) || defined(B)
        #define DERIVED
      #endif
      #ifdef DERIVED
        #define WRAPPED
      #endif
      #ifdef WRAPPED
        float branchValue;
      #endif
      #ifdef A
        void frag() { gl_FragColor = vec4(branchValue); }
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
  });

  it("does not retain a derived macro after a conditional #undef", () => {
    const src = pass(
      `#ifdef A
        #define DERIVED
      #endif
      #ifdef B
        #undef DERIVED
      #endif
      #ifdef DERIVED
        float branchValue;
      #endif
      #ifdef A
        void frag() { gl_FragColor = vec4(branchValue); }
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
    expect(warningsOf(src, "UseBeforeDeclaration")).to.have.lengthOf(1);
  });

  it("applies a macro replacement's definition branch to its references", () => {
    const src = pass(
      `#ifdef USE_ALIAS
        float branchValue;
        #define VALUE branchValue
      #else
        float VALUE;
      #endif
      void frag() { gl_FragColor = vec4(VALUE); }
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`
    );
    expect(errorsOf(src, "UseBeforeDeclaration")).to.be.empty;
  });

  it("keeps outer constraints when a declaration is inside a canonical include guard", () => {
    const result = analyzer.analyze(
      pass(
        `#ifdef FEATURE
          #ifndef DATA_INCLUDED
            #define DATA_INCLUDED
            struct Data { float value; };
            float guardedValue;
            float guardedHelper() { return 1.0; }
          #endif
        #endif
        Data data;
        void frag() { gl_FragColor = vec4(data.value + guardedValue + guardedHelper()); }
        void vert() { gl_Position = vec4(0.0); }
        VertexShader = vert; FragmentShader = frag;`
      )
    );

    const errors = result.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error" && diagnostic.code === "UseBeforeDeclaration"
    );
    expect(errors, JSON.stringify(result.diagnostics)).to.have.lengthOf(4);
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
  });

  it("warns when an unknown type may be supplied as a runtime macro", () => {
    const src = pass(`RUNTIME_TYPE u_value;
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;`);
    const diagnostics = analyzer.analyze(src).diagnostics;
    const unknownType = diagnostics.find((diagnostic) => diagnostic.code === "UnknownType");
    expect(unknownType?.severity).to.equal("warning");
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === "error")).to.be.empty;
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
  });
});
