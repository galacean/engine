import { PhysXColliderShape } from "./PhysXColliderShape";
import { IPlaneColliderShape } from "@oasis-engine/design";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXPhysics } from "../PhysXPhysics";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**
 * PhysX Shape for Plane
 */
export class PhysXPlaneColliderShape extends PhysXColliderShape implements IPlaneColliderShape {
  /**
   * Init PhysXCollider and alloc PhysX objects.
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

  /**
   * Set local rotation
   * @param value the local rotation
   */
  setRotation(value: Vector3): void {
    Quaternion.rotationYawPitchRoll(value.x, value.y, value.z, this._rotation);
    Quaternion.rotateZ(this._rotation, Math.PI * 0.5, this._rotation);
    this._rotation.normalize();
    const { rotation } = PhysXColliderShape.transform;
    rotation.x = this._rotation.x;
    rotation.y = this._rotation.y;
    rotation.z = this._rotation.z;
    rotation.w = this._rotation.w;

    this._setLocalPose();
  }
}
