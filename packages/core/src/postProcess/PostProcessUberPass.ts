import { Color, MathUtil, Vector4 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Material } from "../material";
import { Blitter } from "../RenderPipeline/Blitter";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { RenderTarget, Texture2D, TextureFilterMode, TextureWrapMode } from "../texture";
import { BloomDownScaleMode, BloomEffect, TonemappingEffect } from "./effects";
import { PostProcessManager } from "./PostProcessManager";
import { PostProcessPass, PostProcessPassEvent } from "./PostProcessPass";

export class PostProcessUberPass extends PostProcessPass {
  static readonly UBER_SHADER_NAME = "PostProcess/Uber";

  private _uberMaterial: Material;

  // Bloom
  private _bloomMaterial: Material;
  private _mipRT: RenderTarget[] = [];

  constructor(engine: Engine) {
    super(engine);
    this.event = PostProcessPassEvent.AfterUber - 1;

    // Uber Material
    const uberMaterial = new Material(engine, Engine._builtinShaders.uber);
    this._uberMaterial = uberMaterial;

    // Bloom Material
    const bloomMaterial = new Material(engine, Engine._builtinShaders.bloom);
    this._bloomMaterial = bloomMaterial;

    // ShaderData initialization
    const bloomShaderData = bloomMaterial.shaderData;
    const uberShaderData = uberMaterial.shaderData;
    bloomShaderData.setVector4(BloomEffect._bloomParams, new Vector4());
    uberShaderData.setVector4(BloomEffect._bloomIntensityParams, new Vector4());
    uberShaderData.setVector4(BloomEffect._dirtTilingOffsetProp, new Vector4());
    uberShaderData.setColor(BloomEffect._tintProp, new Color());
  }

  /** @inheritdoc */
  override isValid(postProcessManager: PostProcessManager): boolean {
    if (!this.isActive) {
      return false;
    }

    const bloomBlend = postProcessManager.getBlendEffect(BloomEffect);
    const tonemappingBlend = postProcessManager.getBlendEffect(TonemappingEffect);
    return bloomBlend?.isValid() || tonemappingBlend?.isValid();
  }

  /**
   * @inheritdoc
   */
  onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {
    const postProcessManager = camera.scene!.postProcessManager;
    const uberShaderData = this._uberMaterial.shaderData;
    const bloomBlend = postProcessManager.getBlendEffect(BloomEffect);
    const tonemappingBlend = postProcessManager.getBlendEffect(TonemappingEffect);

    if (bloomBlend?.isValid()) {
      this._setupBloom(bloomBlend, camera, srcTexture);
      uberShaderData.enableMacro(BloomEffect._enableMacro);
    } else {
      uberShaderData.disableMacro(BloomEffect._enableMacro);
      uberShaderData.setTexture(BloomEffect._bloomTextureProp, null);
      this._releaseBloomRenderTargets();
    }

    if (tonemappingBlend?.isValid()) {
      uberShaderData.enableMacro("TONEMAPPING_MODE", tonemappingBlend.mode.value.toString());
      uberShaderData.enableMacro(TonemappingEffect._enableMacro);
    } else {
      uberShaderData.disableMacro(TonemappingEffect._enableMacro);
    }
    const viewport = destTarget === camera.renderTarget ? camera.viewport : undefined;
    Blitter.blitTexture(camera.engine, srcTexture, destTarget, 0, viewport, this._uberMaterial, undefined);
  }

  /**
   * @internal
   * @inheritdoc
   */
  override _onDestroy() {
    super._onDestroy();
    this._releaseBloomRenderTargets();
    this._uberMaterial.destroy();
    this._bloomMaterial.destroy();
  }

  private _setupBloom(bloomBlend: BloomEffect, camera: Camera, srcTexture: Texture2D) {
    const engine = camera.engine;
    const bloomMaterial = this._bloomMaterial;
    const bloomShaderData = bloomMaterial.shaderData;
    const uberMaterial = this._uberMaterial;
    const uberShaderData = uberMaterial.shaderData;
    const {
      downScale,
      maxIterations,
      threshold,
      scatter,
      intensity,
      tint,
      highQualityFiltering,
      dirtTexture,
      dirtIntensity
    } = bloomBlend;

    // Update shaderData
    const thresholdLinear = threshold.value;
    const thresholdKnee = thresholdLinear * 0.5; // Hardcoded soft knee
    const bloomParams = bloomShaderData.getVector4(BloomEffect._bloomParams);
    const scatterLerp = MathUtil.lerp(0.05, 0.95, scatter.value);
    bloomParams.x = thresholdLinear;
    bloomParams.y = thresholdKnee;
    bloomParams.z = scatterLerp;
    const bloomIntensityParams = uberShaderData.getVector4(BloomEffect._bloomIntensityParams);
    bloomIntensityParams.x = intensity.value;
    bloomIntensityParams.y = dirtIntensity.value;
    const tintParam = uberShaderData.getColor(BloomEffect._tintProp);
    tintParam.copyFrom(tint.value);
    if (highQualityFiltering.value) {
      bloomShaderData.enableMacro(BloomEffect._hqMacro);
      uberShaderData.enableMacro(BloomEffect._hqMacro);
    } else {
      bloomShaderData.disableMacro(BloomEffect._hqMacro);
      uberShaderData.disableMacro(BloomEffect._hqMacro);
    }
    uberShaderData.setTexture(BloomEffect._dirtTextureProp, dirtTexture.value);
    if (dirtTexture.value) {
      uberShaderData.enableMacro(BloomEffect._dirtMacro);
    } else {
      uberShaderData.disableMacro(BloomEffect._dirtMacro);
    }

    // Determine the iteration count
    const downRes = downScale.value === BloomDownScaleMode.Half ? 1 : 2;
    const pixelViewport = camera.pixelViewport;
    const tw = Math.max(1, pixelViewport.width >> downRes);
    const th = Math.max(1, pixelViewport.height >> downRes);
    const maxSize = Math.max(tw, th);
    const iterations = Math.floor(Math.log2(maxSize) - 1);
    const maxMipCount = Math.max(1, Math.round(maxIterations.value) || 6);
    const mipCount = Math.min(Math.max(iterations, 1), maxMipCount);

    // Allocate mip pyramid (single RT per level; upsample blends in-place)
    const internalColorTextureFormat = camera._getInternalColorTextureFormat();
    const isSRGB = !camera._isInternalFormatHDR();
    const mipRT = this._mipRT;
    let mipWidth = tw;
    let mipHeight = th;
    for (let i = 0; i < mipCount; i++) {
      mipRT[i] = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        mipRT[i],
        mipWidth,
        mipHeight,
        internalColorTextureFormat,
        null,
        false,
        false,
        isSRGB,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );
      mipWidth = Math.max(1, mipWidth >> 1);
      mipHeight = Math.max(1, mipHeight >> 1);
    }
    if (mipRT.length > mipCount) {
      this._releaseBloomRenderTargets(mipCount);
    }

    // Prefilter
    Blitter.blitTexture(engine, srcTexture, mipRT[0], undefined, undefined, bloomMaterial, 0);

    // Progressive single-pass 13-tap downsample pyramid (Jimenez, SIGGRAPH 2014)
    for (let i = 1; i < mipCount; i++) {
      Blitter.blitTexture(
        engine,
        <Texture2D>mipRT[i - 1].getColorTexture(0),
        mipRT[i],
        undefined,
        undefined,
        bloomMaterial,
        1
      );
    }

    // Progressive in-place upsample (4-tap 3x3 tent by default, bicubic with HQ filtering)
    for (let i = mipCount - 2; i >= 0; i--) {
      Blitter.blitTexture(
        engine,
        <Texture2D>mipRT[i + 1].getColorTexture(0),
        mipRT[i],
        undefined,
        undefined,
        bloomMaterial,
        2
      );
    }

    // Setup bloom on uber
    if (dirtTexture.value) {
      const dirtTilingOffset = uberShaderData.getVector4(BloomEffect._dirtTilingOffsetProp);
      const dirtRatio = dirtTexture.value.width / dirtTexture.value.height;
      const screenRatio = camera.aspectRatio;
      if (dirtRatio > screenRatio) {
        dirtTilingOffset.set(screenRatio / dirtRatio, 1, (1 - dirtTilingOffset.x) * 0.5, 0);
      } else if (dirtRatio < screenRatio) {
        dirtTilingOffset.set(1, dirtRatio / screenRatio, 0, (1 - dirtTilingOffset.y) * 0.5);
      } else {
        dirtTilingOffset.set(1, 1, 0, 0);
      }
    }
    uberShaderData.setTexture(BloomEffect._bloomTextureProp, mipRT[0].getColorTexture(0));
  }

  private _releaseBloomRenderTargets(fromIndex = 0): void {
    const pool = this.engine._renderTargetPool;
    const mipRT = this._mipRT;
    for (let i = fromIndex, n = mipRT.length; i < n; i++) {
      const rt = mipRT[i];
      if (rt) {
        pool.freeRenderTarget(rt);
      }
    }
    mipRT.length = fromIndex;
  }
}
