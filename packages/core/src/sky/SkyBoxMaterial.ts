import { GLCapabilityType } from "../base/Constant";
import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { CompareFunction } from "../shader/enums/CompareFunction";
import { CullMode } from "../shader/enums/CullMode";
import { Shader } from "../shader/Shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { TextureCubeMap } from "../texture";

/**
 * SkyboxMaterial
 */
export class SkyBoxMaterial extends Material {
  private static _mapLinear: ShaderMacro = Shader.getMacroByName("MAP_LINEAR");
  private static _mapRGBE: ShaderMacro = Shader.getMacroByName("MAP_RGBE");

  constructor(engine: Engine) {
    super(engine, Shader.find("skybox"));

    this.renderState.rasterState.cullMode = CullMode.Off;
    this.renderState.depthState.compareFunction = CompareFunction.LessEqual;
  }

  /** Texture cube map of the sky box material. */
  get textureCubeMap(): TextureCubeMap {
    return this.shaderData.getTexture("u_cube") as TextureCubeMap;
  }

  set textureCubeMap(value: TextureCubeMap) {
    const isHDR = value?._isHDR;
    const supportFloatTexture = this.engine._hardwareRenderer.canIUse(GLCapabilityType.textureFloat);
    const shaderData = this.shaderData;

    shaderData.setTexture("u_cube", value);

    if (isHDR && supportFloatTexture) {
      shaderData.enableMacro(SkyBoxMaterial._mapLinear);
      shaderData.disableMacro(SkyBoxMaterial._mapRGBE);
    } else if (isHDR && !supportFloatTexture) {
      shaderData.enableMacro(SkyBoxMaterial._mapRGBE);
      shaderData.disableMacro(SkyBoxMaterial._mapLinear);
    } else {
      shaderData.disableMacro(SkyBoxMaterial._mapLinear);
      shaderData.disableMacro(SkyBoxMaterial._mapRGBE);
    }
  }
}
