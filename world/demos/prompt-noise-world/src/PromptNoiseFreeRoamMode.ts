import { MathUtil, Vector3, type Entity } from "@galacean/engine";
import type { OrbitControl } from "@galacean/engine-toolkit-controls";
import { FreeControl } from "@galacean/engine-animals/controls/FreeControl";

export const PROMPT_NOISE_FREE_ROAM_MIN_SPEED = 20;
export const PROMPT_NOISE_FREE_ROAM_MAX_SPEED = 2000;
const DEFAULT_MOVEMENT_SPEED = 100;
const ORBIT_FOCUS_DISTANCE = 50;

/** Dependencies that keep mode transitions separate from terrain authoring and UI ownership. */
export interface PromptNoiseFreeRoamModeOptions {
  readonly cameraEntity: Entity;
  readonly orbit: OrbitControl;
  readonly setEditingEnabled: (enabled: boolean) => void;
  readonly onModeChange?: (active: boolean) => void;
}

/** Owns the temporary FreeControl session used only between the two F-key transitions. */
export class PromptNoiseFreeRoamMode {
  get active(): boolean {
    return this._session !== null;
  }

  get movementSpeed(): number {
    return this._movementSpeed;
  }

  set movementSpeed(value: number) {
    if (!Number.isFinite(value)) throw new RangeError("Free-roam speed must be finite.");
    this._movementSpeed = MathUtil.clamp(value, PROMPT_NOISE_FREE_ROAM_MIN_SPEED, PROMPT_NOISE_FREE_ROAM_MAX_SPEED);
    this._session?.setBaseSpeed(this._movementSpeed);
  }

  private readonly _cameraEntity: Entity;
  private readonly _orbit: OrbitControl;
  private readonly _setEditingEnabled: (enabled: boolean) => void;
  private readonly _onModeChange: ((active: boolean) => void) | null;
  private readonly _focus = new Vector3();
  private _session: PromptNoiseFreeRoamSession | null = null;
  private _restoreEditingEnabled = false;
  private _restoreOrbitEnabled = true;
  private _restoreOrbitMinPolarAngle = 0;
  private _restoreOrbitMaxPolarAngle = Math.PI;
  private _movementSpeed = DEFAULT_MOVEMENT_SPEED;

  constructor(options: PromptNoiseFreeRoamModeOptions) {
    this._cameraEntity = options.cameraEntity;
    this._orbit = options.orbit;
    this._setEditingEnabled = options.setEditingEnabled;
    this._onModeChange = options.onModeChange ?? null;
  }

  /** Enters free roaming or restores the exact pre-entry interaction owners. */
  setActive(active: boolean, editingEnabled: boolean): void {
    if (active === this.active) return;
    if (active) this._enter(editingEnabled);
    else this._exit();
  }

  toggle(editingEnabled: boolean): void {
    this.setActive(!this.active, editingEnabled);
  }

  destroy(): void {
    if (this.active) this._exit();
  }

  private _enter(editingEnabled: boolean): void {
    this._restoreEditingEnabled = editingEnabled;
    this._setEditingEnabled(false);
    this._restoreOrbitEnabled = this._orbit.enabled;
    this._restoreOrbitMinPolarAngle = this._orbit.minPolarAngle;
    this._restoreOrbitMaxPolarAngle = this._orbit.maxPolarAngle;
    this._orbit.enabled = false;
    this._session = new PromptNoiseFreeRoamSession(this._cameraEntity, this._movementSpeed);
    this._onModeChange?.(true);
  }

  private _exit(): void {
    this._session?.destroy();
    this._session = null;
    const transform = this._cameraEntity.transform;
    this._focus.copyFrom(transform.worldForward).scale(ORBIT_FOCUS_DISTANCE).add(transform.position);
    this._orbit.target.copyFrom(this._focus);
    this._orbit.minPolarAngle = this._restoreOrbitMinPolarAngle;
    this._orbit.maxPolarAngle = this._restoreOrbitMaxPolarAngle;
    this._orbit.enabled = this._restoreOrbitEnabled;
    this._setEditingEnabled(this._restoreEditingEnabled);
    this._onModeChange?.(false);
  }
}

/** One disposable engine-control session mirroring demos/terrain's FreeControl lifecycle. */
class PromptNoiseFreeRoamSession {
  private readonly _freeControl: FreeControl;

  constructor(entity: Entity, baseSpeed: number) {
    const free = (this._freeControl = entity.addComponent(FreeControl));
    free.floorMock = false;
    this.setBaseSpeed(baseSpeed);
  }

  setBaseSpeed(speed: number): void {
    this._freeControl.movementSpeed = speed;
  }

  destroy(): void {
    this._freeControl.destroy();
  }
}
