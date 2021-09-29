import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { CompareFunction } from "../shader/enums/CompareFunction";
import { CullMode } from "../shader/enums/CullMode";
import { Shader } from "../shader/Shader";
import { TextureCubeMap, TextureDecodeMode } from "../texture";

/**
 * SkyboxMaterial
 */
export class SkyBoxMaterial extends Material {
  constructor(engine: Engine) {
    super(engine, Shader.find("skybox"));

    this.renderState.rasterState.cullMode = CullMode.Off;
    this.renderState.depthState.compareFunction = CompareFunction.LessEqual;
    this.decodeMode = TextureDecodeMode.Gamma;
  }

  /** Texture cube map of the sky box material. */
  get textureCubeMap(): TextureCubeMap {
    return this.shaderData.getTexture("u_cube") as TextureCubeMap;
  }

  set textureCubeMap(v: TextureCubeMap) {
    this.shaderData.setTexture("u_cube", v);
  }

  /** Decode mode for input texture. */
  set decodeMode(decodeMode: TextureDecodeMode) {
    switch (decodeMode) {
      case TextureDecodeMode.Linear:
        this.shaderData.enableMacro("DECODE_MODE", "1");
        break;
      case TextureDecodeMode.Gamma:
        this.shaderData.enableMacro("DECODE_MODE", "2");
        break;
      case TextureDecodeMode.RGBE:
        this.shaderData.enableMacro("DECODE_MODE", "3");
        break;
      case TextureDecodeMode.RGBM:
        this.shaderData.enableMacro("DECODE_MODE", "4");
        break;
    }
  }
}
