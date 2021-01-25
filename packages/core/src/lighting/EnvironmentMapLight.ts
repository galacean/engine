import { Color } from "@oasis-engine/math";
import { Entity } from "../Entity";
import { Shader } from "../shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { TextureCubeMap } from "../texture";
import { Light } from "./Light";

/**
 * Environment light.
 */
export class EnvironmentMapLight extends Light {
  private static _diffuseMacro: ShaderMacro = Shader.getMacroByName("O3_USE_DIFFUSE_ENV");
  private static _specularMacro: ShaderMacro = Shader.getMacroByName("O3_USE_SPECULAR_ENV");
  private static _diffuseTextureProperty: ShaderProperty = Shader.getPropertyByName("u_env_diffuseSampler");
  private static _specularTextureProperty: ShaderProperty = Shader.getPropertyByName("u_env_specularSampler");
  private static _mipLevelProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.mipMapLevel");
  private static _diffuseColorProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.diffuse");
  private static _specularColorProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.specular");
  private static _diffuseIntensityProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.diffuseIntensity");
  private static _specularIntensityProperty: ShaderProperty = Shader.getPropertyByName(
    "u_envMapLight.specularIntensity"
  );
  private static _transformMatrixProperty: ShaderProperty = Shader.getPropertyByName("u_envMapLight.transformMatrix");

  /**
   * @internal
   */
  static _updateShaderData(shaderData: ShaderData, light: EnvironmentMapLight): void {
    // support rotation
    const transformMatrix = light.entity.transform.worldMatrix;
    shaderData.setMatrix(EnvironmentMapLight._transformMatrixProperty, transformMatrix);
  }

  /**
   * Diffuse cube texture.
   */
  get diffuseTexture(): TextureCubeMap {
    return this._diffuseTexture;
  }

  set diffuseTexture(value: TextureCubeMap) {
    this._diffuseTexture = value;
    const shaderData = this.scene.shaderData;

    if (value) {
      shaderData.setTexture(EnvironmentMapLight._diffuseTextureProperty, value);
      shaderData.enableMacro(EnvironmentMapLight._diffuseMacro);
    } else {
      shaderData.disableMacro(EnvironmentMapLight._diffuseMacro);
    }
  }

  /**
   * Specular cube texture.
   */
  get specularTexture(): TextureCubeMap {
    return this._specularTexture;
  }

  set specularTexture(value: TextureCubeMap) {
    this._specularTexture = value;
    const shaderData = this.scene.shaderData;

    if (value) {
      shaderData.setTexture(EnvironmentMapLight._specularTextureProperty, value);
      shaderData.setFloat(EnvironmentMapLight._mipLevelProperty, this.specularTexture.mipmapCount);
      shaderData.enableMacro(EnvironmentMapLight._specularMacro);
    } else {
      shaderData.disableMacro(EnvironmentMapLight._specularMacro);
    }
  }

  /**
   * Diffuse color.
   */
  get diffuseColor(): Color {
    return this._diffuseColor;
  }

  set diffuseColor(value: Color) {
    this._diffuseColor = value;

    this.scene.shaderData.setColor(EnvironmentMapLight._diffuseColorProperty, value);
  }

  /**
   * Specular color.
   */
  get specularColor(): Color {
    return this._specularColor;
  }

  set specularColor(value: Color) {
    this._specularColor = value;

    this.scene.shaderData.setColor(EnvironmentMapLight._specularColorProperty, value);
  }

  /**
   * Diffuse intensity.
   */
  get diffuseIntensity(): number {
    return this._diffuseIntensity;
  }

  set diffuseIntensity(value: number) {
    this._diffuseIntensity = value;

    this.scene.shaderData.setFloat(EnvironmentMapLight._diffuseIntensityProperty, value);
  }

  /**
   * Specular intensity.
   */
  get specularIntensity(): number {
    return this._specularIntensity;
  }

  set specularIntensity(value: number) {
    this._specularIntensity = value;

    this.scene.shaderData.setFloat(EnvironmentMapLight._specularIntensityProperty, value);
  }

  private _diffuseTexture: TextureCubeMap;
  private _specularTexture: TextureCubeMap;
  private _diffuseColor: Color = new Color(0.3, 0.3, 0.3, 1);
  private _specularColor: Color = new Color(0.5, 0.5, 0.5, 1);
  private _diffuseIntensity: number = 1;
  private _specularIntensity: number = 1;

  constructor(entity: Entity) {
    super(entity);
    this.diffuseColor = this._diffuseColor;
    this.specularColor = this._specularColor;
    this.diffuseIntensity = this._diffuseIntensity;
    this.specularIntensity = this._specularIntensity;
  }
}
