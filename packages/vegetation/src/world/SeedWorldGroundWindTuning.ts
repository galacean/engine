import { Scene, ShaderProperty, Vector4 } from "@galacean/engine";
import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import {
  SEED_WORLD_DEFAULT_GROUND_WIND_TUNING,
  validateGroundWindTuning,
  type SeedWorldGroundWindTuning
} from "./SeedWorldGroundWindTuningModel";

export {
  SEED_WORLD_DEFAULT_GROUND_WIND_TUNING,
  validateGroundWindTuning,
  type SeedWorldGroundWindTuning
} from "./SeedWorldGroundWindTuningModel";

const GROUND_WIND_WAVE = ShaderProperty.getByName("scene_GroundWindWave");
const GROUND_WIND_SHAPE = ShaderProperty.getByName("scene_GroundWindShape");
const GROUND_WIND_MOTION = ShaderProperty.getByName("scene_GroundWindMotion");
const GROUND_WIND_ADVECTION = ShaderProperty.getByName("scene_GroundWindAdvection");

/** Publishes one live ground-wind calibration shared by dense grass and authored flowers. */
export class SeedWorldGroundWindTuningRuntime {
  readonly tuning: SeedWorldGroundWindTuning = { ...SEED_WORLD_DEFAULT_GROUND_WIND_TUNING };

  private readonly _scene: Scene;
  private readonly _wave = new Vector4();
  private readonly _shape = new Vector4();
  private readonly _motion = new Vector4();
  private readonly _advection = new Vector4();
  private _elapsedSeconds = 0;
  private _advectionX = 0;
  private _advectionZ = 0;
  private _directionX = 1;
  private _directionZ = 0;
  private _dormantElapsedSeconds = 0;
  private _hasConsumers = true;
  private _dirty = false;

  constructor(scene: Scene) {
    this._scene = scene;
    this._cacheDirection();
    this._publishTuning();
  }

  setTuning(tuning: Readonly<Partial<SeedWorldGroundWindTuning>>): void {
    Object.assign(this.tuning, tuning);
    validateGroundWindTuning(this.tuning);
    if (!this.tuning.enabled) this._dormantElapsedSeconds = 0;
    this._cacheDirection();
    this._dirty = true;
    if (this._hasConsumers) this._publishTuning();
  }

  reset(): void {
    Object.assign(this.tuning, SEED_WORLD_DEFAULT_GROUND_WIND_TUNING);
    this._elapsedSeconds = 0;
    this._advectionX = 0;
    this._advectionZ = 0;
    this._dormantElapsedSeconds = 0;
    this._cacheDirection();
    this._dirty = true;
    if (this._hasConsumers) this._publishTuning();
  }

  /** Advances the standalone grass-and-flower wind clock without reading the environment preset. */
  update(deltaTimeSeconds: number, hasConsumers = true): void {
    if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
      throw new RangeError(`Ground wind delta time must be finite and non-negative`);
    }
    if (!hasConsumers) {
      this._hasConsumers = false;
      if (this.tuning.enabled) this._dormantElapsedSeconds += deltaTimeSeconds;
      return;
    }
    const resumed = !this._hasConsumers;
    this._hasConsumers = true;
    const elapsedSeconds = deltaTimeSeconds + this._dormantElapsedSeconds;
    this._dormantElapsedSeconds = 0;
    const advanced = this.tuning.enabled && elapsedSeconds > 0;
    if (advanced) {
      const phaseDistance = this.tuning.speedMps * elapsedSeconds;
      this._elapsedSeconds += elapsedSeconds;
      this._advectionX += this._directionX * phaseDistance;
      this._advectionZ += this._directionZ * phaseDistance;
    }
    if (resumed || this._dirty) this._publishTuning();
    else if (advanced) this._publishMotion();
  }

  mount(inspector: DebugInspectorPanelHost): void {
    const folder = inspector.folder("Grass & Flower Wind / 草花风场", true);
    const apply = (): void => this.setTuning(this.tuning);
    const controllers = [
      folder.add(this.tuning, "enabled").name("Enabled / 启用").onChange(apply),
      folder.add(this.tuning, "speedMps", 0, 8, 0.1).name("Wave speed m/s / 主波速度").onChange(apply),
      folder.add(this.tuning, "directionDegrees", -180, 180, 1).name("Direction ° / 风向").onChange(apply),
      folder.add(this.tuning, "waveStrength", 0, 1.5, 0.01).name("Wave strength / 主波强度").onChange(apply),
      folder.add(this.tuning, "waveScaleMeters", 3, 24, 0.25).name("Wave scale m / 麦浪尺度").onChange(apply),
      folder.add(this.tuning, "meanBend", 0, 1.2, 0.01).name("Base bend rad / 基础倾角").onChange(apply),
      folder.add(this.tuning, "rootStiffness", 0.6, 3, 0.02).name("Root stiffness / 根部刚度").onChange(apply),
      folder.add(this.tuning, "noiseSpeedMps", 0, 4, 0.05).name("Noise speed m/s / 扰动速度").onChange(apply),
      folder.add(this.tuning, "noiseStrength", 0, 0.8, 0.01).name("Noise strength / 扰动强度").onChange(apply),
      folder.add(this.tuning, "colorStrength", 0, 1, 0.01).name("Color sweep / 色带强度").onChange(apply),
      folder.add(this.tuning, "colorContrast", 0.5, 4, 0.05).name("Color contrast / 色带对比").onChange(apply)
    ];
    inspector.addAction(folder, "Reset ground wind / 重置草花风场", () => {
      this.reset();
      for (const controller of controllers) controller.updateDisplay();
    });
    inspector.refreshLayout();
  }

  private _publishTuning(): void {
    this._wave.set(
      this.tuning.waveStrength,
      this.tuning.waveScaleMeters,
      this.tuning.noiseStrength,
      this.tuning.meanBend
    );
    const noiseSpeedRatio = this.tuning.speedMps > 0 ? this.tuning.noiseSpeedMps / this.tuning.speedMps : 0;
    this._shape.set(this.tuning.rootStiffness, noiseSpeedRatio, this.tuning.colorStrength, 0);
    this._scene.shaderData.setVector4(GROUND_WIND_WAVE, this._wave);
    this._scene.shaderData.setVector4(GROUND_WIND_SHAPE, this._shape);
    this._publishMotion();
    this._dirty = false;
  }

  private _publishMotion(): void {
    const speedMps = this.tuning.enabled ? this.tuning.speedMps : 0;
    this._motion.set(this._directionX, this._directionZ, speedMps, this._elapsedSeconds);
    this._advection.set(this._advectionX, this._advectionZ, this.tuning.colorContrast, 0);
    this._scene.shaderData.setVector4(GROUND_WIND_MOTION, this._motion);
    this._scene.shaderData.setVector4(GROUND_WIND_ADVECTION, this._advection);
  }

  private _cacheDirection(): void {
    const directionRadians = (this.tuning.directionDegrees * Math.PI) / 180;
    this._directionX = Math.cos(directionRadians);
    this._directionZ = Math.sin(directionRadians);
  }
}
