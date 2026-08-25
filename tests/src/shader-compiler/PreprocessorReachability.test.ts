import { ShaderLanguage } from "@galacean/engine-core";
import { DiagnosticType, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/src/ShaderPrecompiler";
import { Preprocessor } from "@galacean/engine-shader-parser/internal";
import { describe, expect, it } from "vitest";

function shader(body: string): string {
  return `Shader "PreprocessorReachability" { SubShader "Default" { Pass "p" {
${body}
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
}

describe("preprocessor reachability", () => {
  it("does not resolve includes or parse GLSL inside a definitely false arm", () => {
    const deadBody = `#if 0
#include "missing.glsl"
#define STRINGIFY(X) #X
float deadValue = ;
#endif`;
    const source = shader(deadBody);
    const analysis = ShaderAnalyzer.analyze(source);

    expect(analysis.diagnostics).toEqual([]);
    const compiler = new ShaderCompiler();
    const generated = compiler.generate(analysis.passes[0], ShaderLanguage.GLSLES100);
    expect(generated).toBeDefined();
    expect(generated!.fragment).not.toContain("deadValue");
    expect(generated!.fragment).not.toContain("STRINGIFY");

    const runtimeGenerated = compiler._parseShaderPass(
      `${deadBody}
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }`,
      "vert",
      "frag",
      ShaderLanguage.GLSLES100
    );
    expect(runtimeGenerated).toBeDefined();
  });

  it("does not evaluate an elif or parse its body after a definitely true arm", () => {
    const source = shader(`#if 1
float activeValue;
#elif 123 defined(USE_VALUE)
#include "missing.glsl"
float deadValue = ;
#else
float deadElseValue = ;
#endif`);

    expect(ShaderAnalyzer.analyze(source).diagnostics).toEqual([]);
    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).not.toThrow();
  });

  it("does not validate nested directives inside an unreachable parent", () => {
    const source = shader(`#if 0
#if 123 defined(USE_VALUE)
float deadValue = ;
#endif
#endif`);

    expect(ShaderAnalyzer.analyze(source).diagnostics).toEqual([]);
  });

  it("proves short-circuit and conditional expressions without assuming external macro values", () => {
    for (const expression of ["0 && FEATURE_ENABLED", "FEATURE_ENABLED && 0"]) {
      const analysis = ShaderAnalyzer.analyze(
        shader(`#if ${expression}
float deadValue = ;
#endif`)
      );
      expect(analysis.diagnostics, expression).toEqual([]);
    }

    for (const expression of ["1 || FEATURE_ENABLED", "FEATURE_ENABLED || 1"]) {
      const analysis = ShaderAnalyzer.analyze(
        shader(`#if ${expression}
float activeValue;
#else
float deadValue = ;
#endif`)
      );
      expect(analysis.diagnostics, expression).toEqual([]);
    }
  });

  it("prunes comparisons outside the signed 32-bit macro domain", () => {
    for (const expression of ["MODE > 2147483647", "MODE < -2147483648", "MODE < 0x80000000u"]) {
      const analysis = ShaderAnalyzer.analyze(
        shader(`#if ${expression}
#include "missing.glsl"
float deadValue = ;
#endif`)
      );
      expect(analysis.diagnostics, expression).toEqual([]);
    }
  });

  it("prunes a multiline condition that is statically false", () => {
    const analysis = ShaderAnalyzer.analyze(
      shader(`#if 0 && \\
FEATURE_ENABLED
#include "missing.glsl"
float deadValue = ;
#endif`)
    );

    expect(analysis.diagnostics).toEqual([]);
  });

  it("ignores directive-looking text inside a block comment while masking a dead arm", () => {
    const source = shader(`#if 0
/*
#else
*/
float deadValue = ;
#endif`);

    expect(ShaderAnalyzer.analyze(source).diagnostics).toEqual([]);
  });

  it("applies the same reachability rules inside an included chunk", () => {
    const analysis = ShaderAnalyzer.analyze(shader('#include "Wrapper.glsl"'), {
      includeMap: {
        "Wrapper.glsl": `#if 0
#include "missing.glsl"
float deadValue = ;
#endif`
      }
    });

    expect(analysis.diagnostics).toEqual([]);
    expect(new ShaderCompiler().generate(analysis.passes[0], ShaderLanguage.GLSLES100)).toBeDefined();
  });

  it("uses an earlier source macro to prune a later include", () => {
    const analysis = ShaderAnalyzer.analyze(
      shader(`#define FEATURE_ENABLED 0
#if FEATURE_ENABLED
#include "missing.glsl"
float deadValue = ;
#endif`)
    );

    expect(analysis.diagnostics).toEqual([]);
  });

  it("carries source macro state into and back out of included chunks", () => {
    const analysis = ShaderAnalyzer.analyze(
      shader(`#define FEATURE_ENABLED 0
#include "Wrapper.glsl"
#if ENABLE_AFTER_INCLUDE
#include "missing-after.glsl"
#endif`),
      {
        includeMap: {
          "Wrapper.glsl": `#if FEATURE_ENABLED
#include "missing-inside.glsl"
#endif
#define ENABLE_AFTER_INCLUDE 0`
        }
      }
    );

    expect(analysis.diagnostics).toEqual([]);
  });

  it("applies an unconditional undef before resolving later includes", () => {
    const analysis = ShaderAnalyzer.analyze(
      shader(`#define FEATURE_ENABLED 1
#undef FEATURE_ENABLED
#if FEATURE_ENABLED
#include "missing.glsl"
#endif`)
    );

    expect(analysis.diagnostics).toEqual([]);
  });

  it("proves a canonical guard is defined after its conditional block", () => {
    const analysis = ShaderAnalyzer.analyze(
      shader(`#ifndef WRAPPER_INCLUDED
#define WRAPPER_INCLUDED
#endif
#if !defined(WRAPPER_INCLUDED)
#include "missing.glsl"
#endif`)
    );

    expect(analysis.diagnostics).toEqual([]);
  });

  it("propagates a canonical guard from an included chunk", () => {
    const analysis = ShaderAnalyzer.analyze(
      shader(`#include "Guarded.glsl"
#ifndef GUARDED_INCLUDED
#include "missing.glsl"
#endif`),
      {
        includeMap: {
          "Guarded.glsl": `#ifndef GUARDED_INCLUDED
#define GUARDED_INCLUDED
#endif`
        }
      }
    );

    expect(analysis.diagnostics).toEqual([]);
  });

  it("evaluates aliases and multiline replacement expressions at their use site", () => {
    const analysis = ShaderAnalyzer.analyze(
      shader(`#define FEATURE_ALIAS FEATURE_VALUE
#define FEATURE_VALUE 1 + \\
-1
#if FEATURE_ALIAS
#include "missing.glsl"
#endif`)
    );

    expect(analysis.diagnostics).toEqual([]);
  });

  it("evaluates source-defined token fragments before deciding reachability", () => {
    const analysis = ShaderAnalyzer.analyze(
      shader(`#define FIRST 17
#define SECOND + 5
#if FIRST SECOND != 22
#include "missing.glsl"
#endif`)
    );

    expect(analysis.diagnostics).toEqual([]);
  });

  it("evaluates source-defined function macros before resolving includes", () => {
    const analysis = ShaderAnalyzer.analyze(
      shader(`#define ZERO(VALUE) 0
#define WRAP(VALUE) ZERO(VALUE)
#if defined(WRAP) && WRAP(1)
#include "missing.glsl"
#endif`)
    );

    expect(analysis.diagnostics).toEqual([]);
  });

  it("rescans object replacements that produce function-macro calls", () => {
    const analysis = ShaderAnalyzer.analyze(
      shader(`#define ZERO(VALUE) 0
#define FUNCTION_CALL ZERO(1)
#define FORWARD FUNCTION_CALL
#if FORWARD
#include "missing.glsl"
#endif`)
    );

    expect(analysis.diagnostics).toEqual([]);
  });

  it("keeps function-macro conditions with an external argument conservative", () => {
    const diagnostics = ShaderAnalyzer.analyze(
      shader(`#define IDENTITY(VALUE) VALUE
#if IDENTITY(EXTERNAL_FEATURE)
#include "missing.glsl"
#endif`)
    ).diagnostics;

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(DiagnosticType.PreprocessorError);
  });

  it("does not reuse an include expansion produced under a different macro state", () => {
    const diagnostics = ShaderAnalyzer.analyze(
      shader(`#define FEATURE_ENABLED 0
#include "Conditional.glsl"
#undef FEATURE_ENABLED
#define FEATURE_ENABLED 1
#include "Conditional.glsl"`),
      {
        includeMap: {
          "Conditional.glsl": `#if FEATURE_ENABLED
#include "missing.glsl"
#endif`
        }
      }
    ).diagnostics;

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(DiagnosticType.PreprocessorError);
  });

  it("keeps include cache keys unambiguous for arbitrary replacement text", () => {
    const result = Preprocessor.parseWithErrors(
      `#define A x;B=1:y
#include "Conditional.glsl"
#undef A
#define A x
#define B y
#include "Conditional.glsl"`,
      "",
      {
        "Conditional.glsl": `#ifdef B
float withB;
#else
float withoutB;
#endif`
      },
      new Map()
    );

    expect(result.errors).toEqual([]);
    expect(result.content.match(/float withoutB;/g)).toHaveLength(1);
    expect(result.content.match(/float withB;/g)).toHaveLength(2);
  });

  it("does not prune an include when a conditional macro mutation leaves a reachable configuration", () => {
    const diagnostics = ShaderAnalyzer.analyze(
      shader(`#define FEATURE_ENABLED 1
#ifdef DISABLE_FEATURE
#undef FEATURE_ENABLED
#endif
#if FEATURE_ENABLED
#include "missing.glsl"
#endif`)
    ).diagnostics;

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(DiagnosticType.PreprocessorError);
  });

  it("still resolves includes in a branch that depends on an external macro", () => {
    const diagnostics = ShaderAnalyzer.analyze(
      shader(`#if FEATURE_ENABLED
#include "missing.glsl"
#endif`)
    ).diagnostics;

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(DiagnosticType.PreprocessorError);
  });

  it("keeps source attribution for an active arm after pruning a false arm", () => {
    const brokenChunk = "float brokenValue = ;";
    const diagnostic = ShaderAnalyzer.analyze(
      shader(`#if 0
#include "dead.glsl"
#elif 1
#include "chunks/Broken.glsl"
#endif`),
      {
        sourceFile: "Shaders/Root.shader",
        includeMap: { "chunks/Broken.glsl": brokenChunk }
      }
    ).diagnostics.find((item) => item.code === DiagnosticType.SyntaxError);

    expect(diagnostic).toBeDefined();
    expect(diagnostic!.sourceFile).toBe("chunks/Broken.glsl");
    expect(diagnostic!.relatedSource).toBe(brokenChunk);
    expect(diagnostic!.range.start.line).toBe(1);
  });
});
