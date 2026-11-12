import { DiagnosticType, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { Shader, ShaderLanguage, WebGLEngine, WebGLMode } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";

function source(name: string, body: string): string {
  return `Shader "${name}" { SubShader "s" { Pass "p" {
float helper(bool flag) { ${body} }
void vert() { gl_Position = vec4(helper(true)); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

describe("loop return coverage", () => {
  it.each([ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300])(
    "accepts returning loops that compile in GLES %i",
    async (target) => {
      const engine = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        shaderCompiler: new ShaderCompiler(),
        graphicDeviceOptions: {
          webGLMode: target === ShaderLanguage.GLSLES100 ? WebGLMode.WebGL1 : WebGLMode.WebGL2
        }
      });
      try {
        for (const [index, body] of [
          "for (int i = 0; i < 1; i++) { return 1.0; }",
          "while (true) { return 1.0; }",
          "while (flag) { return 1.0; } return 0.0;",
          "for (int i = 0; i < 0; i++) { return 1.0; } return 0.0;",
          "for (int i = 0; i < 1; i++) { if (flag) break; return 1.0; } return 0.0;"
        ].entries()) {
          const code = source(`loop-return-${target}-${index}`, body);
          expect(ShaderAnalyzer.analyze(code).diagnostics, body).toEqual([]);
          const shader = Shader.create(code, target)!;
          try {
            expect(shader.compileVariant(engine, []), body).toBe(true);
          } finally {
            shader.destroy();
          }
        }
      } finally {
        engine.destroy();
      }
    }
  );

  it("does not infer a guaranteed return from a loop whose condition is unknown", () => {
    const code = source("unknown-loop-return", "while (flag) { return 1.0; }");
    expect(ShaderAnalyzer.analyze(code).diagnostics).toEqual([]);
  });

  it("retains a missing-return error in a macro branch without a loop", () => {
    const code = source("loop-return-macro", "\n#ifdef LOOP\nfor (int i = 0; i < 1; i++) { return 1.0; }\n#endif\n");
    expect(ShaderAnalyzer.analyze(code).diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticType.MissingReturn
    ]);
  });

  it("still diagnoses an invalid return value inside a loop", () => {
    const code = source("invalid-loop-return", "while (flag) { return vec3(1.0); }");
    expect(ShaderAnalyzer.analyze(code).diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticType.InvalidReturnType
    ]);
  });
});
