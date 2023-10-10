import { Color, Vector3, Vector4 } from "@galacean/engine-math";
import { Logger, ShaderProperty } from "..";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";
import { TextureCoordinate } from "./enums/TextureCoordinate";

/**
 * PBR (Physically-Based Rendering) Material.
 */
export abstract class PBRBaseMaterial extends BaseMaterial {
  private static _occlusionTextureIntensityProp = ShaderProperty.getByName("material_OcclusionIntensity");
  private static _occlusionTextureCoordProp = ShaderProperty.getByName("material_OcclusionTextureCoord");
  private static _occlusionTextureProp = ShaderProperty.getByName("material_OcclusionTexture");

  private static _clearCoatProp = ShaderProperty.getByName("material_ClearCoat");
  private static _clearCoatTextureProp = ShaderProperty.getByName("material_ClearCoatTexture");
  private static _clearCoatRoughnessProp = ShaderProperty.getByName("material_ClearCoatRoughness");
  private static _clearCoatRoughnessTextureProp = ShaderProperty.getByName("material_ClearCoatRoughnessTexture");
  private static _clearCoatNormalTextureProp = ShaderProperty.getByName("material_ClearCoatNormalTexture");

  private static _anisotropyProp = ShaderProperty.getByName("material_Anisotropy");
  private static _anisotropyDirectionProp = ShaderProperty.getByName("material_AnisotropyDirection");

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
      this.shaderData.enableMacro("MATERIAL_HAS_OCCLUSION_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_OCCLUSION_TEXTURE");
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
        this.shaderData.disableMacro("MATERIAL_ENABLE_CLEAR_COAT");
      } else {
        this.shaderData.enableMacro("MATERIAL_ENABLE_CLEAR_COAT");
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
      this.shaderData.enableMacro("MATERIAL_HAS_CLEAR_COAT_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_CLEAR_COAT_TEXTURE");
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
      this.shaderData.enableMacro("MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE");
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
      this.shaderData.enableMacro("MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE");
    }
  }

  /**
   * The Amount of anisotropy. Scalar between −1 and 1.
   */
  get anisotropy(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._anisotropyProp);
  }

  set anisotropy(value: number) {
    if (!!this.shaderData.getFloat(PBRBaseMaterial._anisotropyProp) !== !!value) {
      if (value === 0) {
        this.shaderData.disableMacro("MATERIAL_ENABLE_ANISOTROPY");
      } else {
        this.shaderData.enableMacro("MATERIAL_ENABLE_ANISOTROPY");
      }
    }
    this.shaderData.setFloat(PBRBaseMaterial._anisotropyProp, value);
  }

  /**
   * The direction of the surface to control the shape of the specular highlights
   */
  get anisotropyDirection(): Vector3 {
    return this.shaderData.getVector3(PBRBaseMaterial._anisotropyDirectionProp);
  }

  set anisotropyDirection(value: Vector3) {
    const direction = this.shaderData.getVector3(PBRBaseMaterial._anisotropyDirectionProp);
    if (value !== direction) {
      direction.copyFrom(value);
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

    shaderData.enableMacro("MATERIAL_NEED_WORLD_POS");
    shaderData.enableMacro("MATERIAL_NEED_TILING_OFFSET");

    shaderData.setColor(PBRBaseMaterial._baseColorProp, new Color(1, 1, 1, 1));
    shaderData.setColor(PBRBaseMaterial._emissiveColorProp, new Color(0, 0, 0, 1));
    shaderData.setVector4(PBRBaseMaterial._tilingOffsetProp, new Vector4(1, 1, 0, 0));

    shaderData.setFloat(PBRBaseMaterial._normalIntensityProp, 1);
    shaderData.setFloat(PBRBaseMaterial._occlusionTextureIntensityProp, 1);
    shaderData.setFloat(PBRBaseMaterial._occlusionTextureCoordProp, TextureCoordinate.UV0);

    shaderData.setFloat(PBRBaseMaterial._clearCoatProp, 0);
    shaderData.setFloat(PBRBaseMaterial._clearCoatRoughnessProp, 0);

    shaderData.setFloat(PBRBaseMaterial._anisotropyProp, 0);
    shaderData.setVector3(PBRBaseMaterial._anisotropyDirectionProp, new Vector3(1, 0, 0));
  }
}
