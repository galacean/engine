import { Vector4 } from "@galacean/engine-math";
import type { Engine } from "../../Engine";
import { Blitter } from "../../RenderPipeline/Blitter";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import type { Material } from "../../material/Material";
import { ShaderMacro, ShaderProperty } from "../../shader";
import type { RenderTarget, Texture2D } from "../../texture";
import { TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import type { SSRHistoryState } from "./SSRHistoryState";
import type { SSRResourceManager } from "./SSRResourceManager";
import type { SSRCapabilities, SSRFrameConfig } from "./SSRConfig";
import { SSR_MAX_HIZ_MIP, SSRShaderPass } from "./SSRConfig";

/**
 * Builds SSR Hi-Z depth pyramids and linear prefiltered color pyramids, unifying
 * mip 0 depth downsampling and scratch-based software mip-chain generation with zero per-frame allocations.
 * @internal
 */
export class SSRPyramidBuilder {
  private static readonly _matSourceTexelSizeProp = ShaderProperty.getByName("material_SSRSourceTexelSize");
  private static readonly _matDestTexelSizeProp = ShaderProperty.getByName("material_SSRDestTexelSize");
  private static readonly _downsampleFullDepthMacro = ShaderMacro.getByName("SSR_DOWNSAMPLE_FROM_FULL_DEPTH");
  private static readonly _colorPyramidFullResMacro = ShaderMacro.getByName("SSR_COLOR_PYRAMID_FULL_RES");
  private static readonly _colorPyramidKarisDownsampleMacro = ShaderMacro.getByName(
    "SSR_COLOR_PYRAMID_KARIS_DOWNSAMPLE"
  );

  // Pre-allocated scratch vectors reused across pyramid stages
  private readonly _sourceTexelSize = new Vector4();
  private readonly _destTexelSize = new Vector4();
  private readonly _sourceScaleOffset = new Vector4(1, 1, 0, 0);
  private readonly _subViewport = new Vector4(0, 0, 1, 1);
  private readonly _copyScaleOffset = new Vector4(1, 1, 0, 0);

  private readonly _engine: Engine;
  private readonly _material: Material;
  private readonly _history: SSRHistoryState;
  private readonly _resources: SSRResourceManager;

  constructor(engine: Engine, material: Material, history: SSRHistoryState, resources: SSRResourceManager) {
    this._engine = engine;
    this._material = material;
    this._history = history;
    this._resources = resources;
  }

  /**
   * Build the Hi-Z depth pyramid from the shared prepass depth texture.
   */
  prepareDepthAndHiZ(
    fullDepthTex: Texture2D,
    frame: SSRFrameConfig,
    caps: SSRCapabilities,
    buildHiZMips: boolean
  ): void {
    const history = this._history;
    const resources = this._resources;
    const { traceWidth: traceW, traceHeight: traceH } = frame;
    const currHiZIdx = history.hiZPingPongIndex;
    const currHiZTex = resources.hiZTex[currHiZIdx]!;
    const currHiZColorRT = resources.hiZColorRT[currHiZIdx]!;

    const engine = this._engine;
    const material = this._material;
    const materialData = material.shaderData;
    const macros = materialData._macroCollection;

    const sourceWidth = Math.trunc(fullDepthTex.width);
    const sourceHeight = Math.trunc(fullDepthTex.height);
    if (sourceWidth !== traceW || sourceHeight !== traceH) {
      macros.enable(SSRPyramidBuilder._downsampleFullDepthMacro);
      this._sourceTexelSize.set(1 / sourceWidth, 1 / sourceHeight, sourceWidth, sourceHeight);
      this._destTexelSize.set(1 / traceW, 1 / traceH, traceW, traceH);
      materialData.setVector4(SSRPyramidBuilder._matSourceTexelSizeProp, this._sourceTexelSize);
      materialData.setVector4(SSRPyramidBuilder._matDestTexelSizeProp, this._destTexelSize);
    } else {
      macros.disable(SSRPyramidBuilder._downsampleFullDepthMacro);
    }

    Blitter.blitTexture(
      engine,
      fullDepthTex,
      currHiZColorRT,
      0,
      PipelineUtils.defaultViewport,
      material,
      SSRShaderPass.BuildHiZMip0
    );
    macros.disable(SSRPyramidBuilder._downsampleFullDepthMacro);

    if (!buildHiZMips) {
      return;
    }

    const maxHiZMip = frame.preset.useLinearTrace
      ? 0
      : Math.min(SSR_MAX_HIZ_MIP, Math.floor(Math.log2(Math.min(traceW, traceH))));
    frame.maxHiZMip = maxHiZMip;
    if (maxHiZMip > 0) {
      this._buildMipChainWithScratch(
        currHiZTex,
        currHiZColorRT,
        traceW,
        traceH,
        maxHiZMip,
        caps.depthColorFormat,
        false,
        TextureFilterMode.Point,
        SSRShaderPass.BuildHiZMipN
      );
    }
  }

  /**
   * Capture prefiltered Frame N color into mip 0 of `prevColorPyramidRT`, then generate mips `1..maxColorMip`
   * via hardware `generateMipmaps()` when eligible or via the pooled mip-1 scratch fallback.
   */
  buildColorPyramid(
    srcColorTex: Texture2D,
    caps: SSRCapabilities,
    frame: SSRFrameConfig,
    sourceViewport: Vector4,
    mipLevel: number,
    flipY: boolean
  ): void {
    const resources = this._resources;
    const prevColorPyramidRT = resources.prevColorPyramidRT!;
    const prevColorPyramidTex = resources.prevColorPyramidTex!;
    const {
      preset: { maxColorMipCap },
      colorWidth: colorW,
      colorHeight: colorH,
      isFullResColorPyramid: isFullRes
    } = frame;
    const { colorPyramidFormat: colorFormat, colorPyramidSRGB: colorSRGB } = caps;
    const engine = this._engine;
    const material = this._material;
    const materialData = material.shaderData;
    const macros = materialData._macroCollection;
    const maxColorMip = Math.min(maxColorMipCap, Math.floor(Math.log2(Math.min(colorW, colorH))));
    this._history.maxColorMip = maxColorMip;

    // Render mip 0 directly into prevColorPyramidRT mip 0 (zero scratch0 allocation or mip 0 copy)
    if (isFullRes) {
      macros.enable(SSRPyramidBuilder._colorPyramidFullResMacro);
    } else {
      macros.disable(SSRPyramidBuilder._colorPyramidFullResMacro);
    }
    this._destTexelSize.set(1 / colorW, 1 / colorH, colorW, colorH);
    materialData.setVector4(SSRPyramidBuilder._matDestTexelSizeProp, this._destTexelSize);
    // Match the integer source viewport at the selected mip.
    const rtW = Math.max(1, srcColorTex.width >> mipLevel);
    const rtH = Math.max(1, srcColorTex.height >> mipLevel);
    const px = Math.max(0, Math.trunc(sourceViewport.x * rtW));
    const py = Math.max(
      0,
      flipY ? Math.trunc(sourceViewport.y * rtH) : Math.trunc(rtH - sourceViewport.y * rtH - sourceViewport.w * rtH)
    );
    const pw = Math.max(0, Math.min(rtW - px, Math.trunc(sourceViewport.z * rtW)));
    const ph = Math.max(0, Math.min(rtH - py, Math.trunc(sourceViewport.w * rtH)));
    this._sourceScaleOffset.set(pw / rtW, ph / rtH, px / rtW, py / rtH);
    Blitter.blitTexture(
      engine,
      srcColorTex,
      prevColorPyramidRT,
      mipLevel,
      PipelineUtils.defaultViewport,
      material,
      SSRShaderPass.ColorPyramidPrefilter,
      this._sourceScaleOffset,
      0
    );
    macros.disable(SSRPyramidBuilder._colorPyramidFullResMacro);

    if (maxColorMip <= 0) {
      return;
    }

    // Hardware generateMipmaps covers downsampled tiers when supported; full-res VeryHigh uses Karis software downsample.
    if (!isFullRes && engine._hardwareRenderer.supportsGenerateMipmaps(colorFormat, colorSRGB)) {
      prevColorPyramidTex.generateMipmaps();
      return;
    }

    this._buildMipChainWithScratch(
      prevColorPyramidTex,
      prevColorPyramidRT,
      colorW,
      colorH,
      maxColorMip,
      colorFormat,
      colorSRGB,
      TextureFilterMode.Bilinear,
      SSRShaderPass.ColorPyramidDownsample
    );
  }

  /**
   * Build `1..maxMip` into `destTex` / `destRT` using a single pooled mip-1 scratch RT:
   * render `mip N` into sub-viewport `[0, 0, dstW / mip1W, dstH / mip1H]` and copy that rectangle to `destRT` mip `N`.
   */
  private _buildMipChainWithScratch(
    destTex: Texture2D,
    destRT: RenderTarget,
    baseW: number,
    baseH: number,
    maxMip: number,
    format: TextureFormat,
    isSRGB: boolean,
    filterMode: TextureFilterMode,
    downsamplePass: SSRShaderPass
  ): void {
    const engine = this._engine;
    const pool = engine._renderTargetPool;
    const material = this._material;
    const materialData = material.shaderData;
    const macros = materialData._macroCollection;
    const isHiZ = downsamplePass === SSRShaderPass.BuildHiZMipN;
    const mip1W = Math.max(1, baseW >> 1);
    const mip1H = Math.max(1, baseH >> 1);

    const scratchRT = pool.allocateRenderTarget(
      mip1W,
      mip1H,
      format,
      null,
      false,
      false,
      isSRGB,
      1,
      TextureWrapMode.Clamp,
      filterMode
    );
    const scratchTex = scratchRT.getColorTexture(0) as Texture2D;
    scratchRT.autoGenerateMipmaps = false;

    const prevDestFilter = destTex.filterMode;
    if (isHiZ) {
      destTex.filterMode = filterMode;
    }

    let srcW = baseW;
    let srcH = baseH;
    for (let mip = 1; mip <= maxMip; mip++) {
      const dstW = Math.max(1, baseW >> mip);
      const dstH = Math.max(1, baseH >> mip);
      this._sourceTexelSize.set(1 / srcW, 1 / srcH, srcW, srcH);
      materialData.setVector4(SSRPyramidBuilder._matSourceTexelSizeProp, this._sourceTexelSize);
      if (isHiZ) {
        this._destTexelSize.set(1 / dstW, 1 / dstH, dstW, dstH);
        materialData.setVector4(SSRPyramidBuilder._matDestTexelSizeProp, this._destTexelSize);
      }
      const enableKaris = !isHiZ && mip === 1;
      if (enableKaris) {
        macros.enable(SSRPyramidBuilder._colorPyramidKarisDownsampleMacro);
      }

      const vpW = dstW / mip1W;
      const vpH = dstH / mip1H;
      this._subViewport.set(0, 0, vpW, vpH);
      Blitter.blitTexture(
        engine,
        destTex,
        scratchRT,
        mip - 1,
        this._subViewport,
        material,
        downsamplePass,
        undefined,
        0
      );
      if (enableKaris) {
        macros.disable(SSRPyramidBuilder._colorPyramidKarisDownsampleMacro);
      }

      this._copyScaleOffset.set(vpW, vpH, 0, 0);
      Blitter.blitTexture(
        engine,
        scratchTex,
        destRT,
        0,
        PipelineUtils.defaultViewport,
        material,
        SSRShaderPass.CopyTexture,
        this._copyScaleOffset,
        mip
      );

      srcW = dstW;
      srcH = dstH;
    }

    if (isHiZ) {
      destTex.filterMode = prevDestFilter;
    }
    pool.freeRenderTarget(scratchRT);
  }
}
