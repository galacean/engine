import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { getParsedShaderPassPayload } from "@galacean/engine-shader-parser/internal";
import { describe, expect, it } from "vitest";

function shader(body: string, helpers = ""): string {
  return `Shader "assignment-target-scope" { SubShader "s" { Pass "p" {
${helpers}
void vert() { gl_Position = vec4(0.0); }
void frag() { ${body} gl_FragColor = vec4(1.0); }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

describe("modifiable swizzle targets", () => {
  it.each([
    ["assignment", "v.xx = vec2(1.0);"],
    ["compound assignment", "v.rr += vec2(1.0);"],
    ["prefix increment", "++v.ss;"],
    ["postfix increment", "v.yy++;"],
    ["prefix decrement", "--v.tt;"],
    ["postfix decrement", "v.gg--;"],
    ["mixed component names", "v.xr = vec2(1.0);"],
    ["nested swizzle", "v.xy.xx = vec2(1.0);"],
    ["nested mixed components", "v.xy.xr = vec2(1.0);"],
    ["parenthesized swizzle", "(v.xy).xx = vec2(1.0);"],
    ["indexed repeated swizzle", "v.xx[0] = 1.0;"]
  ])("rejects %s with an invalid target", (_label, operation) => {
    const result = ShaderAnalyzer.analyze(shader(`vec2 v = vec2(0.0); ${operation}`));
    expect(result.diagnostics.filter((issue) => issue.code === "InvalidAssignmentTarget")).toHaveLength(1);
  });

  it.each(["out", "inout"])("rejects repeated components passed to an %s parameter", (qualifier) => {
    const source = shader(
      "vec2 v = vec2(0.0); modify(v.xx);",
      `void modify(${qualifier} vec2 target) { target = vec2(1.0); }`
    );
    const result = ShaderAnalyzer.analyze(source);
    const invalid = result.diagnostics.filter((issue) => issue.code === "InvalidAssignmentTarget");
    expect(invalid).toHaveLength(1);
    expect(source.slice(invalid[0].range.start.offset, invalid[0].range.end.offset)).toBe("v.xx");
  });

  it.each([
    "vec2 v = vec2(0.0); vec2 readValue = v.xx;",
    "vec2 v = vec2(0.0); v.xy = vec2(1.0); v.rg += vec2(1.0); v.st++;",
    "vec2 v = vec2(0.0); v.xy.yx = vec2(1.0);",
    "vec2 v = vec2(0.0); modify(v.xy);",
    "vec2 v = vec2(0.0); readOnly(v.xx);",
    "Payload value; value.xx = vec2(1.0);",
    "vec2 v = vec2(0.0); WRITE = vec2(1.0);"
  ])("preserves a valid read or write: %s", (body) => {
    const result = ShaderAnalyzer.analyze(
      shader(
        body,
        `
struct Payload { vec2 xx; };
void modify(out vec2 target) { target = vec2(1.0); }
void readOnly(in vec2 value) { }
#define WRITE v.xy
`
      )
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("leaves divergent vector/struct receiver types unresolved", () => {
    const result = ShaderAnalyzer.analyze(
      shader(
        `
#ifdef VECTOR
vec2 value;
#else
Payload value;
#endif
value.xx = vec2(1.0);`,
        "struct Payload { vec2 xx; };"
      )
    );
    expect(result.diagnostics.some((issue) => issue.code === "InvalidAssignmentTarget")).toBe(false);
  });

  it("leaves divergent input/output parameter modes unresolved", () => {
    const result = ShaderAnalyzer.analyze(
      shader(
        "vec2 v = vec2(0.0); modify(v.xx);",
        `
#ifdef WRITE
void modify(out vec2 target) { target = vec2(1.0); }
#else
void modify(in vec2 target) { }
#endif
`
      )
    );
    expect(result.diagnostics.some((issue) => issue.code === "InvalidAssignmentTarget")).toBe(false);
  });
});

describe("local function prototype recovery", () => {
  it.each(["int g();", "int g(float value);", "int g(); int h();", "{ int g(); }"])(
    "retains both entries after %s",
    (prototype) => {
      const source = shader(`float value = 1.0; ${prototype} value = 2.0;`);
      const result = ShaderAnalyzer.analyze(source);
      expect(result.diagnostics.map((issue) => issue.code)).toEqual(
        Array(prototype.includes("h()") ? 2 : 1).fill("LocalFunctionPrototype")
      );
      const core = getParsedShaderPassPayload(result.passes[0]).coreInfo;
      expect(core.vertexEntry.functions.map((fn) => fn.ident)).toEqual(["vert"]);
      expect(core.fragmentEntry.functions.map((fn) => fn.ident)).toEqual(["frag"]);
      expect(core.fragmentEntry.functions[0].localVariables.map((variable) => variable.ident)).toEqual(["value"]);
    }
  );

  it("preserves calls recorded before and after a prototype", () => {
    const source = shader("before(); int localPrototype(); after();", "void before() {} void after() {}");
    const result = ShaderAnalyzer.analyze(source);
    expect(result.diagnostics.map((issue) => issue.code)).toEqual(["LocalFunctionPrototype"]);
    const core = getParsedShaderPassPayload(result.passes[0]).coreInfo;
    expect(core.fragmentEntry.functions[0].calledFunctions.map((fn) => fn.ident)).toEqual(["before", "after"]);
  });
});
