import { Engine, Shader, ShaderMacro, ShaderMacroCollection, ShaderPass, ShaderLanguage } from "@galacean/engine-core";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { expect } from "vitest";

const baseTestMacroList = [
  { name: "RENDERER_IS_RECEIVE_SHADOWS" },
  { name: "RENDERER_HAS_NORMAL" },
  { name: "SCENE_USE_SH" },
  { name: "SCENE_USE_SPECULAR_ENV" },
  { name: "SCENE_IS_DECODE_ENV_RGBM" },
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
  _shaderLab?: ShaderLab,
  extraMacroList: { name: string; value?: string }[] = []
) {
  const shaderLab: ShaderLab = _shaderLab ?? new ShaderLab();
  // @ts-ignore
  Shader._shaderLab = shaderLab;

  expect(() => {
    const shaderSource = shaderLab._parseShaderSource(src);

    shaderSource.subShaders.forEach((subShaderSource) => {
      subShaderSource.passes.forEach((passSource) => {
        if (passSource.isUsePass) return;

        const platform = ShaderLanguage.GLSLES100;

        const shaderPassSource = shaderLab._parseShaderPass(
          passSource.contents,
          passSource.vertexEntry,
          passSource.fragmentEntry,
          platform,
          // @ts-ignore
          new URL("", ShaderPass._shaderRootPath).href
        );

        if (!shaderPassSource) {
          throw `Shader pass "${shaderSource.name}.${subShaderSource.name}.${passSource.name}" parse failed, please check the shader source code.`;
        }
        const shaderPass = new ShaderPass(
          passSource.name,
          shaderPassSource.vertex,
          shaderPassSource.fragment,
          passSource.tags
        );
        shaderPass.platformTarget = platform;

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
