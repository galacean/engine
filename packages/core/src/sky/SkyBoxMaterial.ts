import { Color } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { Shader } from "../shader/Shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { CompareFunction } from "../shader/enums/CompareFunction";
import { CullMode } from "../shader/enums/CullMode";
import { TextureCube } from "../texture";

/**
 * SkyBoxMaterial.
 */
export class SkyBoxMaterial extends Material {
  private static _tintColorProp = ShaderProperty.getByName("material_TintColor");
  private static _textureCubeProp = ShaderProperty.getByName("material_CubeTexture");
  private static _rotationProp = ShaderProperty.getByName("material_Rotation");
  private static _exposureProp = ShaderProperty.getByName("material_Exposure");
  private static _decodeSkyRGBMMacro = ShaderMacro.getByName("MATERIAL_IS_DECODE_SKY_RGBM");

  private _textureDecodeRGBM: boolean = false;
  private _tintColor: Color = new Color(1, 1, 1, 1);

  /**
   * Whether to decode texture with RGBM format.
   */
  get textureDecodeRGBM(): boolean {
    return this._textureDecodeRGBM;
  }

  set textureDecodeRGBM(value: boolean) {
    this._textureDecodeRGBM = value;
    if (value) {
      this.shaderData.enableMacro(SkyBoxMaterial._decodeSkyRGBMMacro);
    } else {
      this.shaderData.disableMacro(SkyBoxMaterial._decodeSkyRGBMMacro);
    }
  }

  /**
   * Texture of the sky box material.
   */
  get texture(): TextureCube {
    return this.shaderData.getTexture(SkyBoxMaterial._textureCubeProp) as TextureCube;
  }

  set texture(value: TextureCube) {
    this.shaderData.setTexture(SkyBoxMaterial._textureCubeProp, value);
  }

  /**
   * The angle to rotate around the y-axis, unit is degree.
   */
  get rotation(): number {
    return this.shaderData.getFloat(SkyBoxMaterial._rotationProp);
  }

  set rotation(value: number) {
    this.shaderData.setFloat(SkyBoxMaterial._rotationProp, value);
  }

  /**
   * The exposure value of this material.
   */
  get exposure(): number {
    return this.shaderData.getFloat(SkyBoxMaterial._exposureProp);
  }

  set exposure(value: number) {
    this.shaderData.setFloat(SkyBoxMaterial._exposureProp, value);
  }

  /**
   * The Tint color of this material.
   */
  get tintColor(): Color {
    return this._tintColor;
  }

  set tintColor(value: Color) {
    if (this._tintColor != value) {
      this._tintColor.copyFrom(value);
    }
  }

  constructor(engine: Engine) {
    super(engine, Shader.find("skybox"));

    this.renderState.rasterState.cullMode = CullMode.Off;
    this.renderState.depthState.compareFunction = CompareFunction.LessEqual;

    this.shaderData.setFloat(SkyBoxMaterial._rotationProp, 0);
    this.shaderData.setFloat(SkyBoxMaterial._exposureProp, 1);
    this.shaderData.setColor(SkyBoxMaterial._tintColorProp, this._tintColor);
  }

  override clone(): SkyBoxMaterial {
    const dest = new SkyBoxMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
