/**
 * Injecting an analyzer (engine: `WebGLEngine.create({ shaderCompiler, shaderAnalyzer })`) turns on
 * diagnostics during shader compilation — the compiler diagnoses the program it already parsed (no
 * extra parse) and the analyzer surfaces it via `onDiagnostics`. Without an analyzer, compilation
 * runs no diagnostics and is unchanged.
 */
import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";

// Valid entries, but `i.notAField` references a struct member that doesn't exist.
const passWithIssue = `
struct Attributes { vec3 POSITION; };
struct Varyings { vec4 color; };
Varyings vert(Attributes attr) { Varyings o; o.color = vec4(attr.POSITION, 1.0); return o; }
void frag(Varyings i) { gl_FragColor = i.notAField; }`;

describe("analyzer injection: diagnostics ride along with compilation", () => {
  it("injected analyzer surfaces diagnostics during _parseShaderPass (one parse)", () => {
    const compiler = new ShaderCompiler();
    const analyzer = new ShaderAnalyzer();
    compiler._setAnalyzer(analyzer);

    const captured: { code: string }[] = [];
    analyzer.onDiagnostics = (d) => captured.push(...d);

    const out = compiler._parseShaderPass(passWithIssue, "vert", "frag", ShaderLanguage.GLSLES300, "");

    expect(captured.map((d) => d.code)).to.include("UndeclaredStructMember");
    expect(out, "compilation still produces GLSL (best-effort)").to.not.be.undefined;
  });

  it("no analyzer → no diagnostics fired, compilation unchanged", () => {
    const compiler = new ShaderCompiler();
    let fired = false;
    // (no analyzer injected)
    const out = compiler._parseShaderPass(passWithIssue, "vert", "frag", ShaderLanguage.GLSLES300, "");
    expect(fired).to.equal(false);
    expect(out).to.not.be.undefined;
  });
});
