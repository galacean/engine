import { Color, SphericalHarmonics3 } from "@oasis-engine/math";
import { Scene } from "../Scene";
import { Shader, ShaderData } from "../shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { TextureCube } from "../texture";
import { DiffuseMode } from "./enums/DiffuseMode";

/**
 * Ambient light.
 */
export class AmbientLight {
  private static _shMacro: ShaderMacro = Shader.getMacroByName("O3_USE_SH");
  private static _specularMacro: ShaderMacro = Shader.getMacroByName("O3_USE_SPECULAR_ENV");
  private static _decodeRGBMMacro: ShaderMacro = Shader.getMacroByName("O3_DECODE_ENV_RGBM");

  private static _diffuseColorProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.diffuse");
  private static _diffuseSHProperty: ShaderProperty = Shader.getPropertyByName("u_env_sh");
  private static _diffuseIntensityProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.diffuseIntensity");
  private static _specularTextureProperty: ShaderProperty = Shader.getPropertyByName("u_env_specularSampler");
  private static _specularIntensityProperty: ShaderProperty = Shader.getPropertyByName(
    "u_envMapLight.specularIntensity"
  );
  private static _mipLevelProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.mipMapLevel");

  private _diffuseSphericalHarmonics: SphericalHarmonics3;
  private _diffuseSolidColor: Color = new Color(0.212, 0.227, 0.259);
  private _diffuseIntensity: number = 1.0;
  private _specularTexture: TextureCube;
  private _specularIntensity: number = 1.0;
  private _diffuseMode: DiffuseMode = DiffuseMode.SolidColor;
  private _shArray: Float32Array = new Float32Array(27);
  private _scenes: Scene[] = [];
  private _specularTextureDecodeRGBM: boolean = false;

  /**
   * Whether to decode from specularTexture with RGBM format.
   */
  get specularTextureDecodeRGBM(): boolean {
    return this._specularTextureDecodeRGBM;
  }

  set specularTextureDecodeRGBM(value: boolean) {
    this._specularTextureDecodeRGBM = value;

    const scenes = this._scenes;
    for (let i = 0, n = scenes.length; i < n; i++) {
      this._setSpecularTextureDecodeRGBM(scenes[i].shaderData);
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

    const scenes = this._scenes;
    for (let i = 0, n = scenes.length; i < n; i++) {
      this._setDiffuseMode(scenes[i].shaderData);
    }
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
    this._diffuseSphericalHarmonics = value;
    if (value) {
      this._preComputeSH(value, this._shArray);
      const scenes = this._scenes;
      for (let i = 0, n = scenes.length; i < n; i++) {
        scenes[i].shaderData.setFloatArray(AmbientLight._diffuseSHProperty, this._shArray);
      }
    }
  }

  /**
   * Diffuse reflection intensity.
   */
  get diffuseIntensity(): number {
    return this._diffuseIntensity;
  }

  set diffuseIntensity(value: number) {
    this._diffuseIntensity = value;

    const scenes = this._scenes;
    for (let i = 0, n = scenes.length; i < n; i++) {
      scenes[i].shaderData.setFloat(AmbientLight._diffuseIntensityProperty, value);
    }
  }

  /**
   * Specular reflection texture.
   * @remarks This texture must be baked from @oasis-engine/baker
   */
  get specularTexture(): TextureCube {
    return this._specularTexture;
  }

  set specularTexture(value: TextureCube) {
    this._specularTexture = value;

    const scenes = this._scenes;
    for (let i = 0, n = scenes.length; i < n; i++) {
      this._setSpecularTexture(scenes[i].shaderData);
    }
  }

  /**
   * Specular reflection intensity.
   */
  get specularIntensity(): number {
    return this._specularIntensity;
  }

  set specularIntensity(value: number) {
    this._specularIntensity = value;

    for (let i = 0, n = this._scenes.length; i < n; i++) {
      this._scenes[i].shaderData.setFloat(AmbientLight._specularIntensityProperty, value);
    }
  }

  /**
   * @internal
   */
  _addToScene(scene: Scene): void {
    this._scenes.push(scene);

    const shaderData = scene.shaderData;
    shaderData.setColor(AmbientLight._diffuseColorProperty, this._diffuseSolidColor);
    shaderData.setFloat(AmbientLight._diffuseIntensityProperty, this._diffuseIntensity);
    shaderData.setFloat(AmbientLight._specularIntensityProperty, this._specularIntensity);
    shaderData.setFloatArray(AmbientLight._diffuseSHProperty, this._shArray);

    this._setDiffuseMode(shaderData);
    this._setSpecularTextureDecodeRGBM(shaderData);
    this._setSpecularTexture(shaderData);
  }

  /**
   * @internal
   */
  _removeFromScene(scene: Scene): void {
    const scenes = this._scenes;
    const index = scenes.indexOf(scene);
    scenes.splice(index, 1);
  }

  private _setDiffuseMode(sceneShaderData: ShaderData): void {
    if (this._diffuseMode === DiffuseMode.SphericalHarmonics) {
      sceneShaderData.enableMacro(AmbientLight._shMacro);
    } else {
      sceneShaderData.disableMacro(AmbientLight._shMacro);
    }
  }

  private _setSpecularTexture(sceneShaderData: ShaderData): void {
    if (this._specularTexture) {
      sceneShaderData.setTexture(AmbientLight._specularTextureProperty, this._specularTexture);
      sceneShaderData.setFloat(AmbientLight._mipLevelProperty, this._specularTexture.mipmapCount - 1);
      sceneShaderData.enableMacro(AmbientLight._specularMacro);
    } else {
      sceneShaderData.disableMacro(AmbientLight._specularMacro);
    }
  }

  private _setSpecularTextureDecodeRGBM(sceneShaderData: ShaderData): void {
    if (this._specularTextureDecodeRGBM) {
      sceneShaderData.enableMacro(AmbientLight._decodeRGBMMacro);
    } else {
      sceneShaderData.disableMacro(AmbientLight._decodeRGBMMacro);
    }
  }

  private _preComputeSH(sh: SphericalHarmonics3, out: Float32Array): void {
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
  }
}
