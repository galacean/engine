import { IPlaneColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "oasis-engine";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape } from "./PhysXColliderShape";

/**
 * Plane collider shape in PhysX.
 */
export class PhysXPlaneColliderShape extends PhysXColliderShape implements IPlaneColliderShape {
  /**
   * Init PhysXCollider and alloc PhysX objects.
   * @param uniqueID - UniqueID mark collider
   * @param material - Material of PhysXCollider
   */
  constructor(uniqueID: number, material: PhysXPhysicsMaterial) {
    super();
    this._axis = new Quaternion(0, 0, PhysXColliderShape.halfSqrt, PhysXColliderShape.halfSqrt);
    this._physxRotation.copyFrom(this._axis);

    this._pxGeometry = new PhysXPhysics._physX.PxPlaneGeometry();
    this._initialize(material, uniqueID);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  setWorldScale(scale: Vector3): void {
    this._scale.copyFrom(scale);
    this._setLocalPose();
  }
}
