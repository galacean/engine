import { Color, Vector4 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";

/**
 * PBR (Physically-Based Rendering) Material.
 */
export abstract class PBRBaseMaterial extends BaseMaterial {
  private static _iorProp = Shader.getPropertyByName("u_ior");
  private static _baseColorProp = Shader.getPropertyByName("u_baseColor");
  private static _emissiveColorProp = Shader.getPropertyByName("u_emissiveColor");
  private static _tilingOffsetProp = Shader.getPropertyByName("u_tilingOffset");
  private static _baseTextureProp = Shader.getPropertyByName("u_baseColorSampler");
  private static _normalTextureProp = Shader.getPropertyByName("u_normalTexture");
  private static _normalTextureIntensityProp = Shader.getPropertyByName("u_normalIntensity");
  private static _occlusionTextureIntensityProp = Shader.getPropertyByName("u_occlusionStrength");
  private static _emissiveTextureProp = Shader.getPropertyByName("u_emissiveSampler");
  private static _occlusionTextureProp = Shader.getPropertyByName("u_occlusionSampler");

  private static _clearcoatProp = Shader.getPropertyByName("u_clearcoat");
  private static _clearcoatTextureProp = Shader.getPropertyByName("u_clearcoatTexture");
  private static _clearcoatRoughnessProp = Shader.getPropertyByName("u_clearcoatRoughness");
  private static _clearcoatRoughnessTextureProp = Shader.getPropertyByName("u_clearcoatRoughnessTexture");
  private static _clearcoatNormalTextureProp = Shader.getPropertyByName("u_clearcoatNormalTexture");

  private static _sheenColor = Shader.getPropertyByName("u_sheenColor");
  private static _sheenColorTexture = Shader.getPropertyByName("u_sheenColorTexture");
  private static _sheenRoughness = Shader.getPropertyByName("u_sheenRoughness");
  private static _sheenRoughnessTexture = Shader.getPropertyByName("u_sheenRoughnessTexture");

  private static _refractionTextureProp = Shader.getPropertyByName("u_refractionTexture");
  private static _refractionIntensityProp = Shader.getPropertyByName("u_refractionIntensity");
  private static _refractionIntensityTextureProp = Shader.getPropertyByName("u_refractionIntensityTexture");
  private static _thicknessProp = Shader.getPropertyByName("u_thickness");
  private static _thicknessTextureProp = Shader.getPropertyByName("u_thicknessTexture");
  private static _attenuationDistanceProp = Shader.getPropertyByName("u_attenuationDistance");
  private static _attenuationColorProp = Shader.getPropertyByName("u_attenuationColor");

  private _sheenEnabled: boolean = false;

  /**
   * Index of refraction of the material, default 1.5 .
   * @remarks It influence the F0 of dielectric materials and refraction.
   */
  get ior(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._iorProp);
  }

  set ior(value: number) {
    this.shaderData.setFloat(PBRBaseMaterial._iorProp, value);
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
   * The clearcoat layer intensity, default 0.
   */
  get clearcoat(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._clearcoatProp);
  }

  set clearcoat(value: number) {
    this.shaderData.setFloat(PBRBaseMaterial._clearcoatProp, value);

    if (value === 0) {
      this.shaderData.disableMacro("CLEARCOAT");
    } else {
      this.shaderData.enableMacro("CLEARCOAT");
    }
  }

  /**
   * The clearcoat layer intensity texture.
   */
  get clearcoatTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._clearcoatTextureProp);
  }

  set clearcoatTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._clearcoatTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("HAS_CLEARCOATTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_CLEARCOATTEXTURE");
    }
  }

  /**
   * The clearcoat layer roughness, default 0.
   */
  get clearcoatRoughness(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._clearcoatRoughnessProp);
  }

  set clearcoatRoughness(value: number) {
    this.shaderData.setFloat(PBRBaseMaterial._clearcoatRoughnessProp, value);
  }

  /**
   * The clearcoat layer roughness texture.
   */
  get clearcoatRoughnessTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._clearcoatRoughnessTextureProp);
  }

  set clearcoatRoughnessTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._clearcoatRoughnessTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("HAS_CLEARCOATROUGHNESSTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_CLEARCOATROUGHNESSTEXTURE");
    }
  }

  /**
   * The clearcoat normal map texture.
   */
  get clearcoatNormalTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._clearcoatNormalTextureProp);
  }

  set clearcoatNormalTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._clearcoatNormalTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("HAS_CLEARCOATNORMALTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_CLEARCOATNORMALTEXTURE");
    }
  }

  /**
   * Sheen enabled.
   * @remark
   */
  get sheenEnabled(): boolean {
    return this._sheenEnabled;
  }

  set sheenEnabled(value: boolean) {
    this._sheenEnabled = value;

    if (value) {
      this.shaderData.enableMacro("SHEEN");
    } else {
      this.shaderData.disableMacro("SHEEN");
    }
  }

  /**
   * Sheen color, default [0,0,0].
   */
  get sheenColor(): Color {
    return this.shaderData.getColor(PBRBaseMaterial._sheenColor);
  }

  set sheenColor(value: Color) {
    const baseColor = this.shaderData.getColor(PBRBaseMaterial._sheenColor);

    if (value !== baseColor) {
      value.cloneTo(baseColor);
    }
  }

  /**
   * The sheen color texture.
   */
  get sheenColorTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._sheenColorTexture);
  }

  set sheenColorTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._sheenColorTexture, value);

    if (value) {
      this.shaderData.enableMacro("HAS_SHEENCOLORTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_SHEENCOLORTEXTURE");
    }
  }

  /**
   * Sheen roughness, default 0.
   */
  get sheenRoughness(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._sheenRoughness);
  }

  set sheenRoughness(value: number) {
    this.shaderData.setFloat(PBRBaseMaterial._sheenRoughness, value);
  }

  /**
   * The sheen roughness texture.
   */
  get sheenRoughnessTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._sheenRoughnessTexture);
  }

  set sheenRoughnessTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._sheenRoughnessTexture, value);

    if (value) {
      this.shaderData.enableMacro("HAS_SHEENROUGHNESSTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_SHEENROUGHNESSTEXTURE");
    }
  }

  /**
   * Refraction texture, only take effect when refractionIntensity > 0
   */
  get refractionTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._refractionTextureProp);
  }

  set refractionTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._refractionTextureProp, value);
  }

  /**
   * Refraction intensity, default 0.
   */
  get refractionIntensity(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._refractionIntensityProp);
  }

  set refractionIntensity(value: number) {
    this.shaderData.setFloat(PBRBaseMaterial._refractionIntensityProp, value);

    if (value === 0) {
      this.shaderData.disableMacro("REFRACTION");
    } else {
      this.shaderData.enableMacro("REFRACTION");
    }
  }

  /**
   * Texture that defines the refraction intensity of the sub surface, stored in the R channel. This will be multiplied by refractionIntensity.
   */
  get refractionIntensityTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._refractionIntensityTextureProp);
  }

  set refractionIntensityTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._refractionIntensityTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("HAS_REFRACTIONINTENSITYTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_REFRACTIONINTENSITYTEXTURE");
    }
  }

  /**
   * The thickness of the volume beneath the surface, default 0.
   * @remarks The value is given in the coordinate space of the mesh. If the value is 0 the material is thin-walled. Otherwise the material is a volume boundary. Range is [0, +inf).
   */
  get thickness(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._thicknessProp);
  }

  set thickness(value: number) {
    this.shaderData.setFloat(PBRBaseMaterial._thicknessProp, value);
  }

  /**
   * Texture that defines the thickness, stored in the G channel. This will be multiplied by thickness.
   */
  get thicknessTexture(): Texture2D {
    return <Texture2D>this.shaderData.getTexture(PBRBaseMaterial._thicknessTextureProp);
  }

  set thicknessTexture(value: Texture2D) {
    this.shaderData.setTexture(PBRBaseMaterial._thicknessTextureProp, value);

    if (value) {
      this.shaderData.enableMacro("HAS_THICKNESSTEXTURE");
    } else {
      this.shaderData.disableMacro("HAS_THICKNESSTEXTURE");
    }
  }

  /**
   *
   * Density of the medium given as the average distance that light travels in the medium before interacting with a particle.
   * @remarks Defines the distance at which the attenuation color should be found in the media. Range is (0, +inf).
   */
  get attenuationDistance(): number {
    return this.shaderData.getFloat(PBRBaseMaterial._attenuationDistanceProp);
  }

  set attenuationDistance(value: number) {
    this.shaderData.setFloat(PBRBaseMaterial._attenuationDistanceProp, value);
  }

  /**
   * The color that light turns into due to absorption when reaching the attenuation distance.
   */
  get attenuationColor(): Color {
    return this.shaderData.getColor(PBRBaseMaterial._attenuationColorProp);
  }

  set attenuationColor(value: Color) {
    const color = this.shaderData.getColor(PBRBaseMaterial._attenuationColorProp);

    if (value !== color) {
      value.cloneTo(color);
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

    shaderData.setFloat(PBRBaseMaterial._iorProp, 1.5);
    shaderData.setColor(PBRBaseMaterial._baseColorProp, new Color(1, 1, 1, 1));
    shaderData.setColor(PBRBaseMaterial._emissiveColorProp, new Color(0, 0, 0, 1));
    shaderData.setVector4(PBRBaseMaterial._tilingOffsetProp, new Vector4(1, 1, 0, 0));

    shaderData.setFloat(PBRBaseMaterial._normalTextureIntensityProp, 1);
    shaderData.setFloat(PBRBaseMaterial._occlusionTextureIntensityProp, 1);

    shaderData.setFloat(PBRBaseMaterial._clearcoatProp, 0);
    shaderData.setFloat(PBRBaseMaterial._clearcoatRoughnessProp, 0);

    shaderData.setColor(PBRBaseMaterial._sheenColor, new Color(0, 0, 0, 1));
    shaderData.setFloat(PBRBaseMaterial._sheenRoughness, 0);

    shaderData.setFloat(PBRBaseMaterial._refractionIntensityProp, 0);
    shaderData.setFloat(PBRBaseMaterial._thicknessProp, 0);
    shaderData.setFloat(PBRBaseMaterial._attenuationDistanceProp, 0);
    shaderData.setColor(PBRBaseMaterial._attenuationColorProp, new Color(1, 1, 1));
  }

  /**
   * @override
   * Clone to the target material.
   * @param target - target material
   */
  cloneTo(target: PBRBaseMaterial): void {
    super.cloneTo(target);
    target._sheenEnabled = this._sheenEnabled;
  }
}
