import { IClone } from "@galacean/engine-design";
import { MathUtil } from "@galacean/engine-math";
import { ScreenSpaceReflectionQuality } from "./ScreenSpaceReflectionQuality";

/**
 * Serializable screen-space reflection configuration values.
 */
export interface ScreenSpaceReflectionSettingsData {
  /** Whether screen-space reflection is enabled. */
  enabled: boolean;
  /** Quality preset controlling trace resolution, ray-marching steps, temporal accumulation, and sampling reconstruction. */
  quality: ScreenSpaceReflectionQuality;
  /** Global intensity multiplier. */
  intensity: number;
  /** Maximum material roughness eligible to receive reflections. */
  maxRoughness: number;
  /** Maximum ray-marching distance in world-space units. */
  maxDistance: number;
  /** Minimum depth-intersection thickness in world-space units. */
  thickness: number;
  /** Screen-border confidence fade width in normalized UV units. */
  edgeFade: number;
  /** Maximum temporal history weight when temporal accumulation is enabled. */
  temporalBlend: number;
  /** Whether to use linear ray marching instead of hierarchical Hi-Z tracing. */
  useLinearTrace: boolean;
}

/**
 * Screen-space reflection settings.
 */
export class ScreenSpaceReflectionSettings implements ScreenSpaceReflectionSettingsData, IClone {
  private static readonly _defaults: Readonly<ScreenSpaceReflectionSettingsData> = {
    enabled: false,
    quality: ScreenSpaceReflectionQuality.Medium,
    intensity: 1.0,
    maxRoughness: 0.6,
    maxDistance: 25,
    thickness: 0.15,
    edgeFade: 0.1,
    temporalBlend: 0.85,
    useLinearTrace: false
  };

  /** @internal Normalize a per-camera override value into a `ScreenSpaceReflectionSettings` instance or `null`. */
  static _normalizeOverride(
    value: ScreenSpaceReflectionSettings | Partial<ScreenSpaceReflectionSettingsData> | null
  ): ScreenSpaceReflectionSettings | null {
    if (value == null) {
      return null;
    }
    if (value instanceof ScreenSpaceReflectionSettings) {
      return value;
    }
    if (typeof value === "object") {
      const normalized = new ScreenSpaceReflectionSettings();
      normalized.apply(value);
      return normalized;
    }
    throw new Error(
      "Invalid Camera.screenSpaceReflectionOverride: expected ScreenSpaceReflectionSettings, settings object, or null."
    );
  }

  private _enabled: boolean = ScreenSpaceReflectionSettings._defaults.enabled;
  private _quality: ScreenSpaceReflectionQuality = ScreenSpaceReflectionSettings._defaults.quality;
  private _intensity: number = ScreenSpaceReflectionSettings._defaults.intensity;
  private _maxRoughness: number = ScreenSpaceReflectionSettings._defaults.maxRoughness;
  private _maxDistance: number = ScreenSpaceReflectionSettings._defaults.maxDistance;
  private _thickness: number = ScreenSpaceReflectionSettings._defaults.thickness;
  private _edgeFade: number = ScreenSpaceReflectionSettings._defaults.edgeFade;
  private _temporalBlend: number = ScreenSpaceReflectionSettings._defaults.temporalBlend;
  private _useLinearTrace: boolean = ScreenSpaceReflectionSettings._defaults.useLinearTrace;

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
   * Quality preset controlling trace resolution, ray-marching steps, temporal accumulation, and sampling reconstruction.
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
      value === ScreenSpaceReflectionQuality.VeryHigh
    ) {
      this._quality = value;
    } else {
      this._quality = ScreenSpaceReflectionSettings._defaults.quality;
    }
  }

  /**
   * Global intensity multiplier for screen-space reflections.
   * Valid range: `[0, Infinity)`
   * @remarks Setting this to `0` disables reflections; values greater than `1` boost brightness artistically.
   * @defaultValue `1.0`
   */
  get intensity(): number {
    return this._intensity;
  }

  set intensity(value: number) {
    this._intensity = Number.isFinite(value) ? Math.max(0, value) : ScreenSpaceReflectionSettings._defaults.intensity;
  }

  /**
   * Maximum material roughness eligible to receive screen-space reflections.
   * Valid range: `[0, 1]`
   * @remarks Surfaces at or above this roughness receive no reflections; setting this to `0` disables reflections.
   * @defaultValue `0.6`
   */
  get maxRoughness(): number {
    return this._maxRoughness;
  }

  set maxRoughness(value: number) {
    this._maxRoughness = Number.isFinite(value)
      ? MathUtil.clamp(value, 0, 1)
      : ScreenSpaceReflectionSettings._defaults.maxRoughness;
  }

  /**
   * Maximum ray-marching distance in world-space units.
   * Valid range: `[0.1, 1000]`
   * @remarks Effectively clamped to the camera's far clip plane at runtime.
   * @defaultValue `25`
   */
  get maxDistance(): number {
    return this._maxDistance;
  }

  set maxDistance(value: number) {
    this._maxDistance = Number.isFinite(value)
      ? MathUtil.clamp(value, 0.1, 1000)
      : ScreenSpaceReflectionSettings._defaults.maxDistance;
  }

  /**
   * Minimum depth-intersection thickness in world-space units.
   * Valid range: `[0.005, 5]`
   * @remarks Smaller values reduce bleeding behind foreground objects but may miss thin geometry.
   * @defaultValue `0.15`
   */
  get thickness(): number {
    return this._thickness;
  }

  set thickness(value: number) {
    this._thickness = Number.isFinite(value)
      ? MathUtil.clamp(value, 0.005, 5)
      : ScreenSpaceReflectionSettings._defaults.thickness;
  }

  /**
   * Screen-border confidence fade width in normalized UV units.
   * Valid range: `[0, 0.5]`
   * @remarks Value `0` disables screen-border fade.
   * @defaultValue `0.1`
   */
  get edgeFade(): number {
    return this._edgeFade;
  }

  set edgeFade(value: number) {
    this._edgeFade = Number.isFinite(value)
      ? MathUtil.clamp(value, 0, 0.5)
      : ScreenSpaceReflectionSettings._defaults.edgeFade;
  }

  /**
   * Maximum temporal history weight when temporal accumulation is enabled (`Medium`, `High`, and `VeryHigh` presets).
   * Valid range: `[0, 0.95]`
   * @remarks Higher values improve stability with slower response to motion; ignored on `Low`.
   * @defaultValue `0.85`
   */
  get temporalBlend(): number {
    return this._temporalBlend;
  }

  set temporalBlend(value: number) {
    this._temporalBlend = Number.isFinite(value)
      ? MathUtil.clamp(value, 0, 0.95)
      : ScreenSpaceReflectionSettings._defaults.temporalBlend;
  }

  /**
   * Whether to use linear ray marching instead of hierarchical Hi-Z tracing.
   * @remarks Reduces per-frame depth-pyramid overhead on mobile GPUs, potentially trading off long-range hit coverage.
   * @defaultValue `false`
   */
  get useLinearTrace(): boolean {
    return this._useLinearTrace;
  }

  set useLinearTrace(value: boolean) {
    this._useLinearTrace = !!value;
  }

  /**
   * Apply partial serialized settings in place without allocation.
   * @remarks Fields with `null` or `undefined` values are ignored.
   * @param data - Partial settings object
   */
  apply(data?: Partial<ScreenSpaceReflectionSettingsData> | null): void {
    if (!data) return;
    if (data.enabled != null) this.enabled = data.enabled;
    if (data.quality != null) this.quality = data.quality;
    if (data.intensity != null) this.intensity = data.intensity;
    if (data.maxRoughness != null) this.maxRoughness = data.maxRoughness;
    if (data.maxDistance != null) this.maxDistance = data.maxDistance;
    if (data.thickness != null) this.thickness = data.thickness;
    if (data.edgeFade != null) this.edgeFade = data.edgeFade;
    if (data.temporalBlend != null) this.temporalBlend = data.temporalBlend;
    if (data.useLinearTrace != null) this.useLinearTrace = data.useLinearTrace;
  }

  /**
   * Reset all settings to their default values in place without allocation.
   */
  reset(): void {
    const defaults = ScreenSpaceReflectionSettings._defaults;
    this._enabled = defaults.enabled;
    this._quality = defaults.quality;
    this._intensity = defaults.intensity;
    this._maxRoughness = defaults.maxRoughness;
    this._maxDistance = defaults.maxDistance;
    this._thickness = defaults.thickness;
    this._edgeFade = defaults.edgeFade;
    this._temporalBlend = defaults.temporalBlend;
    this._useLinearTrace = defaults.useLinearTrace;
  }

  /**
   * Create a copy of these settings.
   * @returns Cloned settings instance
   */
  clone(): ScreenSpaceReflectionSettings {
    const target = new ScreenSpaceReflectionSettings();
    this.cloneTo(target);
    return target;
  }

  /**
   * Copy all settings into `target` in place without allocation.
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
    target._useLinearTrace = this._useLinearTrace;
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
      temporalBlend: this._temporalBlend,
      useLinearTrace: this._useLinearTrace
    };
  }

  /**
   * @internal
   */
  _isValid(): boolean {
    return this._enabled && this._intensity > 0 && this._maxRoughness > 0;
  }
}
