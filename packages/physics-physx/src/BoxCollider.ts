import { PhysXManager } from "./PhysXManager";
import { Collider } from "./Collider";
import { Vector3 } from "oasis-engine";

export class BoxCollider extends Collider {
  private _size: Vector3 = new Vector3();

  get size(): Vector3 {
    return this._size;
  }

  /**
   * set size of collider
   * @param value size of BoxCollider
   * @remarks will re-alloc new PhysX object.
   */
  set size(value: Vector3) {
    this._size = value;
    this.initWithSize(value);
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param value size of BoxCollider
   * @remarks must call after this component add to Entity.
   */
  initWithSize(value: Vector3) {
    this._size = value;

    // alloc Physx object
    this._allocGeometry();
    this._allocShape();
    this._setLocalPose();
    this._pxShape.setQueryFilterData(new PhysXManager.PhysX.PxFilterData(this._group_id, 0, 0, 0));
    this._allocActor();
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
