import { Scene } from "../../Scene";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { AmbientOcclusionQuality } from "../enums/AmbientOcclusionQuality";

/**
 * Ambient Occlusion effect configuration.
 */
export class AmbientOcclusion {
  private static _ambientOcclusionMacro = ShaderMacro.getByName("SCENE_ENABLE_SSAO");

  /**
   * Controls the quality of the Screen Space Ambient Occlusion.
   * @remarks
   * If set to `SSAOQuality.Low`, the effect will use fewer samples for faster performance.
   * If set to `SSAOQuality.Medium`, the effect will balance quality and performance.
   * If set to `SSAOQuality.High`, the effect will use more samples for better quality，but the performance will be even worse.
   */
  quality = AmbientOcclusionQuality.Low;

  /**
   * Controls the bias to prevent self-occlusion artifacts.
   * @default 0.01
   * @range [0.0, 0.1]
   */
  bias = 0.01;

  private _enabled = false;
  private _power = 1.0;
  private _bilateralThreshold = 0.05;
  private _radius = 0.5;
  private _intensity = 1.0;
  private _scene: Scene;

  /**
   * Control whether screen space ambient occlusion is enabled or not.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (this._enabled !== value) {
      this._enabled = value;
      this._updateShaderMacro();
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
      this._updateShaderMacro();
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

  constructor(scene: Scene) {
    this._scene = scene;
  }

  /**
   * @internal
   */
  _isValid(): boolean {
    return this._enabled && this.intensity > 0;
  }

  /**
   * @internal
   */
  private _updateShaderMacro(): void {
    if (this._isValid()) {
      this._scene.shaderData.enableMacro(AmbientOcclusion._ambientOcclusionMacro);
    } else {
      this._scene.shaderData.disableMacro(AmbientOcclusion._ambientOcclusionMacro);
    }
  }
}
