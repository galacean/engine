import { ColliderShape } from "./ColliderShape";
import { PhysicsManager } from "../PhysicsManager";

/** PhysXPhysics Shape for Plane */
export class PlaneColliderShape extends ColliderShape {
  constructor() {
    super();
    this._nativeShape = PhysicsManager.nativePhysics.createPlaneColliderShape(
      this._id,
      this._material._nativeMaterial,
      this._position,
      this._rotation
    );
  }
}