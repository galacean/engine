import { IPlaneColliderShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Collider } from "./Collider";

/**
 * An infinite plane collider facing the Entity's local +Y axis.
 * @remarks Galacean extension. A plane can only be static or belong to a kinematic Rigidbody.
 */
export class PlaneCollider extends Collider {
  /**
   * Not supported by planes.
   * @returns -1
   */
  override getClosestPoint(point: Vector3, outClosestPoint: Vector3): number {
    console.error("PlaneCollider does not support getClosestPoint.");
    return -1;
  }

  /**
   * @internal
   */
  override _supportsDynamicBody(): boolean {
    return false;
  }

  protected override _createNative(): IPlaneColliderShape {
    const shape = Engine._nativePhysics.createPlaneColliderShape(this._id, this._getNativeMaterial());
    this._initializeNativeShape(shape);
    return shape;
  }
}
