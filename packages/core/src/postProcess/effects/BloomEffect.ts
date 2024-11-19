import { Color, MathUtil } from "@galacean/engine-math";
import { Shader, ShaderMacro, ShaderPass, ShaderProperty } from "../../shader";
import blitVs from "../../shaderlib/extra/Blit.vs.glsl";
import { Texture2D } from "../../texture";

import { PostProcessEffect } from "../PostProcessEffect";
import fragBlurH from "../shaders/Bloom/BloomBlurH.glsl";
import fragBlurV from "../shaders/Bloom/BloomBlurV.glsl";
import fragPrefilter from "../shaders/Bloom/BloomPrefilter.glsl";
import fragUpsample from "../shaders/Bloom/BloomUpsample.glsl";

/**
 * This controls the size of the bloom texture.
 */
export enum BloomDownScaleMode {
  /**
   *  Use this to select half size as the starting resolution.
   */
  Half,
  /**
   *  Use this to select quarter size as the starting resolution.
   */
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

  private _threshold = 0.9;
  private _scatter = 0.7;
  private _intensity = 0;
  private _dirtIntensity = 1;
  private _tint: Color = new Color(1, 1, 1, 1);

  /**
   * Controls whether to use bicubic sampling instead of bilinear sampling for the upSampling passes.
   * @remarks This is slightly more expensive but helps getting smoother visuals.
   */
  highQualityFiltering = false;

  /**
   * Controls the starting resolution that this effect begins processing.
   */
  downScale = BloomDownScaleMode.Half;

  /**
   * Specifies a Texture to add smudges or dust to the bloom effect.
   */
  dirtTexture: Texture2D;

  /**
   * Set the level of brightness to filter out pixels under this level.
   * @remarks This value is expressed in gamma-space.
   */

  get threshold(): number {
    return this._threshold;
  }

  set threshold(value: number) {
    this._threshold = Math.max(0, value);
  }

  /**
   * Controls the radius of the bloom effect.
   */
  get scatter(): number {
    return this._scatter;
  }

  set scatter(value: number) {
    this._scatter = MathUtil.clamp(value, 0, 1);
  }

  /**
   * Controls the strength of the bloom effect.
   */
  get intensity(): number {
    return this._intensity;
  }

  set intensity(value: number) {
    this._intensity = Math.max(0, value);
  }

  /**
   * Controls the strength of the lens dirt.
   */
  get dirtIntensity(): number {
    return this._dirtIntensity;
  }

  set dirtIntensity(value: number) {
    value = Math.max(0, value);
    this._dirtIntensity = value;
  }

  /**
   * Specifies the tint of the bloom effect.
   */
  get tint(): Color {
    return this._tint;
  }

  set tint(value: Color) {
    if (value !== this._tint) {
      this._tint.copyFrom(value);
    }
  }

  /**
   * @inheritdoc
   */
  override lerp(fromEffect: BloomEffect, interpFactor: number): void {
    fromEffect.highQualityFiltering = this.highQualityFiltering;
    fromEffect.downScale = this.downScale;
    fromEffect.threshold = MathUtil.lerp(fromEffect.threshold, this.threshold, interpFactor);
    fromEffect.scatter = MathUtil.lerp(fromEffect.scatter, this.scatter, interpFactor);
    fromEffect.intensity = MathUtil.lerp(fromEffect.intensity, this.intensity, interpFactor);
    Color.lerp(fromEffect.tint, this.tint, interpFactor, fromEffect.tint);

    if (this.dirtTexture) {
      fromEffect.dirtTexture = this.dirtTexture;
      fromEffect.dirtIntensity = MathUtil.lerp(fromEffect.dirtIntensity, this.dirtIntensity, interpFactor);
    }
  }
}

Shader.create(BloomEffect.SHADER_NAME, [
  new ShaderPass("Bloom Prefilter", blitVs, fragPrefilter),
  new ShaderPass("Bloom Blur Horizontal", blitVs, fragBlurH),
  new ShaderPass("Bloom Blur Vertical", blitVs, fragBlurV),
  new ShaderPass("Bloom Upsample", blitVs, fragUpsample)
]);
