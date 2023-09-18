import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { PhysicsScene } from "./PhysicsScene";

/**
 * A static collider component that will not move.
 * @remarks Mostly used for object which always stays at the same place and never moves around.
 */
export class StaticCollider extends Collider {
  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    const { transform } = this.entity;
    this._nativeCollider = PhysicsScene._nativePhysics.createStaticCollider(
      transform.worldPosition,
      transform.worldRotationQuaternion
    );
  }
}
