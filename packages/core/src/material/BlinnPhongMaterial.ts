import { Color, Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { ShaderUniformType, uniform } from "../shader";
import { Shader } from "../shader/Shader";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";

/**
 * Blinn-phong Material.
 */
export class BlinnPhongMaterial extends BaseMaterial {
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
   * Specular color.
   */
  @uniform(ShaderUniformType.Color, {
    varName: "material_SpecularColor",
    keepRef: true
  })
  specularColor: Color = new Color(1, 1, 1, 1);

  /**
   * Specular texture.
   */
  @uniform(ShaderUniformType.Texture, {
    varName: "material_SpecularTexture",
    macroName: "MATERIAL_HAS_SPECULAR_TEXTURE"
  })
  specularTexture: Texture2D;

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
  normalIntensity: number = 1;

  /**
   * Set the specular reflection coefficient, the larger the value, the more convergent the specular reflection effect.
   */
  @uniform(ShaderUniformType.Float, {
    varName: "material_Shininess"
  })
  shininess: number = 16;

  /**
   * Tiling and offset of main textures.
   */
  @uniform(ShaderUniformType.Vector4, {
    varName: "material_TilingOffset",
    keepRef: true
  })
  tilingOffset: Vector4 = new Vector4(1, 1, 0, 0);

  /**
   * Create a BlinnPhong material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("blinn-phong"));

    const shaderData = this.shaderData;

    shaderData.enableMacro("MATERIAL_NEED_WORLD_POS");
    shaderData.enableMacro("MATERIAL_NEED_TILING_OFFSET");
  }

  override clone(): BlinnPhongMaterial {
    var dest: BlinnPhongMaterial = new BlinnPhongMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
