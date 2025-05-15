import { IBoxGeometry } from "@galacean/engine-design";
import { PhysXGeometry } from "./PhysXGeometry";
import { Vector3 } from "@galacean/engine";

type Vector3Like = Pick<Vector3, "x" | "y" | "z">;

/**
 * Box geometry for PhysX.
 */
export class PhysXBoxGeometry extends PhysXGeometry implements IBoxGeometry {
  constructor(physX: any, halfExtents: Vector3Like) {
    super(physX);
    this._geometry = new physX.PxBoxGeometry(halfExtents.x, halfExtents.y, halfExtents.z);
  }

  /**
   * The half-extents of the box.
   */
  get halfExtents(): Vector3Like {
    return this._geometry.halfExtents;
  }

  set halfExtents(value: Vector3Like) {
    this._geometry.halfExtents = value;
  }
}
