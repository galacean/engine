import { AmbientOcclusionQuality } from "../enums/AmbientOcclusionQuality";

/**
 * Ambient Occlusion effect configuration.
 */
export class AmbientOcclusion {
  private _enabled = false;
  private _quality = AmbientOcclusionQuality.Low;
  private _radius = 0.5;
  private _intensity = 1.0;
  private _bias = 0.01;
  private _power = 1.0;
  private _bilateralThreshold = 0.05;

  /**
   * Control whether screen space ambient occlusion is enabled or not.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (value === this._enabled) {
      return;
    }
    this._enabled = value;
  }

  /**
   * Controls the quality of the Screen Space Ambient Occlusion.
   * @remarks
   * If set to `SSAOQuality.Low`, the effect will use fewer samples for faster performance.
   * If set to `SSAOQuality.Medium`, the effect will balance quality and performance.
   * If set to `SSAOQuality.High`, the effect will use more samples for better quality，but the performance will be even worse.
   */
  get quality(): AmbientOcclusionQuality {
    return this._quality;
  }

  set quality(value: AmbientOcclusionQuality) {
    if (this._quality !== value) {
      this._quality = value;
    }
  }

  /**
   * Controls the radius of the Screen Space Ambient Occlusion radius.
   * Higher values create larger occlusion areas.
   * @default 0.5
   * @range [0.0, 10.0]
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    if (this._radius !== value) {
      this._radius = Math.max(0.0, Math.min(10.0, value));
    }
  }

  /**
   * Controls the strength of the Screen Space Ambient Occlusion effect.
   * @default 1.0
   * @range [0.0, ∞)
   */
  get intensity(): number {
    return this._intensity;
  }

  set intensity(value: number) {
    if (this._intensity !== value) {
      this._intensity = Math.max(0.0, value);
    }
  }

  /**
   * Controls the bias to prevent self-occlusion artifacts.
   * @default 0.01
   * @range [0.0, 0.1]
   */
  get bias(): number {
    return this._bias;
  }

  set bias(value: number) {
    if (this._bias !== value) {
      this._bias = value;
    }
  }

  /**
   * Control the contrast of the Screen Space Ambient Occlusion,
   * The larger the value, the grayer the effect.
   * @default 1.0
   * @range [0.1, 5.0]
   */
  get power(): number {
    return this._power;
  }

  set power(value: number) {
    this._power = Math.max(0.1, Math.min(5.0, value));
  }

  /**
   * Control the threshold for blurred edges.
   * @remarks
   * Smaller value that retains the edge will result in sharper edges,
   * while a larger value will make the edges softer.
   * @default 0.05
   * @range (0.000001, 1.0]
   */
  get bilateralThreshold(): number {
    return this._bilateralThreshold;
  }

  set bilateralThreshold(value: number) {
    this._bilateralThreshold = Math.max(1e-6, Math.min(1.0, value));
  }

  /**
   * @internal
   */
  _isValid(): boolean {
    return this.enabled && this.intensity > 0;
  }
}
