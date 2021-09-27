import { LiteCollider } from "./LiteCollider";
import { IDynamicCollider } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**
 * A static collider component that will not move.
 * @remarks Mostly used for object which always stays at the same place and never moves around.
 */
export class LiteDynamicCollider extends LiteCollider implements IDynamicCollider {
  angularDamping: number;
  angularVelocity: Vector3;
  isKinematic: boolean;
  linearDamping: number;
  linearVelocity: Vector3;
  mass: number;

  /**
   * Initialize static actor.
   * @param position - The global position
   * @param rotation - The global rotation
   */
  constructor(position: Vector3, rotation: Quaternion) {
    super();
    this._transform.setPosition(position.x, position.y, position.z);
    this._transform.setRotationQuaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  /**
   * {@inheritDoc IDynamicCollider.addForce }
   */
  addForce(force: Vector3): void {
    throw "unimplemented";
  }

  /**
   * {@inheritDoc IDynamicCollider.addTorque }
   */
  addTorque(torque: Vector3): void {
    throw "unimplemented";
  }
}
