import { IPhysicsBox } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PhysXManager } from "./PhysXManager";
import { PhysicsShape } from "./PhysicsShape";

export class PhysicsBox extends PhysicsShape implements IPhysicsBox {
  private _size: Vector3 = new Vector3();

  /**
   * size of Box
   */
  get size(): Vector3 {
    return this._size;
  }

  set size(value: Vector3) {
    this._size = value;
    Vector3.scale(value, 0.5, this._size);
    this._pxGeometry.halfExtents = this._size;
    this._pxShape.setGeometry(this._pxGeometry);
  }

  /**
   * init Box Shape and alloc PhysX objects.
   * @param index index mark Shape
   * @param value size of Shape
   * @param position position of Shape
   * @param rotation rotation of Shape
   * @remarks must call after this component add to Entity.
   */
  initWithSize(index: number, value: Vector3, position: Vector3, rotation: Quaternion): void {
    this._size = value;
    this._position = position;
    this._rotation = rotation;

    // alloc Physx object
    this._allocGeometry();
    this._allocShape();
    this._setIndex(index);
    this.setLocalPose(this._position, this._rotation);
  }

  //----------------------------------------------------------------------------
  private _allocGeometry() {
    this._pxGeometry = new PhysXManager.PhysX.PxBoxGeometry(
      // PHYSX uses half-extents
      this._size.x / 2,
      this._size.y / 2,
      this._size.z / 2
    );
  }
}
