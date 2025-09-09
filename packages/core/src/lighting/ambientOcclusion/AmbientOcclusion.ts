import { Scene } from "../../Scene";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { AmbientOcclusionQuality } from "../enums/AmbientOcclusionQuality";

/**
 * Ambient Occlusion settings.
 * @remarks
 * Adds realistic shadows to corners, crevices, and areas where objects meet.
 */
export class AmbientOcclusion {
  private static _enableMacro = ShaderMacro.getByName("SCENE_ENABLE_AMBIENT_OCCLUSION");

  /**
   * Controls the quality of the ambient occlusion effect.
   * @remarks
   * If set to `AmbientOcclusionQuality.Low`, the effect will use fewer samples for faster performance.
   * If set to `AmbientOcclusionQuality.Medium`, the effect will balance quality and performance.
   * If set to `AmbientOcclusionQuality.High`, the effect will use more samples for better quality, but the performance will be worse.
   */
  quality = AmbientOcclusionQuality.Low;

  private _scene: Scene;
  private _enabled = false;
  private _power = 1.0;
  private _bilateralThreshold = 0.05;
  private _radius = 0.3;
  private _intensity = 1.0;
  private _bias = 0.0005;
  private _minHorizonAngleRad = 0.0;

  /**
   * Control whether ambient occlusion is enabled or not.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (this._enabled !== value) {
      this._enabled = value;
      this._toggleAmbientOcclusionMacro();
    }
  }

  /**
   * Controls the radius of the ambient occlusion effect.
   * Higher values create larger occlusion areas.
   * Valid range: [0.0, 10.0]
   * @defaultValue 0.3
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
   * Controls the strength of the ambient occlusion effect.
   * Valid range: [0.0, Infinity)
   * @defaultValue 1.0
   */
  get intensity(): number {
    return this._intensity;
  }

  set intensity(value: number) {
    if (this._intensity !== value) {
      this._intensity = Math.max(0.0, value);
      this._toggleAmbientOcclusionMacro();
    }
  }

  /**
   * Control the contrast of the ambient occlusion effect.
   * The larger the value, the grayer the effect.
   * Valid range: [0.1, 5.0]
   * @defaultValue 1.0
   */
  get power(): number {
    return this._power;
  }

  set power(value: number) {
    this._power = Math.max(0.1, Math.min(5.0, value));
  }

  /**
   * Control the threshold for blurred edges.
   * Smaller value that retains the edge will result in sharper edges,
   * while a larger value will make the edges softer.
   * Valid range: [0.000001, 1.0]
   * @defaultValue 0.05
   */
  get bilateralThreshold(): number {
    return this._bilateralThreshold;
  }

  set bilateralThreshold(value: number) {
    this._bilateralThreshold = Math.max(1e-6, Math.min(1.0, value));
  }

  /**
   * Controls the bias to prevent self-occlusion artifacts.
   * Valid range: [0.0, 0.1]
   * @defaultValue 0.0005
   */
  get bias(): number {
    return this._bias;
  }

  set bias(value: number) {
    this._bias = Math.max(0.0, Math.min(0.1, value));
  }

  /**
   * Controls the minimum horizon angle to reduce artifacts from low-tessellation geometry.
   * Valid range: [0.0, π/4] (0 to 45 degrees in radians)
   * @defaultValue 0.0
   */
  get minHorizonAngle(): number {
    return this._minHorizonAngleRad;
  }

  set minHorizonAngle(value: number) {
    this._minHorizonAngleRad = Math.max(0.0, Math.min(Math.PI / 4, value));
  }

  constructor(scene: Scene) {
    this._scene = scene;
  }

  /**
   * @internal
   */
  _isValid(): boolean {
    return this._enabled && this.intensity > 0;
  }

  private _toggleAmbientOcclusionMacro(): void {
    if (this._isValid()) {
      this._scene.shaderData.enableMacro(AmbientOcclusion._enableMacro);
    } else {
      this._scene.shaderData.disableMacro(AmbientOcclusion._enableMacro);
    }
  }
}
