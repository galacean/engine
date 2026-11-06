import { Camera, type Entity } from "@galacean/engine";
import { FreeControl } from "@galacean/engine-animals/controls/FreeControl";
import { type ShowcaseCameraMode } from "./ShowcaseCameraPolicy.ts";
import { ShowcaseKeyboardInput } from "./ShowcaseKeyboardInput.ts";

const CAMERA_TRANSFORM_EPSILON = 1e-6;

export {
  isShowcaseAutomation,
  resolveShowcaseCameraMode,
  SHOWCASE_CAMERA_MOVEMENT_SPEED
} from "./ShowcaseCameraPolicy.ts";
export type { ShowcaseCameraMode, ShowcaseCameraScene } from "./ShowcaseCameraPolicy.ts";

export interface WaterShowcaseCameraSnapshot {
  readonly mode: ShowcaseCameraMode;
  readonly active: boolean;
  readonly movementSpeed: number;
  readonly floorMock: false;
  readonly projection: "perspective" | "orthographic";
  readonly fieldOfView: number;
  readonly orthographicSize: number;
  readonly nearClipPlane: number;
  readonly farClipPlane: number;
  readonly groundCollision: boolean;
  readonly groundClearance: number;
  readonly verticalOffset: number;
  readonly controls: "wasd-mouse-look";
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

export interface ShowcaseCameraGrounding {
  readonly eyeHeight: number;
  sampleHeight(worldX: number, worldZ: number): number | undefined;
}

export interface ShowcaseCameraHorizontalBounds {
  readonly centerXZ: readonly [number, number];
  readonly halfExtentXZ: readonly [number, number];
}

export interface CreateShowcaseCameraControllerOptions {
  readonly mode: ShowcaseCameraMode;
  readonly movementSpeed: number;
  readonly grounding?: Readonly<ShowcaseCameraGrounding>;
  readonly horizontalBounds?: Readonly<ShowcaseCameraHorizontalBounds>;
  readonly afterCameraUpdate?: () => void;
}

declare global {
  interface Window {
    waterPcgShowcaseCamera?: WaterShowcaseCameraApi;
  }
}

class WaterShowcaseFreeControl extends FreeControl {
  afterCameraUpdate: (() => void) | undefined;
  private _keyboard: ShowcaseKeyboardInput | undefined;
  private _grounding: Readonly<ShowcaseCameraGrounding> | undefined;
  private _horizontalBounds: Readonly<ShowcaseCameraHorizontalBounds> | undefined;
  private _verticalOffset = 0;
  private _hasGroundedPosition = false;
  private _lastGroundedX = 0;
  private _lastGroundedY = 0;
  private _lastGroundedZ = 0;

  override onAwake(): void {
    // Water showcases use one full-canvas view gesture; pointer drags never move a joystick.
    this.movementGestureEnabled = false;
    this.rotationArea.set(0, 0, 1, 1);
    super.onAwake();
    const canvas = document.getElementById("canvas");
    if (canvas instanceof HTMLCanvasElement) this._keyboard = new ShowcaseKeyboardInput(canvas);
  }

  override onDisable(): void {
    this._keyboard?.clear();
    super.onDisable();
  }

  override onDestroy(): void {
    this._keyboard?.destroy();
    this._keyboard = undefined;
    super.onDestroy();
  }

  protected override onBeforeViewUpdate(deltaTime: number): void {
    const keyboard = this._keyboard;
    if (!keyboard) return;
    if (!this.inputEnabled || !this.movementEnabled) {
      keyboard.clear();
      return;
    }
    const { right, forward, up } = keyboard;
    const magnitude = Math.max(1, Math.hypot(right, forward, up));
    this.applyPlanarMovementInput(right / magnitude, forward / magnitude, deltaTime);
    const verticalDistance =
      (up / magnitude) * this.movementSpeed * Math.max(0, Math.min(deltaTime, this.maxMovementDeltaTime));
    if (this._grounding) this._verticalOffset = Math.max(0, this._verticalOffset + verticalDistance);
    else this.entity.transform.worldPosition.y += verticalDistance;
  }

  get verticalOffset(): number {
    return this._verticalOffset;
  }

  setGrounding(grounding?: Readonly<ShowcaseCameraGrounding>): void {
    this._grounding = grounding;
    this._verticalOffset = 0;
    this._hasGroundedPosition = false;
    this._snapToGround();
  }

  setHorizontalBounds(bounds?: Readonly<ShowcaseCameraHorizontalBounds>): void {
    this._horizontalBounds = bounds;
    this._clampHorizontalPosition();
  }

  override onLateUpdate(deltaTime: number): void {
    if (!this.enabled) return;
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

    this._clampHorizontalPosition();
    this._snapToGround();

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

  private _snapToGround(): void {
    const grounding = this._grounding;
    if (!grounding) return;
    const transform = this.entity.transform;
    const position = transform.worldPosition;
    const groundHeight = grounding.sampleHeight(position.x, position.z);
    if (groundHeight === undefined || !Number.isFinite(groundHeight)) {
      if (this._hasGroundedPosition) {
        transform.worldPosition.set(
          this._lastGroundedX,
          this._lastGroundedY,
          this._lastGroundedZ
        );
      }
      return;
    }
    const cameraY = groundHeight + grounding.eyeHeight + this._verticalOffset;
    transform.worldPosition.set(position.x, cameraY, position.z);
    this._lastGroundedX = position.x;
    this._lastGroundedY = cameraY;
    this._lastGroundedZ = position.z;
    this._hasGroundedPosition = true;
  }

  private _clampHorizontalPosition(): void {
    const bounds = this._horizontalBounds;
    if (!bounds) return;
    const position = this.entity.transform.worldPosition;
    const [centerX, centerZ] = bounds.centerXZ;
    const [halfX, halfZ] = bounds.halfExtentXZ;
    this.entity.transform.worldPosition.set(
      Math.min(centerX + halfX, Math.max(centerX - halfX, position.x)),
      position.y,
      Math.min(centerZ + halfZ, Math.max(centerZ - halfZ, position.z))
    );
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
    private readonly _grounding: Readonly<ShowcaseCameraGrounding> | undefined,
    private readonly _horizontalBounds: Readonly<ShowcaseCameraHorizontalBounds> | undefined,
    private readonly _afterCameraUpdate?: () => void
  ) {
    if (!Number.isFinite(_movementSpeed) || _movementSpeed <= 0) {
      throw new Error(`Showcase camera movement speed must be finite and positive, received ${_movementSpeed}.`);
    }
    if (_grounding && (!Number.isFinite(_grounding.eyeHeight) || _grounding.eyeHeight <= 0)) {
      throw new Error(`Showcase camera eye height must be finite and positive, received ${_grounding.eyeHeight}.`);
    }
    if (
      _horizontalBounds &&
      ([..._horizontalBounds.centerXZ, ..._horizontalBounds.halfExtentXZ].some((value) => !Number.isFinite(value)) ||
        _horizontalBounds.halfExtentXZ.some((value) => value < 0))
    ) {
      throw new Error("Showcase camera horizontal bounds must be finite with non-negative half extents.");
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
    control.setGrounding(this._grounding);
    control.setHorizontalBounds(this._horizontalBounds);
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
    const camera = this._cameraEntity.getComponent(Camera);
    const position = this._cameraEntity.transform.worldPosition;
    const forward = this._cameraEntity.transform.worldForward;
    return Object.freeze({
      mode: this.mode,
      active: this.freeControlActive,
      movementSpeed: this._movementSpeed,
      floorMock: false,
      projection: camera?.isOrthographic ? "orthographic" : "perspective",
      fieldOfView: camera?.fieldOfView ?? 0,
      orthographicSize: camera?.orthographicSize ?? 0,
      nearClipPlane: camera?.nearClipPlane ?? 0,
      farClipPlane: camera?.farClipPlane ?? 0,
      groundCollision: this._grounding !== undefined,
      groundClearance: this._grounding?.eyeHeight ?? 0,
      verticalOffset: this._control?.verticalOffset ?? 0,
      controls: "wasd-mouse-look",
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
  return new ShowcaseCameraControllerImpl(
    cameraEntity,
    options.mode,
    options.movementSpeed,
    options.grounding,
    options.horizontalBounds,
    options.afterCameraUpdate
  );
}
