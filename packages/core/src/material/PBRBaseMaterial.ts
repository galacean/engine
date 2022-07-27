import { Color, Vector4 } from "@oasis-engine/math";
import { Logger } from "..";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";
import { TextureCoordinate } from "./enums/TextureCoordinate";

/**
 * PBR (Physically-Based Rendering) Material.
 */
export abstract class PBRBaseMaterial extends BaseMaterial {
  private static _occlusionTextureIntensityProp = Shader.getPropertyByName("u_occlusionIntensity");
  private static _occlusionTextureCoordProp = Shader.getPropertyByName("u_occlusionTextureCoord");
  private static _occlusionTextureProp = Shader.getPropertyByName("u_occlusionTexture");

  private static _clearCoatProp = Shader.getPropertyByName("u_clearCoat");
  private static _clearCoatTextureProp = Shader.getPropertyByName("u_clearCoatTexture");
  private static _clearCoatRoughnessProp = Shader.getPropertyByName("u_clearCoatRoughness");
  private static _clearCoatRoughnessTextureProp = Shader.getPropertyByName("u_clearCoatRoughnessTexture");
  private static _clearCoatNormalTextureProp = Shader.getPropertyByName("u_clearCoatNormalTexture");

  /**
   * Base color.
   */
  get baseColor(): Color {
    return this.shaderData.getColor(PBRBaseMaterial._baseColorProp);
  }

  set baseColor(value: Color) {
    const baseColor = this.shaderData.getColor(PBRBaseMaterial._baseColorProp);
    if (value !== baseColor) {
      baseColor.copyFrom(value);
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
      this.shaderData.enableMacro(PBRBaseMaterial._baseTextureMacro);
    } else {
      this.shaderData.disableMacro(PBRBaseMaterial._baseTextureMacro);
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
      this.shaderData.enableMacro(PBRBaseMaterial._normalTextureMacro);
    } else {
      this.shaderData.disableMacro(PBRBaseMaterial._normalTextureMacro);
    }
  }

  /**
   * Normal texture intensity.
   */
  get normalTextureIntensity(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._normalIntensityProp);
  }

  set normalTextureIntensity(value: number) {
    this.shaderData.setFloat(PBRBaseMaterial._normalIntensityProp, value);
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
      emissiveColor.copyFrom(value);
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
      this.shaderData.enableMacro(PBRBaseMaterial._emissiveTextureMacro);
    } else {
      this.shaderData.disableMacro(PBRBaseMaterial._emissiveTextureMacro);
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
      this.shaderData.enableMacro("OCCLUSIONTEXTURE");
    } else {
      this.shaderData.disableMacro("OCCLUSIONTEXTURE");
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
   * Occlusion texture uv coordinate.
   * @remarks Must be UV0 or UV1.
   */
  get occlusionTextureCoord(): TextureCoordinate {
    return this.shaderData.getFloat(PBRBaseMaterial._occlusionTextureCoordProp);
  }

  set occlusionTextureCoord(value: TextureCoordinate) {
    if (value > TextureCoordinate.UV1) {
      Logger.warn("Occlusion texture uv coordinate must be UV0 or UV1.");
    }
    this.shaderData.setFloat(PBRBaseMaterial._occlusionTextureCoordProp, value);
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
      tilingOffset.copyFrom(value);
    }
  }

  /**
   * The clearCoat layer intensity, default 0.
   */
  get clearCoat(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._clearCoatProp);
  }

  set clearCoat(value: number) {
    if (!!this.shaderData.getFloat(PBRBaseMaterial._clearCoatProp) !== !!value) {
      if (value === 0) {
        this.shaderData.disableMacro("CLEARCOAT");
      } else {
        this.shaderData.enableMacro("CLEARCOAT");
      }
    }
    this.shaderData.setFloat(PBRBaseMaterial._clearCoatProp, value);
  }

  /**
   * The clearCoat layer intensity texture.
   */
  get clearCoatTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._clearCoatTextureProp);
  }

  set clearCoatTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._clearCoatTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("HAS_CLEARCOATTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_CLEARCOATTEXTURE");
    }
  }

  /**
   * The clearCoat layer roughness, default 0.
   */
  get clearCoatRoughness(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._clearCoatRoughnessProp);
  }

  set clearCoatRoughness(value: number) {
    this.shaderData.setFloat(PBRBaseMaterial._clearCoatRoughnessProp, value);
  }

  /**
   * The clearCoat layer roughness texture.
   */
  get clearCoatRoughnessTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._clearCoatRoughnessTextureProp);
  }

  set clearCoatRoughnessTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._clearCoatRoughnessTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("HAS_CLEARCOATROUGHNESSTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_CLEARCOATROUGHNESSTEXTURE");
    }
  }

  /**
   * The clearCoat normal map texture.
   */
  get clearCoatNormalTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._clearCoatNormalTextureProp);
  }

  set clearCoatNormalTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._clearCoatNormalTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("HAS_CLEARCOATNORMALTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_CLEARCOATNORMALTEXTURE");
    }
  }

  /**
   * Create a pbr base material instance.
   * @param engine - Engine to which the material belongs
   * @param shader - Shader used by the material
   */
  protected constructor(engine: Engine, shader: Shader) {
    super(engine, shader);

    const shaderData = this.shaderData;

    shaderData.enableMacro("O3_NEED_WORLDPOS");
    shaderData.enableMacro("O3_NEED_TILINGOFFSET");

    shaderData.setColor(PBRBaseMaterial._baseColorProp, new Color(1, 1, 1, 1));
    shaderData.setColor(PBRBaseMaterial._emissiveColorProp, new Color(0, 0, 0, 1));
    shaderData.setVector4(PBRBaseMaterial._tilingOffsetProp, new Vector4(1, 1, 0, 0));

    shaderData.setFloat(PBRBaseMaterial._normalIntensityProp, 1);
    shaderData.setFloat(PBRBaseMaterial._occlusionTextureIntensityProp, 1);
    shaderData.setFloat(PBRBaseMaterial._occlusionTextureCoordProp, TextureCoordinate.UV0);

    shaderData.setFloat(PBRBaseMaterial._clearCoatProp, 0);
    shaderData.setFloat(PBRBaseMaterial._clearCoatRoughnessProp, 0);
  }
}
