import { IDynamicCollider } from "@oasis-engine/design";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { PhysicsManager } from "./PhysicsManager";
import { Vector3 } from "@oasis-engine/math";

/** A dynamic collider can act with self-defined movement or physical force */
export class DynamicCollider extends Collider {
  private readonly _nativeDynamicCollider: IDynamicCollider;

  /** The linear velocity vector of the RigidBody measured in world unit per second. */
  linearVelocity: Vector3;
  /** The angular velocity vector of the RigidBody measured in radians per second. */
  angularVelocity: Vector3;
  /** The linear damping of the RigidBody. */
  linearDamping: number;
  /** The angular damping of the RigidBody. */
  angularDamping: number;
  /** The mass of the RigidBody. */
  mass: number;
  /** Controls whether physics affects the RigidBody. */
  isKinematic: boolean;

  /** The collider attached */
  get collider(): IDynamicCollider {
    return this._nativeDynamicCollider;
  }

  constructor(entity: Entity) {
    super(entity);
    this._nativeDynamicCollider = PhysicsManager.nativePhysics.createDynamicCollider(this._position, this._rotation);
    this._nativeStaticCollider = this._nativeDynamicCollider;
  }

  /**
   * apply a force to the DynamicCollider.
   * @param force the force make the collider move
   */
  applyForce(force: Vector3): void {
    this._nativeDynamicCollider.addForce(force);
  }

  /**
   * apply a torque to the DynamicCollider.
   * @param torque the force make the collider rotate
   */
  applyTorque(torque: Vector3): void {
    this._nativeDynamicCollider.addTorque(torque);
  }
}
