import { IPhysicsBox } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PhysXManager } from "./PhysXManager";
import { PhysicsShape } from "./PhysicsShape";

/**Physics Shape for Box */
export class PhysicsBox extends PhysicsShape implements IPhysicsBox {
  private _extents: Vector3 = new Vector3(1, 1, 1);
  private _tempHalfExtents: Vector3 = new Vector3(0.5, 0.5, 0.5);

  /** extents of Box */
  get extents(): Vector3 {
    return this._extents;
  }

  set extents(value: Vector3) {
    this._extents = value;
    const halfExtents = this.halfExtents;

    this._pxGeometry.halfExtents = {
      x: halfExtents.x,
      y: halfExtents.y,
      z: halfExtents.z
    };
    this._pxShape.setGeometry(this._pxGeometry);
  }

  get halfExtents(): Vector3 {
    Vector3.scale(this._extents, 0.5, this._tempHalfExtents);
    return this._tempHalfExtents;
  }

  /**
   * init Box Shape and alloc PhysX objects.
   * @param index index mark Shape
   * @param extents size of Shape
   * @param position position of Shape
   * @param rotation rotation of Shape
   * @remarks must call after this component add to Entity.
   */
  initWithSize(index: number, extents: Vector3, position: Vector3, rotation: Quaternion): void {
    this._extents = extents;
    this._position = position;
    this._rotation = rotation;

    // alloc Physx object
    this._allocGeometry();
    this._allocShape();
    this._setIndex(index);
    this.setLocalPose(this._position, this._rotation);
  }

  private _allocGeometry() {
    const halfExtents = this.halfExtents;
    this._pxGeometry = new PhysXManager.PhysX.PxBoxGeometry(halfExtents.x, halfExtents.y, halfExtents.z);
  }
}
