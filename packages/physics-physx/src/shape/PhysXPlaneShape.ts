import { IPlaneShape } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXShape } from "./PhysXShape";

/**
 * Plane shape in PhysX.
 */
export class PhysXPlaneShape extends PhysXShape implements IPlaneShape {
  constructor(physXPhysics: PhysXPhysics, uniqueID: number, material: PhysXPhysicsMaterial) {
    super();
    this._pxGeometry = new physXPhysics._physX.PxPlaneGeometry();
    this._initialize(physXPhysics, material, uniqueID);
  }

  /**
   * {@inheritDoc IPhysicsShape.setLocalPose }
   */
  override setLocalPose(position: Vector3, rotation: Quaternion): void {
    // Map the native plane normal from X to the engine plane’s Y axis.
    this._setLocalPose(position, rotation, PhysXPlaneShape._yAxis);
  }
}
