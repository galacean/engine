import { Vector3 } from "@galacean/engine";
import { IBoxShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXShape } from "./PhysXShape";

/**
 * Box shape in PhysX.
 */
export class PhysXBoxShape extends PhysXShape implements IBoxShape {
  constructor(physXPhysics: PhysXPhysics, uniqueID: number, halfExtents: Vector3, material: PhysXPhysicsMaterial) {
    super();
    this._pxGeometry = new physXPhysics._physX.PxBoxGeometry(halfExtents.x, halfExtents.y, halfExtents.z);
    this._initialize(physXPhysics, material, uniqueID);
  }

  /**
   * {@inheritDoc IBoxShape.setHalfExtents }
   */
  setHalfExtents(halfExtents: Vector3): void {
    const geometry = this._pxGeometry;
    geometry.halfExtents = halfExtents;
    this._pxShape.setGeometry(geometry);
  }
}
