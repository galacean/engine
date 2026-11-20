import { MathUtil } from "@galacean/engine-math";
import { ScreenSpaceReflectionQuality } from "./ScreenSpaceReflectionQuality";

/**
 * Serializable screen-space reflection configuration values.
 */
export interface ScreenSpaceReflectionSettingsData {
  enabled: boolean;
  quality: ScreenSpaceReflectionQuality;
  intensity: number;
  maxRoughness: number;
  maxDistance: number;
  thickness: number;
  edgeFade: number;
  temporalBlend: number;
}

/**
 * Screen-space reflection settings.
 */
export class ScreenSpaceReflectionSettings implements ScreenSpaceReflectionSettingsData {
  private _enabled: boolean = false;
  private _quality: ScreenSpaceReflectionQuality = ScreenSpaceReflectionQuality.Medium;
  private _intensity: number = 1.0;
  private _maxRoughness: number = 0.6;
  private _maxDistance: number = 25;
  private _thickness: number = 0.15;
  private _edgeFade: number = 0.1;
  private _temporalBlend: number = 0.85;

  /**
   * Whether screen-space reflection is enabled.
   * @defaultValue `false`
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = !!value;
  }

  /**
   * Quality preset controlling trace resolution, Hi-Z steps, temporal stability, and bilateral reconstruction.
   * @defaultValue `ScreenSpaceReflectionQuality.Medium`
   */
  get quality(): ScreenSpaceReflectionQuality {
    return this._quality;
  }

  set quality(value: ScreenSpaceReflectionQuality) {
    if (
      value === ScreenSpaceReflectionQuality.Low ||
      value === ScreenSpaceReflectionQuality.Medium ||
      value === ScreenSpaceReflectionQuality.High ||
      value === ScreenSpaceReflectionQuality.XHigh
    ) {
      this._quality = value;
    } else {
      this._quality = ScreenSpaceReflectionQuality.Medium;
    }
  }

  /**
   * Global intensity multiplier for screen-space reflections.
   * Valid range: `[0, Infinity)`
   * @defaultValue `1.0`
   */
  get intensity(): number {
    return this._intensity;
  }

  set intensity(value: number) {
    this._intensity = Number.isFinite(value) ? Math.max(0, value) : 1.0;
  }

  /**
   * Maximum material roughness eligible to receive screen-space reflections.
   * Valid range: `[0, 1]`
   * @defaultValue `0.6`
   */
  get maxRoughness(): number {
    return this._maxRoughness;
  }

  set maxRoughness(value: number) {
    this._maxRoughness = Number.isFinite(value) ? MathUtil.clamp(value, 0, 1) : 0.6;
  }

  /**
   * Maximum ray-marching distance in world-space units.
   * Valid range: `[0.1, 1000]`
   * @defaultValue `25`
   */
  get maxDistance(): number {
    return this._maxDistance;
  }

  set maxDistance(value: number) {
    this._maxDistance = Number.isFinite(value) ? MathUtil.clamp(value, 0.1, 1000) : 25;
  }

  /**
   * Depth intersection thickness floor in world-space units.
   * Valid range: `[0.005, 5]`
   * @defaultValue `0.15`
   */
  get thickness(): number {
    return this._thickness;
  }

  set thickness(value: number) {
    this._thickness = Number.isFinite(value) ? MathUtil.clamp(value, 0.005, 5) : 0.15;
  }

  /**
   * Screen-border confidence fade width in normalized UV units.
   * Valid range: `[0, 0.5]`
   * @defaultValue `0.1`
   */
  get edgeFade(): number {
    return this._edgeFade;
  }

  set edgeFade(value: number) {
    this._edgeFade = Number.isFinite(value) ? MathUtil.clamp(value, 0, 0.5) : 0.1;
  }

  /**
   * Maximum temporal history weight used by Medium and High quality presets.
   * Valid range: `[0, 0.95]`
   * @defaultValue `0.85`
   */
  get temporalBlend(): number {
    return this._temporalBlend;
  }

  set temporalBlend(value: number) {
    this._temporalBlend = Number.isFinite(value) ? MathUtil.clamp(value, 0, 0.95) : 0.85;
  }

  /**
   * Apply partial serialized settings in place without allocation.
   * @param data - Partial settings object
   */
  apply(data?: Partial<ScreenSpaceReflectionSettingsData> | null): void {
    if (!data) return;
    if (data.enabled !== undefined) this.enabled = data.enabled;
    if (data.quality !== undefined) this.quality = data.quality;
    if (data.intensity !== undefined) this.intensity = data.intensity;
    if (data.maxRoughness !== undefined) this.maxRoughness = data.maxRoughness;
    if (data.maxDistance !== undefined) this.maxDistance = data.maxDistance;
    if (data.thickness !== undefined) this.thickness = data.thickness;
    if (data.edgeFade !== undefined) this.edgeFade = data.edgeFade;
    if (data.temporalBlend !== undefined) this.temporalBlend = data.temporalBlend;
  }

  /**
   * Copy all settings into `target` in place.
   * @param target - Destination settings instance
   */
  cloneTo(target: ScreenSpaceReflectionSettings): void {
    target._enabled = this._enabled;
    target._quality = this._quality;
    target._intensity = this._intensity;
    target._maxRoughness = this._maxRoughness;
    target._maxDistance = this._maxDistance;
    target._thickness = this._thickness;
    target._edgeFade = this._edgeFade;
    target._temporalBlend = this._temporalBlend;
  }

  /**
   * Serialize settings into a plain JSON object.
   */
  toJSON(): ScreenSpaceReflectionSettingsData {
    return {
      enabled: this._enabled,
      quality: this._quality,
      intensity: this._intensity,
      maxRoughness: this._maxRoughness,
      maxDistance: this._maxDistance,
      thickness: this._thickness,
      edgeFade: this._edgeFade,
      temporalBlend: this._temporalBlend
    };
  }

  /**
   * @internal
   */
  _isValid(): boolean {
    return this._enabled && this._intensity > 0 && this._maxRoughness > 0;
  }
}
