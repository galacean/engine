import { ColliderShape } from "./ColliderShape";
import { PhysicsManager } from "../PhysicsManager";
import { Vector3 } from "@oasis-engine/math";
import { IPlaneColliderShape } from "@oasis-engine/design";

/**
 * Physical collider shape plane.
 */
export class PlaneColliderShape extends ColliderShape {
  private _rotation: Vector3 = new Vector3();

  /**
   * The local rotation of this plane.
   */
  get rotation(): Vector3 {
    return this._rotation;
  }

  set rotation(value: Vector3) {
    if (this._rotation != value) {
      value.cloneTo(this._rotation);
    }
    (<IPlaneColliderShape>this._nativeShape).setRotation(value);
  }

  constructor() {
    super();
    this._nativeShape = PhysicsManager._nativePhysics.createPlaneColliderShape(
      this._id,
      this._material._nativeMaterial
    );
  }

  /**
   * Set the local rotation of this plane.
   * @param x - Radian of yaw
   * @param y - Radian of pitch
   * @param z - Radian of roll
   */
  setRotation(x: number, y: number, z: number): void {
    this._rotation.setValue(x, y, z);
    (<IPlaneColliderShape>this._nativeShape).setRotation(this._rotation);
  }
}
