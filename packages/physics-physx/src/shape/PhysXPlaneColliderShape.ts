import { IPlaneColliderShape } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape } from "./PhysXColliderShape";

/**
 * Plane collider shape in PhysX.
 */
export class PhysXPlaneColliderShape extends PhysXColliderShape implements IPlaneColliderShape {
  private static readonly _origin = new Vector3();
  private static readonly _identity = new Quaternion();

  constructor(physXPhysics: PhysXPhysics, uniqueID: number, material: PhysXPhysicsMaterial) {
    super(physXPhysics);
    this._pxGeometry = new physXPhysics._physX.PxPlaneGeometry();
    this._initialize(material, uniqueID);
    this._setLocalPose(
      PhysXPlaneColliderShape._origin,
      PhysXPlaneColliderShape._identity,
      PhysXPlaneColliderShape._yAxis
    );
  }

  /**
   * {@inheritDoc IColliderShape.setLocalPose}
   */
  override setLocalPose(position: Vector3, rotation: Quaternion): void {
    this._setLocalPose(position, rotation, PhysXPlaneColliderShape._yAxis);
  }
}
