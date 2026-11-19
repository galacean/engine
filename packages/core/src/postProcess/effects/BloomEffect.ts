import { Color } from "@galacean/engine-math";
import { ShaderMacro, ShaderProperty } from "../../shader";

import { PostProcessEffect } from "../PostProcessEffect";
import {
  PostProcessEffectBoolParameter,
  PostProcessEffectColorParameter,
  PostProcessEffectEnumParameter,
  PostProcessEffectFloatParameter,
  PostProcessEffectTextureParameter
} from "../PostProcessEffectParameter";

/**
 * This controls the size of the bloom texture.
 */
export enum BloomDownScaleMode {
  /** Use this to select half size as the starting resolution. */
  Half,
  /** Use this to select quarter size as the starting resolution. */
  Quarter
}

export class BloomEffect extends PostProcessEffect {
  static readonly SHADER_NAME = "PostProcess/Bloom";

  // Bloom shader properties
  /** @internal */
  static _hqMacro: ShaderMacro = ShaderMacro.getByName("BLOOM_HQ");
  /** @internal */
  static _dirtMacro: ShaderMacro = ShaderMacro.getByName("BLOOM_DIRT");
  /** @internal */
  static _bloomParams = ShaderProperty.getByName("material_BloomParams"); // x: threshold (linear), y: threshold knee, z: scatter

  // Uber shader properties
  /** @internal */
  static _enableMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_EFFECT_BLOOM");
  /** @internal */
  static _bloomTextureProp = ShaderProperty.getByName("material_BloomTexture");
  /** @internal */
  static _dirtTextureProp = ShaderProperty.getByName("material_BloomDirtTexture");
  /** @internal */
  static _tintProp = ShaderProperty.getByName("material_BloomTint");
  /** @internal */
  static _bloomIntensityParams = ShaderProperty.getByName("material_BloomIntensityParams"); // x: bloom intensity, y: dirt intensity
  /** @internal */
  static _dirtTilingOffsetProp = ShaderProperty.getByName("material_BloomDirtTilingOffset");

  /**
   * Controls whether to use higher-quality filtering for the bloom prefilter and upsampling passes.
   * @remarks This is slightly more expensive but helps getting smoother visuals.
   */
  highQualityFiltering = new PostProcessEffectBoolParameter(false);

  /**
   * Controls the starting resolution that this effect begins processing.
   */
  downScale = new PostProcessEffectEnumParameter(BloomDownScaleMode, BloomDownScaleMode.Half);

  /**
   * Controls the maximum number of iterations in the bloom mip pyramid.
   * @remarks Higher values produce a wider bloom radius at the cost of additional render passes.
   * Clamped to the integer range `1`–`8` (non-integer values are rounded when applied).
   * @defaultValue `6`
   */
  maxIterations = new PostProcessEffectFloatParameter(6, 1, 8, false);

  /**
   * Specifies a Texture to add smudges or dust to the bloom effect.
   */
  dirtTexture = new PostProcessEffectTextureParameter(null);

  /**
   * Set the level of brightness to filter out pixels under this level.
   * @remarks This value is expressed in linear.
   */
  threshold = new PostProcessEffectFloatParameter(0.8, 0);

  /**
   * Controls the radius of the bloom effect.
   */
  scatter = new PostProcessEffectFloatParameter(0.7, 0, 1);

  /**
   * Controls the strength of the bloom effect.
   */
  intensity = new PostProcessEffectFloatParameter(0, 0);

  /**
   * Controls the strength of the lens dirt.
   */
  dirtIntensity = new PostProcessEffectFloatParameter(0, 0);

  /**
   * Specifies the tint of the bloom effect.
   */
  tint = new PostProcessEffectColorParameter(new Color(1, 1, 1, 1));

  /** @inheritdoc */
  override isValid(): boolean {
    return this.enabled && this.intensity.value > 0;
  }
}
