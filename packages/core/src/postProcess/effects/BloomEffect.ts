import { Color, MathUtil, Vector4 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { Material } from "../../material";
import { Shader, ShaderMacro, ShaderPass, ShaderProperty } from "../../shader";
import blitVs from "../../shaderlib/extra/Blit.vs.glsl";
import { RenderTarget, Texture2D, TextureFilterMode, TextureWrapMode } from "../../texture";

import { Blitter } from "../../RenderPipeline/Blitter";
import { PostProcess } from "../PostProcess";
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
  private static _hqMacro: ShaderMacro = ShaderMacro.getByName("BLOOM_HQ");
  private static _dirtMacro: ShaderMacro = ShaderMacro.getByName("BLOOM_DIRT");
  private static _bloomParams = ShaderProperty.getByName("material_BloomParams"); // x: threshold (linear), y: threshold knee, z: scatter
  private static _lowMipTextureProp = ShaderProperty.getByName("material_lowMipTexture");
  private static _lowMipTexelSizeProp = ShaderProperty.getByName("material_lowMipTexelSize"); // x: 1/width, y: 1/height, z: width, w: height

  // Uber shader properties
  private static _enableMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_EFFECT_BLOOM");
  private static _bloomTextureProp = ShaderProperty.getByName("material_BloomTexture");
  private static _dirtTextureProp = ShaderProperty.getByName("material_BloomDirtTexture");
  private static _tintProp = ShaderProperty.getByName("material_BloomTint");
  private static _bloomIntensityParams = ShaderProperty.getByName("material_BloomIntensityParams"); // x: bloom intensity, y: dirt intensity
  private static _dirtTilingOffsetProp = ShaderProperty.getByName("material_BloomDirtTilingOffset");

  private _bloomMaterial: Material;
  private _threshold: number;
  private _scatter: number;
  private _highQualityFiltering = false;

  private _mipDownRT: RenderTarget[] = [];
  private _mipUpRT: RenderTarget[] = [];
  private _maxIterations = 6;

  /**
   * Controls the starting resolution that this effect begins processing.
   */
  downScale = BloomDownScaleMode.Half;

  /**
   * Set the level of brightness to filter out pixels under this level.
   * @remarks This value is expressed in gamma-space.
   */

  get threshold(): number {
    return this._threshold;
  }

  set threshold(value: number) {
    value = Math.max(0, value);

    if (value !== this._threshold) {
      this._threshold = value;
      const threshold = Color.gammaToLinearSpace(value);
      const thresholdKnee = threshold * 0.5; // Hardcoded soft knee
      const params = this._bloomMaterial.shaderData.getVector4(BloomEffect._bloomParams);
      params.x = threshold;
      params.y = thresholdKnee;
    }
  }

  /**
   * Controls the radius of the bloom effect.
   */
  get scatter(): number {
    return this._scatter;
  }

  set scatter(value: number) {
    value = MathUtil.clamp(value, 0, 1);

    if (value !== this._scatter) {
      this._scatter = value;
      const params = this._bloomMaterial.shaderData.getVector4(BloomEffect._bloomParams);
      const scatter = MathUtil.lerp(0.05, 0.95, value);
      params.z = scatter;
    }
  }

  /**
   * Controls the strength of the bloom effect.
   */
  get intensity(): number {
    return this.uberMaterial.shaderData.getVector4(BloomEffect._bloomIntensityParams).x;
  }

  set intensity(value: number) {
    value = Math.max(0, value);

    this.uberMaterial.shaderData.getVector4(BloomEffect._bloomIntensityParams).x = value;
  }

  /**
   * Specifies the tint of the bloom effect.
   */
  get tint(): Color {
    return this.uberMaterial.shaderData.getColor(BloomEffect._tintProp);
  }

  set tint(value: Color) {
    const tint = this.uberMaterial.shaderData.getColor(BloomEffect._tintProp);
    if (value !== tint) {
      tint.copyFrom(value);
    }
  }

  /**
   * Controls whether to use bicubic sampling instead of bilinear sampling for the upSampling passes.
   * @remarks This is slightly more expensive but helps getting smoother visuals.
   */

  get highQualityFiltering(): boolean {
    return this._highQualityFiltering;
  }

  set highQualityFiltering(value: boolean) {
    if (value !== this._highQualityFiltering) {
      this._highQualityFiltering = value;
      if (value) {
        this._bloomMaterial.shaderData.enableMacro(BloomEffect._hqMacro);
        this.uberMaterial.shaderData.enableMacro(BloomEffect._hqMacro);
      } else {
        this._bloomMaterial.shaderData.disableMacro(BloomEffect._hqMacro);
        this.uberMaterial.shaderData.disableMacro(BloomEffect._hqMacro);
      }
    }
  }

  /**
   * Specifies a Texture to add smudges or dust to the bloom effect.
   */
  get dirtTexture(): Texture2D {
    return <Texture2D>this.uberMaterial.shaderData.getTexture(BloomEffect._dirtTextureProp);
  }

  set dirtTexture(value: Texture2D) {
    this.uberMaterial.shaderData.setTexture(BloomEffect._dirtTextureProp, value);
    if (value) {
      this.uberMaterial.shaderData.enableMacro(BloomEffect._dirtMacro);
    } else {
      this.uberMaterial.shaderData.disableMacro(BloomEffect._dirtMacro);
    }
  }

  /**
   * Controls the strength of the lens dirt.
   */
  get dirtIntensity(): number {
    return this.uberMaterial.shaderData.getVector4(BloomEffect._bloomIntensityParams).y;
  }

  set dirtIntensity(value: number) {
    value = Math.max(0, value);

    this.uberMaterial.shaderData.getVector4(BloomEffect._bloomIntensityParams).y = value;
  }

  /**
   * Create a BloomEffect.
   * @param postProcess - The post process being used
   */
  constructor(postProcess: PostProcess) {
    super(postProcess);
    const engine = this.uberMaterial.engine;
    const material = new Material(engine, Shader.find(BloomEffect.SHADER_NAME));
    const depthState = material.renderState.depthState;

    depthState.enabled = false;
    depthState.writeEnabled = false;

    const bloomShaderData = material.shaderData;
    const uberShaderData = this.uberMaterial.shaderData;
    bloomShaderData.setVector4(BloomEffect._bloomParams, new Vector4());
    bloomShaderData.setVector4(BloomEffect._lowMipTexelSizeProp, new Vector4());

    uberShaderData.setVector4(BloomEffect._bloomIntensityParams, new Vector4(1, 1, 0, 0));
    uberShaderData.setVector4(BloomEffect._dirtTilingOffsetProp, new Vector4());
    uberShaderData.setColor(BloomEffect._tintProp, new Color(1, 1, 1, 1));

    this._bloomMaterial = material;
    this.threshold = 0.9;
    this.scatter = 0.7;
    this.intensity = 1;
    this.dirtIntensity = 1;
  }

  /**
   *  @inheritdoc
   */
  override onEnable() {
    this.uberMaterial.shaderData.enableMacro(BloomEffect._enableMacro);
  }

  /**
   *  @inheritdoc
   */
  override onDisable(): void {
    this.uberMaterial.shaderData.disableMacro(BloomEffect._enableMacro);
    this._releaseRenderTargets();
  }

  /**
   * @inheritdoc
   */
  override onRender(context: RenderContext, srcTexture: Texture2D): void {
    const camera = context.camera;
    const downRes = this.downScale === BloomDownScaleMode.Half ? 1 : 2;
    const pixelViewport = camera.pixelViewport;
    const tw = pixelViewport.width >> downRes;
    const th = pixelViewport.height >> downRes;

    // Determine the iteration count
    const mipCount = this._calculateMipCount(tw, th);

    // Prefilter
    this._prefilter(camera, srcTexture, tw, th, mipCount);
    // Down sample - gaussian pyramid
    this._downsample(mipCount);
    // Up sample (bilinear by default, HQ filtering does bicubic instead
    this._upsample(mipCount);
    // Setup bloom on uber
    this._setupUber(camera);
  }

  private _calculateMipCount(tw: number, th: number): number {
    const maxSize = Math.max(tw, th);
    const iterations = Math.floor(Math.log2(maxSize) - 1);
    return Math.min(Math.max(iterations, 1), this._maxIterations);
  }

  private _prefilter(camera: Camera, srcTexture: Texture2D, tw: number, th: number, mipCount: number): void {
    const engine = this.uberMaterial.engine;
    const internalColorTextureFormat = camera._getInternalColorTextureFormat();
    let mipWidth = tw,
      mipHeight = th;

    for (let i = 0; i < mipCount; i++) {
      this._mipUpRT[i] = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._mipUpRT[i],
        mipWidth,
        mipHeight,
        internalColorTextureFormat,
        null,
        false,
        false,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );
      this._mipDownRT[i] = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._mipDownRT[i],
        mipWidth,
        mipHeight,
        internalColorTextureFormat,
        null,
        false,
        false,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );

      mipWidth = Math.max(1, Math.floor(mipWidth / 2));
      mipHeight = Math.max(1, Math.floor(mipHeight / 2));
    }

    Blitter.blitTexture(engine, srcTexture, this._mipDownRT[0], undefined, undefined, this._bloomMaterial, 0);
  }

  private _downsample(mipCount: number): void {
    const material = this._bloomMaterial;
    const engine = material.engine;
    let lastDown = this._mipDownRT[0];

    // Down sample - gaussian pyramid
    for (let i = 1; i < mipCount; i++) {
      // Classic two pass gaussian blur - use mipUp as a temporary target
      // First pass does 2x downsampling + 9-tap gaussian
      // Second pass does 9-tap gaussian using a 5-tap filter + bilinear filtering
      Blitter.blitTexture(
        engine,
        <Texture2D>lastDown.getColorTexture(0),
        this._mipUpRT[i],
        undefined,
        undefined,
        material,
        1
      );
      Blitter.blitTexture(
        engine,
        <Texture2D>this._mipUpRT[i].getColorTexture(0),
        this._mipDownRT[i],
        undefined,
        undefined,
        material,
        2
      );

      lastDown = this._mipDownRT[i];
    }
  }

  private _upsample(mipCount: number): void {
    const material = this._bloomMaterial;
    const engine = material.engine;
    const shaderData = material.shaderData;

    // Up sample (bilinear by default, HQ filtering does bicubic instead
    for (let i = mipCount - 2; i >= 0; i--) {
      const lowMip = i == mipCount - 2 ? this._mipDownRT[i + 1] : this._mipUpRT[i + 1];
      const highMip = this._mipDownRT[i];
      const dst = this._mipUpRT[i];

      shaderData.setTexture(BloomEffect._lowMipTextureProp, lowMip.getColorTexture(0));
      if (this.highQualityFiltering) {
        const texelSizeLow = shaderData.getVector4(BloomEffect._lowMipTexelSizeProp);
        texelSizeLow.set(1 / lowMip.width, 1 / lowMip.height, lowMip.width, lowMip.height);
      }

      Blitter.blitTexture(engine, <Texture2D>highMip.getColorTexture(0), dst, undefined, undefined, material, 3);
    }
  }

  private _setupUber(camera: Camera): void {
    const shaderData = this.uberMaterial.shaderData;
    const dirtTexture = this.dirtTexture;

    if (dirtTexture) {
      const dirtTilingOffset = shaderData.getVector4(BloomEffect._dirtTilingOffsetProp);
      const dirtRatio = dirtTexture.width / dirtTexture.height;
      const screenRatio = camera.aspectRatio;
      if (dirtRatio > screenRatio) {
        dirtTilingOffset.set(screenRatio / dirtRatio, 1, (1 - dirtTilingOffset.x) * 0.5, 0);
      } else if (dirtRatio < screenRatio) {
        dirtTilingOffset.set(1, dirtRatio / screenRatio, 0, (1 - dirtTilingOffset.y) * 0.5);
      } else {
        dirtTilingOffset.set(1, 1, 0, 0);
      }
    }

    shaderData.setTexture(BloomEffect._bloomTextureProp, this._mipUpRT[0].getColorTexture(0));
  }

  private _releaseRenderTargets(): void {
    const length = this._mipDownRT.length;

    for (let i = 0; i < length; i++) {
      const downRT = this._mipDownRT[i];
      const upRT = this._mipUpRT[i];

      if (downRT) {
        downRT.getColorTexture(0).destroy(true);
        downRT.destroy(true);
      }

      if (upRT) {
        upRT.getColorTexture(0).destroy(true);
        upRT.destroy(true);
      }
    }

    this._mipDownRT.length = 0;
    this._mipUpRT.length = 0;
  }
}

Shader.create(BloomEffect.SHADER_NAME, [
  new ShaderPass("Bloom Prefilter", blitVs, fragPrefilter),
  new ShaderPass("Bloom Blur Horizontal", blitVs, fragBlurH),
  new ShaderPass("Bloom Blur Vertical", blitVs, fragBlurV),
  new ShaderPass("Bloom Upsample", blitVs, fragUpsample)
]);
