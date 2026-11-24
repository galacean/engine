import { ISphereShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXShape } from "./PhysXShape";

/**
 * Sphere shape in PhysX.
 */
export class PhysXSphereShape extends PhysXShape implements ISphereShape {
  constructor(physXPhysics: PhysXPhysics, uniqueID: number, radius: number, material: PhysXPhysicsMaterial) {
    super();

    this._pxGeometry = new physXPhysics._physX.PxSphereGeometry(radius);
    this._initialize(physXPhysics, material, uniqueID);
  }

  /**
   * {@inheritDoc ISphereShape.setRadius }
   */
  setRadius(radius: number): void {
    const geometry = this._pxGeometry;
    geometry.radius = radius;
    this._pxShape.setGeometry(geometry);
  }
}
