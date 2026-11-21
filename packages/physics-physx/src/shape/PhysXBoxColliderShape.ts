import { Vector3 } from "@galacean/engine";
import { IBoxColliderShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape } from "./PhysXColliderShape";

/**
 * Box collider shape in PhysX.
 */
export class PhysXBoxColliderShape extends PhysXColliderShape implements IBoxColliderShape {
  constructor(physXPhysics: PhysXPhysics, uniqueID: number, halfExtents: Vector3, material: PhysXPhysicsMaterial) {
    super(physXPhysics);
    this._pxGeometry = new physXPhysics._physX.PxBoxGeometry(halfExtents.x, halfExtents.y, halfExtents.z);
    this._initialize(material, uniqueID);
  }

  /**
   * {@inheritDoc IBoxColliderShape.setHalfExtents }
   */
  setHalfExtents(halfExtents: Vector3): void {
    const geometry = this._pxGeometry;
    geometry.halfExtents = halfExtents;
    this._pxShape.setGeometry(geometry);
  }
}
