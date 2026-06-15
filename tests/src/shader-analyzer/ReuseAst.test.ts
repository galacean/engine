/**
 * The editor parses once: `analyze()` returns the parsed per-pass ASTs, and the compiler
 * generates GLSL from them directly — no second parse. These tests prove the returned program
 * is real (codegen-able, error-free) and that codegen on the reused AST is byte-identical to a
 * fresh parse + codegen.
 */
import { ShaderLanguage } from "@galacean/engine-core";
import { DiagnosticSeverity, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderCompilerUtils, ShaderSourceParser } from "@galacean/engine-shader-parser";
import { describe, expect, it } from "vitest";

const source = `Shader "x" {
  SubShader "s" {
    Pass "p" {
      struct Attributes { vec3 POSITION; };
      struct Varyings { vec4 color; };
      Varyings vert(Attributes attr) { Varyings o; o.color = vec4(attr.POSITION, 1.0); return o; }
      void frag(Varyings i) { gl_FragColor = i.color; }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;

describe("analyze exposes reusable AST (editor parses once)", () => {
  it("returns the parsed program(s) with no error diagnostics", () => {
    const { diagnostics, passes } = new ShaderAnalyzer().analyze(source);
    expect(diagnostics.filter((d) => d.severity === DiagnosticSeverity.Error).map((d) => d.message)).to.deep.equal([]);
    expect(passes.length).to.equal(1);
    expect(passes[0].program).to.be.ok;
    expect(passes[0].vertexEntry).to.equal("vert");
    expect(passes[0].fragmentEntry).to.equal("frag");
  });

  it("compiler.generate on the reused AST is identical to a fresh parse + compile", () => {
    const compiler = new ShaderCompiler();

    // Editor path: one parse via analyze(), then the SAME public codegen entry the engine uses.
    const { passes } = new ShaderAnalyzer().analyze(source);
    const reused = compiler.generate(
      passes[0].program,
      passes[0].vertexEntry,
      passes[0].fragmentEntry,
      ShaderLanguage.GLSLES300
    );
    const reusedVertex = reused.vertex;
    const reusedFragment = reused.fragment;
    const reusedVertexInstructions = reused.vertexShaderInstructions;

    // Reference path: structure-parse, then a fresh per-pass parse + compile of the same source.
    ShaderCompilerUtils.clearAllShaderCompilerObjectPool();
    const p = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    const fresh = compiler._parseShaderPass(p.contents, p.vertexEntry, p.fragmentEntry, ShaderLanguage.GLSLES300, "");

    expect(reusedVertex).to.equal(fresh!.vertex);
    expect(reusedFragment).to.equal(fresh!.fragment);
    // generate() includes instruction encoding (the visitor alone would not) — same as the engine path.
    expect(reusedVertexInstructions).to.deep.equal(fresh!.vertexShaderInstructions);
    expect(reusedVertexInstructions).to.not.be.undefined;
  });
});
