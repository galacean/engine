import { PhysXManager } from "../PhysXManager";
import { ICapsuleColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ColliderShape } from "./ColliderShape";
import { PhysicsMaterial } from "../PhysicsMaterial";

/**
 * PhysX Shape for Capsule
 */
export class CapsuleColliderShape extends ColliderShape implements ICapsuleColliderShape {
  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param radius radius of CapsuleCollider
   * @param height height of CapsuleCollider
   * @param material material of Collider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  constructor(
    index: number,
    radius: number,
    height: number,
    material: PhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ) {
    super(position, rotation);

    // alloc Physx object
    this._allocGeometry(radius, height);
    this._allocShape(material);
    this._setLocalPose(this._position, this._rotation);
    this.setID(index);
  }

  /**
   * radius of capsule
   * @param value the radius
   */
  setRadius(value: number) {
    this._pxGeometry.radius = value;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * height of capsule
   * @param value the height
   */
  setHeight(value: number) {
    this._pxGeometry.halfHeight = value / 2.0;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  private _allocGeometry(radius: number, height: number) {
    this._pxGeometry = new PhysXManager.PhysX.PxCapsuleGeometry(radius, height / 2.0);
  }
}
