import { Color, Matrix, Vector4 } from "@galacean/engine-math";
import { DepthPrepass } from "../../RenderPipeline/DepthPrepass";
import type { IHardwareRenderer } from "../../renderingHardwareInterface";
import { TextureFormat } from "../../texture";
import type { ScreenSpaceReflection } from "./ScreenSpaceReflection";
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

/** @internal Pass order in ScreenSpaceReflection.shader. */
export enum SSRShaderPass {
  BuildHiZMip0,
  BuildHiZMipN,
  CopyTexture,
  HiZTrace,
  TemporalResolve,
  ColorPyramidPrefilter,
  ColorPyramidDownsample
}

/** @internal */
export const SSR_MAX_HIZ_MIP = 6;
export const SSR_CLEAR_ZERO = new Color(0, 0, 0, 0);

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

/** GPU formats and encodings selected for this camera. @internal */
export class SSRCapabilities {
  depthColorFormat: TextureFormat = TextureFormat.R16_SFloat;
  normalRoughnessFormat: TextureFormat = TextureFormat.R16G16B16A16_SFloat;
  ssrColorFormat: TextureFormat = TextureFormat.R16G16B16A16_SFloat;
  colorPyramidFormat: TextureFormat = TextureFormat.R11G11B10_UFloat;
  colorPyramidSRGB: boolean = false;
  usesPackedDepthRG8: boolean = false;
  usesPackedNormalOct8: boolean = false;
  usesPackedHDRReinhard: boolean = false;
}

/** Settings, transforms and target sizes shared by the SSR stages of one camera. @internal */
export class SSRFrameConfig {
  settings!: ScreenSpaceReflection;
  readonly invProjMat = new Matrix();
  readonly invViewMat = new Matrix();
  readonly currentVPMat = new Matrix();
  readonly currentViewZRow = new Vector4();
  preset: SSRQualityPreset = QUALITY_PRESETS[ScreenSpaceReflectionQuality.Medium];
  traceWidth: number = 0;
  traceHeight: number = 0;
  colorWidth: number = 0;
  colorHeight: number = 0;
  maxHiZMip: number = 0;
  useHighVirtual: boolean = false;
  isFullResColorPyramid: boolean = false;
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
   * Probe RHI render-target format support and write effective SSR precision formats into `out` in place.
   */
  static detectCapabilities(
    rhi: IHardwareRenderer,
    isHDR: boolean,
    useHighPrecisionFormats: boolean,
    out: SSRCapabilities
  ): void {
    out.usesPackedDepthRG8 = !rhi.supportsRenderTargetColorFormat(TextureFormat.R16_SFloat);
    out.depthColorFormat = !out.usesPackedDepthRG8
      ? TextureFormat.R16_SFloat
      : rhi.supportsRenderTargetColorFormat(TextureFormat.R8G8_UNorm)
        ? TextureFormat.R8G8_UNorm
        : TextureFormat.R8G8B8A8_UNorm;

    const normalRoughnessFormat = DepthPrepass.resolveNormalRoughnessFormat(rhi, useHighPrecisionFormats);
    const useFloatNormal = normalRoughnessFormat === TextureFormat.R16G16B16A16_SFloat;
    const supportsRGBA16F = useFloatNormal || rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16B16A16_SFloat);
    const useFloatColor = isHDR && useFloatNormal;
    out.normalRoughnessFormat = normalRoughnessFormat;
    out.usesPackedNormalOct8 = !useFloatNormal;
    out.ssrColorFormat = useFloatColor ? TextureFormat.R16G16B16A16_SFloat : TextureFormat.R8G8B8A8_UNorm;
    out.usesPackedHDRReinhard = isHDR && !useFloatColor;

    // Prefer compact linear color history when the hardware supports it.
    if (rhi.supportsRenderTargetColorFormat(TextureFormat.R11G11B10_UFloat)) {
      out.colorPyramidFormat = TextureFormat.R11G11B10_UFloat;
      out.colorPyramidSRGB = false;
    } else if ((isHDR || useHighPrecisionFormats) && supportsRGBA16F) {
      out.colorPyramidFormat = TextureFormat.R16G16B16A16_SFloat;
      out.colorPyramidSRGB = false;
    } else {
      out.colorPyramidFormat = TextureFormat.R8G8B8A8_UNorm;
      out.colorPyramidSRGB = true;
    }
  }

  /**
   * Populate resolved trace/color dimensions and preset reference in `frame` in place.
   */
  static applyQualityPreset(vpW: number, vpH: number, maxDrawBuffers: number, frame: SSRFrameConfig): void {
    const preset = QUALITY_PRESETS[frame.settings.quality];
    let scale = preset.traceScale;
    let colorScale = preset.colorScale;
    if (preset.capLongEdge) {
      // Non-VeryHigh presets cap the long edge at 960px while clamping scale to at least 0.25x on ultra-high-res viewports.
      const maxCappedScale = MAX_NON_VERY_HIGH_LONG_EDGE / Math.max(vpW, vpH);
      scale = Math.max(0.25, Math.min(scale, maxCappedScale));
      colorScale = Math.max(0.25, Math.min(colorScale, maxCappedScale));
    }
    frame.preset = preset;
    frame.traceWidth = Math.max(1, Math.floor(vpW * scale));
    frame.traceHeight = Math.max(1, Math.floor(vpH * scale));
    frame.colorWidth = Math.max(1, Math.floor(vpW * colorScale));
    frame.colorHeight = Math.max(1, Math.floor(vpH * colorScale));
    frame.useHighVirtual = preset.useHighVirtual && preset.useTemporal && maxDrawBuffers >= 2;
    frame.isFullResColorPyramid = colorScale >= 1.0;
  }
}
