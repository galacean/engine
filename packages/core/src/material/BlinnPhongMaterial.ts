import { Color, Vector4 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";

/**
 * Blinn-phong Material.
 */
export class BlinnPhongMaterial extends BaseMaterial {
  private _baseColor: Color = new Color(1, 1, 1, 1);
  private _specularColor: Color = new Color(1, 1, 1, 1);
  private _emissiveColor: Color = new Color(0, 0, 0, 1);
  private _baseTexture: Texture2D;
  private _specularTexture: Texture2D;
  private _emissiveTexture: Texture2D;
  private _normalTexture: Texture2D;
  private _normalIntensity: number = 1;
  private _shininess: number = 16;
  private _tilingOffset: Vector4 = new Vector4(1, 1, 0, 0);

  /**
   * Base color.
   */
  get baseColor(): Color {
    return this._baseColor;
  }

  set baseColor(value: Color) {
    if (value !== this._baseColor) {
      value.cloneTo(this._baseColor);
    }
  }

  /**
   * Base texture.
   */
  get baseTexture(): Texture2D {
    return this._baseTexture;
  }

  set baseTexture(value: Texture2D) {
    this._baseTexture = value;

    if (value) {
      this.shaderData.enableMacro("O3_DIFFUSE_TEXTURE");
      this.shaderData.setTexture("u_diffuseTexture", value);
    } else {
      this.shaderData.disableMacro("O3_DIFFUSE_TEXTURE");
    }
  }

  /**
   * Specular color.
   */
  get specularColor(): Color {
    return this._specularColor;
  }

  set specularColor(value: Color) {
    if (value !== this._specularColor) {
      value.cloneTo(this._specularColor);
    }
  }

  /**
   * Specular texture.
   */
  get specularTexture(): Texture2D {
    return this._specularTexture;
  }

  set specularTexture(value: Texture2D) {
    this._specularTexture = value;

    if (value) {
      this.shaderData.enableMacro("O3_SPECULAR_TEXTURE");
      this.shaderData.setTexture("u_specularTexture", value);
    } else {
      this.shaderData.disableMacro("O3_SPECULAR_TEXTURE");
    }
  }

  /**
   * Emissive color.
   */
  get emissiveColor(): Color {
    return this._emissiveColor;
  }

  set emissiveColor(value: Color) {
    if (value !== this._emissiveColor) {
      value.cloneTo(this._emissiveColor);
    }
  }

  /**
   * Emissive texture.
   */
  get emissiveTexture(): Texture2D {
    return this._emissiveTexture;
  }

  set emissiveTexture(value: Texture2D) {
    this._emissiveTexture = value;

    if (value) {
      this.shaderData.enableMacro("O3_EMISSIVE_TEXTURE");
      this.shaderData.setTexture("u_emissiveTexture", value);
    } else {
      this.shaderData.disableMacro("O3_EMISSIVE_TEXTURE");
    }
  }

  /**
   * Normal texture.
   */
  get normalTexture(): Texture2D {
    return this._normalTexture;
  }

  set normalTexture(value: Texture2D) {
    this._normalTexture = value;

    if (value) {
      this.shaderData.enableMacro("O3_NORMAL_TEXTURE");
      this.shaderData.setTexture("u_normalTexture", value);
    } else {
      this.shaderData.disableMacro("O3_NORMAL_TEXTURE");
    }
  }

  /**
   * Normal texture intensity.
   */
  get normalIntensity(): number {
    return this._normalIntensity;
  }

  set normalIntensity(value: number) {
    this._normalIntensity = value;
    this.shaderData.setFloat("u_normalIntensity", value);
  }

  /**
   * Set the specular reflection coefficient, the larger the value, the more convergent the specular reflection effect.
   */
  get shininess(): number {
    return this._shininess;
  }

  set shininess(value: number) {
    this._shininess = value;
    this.shaderData.setFloat("u_shininess", value);
  }

  /**
   * Tiling and offset of main textures.
   */
  get tilingOffset(): Vector4 {
    return this._tilingOffset;
  }

  set tilingOffset(value: Vector4) {
    if (value !== this._tilingOffset) {
      value.cloneTo(this._tilingOffset);
    }
  }

  constructor(engine: Engine) {
    super(engine, Shader.find("blinn-phong"));

    const shaderData = this.shaderData;

    shaderData.enableMacro("O3_NEED_WORLDPOS");
    shaderData.enableMacro("O3_NEED_TILINGOFFSET");

    shaderData.setColor("u_diffuseColor", this._baseColor);
    shaderData.setColor("u_specularColor", this._specularColor);
    shaderData.setColor("u_emissiveColor", this._emissiveColor);
    shaderData.setVector4("u_tilingOffset", this._tilingOffset);

    this.shininess = this._shininess;
    this.normalIntensity = this._normalIntensity;
  }

  /**
   * @override
   */
  clone(): BlinnPhongMaterial {
    var dest: BlinnPhongMaterial = new BlinnPhongMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
