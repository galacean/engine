import { Logger, Shader, ShaderLanguage, WebGLEngine, WebGLMode } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderCompiler as VerboseShaderCompiler } from "@galacean/engine-shader-compiler/verbose";
import { describe, expect, it } from "vitest";

Logger.enable();

const initializeSurface = `
  SurfaceData surface;
  surface.material.leaf.albedo = vec3(1.0);
  #ifdef MATERIAL_USE_DETAIL
    surface.detail.tint = vec3(0.5);
  #endif
`;

const readSurface = `
  #ifdef MATERIAL_USE_DETAIL
    return surface.material.leaf.albedo * surface.detail.tint;
  #else
    return surface.material.leaf.albedo;
  #endif
`;

const cases: { name: string; helper: string; fragment: string; materialType?: string; typeMacro?: string }[] = [
  {
    name: "parameter",
    helper: `vec3 shadeSurface(SurfaceData surface) { ${readSurface} }`,
    fragment: `${initializeSurface} return vec4(SURFACE_HOOK(surface), 1.0);`
  },
  {
    name: "return",
    helper: "SurfaceData shadeSurface(SurfaceData surface) { return surface; }",
    fragment: `${initializeSurface}
      SurfaceData shaded = SURFACE_HOOK(surface);
      return vec4(shaded.material.leaf.albedo, 1.0);`
  },
  {
    name: "global",
    helper: `SurfaceData sharedSurface;
      vec3 shadeSurface() { return sharedSurface.material.leaf.albedo; }`,
    fragment: "return vec4(SURFACE_HOOK(), 1.0);"
  },
  {
    name: "local",
    helper: `vec3 shadeSurface() { ${initializeSurface} ${readSurface} }`,
    fragment: "return vec4(SURFACE_HOOK(), 1.0);"
  },
  {
    name: "conditional_parameter",
    helper: `vec3 shadeSurface(
      #ifdef MATERIAL_USE_DETAIL
        SurfaceData surface
      #else
        SurfaceData surface
      #endif
    ) { ${readSurface} }`,
    fragment: `${initializeSurface} return vec4(SURFACE_HOOK(surface), 1.0);`
  },
  {
    name: "macro_field",
    materialType: "MATERIAL_DATA_TYPE",
    typeMacro: "#define MATERIAL_DATA_TYPE MaterialData",
    helper: `vec3 shadeSurface(SurfaceData surface) { ${readSurface} }`,
    fragment: `${initializeSurface} return vec4(SURFACE_HOOK(surface), 1.0);`
  },
  {
    name: "chained_macro_field",
    materialType: "MATERIAL_DATA_TYPE",
    typeMacro: "#define BASE_MATERIAL_TYPE MaterialData\n#define MATERIAL_DATA_TYPE BASE_MATERIAL_TYPE",
    helper: `vec3 shadeSurface(SurfaceData surface) { ${readSurface} }`,
    fragment: `${initializeSurface} return vec4(SURFACE_HOOK(surface), 1.0);`
  }
];

describe("shader declaration type dependencies", () => {
  for (const [mode, Compiler] of [
    ["release", ShaderCompiler],
    ["verbose", VerboseShaderCompiler]
  ] as const) {
    for (const language of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      it.each(cases)(`${mode} GLSLES${language}: $name retains transitive types and guards`, async (testCase) => {
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
            `Shader "TypeDependencies_${mode}_${language}_${testCase.name}" {
              SubShader "Default" { Pass "Forward" {
                VertexShader = vertexMain;
                FragmentShader = fragmentMain;
                struct Attributes { vec4 POSITION; };
                struct Varyings { vec2 uv; };
                struct LeafData { vec3 albedo; };
                struct MaterialData { LeafData leaf; };
                ${testCase.typeMacro ?? ""}
                #ifdef MATERIAL_USE_DETAIL
                  struct DetailData { vec3 tint; };
                #endif
                struct SurfaceData {
                  ${testCase.materialType ?? "MaterialData"} material;
                  #ifdef MATERIAL_USE_DETAIL
                    DetailData detail;
                  #endif
                };
                ${testCase.helper}
                #define SURFACE_HOOK shadeSurface
                Varyings vertexMain(Attributes attributes) {
                  Varyings output;
                  gl_Position = attributes.POSITION;
                  output.uv = attributes.POSITION.xy;
                  return output;
                }
                vec4 fragmentMain(Varyings input) {
                  #ifdef MATERIAL_TEST_LIGHT
                    ${testCase.fragment}
                  #else
                    return vec4(input.uv, 0.0, 1.0);
                  #endif
                }
              } }
            }`,
            language
          );
          expect(shader).not.to.be.undefined;
          for (const macros of [[], ["MATERIAL_TEST_LIGHT"], ["MATERIAL_TEST_LIGHT", "MATERIAL_USE_DETAIL"]]) {
            expect(shader!.compileVariant(engine, macros), `macros: ${macros.join(", ")}`).to.be.true;
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
