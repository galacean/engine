import { Entity } from "../Entity";
import { IStaticCollider } from "@oasis-engine/design";
import { Collider } from "./Collider";
import { PhysicsManager } from "./PhysicsManager";

export class StaticCollider extends Collider {
  /** @internal */
  _staticCollider: IStaticCollider;

  constructor(entity: Entity) {
    super(entity);
    this._staticCollider = PhysicsManager.nativePhysics.createStaticCollider();
    this._collider = this._staticCollider;
  }

  onUpdate() {}
}
