import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { describe, expect, it } from "vitest";

function pass(body: string): string {
  return `Shader "branch-resolution" { SubShader "s" { Pass "p" {
${body}
} } }`;
}

function diagnostics(body: string) {
  return new ShaderAnalyzer().analyze(pass(body)).diagnostics;
}

function codes(body: string): string[] {
  return diagnostics(body).map((diagnostic) => diagnostic.code);
}

const ENTRIES = `
  void vert() { gl_Position = vec4(0.0); }
  VertexShader = vert;
  FragmentShader = frag;`;

describe("branch resolution ambiguity", () => {
  it.each([
    [
      "const first",
      `#ifdef A
        const int N = 2;
      #else
        int N = 2;
      #endif`
    ],
    [
      "non-const first",
      `#ifdef A
        int N = 2;
      #else
        const int N = 2;
      #endif`
    ]
  ])("makes an array constness split order-independent: %s", (_name, declarations) => {
    const result = diagnostics(`void frag() {
      ${declarations}
      float first[N];
      float second[N];
      gl_FragColor = vec4(0.0);
    }
    ${ENTRIES}`);
    const ambiguity = result.filter((diagnostic) => diagnostic.code === "AmbiguousMacroBranchResolution");
    expect(ambiguity).to.have.lengthOf(1);
    expect(ambiguity[0].severity).to.equal("error");
    expect(result.some((diagnostic) => diagnostic.code === "NonConstArraySize")).to.equal(false);
  });

  it("keeps the definitive array-size result when all visible branches agree", () => {
    const nonConstCodes = codes(`void frag() {
      #ifdef A
        int N = 2;
      #else
        int N = 3;
      #endif
      float values[N];
      gl_FragColor = vec4(0.0);
    }
    ${ENTRIES}`);
    expect(nonConstCodes).to.include("NonConstArraySize");
    expect(nonConstCodes).to.not.include("AmbiguousMacroBranchResolution");

    const constCodes = codes(`void frag() {
      #ifdef A
        const int N = 2;
      #else
        const int N = 3;
      #endif
      float values[N];
      gl_FragColor = vec4(0.0);
    }
    ${ENTRIES}`);
    expect(constCodes).to.not.include("NonConstArraySize");
    expect(constCodes).to.not.include("AmbiguousMacroBranchResolution");
  });

  it("resolves an array-size symbol from the callsite arm", () => {
    const result = codes(`void frag() {
      #ifdef A
        const int N = 2;
      #else
        int N = 3;
      #endif
      #ifdef A
        float values[N];
      #endif
      gl_FragColor = vec4(0.0);
    }
    ${ENTRIES}`);
    expect(result).to.not.include("NonConstArraySize");
    expect(result).to.not.include("AmbiguousMacroBranchResolution");
  });

  it("does not confuse lexical shadowing with macro ambiguity", () => {
    const result = codes(`const int N = 2;
    float outerValue;
    void frag() {
      int N = 3;
      vec3 outerValue = vec3(0.0);
      float values[N];
      gl_FragColor = vec4(outerValue.z);
    }
    ${ENTRIES}`);
    expect(result).to.include("NonConstArraySize");
    expect(result).to.not.include("AmbiguousMacroBranchResolution");
    expect(result).to.not.include("AmbiguousMacroBranchType");
  });

  it("errors when a struct member exists in only one visible branch", () => {
    const result = diagnostics(`#ifdef A
      struct S { float value; };
    #else
      struct S { float other; };
    #endif
    S s;
    void frag() { gl_FragColor = vec4(s.value); }
    ${ENTRIES}`);
    const ambiguity = result.filter((diagnostic) => diagnostic.code === "AmbiguousMacroBranchResolution");
    expect(ambiguity).to.have.lengthOf(1);
    expect(ambiguity[0].severity).to.equal("error");
    expect(result.some((diagnostic) => diagnostic.code === "UndeclaredStructMember")).to.equal(false);
  });

  it.each([
    ["base type", "float value;", "int value;"],
    ["array shape", "float value;", "float value[2];"],
    ["array size", "float value[2];", "float value[3];"]
  ])("errors when a struct member has divergent %s", (_name, first, second) => {
    const result = codes(`#ifdef A
      struct S { ${first} };
    #else
      struct S { ${second} };
    #endif
    S s;
    void frag() { gl_FragColor = vec4(s.value); }
    ${ENTRIES}`);
    expect(result).to.include("AmbiguousMacroBranchResolution");
    expect(result).to.not.include("UndeclaredStructMember");
  });

  it("keeps definitive struct member results when branches agree", () => {
    const missing = codes(`#ifdef A
      struct S { float other; };
    #else
      struct S { float other; };
    #endif
    S s;
    void frag() { gl_FragColor = vec4(s.value); }
    ${ENTRIES}`);
    expect(missing).to.include("UndeclaredStructMember");
    expect(missing).to.not.include("AmbiguousMacroBranchResolution");

    const present = codes(`#ifdef A
      struct S { float value; };
    #else
      struct S { float value; };
    #endif
    S s;
    void frag() { gl_FragColor = vec4(s.value); }
    ${ENTRIES}`);
    expect(present).to.not.include("UndeclaredStructMember");
    expect(present).to.not.include("AmbiguousMacroBranchResolution");
  });

  it("resolves a struct member from the callsite arm", () => {
    const result = codes(`#ifdef A
      struct S { float value; };
    #else
      struct S { float other; };
    #endif
    S s;
    void frag() {
      #ifdef A
        gl_FragColor = vec4(s.value);
      #else
        gl_FragColor = vec4(s.other);
      #endif
    }
    ${ENTRIES}`);
    expect(result).to.not.include("UndeclaredStructMember");
    expect(result).to.not.include("AmbiguousMacroBranchResolution");
  });

  it("does not confuse a local struct with its shadowed outer declaration", () => {
    const result = codes(`struct S { float outerValue; };
    void frag() {
      struct S { float localValue; };
      S s;
      gl_FragColor = vec4(s.localValue);
    }
    ${ENTRIES}`);
    expect(result).to.not.include("UndeclaredStructMember");
    expect(result).to.not.include("AmbiguousMacroBranchResolution");
  });
});
