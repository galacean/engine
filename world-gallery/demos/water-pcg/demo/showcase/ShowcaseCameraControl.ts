import type { Entity } from "@galacean/engine";
import { FreeControl } from "@galacean/engine-toolkit-controls";
import type { ShowcaseCameraMode } from "./ShowcaseCameraPolicy";

const CAMERA_TRANSFORM_EPSILON = 1e-6;

export {
  isShowcaseAutomation,
  resolveShowcaseCameraMode,
  SHOWCASE_CAMERA_MOVEMENT_SPEED
} from "./ShowcaseCameraPolicy";
export type { ShowcaseCameraMode, ShowcaseCameraScene } from "./ShowcaseCameraPolicy";

export interface WaterShowcaseCameraSnapshot {
  readonly mode: ShowcaseCameraMode;
  readonly active: boolean;
  readonly movementSpeed: number;
  readonly floorMock: false;
  readonly controls: "wasd-arrows-pointer-drag";
  readonly position: readonly [number, number, number];
  readonly forward: readonly [number, number, number];
  readonly updateRevision: number;
}

export interface WaterShowcaseCameraApi {
  readonly snapshot: Readonly<WaterShowcaseCameraSnapshot>;
}

export interface ShowcaseCameraController {
  readonly mode: ShowcaseCameraMode;
  readonly freeControlActive: boolean;
  setFreeControlActive(active: boolean): void;
  syncFromTransform(): void;
  destroy(): void;
}

export interface CreateShowcaseCameraControllerOptions {
  readonly mode: ShowcaseCameraMode;
  readonly movementSpeed: number;
  readonly afterCameraUpdate?: () => void;
}

declare global {
  interface Window {
    waterPcgShowcaseCamera?: WaterShowcaseCameraApi;
  }
}

class WaterShowcaseFreeControl extends FreeControl {
  afterCameraUpdate: (() => void) | undefined;

  override onLateUpdate(deltaTime: number): void {
    const transform = this.entity.transform;
    const positionBefore = transform.worldPosition;
    const forwardBefore = transform.worldForward;
    const positionX = positionBefore.x;
    const positionY = positionBefore.y;
    const positionZ = positionBefore.z;
    const forwardX = forwardBefore.x;
    const forwardY = forwardBefore.y;
    const forwardZ = forwardBefore.z;

    super.onLateUpdate(deltaTime);

    const positionAfter = transform.worldPosition;
    const forwardAfter = transform.worldForward;
    if (
      Math.abs(positionAfter.x - positionX) > CAMERA_TRANSFORM_EPSILON ||
      Math.abs(positionAfter.y - positionY) > CAMERA_TRANSFORM_EPSILON ||
      Math.abs(positionAfter.z - positionZ) > CAMERA_TRANSFORM_EPSILON ||
      Math.abs(forwardAfter.x - forwardX) > CAMERA_TRANSFORM_EPSILON ||
      Math.abs(forwardAfter.y - forwardY) > CAMERA_TRANSFORM_EPSILON ||
      Math.abs(forwardAfter.z - forwardZ) > CAMERA_TRANSFORM_EPSILON
    ) {
      this.afterCameraUpdate?.();
    }
  }
}

class ShowcaseCameraControllerImpl implements ShowcaseCameraController {
  private _control: WaterShowcaseFreeControl | undefined;
  private _destroyed = false;
  private _updateRevision = 0;
  private readonly _browserApi: WaterShowcaseCameraApi;

  constructor(
    private readonly _cameraEntity: Entity,
    readonly mode: ShowcaseCameraMode,
    private readonly _movementSpeed: number,
    private readonly _afterCameraUpdate?: () => void
  ) {
    if (!Number.isFinite(_movementSpeed) || _movementSpeed <= 0) {
      throw new Error(`Showcase camera movement speed must be finite and positive, received ${_movementSpeed}.`);
    }
    const controller = this;
    this._browserApi = {
      get snapshot() {
        return controller._createSnapshot();
      }
    };
    window.waterPcgShowcaseCamera = this._browserApi;
    document.documentElement.dataset.waterPcgCameraMode = mode;
    this.setFreeControlActive(mode === "free");
  }

  get freeControlActive(): boolean {
    return this._control !== undefined;
  }

  setFreeControlActive(active: boolean): void {
    if (this._destroyed) return;
    this._control?.destroy();
    this._control = undefined;
    if (!active || this.mode === "fixed") return;

    const control = this._cameraEntity.addComponent(WaterShowcaseFreeControl);
    control.floorMock = false;
    control.movementSpeed = this._movementSpeed;
    control.afterCameraUpdate = () => {
      this._updateRevision++;
      this._afterCameraUpdate?.();
    };
    this._control = control;
  }

  syncFromTransform(): void {
    if (this._destroyed) return;
    const restoreFreeControl = this.freeControlActive;
    if (restoreFreeControl) this.setFreeControlActive(true);
    this._updateRevision++;
    this._afterCameraUpdate?.();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._control?.destroy();
    this._control = undefined;
    if (window.waterPcgShowcaseCamera === this._browserApi) delete window.waterPcgShowcaseCamera;
    delete document.documentElement.dataset.waterPcgCameraMode;
  }

  private _createSnapshot(): Readonly<WaterShowcaseCameraSnapshot> {
    const position = this._cameraEntity.transform.worldPosition;
    const forward = this._cameraEntity.transform.worldForward;
    return Object.freeze({
      mode: this.mode,
      active: this.freeControlActive,
      movementSpeed: this._movementSpeed,
      floorMock: false,
      controls: "wasd-arrows-pointer-drag",
      position: Object.freeze([position.x, position.y, position.z] as const),
      forward: Object.freeze([forward.x, forward.y, forward.z] as const),
      updateRevision: this._updateRevision
    });
  }
}

export function createShowcaseCameraController(
  cameraEntity: Entity,
  options: Readonly<CreateShowcaseCameraControllerOptions>
): ShowcaseCameraController {
  return new ShowcaseCameraControllerImpl(cameraEntity, options.mode, options.movementSpeed, options.afterCameraUpdate);
}
