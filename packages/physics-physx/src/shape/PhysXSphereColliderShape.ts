import { PhysXPhysics } from "../PhysXPhysics";
import { ISphereColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
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
   * @param position position of PhysXCollider
   * @param rotation rotation of PhysXCollider
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, radius: number, material: PhysXPhysicsMaterial, position: Vector3, rotation: Quaternion) {
    super(position, rotation);

    // alloc Physx object
    this._allocGeometry(radius);
    this._allocShape(material);
    this._setLocalPose(this._position, this._rotation);
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

  private _allocGeometry(radius: number) {
    this._pxGeometry = new PhysXPhysics.PhysX.PxSphereGeometry(radius);
  }
}
