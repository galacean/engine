import { Color, Vector4 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";

/**
 * PBR (Physically-Based Rendering) Material.
 */
export abstract class PBRBaseMaterial extends BaseMaterial {
  private _baseColor: Color = new Color(1, 1, 1, 1);
  private _baseTexture: Texture2D;
  private _normalTexture: Texture2D;
  private _normalTextureIntensity: number = 1;
  private _emissiveColor: Color = new Color(0, 0, 0, 1);
  private _emissiveTexture: Texture2D;
  private _tilingOffset: Vector4 = new Vector4(1, 1, 0, 0);
  private _occlusionTexture: Texture2D;
  private _occlusionTextureIntensity: number = 1;

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
      this.shaderData.enableMacro("HAS_BASECOLORMAP");
      this.shaderData.setTexture("u_baseColorSampler", value);
    } else {
      this.shaderData.disableMacro("HAS_BASECOLORMAP");
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
  get normalTextureIntensity(): number {
    return this._normalTextureIntensity;
  }

  set normalTextureIntensity(value: number) {
    this._normalTextureIntensity = value;
    this.shaderData.setFloat("u_normalIntensity", value);
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
      this.shaderData.enableMacro("HAS_EMISSIVEMAP");
      this.shaderData.setTexture("u_emissiveSampler", value);
    } else {
      this.shaderData.disableMacro("HAS_EMISSIVEMAP");
    }
  }

  /**
   * Occlusion texture.
   */
  get occlusionTexture(): Texture2D {
    return this._occlusionTexture;
  }

  set occlusionTexture(value: Texture2D) {
    this._occlusionTexture = value;

    if (value) {
      this.shaderData.enableMacro("HAS_OCCLUSIONMAP");
      this.shaderData.setTexture("u_occlusionSampler", value);
    } else {
      this.shaderData.disableMacro("HAS_OCCLUSIONMAP");
    }
  }

  /**
   * Occlusion texture intensity.
   */
  get occlusionTextureIntensity(): number {
    return this._occlusionTextureIntensity;
  }

  set occlusionTextureIntensity(value: number) {
    this._occlusionTextureIntensity = value;
    this.shaderData.setFloat("u_occlusionStrength", value);
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

  /**
   * Create a pbr base material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("pbr"));

    const shaderData = this.shaderData;

    shaderData.enableMacro("O3_NEED_WORLDPOS");
    shaderData.enableMacro("O3_NEED_TILINGOFFSET");

    shaderData.setColor("u_baseColor", this._baseColor);
    shaderData.setColor("u_emissiveColor", this._emissiveColor);
    shaderData.setVector4("u_tilingOffset", this._tilingOffset);

    this.normalTextureIntensity = this._normalTextureIntensity;
    this.occlusionTextureIntensity = this._occlusionTextureIntensity;
  }
}
