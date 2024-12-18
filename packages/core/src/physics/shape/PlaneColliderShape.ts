import { Vector3 } from "@galacean/engine-math";
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

  override getClosestPoint(point: Vector3, closestPoint: Vector3): number {
    console.error("PlaneColliderShape is not support getClosestPoint");
    return -1;
  }
}
