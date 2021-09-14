import { PhysXManager } from "../PhysXManager";
import { ISphereColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ColliderShape } from "./ColliderShape";
import { PhysicsMaterial } from "../PhysicsMaterial";

/**
 * PhysX Shape for Sphere
 */
export class SphereColliderShape extends ColliderShape implements ISphereColliderShape {
  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param radius size of SphereCollider
   * @param material material of Collider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, radius: number, material: PhysicsMaterial, position: Vector3, rotation: Quaternion) {
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
    this._pxGeometry = new PhysXManager.PhysX.PxSphereGeometry(radius);
  }
}
