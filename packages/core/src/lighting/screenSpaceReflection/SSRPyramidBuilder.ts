import { Vector4 } from "@galacean/engine-math";
import type { Engine } from "../../Engine";
import { Blitter } from "../../RenderPipeline/Blitter";
import type { CullingResults } from "../../RenderPipeline/CullingResults";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import type { RenderContext } from "../../RenderPipeline/RenderContext";
import type { RenderElement } from "../../RenderPipeline/RenderElement";
import { PipelineStage } from "../../RenderPipeline/enums/PipelineStage";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import type { Material } from "../../material/Material";
import { ShaderMacro, ShaderProperty } from "../../shader";
import { type RenderTarget, type Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import type { SSRDepthOccluderCuller } from "./SSRDepthOccluderCuller";
import type { SSRHistoryState } from "./SSRHistoryState";
import type { SSRResourceManager } from "./SSRResourceManager";
import {
  type SSRCapabilities,
  type SSRFrameConfig,
  SSR_MAX_HIZ_MIP,
  SSR_PASS_BUILD_HIZ_MIP0,
  SSR_PASS_BUILD_HIZ_MIPN,
  SSR_PASS_COLOR_PYRAMID_DOWNSAMPLE,
  SSR_PASS_COLOR_PYRAMID_PREFILTER,
  SSR_PASS_COPY_TEXTURE,
  SSR_PASS_DOWNSAMPLE_AND_BUILD_HIZ_MIP0
} from "./SSRConfig";
import { SSRUtils } from "./SSRUtils";

/**
 * Builds SSR Hi-Z depth pyramids and linear prefiltered color pyramids, unifying
 * mip 0 depth downsampling and scratch-based software mip-chain fallbacks with zero per-frame allocations.
 * @internal
 */
export class SSRPyramidBuilder {
  private static readonly _matContribDepthProp = ShaderProperty.getByName("material_SSRContribDepthTexture");
  private static readonly _matSourceTexelSizeProp = ShaderProperty.getByName("material_SSRSourceTexelSize");
  private static readonly _matDestTexelSizeProp = ShaderProperty.getByName("material_SSRDestTexelSize");

  private static readonly _downsampleFullDepthMacro = ShaderMacro.getByName("SSR_DOWNSAMPLE_FROM_FULL_DEPTH");
  private static readonly _hasContribDepthMacro = ShaderMacro.getByName("SSR_HAS_CONTRIB_DEPTH");
  private static readonly _colorPyramidFullResMacro = ShaderMacro.getByName("SSR_COLOR_PYRAMID_FULL_RES");
  private static readonly _colorPyramidKarisDownsampleMacro = ShaderMacro.getByName(
    "SSR_COLOR_PYRAMID_KARIS_DOWNSAMPLE"
  );

  /** Pre-bound queue filter for transparent depth contributors. */
  static readonly isDepthContributorElement = (element: RenderElement): boolean =>
    element.material.contributeScreenSpaceReflectionDepth;

  // Per-frame pooled transient targets freed in releaseFrameTargets()
  readonly hiZScratchRTs: RenderTarget[] = [];
  readonly colorScratchRTs: RenderTarget[] = [];

  // Pre-allocated scratch vectors reused across pyramid stages
  readonly sourceTexelSize = new Vector4();
  readonly destTexelSize = new Vector4();
  private readonly _sourceScaleOffset = new Vector4(1, 1, 0, 0);
  private readonly _subViewport = new Vector4(0, 0, 1, 1);
  private readonly _copyScaleOffset = new Vector4(1, 1, 0, 0);

  lastMaxColorMip: number = 0;

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
   * Execute Step A–D: fallback DepthOnly (when absent), transparent depth contributors, and Hi-Z mip 0..N.
   * Returns `false` after writing mip 0 when on `WarmupColor` or when all receivers are offscreen.
   */
  prepareDepthAndHiZ(
    context: RenderContext,
    cullingResults: CullingResults,
    fullDepthRT: RenderTarget | null,
    frame: SSRFrameConfig,
    caps: SSRCapabilities,
    occluderCuller: SSRDepthOccluderCuller
  ): boolean {
    const history = this._history;
    const resources = this._resources;
    const { traceWidth: traceW, traceHeight: traceH, isWarmup, hasVisibleReceiver, forceHiZScratch } = frame;
    const fullDepthTex = (fullDepthRT?.depthTexture as Texture2D | null) ?? null;

    // Step A & B: Fallback DepthOnly (when fullDepthRT is absent) and optional transparent depth contributors
    if (!fullDepthTex) {
      this.renderFallbackDepth(context, cullingResults, resources.ssrDepthRT!, occluderCuller);
    }
    const contribRT = this.renderContribDepth(context, cullingResults, traceW, traceH, frame.contribDepthCount);
    const contribDepthTex = (contribRT?.depthTexture as Texture2D | null) ?? null;

    const currHiZIdx = history.hiZPingPongIndex;
    const prevHiZIdx: 0 | 1 = currHiZIdx === 0 ? 1 : 0;
    const currHiZTex = history.hiZTex[currHiZIdx]!;
    const currHiZColorRT = history.hiZColorRT[currHiZIdx]!;

    // Step C: WarmupColor / offscreen-receiver fast path - capture mip 0 directly and skip Hi-Z mip 1..N.
    if (isWarmup || !hasVisibleReceiver) {
      this.buildHiZMip0(null, fullDepthTex, contribDepthTex, currHiZColorRT, resources.ssrDepthTex, false);
      if (contribRT) {
        this.popAndFreeScratch(this.hiZScratchRTs, contribRT);
      }
      history.hasHiZHistory = true;
      history.hiZPingPongIndex = prevHiZIdx;
      return false;
    }

    // Step D: Build persistent Hi-Z Pyramid (Mip 0 only when Linear trace mode is active)
    const maxHiZMip = frame.preset.useLinearTrace ? 0 : SSRUtils.computeMaxMipLevel(traceW, traceH, SSR_MAX_HIZ_MIP);
    frame.maxHiZMip = maxHiZMip;

    if (fullDepthTex) {
      const hiZDepthMip0RT = resources.ensureHiZDepthMip0RT(currHiZIdx, currHiZTex, resources.ssrDepthTex!);
      this.buildHiZMip0(context, fullDepthTex, contribDepthTex, hiZDepthMip0RT, null, true);
    } else {
      this.buildHiZMip0(null, null, contribDepthTex, currHiZColorRT, resources.ssrDepthTex, false);
    }
    if (contribRT) {
      this.popAndFreeScratch(this.hiZScratchRTs, contribRT);
    }
    this.buildHiZMipChain(
      currHiZTex,
      currHiZColorRT,
      traceW,
      traceH,
      maxHiZMip,
      caps.depthColorFormat,
      forceHiZScratch
    );
    return true;
  }

  /**
   * Build trace-resolution Depth24Stencil8 via DepthOnly when no full-resolution depth buffer is available.
   */
  renderFallbackDepth(
    context: RenderContext,
    cullingResults: CullingResults,
    ssrDepthRT: RenderTarget,
    occluderCuller: SSRDepthOccluderCuller
  ): void {
    const engine = this._engine;
    context.setRenderTarget(ssrDepthRT, PipelineUtils.defaultViewport, 0);
    engine._hardwareRenderer.clearRenderTarget(engine, CameraClearFlags.DepthStencil, null);
    occluderCuller.prepare(
      context.camera,
      ssrDepthRT.width,
      ssrDepthRT.height,
      context.viewMatrix,
      context.projectionMatrix
    );
    cullingResults.opaqueQueue.render(
      context,
      PipelineStage.DepthOnly,
      undefined,
      undefined,
      occluderCuller.isOccluderElement
    );
    cullingResults.alphaTestQueue.render(
      context,
      PipelineStage.DepthOnly,
      undefined,
      undefined,
      occluderCuller.isOccluderElement
    );
  }

  /**
   * Render optional transparent depth contributors into a pooled per-frame depth RenderTarget.
   */
  renderContribDepth(
    context: RenderContext,
    cullingResults: CullingResults,
    traceW: number,
    traceH: number,
    contribDepthCount: number
  ): RenderTarget | null {
    if (contribDepthCount <= 0) {
      return null;
    }
    const engine = this._engine;
    const contribRT = engine._renderTargetPool.allocateRenderTarget(
      traceW,
      traceH,
      null,
      TextureFormat.Depth24,
      true,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Point
    );
    contribRT.autoGenerateMipmaps = false;
    this.hiZScratchRTs.push(contribRT);
    context.setRenderTarget(contribRT, PipelineUtils.defaultViewport, 0);
    engine._hardwareRenderer.clearRenderTarget(engine, CameraClearFlags.Depth, null);
    cullingResults.transparentQueue.render(
      context,
      PipelineStage.SSRContributionDepth,
      undefined,
      undefined,
      SSRPyramidBuilder.isDepthContributorElement
    );
    return contribRT;
  }

  /**
   * Build Hi-Z mip 0 from `fullDepthTex` (or fallback trace depth) and optional transparent depth contributors.
   * When `mergedDepthPass` is true, writes downsampled opaque max-depth to the attached Depth24Stencil8
   * buffer simultaneously via `SSR_PASS_DOWNSAMPLE_AND_BUILD_HIZ_MIP0`.
   */
  buildHiZMip0(
    context: RenderContext | null,
    fullDepthTex: Texture2D | null,
    contribDepthTex: Texture2D | null,
    destRT: RenderTarget,
    fallbackOpaqueDepthTex: Texture2D | null,
    mergedDepthPass: boolean
  ): void {
    const engine = this._engine;
    const material = this._material;
    const materialData = material.shaderData;
    const opaqueTex = fullDepthTex ?? fallbackOpaqueDepthTex!;
    const downsampleFull =
      !!fullDepthTex && (fullDepthTex.width !== destRT.width || fullDepthTex.height !== destRT.height);

    try {
      SSRUtils.setMacro(materialData._macroCollection, SSRPyramidBuilder._downsampleFullDepthMacro, downsampleFull);
      SSRUtils.setMacro(materialData._macroCollection, SSRPyramidBuilder._hasContribDepthMacro, !!contribDepthTex);

      if (downsampleFull && fullDepthTex) {
        SSRUtils.setTexelSize(this.sourceTexelSize, fullDepthTex.width, fullDepthTex.height);
        SSRUtils.setTexelSize(this.destTexelSize, destRT.width, destRT.height);
        materialData.setVector4(SSRPyramidBuilder._matSourceTexelSizeProp, this.sourceTexelSize);
        materialData.setVector4(SSRPyramidBuilder._matDestTexelSizeProp, this.destTexelSize);
      }
      if (contribDepthTex) {
        materialData.setTexture(SSRPyramidBuilder._matContribDepthProp, contribDepthTex);
      }

      if (mergedDepthPass) {
        context!.setRenderTarget(destRT, PipelineUtils.defaultViewport, 0);
        // Full-RT non-scissored clear maps to TBDR MTLLoadActionClear (avoids ANGLE-Metal Color invalidate replaceRegion).
        engine._hardwareRenderer.clearRenderTarget(engine, CameraClearFlags.All, SSRUtils.clearZero);
        Blitter.blitTexture(
          engine,
          opaqueTex,
          destRT,
          0,
          PipelineUtils.defaultViewport,
          material,
          SSR_PASS_DOWNSAMPLE_AND_BUILD_HIZ_MIP0,
          undefined,
          0,
          false
        );
      } else {
        Blitter.blitTexture(
          engine,
          opaqueTex,
          destRT,
          0,
          PipelineUtils.defaultViewport,
          material,
          SSR_PASS_BUILD_HIZ_MIP0,
          undefined,
          0,
          true
        );
      }
    } finally {
      materialData.setTexture(SSRPyramidBuilder._matContribDepthProp, null);
      SSRUtils.setMacro(materialData._macroCollection, SSRPyramidBuilder._downsampleFullDepthMacro, false);
      SSRUtils.setMacro(materialData._macroCollection, SSRPyramidBuilder._hasContribDepthMacro, false);
    }
  }

  /**
   * Build Hi-Z mip levels `1..maxHiZMip` using in-place mip-range pinning when supported,
   * falling back to a single pooled mip-1 scratch RenderTarget otherwise.
   */
  buildHiZMipChain(
    currHiZTex: Texture2D,
    currHiZColorRT: RenderTarget,
    traceW: number,
    traceH: number,
    maxHiZMip: number,
    depthColorFormat: TextureFormat,
    forceHiZScratch: boolean
  ): void {
    if (maxHiZMip < 1) {
      return;
    }

    if (!forceHiZScratch && currHiZTex._supportsMipLevelRange()) {
      const engine = this._engine;
      const material = this._material;
      const materialData = material.shaderData;
      try {
        for (let m = 1; m <= maxHiZMip; m++) {
          const srcW = Math.max(1, traceW >> (m - 1));
          const srcH = Math.max(1, traceH >> (m - 1));
          const dstW = Math.max(1, traceW >> m);
          const dstH = Math.max(1, traceH >> m);
          // WebGL2 prohibits sampling a mip level attached to the active FBO;
          // pin sampler range to [m - 1, m - 1] so destMipLevel = m sits outside it.
          currHiZTex._setMipLevelRange(m - 1, m - 1);
          SSRUtils.setTexelSize(this.sourceTexelSize, srcW, srcH);
          SSRUtils.setTexelSize(this.destTexelSize, dstW, dstH);
          materialData.setVector4(SSRPyramidBuilder._matSourceTexelSizeProp, this.sourceTexelSize);
          materialData.setVector4(SSRPyramidBuilder._matDestTexelSizeProp, this.destTexelSize);
          Blitter.blitTexture(
            engine,
            currHiZTex,
            currHiZColorRT,
            0,
            PipelineUtils.defaultViewport,
            material,
            SSR_PASS_BUILD_HIZ_MIPN,
            undefined,
            m,
            true
          );
        }
      } finally {
        currHiZTex._setMipLevelRange(0, 1000);
      }
      return;
    }

    this._buildMipChainWithScratch(
      currHiZTex,
      currHiZColorRT,
      traceW,
      traceH,
      maxHiZMip,
      depthColorFormat,
      false,
      TextureFilterMode.Point,
      SSR_PASS_BUILD_HIZ_MIPN,
      this.hiZScratchRTs,
      true,
      false
    );
  }

  /**
   * Prefilter the resolved frame color into mip 0 of `prevColorPyramidRT`, then generate mips `1..maxColorMip`
   * via hardware `generateMipmaps()` when eligible or via the pooled mip-1 scratch fallback.
   */
  buildColorPyramid(
    srcColorTex: Texture2D,
    caps: SSRCapabilities,
    frame: SSRFrameConfig,
    sourceViewport: Vector4
  ): void {
    const history = this._history;
    const prevColorPyramidRT = history.prevColorPyramidRT!;
    const prevColorPyramidTex = history.prevColorPyramidTex!;
    const {
      preset: { maxColorMipCap },
      colorWidth: colorW,
      colorHeight: colorH,
      isFullResColorPyramid: isFullRes,
      forceSoftwareColorPyramidMipmaps: forceSoftwareMipmaps
    } = frame;
    const { colorPyramidFormat: colorFormat, colorPyramidSRGB: colorSRGB } = caps;
    const engine = this._engine;
    const material = this._material;
    const materialData = material.shaderData;
    const maxColorMip = SSRUtils.computeMaxMipLevel(colorW, colorH, maxColorMipCap);
    this.lastMaxColorMip = maxColorMip;

    // Render mip 0 directly into prevColorPyramidRT mip 0 (zero scratch0 allocation or mip 0 copy)
    try {
      SSRUtils.setMacro(materialData._macroCollection, SSRPyramidBuilder._colorPyramidFullResMacro, isFullRes);
      SSRUtils.setTexelSize(this.destTexelSize, colorW, colorH);
      materialData.setVector4(SSRPyramidBuilder._matDestTexelSizeProp, this.destTexelSize);
      this._sourceScaleOffset.set(sourceViewport.z, sourceViewport.w, sourceViewport.x, sourceViewport.y);
      Blitter.blitTexture(
        engine,
        srcColorTex,
        prevColorPyramidRT,
        0,
        PipelineUtils.defaultViewport,
        material,
        SSR_PASS_COLOR_PYRAMID_PREFILTER,
        this._sourceScaleOffset,
        0,
        true
      );
    } finally {
      SSRUtils.setMacro(materialData._macroCollection, SSRPyramidBuilder._colorPyramidFullResMacro, false);
    }

    if (maxColorMip < 1) {
      return;
    }

    if (this._canUseHardwareColorPyramidMipmaps(prevColorPyramidTex, isFullRes, forceSoftwareMipmaps)) {
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
      SSR_PASS_COLOR_PYRAMID_DOWNSAMPLE,
      this.colorScratchRTs,
      false,
      isFullRes
    );
  }

  /**
   * Blit-copy `source` mip level into `destRT` mip level with optional UV scale/offset and scissor rect.
   */
  copyTextureToRT(
    source: Texture2D,
    destRT: RenderTarget,
    destMipLevel: number,
    srcMipLevel: number = 0,
    scaleOffset?: Vector4,
    scissorRect?: Vector4,
    clearColor: boolean = false
  ): void {
    Blitter.blitTexture(
      this._engine,
      source,
      destRT,
      srcMipLevel,
      PipelineUtils.defaultViewport,
      this._material,
      SSR_PASS_COPY_TEXTURE,
      scaleOffset,
      destMipLevel,
      clearColor && !scissorRect,
      scissorRect
    );
  }

  /**
   * Swap-pop `target` out of `list` without allocating and return it to `RenderTargetPool`.
   */
  popAndFreeScratch(list: RenderTarget[], target: RenderTarget): void {
    const idx = list.indexOf(target);
    if (idx !== -1) {
      const lastIdx = list.length - 1;
      if (idx !== lastIdx) {
        list[idx] = list[lastIdx];
      }
      list.length = lastIdx;
    }
    this._engine._renderTargetPool.freeRenderTarget(target);
  }

  /**
   * Free all per-frame pooled transient targets tracked by the pyramid builder.
   */
  releaseFrameTargets(): void {
    const pool = this._engine._renderTargetPool;
    for (let i = this.hiZScratchRTs.length - 1; i >= 0; i--) {
      pool.freeRenderTarget(this.hiZScratchRTs[i]);
    }
    this.hiZScratchRTs.length = 0;

    for (let i = this.colorScratchRTs.length - 1; i >= 0; i--) {
      pool.freeRenderTarget(this.colorScratchRTs[i]);
    }
    this.colorScratchRTs.length = 0;
  }

  /**
   * Clear temporary shader texture bindings and macros owned by pyramid passes.
   */
  static resetTemporaryBindings(material: Material | null | undefined): void {
    const materialData = material?.shaderData;
    if (!materialData) {
      return;
    }
    const macros = materialData._macroCollection;
    materialData.setTexture(SSRPyramidBuilder._matContribDepthProp, null);
    SSRUtils.setMacro(macros, SSRPyramidBuilder._downsampleFullDepthMacro, false);
    SSRUtils.setMacro(macros, SSRPyramidBuilder._hasContribDepthMacro, false);
    SSRUtils.setMacro(macros, SSRPyramidBuilder._colorPyramidFullResMacro, false);
    SSRUtils.setMacro(macros, SSRPyramidBuilder._colorPyramidKarisDownsampleMacro, false);
  }

  private _buildMipChainWithScratch(
    srcPyramidTex: Texture2D,
    dstPyramidRT: RenderTarget,
    baseW: number,
    baseH: number,
    maxMip: number,
    format: TextureFormat,
    isSRGB: boolean,
    filterMode: TextureFilterMode,
    passIndex: number,
    scratchList: RenderTarget[],
    setDestTexelSize: boolean,
    karisOnMip1: boolean
  ): void {
    const engine = this._engine;
    const material = this._material;
    const materialData = material.shaderData;
    const mip1W = Math.max(1, baseW >> 1);
    const mip1H = Math.max(1, baseH >> 1);
    const scratchRT = engine._renderTargetPool.allocateRenderTarget(
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
    scratchRT.autoGenerateMipmaps = false;
    scratchList.push(scratchRT);
    const scratchTex = scratchRT.getColorTexture(0) as Texture2D;

    try {
      for (let m = 1; m <= maxMip; m++) {
        const srcW = Math.max(1, baseW >> (m - 1));
        const srcH = Math.max(1, baseH >> (m - 1));
        const dstW = Math.max(1, baseW >> m);
        const dstH = Math.max(1, baseH >> m);
        const vpW = dstW === mip1W ? 1 : Math.min(1, (dstW + 0.001) / mip1W);
        const vpH = dstH === mip1H ? 1 : Math.min(1, (dstH + 0.001) / mip1H);
        this._subViewport.set(0, 0, vpW, vpH);

        SSRUtils.setTexelSize(this.sourceTexelSize, srcW, srcH);
        materialData.setVector4(SSRPyramidBuilder._matSourceTexelSizeProp, this.sourceTexelSize);
        if (setDestTexelSize) {
          SSRUtils.setTexelSize(this.destTexelSize, dstW, dstH);
          materialData.setVector4(SSRPyramidBuilder._matDestTexelSizeProp, this.destTexelSize);
        }
        if (karisOnMip1) {
          SSRUtils.setMacro(
            materialData._macroCollection,
            SSRPyramidBuilder._colorPyramidKarisDownsampleMacro,
            m === 1
          );
        }

        Blitter.blitTexture(
          engine,
          srcPyramidTex,
          scratchRT,
          m - 1,
          this._subViewport,
          material,
          passIndex,
          undefined,
          0,
          true
        );

        this._copyScaleOffset.set(dstW / mip1W, dstH / mip1H, 0, 0);
        this.copyTextureToRT(scratchTex, dstPyramidRT, m, 0, this._copyScaleOffset, undefined, true);
      }
    } finally {
      if (karisOnMip1) {
        SSRUtils.setMacro(materialData._macroCollection, SSRPyramidBuilder._colorPyramidKarisDownsampleMacro, false);
      }
    }

    this.popAndFreeScratch(scratchList, scratchRT);
  }

  private _canUseHardwareColorPyramidMipmaps(
    texture: Texture2D,
    isFullRes: boolean,
    forceSoftwareMipmaps: boolean
  ): boolean {
    if (forceSoftwareMipmaps || isFullRes) {
      return false;
    }
    if (!texture._mipmap || (texture.width === 1 && texture.height === 1)) {
      return false;
    }
    return this._engine._hardwareRenderer.supportsGenerateMipmaps(texture.format, texture.isSRGBColorSpace);
  }
}
