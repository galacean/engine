import { Color } from "@galacean/engine-math";
import { Shader, ShaderMacro, ShaderPass, ShaderProperty } from "../../shader";
import blitVs from "../../shaderlib/extra/Blit.vs.glsl";

import { PostProcessEffect } from "../PostProcessEffect";
import {
  PostProcessEffectBoolParameter,
  PostProcessEffectColorParameter,
  PostProcessEffectEnumParameter,
  PostProcessEffectFloatParameter,
  PostProcessEffectTextureParameter
} from "../PostProcessEffectParameter";
import fragBlurH from "../shaders/Bloom/BloomBlurH.glsl";
import fragBlurV from "../shaders/Bloom/BloomBlurV.glsl";
import fragPrefilter from "../shaders/Bloom/BloomPrefilter.glsl";
import fragUpsample from "../shaders/Bloom/BloomUpsample.glsl";

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
  static readonly SHADER_NAME = "PostProcessEffect Bloom";

  // Bloom shader properties
  /** @internal */
  static _maxIterations = 6;
  /** @internal */
  static _hqMacro: ShaderMacro = ShaderMacro.getByName("BLOOM_HQ");
  /** @internal */
  static _dirtMacro: ShaderMacro = ShaderMacro.getByName("BLOOM_DIRT");
  /** @internal */
  static _bloomParams = ShaderProperty.getByName("material_BloomParams"); // x: threshold (linear), y: threshold knee, z: scatter
  /** @internal */
  static _lowMipTextureProp = ShaderProperty.getByName("material_lowMipTexture");
  /** @internal */
  static _lowMipTexelSizeProp = ShaderProperty.getByName("material_lowMipTexelSize"); // x: 1/width, y: 1/height, z: width, w: height

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
   * Controls whether to use bicubic sampling instead of bilinear sampling for the upSampling passes.
   * @remarks This is slightly more expensive but helps getting smoother visuals.
   */
  highQualityFiltering = new PostProcessEffectBoolParameter(false);

  /**
   * Controls the starting resolution that this effect begins processing.
   */
  downScale = new PostProcessEffectEnumParameter(BloomDownScaleMode, BloomDownScaleMode.Half);

  /**
   * Specifies a Texture to add smudges or dust to the bloom effect.
   */
  dirtTexture = new PostProcessEffectTextureParameter(null);

  /**
   * Set the level of brightness to filter out pixels under this level.
   * @remarks This value is expressed in gamma-space.
   */
  threshold = new PostProcessEffectFloatParameter(0.9, 0);

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

Shader.create(BloomEffect.SHADER_NAME, [
  new ShaderPass("Bloom Prefilter", blitVs, fragPrefilter),
  new ShaderPass("Bloom Blur Horizontal", blitVs, fragBlurH),
  new ShaderPass("Bloom Blur Vertical", blitVs, fragBlurV),
  new ShaderPass("Bloom Upsample", blitVs, fragUpsample)
]);
