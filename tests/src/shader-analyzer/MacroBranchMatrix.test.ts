import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { AnalyzerLexer, ShaderSourceParser, type IncludeMap } from "@galacean/engine-shader-parser/internal/analyzer";
import { describe, expect, it } from "vitest";

function pass(body: string): string {
  return `Shader "macro-branch-matrix" { SubShader "s" { Pass "p" {
${body}
} } }`;
}

function shader(declarations: string, fragmentBody: string): string {
  return pass(`${declarations}
    void vert() { gl_Position = vec4(0.0); }
    void frag() {
${fragmentBody}
    }
    VertexShader = vert;
    FragmentShader = frag;`);
}

function compile(source: string, includeMap?: IncludeMap) {
  const result = ShaderAnalyzer.analyze(source, includeMap ? { includeMap } : undefined);
  const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
  const passSource = ShaderSourceParser.parse(source).subShaders[0].passes[0];
  const compiler = new ShaderCompiler();
  if (includeMap) compiler._setIncludeMap(includeMap);
  const generated = compiler._parseShaderPass(
    passSource.contents,
    passSource.vertexEntry,
    passSource.fragmentEntry,
    ShaderLanguage.GLSLES100,
    ""
  );

  return {
    codes,
    fragment: generated?.fragment
  };
}

interface MacroCase {
  name: string;
  source: string;
  codes: string[];
  fragments: string[];
  occurrences?: [string, number][];
  includeMap?: IncludeMap;
}

const cases: MacroCase[] = [
  {
    name: "object-like #define",
    source: shader("#define BRANCH_SCALE 0.5", "      gl_FragColor = vec4(BRANCH_SCALE);"),
    codes: [],
    fragments: ["#define BRANCH_SCALE", "BRANCH_SCALE"]
  },
  {
    name: "function-like #define",
    source: shader("#define APPLY_SCALE(value) ((value) * 0.5)", "      gl_FragColor = vec4(APPLY_SCALE(1.0));"),
    codes: [],
    fragments: ["#define APPLY_SCALE", "APPLY_SCALE"]
  },
  {
    name: "#ifdef/#else siblings",
    source: shader(
      `#ifdef USE_VALUE
float u_value;
#else
float u_value;
#endif`,
      "      gl_FragColor = vec4(u_value);"
    ),
    codes: [],
    fragments: ["#ifdef USE_VALUE", "#else", "#endif", "uniform float u_value;"]
  },
  {
    name: "#ifndef/#else siblings",
    source: shader(
      `#ifndef DISABLE_VALUE
float u_value;
#else
float u_value;
#endif`,
      "      gl_FragColor = vec4(u_value);"
    ),
    codes: [],
    fragments: ["#ifndef DISABLE_VALUE", "#else", "#endif", "uniform float u_value;"]
  },
  {
    name: "#ifndef/#elif defined siblings",
    source: shader(
      `#ifndef DISABLE_VALUE
float u_value;
#elif defined(DISABLE_VALUE)
float u_value;
#endif`,
      "      gl_FragColor = vec4(u_value);"
    ),
    codes: [],
    fragments: ["#ifndef DISABLE_VALUE", "#elif defined(DISABLE_VALUE)", "#endif", "uniform float u_value;"]
  },
  {
    name: "#ifdef/#elif !defined siblings",
    source: shader(
      `#ifdef USE_VALUE
float u_value;
#elif !defined(USE_VALUE)
float u_value;
#endif`,
      "      gl_FragColor = vec4(u_value);"
    ),
    codes: [],
    fragments: ["#ifdef USE_VALUE", "#elif !defined(USE_VALUE)", "#endif", "uniform float u_value;"]
  },
  {
    name: "#ifdef/#elif negated macro value siblings",
    source: shader(
      `#ifdef USE_VALUE
float u_value;
#elif !USE_VALUE
float u_value;
#endif`,
      "      gl_FragColor = vec4(u_value);"
    ),
    codes: [],
    fragments: ["#ifdef USE_VALUE", "#elif !USE_VALUE", "#endif", "uniform float u_value;"]
  },
  {
    name: "#ifdef/#elif repeated condition has a declaration gap",
    source: shader(
      `#ifdef USE_VALUE
float u_value;
#elif defined(USE_VALUE)
float u_value;
#endif`,
      "      gl_FragColor = vec4(u_value);"
    ),
    codes: ["UseBeforeDeclaration"],
    fragments: []
  },
  {
    name: "#ifndef/#elif non-complementary gap",
    source: shader(
      `#ifndef DISABLE_VALUE
float u_value;
#elif A
float u_value;
#endif`,
      "      gl_FragColor = vec4(u_value);"
    ),
    codes: ["UseBeforeDeclaration"],
    fragments: []
  },
  {
    name: "malformed #elif condition",
    source: shader(
      `#ifdef USE_VALUE
float u_value;
#elif 123 defined(USE_VALUE)
float u_value;
#endif`,
      "      gl_FragColor = vec4(u_value);"
    ),
    codes: ["PreprocessorError"],
    fragments: []
  },
  {
    name: "disjoint but non-exhaustive #elif conditions",
    source: shader(
      `#if MODE == 1
float u_value;
#elif MODE == 2
float u_value;
#endif`,
      "      gl_FragColor = vec4(u_value);"
    ),
    codes: ["UseBeforeDeclaration"],
    fragments: []
  },
  {
    name: "first true #elif arm",
    source: shader(
      `#if 0
float u_value;
#elif 0
float u_value;
#elif 1
float u_value;
#elif 1
float u_value;
#else
float u_value;
#endif`,
      "      gl_FragColor = vec4(u_value);"
    ),
    codes: [],
    fragments: ["#if 0", "#elif 0", "#elif 1", "#else", "#endif", "uniform float u_value;"]
  },
  {
    name: "inactive #if body ignores an otherwise invalid stringifying macro",
    source: shader(
      `#if 0
#define STRINGIFY(X) #X
#endif
float u_value;`,
      "      gl_FragColor = vec4(u_value);"
    ),
    codes: [],
    fragments: ["#if 0", "#define STRINGIFY(X) #X", "#endif", "uniform float u_value;"]
  },
  {
    name: "#if/#elif/#else siblings",
    source: shader(
      `#if MODE == 1
float u_mode;
#elif MODE == 2
float u_mode;
#else
float u_mode;
#endif`,
      "      gl_FragColor = vec4(u_mode);"
    ),
    codes: [],
    fragments: ["#if MODE == 1", "#elif MODE == 2", "#else", "#endif", "uniform float u_mode;"]
  },
  {
    name: "repeated logical macro conditions",
    source: shader(
      `#if defined(HAS_NORMAL) && defined(HAS_TANGENT)
float u_value[2];
#else
  #if defined(HAS_NORMAL) || defined(HAS_TANGENT)
  float u_value[4];
  #else
  float u_value[8];
  #endif
#endif`,
      `      #if defined(HAS_NORMAL) && defined(HAS_TANGENT)
      gl_FragColor = vec4(u_value[0]);
      #else
        #if defined(HAS_NORMAL) || defined(HAS_TANGENT)
        gl_FragColor = vec4(u_value[0]);
        #else
        gl_FragColor = vec4(u_value[0]);
        #endif
      #endif`
    ),
    codes: [],
    fragments: ["#if defined(HAS_NORMAL)", "#endif"]
  },
  {
    name: "nested conditional siblings",
    source: shader(
      `#ifdef OUTER
  #ifdef INNER
    float u_nested;
  #else
    float u_nested;
  #endif
#else
  float u_nested;
#endif`,
      "      gl_FragColor = vec4(u_nested);"
    ),
    codes: [],
    fragments: ["#ifdef OUTER", "#ifdef INNER", "#else", "#endif", "uniform float u_nested;"]
  },
  {
    name: "independent global macros",
    source: shader(
      `#ifdef FIRST_SOURCE
float u_conflict;
#endif
#ifdef SECOND_SOURCE
float u_conflict;
#endif`,
      "      gl_FragColor = vec4(u_conflict);"
    ),
    codes: ["Redefinition"],
    fragments: ["#ifdef FIRST_SOURCE", "#ifdef SECOND_SOURCE", "uniform float u_conflict;"],
    occurrences: [["uniform float u_conflict;", 2]]
  },
  {
    name: "repeated canonical guard",
    source: shader(
      `#ifndef MATRIX_INCLUDED
#define MATRIX_INCLUDED
float u_guarded;
#endif
#ifndef MATRIX_INCLUDED
#define MATRIX_INCLUDED
float u_guarded;
#endif`,
      "      gl_FragColor = vec4(u_guarded);"
    ),
    codes: [],
    fragments: ["#ifndef MATRIX_INCLUDED", "#define MATRIX_INCLUDED", "uniform float u_guarded;"],
    occurrences: [
      ["#ifndef MATRIX_INCLUDED", 2],
      ["#define MATRIX_INCLUDED", 2],
      ["uniform float u_guarded;", 2]
    ]
  },
  {
    name: "#undef reopens a guard",
    source: shader(
      `#ifndef RESETTABLE_INCLUDED
#define RESETTABLE_INCLUDED
float u_resettable;
#endif
#undef RESETTABLE_INCLUDED
#ifndef RESETTABLE_INCLUDED
#define RESETTABLE_INCLUDED
float u_resettable;
#endif`,
      "      gl_FragColor = vec4(u_resettable);"
    ),
    codes: ["Redefinition"],
    fragments: ["#ifndef RESETTABLE_INCLUDED", "#define RESETTABLE_INCLUDED", "#undef RESETTABLE_INCLUDED"],
    occurrences: [
      ["#ifndef RESETTABLE_INCLUDED", 2],
      ["#define RESETTABLE_INCLUDED", 2],
      ["uniform float u_resettable;", 2]
    ]
  },
  {
    name: "direct and transitive canonical includes",
    source: shader(
      `#include "guarded.glsl"
#include "wrapper.glsl"`,
      "      gl_FragColor = vec4(u_included);"
    ),
    includeMap: {
      "guarded.glsl": `#ifndef MATRIX_INCLUDED
#define MATRIX_INCLUDED
float u_included;
#endif`,
      "wrapper.glsl": `#include "guarded.glsl"`
    },
    codes: [],
    fragments: ["#ifndef MATRIX_INCLUDED", "#define MATRIX_INCLUDED", "uniform float u_included;"],
    occurrences: [
      ["#ifndef MATRIX_INCLUDED", 2],
      ["#define MATRIX_INCLUDED", 2],
      ["uniform float u_included;", 2]
    ]
  },
  {
    name: "repeated unguarded include",
    source: shader(
      `#include "unguarded.glsl"
#include "unguarded.glsl"`,
      "      gl_FragColor = vec4(u_included);"
    ),
    includeMap: { "unguarded.glsl": "float u_included;" },
    codes: ["Redefinition"],
    fragments: ["uniform float u_included;"]
  },
  {
    name: "independent local macro relation",
    source: shader(
      "",
      `      #ifdef CALLER_A
        float localValue = 0.0;
      #endif
      #ifdef CALLER_B
        float localValue = 1.0;
      #endif
      gl_FragColor = vec4(0.0);`
    ),
    codes: ["Redefinition"],
    fragments: ["#ifdef CALLER_A", "#ifdef CALLER_B", "float localValue = 0.0", "float localValue = 1.0"]
  },
  {
    name: "same-arm duplicate",
    source: shader(
      `#ifdef BROKEN_ARM
float u_duplicate;
float u_duplicate;
#endif`,
      "      gl_FragColor = vec4(u_duplicate);"
    ),
    codes: ["Redefinition"],
    fragments: ["#ifdef BROKEN_ARM", "uniform float u_duplicate;"],
    occurrences: [["uniform float u_duplicate;", 2]]
  },
  {
    name: "divergent variable types",
    source: shader(
      `#ifdef USE_VEC3
vec3 branchColor;
#else
vec4 branchColor;
#endif`,
      "      gl_FragColor = vec4(branchColor.x);"
    ),
    codes: ["AmbiguousMacroBranchType"],
    fragments: ["#ifdef USE_VEC3", "uniform vec3 branchColor;", "uniform vec4 branchColor;"]
  },
  {
    name: "divergent array sizes preserve element type",
    source: shader(
      `#ifdef SHORT_ARRAY
float branchValues[2];
#else
float branchValues[4];
#endif`,
      "      gl_FragColor = vec4(branchValues[0]);"
    ),
    codes: [],
    fragments: ["#ifdef SHORT_ARRAY", "#else", "#endif"]
  },
  {
    name: "independent local macro alternatives may coexist",
    source: shader(
      "",
      `      #ifdef MODE_A
      vec2 branchSize = vec2(1.0);
      gl_FragColor = vec4(branchSize, 0.0, 1.0);
      #endif
      #ifdef MODE_B
      vec3 branchSize = vec3(1.0);
      gl_FragColor = vec4(branchSize, 1.0);
      #endif
      gl_FragColor = vec4(0.0);`
    ),
    codes: ["Redefinition"],
    fragments: ["#ifdef MODE_A", "#ifdef MODE_B"]
  },
  {
    name: "divergent array-size constness",
    source: shader(
      "",
      `      #ifdef USE_CONST_SIZE
        const int N = 2;
      #else
        int N = 2;
      #endif
      float values[N];
      gl_FragColor = vec4(values[0]);`
    ),
    codes: ["AmbiguousMacroBranchResolution"],
    fragments: ["#ifdef USE_CONST_SIZE", "const int N = 2", "int N = 2"]
  },
  {
    name: "divergent struct members",
    source: shader(
      `#ifdef HAS_VALUE
struct BranchData { float value; };
#else
struct BranchData { float other; };
#endif
BranchData data;`,
      "      gl_FragColor = vec4(data.value);"
    ),
    codes: ["AmbiguousMacroBranchResolution"],
    fragments: ["#ifdef HAS_VALUE", "#else", "struct BranchData { float value", "struct BranchData { float other"]
  },
  {
    name: "struct with conditional members remains unconditional",
    source: shader(
      `struct BranchData {
float value;
#if FEATURE_LEVEL != 0
vec3 detail;
#endif
};
BranchData data;`,
      `      #ifdef WRITE_VALUE
      gl_FragColor = vec4(data.value);
      #else
      gl_FragColor = vec4(data.value);
      #endif`
    ),
    codes: [],
    fragments: ["struct BranchData", "#if FEATURE_LEVEL != 0", "uniform BranchData data;"]
  }
];

describe("macro branch matrix", () => {
  it("marks complementary #ifndef/#elif arms as complete", () => {
    const tokens = Array.from(
      new AnalyzerLexer(
        `#ifndef DISABLE_VALUE
float u_value;
#elif defined(DISABLE_VALUE)
float u_value;
#endif`,
        {}
      ).tokenize()
    );
    const branches = tokens.filter((token) => token.lexeme === "u_value").map((token) => token.branch[0]);
    expect(branches.map((branch) => branch.conditionalComplete)).to.deep.equal([true, true]);
    expect(branches.map((branch) => branch.conditionalReachableArms)).to.deep.equal([
      [true, true],
      [true, true]
    ]);
  });

  it("marks complementary #ifdef/#elif !defined arms as complete", () => {
    const tokens = Array.from(
      new AnalyzerLexer(
        `#ifdef USE_VALUE
float u_value;
#elif !defined(USE_VALUE)
float u_value;
#endif`,
        {}
      ).tokenize()
    );
    const branches = tokens.filter((token) => token.lexeme === "u_value").map((token) => token.branch[0]);
    expect(branches.map((branch) => branch.conditionalComplete)).to.deep.equal([true, true]);
    expect(branches.map((branch) => branch.conditionalReachableArms)).to.deep.equal([
      [true, true],
      [true, true]
    ]);
  });

  it("marks #ifdef/#elif !macro-value arms as complete", () => {
    const tokens = Array.from(
      new AnalyzerLexer(
        `#ifdef USE_VALUE
float u_value;
#elif !USE_VALUE
float u_value;
#endif`,
        {}
      ).tokenize()
    );
    const branches = tokens.filter((token) => token.lexeme === "u_value").map((token) => token.branch[0]);
    expect(branches.map((branch) => branch.conditionalComplete)).to.deep.equal([true, true]);
    expect(branches.map((branch) => branch.conditionalReachableArms)).to.deep.equal([
      [true, true],
      [true, true]
    ]);
  });

  for (const testCase of cases) {
    it(`analyzes and generates ${testCase.name}`, () => {
      const { codes, fragment } = compile(testCase.source, testCase.includeMap);
      expect(codes).to.deep.equal(testCase.codes);
      expect(fragment).to.not.be.undefined;
      const generatedFragment = fragment!;
      for (const fragmentPart of testCase.fragments) expect(generatedFragment).to.include(fragmentPart);
      for (const [fragmentPart, expectedCount] of testCase.occurrences ?? []) {
        expect(generatedFragment.split(fragmentPart).length - 1, fragmentPart).to.equal(expectedCount);
      }
    });
  }
});
