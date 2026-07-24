import { Script, Vector3 } from "@galacean/engine";
import { FreeControl } from "@galacean/engine-toolkit-controls";
import { TerrainData } from "./data/TerrainData";

/** Initial XZ position and view orientation for terrain first-person mode. */
export interface TerrainFirstPersonPose {
  /** Initial world-space X coordinate in metres. */
  readonly x: number;
  /** Initial world-space Z coordinate in metres. */
  readonly z: number;
  /** Horizontal view angle in radians, where zero faces world negative Z. */
  readonly yaw: number;
  /** Vertical view angle in radians. */
  readonly pitch: number;
}

/** Read-only state exposed by the terrain demo's first-person controls. */
export interface TerrainFirstPersonSnapshot {
  /** Whether first-person movement currently owns the camera. */
  readonly active: boolean;
  /** Camera height above the sampled terrain in metres. */
  readonly eyeHeight: number;
  /** Horizontal movement speed in metres per second. */
  readonly moveSpeed: number;
  /** Current world-space camera position. */
  readonly position: readonly [x: number, y: number, z: number];
  /** Current terrain height below the camera, when its XZ position is loaded. */
  readonly groundHeight?: number;
}

/**
 * Demo-only terrain follower that constrains a `FreeControl` camera to CPU terrain heights.
 * @remarks Input and rotation belong to `FreeControl`; this component only resolves terrain contact.
 */
export class TerrainFirstPersonController extends Script {
  private static readonly _minimumEyeHeight = 0.5;
  private static readonly _maximumEyeHeight = 3;
  private static readonly _minimumMoveSpeed = 1;
  private static readonly _maximumMoveSpeed = 30;

  private readonly _lookTarget = new Vector3();
  private readonly _lastGroundedPosition = new Vector3();
  private _terrain: TerrainData | null = null;
  private _freeControl: FreeControl | null = null;
  private _active = false;
  private _hasGroundedPosition = false;
  private _eyeHeight = 1.7;
  private _moveSpeed = 8;
  private _yaw = 0;
  private _pitch = 0;

  /** Current state suitable for the demo inspector and browser tests. */
  get snapshot(): TerrainFirstPersonSnapshot {
    const position = this.entity.transform.worldPosition;
    return {
      active: this._active,
      eyeHeight: this._eyeHeight,
      moveSpeed: this._moveSpeed,
      position: [position.x, position.y, position.z],
      groundHeight: this._terrain?.sampleHeightInterpolated(position.x, position.z)
    };
  }

  /**
   * Connects the controller to the CPU-resident terrain data.
   * @param terrain Loaded terrain height data used for each ground sample.
   */
  configure(terrain: TerrainData): void {
    this._terrain = terrain;
  }

  /**
   * Connects the camera input controller and applies the current movement speed.
   * @param control Active `FreeControl`, or null when first-person mode is inactive.
   */
  setFreeControl(control: FreeControl | null): void {
    this._freeControl = control;
    if (!control) return;
    control.floorMock = false;
    control.movementSpeed = this._moveSpeed;
  }

  /**
   * Gives first-person controls ownership of the camera and snaps it to terrain.
   * @param pose Initial world-space XZ position and view orientation.
   */
  enter(pose: TerrainFirstPersonPose): void {
    this._active = true;
    this._yaw = pose.yaw;
    this._pitch = pose.pitch;
    this._snapToTerrain(pose.x, pose.z);
    this._applyLook();
  }

  /** Releases first-person camera ownership without changing the current position. */
  exit(): void {
    this._active = false;
  }

  /**
   * Updates the camera's height above terrain and immediately re-snaps it when active.
   * @param height Requested eye height in metres; this demo clamps it to 0.5–3 metres.
   */
  setEyeHeight(height: number): void {
    this._eyeHeight = Math.min(TerrainFirstPersonController._maximumEyeHeight, Math.max(TerrainFirstPersonController._minimumEyeHeight, height));
    if (!this._active) return;
    const position = this.entity.transform.worldPosition;
    this._snapToTerrain(position.x, position.z);
  }

  /**
   * Updates the WASD movement speed.
   * @param speed Requested horizontal speed in metres per second; this demo clamps it to 1–30 m/s.
   */
  setMoveSpeed(speed: number): void {
    this._moveSpeed = Math.min(TerrainFirstPersonController._maximumMoveSpeed, Math.max(TerrainFirstPersonController._minimumMoveSpeed, speed));
    if (this._freeControl) this._freeControl.movementSpeed = this._moveSpeed;
  }

  override onBeginRender(): void {
    if (!this._active || !this._terrain) return;
    const position = this.entity.transform.worldPosition;
    this._snapToTerrain(position.x, position.z);
  }

  private _snapToTerrain(worldX: number, worldZ: number): void {
    const height = this._terrain?.sampleHeightInterpolated(worldX, worldZ);
    if (height === undefined) {
      if (this._hasGroundedPosition) {
        this.entity.transform.setPosition(this._lastGroundedPosition.x, this._lastGroundedPosition.y, this._lastGroundedPosition.z);
      }
      return;
    }
    this.entity.transform.setPosition(worldX, height + this._eyeHeight, worldZ);
    this._lastGroundedPosition.set(worldX, height + this._eyeHeight, worldZ);
    this._hasGroundedPosition = true;
  }

  private _applyLook(): void {
    const position = this.entity.transform.worldPosition;
    const horizontal = Math.cos(this._pitch);
    this._lookTarget.set(
      position.x + Math.sin(this._yaw) * horizontal,
      position.y + Math.sin(this._pitch),
      position.z - Math.cos(this._yaw) * horizontal
    );
    this.entity.transform.lookAt(this._lookTarget);
  }

}
