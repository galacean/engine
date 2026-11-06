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
          "if (1 == 1) return 1.0;",
          "while (1 < 2) { if (true) return 1.0; break; }",
          "while (flag) { return 1.0; } return 0.0;",
          "for (int i = 0; i < 0; i++) { return 1.0; } return 0.0;",
          "for (int i = 0; i < 1; i++) { if (flag) break; return 1.0; } return 0.0;",
          ...(target === ShaderLanguage.GLSLES300
            ? ["while (2147483648u > 0u) { return 1.0; }", "for (uint i = 2147483648U; i > 0U; i++) { return 1.0; }"]
            : [])
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

  it.each([
    "while (false) { return 1.0; }",
    "while (!true) { return 1.0; }",
    "while (1 > 2) { return 1.0; }",
    "for (int i = 0; i < 0; i++) { return 1.0; }",
    "for (int i = 1; 0 > i; i++) { return 1.0; }",
    "for (int i = 0; false; i++) { return 1.0; }",
    "while (2147483648u < 1u) { return 1.0; }",
    "for (uint i = 2147483648U; i < 1U; i++) { return 1.0; }",
    "while (true) { break; }",
    "while (true) { break; return 1.0; }",
    "while (true) { if (false) return 1.0; break; }",
    "while (true) { if (flag) break; else break; }",
    "while (flag) { break; }",
    "while (true) { while (false) { return 1.0; } break; }"
  ])("diagnoses proven fallthrough: %s", (body) => {
    expect(
      ShaderAnalyzer.analyze(source("loop-fallthrough", body)).diagnostics.map((diagnostic) => diagnostic.code)
    ).toEqual([DiagnosticType.MissingReturn]);
  });

  it.each([
    "while (true) { return 1.0; break; }",
    "while (true) { continue; break; }",
    "while (true) { while (true) { break; } return 1.0; }",
    "while (true) { while (true) { break; } continue; }",
    "while (true) { if (true) return 1.0; break; }",
    "while (true) { if (flag) break; return 1.0; } if (flag) return 0.0;",
    "for (int i = 0, j = i++; i < 1; i++) { return 1.0; }",
    "for (int i = 0; (i++ < 0) || (i < 1); i++) { return 1.0; }",
    "int i = 1; for (int i = 0; i < 1; i++) { return 1.0; }",
    "for (uint i = uint(-1); i > uint(0); i++) { return 1.0; }"
  ])("preserves terminating or unresolved paths: %s", (body) => {
    expect(ShaderAnalyzer.analyze(source("loop-exits", body)).diagnostics).toEqual([]);
  });

  it("retains macro-specific fallthrough after a loop break", () => {
    const body = "while (true) {\n#ifdef BREAK\nbreak;\n#else\nreturn 1.0;\n#endif\n}";
    expect(
      ShaderAnalyzer.analyze(source("macro-break", body)).diagnostics.map((diagnostic) => diagnostic.code)
    ).toEqual([DiagnosticType.MissingReturn]);
    expect(
      ShaderAnalyzer.analyze(source("macro-break-return", `${body}\n#ifdef BREAK\nreturn 0.0;\n#endif\n`)).diagnostics
    ).toEqual([]);
  });

  it("keeps return and continue paths inside an invariant loop from reaching the function end", () => {
    const body = "while (true) {\n#ifdef RETURN\nreturn 1.0;\n#else\ncontinue;\n#endif\n}";
    expect(ShaderAnalyzer.analyze(source("macro-continue", body)).diagnostics).toEqual([]);
  });

  it.each([
    "!".repeat(8192) + "false",
    Array(8192).fill("true").join(" && "),
    Array(8192).fill("1").join(" + ") + " < 0"
  ])("leaves deep constant proofs unresolved without overflowing the stack", (condition) => {
    const code = source("deep-loop-condition", `while (${condition}) { return 1.0; }`);
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
