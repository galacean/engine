import { Color, Vector4 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";

/**
 * PBR (Physically-Based Rendering) Material.
 */
export abstract class PBRBaseMaterial extends BaseMaterial {
  private static _baseColorProp = Shader.getPropertyByName("u_baseColor");
  private static _emissiveColorProp = Shader.getPropertyByName("u_emissiveColor");
  private static _tilingOffsetProp = Shader.getPropertyByName("u_tilingOffset");
  private static _baseTextureProp = Shader.getPropertyByName("u_baseColorSampler");
  private static _normalTextureProp = Shader.getPropertyByName("u_normalTexture");
  private static _normalTextureIntensityProp = Shader.getPropertyByName("u_normalIntensity");
  private static _occlusionTextureIntensityProp = Shader.getPropertyByName("u_occlusionStrength");

  private static _emissiveTextureProp = Shader.getPropertyByName("u_emissiveSampler");
  private static _occlusionTextureProp = Shader.getPropertyByName("u_occlusionSampler");

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
   * Base color.
   */
  get baseColor(): Color {
    return this.shaderData.getColor(PBRBaseMaterial._baseColorProp);
  }

  set baseColor(value: Color) {
    const baseColor = this.shaderData.getColor(PBRBaseMaterial._baseColorProp);
    if (value !== baseColor) {
      value.cloneTo(baseColor);
    }
  }

  /**
   * Base texture.
   */
  get baseTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._baseTextureProp);
  }

  set baseTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._baseTextureProp, value);
    if (value) {
      this.shaderData.enableMacro("HAS_BASECOLORMAP");
    } else {
      this.shaderData.disableMacro("HAS_BASECOLORMAP");
    }
  }

  /**
   * Normal texture.
   */
  get normalTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._normalTextureProp);
  }

  set normalTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._normalTextureProp, value);
    if (value) {
      this.shaderData.enableMacro("O3_NORMAL_TEXTURE");
    } else {
      this.shaderData.disableMacro("O3_NORMAL_TEXTURE");
    }
  }

  /**
   * Normal texture intensity.
   */
  get normalTextureIntensity(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._normalTextureIntensityProp);
  }

  set normalTextureIntensity(value: number) {
    this.shaderData.setFloat(PBRBaseMaterial._normalTextureIntensityProp, value);
    this.shaderData.setFloat("u_normalIntensity", value);
  }

  /**
   * Emissive color.
   */
  get emissiveColor(): Color {
    return this.shaderData.getColor(PBRBaseMaterial._emissiveColorProp);
  }

  set emissiveColor(value: Color) {
    const emissiveColor = this.shaderData.getColor(PBRBaseMaterial._emissiveColorProp);
    if (value !== emissiveColor) {
      value.cloneTo(emissiveColor);
    }
  }

  /**
   * Emissive texture.
   */
  get emissiveTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._emissiveTextureProp);
  }

  set emissiveTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._emissiveTextureProp, value);
    if (value) {
      this.shaderData.enableMacro("HAS_EMISSIVEMAP");
    } else {
      this.shaderData.disableMacro("HAS_EMISSIVEMAP");
    }
  }

  /**
   * Occlusion texture.
   */
  get occlusionTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._occlusionTextureProp);
  }

  set occlusionTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._occlusionTextureProp, value);
    if (value) {
      this.shaderData.enableMacro("HAS_OCCLUSIONMAP");
    } else {
      this.shaderData.disableMacro("HAS_OCCLUSIONMAP");
    }
  }

  /**
   * Occlusion texture intensity.
   */
  get occlusionTextureIntensity(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._occlusionTextureIntensityProp);
  }

  set occlusionTextureIntensity(value: number) {
    this.shaderData.setFloat(PBRBaseMaterial._occlusionTextureIntensityProp, value);
  }

  /**
   * Tiling and offset of main textures.
   */
  get tilingOffset(): Vector4 {
    return this.shaderData.getVector4(PBRBaseMaterial._tilingOffsetProp);
  }

  set tilingOffset(value: Vector4) {
    const tilingOffset = this.shaderData.getVector4(PBRBaseMaterial._tilingOffsetProp);
    if (value !== tilingOffset) {
      value.cloneTo(tilingOffset);
    }
  }

  /**
   * Create a pbr base material instance.
   * @param engine - Engine to which the material belongs
   */
  protected constructor(engine: Engine) {
    super(engine, Shader.find("pbr"));

    const shaderData = this.shaderData;

    shaderData.enableMacro("O3_NEED_WORLDPOS");
    shaderData.enableMacro("O3_NEED_TILINGOFFSET");

    shaderData.setColor(PBRBaseMaterial._baseColorProp, new Color(1, 1, 1, 1));
    shaderData.setColor(PBRBaseMaterial._emissiveColorProp, new Color(0, 0, 0, 1));
    shaderData.setVector4(PBRBaseMaterial._tilingOffsetProp, new Vector4(1, 1, 0, 0));

    shaderData.setFloat(PBRBaseMaterial._normalTextureIntensityProp, 1);
    shaderData.setFloat(PBRBaseMaterial._occlusionTextureIntensityProp, 1);
  }
}
