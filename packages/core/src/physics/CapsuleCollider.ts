import { ICapsuleCollider } from "@oasis-engine/design";
import { Collider } from "./Collider";
import { Entity } from "../Entity";

export class CapsuleCollider extends Collider {
  _capsuleCollider: ICapsuleCollider;

  get radius(): number {
    return this._capsuleCollider.radius;
  }

  /**
   * set size of collider
   * @param value size of SphereCollider
   */
  set radius(value: number) {
    this._capsuleCollider.radius = value;
  }

  get height(): number {
    return this._capsuleCollider.height;
  }

  set height(value: number) {
    this._capsuleCollider.height = value;
  }

  constructor(entity: Entity) {
    super(entity);
    this._capsuleCollider = this.engine._physicsEngine.createCapsuleCollider();
    this._collider = this._capsuleCollider;
    this._updateFlag = this.entity.transform.registerWorldChangeFlag();
    this._updateFlag.flag = false;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param radius radius of CapsuleCollider
   * @param height height of CapsuleCollider
   * @remarks must call after this component add to Entity.
   */
  initWithRadiusHeight(radius: number, height: number) {
    this._capsuleCollider.initWithRadiusHeight(
      this._index,
      radius,
      height,
      this.entity.transform.position,
      this.entity.transform.rotationQuaternion
    );
    this.engine.physicsManager.addStaticActor(this);
  }
}
