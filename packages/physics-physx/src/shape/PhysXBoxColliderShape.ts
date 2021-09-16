import { IBoxColliderShape } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXColliderShape } from "./PhysXColliderShape";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";

/**
 * PhysX Shape for Box
 */
export class PhysXBoxColliderShape extends PhysXColliderShape implements IBoxColliderShape {
  /**
   * init Box Shape and alloc PhysX objects.
   * @param index index mark Shape
   * @param extents size of Shape
   * @param material material of PhysXCollider
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, extents: Vector3, material: PhysXPhysicsMaterial) {
    super();
    this._pxGeometry = new PhysXPhysics.PhysX.PxBoxGeometry(extents.x * 0.5, extents.y * 0.5, extents.z * 0.5);

    this._allocShape(material);
    this._setLocalPose();
    this.setID(index);
  }

  /**
   * set size of Box Shape
   * @param value the extents
   */
  setSize(value: Vector3) {
    const { halfExtents } = this._pxGeometry;
    halfExtents.x = value.x * 0.5;
    halfExtents.y = value.y * 0.5;
    halfExtents.z = value.z * 0.5;

    this._pxShape.setGeometry(this._pxGeometry);
  }
}
