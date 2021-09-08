import { Entity } from "../Entity";
import { Vector3 } from "@oasis-engine/math";
import { Collider } from "./Collider";
import { IBoxCollider } from "@oasis-engine/design";

export class BoxCollider extends Collider {
  _boxCollider: IBoxCollider;

  get size(): Vector3 {
    return this._boxCollider.size;
  }

  /**
   * set size of collider
   * @param value size of BoxCollider
   */
  set size(value: Vector3) {
    this._boxCollider.size = value;
  }

  constructor(entity: Entity) {
    super(entity);
    this._boxCollider = this.engine._physicsEngine.createBoxCollider();
    this._collider = this._boxCollider;
    this._updateFlag = this.entity.transform.registerWorldChangeFlag();
    this._updateFlag.flag = false;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param value size of BoxCollider
   * @remarks must call after this component add to Entity.
   */
  initWithSize(value: Vector3) {
    this._boxCollider.initWithSize(
      this._index,
      value,
      this.entity.transform.position,
      this.entity.transform.rotationQuaternion
    );
    this.engine.physicsManager.addStaticActor(this);
  }
}
