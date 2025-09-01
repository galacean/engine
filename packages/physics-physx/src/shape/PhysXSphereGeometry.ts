import { PhysXGeometry } from "./PhysXGeometry";

/**
 * Sphere geometry for PhysX.
 */
export class PhysXSphereGeometry extends PhysXGeometry {
  constructor(physX: any, radius: number) {
    super(physX);
    this._geometry = new physX.PxSphereGeometry(radius);
  }

  /**
   * The radius of the sphere.
   */
  get radius(): number {
    return this._geometry.radius;
  }

  set radius(value: number) {
    this._geometry.radius = value;
  }
}
