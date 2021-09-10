import { Entity } from "../Entity";
import { IStaticCollider } from "@oasis-engine/design";
import { Collider } from "./Collider";

export class StaticCollider extends Collider {
  /** @internal */
  _staticCollider: IStaticCollider;

  constructor(entity: Entity) {
    super(entity);
    this._staticCollider = this.engine._physicsEngine.createStaticCollider();
    this._collider = this._staticCollider;
  }

  onUpdate() {}
}
