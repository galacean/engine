import { IPlaneColliderShape } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape } from "./PhysXColliderShape";

/**
 * Plane collider shape in PhysX.
 */
export class PhysXPlaneColliderShape extends PhysXColliderShape implements IPlaneColliderShape {
  constructor(physXPhysics: PhysXPhysics, uniqueID: number, material: PhysXPhysicsMaterial) {
    super(physXPhysics);
    this._axis = new Quaternion(0, 0, PhysXColliderShape.halfSqrt, PhysXColliderShape.halfSqrt);
    this._physXRotation.copyFrom(this._axis);

    this._pxGeometry = new physXPhysics._physX.PxPlaneGeometry();
    this._initialize(material, uniqueID);
    this._setLocalPose();
  }
}
