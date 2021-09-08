import { ISphereCollider } from "@oasis-engine/design";
import { Collider } from "./Collider";
import { Entity } from "../Entity";

export class SphereCollider extends Collider {
  _sphereCollider: ISphereCollider;

  get radius(): number {
    return this._sphereCollider.radius;
  }

  /**
   * set size of collider
   * @param value size of SphereCollider
   */
  set radius(value: number) {
    this._sphereCollider.radius = value;
  }

  constructor(entity: Entity) {
    super(entity);
    this._sphereCollider = this.engine._physicsEngine.createSphereCollider();
    this._collider = this._sphereCollider;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param value size of SphereCollider
   * @remarks must call after this component add to Entity.
   */
  initWithRadius(value: number) {
    this._sphereCollider.initWithRadius(
      value,
      this.entity.transform.position,
      this.entity.transform.rotationQuaternion
    );
    this.engine.physicsManager.addStaticActor(this);
  }
}
