import { Color, MathUtil, Vector4 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Material } from "../material";
import { Blitter } from "../RenderPipeline/Blitter";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { Shader } from "../shader";
import { ShaderLib } from "../shaderlib";
import blitVs from "../shaderlib/extra/Blit.vs.glsl";
import { RenderTarget, Texture2D, TextureFilterMode, TextureWrapMode } from "../texture";
import { BloomDownScaleMode, BloomEffect, TonemappingEffect } from "./effects";
import { PostProcessPass, PostProcessPassEvent } from "./PostProcessPass";
import Filtering from "./shaders/Filtering.glsl";
import PostCommon from "./shaders/PostCommon.glsl";
import ACESTonemapping from "./shaders/Tonemapping/ACES/ACESTonemapping.glsl";
import ColorTransform from "./shaders/Tonemapping/ACES/ColorTransform.glsl";
import ODT from "./shaders/Tonemapping/ACES/ODT.glsl";
import RRT from "./shaders/Tonemapping/ACES/RRT.glsl";
import Tonescale from "./shaders/Tonemapping/ACES/Tonescale.glsl";
import NeutralTonemapping from "./shaders/Tonemapping/NeutralTonemapping.glsl";
import UberPost from "./shaders/UberPost.glsl";

export class PostProcessUberPass extends PostProcessPass {
  static readonly UBER_SHADER_NAME = "UberPost";

  private _uberMaterial: Material;

  // Bloom
  private _bloomMaterial: Material;
  private _mipDownRT: RenderTarget[] = [];
  private _mipUpRT: RenderTarget[] = [];

  constructor(engine: Engine) {
    super(engine);
    this.event = PostProcessPassEvent.AfterUber - 1;

    // Uber Material
    const uberMaterial = new Material(engine, Shader.find(PostProcessUberPass.UBER_SHADER_NAME));
    const uberDepthState = uberMaterial.renderState.depthState;
    uberDepthState.enabled = false;
    uberDepthState.writeEnabled = false;
    this._uberMaterial = uberMaterial;

    // Bloom Material
    const bloomMaterial = new Material(engine, Shader.find(BloomEffect.SHADER_NAME));
    const bloomDepthState = bloomMaterial.renderState.depthState;
    bloomDepthState.enabled = false;
    bloomDepthState.writeEnabled = false;
    this._bloomMaterial = bloomMaterial;

    // ShaderData initialization
    const bloomShaderData = bloomMaterial.shaderData;
    const uberShaderData = uberMaterial.shaderData;
    bloomShaderData.setVector4(BloomEffect._bloomParams, new Vector4());
    bloomShaderData.setVector4(BloomEffect._lowMipTexelSizeProp, new Vector4());
    uberShaderData.setVector4(BloomEffect._bloomIntensityParams, new Vector4());
    uberShaderData.setVector4(BloomEffect._dirtTilingOffsetProp, new Vector4());
    uberShaderData.setColor(BloomEffect._tintProp, new Color());
  }

  /**
   * @inheritdoc
   */
  onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {
    const uberShaderData = this._uberMaterial.shaderData;
    const bloomBlend = this.getBlendEffect(BloomEffect);
    const tonemappingBlend = this.getBlendEffect(TonemappingEffect);

    if (bloomBlend) {
      this._setupBloom(bloomBlend, camera, srcTexture);
      uberShaderData.enableMacro(BloomEffect._enableMacro);
    } else {
      uberShaderData.disableMacro(BloomEffect._enableMacro);
      this._releaseBloomRenderTargets();
    }

    if (tonemappingBlend) {
      uberShaderData.enableMacro("TONEMAPPING_MODE", tonemappingBlend.mode.toString());
      uberShaderData.enableMacro(TonemappingEffect._enableMacro);
    } else {
      uberShaderData.disableMacro(TonemappingEffect._enableMacro);
    }

    Blitter.blitTexture(camera.engine, srcTexture, destTarget, 0, camera.viewport, this._uberMaterial, undefined);
  }

  /**
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
    const { downScale, threshold, scatter, intensity, tint, highQualityFiltering, dirtTexture, dirtIntensity } =
      bloomBlend;

    // Update shaderData
    const thresholdLinear = Color.gammaToLinearSpace(threshold);
    const thresholdKnee = thresholdLinear * 0.5; // Hardcoded soft knee
    const bloomParams = bloomShaderData.getVector4(BloomEffect._bloomParams);
    const scatterLerp = MathUtil.lerp(0.05, 0.95, scatter);
    bloomParams.x = threshold;
    bloomParams.y = thresholdKnee;
    bloomParams.z = scatterLerp;
    const bloomIntensityParams = uberShaderData.getVector4(BloomEffect._bloomIntensityParams);
    bloomIntensityParams.x = intensity;
    bloomIntensityParams.y = dirtIntensity;
    const tintParam = uberShaderData.getColor(BloomEffect._tintProp);
    tintParam.copyFrom(tint);
    if (highQualityFiltering) {
      bloomShaderData.enableMacro(BloomEffect._hqMacro);
      uberShaderData.enableMacro(BloomEffect._hqMacro);
    } else {
      bloomShaderData.disableMacro(BloomEffect._hqMacro);
      uberShaderData.disableMacro(BloomEffect._hqMacro);
    }
    uberShaderData.setTexture(BloomEffect._dirtTextureProp, dirtTexture);
    if (dirtTexture) {
      uberShaderData.enableMacro(BloomEffect._dirtMacro);
    } else {
      uberShaderData.disableMacro(BloomEffect._dirtMacro);
    }

    // Determine the iteration count
    const downRes = downScale === BloomDownScaleMode.Half ? 1 : 2;
    const pixelViewport = camera.pixelViewport;
    const tw = pixelViewport.width >> downRes;
    const th = pixelViewport.height >> downRes;
    const maxSize = Math.max(tw, th);
    const iterations = Math.floor(Math.log2(maxSize) - 1);
    const mipCount = Math.min(Math.max(iterations, 1), BloomEffect._maxIterations);

    // Prefilter
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
    Blitter.blitTexture(engine, srcTexture, this._mipDownRT[0], undefined, undefined, bloomMaterial, 0);

    // Down sample - gaussian pyramid
    let lastDown = this._mipDownRT[0];
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
        bloomMaterial,
        1
      );
      Blitter.blitTexture(
        engine,
        <Texture2D>this._mipUpRT[i].getColorTexture(0),
        this._mipDownRT[i],
        undefined,
        undefined,
        bloomMaterial,
        2
      );
      lastDown = this._mipDownRT[i];
    }

    // Up sample (bilinear by default, HQ filtering does bicubic instead
    for (let i = mipCount - 2; i >= 0; i--) {
      const lowMip = i == mipCount - 2 ? this._mipDownRT[i + 1] : this._mipUpRT[i + 1];
      const highMip = this._mipDownRT[i];
      const dst = this._mipUpRT[i];
      bloomShaderData.setTexture(BloomEffect._lowMipTextureProp, lowMip.getColorTexture(0));
      if (highQualityFiltering) {
        const texelSizeLow = bloomShaderData.getVector4(BloomEffect._lowMipTexelSizeProp);
        texelSizeLow.set(1 / lowMip.width, 1 / lowMip.height, lowMip.width, lowMip.height);
      }
      Blitter.blitTexture(engine, <Texture2D>highMip.getColorTexture(0), dst, undefined, undefined, bloomMaterial, 3);
    }

    // Setup bloom on uber
    if (dirtTexture) {
      const dirtTilingOffset = uberShaderData.getVector4(BloomEffect._dirtTilingOffsetProp);
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
    uberShaderData.setTexture(BloomEffect._bloomTextureProp, this._mipUpRT[0].getColorTexture(0));
  }

  private _releaseBloomRenderTargets(): void {
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

Object.assign(ShaderLib, {
  PostCommon,
  Filtering,
  ODT,
  RRT,
  Tonescale,
  ColorTransform,
  NeutralTonemapping,
  ACESTonemapping
});

Shader.create(PostProcessUberPass.UBER_SHADER_NAME, blitVs, UberPost);
