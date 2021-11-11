import { Vector4 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { CompareFunction } from "../shader/enums/CompareFunction";
import { CullMode } from "../shader/enums/CullMode";
import { Shader } from "../shader/Shader";
import { TextureCubeMap } from "../texture";

/**
 * SkyboxMaterial
 */
export class SkyBoxMaterial extends Material {
  private _decodeParam: Vector4 = new Vector4(0, 5, 0, 0);

  /**
   * Whether to decode from texture with RGBM format.
   */
  get textureDecodeRGBM(): boolean {
    return Boolean(this._decodeParam.x);
  }

  set textureDecodeRGBM(value: boolean) {
    this._decodeParam.x = Number(value);
  }

  /**
   * RGBM decode factor, default 5.0.
   */
  get RGBMDecodeFactor(): number {
    return this._decodeParam.y;
  }

  set RGBMDecodeFactor(value: number) {
    this._decodeParam.y = value;
  }

  /**
   * Texture cube map of the sky box material.
   */
  get textureCubeMap(): TextureCubeMap {
    return this.shaderData.getTexture("u_cube") as TextureCubeMap;
  }

  set textureCubeMap(v: TextureCubeMap) {
    this.shaderData.setTexture("u_cube", v);
  }

  constructor(engine: Engine) {
    super(engine, Shader.find("skybox"));

    this.renderState.rasterState.cullMode = CullMode.Off;
    this.renderState.depthState.compareFunction = CompareFunction.LessEqual;

    this.shaderData.setVector4("u_cubeDecodeParam", this._decodeParam);
  }
}
