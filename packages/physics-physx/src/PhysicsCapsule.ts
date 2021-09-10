import { PhysXManager } from "./PhysXManager";
import { IPhysicsCapsule } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ColliderShape } from "./ColliderShape";

/** Physics Shape for Capsule */
export class PhysicsCapsule extends ColliderShape implements IPhysicsCapsule {
  private _radius: number = 1.0;
  private _height: number = 2.0;

  /** radius of capsule */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    this._radius = value;
    this._pxGeometry.radius = value;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /** height of capsule */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this._height = value;
    this._pxGeometry.halfHeight = value / 2.0;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param radius radius of CapsuleCollider
   * @param height height of CapsuleCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithRadiusHeight(index: number, radius: number, height: number, position: Vector3, rotation: Quaternion) {
    this._radius = radius;
    this._height = height;
    this._position = position;
    this._rotation = rotation;

    // alloc Physx object
    this._allocGeometry();
    this._allocShape();
    this._setLocalPose(this._position, this._rotation);
    this._pxShape.setQueryFilterData(new PhysXManager.PhysX.PxFilterData(index, 0, 0, 0));
  }

  //----------------------------------------------------------------------------
  private _allocGeometry() {
    this._pxGeometry = new PhysXManager.PhysX.PxCapsuleGeometry(this._radius, this._height / 2.0);
  }
}
