import { Color, Vector4 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";

/**
 * Blinn-phong Material.
 */
export class BlinnPhongMaterial extends BaseMaterial {
  private static _diffuseColorProp = Shader.getPropertyByName("u_diffuseColor");
  private static _specularColorProp = Shader.getPropertyByName("u_specularColor");
  private static _emissiveColorProp = Shader.getPropertyByName("u_emissiveColor");
  private static _tilingOffsetProp = Shader.getPropertyByName("u_tilingOffset");
  private static _shininessProp = Shader.getPropertyByName("u_shininess");
  private static _normalIntensityProp = Shader.getPropertyByName("u_normalIntensity");

  private static _baseTextureProp = Shader.getPropertyByName("u_diffuseTexture");
  private static _specularTextureProp = Shader.getPropertyByName("u_specularTexture");
  private static _emissiveTextureProp = Shader.getPropertyByName("u_emissiveTexture");
  private static _normalTextureProp = Shader.getPropertyByName("u_normalTexture");

  /**
   * Base color.
   */
  get baseColor(): Color {
    return this.shaderData.getColor(BlinnPhongMaterial._diffuseColorProp);
  }

  set baseColor(value: Color) {
    const baseColor = this.shaderData.getColor(BlinnPhongMaterial._diffuseColorProp);
    if (value !== baseColor) {
      value.cloneTo(baseColor);
    }
  }

  /**
   * Base texture.
   */
  get baseTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(BlinnPhongMaterial._baseTextureProp);
  }

  set baseTexture(value: Texture2D) {
    if (value) {
      this.shaderData.enableMacro("O3_DIFFUSE_TEXTURE");
      this.shaderData.setTexture(BlinnPhongMaterial._baseTextureProp, value);
    } else {
      this.shaderData.disableMacro("O3_DIFFUSE_TEXTURE");
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
      value.cloneTo(specularColor);
    }
  }

  /**
   * Specular texture.
   */
  get specularTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(BlinnPhongMaterial._specularTextureProp);
  }

  set specularTexture(value: Texture2D) {
    if (value) {
      this.shaderData.enableMacro("O3_SPECULAR_TEXTURE");
      this.shaderData.setTexture(BlinnPhongMaterial._specularTextureProp, value);
    } else {
      this.shaderData.disableMacro("O3_SPECULAR_TEXTURE");
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
      value.cloneTo(emissiveColor);
    }
  }

  /**
   * Emissive texture.
   */
  get emissiveTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(BlinnPhongMaterial._emissiveTextureProp);
  }

  set emissiveTexture(value: Texture2D) {
    if (value) {
      this.shaderData.enableMacro("O3_EMISSIVE_TEXTURE");
      this.shaderData.setTexture(BlinnPhongMaterial._emissiveTextureProp, value);
    } else {
      this.shaderData.disableMacro("O3_EMISSIVE_TEXTURE");
    }
  }

  /**
   * Normal texture.
   */
  get normalTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(BlinnPhongMaterial._normalTextureProp);
  }

  set normalTexture(value: Texture2D) {
    if (value) {
      this.shaderData.enableMacro("O3_NORMAL_TEXTURE");
      this.shaderData.setTexture(BlinnPhongMaterial._normalTextureProp, value);
    } else {
      this.shaderData.disableMacro("O3_NORMAL_TEXTURE");
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
    this.shaderData.setFloat(BlinnPhongMaterial._shininessProp, value);
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
      value.cloneTo(tilingOffset);
    }
  }

  constructor(engine: Engine) {
    super(engine, Shader.find("blinn-phong"));

    const shaderData = this.shaderData;

    shaderData.enableMacro("O3_NEED_WORLDPOS");
    shaderData.enableMacro("O3_NEED_TILINGOFFSET");

    shaderData.setColor(BlinnPhongMaterial._diffuseColorProp, new Color(1, 1, 1, 1));
    shaderData.setColor(BlinnPhongMaterial._specularColorProp, new Color(1, 1, 1, 1));
    shaderData.setColor(BlinnPhongMaterial._emissiveColorProp, new Color(0, 0, 0, 1));
    shaderData.setVector4(BlinnPhongMaterial._tilingOffsetProp, new Vector4(1, 1, 0, 0));
    shaderData.setFloat(BlinnPhongMaterial._shininessProp, 16);
    shaderData.setFloat(BlinnPhongMaterial._normalIntensityProp, 1);
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
