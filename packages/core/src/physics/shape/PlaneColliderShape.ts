import { PhysicsScene } from "../PhysicsScene";
import { ColliderShape } from "./ColliderShape";

/**
 * Physical collider shape plane.
 */
export class PlaneColliderShape extends ColliderShape {
  constructor() {
    super();
    this._nativeShape = PhysicsScene._nativePhysics.createPlaneColliderShape(this._id, this._material._nativeMaterial);
  }

  clone(): PlaneColliderShape {
    const dest = new PlaneColliderShape();
    this.cloneTo(dest);
    return dest;
  }
}
