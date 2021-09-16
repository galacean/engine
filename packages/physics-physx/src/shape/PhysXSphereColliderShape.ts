import { PhysXPhysics } from "../PhysXPhysics";
import { ISphereColliderShape } from "@oasis-engine/design";
import { PhysXColliderShape } from "./PhysXColliderShape";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";

/**
 * PhysX Shape for Sphere
 */
export class PhysXSphereColliderShape extends PhysXColliderShape implements ISphereColliderShape {
  /**
   * init PhysXCollider and alloc PhysX objects.
   * @param index index mark collider
   * @param radius size of SphereCollider
   * @param material material of PhysXCollider
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, radius: number, material: PhysXPhysicsMaterial) {
    super();

    // alloc Physx object
    this._pxGeometry = new PhysXPhysics.PhysX.PxSphereGeometry(radius);
    this._allocShape(material);
    this._setLocalPose();
    this.setID(index);
  }

  /**
   * set radius of sphere
   * @param value the radius
   */
  setRadius(value: number) {
    this._pxGeometry.radius = value;
    this._pxShape.setGeometry(this._pxGeometry);
  }
}
