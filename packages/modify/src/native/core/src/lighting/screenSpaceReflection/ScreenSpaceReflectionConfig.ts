import type { ScreenSpaceReflectionSettingsData } from "./ScreenSpaceReflectionSettings";
import type { ScreenSpaceReflectionConsumerRequest, ScreenSpaceReflectionTraceSettings } from "./ScreenSpaceReflection";
import { ScreenSpaceReflectionActivationMode } from "./enums/ScreenSpaceReflectionActivationMode";
import { ScreenSpaceReflectionReceiverPolicy } from "./enums/ScreenSpaceReflectionReceiverPolicy";
import { ScreenSpaceReflectionQuality } from "./enums/ScreenSpaceReflectionQuality";
import { ScreenSpaceReflectionUpsamplingMode } from "./enums/ScreenSpaceReflectionUpsamplingMode";
import { ScreenSpaceReflectionReceiverMode } from "./enums/ScreenSpaceReflectionReceiverMode";

/** Which visible surfaces can supply reflection hits. */
export enum ScreenSpaceReflectionContent {
  OpaqueOnly = 0,
  OpaqueAndTransparent = 1
}

export enum ScreenSpaceReflectionSettingsSource {
  UseSceneSettings = 0,
  Override = 1
}
/** Shared defaults and validation; runtime imports never depend on Scene or Camera. */
export class ScreenSpaceReflectionConfig {
  static readonly defaults: Readonly<ScreenSpaceReflectionSettingsData> = Object.freeze({
    activationMode: ScreenSpaceReflectionActivationMode.Auto,
    receiverPolicy: ScreenSpaceReflectionReceiverPolicy.ExplicitOnly,
    reflectionContent: ScreenSpaceReflectionContent.OpaqueOnly,
    resolutionScale: 1,
    upsamplingMode: ScreenSpaceReflectionUpsamplingMode.GaussianBilateral,
    intensity: 1,
    maxRayDistance: 20,
    rayLengthFade: 1,
    maxRaySteps: 32,
    hitRefinementSteps: 3,
    thickness: 0.2,
    maxRoughness: 0.7,
    edgeFade: 0.1
  });
  static readonly presets: readonly Readonly<ScreenSpaceReflectionTraceSettings>[] = [
    Object.freeze({
      quality: ScreenSpaceReflectionQuality.Low,
      resolutionScale: 0.25,
      upsamplingMode: ScreenSpaceReflectionUpsamplingMode.Bilinear,
      maxRayDistance: 20,
      rayLengthFade: ScreenSpaceReflectionConfig.defaults.rayLengthFade,
      maxRaySteps: 16,
      hitRefinementSteps: 2,
      thickness: ScreenSpaceReflectionConfig.defaults.thickness,
      maxRoughness: ScreenSpaceReflectionConfig.defaults.maxRoughness,
      edgeFade: ScreenSpaceReflectionConfig.defaults.edgeFade
    }),
    Object.freeze({
      quality: ScreenSpaceReflectionQuality.Medium,
      resolutionScale: 0.5,
      upsamplingMode: ScreenSpaceReflectionUpsamplingMode.Bilinear,
      maxRayDistance: 30,
      rayLengthFade: ScreenSpaceReflectionConfig.defaults.rayLengthFade,
      maxRaySteps: ScreenSpaceReflectionConfig.defaults.maxRaySteps,
      hitRefinementSteps: ScreenSpaceReflectionConfig.defaults.hitRefinementSteps,
      thickness: ScreenSpaceReflectionConfig.defaults.thickness,
      maxRoughness: ScreenSpaceReflectionConfig.defaults.maxRoughness,
      edgeFade: ScreenSpaceReflectionConfig.defaults.edgeFade
    }),
    Object.freeze({
      quality: ScreenSpaceReflectionQuality.High,
      resolutionScale: 1,
      upsamplingMode: ScreenSpaceReflectionUpsamplingMode.GaussianBilateral,
      maxRayDistance: 30,
      rayLengthFade: ScreenSpaceReflectionConfig.defaults.rayLengthFade,
      maxRaySteps: 64,
      hitRefinementSteps: 5,
      thickness: ScreenSpaceReflectionConfig.defaults.thickness,
      maxRoughness: ScreenSpaceReflectionConfig.defaults.maxRoughness,
      edgeFade: ScreenSpaceReflectionConfig.defaults.edgeFade
    })
  ];

  private static readonly _numericFields = {
    resolutionScale: [0.25, 1, false],
    intensity: [0, 1, false],
    maxRayDistance: [0.0001, Infinity, false],
    rayLengthFade: [0, Infinity, false],
    maxRaySteps: [1, 64, true],
    hitRefinementSteps: [0, 5, true],
    thickness: [0.0001, Infinity, false],
    maxRoughness: [0, 1, false],
    edgeFade: [0, 0.5, false]
  } as const;
  private static readonly _numericKeys = Object.keys(
    ScreenSpaceReflectionConfig._numericFields
  ) as (keyof typeof ScreenSpaceReflectionConfig._numericFields)[];
  private static readonly _qualityTuning = ScreenSpaceReflectionConfig.presets.map(
    ({ maxRaySteps, hitRefinementSteps }) => Object.freeze({ maxRaySteps, hitRefinementSteps })
  );

  static getQualityPreset(quality: ScreenSpaceReflectionQuality): Readonly<ScreenSpaceReflectionTraceSettings> {
    return this.presets[this.sanitizeQuality(quality)];
  }

  static qualityTuning(quality: ScreenSpaceReflectionQuality): {
    readonly maxRaySteps: number;
    readonly hitRefinementSteps: number;
  } {
    return ScreenSpaceReflectionConfig._qualityTuning[ScreenSpaceReflectionConfig.sanitizeQuality(quality)];
  }

  static sanitizeQuality(value: ScreenSpaceReflectionQuality): ScreenSpaceReflectionQuality {
    return value === ScreenSpaceReflectionQuality.Low || value === ScreenSpaceReflectionQuality.High
      ? value
      : ScreenSpaceReflectionQuality.Medium;
  }

  static sanitizeUpsamplingMode(value: ScreenSpaceReflectionUpsamplingMode): ScreenSpaceReflectionUpsamplingMode {
    return value === ScreenSpaceReflectionUpsamplingMode.Bilinear ||
      value === ScreenSpaceReflectionUpsamplingMode.Bilateral
      ? value
      : ScreenSpaceReflectionUpsamplingMode.GaussianBilateral;
  }

  static sanitizeConsumerRequest(
    request?: Readonly<ScreenSpaceReflectionConsumerRequest>
  ): ScreenSpaceReflectionConsumerRequest {
    if (!request) return Object.freeze({});
    const result: {
      -readonly [K in keyof ScreenSpaceReflectionConsumerRequest]?: ScreenSpaceReflectionConsumerRequest[K];
    } = {};
    if (request.priority !== undefined) result.priority = Number.isFinite(request.priority) ? request.priority : 0;
    if (
      request.receiverMode === ScreenSpaceReflectionReceiverMode.OpaqueComposite ||
      request.receiverMode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly
    )
      result.receiverMode = request.receiverMode;
    if (request.quality !== undefined) result.quality = ScreenSpaceReflectionConfig.sanitizeQuality(request.quality);
    if (request.upsamplingMode !== undefined)
      result.upsamplingMode = ScreenSpaceReflectionConfig.sanitizeUpsamplingMode(request.upsamplingMode);
    for (const key of ScreenSpaceReflectionConfig._numericKeys) {
      const value = request[key];
      if (value === undefined) continue;
      const [min, max, integer] = ScreenSpaceReflectionConfig._numericFields[key];
      const bounded = Math.min(
        max,
        Math.max(min, Number.isFinite(value) ? value : ScreenSpaceReflectionConfig.defaults[key])
      );
      result[key] = integer ? Math.round(bounded) : bounded;
    }
    return Object.freeze(result);
  }

  static sanitizeTraceSettingsOverride(
    settings: Readonly<Partial<ScreenSpaceReflectionTraceSettings>>
  ): Readonly<Partial<ScreenSpaceReflectionTraceSettings>> {
    const trace = { ...ScreenSpaceReflectionConfig.sanitizeConsumerRequest(settings) };
    delete trace.priority;
    delete trace.receiverMode;
    delete trace.intensity;
    return Object.freeze(trace);
  }
}
