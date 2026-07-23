/**
 * Injecting an analyzer (engine: `WebGLEngine.create({ shaderCompiler, shaderAnalyzer })`) turns on
 * diagnostics during shader compilation — the compiler diagnoses the program it already parsed (no
 * extra parse) and the analyzer surfaces it through the engine Logger. Without an analyzer,
 * compilation runs no diagnostics and is unchanged.
 */
import { Logger, ShaderLanguage } from "@galacean/engine-core";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it, vi } from "vitest";

// Valid entries, but `i.notAField` references a struct member that doesn't exist.
const passWithIssue = `
struct Attributes { vec3 POSITION; };
struct Varyings { vec4 color; };
Varyings vert(Attributes attr) { Varyings o; o.color = vec4(attr.POSITION, 1.0); return o; }
void frag(Varyings i) { gl_FragColor = i.notAField; }`;

describe("analyzer injection: diagnostics ride along with compilation", () => {
  it("injected analyzer surfaces diagnostics via Logger during _parseShaderPass (one parse)", () => {
    const compiler = new ShaderCompiler();
    const analyzer = new ShaderAnalyzer();
    compiler._setAnalyzer(analyzer);

    const spy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    try {
      const out = compiler._parseShaderPass(passWithIssue, "vert", "frag", ShaderLanguage.GLSLES300, "");
      const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).to.include("UndeclaredStructMember");
      expect(out, "an analyzer error blocks codegen").to.be.undefined;
    } finally {
      spy.mockRestore();
    }
  });

  it("no analyzer → compilation runs no diagnostics, unchanged", () => {
    const compiler = new ShaderCompiler();
    const spy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    try {
      const out = compiler._parseShaderPass(passWithIssue, "vert", "frag", ShaderLanguage.GLSLES300, "");
      const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged, "no analyzer → no diagnostic logged").to.not.include("UndeclaredStructMember");
      expect(out).to.not.be.undefined;
    } finally {
      spy.mockRestore();
    }
  });

  it("EntryNotFound: analyzer diagnoses and blocks a mistyped entry", () => {
    const compiler = new ShaderCompiler();
    const analyzer = new ShaderAnalyzer();
    compiler._setAnalyzer(analyzer);

    const missingEntry = `
struct Attributes { vec3 POSITION; };
void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
void frag() { gl_FragColor = vec4(0.0); }`;

    const errSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    try {
      let threw: unknown = null;
      let out: any;
      try {
        out = compiler._parseShaderPass(missingEntry, "notReal", "frag", ShaderLanguage.GLSLES300, "");
      } catch (e) {
        threw = e;
      }
      expect(threw, "the analyzer gate must not throw").to.be.null;
      expect(out, "an analyzer error blocks codegen").to.be.undefined;

      const logged = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged, "analyzer surfaces `EntryNotFound` via Logger").to.include("EntryNotFound");
    } finally {
      errSpy.mockRestore();
    }
  });

  it("source-structure failures block every pass before code generation", () => {
    const compiler = new ShaderCompiler();
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    try {
      const source = `Shader "bad-entries" { SubShader "s" { Pass "p" {
void vert() { gl_Position = vec4(0.0); }
void otherVert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert;
VertexShader = otherVert;
FragmentShader = frag;
} } }`;
      const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
      expect(
        compiler._parseShaderPass(pass.contents, pass.vertexEntry, pass.fragmentEntry, ShaderLanguage.GLSLES300, "")
      ).to.be.undefined;
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("missing includes block code generation without requiring an analyzer", () => {
    const compiler = new ShaderCompiler();
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    try {
      expect(
        compiler._parseShaderPass(
          '#include "missing.glsl"\nvoid vert() { gl_Position = vec4(0.0); }\nvoid frag() { gl_FragColor = vec4(1.0); }',
          "vert",
          "frag",
          ShaderLanguage.GLSLES300,
          ""
        )
      ).to.be.undefined;
    } finally {
      errorSpy.mockRestore();
    }
  });
});
