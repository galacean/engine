import { Color, SphericalHarmonics3 } from "@oasis-engine/math";
import { GLCapabilityType } from "../base/Constant";
import { Scene } from "../Scene";
import { Shader } from "../shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { TextureCubeMap } from "../texture";
import { DiffuseMode } from "./enums/DiffuseMode";

/**
 * Ambient light.
 */
export class AmbientLight {
  private static _diffuseMacro: ShaderMacro = Shader.getMacroByName("O3_USE_DIFFUSE_ENV");
  private static _specularMacro: ShaderMacro = Shader.getMacroByName("O3_USE_SPECULAR_ENV");
  private static _envGamma: ShaderMacro = Shader.getMacroByName("ENV_GAMMA");
  private static _envRGBE: ShaderMacro = Shader.getMacroByName("ENV_RGBE");

  private static _diffuseColorProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.diffuse");
  private static _diffuseSHProperty: ShaderProperty = Shader.getPropertyByName("u_env_sh");
  private static _diffuseIntensityProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.diffuseIntensity");
  private static _specularTextureProperty: ShaderProperty = Shader.getPropertyByName("u_env_specularSampler");
  private static _specularIntensityProperty: ShaderProperty = Shader.getPropertyByName(
    "u_envMapLight.specularIntensity"
  );
  private static _maxMipLevelProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.maxMipMapLevel");

  private _scene: Scene;
  private _diffuseSolidColor: Color = new Color(0.212, 0.227, 0.259);
  private _diffuseIntensity: number = 1.0;
  private _specularReflection: TextureCubeMap;
  private _specularIntensity: number = 1.0;
  private _diffuseMode: DiffuseMode = DiffuseMode.SolidColor;
  private _diffuseSphericalHarmonics: SphericalHarmonics3;

  /**
   * Diffuse mode of ambient light.
   */
  get diffuseMode(): DiffuseMode {
    return this._diffuseMode;
  }

  set diffuseMode(value: DiffuseMode) {
    this._diffuseMode = value;
    if (value === DiffuseMode.SphericalHarmonics) {
      this._scene.shaderData.enableMacro(AmbientLight._diffuseMacro);
    } else {
      this._scene.shaderData.disableMacro(AmbientLight._diffuseMacro);
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
      value.cloneTo(this._diffuseSolidColor);
    }
  }

  /**
   * Diffuse spherical harmonics.
   */
  get diffuseSphericalHarmonics(): SphericalHarmonics3 {
    return this._diffuseSphericalHarmonics;
  }

  set diffuseSphericalHarmonics(sh: SphericalHarmonics3) {
    this._diffuseSphericalHarmonics = sh;
    const shaderData = this._scene.shaderData;

    if (sh) {
      shaderData.setFloatArray(AmbientLight._diffuseSHProperty, sh.preScaledCoefficients);
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
    this._scene.shaderData.setFloat(AmbientLight._diffuseIntensityProperty, value);
  }

  /**
   * Specular reflection texture.
   */
  get specularTexture(): TextureCubeMap {
    return this._specularReflection;
  }

  set specularTexture(value: TextureCubeMap) {
    if (value === this._specularReflection) return;
    this._specularReflection = value;

    const isHDR = value?._isHDR;
    const supportFloatTexture = this._scene.engine._hardwareRenderer.canIUse(GLCapabilityType.textureFloat);
    const shaderData = this._scene.shaderData;

    if (value) {
      shaderData.setTexture(AmbientLight._specularTextureProperty, value);
      shaderData.setFloat(AmbientLight._maxMipLevelProperty, this._specularReflection.mipmapCount - 1);
      shaderData.enableMacro(AmbientLight._specularMacro);

      if (isHDR && !supportFloatTexture) {
        shaderData.enableMacro(AmbientLight._envRGBE);
        shaderData.disableMacro(AmbientLight._envGamma);
      } else if (!isHDR) {
        shaderData.enableMacro(AmbientLight._envGamma);
        shaderData.disableMacro(AmbientLight._envRGBE);
      } else {
        shaderData.disableMacro(AmbientLight._envGamma);
        shaderData.disableMacro(AmbientLight._envRGBE);
      }
    } else {
      shaderData.disableMacro(AmbientLight._specularMacro);
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
    this._scene.shaderData.setFloat(AmbientLight._specularIntensityProperty, value);
  }

  constructor(scene: Scene) {
    this._scene = scene;

    const { shaderData } = this._scene;
    shaderData.setColor(AmbientLight._diffuseColorProperty, this._diffuseSolidColor);
    shaderData.setFloat(AmbientLight._diffuseIntensityProperty, this._diffuseIntensity);
    shaderData.setFloat(AmbientLight._specularIntensityProperty, this._specularIntensity);
  }
}
