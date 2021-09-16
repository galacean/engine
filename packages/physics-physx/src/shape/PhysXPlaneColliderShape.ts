import { PhysXColliderShape } from "./PhysXColliderShape";
import { IPlaneColliderShape } from "@oasis-engine/design";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * PhysX Shape for Plane
 */
export class PhysXPlaneColliderShape extends PhysXColliderShape implements IPlaneColliderShape {
  /**
   * init PhysXCollider and alloc PhysX objects.
   * @param index index mark collider
   * @param material material of PhysXCollider
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, material: PhysXPhysicsMaterial) {
    super();

    // alloc Physx object
    this._pxGeometry = new PhysXPhysics.PhysX.PxPlaneGeometry();
    this._allocShape(material);
    this._setLocalPose();
    this.setID(index);
  }
}
