import { Matrix, Vector4 } from "@galacean/engine-math";
import type { IHardwareRenderer } from "../../renderingHardwareInterface";
import { TextureFormat } from "../../texture";
import { ScreenSpaceReflection } from "./ScreenSpaceReflection";
import { ScreenSpaceReflectionQuality } from "./ScreenSpaceReflectionQuality";

/** @internal Runtime lifecycle state of the per-camera SSR state machine. */
export enum SSRRuntimeState {
  Disabled = "disabled",
  Skipped = "skipped",
  WarmupColor = "warmup-color",
  FirstTrace = "first-trace",
  ActiveSteady = "active-steady",
  ContextLost = "context-lost"
}

/** @internal Shader pass indices for `ScreenSpaceReflection.shader`. */
export const SSR_PASS_BUILD_HIZ_MIP0 = 0;
/** @internal */
export const SSR_PASS_BUILD_HIZ_MIPN = 1;
/** @internal */
export const SSR_PASS_COPY_TEXTURE = 2;
/** @internal */
export const SSR_PASS_HIZ_TRACE = 3;
/** @internal */
export const SSR_PASS_TEMPORAL_RESOLVE = 4;
/** @internal */
export const SSR_PASS_COLOR_PYRAMID_PREFILTER = 5;
/** @internal */
export const SSR_PASS_COLOR_PYRAMID_DOWNSAMPLE = 6;
/** @internal */
export const SSR_PASS_DOWNSAMPLE_AND_BUILD_HIZ_MIP0 = 7;

/** @internal */
export const SSR_MAX_HIZ_MIP = 6;
/** @internal */
export const SSR_SKIPPED_RELEASE_IDLE_FRAMES = 10;

const MAX_COLOR_PYRAMID_MIP = 5;
const MAX_COLOR_PYRAMID_MIP_FULL = 6;
const MAX_NON_VERY_HIGH_LONG_EDGE = 960;

/**
 * Immutable quality preset parameters indexed by `ScreenSpaceReflectionQuality`.
 * @internal
 */
export interface SSRQualityPreset {
  readonly traceScale: number;
  readonly colorScale: number;
  readonly maxSteps: number;
  readonly useTemporal: boolean;
  readonly useBilateral: boolean;
  readonly useHighVirtual: boolean;
  readonly useLinearTrace: boolean;
  readonly useHighPrecisionFormats: boolean;
  readonly maxColorMipCap: number;
  readonly capLongEdge: boolean;
}

/**
 * Pre-allocated mutable hardware capability & format snapshot written in place by `SSRConfig.checkMRTSupport` and `SSRConfig.detectCapabilities`.
 * @internal
 */
export interface SSRCapabilities {
  depthColorFormat: TextureFormat;
  normalRoughnessFormat: TextureFormat;
  ssrColorFormat: TextureFormat;
  colorPyramidFormat: TextureFormat;
  colorPyramidSRGB: boolean;
  usesPackedDepthRG8: boolean;
  usesPackedNormalOct8: boolean;
  usesPackedHDRReinhard: boolean;
}

/**
 * Pre-allocated mutable per-frame resolved SSR configuration written in place during
 * `onPrepare()`, `onPreForward()`, and `onPostTransparent()`.
 * Shared across internal collaborators to avoid per-frame object allocation and wide parameter lists.
 * @internal
 */
export interface SSRFrameConfig {
  readonly settings: ScreenSpaceReflection;
  readonly invProjMat: Matrix;
  readonly invViewMat: Matrix;
  readonly currentVPMat: Matrix;
  readonly currentViewZRow: Vector4;
  readonly receiverScissor: Vector4;
  preset: SSRQualityPreset;
  traceWidth: number;
  traceHeight: number;
  colorWidth: number;
  colorHeight: number;
  maxHiZMip: number;
  useHardwareStencil: boolean;
  aliasRecvNR: boolean;
  isWarmup: boolean;
  hasVisibleReceiver: boolean;
  forceHiZScratch: boolean;
  forceSoftwareColorPyramidMipmaps: boolean;
  isFullResColorPyramid: boolean;
  opaqueReceiverCount: number;
  transparentReceiverCount: number;
  contribDepthCount: number;
}

const QUALITY_PRESETS: Readonly<Record<ScreenSpaceReflectionQuality, SSRQualityPreset>> = {
  [ScreenSpaceReflectionQuality.Low]: {
    traceScale: 0.25,
    colorScale: 0.5,
    maxSteps: 12,
    useTemporal: false,
    useBilateral: false,
    useHighVirtual: false,
    useLinearTrace: true,
    useHighPrecisionFormats: false,
    maxColorMipCap: MAX_COLOR_PYRAMID_MIP,
    capLongEdge: true
  },
  [ScreenSpaceReflectionQuality.Medium]: {
    traceScale: 0.5,
    colorScale: 0.5,
    maxSteps: 28,
    useTemporal: true,
    useBilateral: false,
    useHighVirtual: false,
    useLinearTrace: true,
    useHighPrecisionFormats: false,
    maxColorMipCap: MAX_COLOR_PYRAMID_MIP,
    capLongEdge: true
  },
  [ScreenSpaceReflectionQuality.High]: {
    traceScale: 0.5,
    colorScale: 0.5,
    maxSteps: 28,
    useTemporal: true,
    useBilateral: true,
    useHighVirtual: true,
    useLinearTrace: false,
    useHighPrecisionFormats: true,
    maxColorMipCap: MAX_COLOR_PYRAMID_MIP,
    capLongEdge: true
  },
  [ScreenSpaceReflectionQuality.VeryHigh]: {
    traceScale: 1.0,
    colorScale: 1.0,
    maxSteps: 64,
    useTemporal: true,
    useBilateral: false,
    useHighVirtual: true,
    useLinearTrace: false,
    useHighPrecisionFormats: true,
    maxColorMipCap: MAX_COLOR_PYRAMID_MIP_FULL,
    capLongEdge: false
  }
};

/**
 * SSR pipeline preset resolution, hardware format capability probing, and per-frame configuration helpers.
 * @internal
 */
export class SSRConfig {
  /**
   * Look up the immutable quality preset table without allocation.
   */
  static getQualityPreset(quality: ScreenSpaceReflectionQuality): SSRQualityPreset {
    return QUALITY_PRESETS[quality] ?? QUALITY_PRESETS[ScreenSpaceReflectionQuality.Medium];
  }

  /**
   * Create a default capability snapshot (called once in `ScreenSpaceReflectionPass` constructor).
   */
  static createDefaultCapabilities(): SSRCapabilities {
    return {
      depthColorFormat: TextureFormat.R16_SFloat,
      normalRoughnessFormat: TextureFormat.R16G16B16A16_SFloat,
      ssrColorFormat: TextureFormat.R16G16B16A16_SFloat,
      colorPyramidFormat: TextureFormat.R11G11B10_UFloat,
      colorPyramidSRGB: false,
      usesPackedDepthRG8: false,
      usesPackedNormalOct8: false,
      usesPackedHDRReinhard: false
    };
  }

  /**
   * Create a default per-frame configuration struct (called once in `ScreenSpaceReflectionPass` constructor).
   */
  static createDefaultFrameConfig(): SSRFrameConfig {
    return {
      settings: new ScreenSpaceReflection(),
      invProjMat: new Matrix(),
      invViewMat: new Matrix(),
      currentVPMat: new Matrix(),
      currentViewZRow: new Vector4(),
      receiverScissor: new Vector4(0, 0, 0, 0),
      preset: QUALITY_PRESETS[ScreenSpaceReflectionQuality.Medium],
      traceWidth: 0,
      traceHeight: 0,
      colorWidth: 0,
      colorHeight: 0,
      maxHiZMip: 0,
      useHardwareStencil: true,
      aliasRecvNR: false,
      isWarmup: true,
      hasVisibleReceiver: false,
      forceHiZScratch: false,
      forceSoftwareColorPyramidMipmaps: false,
      isFullResColorPyramid: false,
      opaqueReceiverCount: 0,
      transparentReceiverCount: 0,
      contribDepthCount: 0
    };
  }

  /**
   * Verify multi-render-target support required by SSR, updating `out` with fallback packed state on failure.
   */
  static checkMRTSupport(rhi: IHardwareRenderer, out: SSRCapabilities): boolean {
    if (rhi.capability.maxDrawBuffers < 2) {
      out.depthColorFormat = TextureFormat.R8G8_UNorm;
      out.normalRoughnessFormat = TextureFormat.R8G8B8A8_UNorm;
      out.ssrColorFormat = TextureFormat.R8G8B8A8_UNorm;
      out.colorPyramidFormat = TextureFormat.R8G8B8A8_UNorm;
      out.colorPyramidSRGB = true;
      out.usesPackedDepthRG8 = true;
      out.usesPackedNormalOct8 = true;
      out.usesPackedHDRReinhard = false;
      return false;
    }

    return true;
  }

  /**
   * Probe RHI render-target format support and write effective SSR precision formats into `out` in place.
   */
  static detectCapabilities(
    rhi: IHardwareRenderer,
    isHDR: boolean,
    useHighPrecisionFormats: boolean,
    forcePackedFormats: boolean,
    out: SSRCapabilities
  ): void {
    if (!SSRConfig.checkMRTSupport(rhi, out)) {
      return;
    }

    if (!forcePackedFormats && rhi.supportsRenderTargetColorFormat(TextureFormat.R16_SFloat)) {
      out.depthColorFormat = TextureFormat.R16_SFloat;
      out.usesPackedDepthRG8 = false;
    } else if (rhi.supportsRenderTargetColorFormat(TextureFormat.R8G8_UNorm)) {
      out.depthColorFormat = TextureFormat.R8G8_UNorm;
      out.usesPackedDepthRG8 = true;
    } else {
      out.depthColorFormat = TextureFormat.R8G8B8A8_UNorm;
      out.usesPackedDepthRG8 = true;
    }

    const supportsRGBA16F = rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16B16A16_SFloat);

    // Low / Medium keep compact 4B/px RGBA8 + Oct8 (plus reversible Reinhard when HDR is enabled, with Medium
    // aliasing recvNR), while High / VeryHigh retain full RGBA16F precision unless forced to packed fallback.
    if (useHighPrecisionFormats && !forcePackedFormats && supportsRGBA16F) {
      out.normalRoughnessFormat = TextureFormat.R16G16B16A16_SFloat;
      out.usesPackedNormalOct8 = false;
    } else {
      out.normalRoughnessFormat = TextureFormat.R8G8B8A8_UNorm;
      out.usesPackedNormalOct8 = true;
    }

    if (isHDR && useHighPrecisionFormats && !forcePackedFormats && supportsRGBA16F) {
      out.ssrColorFormat = TextureFormat.R16G16B16A16_SFloat;
      out.usesPackedHDRReinhard = false;
    } else {
      out.ssrColorFormat = TextureFormat.R8G8B8A8_UNorm;
      out.usesPackedHDRReinhard = isHDR;
    }

    // Prefer 4B/px linear R11G11B10F; allow 8B/px RGBA16F only in HDR/high-precision modes unless forced packed, else 4B/px RGBA8 sRGB.
    if (rhi.supportsRenderTargetColorFormat(TextureFormat.R11G11B10_UFloat)) {
      out.colorPyramidFormat = TextureFormat.R11G11B10_UFloat;
      out.colorPyramidSRGB = false;
    } else if (!forcePackedFormats && (isHDR || useHighPrecisionFormats) && supportsRGBA16F) {
      out.colorPyramidFormat = TextureFormat.R16G16B16A16_SFloat;
      out.colorPyramidSRGB = false;
    } else {
      out.colorPyramidFormat = TextureFormat.R8G8B8A8_UNorm;
      out.colorPyramidSRGB = true;
    }
  }

  /**
   * Populate resolved trace/color dimensions, preset reference, and aliasing flag in `out` in place.
   */
  static applyQualityPreset(
    vpW: number,
    vpH: number,
    preset: SSRQualityPreset,
    caps: SSRCapabilities,
    out: SSRFrameConfig
  ): void {
    let scale = preset.traceScale;
    let colorScale = preset.colorScale;
    if (preset.capLongEdge) {
      // Non-VeryHigh presets cap the long edge at 960px while clamping scale to at least 0.25x on ultra-high-res viewports.
      const maxVpDim = Math.max(vpW, vpH);
      if (maxVpDim > 0) {
        const maxCappedScale = MAX_NON_VERY_HIGH_LONG_EDGE / maxVpDim;
        scale = Math.max(0.25, Math.min(scale, maxCappedScale));
        colorScale = Math.max(0.25, Math.min(colorScale, maxCappedScale));
      }
    }
    out.preset = preset;
    out.traceWidth = Math.max(1, Math.floor(vpW * scale));
    out.traceHeight = Math.max(1, Math.floor(vpH * scale));
    out.colorWidth = Math.max(1, Math.floor(vpW * colorScale));
    out.colorHeight = Math.max(1, Math.floor(vpH * colorScale));
    out.aliasRecvNR =
      preset.useTemporal &&
      !preset.useHighVirtual &&
      !preset.useBilateral &&
      caps.normalRoughnessFormat === caps.ssrColorFormat;
    out.isFullResColorPyramid = colorScale >= 1.0;
  }

  /**
   * Zero per-frame element counts on `frame`.
   */
  static resetFrameCounts(frame: SSRFrameConfig): void {
    frame.opaqueReceiverCount = 0;
    frame.transparentReceiverCount = 0;
    frame.contribDepthCount = 0;
  }
}
