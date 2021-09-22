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
    this._rotation = value;
    (<IPlaneColliderShape>this._nativeShape).setRotation(value);
  }

  constructor() {
    super();
    this._nativeShape = PhysicsManager._nativePhysics.createPlaneColliderShape(this._id, this._material._nativeMaterial);
  }

  setRotation(yaw: number, pitch: number, roll: number) {
    this._rotation.setValue(yaw, pitch, roll);
    (<IPlaneColliderShape>this._nativeShape).setRotation(this._rotation);
  }
}
