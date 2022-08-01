import { Color, SphericalHarmonics3 } from "@oasis-engine/math";
import { ListenerUpdateFlag } from "../ListenerUpdateFlag";
import { Shader } from "../shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { TextureCube } from "../texture";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { AmbientDirty } from "./enums/AmbientDirty";
import { DiffuseMode } from "./enums/DiffuseMode";

/**
 * Ambient light.
 */
export class AmbientLight {
  static _shMacro: ShaderMacro = Shader.getMacroByName("O3_USE_SH");
  static _specularMacro: ShaderMacro = Shader.getMacroByName("O3_USE_SPECULAR_ENV");
  static _decodeRGBMMacro: ShaderMacro = Shader.getMacroByName("O3_DECODE_ENV_RGBM");

  static _diffuseColorProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.diffuse");
  static _diffuseSHProperty: ShaderProperty = Shader.getPropertyByName("u_env_sh");
  static _diffuseIntensityProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.diffuseIntensity");
  static _specularTextureProperty: ShaderProperty = Shader.getPropertyByName("u_env_specularSampler");
  static _specularIntensityProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.specularIntensity");
  static _mipLevelProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.mipMapLevel");

  private static _preComputeSH(sh: SphericalHarmonics3, out: Float32Array): Float32Array {
    /**
     * Basis constants
     *
     * 0: 1/2 * Math.sqrt(1 / Math.PI)
     *
     * 1: -1/2 * Math.sqrt(3 / Math.PI)
     * 2: 1/2 * Math.sqrt(3 / Math.PI)
     * 3: -1/2 * Math.sqrt(3 / Math.PI)
     *
     * 4: 1/2 * Math.sqrt(15 / Math.PI)
     * 5: -1/2 * Math.sqrt(15 / Math.PI)
     * 6: 1/4 * Math.sqrt(5 / Math.PI)
     * 7: -1/2 * Math.sqrt(15 / Math.PI)
     * 8: 1/4 * Math.sqrt(15 / Math.PI)
     */

    /**
     * Convolution kernel
     *
     * 0: Math.PI
     * 1: (2 * Math.PI) / 3
     * 2: Math.PI / 4
     */

    const src = sh.coefficients;

    // l0
    out[0] = src[0] * 0.886227; // kernel0 * basis0 = 0.886227
    out[1] = src[1] * 0.886227;
    out[2] = src[2] * 0.886227;

    // l1
    out[3] = src[3] * -1.023327; // kernel1 * basis1 = -1.023327;
    out[4] = src[4] * -1.023327;
    out[5] = src[5] * -1.023327;
    out[6] = src[6] * 1.023327; // kernel1 * basis2 = 1.023327
    out[7] = src[7] * 1.023327;
    out[8] = src[8] * 1.023327;
    out[9] = src[9] * -1.023327; // kernel1 * basis3 = -1.023327
    out[10] = src[10] * -1.023327;
    out[11] = src[11] * -1.023327;

    // l2
    out[12] = src[12] * 0.858086; // kernel2 * basis4 = 0.858086
    out[13] = src[13] * 0.858086;
    out[14] = src[14] * 0.858086;
    out[15] = src[15] * -0.858086; // kernel2 * basis5 = -0.858086
    out[16] = src[16] * -0.858086;
    out[17] = src[17] * -0.858086;
    out[18] = src[18] * 0.247708; // kernel2 * basis6 = 0.247708
    out[19] = src[19] * 0.247708;
    out[20] = src[20] * 0.247708;
    out[21] = src[21] * -0.858086; // kernel2 * basis7 = -0.858086
    out[22] = src[22] * -0.858086;
    out[23] = src[23] * -0.858086;
    out[24] = src[24] * 0.429042; // kernel2 * basis8 = 0.429042
    out[25] = src[25] * 0.429042;
    out[26] = src[26] * 0.429042;

    return out;
  }

  /** @internal */
  _shArray: Float32Array = new Float32Array(27);

  private _diffuseSphericalHarmonics: SphericalHarmonics3;
  private _diffuseSolidColor: Color = new Color(0.212, 0.227, 0.259);
  private _diffuseIntensity: number = 1.0;
  private _specularReflection: TextureCube;
  private _specularIntensity: number = 1.0;
  private _diffuseMode: DiffuseMode = DiffuseMode.SolidColor;
  private _specularTextureDecodeRGBM: boolean = false;
  private _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  /**
   * Whether to decode from specularTexture with RGBM format.
   */
  get specularTextureDecodeRGBM(): boolean {
    return this._specularTextureDecodeRGBM;
  }

  set specularTextureDecodeRGBM(value: boolean) {
    if (this._specularTextureDecodeRGBM !== value) {
      this._specularTextureDecodeRGBM = value;
      this._dispatchAmbientChange(AmbientDirty.SpecularTextureDecodeRGBM);
    }
  }

  /**
   * Diffuse mode of ambient light.
   */
  get diffuseMode(): DiffuseMode {
    return this._diffuseMode;
  }

  set diffuseMode(value: DiffuseMode) {
    this._diffuseMode = value;
    this._dispatchAmbientChange(AmbientDirty.DiffuseMode);
  }

  /**
   * Diffuse reflection solid color.
   * @remarks Effective when diffuse reflection mode is `DiffuseMode.SolidColor`.
   */
  get diffuseSolidColor(): Color {
    return this._diffuseSolidColor;
  }

  set diffuseSolidColor(value: Color) {
    if (value !== this._diffuseSolidColor) {
      this._diffuseSolidColor.copyFrom(value);
      this._dispatchAmbientChange(AmbientDirty.DiffuseSolidColor);
    }
  }

  /**
   * Diffuse reflection spherical harmonics 3.
   * @remarks Effective when diffuse reflection mode is `DiffuseMode.SphericalHarmonics`.
   */
  get diffuseSphericalHarmonics(): SphericalHarmonics3 {
    return this._diffuseSphericalHarmonics;
  }

  set diffuseSphericalHarmonics(value: SphericalHarmonics3) {
    if (value !== this._diffuseSphericalHarmonics) {
      this._diffuseSphericalHarmonics = value;
      AmbientLight._preComputeSH(value, this._shArray);
      this._dispatchAmbientChange(AmbientDirty.DiffuseSphericalHarmonics);
    }
  }

  /**
   * Diffuse reflection intensity.
   */
  get diffuseIntensity(): number {
    return this._diffuseIntensity;
  }

  set diffuseIntensity(value: number) {
    if (value !== this._diffuseIntensity) {
      this._diffuseIntensity = value;
      this._dispatchAmbientChange(AmbientDirty.DiffuseIntensity);
    }
  }

  /**
   * Specular reflection texture.
   * @remarks This texture must be baked from @oasis-engine/baker
   */
  get specularTexture(): TextureCube {
    return this._specularReflection;
  }

  set specularTexture(value: TextureCube) {
    if (value !== this._specularReflection) {
      this._specularReflection = value;
      this._dispatchAmbientChange(AmbientDirty.SpecularTexture);
    }
  }

  /**
   * Specular reflection intensity.
   */
  get specularIntensity(): number {
    return this._specularIntensity;
  }

  set specularIntensity(value: number) {
    if (value !== this._specularIntensity) {
      this._specularIntensity = value;
      this._dispatchAmbientChange(AmbientDirty.SpecularIntensity);
    }
  }

  /**
   * @internal
   */
  _registerUpdateFlag(): ListenerUpdateFlag {
    return this._updateFlagManager.createFlag(ListenerUpdateFlag);
  }

  private _dispatchAmbientChange(type: AmbientDirty): void {
    this._updateFlagManager.dispatch(type);
  }
}
