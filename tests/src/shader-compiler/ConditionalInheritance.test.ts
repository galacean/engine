import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { Lexer, Preprocessor, ShaderSourceParser } from "@galacean/engine-shader-parser/internal";
import { AnalyzerLexer, isBranchVisibleFrom } from "@galacean/engine-shader-parser/internal/analyzer";
import { describe, expect, it } from "vitest";

function variants(source: string, includeMap: Record<string, string> = {}) {
  const analysis = ShaderAnalyzer.analyze(source, { includeMap });
  expect(analysis.diagnostics).toEqual([]);
  const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
  const compiler = new ShaderCompiler();
  compiler._setIncludeMap(includeMap);
  const precompiler = new ShaderPrecompiler();
  precompiler.setIncludeMap(includeMap);
  const results: { vertex: string; fragment: string; macros: Map<string, string> }[] = [];
  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    const programs = [
      compiler.generate(analysis.passes[0], target),
      compiler._parseShaderPass(
        pass.contents,
        pass.vertexEntry,
        pass.fragmentEntry,
        target,
        undefined,
        pass.contentScopeStarts
      ),
      precompiler.precompile(source, target).subShaders[0].passes[0]
    ];
    for (const program of programs) {
      expect(program).toBeDefined();
      if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected a generated pass");
      for (let mask = 0; mask < 8; mask++) {
        const macros = new Map<string, string>();
        for (const [index, name] of ["OUTER", "INNER", "NESTED"].entries()) {
          if (mask & (1 << index)) macros.set(name, "1");
        }
        results.push({
          vertex: ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map(macros)),
          fragment: ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map(macros)),
          macros
        });
      }
    }
  }
  return results;
}

describe("conditional ShaderLab inheritance", () => {
  it.each(["helper", "entry", "uniform"])("replaces inherited conditional %s declarations", (kind) => {
    const declaration = (value: string) =>
      kind === "helper"
        ? `vec4 color() { return vec4(${value}); }`
        : kind === "entry"
          ? `void vert() { gl_Position = vec4(${value}); }`
          : `${value === "0.5" ? "vec3" : "vec4"} color;`;
    const source = `Shader "conditional-inheritance" {
#ifdef OUTER
#ifdef NESTED
${declaration("0.25")}
#endif
#endif
SubShader "s" {
${declaration("0.375")}
Pass "p" {
${declaration("0.5")}
${kind === "entry" ? "" : "void vert() { gl_Position = vec4(0.0); }"}
void frag() { gl_FragColor = ${kind === "helper" ? "color()" : kind === "uniform" ? "vec4(color, 1.0)" : "vec4(1.0)"}; }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const { vertex, fragment } of variants(source)) {
      const stage = kind === "entry" ? vertex : fragment;
      expect(stage).not.toMatch(/0\.25|0\.375/);
      if (kind === "uniform") {
        expect(stage.match(/uniform\s+vec3\s+color\s*;/g)).toHaveLength(1);
        expect(stage).not.toMatch(/uniform\s+vec4\s+color/);
      } else if (kind === "helper") {
        expect(stage.match(/vec4\s+color\s*\(/g)).toHaveLength(1);
        expect(stage).toMatch(/return\s+vec4\s*\(\s*0\.5\s*\)/);
      } else {
        expect(stage.match(/void\s+main\s*\(/g)).toHaveLength(1);
        expect(stage).toMatch(/gl_Position\s*=\s*vec4\s*\(\s*0\.5\s*\)/);
      }
    }
  });

  it("replaces declarations from a conditional inherited include", () => {
    const source = `Shader "include-inheritance" {
#include "shared.glsl"
SubShader "s" { Pass "p" {
vec4 color() { return vec4(0.5); }
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    const includeMap = { "shared.glsl": "#ifdef OUTER\nvec4 color() { return vec4(0.25); }\n#endif" };
    for (const { fragment } of variants(source, includeMap)) {
      expect(fragment.match(/vec4\s+color\s*\(/g)).toHaveLength(1);
      expect(fragment).toMatch(/return\s+vec4\s*\(\s*0\.5\s*\)/);
      expect(fragment).not.toContain("0.25");
    }
  });

  it.each([
    ["#ifdef OUTER", true],
    ["#ifndef OUTER", false],
    ["#ifdef OUTER\n#else", false],
    ["#if defined(OUTER)", true],
    ["#if !defined(OUTER)", false]
  ])("replaces inherited declarations with the unchanged guard %s", (guard, whenDefined) => {
    const source = `Shader "same-guard-inheritance" {
${guard}
#ifdef NESTED
vec4 color() { return vec4(0.25); }
#endif
#endif
SubShader "s" { Pass "p" {
#define UNRELATED 1
${guard}
vec4 color() { return vec4(0.5); }
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() {
  gl_FragColor = vec4(1.0);
${guard}
  gl_FragColor = color();
#endif
}
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const { fragment, macros } of variants(source)) {
      const definitions = fragment.match(/vec4\s+color\s*\(/g) ?? [];
      expect(definitions).toHaveLength(macros.has("OUTER") === whenDefined ? 1 : 0);
      expect(fragment).not.toContain("0.25");
    }
  });

  it.each(["entry", "uniform"])("replaces inherited %s declarations under the same guard", (kind) => {
    const source = `Shader "same-guard-${kind}" {
#ifdef OUTER
${kind === "entry" ? "void vert() { gl_Position = vec4(0.25); }" : "vec4 color;"}
#endif
SubShader "s" { Pass "p" {
#ifdef OUTER
${kind === "entry" ? "void vert() { gl_Position = vec4(0.5); }" : "vec3 color;"}
${kind === "entry" ? "#else\nvoid vert() { gl_Position = vec4(0.0); }" : ""}
#endif
${kind === "entry" ? "" : "void vert() { gl_Position = vec4(0.0); }"}
void frag() {
  gl_FragColor = vec4(1.0);
${kind === "uniform" ? "#ifdef OUTER\n  gl_FragColor = vec4(color, 1.0);\n#endif" : ""}
}
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const { vertex, fragment, macros } of variants(source)) {
      expect(vertex.match(/void\s+main\s*\(/g)).toHaveLength(1);
      expect(vertex).not.toContain("0.25");
      if (kind === "entry") {
        expect(vertex).toContain(macros.has("OUTER") ? "0.5" : "0.0");
      } else {
        expect(fragment.match(/uniform\s+vec3\s+color\s*;/g) ?? []).toHaveLength(macros.has("OUTER") ? 1 : 0);
        expect(fragment).not.toMatch(/uniform\s+vec4\s+color/);
      }
    }
  });

  const knownGuards = [
    ["#define OUTER 1", "#ifdef OUTER"],
    ["#define OUTER", "#ifdef OUTER"],
    ["#define OUTER(x) x", "#ifdef OUTER"],
    ["#undef OUTER", "#ifndef OUTER"],
    ["#define OUTER 1", "#if defined(OUTER)"],
    ["#define VALUE 1\n#define OUTER VALUE", "#if OUTER"],
    ["#define OUTER(x) x", "#if OUTER(1)"],
    ["#define VALUE 1\n#define OUTER(x) x", "#if 0\n#elif OUTER(VALUE)"],
    ["#define VALUE 0\n#define OUTER VALUE", "#if OUTER\n#else"],
    ["#define OUTER 0", "#if OUTER == 0"],
    ["#define OUTER 1", "#ifndef OUTER\n#else"],
    ["#define OUTER 1", "#if 0\n#elif OUTER"]
  ];
  for (const kind of ["helper", "entry", "uniform"]) {
    it.each(knownGuards)(`uses source-defined truth to replace inherited ${kind}: %s, %s`, (mutation, guard) => {
      const declaration = (value: string) =>
        kind === "entry"
          ? `void vert() { gl_Position = vec4(${value}); }`
          : kind === "uniform"
            ? `${value === "0.5" ? "vec3" : "vec4"} color;`
            : `vec4 color() { return vec4(${value}); }`;
      const source = `Shader "known-guard-inheritance" {
#ifdef INNER
#ifdef OUTER
${declaration("0.25")}
#endif
#endif
${mutation}
SubShader "s" { Pass "p" {
#ifdef INNER
/* # provenance */   ${guard}
${declaration("0.5")}
#endif
${kind === "entry" ? "#else\nvoid vert() { gl_Position = vec4(0.0); }" : ""}
#endif
${kind === "entry" ? "" : "void vert() { gl_Position = vec4(0.0); }"}
void frag() {
  gl_FragColor = vec4(1.0);
${kind === "entry" ? "" : `#ifdef INNER\n  gl_FragColor = ${kind === "uniform" ? "vec4(color, 1.0)" : "color()"};\n#endif`}
}
VertexShader = vert; FragmentShader = frag;
} } }`;
      for (const { vertex, fragment, macros } of variants(source)) {
        expect(vertex.match(/void\s+main\s*\(/g)).toHaveLength(1);
        expect(vertex + fragment).not.toContain("0.25");
        if (kind === "entry") {
          expect(vertex).toContain(macros.has("INNER") ? "0.5" : "0.0");
        } else if (kind === "uniform") {
          expect(fragment.match(/uniform\s+vec3\s+color\s*;/g) ?? []).toHaveLength(macros.has("INNER") ? 1 : 0);
          expect(fragment).not.toMatch(/uniform\s+vec4\s+color/);
        } else {
          expect(fragment.match(/vec4\s+color\s*\(/g) ?? []).toHaveLength(macros.has("INNER") ? 1 : 0);
        }
      }
    });
  }

  it("keeps enclosing guards and unknown preceding arms in conditional truth facts", () => {
    const source = `#ifdef INNER
#define OUTER 1
#ifdef OUTER
nested;
#endif
#endif
#if UNKNOWN
first;
#elif 1
later;
#endif`;
    const result = Preprocessor.parseWithErrors(source, "", {}, new Map());
    const tokens = Array.from(new Lexer(result.content, {}, undefined, result.conditionalArms).tokenize());
    expect(result.errors).toEqual([]);
    const nested = tokens.find((token) => token.lexeme === "nested")!.branch;
    expect(nested.map((arm) => arm.sourceArm?.value)).toEqual([undefined, true]);
    expect(tokens.find((token) => token.lexeme === "later")!.branch[0].sourceArm?.value).toBeUndefined();
    const analyzerTokens = Array.from(
      new AnalyzerLexer(result.content, {}, undefined, result.conditionalArms).tokenize()
    );
    const analyzedNested = analyzerTokens.find((token) => token.lexeme === "nested")!.branch;
    expect(isBranchVisibleFrom(analyzedNested, [])).toBe(false);
    expect(isBranchVisibleFrom(analyzedNested, analyzedNested.slice(0, 1))).toBe(true);
    expect(isBranchVisibleFrom(analyzerTokens.find((token) => token.lexeme === "later")!.branch, [])).toBe(false);
  });

  it("keeps cached include truth at generated directive offsets across source-map modes and splices", () => {
    const cache = new Map();
    const includeMap = { "guard.glsl": "/* # before directive */  #if OUTER \\\n && 1\ninside;\n#endif\n" };
    const source = '#define OUTER 1\n#include "guard.glsl"\n#include "guard.glsl"';
    for (const trackSourceMap of [false, true, false, true]) {
      const result = Preprocessor.parseWithErrors(source, "", includeMap, cache, undefined, trackSourceMap);
      expect(result.errors).toEqual([]);
      const tokens = Array.from(new Lexer(result.content, {}, undefined, result.conditionalArms).tokenize());
      const inside = tokens.filter((token) => token.lexeme === "inside");
      expect(inside).toHaveLength(2);
      expect(inside.map((token) => token.branch[0].sourceArm?.value)).toEqual([true, true]);
      const analyzerTokens = Array.from(
        new AnalyzerLexer(result.content, {}, undefined, result.conditionalArms).tokenize()
      );
      expect(
        analyzerTokens
          .filter((token) => token.lexeme === "inside")
          .map((token) => isBranchVisibleFrom(token.branch, []))
      ).toEqual([true, true]);
    }
  });

  it("retains both same-scope sibling declarations", () => {
    const source = `Shader "sibling-declarations" { SubShader "s" { Pass "p" {
#ifdef OUTER
vec4 color() { return vec4(0.25); }
#else
vec4 color() { return vec4(0.5); }
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const { fragment, macros } of variants(source)) {
      expect(fragment.match(/vec4\s+color\s*\(/g)).toHaveLength(1);
      expect(fragment).toContain(macros.has("OUTER") ? "0.25" : "0.5");
      expect(fragment).not.toContain(macros.has("OUTER") ? "0.5" : "0.25");
    }
  });

  it("keeps same-scope conditional collisions visible to diagnostics", () => {
    const source = `Shader "same-scope-collision" { SubShader "s" { Pass "p" {
#ifdef OUTER
vec4 color() { return vec4(0.25); }
#endif
vec4 color() { return vec4(0.5); }
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toContain("Redefinition");
    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      expect(new ShaderCompiler().generate(analysis.passes[0], target)).toBeUndefined();
      expect(() => new ShaderPrecompiler().precompile(source, target)).toThrow("Redefinition");
    }
  });
});
