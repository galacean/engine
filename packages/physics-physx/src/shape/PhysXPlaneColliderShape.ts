import { PhysXColliderShape } from "./PhysXColliderShape";
import { IPlaneColliderShape } from "@oasis-engine/design";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * PhysX Shape for Plane
 */
export class PhysXPlaneColliderShape extends PhysXColliderShape implements IPlaneColliderShape {
  /**
   * init PhysXCollider and alloc PhysX objects.
   * @param index index mark collider
   * @param material material of PhysXCollider
   * @param position position of PhysXCollider
   * @param rotation rotation of PhysXCollider
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, material: PhysXPhysicsMaterial, position: Vector3, rotation: Quaternion) {
    super(position, rotation);

    // alloc Physx object
    this._allocGeometry();
    this._allocShape(material);
    this._setLocalPose(this._position, this._rotation);
    this.setID(index);
  }

  private _allocGeometry() {
    this._pxGeometry = new PhysXPhysics.PhysX.PxPlaneGeometry();
  }
}
