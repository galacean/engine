import { PhysXManager } from "./PhysXManager";
import { Collider } from "./Collider";
import { Entity, Vector3 } from "oasis-engine";

export class BoxCollider extends Collider {
  private _size: Vector3 = new Vector3();
  private _pxGeometry: any;

  get size(): Vector3 {
    return this._size;
  }

  set size(value: Vector3) {
    this._size = value;

    this._pxGeometry = new PhysXManager.PhysX.PxBoxGeometry(
      // PHYSX uses half-extents
      this._size.x / 2,
      this._size.y / 2,
      this._size.z / 2
    );
    this._pxShape = PhysXManager.physics.createShape(this._pxGeometry, this._material, false, this._shapeFlags);
  }

  constructor(entity: Entity) {
    super(entity);

    // alloc Physx object
    this.size = new Vector3();
    this.center = new Vector3();
    this._pxShape.setQueryFilterData(new PhysXManager.PhysX.PxFilterData(this._group_id, 0, 0, 0));
    this.attachActor();
  }
}
