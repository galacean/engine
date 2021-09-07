import { PhysXManager } from "./PhysXManager";
import { Collider } from "./Collider";
import { ICapsuleCollider } from "@oasis-engine/design";

export class CapsuleCollider extends Collider implements ICapsuleCollider {
  private _radius: number = 0.0;
  private _height: number = 0.0;

  get radius(): number {
    return this._radius;
  }

  /**
   * set size of collider
   * @param value size of SphereCollider
   * @remarks will re-alloc new PhysX object.
   */
  set radius(value: number) {
    this._radius = value;
    this._pxGeometry.radius = value;
    this._pxShape.setGeometry(this._pxGeometry);
  }

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
   * @param radius radius of CapsuleCollider
   * @param height height of CapsuleCollider
   * @remarks must call after this component add to Entity.
   */
  initWithRadiusHeight(radius: number, height: number) {
    this._radius = radius;
    this._height = height;

    // alloc Physx object
    this._allocGeometry();
    this._allocShape();
    this._setLocalPose();
    this._pxShape.setQueryFilterData(new PhysXManager.PhysX.PxFilterData(this._group_id, 0, 0, 0));
    this._allocActor();
  }

  //----------------------------------------------------------------------------
  private _allocGeometry() {
    this._pxGeometry = new PhysXManager.PhysX.PxCapsuleGeometry(this._radius, this._height / 2.0);
  }
}
