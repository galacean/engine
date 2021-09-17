import { IDynamicCollider } from "@oasis-engine/design";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { PhysicsManager } from "./PhysicsManager";
import { Vector3 } from "@oasis-engine/math";

/**
 * A dynamic collider can act with self-defined movement or physical force
 */
export class DynamicCollider extends Collider {
  /** The linear velocity vector of the dynamic collider measured in world unit per second. */
  linearVelocity: Vector3;
  /** The angular velocity vector of the dynamic collider measured in radians per second. */
  angularVelocity: Vector3;
  /** The linear damping of the dynamic collider. */
  linearDamping: number;
  /** The angular damping of the dynamic collider. */
  angularDamping: number;
  /** The mass of the dynamic collider. */
  mass: number;
  /** Controls whether physics affects the dynamic collider. */
  isKinematic: boolean;

  constructor(entity: Entity) {
    super(entity);
    const { transform } = this.entity;
    this._nativeCollider = PhysicsManager.nativePhysics.createDynamicCollider(
      transform.worldPosition,
      transform.worldRotationQuaternion
    );
  }

  /**
   * Apply a force to the DynamicCollider.
   * @param force the force make the collider move
   */
  applyForce(force: Vector3): void {
    (<IDynamicCollider>this._nativeCollider).addForce(force);
  }

  /**
   * Apply a torque to the DynamicCollider.
   * @param torque the force make the collider rotate
   */
  applyTorque(torque: Vector3): void {
    (<IDynamicCollider>this._nativeCollider).addTorque(torque);
  }

  _onUpdate() {
    const { transform } = this.entity;
    if (this._updateFlag.flag) {
      this._nativeCollider.setWorldTransform(transform.worldPosition, transform.worldRotationQuaternion);
      this._updateFlag.flag = false;

      const worldScale = transform.lossyWorldScale;
      for (let i = 0, n = this.shapes.length; i < n; i++) {
        this.shapes[i]._nativeShape.setWorldScale(worldScale);
      }
    } else {
      this._nativeCollider.getWorldTransform(transform.worldPosition, transform.worldRotationQuaternion);
    }
  }
}
