import { PhysXGeometry } from "./PhysXGeometry";

/**
 * Plane geometry for PhysX.
 */
export class PhysXPlaneGeometry extends PhysXGeometry {
  constructor(physX: any) {
    super(physX);
    this._geometry = new physX.PxPlaneGeometry();
  }
}
