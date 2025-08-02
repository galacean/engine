import { IPlaneGeometry } from "@galacean/engine-design";
import { PhysXGeometry } from "./PhysXGeometry";

/**
 * Plane geometry for PhysX.
 */
export class PhysXPlaneGeometry extends PhysXGeometry implements IPlaneGeometry {
  constructor(physX: any) {
    super(physX);
    this._geometry = new physX.PxPlaneGeometry();
  }
}
