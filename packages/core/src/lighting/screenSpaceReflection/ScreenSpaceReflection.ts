import { MathUtil } from "@galacean/engine-math";
import { ScreenSpaceReflectionQuality } from "./ScreenSpaceReflectionQuality";

/**
 * Screen-space reflection settings.
 */
export class ScreenSpaceReflection {
  /**
   * Whether screen-space reflection is enabled.
   * @defaultValue `false`
   */
  enabled = false;

  /**
   * Quality preset controlling trace resolution, tracing mode, ray-marching steps, temporal accumulation, and sampling reconstruction.
   * @defaultValue `ScreenSpaceReflectionQuality.Medium`
   */
  quality = ScreenSpaceReflectionQuality.Medium;

  private _intensity: number = 1.0;
  private _maxRoughness: number = 0.6;
  private _maxDistance: number = 25;
  private _thickness: number = 0.15;
  private _edgeFade: number = 0.1;
  private _temporalBlend: number = 0.85;

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
    this._temporalBlend = MathUtil.clamp(value, 0, 0.95);
  }

  /**
   * @internal
   */
  _isValid(): boolean {
    return this.enabled && this._intensity > 0 && this._maxRoughness > 0;
  }
}
