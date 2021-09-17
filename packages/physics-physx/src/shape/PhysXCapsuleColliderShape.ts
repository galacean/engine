import { PhysXPhysics } from "../PhysXPhysics";
import { ICapsuleColliderShape } from "@oasis-engine/design";
import { PhysXColliderShape } from "./PhysXColliderShape";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";

/**
 * The up axis of the collider shape.
 */
export enum ColliderShapeUpAxis {
  /** Up axis is X. */
  X,
  /** Up axis is Y. */
  Y,
  /** Up axis is Z. */
  Z
}

/**
 * PhysX Shape for Capsule
 */
export class PhysXCapsuleColliderShape extends PhysXColliderShape implements ICapsuleColliderShape {
  /**
   * Init PhysXCollider and alloc PhysX objects.
   * @param index index mark collider
   * @param radius radius of CapsuleCollider
   * @param height height of CapsuleCollider
   * @param material material of PhysXCollider
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, radius: number, height: number, material: PhysXPhysicsMaterial) {
    super();

    // alloc Physx object
    this._pxGeometry = new PhysXPhysics.PhysX.PxCapsuleGeometry(radius, height * 0.5);
    this._allocShape(material);
    this._setLocalPose();
    this.setID(index);
  }

  /**
   * Radius of capsule
   * @param value the radius
   */
  setRadius(value: number) {
    this._pxGeometry.radius = value;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * Height of capsule
   * @param value the height
   */
  setHeight(value: number) {
    this._pxGeometry.halfHeight = value / 2.0;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * direction of capsule
   * @param dir the up axis
   */
  setDirection(dir: ColliderShapeUpAxis): void {
    switch (dir) {
      case ColliderShapeUpAxis.X:
        this._rotation.setValue(0, 0, 0, 1);
        break;
      case ColliderShapeUpAxis.Y:
        this._rotation.setValue(PhysXColliderShape.halfSqrt, 0, 0, PhysXColliderShape.halfSqrt);
        break;
      case ColliderShapeUpAxis.Z:
        this._rotation.setValue(0, PhysXColliderShape.halfSqrt, 0, PhysXColliderShape.halfSqrt);
        break;
    }
    const { rotation } = PhysXColliderShape.transform;
    rotation.x = this._rotation.x;
    rotation.y = this._rotation.y;
    rotation.z = this._rotation.z;
    rotation.w = this._rotation.w;
    this._setLocalPose();
  }
}
