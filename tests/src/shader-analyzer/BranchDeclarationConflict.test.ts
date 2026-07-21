import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import type { IncludeMap } from "@galacean/engine-shader-parser";
import { describe, expect, it } from "vitest";

function pass(body: string): string {
  return `Shader "branch-declarations" { SubShader "s" { Pass "p" {
${body}
} } }`;
}

function shader(declarations: string, fragmentExpression = "vec4(0.0)"): string {
  return pass(`${declarations}
    void vert() { gl_Position = vec4(0.0); }
    void frag() { gl_FragColor = ${fragmentExpression}; }
    VertexShader = vert;
    FragmentShader = frag;`);
}

function analyze(source: string, includeMap?: IncludeMap) {
  return new ShaderAnalyzer().analyze(source, includeMap ? { includeMap } : undefined);
}

function redefinitions(source: string, includeMap?: IncludeMap) {
  return analyze(source, includeMap).diagnostics.filter((diagnostic) => diagnostic.code === "Redefinition");
}

describe("branch declaration conflicts", () => {
  it.each([
    ["conditional then unconditional", `#ifdef A\nfloat u_value;\n#endif\nfloat u_value;`],
    ["unconditional then conditional", `float u_value;\n#ifdef A\nfloat u_value;\n#endif`]
  ])("reports %s as an error", (_name, declarations) => {
    const diagnostics = redefinitions(shader(declarations));
    expect(diagnostics).to.have.lengthOf(1);
    expect(diagnostics[0].severity).to.equal("error");
  });

  it("reports declarations under independently configurable macros", () => {
    const diagnostics = redefinitions(
      shader(`#ifdef A
float u_value;
#endif
#ifdef B
float u_value;
#endif`)
    );
    expect(diagnostics).to.have.lengthOf(1);
  });

  it("does not infer caller-owned macro relationships for local declarations", () => {
    const diagnostics = redefinitions(
      shader(`void localDeclarations() {
#ifdef A
  float value;
#endif
#ifdef B
  float value;
#endif
}`)
    );
    expect(diagnostics).to.be.empty;
  });

  it("keeps unconditional local redefinition diagnostics", () => {
    const diagnostics = redefinitions(
      shader(`void localDeclarations() {
  float value;
  float value;
}`)
    );
    expect(diagnostics).to.have.lengthOf(1);
  });

  it("does not report opposite arms of one conditional chain", () => {
    const diagnostics = redefinitions(
      shader(`#ifdef A
float u_value;
#else
float u_value;
#endif`)
    );
    expect(diagnostics).to.be.empty;
  });

  it("treats #if/#elif/#else siblings as mutually exclusive", () => {
    const source = shader(`void fog() {
#if MODE == 1
  float intensity = 1.0;
#elif MODE == 2
  float intensity = 2.0;
#elif MODE == 3
  float intensity = 3.0;
#else
  float intensity = 4.0;
#endif
}`);
    expect(redefinitions(source)).to.be.empty;
  });

  it("reports a true duplicate inside one macro arm", () => {
    const diagnostics = redefinitions(
      shader(`#ifdef A
float u_value;
float u_value;
#endif`)
    );
    expect(diagnostics).to.have.lengthOf(1);
  });

  it("reports a true duplicate inside one canonical guard", () => {
    const diagnostics = redefinitions(
      shader(`#ifndef VALUE_INCLUDED
#define VALUE_INCLUDED
float u_value;
float u_value;
#endif`)
    );
    expect(diagnostics).to.have.lengthOf(1);
  });

  it("reports duplicates in separate non-guard #ifdef blocks", () => {
    const diagnostics = redefinitions(
      shader(`#ifdef A
float u_value;
#endif
#ifdef A
float u_value;
#endif`)
    );
    expect(diagnostics).to.have.lengthOf(1);
  });

  it("reports repeated #ifndef blocks that never define their guard", () => {
    const diagnostics = redefinitions(
      shader(`#ifndef VALUE_INCLUDED
float u_value;
#endif
#ifndef VALUE_INCLUDED
float u_value;
#endif`)
    );
    expect(diagnostics).to.have.lengthOf(1);
  });

  it("reports declarations in independent opaque conditional chains", () => {
    const diagnostics = redefinitions(
      shader(`#if MODE == 1
float u_value;
#endif
#if MODE == 2
float u_value;
#endif`)
    );
    expect(diagnostics).to.have.lengthOf(1);
  });

  it("silences repeated canonical include guards", () => {
    const diagnostics = redefinitions(
      shader(`#ifndef VALUE_INCLUDED
#define VALUE_INCLUDED
float u_value;
#endif
#ifndef VALUE_INCLUDED
#define VALUE_INCLUDED
float u_value;
#endif`)
    );
    expect(diagnostics).to.be.empty;
  });

  it("distinguishes guarded and unguarded repeated includes", () => {
    const guarded: IncludeMap = {
      "guarded.glsl": `#ifndef GUARDED_INCLUDED
#define GUARDED_INCLUDED
float u_value;
#endif`
    };
    const unguarded: IncludeMap = { "unguarded.glsl": "float u_value;" };

    expect(
      redefinitions(
        shader(
          `#include "guarded.glsl"
#include "guarded.glsl"`,
          "vec4(u_value)"
        ),
        guarded
      )
    ).to.be.empty;
    expect(
      redefinitions(
        shader(
          `#include "unguarded.glsl"
#include "unguarded.glsl"`,
          "vec4(u_value)"
        ),
        unguarded
      )
    ).to.have.lengthOf(1);
  });

  it("reports guarded declarations separated by #undef", () => {
    const includeMap: IncludeMap = {
      "guarded.glsl": `#ifndef GUARDED_INCLUDED
#define GUARDED_INCLUDED
float u_value;
#endif`
    };
    const diagnostics = redefinitions(
      shader(
        `#include "guarded.glsl"
#undef GUARDED_INCLUDED
#include "guarded.glsl"`,
        "vec4(u_value)"
      ),
      includeMap
    );
    expect(diagnostics).to.have.lengthOf(1);
  });

  it("keeps one guard generation after an earlier #undef", () => {
    const includeMap: IncludeMap = {
      "guarded.glsl": `#ifndef GUARDED_INCLUDED
#define GUARDED_INCLUDED
float u_value;
#endif`
    };
    const diagnostics = redefinitions(
      shader(
        `#undef GUARDED_INCLUDED
#include "guarded.glsl"
#include "guarded.glsl"`,
        "vec4(u_value)"
      ),
      includeMap
    );
    expect(diagnostics).to.be.empty;
  });

  it("silences direct and transitive includes of one guarded chunk", () => {
    const includeMap: IncludeMap = {
      "guarded.glsl": `#ifndef GUARDED_INCLUDED
#define GUARDED_INCLUDED
float u_value;
#endif`,
      "wrapper.glsl": `#include "guarded.glsl"`
    };
    const diagnostics = redefinitions(
      shader(
        `#include "guarded.glsl"
#include "wrapper.glsl"`,
        "vec4(u_value)"
      ),
      includeMap
    );
    expect(diagnostics).to.be.empty;
  });

  it("does not let an inner guard definition retroactively suppress an entered outer arm", () => {
    const diagnostics = redefinitions(
      shader(`#ifndef G
  #ifndef G
    #define G
    float u_value;
  #endif
  #define G
  float u_value;
#endif`)
    );
    expect(diagnostics).to.have.lengthOf(1);
  });

  it.each([
    ["conditional then unconditional", `#ifdef A\nstruct S { float value; };\n#endif\nstruct S { float value; };`],
    ["unconditional then conditional", `struct S { float value; };\n#ifdef A\nstruct S { float value; };\n#endif`]
  ])("reports struct conflicts: %s", (_name, declarations) => {
    expect(redefinitions(shader(declarations))).to.have.lengthOf(1);
  });

  it.each([
    [
      "function, unconditional first",
      `float branchValue() { return 1.0; }
#ifdef A
float branchValue() { return 2.0; }
#endif`,
      "vec4(branchValue())",
      /float\s+branchValue\s*\(\s*\)/g
    ],
    [
      "function, conditional first",
      `#ifdef A
float branchValue() { return 2.0; }
#endif
float branchValue() { return 1.0; }`,
      "vec4(branchValue())",
      /float\s+branchValue\s*\(\s*\)/g
    ],
    [
      "variable, unconditional first",
      `float branchValue;
#ifdef A
float branchValue;
#endif`,
      "vec4(branchValue)",
      /float\s+branchValue\s*;/g
    ],
    [
      "variable, conditional first",
      `#ifdef A
float branchValue;
#endif
float branchValue;`,
      "vec4(branchValue)",
      /float\s+branchValue\s*;/g
    ],
    [
      "struct, unconditional first",
      `struct BranchData { float value; };
#ifdef A
struct BranchData { float value; };
#endif
BranchData branchData;`,
      "vec4(branchData.value)",
      /struct\s+BranchData\b/g
    ],
    [
      "struct, conditional first",
      `#ifdef A
struct BranchData { float value; };
#endif
struct BranchData { float value; };
BranchData branchData;`,
      "vec4(branchData.value)",
      /struct\s+BranchData\b/g
    ]
  ])("retains both conflicting declarations for codegen: %s", (_name, declarations, expression, pattern) => {
    const source = shader(declarations, expression);
    const { diagnostics, passes } = analyze(source);
    expect(diagnostics.filter((diagnostic) => diagnostic.code === "Redefinition")).to.have.lengthOf(1);

    const pass = passes[0];
    const output = new ShaderCompiler().generate(
      pass.program,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES100
    ).fragment;
    expect(output.match(pattern) ?? []).to.have.lengthOf(2);
    expect(output).to.include("#ifdef A");
  });
});
