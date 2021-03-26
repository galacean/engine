import { Color, Vector4 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";

/**
 * Blinn-phong Material.
 */
export class BlinnPhongMaterial extends BaseMaterial {
  private _emissiveColor: Color = new Color(0, 0, 0, 1);
  private _baseColor: Color = new Color(1, 1, 1, 1);
  private _specularColor: Color = new Color(1, 1, 1, 1);
  private _emissiveTexture: Texture2D;
  private _baseTexture: Texture2D;
  private _specularTexture: Texture2D;
  private _shininess: number = 16;
  private _tilingOffset: Vector4 = new Vector4(1, 1, 0, 0);

  /**
   * Tiling and offset of main textures.
   */
  get tilingOffset(): Vector4 {
    return this._tilingOffset;
  }

  set tilingOffset(value: Vector4) {
    this._tilingOffset = value;
    this.shaderData.setVector4("u_tilingOffset", value);
  }

  /**
   * Emissive color.
   */
  get emissiveColor(): Color {
    return this._emissiveColor;
  }

  set emissiveColor(value: Color) {
    this._emissiveColor = value;
    this.shaderData.setColor("u_emissiveColor", value);
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
   * Base color.
   */
  get baseColor(): Color {
    return this._baseColor;
  }

  set baseColor(value: Color) {
    this._baseColor = value;
    this.shaderData.setColor("u_diffuseColor", value);
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
    this._specularColor = value;
    this.shaderData.setColor("u_specularColor", value);
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
   * Set the specular reflection coefficient, the larger the value, the more convergent the specular reflection effect.
   */
  get shininess(): number {
    return this._shininess;
  }

  set shininess(value: number) {
    this._shininess = value;
    this.shaderData.setFloat("u_shininess", value);
  }

  constructor(engine: Engine) {
    super(engine, Shader.find("blinn-phong"));
    this.shaderData.enableMacro("O3_NEED_WORLDPOS");
    this.shaderData.enableMacro("O3_NEED_TILINGOFFSET");

    this.emissiveColor = this._emissiveColor;
    this.baseColor = this._baseColor;
    this.specularColor = this._specularColor;
    this.shininess = this._shininess;
    this.tilingOffset = this._tilingOffset;
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
