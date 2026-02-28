import { Color, Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";

/**
 * Blinn-phong Material.
 */
export class BlinnPhongMaterial extends BaseMaterial {
  private static _specularColorProp = ShaderProperty.getByName("material_SpecularColor");
  private static _shininessProp = ShaderProperty.getByName("material_Shininess");
  private static _specularTextureProp = ShaderProperty.getByName("material_SpecularTexture");

  /**
   * Base color.
   */
  get baseColor(): Color {
    return this.shaderData.getColor(BlinnPhongMaterial._baseColorProp);
  }

  set baseColor(value: Color) {
    const baseColor = this.shaderData.getColor(BlinnPhongMaterial._baseColorProp);
    if (value !== baseColor) {
      baseColor.copyFrom(value);
    }
  }

  /**
   * Base texture.
   */
  get baseTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(BlinnPhongMaterial._baseTextureProp);
  }

  set baseTexture(value: Texture2D) {
    this.shaderData.setTexture(BlinnPhongMaterial._baseTextureProp, value);
    if (value) {
      this.shaderData.enableMacro(BlinnPhongMaterial._baseTextureMacro);
    } else {
      this.shaderData.disableMacro(BlinnPhongMaterial._baseTextureMacro);
    }
  }

  /**
   * Specular color.
   */
  get specularColor(): Color {
    return this.shaderData.getColor(BlinnPhongMaterial._specularColorProp);
  }

  set specularColor(value: Color) {
    const specularColor = this.shaderData.getColor(BlinnPhongMaterial._specularColorProp);
    if (value !== specularColor) {
      specularColor.copyFrom(value);
    }
  }

  /**
   * Specular texture.
   */
  get specularTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(BlinnPhongMaterial._specularTextureProp);
  }

  set specularTexture(value: Texture2D) {
    this.shaderData.setTexture(BlinnPhongMaterial._specularTextureProp, value);
    if (value) {
      this.shaderData.enableMacro("MATERIAL_HAS_SPECULAR_TEXTURE");
    } else {
      this.shaderData.disableMacro("MATERIAL_HAS_SPECULAR_TEXTURE");
    }
  }

  /**
   * Emissive color.
   */
  get emissiveColor(): Color {
    return this.shaderData.getColor(BlinnPhongMaterial._emissiveColorProp);
  }

  set emissiveColor(value: Color) {
    const emissiveColor = this.shaderData.getColor(BlinnPhongMaterial._emissiveColorProp);
    if (value !== emissiveColor) {
      emissiveColor.copyFrom(value);
    }
  }

  /**
   * Emissive texture.
   */
  get emissiveTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(BlinnPhongMaterial._emissiveTextureProp);
  }

  set emissiveTexture(value: Texture2D) {
    this.shaderData.setTexture(BlinnPhongMaterial._emissiveTextureProp, value);
    if (value) {
      this.shaderData.enableMacro(BlinnPhongMaterial._emissiveTextureMacro);
    } else {
      this.shaderData.disableMacro(BlinnPhongMaterial._emissiveTextureMacro);
    }
  }

  /**
   * Normal texture.
   */
  get normalTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(BlinnPhongMaterial._normalTextureProp);
  }

  set normalTexture(value: Texture2D) {
    this.shaderData.setTexture(BlinnPhongMaterial._normalTextureProp, value);
    if (value) {
      this.shaderData.enableMacro(BlinnPhongMaterial._normalTextureMacro);
    } else {
      this.shaderData.disableMacro(BlinnPhongMaterial._normalTextureMacro);
    }
  }

  /**
   * Normal texture intensity.
   */
  get normalIntensity(): number {
    return this.shaderData.getFloat(BlinnPhongMaterial._normalIntensityProp);
  }

  set normalIntensity(value: number) {
    this.shaderData.setFloat(BlinnPhongMaterial._normalIntensityProp, value);
  }

  /**
   * Set the specular reflection coefficient, the larger the value, the more convergent the specular reflection effect.
   */
  get shininess(): number {
    return this.shaderData.getFloat(BlinnPhongMaterial._shininessProp);
  }

  set shininess(value: number) {
    this.shaderData.setFloat(BlinnPhongMaterial._shininessProp, Math.max(value, 1e-4));
  }

  /**
   * Tiling and offset of main textures.
   */
  get tilingOffset(): Vector4 {
    return this.shaderData.getVector4(BlinnPhongMaterial._tilingOffsetProp);
  }

  set tilingOffset(value: Vector4) {
    const tilingOffset = this.shaderData.getVector4(BlinnPhongMaterial._tilingOffsetProp);
    if (value !== tilingOffset) {
      tilingOffset.copyFrom(value);
    }
  }

  /**
   * Create a BlinnPhong material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("blinn-phong"));

    const shaderData = this.shaderData;

    shaderData.enableMacro("MATERIAL_NEED_WORLD_POS");
    shaderData.enableMacro("MATERIAL_NEED_TILING_OFFSET");

    shaderData.setColor(BlinnPhongMaterial._baseColorProp, new Color(1, 1, 1, 1));
    shaderData.setColor(BlinnPhongMaterial._specularColorProp, new Color(1, 1, 1, 1));
    shaderData.setColor(BlinnPhongMaterial._emissiveColorProp, new Color(0, 0, 0, 1));
    shaderData.setVector4(BlinnPhongMaterial._tilingOffsetProp, new Vector4(1, 1, 0, 0));
    shaderData.setFloat(BlinnPhongMaterial._shininessProp, 16);
    shaderData.setFloat(BlinnPhongMaterial._normalIntensityProp, 1);
  }

  override clone(): BlinnPhongMaterial {
    var dest: BlinnPhongMaterial = new BlinnPhongMaterial(this._engine);
    this._cloneToAndModifyName(dest);
    return dest;
  }
}
