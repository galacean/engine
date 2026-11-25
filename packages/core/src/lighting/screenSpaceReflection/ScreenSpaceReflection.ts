import { IClone } from "@galacean/engine-design";
import { MathUtil } from "@galacean/engine-math";
import { ScreenSpaceReflectionQuality } from "./ScreenSpaceReflectionQuality";

/**
 * Screen-space reflection settings.
 */
export class ScreenSpaceReflection implements IClone {
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
   * Quality preset controlling trace resolution, tracing mode, ray-marching steps, temporal accumulation, and sampling reconstruction.
   * @defaultValue `ScreenSpaceReflectionQuality.Medium`
   */
  get quality(): ScreenSpaceReflectionQuality {
    return this._quality;
  }

  set quality(value: ScreenSpaceReflectionQuality) {
    if (
      value !== ScreenSpaceReflectionQuality.Low &&
      value !== ScreenSpaceReflectionQuality.Medium &&
      value !== ScreenSpaceReflectionQuality.High &&
      value !== ScreenSpaceReflectionQuality.VeryHigh
    ) {
      return;
    }
    this._quality = value;
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
    if (!Number.isFinite(value)) return;
    this._intensity = Math.max(0, value);
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
    if (!Number.isFinite(value)) return;
    this._maxRoughness = MathUtil.clamp(value, 0, 1);
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
    if (!Number.isFinite(value)) return;
    this._maxDistance = MathUtil.clamp(value, 0.1, 1000);
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
    if (!Number.isFinite(value)) return;
    this._thickness = MathUtil.clamp(value, 0.005, 5);
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
    if (!Number.isFinite(value)) return;
    this._edgeFade = MathUtil.clamp(value, 0, 0.5);
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
    if (!Number.isFinite(value)) return;
    this._temporalBlend = MathUtil.clamp(value, 0, 0.95);
  }

  /**
   * Create a copy of these settings.
   * @returns Cloned settings instance
   */
  clone(): ScreenSpaceReflection {
    const target = new ScreenSpaceReflection();
    this.cloneTo(target);
    return target;
  }

  /**
   * Copy all settings into `target` in place without allocation.
   * @param target - Destination settings instance
   */
  cloneTo(target: ScreenSpaceReflection): void {
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
   * @internal
   */
  _isValid(): boolean {
    return this._enabled && this._intensity > 0 && this._maxRoughness > 0;
  }
}
