import { IPlaneColliderShape } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { PhysicsManager } from "../PhysicsManager";
import { ColliderShape } from "./ColliderShape";

/**
 * Physical collider shape plane.
 */
export class PlaneColliderShape extends ColliderShape {
  constructor() {
    super();
    this._nativeShape = PhysicsManager._nativePhysics.createPlaneColliderShape(
      this._id,
      this._material._nativeMaterial
    );
  }
}
