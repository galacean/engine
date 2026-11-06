import { Logger, Shader, ShaderLanguage, WebGLEngine, WebGLMode } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderCompiler as VerboseShaderCompiler } from "@galacean/engine-shader-compiler/verbose";
import { describe, expect, it } from "vitest";

Logger.enable();

const readStruct = "Shared value; value.value = 0.5; gl_FragColor = vec4(value.value);";
const cases = [
  {
    name: "type and directly referenced uniform",
    valueDeclaration: "float Shared;",
    fragment: `#ifdef USE_VALUE
      gl_FragColor = vec4(Shared);
    #else
      ${readStruct}
    #endif`
  },
  {
    name: "type and uniform discovered through a helper",
    valueDeclaration: "float Shared; float readShared() { return Shared; }",
    fragment: `#ifdef USE_VALUE
      gl_FragColor = vec4(readShared());
    #else
      ${readStruct}
    #endif`
  },
  {
    name: "type and function discovered through a helper",
    valueDeclaration: "float Shared(float value) { return value; } float readShared() { return Shared(0.5); }",
    fragment: `#ifdef USE_VALUE
      gl_FragColor = vec4(readShared());
    #else
      ${readStruct}
    #endif`
  },
  {
    name: "type without an unrelated fragment-only function",
    valueDeclaration: "float Shared(float value) { return dFdx(value); }",
    vertex: `#ifdef USE_VALUE
      gl_Position = vec4(0.0);
    #else
      Shared value; value.value = 0.5; gl_Position = vec4(value.value);
    #endif`,
    fragment: "gl_FragColor = vec4(1.0);"
  }
];

describe("conditional declaration identity", () => {
  for (const [mode, Compiler] of [
    ["release", ShaderCompiler],
    ["verbose", VerboseShaderCompiler]
  ] as const) {
    for (const language of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      it.each(cases)(`${mode} GLSLES${language}: $name`, async (testCase) => {
        const previousCompiler = Shader._shaderCompiler;
        const compiler = new Compiler();
        const engine = await WebGLEngine.create({
          canvas: document.createElement("canvas"),
          shaderCompiler: compiler,
          graphicDeviceOptions: {
            webGLMode: language === ShaderLanguage.GLSLES100 ? WebGLMode.WebGL1 : WebGLMode.WebGL2
          }
        });
        let shader: Shader | undefined;
        try {
          Shader._shaderCompiler = compiler;
          shader = Shader.create(
            `Shader "DeclarationIdentity_${mode}_${language}_${testCase.name}" {
              SubShader "Default" { Pass "Forward" {
                VertexShader = vert;
                FragmentShader = frag;
                #ifdef USE_VALUE
                  ${testCase.valueDeclaration}
                #else
                  struct Shared { float value; };
                #endif
                void vert() { ${testCase.vertex ?? "gl_Position = vec4(0.0);"} }
                void frag() { ${testCase.fragment} }
              } }
            }`,
            language
          );
          expect(shader).toBeDefined();
          for (const macros of [[], ["USE_VALUE"]]) {
            expect(shader!.compileVariant(engine, macros), `macros: ${macros.join(", ")}`).toBe(true);
          }
        } finally {
          shader?.destroy();
          engine.destroy();
          Shader._shaderCompiler = previousCompiler;
        }
      });
    }
  }
});
