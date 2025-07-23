import { ICapsuleGeometry } from "@galacean/engine-design";
import { PhysXGeometry } from "./PhysXGeometry";

/**
 * Capsule geometry for PhysX.
 */
export class PhysXCapsuleGeometry extends PhysXGeometry implements ICapsuleGeometry {
  constructor(physX: any, radius: number, halfHeight: number) {
    super(physX);
    this._geometry = new physX.PxCapsuleGeometry(radius, halfHeight);
  }

  /**
   * The radius of the capsule.
   */
  get radius(): number {
    return this._geometry.radius;
  }

  set radius(value: number) {
    this._geometry.radius = value;
  }

  /**
   * The half-height of the capsule.
   */
  get halfHeight(): number {
    return this._geometry.halfHeight;
  }

  set halfHeight(value: number) {
    this._geometry.halfHeight = value;
  }
}
