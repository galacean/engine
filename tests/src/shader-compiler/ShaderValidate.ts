import { Engine, Shader, ShaderFactory, ShaderMacro, ShaderMacroCollection, ShaderPass, ShaderLanguage } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { expect } from "vitest";

const baseTestMacroList = [
  { name: "RENDERER_IS_RECEIVE_SHADOWS" },
  { name: "RENDERER_HAS_NORMAL" },
  { name: "SCENE_USE_SH" },
  { name: "SCENE_USE_SPECULAR_ENV" },
  { name: "SCENE_FOG_MODE", value: "0" },
  { name: "SCENE_SHADOW_CASCADED_COUNT", value: "1" },
  { name: "MATERIAL_NEED_WORLD_POS" },
  { name: "MATERIAL_NEED_TILING_OFFSET" },
  { name: "REFRACTION_MODE", value: "1" },
  { name: "SCENE_DIRECT_LIGHT_COUNT", value: "1" },
  { name: "SCENE_SHADOW_TYPE", value: "2" }
];

export function glslValidate(
  engine: Engine,
  src: string,
  _shaderCompiler?: ShaderCompiler,
  extraMacroList: { name: string; value?: string }[] = []
) {
  const shaderCompiler: ShaderCompiler = _shaderCompiler ?? new ShaderCompiler();
  // @ts-ignore — bind runtime include map so the compiler can resolve `#include`.
  shaderCompiler._includeMap = ShaderFactory._includeMap;
  // @ts-ignore
  Shader._shaderCompiler = shaderCompiler;

  expect(() => {
    const shaderSource = shaderCompiler._parseShaderSource(src);

    shaderSource.subShaders.forEach((subShaderSource) => {
      subShaderSource.passes.forEach((passSource) => {
        if (passSource.isUsePass) return;

        const platform = ShaderLanguage.GLSLES100;

        const shaderPassSource = shaderCompiler._parseShaderPass(
          passSource.contents,
          passSource.vertexEntry,
          passSource.fragmentEntry,
          platform
        );

        if (!shaderPassSource) {
          throw `Shader pass "${shaderSource.name}.${subShaderSource.name}.${passSource.name}" parse failed, please check the shader source code.`;
        }
        const shaderPass = new ShaderPass(
          passSource.name,
          shaderPassSource.vertexShaderInstructions,
          shaderPassSource.fragmentShaderInstructions,
          platform,
          passSource.tags
        );

        const totalMacroList = [...baseTestMacroList, ...extraMacroList];
        const macroMockCollection = new ShaderMacroCollection();

        totalMacroList.forEach(({ name, value }) => {
          const macro = ShaderMacro.getByName(name, value);
          macroMockCollection.enable(macro);
        });

        // @ts-ignore
        const shaderProgram = shaderPass._getCanonicalShaderProgram(engine, macroMockCollection);
        expect(shaderProgram.isValid).to.be.true;
      });
    });
  }).to.not.throw();
}
