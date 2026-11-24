import { IPlaneShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Collider } from "./Collider";

/**
 * An infinite plane collider with a +Y normal in local space.
 * @remarks Simulation and queries use the plane when static or owned by a kinematic {@link Rigidbody}.
 * An infinite plane has no finite world bounds, so {@link getBounds} returns false and leaves the output unchanged.
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
  override _getVolumeDistance(): number {
    return -1;
  }

  protected override _supportsDynamicBody(): boolean {
    return false;
  }

  protected override _syncNativeShape(): IPlaneShape {
    return <IPlaneShape>(
      (this._native ??
        this._initializeNativeShape(Engine._nativePhysics.createPlaneShape(this._id, this._getNativeMaterial())))
    );
  }
}
