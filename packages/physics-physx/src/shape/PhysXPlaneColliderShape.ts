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
    this._pxGeometry = new physXPhysics._physX.PxPlaneGeometry();
    this._initialize(material, uniqueID);
  }

  /**
   * {@inheritDoc IColliderShape.setLocalPose }
   */
  override setLocalPose(position: Vector3, rotation: Quaternion): void {
    // Map the native plane normal from X to the engine plane’s Y axis.
    this._setLocalPose(position, rotation, PhysXPlaneColliderShape._yAxis);
  }
}
