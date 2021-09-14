import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { PhysicsManager } from "./PhysicsManager";

/**
 * A static rigid body collider component that will not move when colliding with a dynamic collider.
 * @remarks Mostly used for object which always stays at the same place and never moves around.
 */
export class StaticCollider extends Collider {
  constructor(entity: Entity) {
    super(entity);
    this._nativeStaticCollider = PhysicsManager.nativePhysics.createStaticCollider(this._position, this._rotation);
  }
}
