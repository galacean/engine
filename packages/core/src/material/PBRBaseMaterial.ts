import { Color, Vector4 } from "@galacean/engine-math";
import { Logger, ShaderProperty, ShaderUniformType, uniform } from "..";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";
import { TextureCoordinate } from "./enums/TextureCoordinate";

/**
 * PBR (Physically-Based Rendering) Material.
 */
export abstract class PBRBaseMaterial extends BaseMaterial {
  private static _occlusionTextureCoordProp = ShaderProperty.getByName("material_OcclusionTextureCoord");

  /**
   * Base color.
   */
  @uniform(ShaderUniformType.Color, {
    varName: "material_BaseColor",
    keepRef: true
  })
  baseColor: Color = new Color(1, 1, 1, 1);

  /**
   * Base texture.
   */
  @uniform(ShaderUniformType.Texture, {
    varName: "material_BaseColor",
    macroName: "MATERIAL_HAS_BASETEXTURE"
  })
  baseTexture: Texture2D;

  /**
   * Normal texture.
   */
  @uniform(ShaderUniformType.Texture, {
    varName: "material_NormalTexture",
    macroName: "MATERIAL_HAS_NORMALTEXTURE"
  })
  normalTexture: Texture2D;

  /**
   * Normal texture intensity.
   */
  @uniform(ShaderUniformType.Float, {
    varName: "material_NormalIntensity"
  })
  normalTextureIntensity: number = 1;

  /**
   * Emissive color.
   */
  @uniform(ShaderUniformType.Color, {
    varName: "material_EmissiveColor",
    keepRef: true
  })
  emissiveColor: Color = new Color(0, 0, 0, 1);

  /**
   * Emissive texture.
   */
  @uniform(ShaderUniformType.Texture, {
    varName: "material_EmissiveTexture",
    macroName: "MATERIAL_HAS_EMISSIVETEXTURE"
  })
  emissiveTexture: Texture2D;

  /**
   * Occlusion texture.
   */
  @uniform(ShaderUniformType.Texture, {
    varName: "material_OcclusionTexture",
    macroName: "MATERIAL_HAS_OCCLUSION_TEXTURE"
  })
  occlusionTexture: Texture2D;

  /**
   * Occlusion texture intensity.
   */
  @uniform(ShaderUniformType.Float, {
    varName: "material_OcclusionIntensity"
  })
  occlusionTextureIntensity: number = 1;

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
  @uniform(ShaderUniformType.Vector4, {
    varName: "material_TilingOffset",
    keepRef: true
  })
  tilingOffset: Vector4 = new Vector4(1, 1, 0, 0);

  /**
   * The clearCoat layer intensity, default 0.
   */
  @uniform(ShaderUniformType.Float, {
    varName: "material_ClearCoat",
    macroName: "MATERIAL_ENABLE_CLEAR_COAT"
  })
  clearCoat: number = 0;

  /**
   * The clearCoat layer intensity texture.
   */
  @uniform(ShaderUniformType.Texture, {
    varName: "material_ClearCoatTexture",
    macroName: "MATERIAL_HAS_CLEAR_COAT_TEXTURE"
  })
  clearCoatTexture: Texture2D;

  /**
   * The clearCoat layer roughness, default 0.
   */
  @uniform(ShaderUniformType.Float, {
    varName: "material_ClearCoatRoughness"
  })
  clearCoatRoughness: number = 0;

  /**
   * The clearCoat layer roughness texture.
   */
  @uniform(ShaderUniformType.Texture, {
    varName: "material_ClearCoatRoughnessTexture",
    macroName: "MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE"
  })
  clearCoatRoughnessTexture: Texture2D;

  /**
   * The clearCoat normal map texture.
   */
  @uniform(ShaderUniformType.Texture, {
    varName: "material_ClearCoatNormalTexture",
    macroName: "MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE"
  })
  clearCoatNormalTexture: Texture2D;

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
  }
}
