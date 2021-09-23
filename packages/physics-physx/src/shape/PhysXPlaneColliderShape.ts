import { PhysXColliderShape } from "./PhysXColliderShape";
import { IPlaneColliderShape } from "@oasis-engine/design";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXPhysics } from "../PhysXPhysics";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**
 * PhysX Shape for Plane.
 */
export class PhysXPlaneColliderShape extends PhysXColliderShape implements IPlaneColliderShape {
  /**
   * Init PhysXCollider and alloc PhysX objects.
   * @param index - Index mark collider
   * @param material - Material of PhysXCollider
   */
  constructor(index: number, material: PhysXPhysicsMaterial) {
    super();

    this._pxGeometry = new PhysXPhysics.PhysX.PxPlaneGeometry();
    this._allocShape(material);
    this._setLocalPose();
    this.setID(index);
  }

  /**
   * {@inheritDoc IPlaneColliderShape.setRotation }
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

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  setWorldScale(scale: Vector3): void {}
}
