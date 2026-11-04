import { ScreenSpaceReflection } from "./ScreenSpaceReflection";
import { ScreenSpaceReflectionActivationMode } from "./enums/ScreenSpaceReflectionActivationMode";
import { ScreenSpaceReflectionReceiverPolicy } from "./enums/ScreenSpaceReflectionReceiverPolicy";
import { ScreenSpaceReflectionQuality } from "./enums/ScreenSpaceReflectionQuality";
import { ScreenSpaceReflectionUpsamplingMode } from "./enums/ScreenSpaceReflectionUpsamplingMode";

export enum ScreenSpaceReflectionSettingsSource {
  UseSceneSettings = 0,
  Override = 1
}
/** Serializable author values only. No leases, textures, diagnostics or quality label. */
export interface ScreenSpaceReflectionSettingsData {
  activationMode: ScreenSpaceReflectionActivationMode;
  receiverPolicy: ScreenSpaceReflectionReceiverPolicy;
  resolutionScale: number;
  upsamplingMode: ScreenSpaceReflectionUpsamplingMode;
  intensity: number;
  maxRayDistance: number;
  rayLengthFade: number;
  maxRaySteps: number;
  hitRefinementSteps: number;
  thickness: number;
  maxRoughness: number;
  edgeFade: number;
}
/** Scene author settings. Runtime construction preserves the legacy receiver policy and trace budget. */
export class ScreenSpaceReflectionSettings implements ScreenSpaceReflectionSettingsData {
  /** @internal Scene changes are consumed once at camera render preparation. */
  _version = 0;
  private _data: ScreenSpaceReflectionSettingsData = {
    ...ScreenSpaceReflectionSettings.performancePreset(ScreenSpaceReflectionQuality.Medium),
    activationMode: ScreenSpaceReflectionActivationMode.Auto,
    receiverPolicy: ScreenSpaceReflectionReceiverPolicy.ExplicitOnly,
    resolutionScale: 1,
    upsamplingMode: ScreenSpaceReflectionUpsamplingMode.GaussianBilateral,
    maxRayDistance: 20,
    intensity: 1,
    rayLengthFade: ScreenSpaceReflection.getQualityPreset(ScreenSpaceReflectionQuality.Medium).rayLengthFade,
    maxRoughness: ScreenSpaceReflection.getQualityPreset(ScreenSpaceReflectionQuality.Medium).maxRoughness,
    edgeFade: ScreenSpaceReflection.getQualityPreset(ScreenSpaceReflectionQuality.Medium).edgeFade
  };
  /** Shared whitelist and validation for partial author parameters. */
  static normalize(data: Partial<ScreenSpaceReflectionSettingsData>): Partial<ScreenSpaceReflectionSettingsData> {
    const values = { ...ScreenSpaceReflection._sanitizeConsumerRequest(data) };
    delete values.priority;
    delete values.receiverMode;
    delete values.quality;
    const result: Partial<ScreenSpaceReflectionSettingsData> = values;
    if (data.activationMode !== undefined)
      result.activationMode =
        data.activationMode === ScreenSpaceReflectionActivationMode.ForceOn ||
        data.activationMode === ScreenSpaceReflectionActivationMode.ForceOff
          ? data.activationMode
          : ScreenSpaceReflectionActivationMode.Auto;
    if (data.receiverPolicy !== undefined)
      result.receiverPolicy =
        data.receiverPolicy === ScreenSpaceReflectionReceiverPolicy.StandardPbrAuto
          ? data.receiverPolicy
          : ScreenSpaceReflectionReceiverPolicy.ExplicitOnly;
    return result;
  }
  static performancePreset(
    quality: ScreenSpaceReflectionQuality
  ): Pick<
    ScreenSpaceReflectionSettingsData,
    "resolutionScale" | "upsamplingMode" | "maxRaySteps" | "thickness" | "maxRayDistance" | "hitRefinementSteps"
  > {
    const { resolutionScale, upsamplingMode, maxRaySteps, thickness, maxRayDistance, hitRefinementSteps } =
      ScreenSpaceReflection.getQualityPreset(quality);
    return { resolutionScale, upsamplingMode, maxRaySteps, thickness, maxRayDistance, hitRefinementSteps };
  }
  apply(data: Partial<ScreenSpaceReflectionSettingsData>): void {
    Object.assign(this._data, ScreenSpaceReflectionSettings.normalize(data));
    this._version++;
  }
  toJSON(): ScreenSpaceReflectionSettingsData {
    return { ...this._data };
  }
  applyPerformancePreset(quality: ScreenSpaceReflectionQuality): void {
    this.apply(ScreenSpaceReflectionSettings.performancePreset(quality));
  }
  get activationMode() {
    return this._data.activationMode;
  }
  set activationMode(value: ScreenSpaceReflectionSettingsData["activationMode"]) {
    this.apply({ activationMode: value });
  }
  get receiverPolicy() {
    return this._data.receiverPolicy;
  }
  set receiverPolicy(value: ScreenSpaceReflectionSettingsData["receiverPolicy"]) {
    this.apply({ receiverPolicy: value });
  }
  get resolutionScale() {
    return this._data.resolutionScale;
  }
  set resolutionScale(value: ScreenSpaceReflectionSettingsData["resolutionScale"]) {
    this.apply({ resolutionScale: value });
  }
  get upsamplingMode() {
    return this._data.upsamplingMode;
  }
  set upsamplingMode(value: ScreenSpaceReflectionSettingsData["upsamplingMode"]) {
    this.apply({ upsamplingMode: value });
  }
  get intensity() {
    return this._data.intensity;
  }
  set intensity(value: ScreenSpaceReflectionSettingsData["intensity"]) {
    this.apply({ intensity: value });
  }
  get maxRayDistance() {
    return this._data.maxRayDistance;
  }
  set maxRayDistance(value: ScreenSpaceReflectionSettingsData["maxRayDistance"]) {
    this.apply({ maxRayDistance: value });
  }
  get rayLengthFade() {
    return this._data.rayLengthFade;
  }
  set rayLengthFade(value: ScreenSpaceReflectionSettingsData["rayLengthFade"]) {
    this.apply({ rayLengthFade: value });
  }
  get maxRaySteps() {
    return this._data.maxRaySteps;
  }
  set maxRaySteps(value: ScreenSpaceReflectionSettingsData["maxRaySteps"]) {
    this.apply({ maxRaySteps: value });
  }
  get hitRefinementSteps() {
    return this._data.hitRefinementSteps;
  }
  set hitRefinementSteps(value: ScreenSpaceReflectionSettingsData["hitRefinementSteps"]) {
    this.apply({ hitRefinementSteps: value });
  }
  get thickness() {
    return this._data.thickness;
  }
  set thickness(value: ScreenSpaceReflectionSettingsData["thickness"]) {
    this.apply({ thickness: value });
  }
  get maxRoughness() {
    return this._data.maxRoughness;
  }
  set maxRoughness(value: ScreenSpaceReflectionSettingsData["maxRoughness"]) {
    this.apply({ maxRoughness: value });
  }
  get edgeFade() {
    return this._data.edgeFade;
  }
  set edgeFade(value: ScreenSpaceReflectionSettingsData["edgeFade"]) {
    this.apply({ edgeFade: value });
  }
}
