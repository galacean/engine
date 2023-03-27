import { Color } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { CompareFunction } from "../shader/enums/CompareFunction";
import { CullMode } from "../shader/enums/CullMode";
import { Shader } from "../shader/Shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { TextureCube } from "../texture";

/**
 * SkyBoxMaterial.
 */
export class SkyBoxMaterial extends Material {
  private static _tintColorProp = ShaderProperty.getByName("u_tintColor");
  private static _textureCubeProp = ShaderProperty.getByName("u_cubeTexture");
  private static _rotationProp = ShaderProperty.getByName("u_rotation");
  private static _exposureProp = ShaderProperty.getByName("u_exposure");
  private static _decodeSkyRGBMMacro = ShaderMacro.getByName("DECODE_SKY_RGBM");

  private _decodeRGBM: boolean = true;

  /**
   * Whether to decode from texture with RGBM format.
   */
  get textureDecodeRGBM(): boolean {
    return this._decodeRGBM;
  }

  set textureDecodeRGBM(value: boolean) {
    this._decodeRGBM = value;
    if (value) {
      this.shaderData.enableMacro(SkyBoxMaterial._decodeSkyRGBMMacro);
    } else {
      this.shaderData.disableMacro(SkyBoxMaterial._decodeSkyRGBMMacro);
    }
  }

  /**
   * Cube texture of the sky box material, must be RGBM format.
   */
  get textureCubeMap(): TextureCube {
    return this.shaderData.getTexture(SkyBoxMaterial._textureCubeProp) as TextureCube;
  }

  set textureCubeMap(v: TextureCube) {
    this.shaderData.setTexture(SkyBoxMaterial._textureCubeProp, v);
  }

  /**
   * The euler angle to rotate around the y-axis.
   */
  get rotation(): number {
    return this.shaderData.getFloat(SkyBoxMaterial._rotationProp);
  }

  set rotation(v: number) {
    this.shaderData.setFloat(SkyBoxMaterial._rotationProp, v);
  }

  /**
   * The exposure value of this material.
   */
  get exposure(): number {
    return this.shaderData.getFloat(SkyBoxMaterial._exposureProp);
  }

  set exposure(v: number) {
    this.shaderData.setFloat(SkyBoxMaterial._exposureProp, v);
  }

  /**
   * The Tint color of this material.
   */
  get tintColor(): Color {
    return this.shaderData.getColor(SkyBoxMaterial._tintColorProp);
  }

  set tintColor(v: Color) {
    const tintColor = this.shaderData.getColor(SkyBoxMaterial._tintColorProp);
    if (v !== tintColor) {
      tintColor.copyFrom(v);
    }
  }

  constructor(engine: Engine) {
    super(engine, Shader.find("skybox"));

    this.renderState.rasterState.cullMode = CullMode.Off;
    this.renderState.depthState.compareFunction = CompareFunction.LessEqual;

    this.shaderData.enableMacro(SkyBoxMaterial._decodeSkyRGBMMacro);
    this.shaderData.setFloat(SkyBoxMaterial._rotationProp, 0);
    this.shaderData.setFloat(SkyBoxMaterial._exposureProp, 1);
    this.shaderData.setColor(SkyBoxMaterial._tintColorProp, new Color(1, 1, 1, 1));
  }

  /**
   * @override
   */
  clone(): SkyBoxMaterial {
    const dest = new SkyBoxMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
