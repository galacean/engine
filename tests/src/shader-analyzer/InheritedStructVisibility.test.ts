import { DiagnosticType, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { describe, expect, it } from "vitest";

const data = "struct Data { vec2 x; };";
const copy = "Data copy(Data v) { return v; }";

function shader(inherited: string, passDeclarations: string): string {
  return `Shader "inherited-struct-visibility" {
${inherited}
SubShader "s" { Pass "p" {
${passDeclarations}
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

describe("inherited struct visibility", () => {
  it.each([
    ["single override", data],
    ["exhaustive overrides", `#ifdef A\n${data}\n#else\n${data}\n#endif`]
  ])("retains the declared type of an inherited helper before %s", (_, overrides) => {
    const source = shader(`${data}\n${copy}`, overrides).replace(
      "gl_FragColor = vec4(1.0);",
      "Data v; v.x = vec2(0.5); Data w = copy(v); gl_FragColor = vec4(w.x, 0.0, 1.0);"
    );
    expect(ShaderAnalyzer.analyze(source).diagnostics).toEqual([]);
  });

  it("accepts a helper whose captured type covers its own macro branch", () => {
    const source = shader(`#ifdef A\n${data}\n${copy}\n#endif`, data);
    expect(ShaderAnalyzer.analyze(source).diagnostics).toEqual([]);
  });

  it.each([
    ["a later declaration", "", `${copy}\n${data}`],
    ["a later override filling an earlier branch gap", `#ifdef A\n${data}\n#endif\n${copy}`, data],
    ["a type only declared in the opposite branch", `#ifdef A\n${data}\n#else\n${copy}\n#endif`, data]
  ])("still rejects %s", (_, inherited, declarations) => {
    const diagnostics = ShaderAnalyzer.analyze(shader(inherited, declarations)).diagnostics.filter(
      (diagnostic) => diagnostic.code === DiagnosticType.UseBeforeDeclaration
    );
    expect(diagnostics).toHaveLength(2);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("Data");
    }
  });
});
