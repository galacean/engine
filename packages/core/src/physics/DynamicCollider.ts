import { IDynamicCollider } from "@oasis-engine/design";
import { UpdateFlag } from "../UpdateFlag";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { PhysicsManager } from "./PhysicsManager";
import { Vector3 } from "@oasis-engine/math";

export class DynamicCollider extends Collider {
  private readonly _dynamicCollider: IDynamicCollider;
  private _updateFlag: UpdateFlag;

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

  /** The Collider attached */
  get collider(): IDynamicCollider {
    return this._dynamicCollider;
  }

  constructor(entity: Entity) {
    super(entity);
    this._dynamicCollider = PhysicsManager.nativePhysics.createDynamicCollider(this._position, this._rotation);
    this._nativeStaticCollider = this._dynamicCollider;
    this._updateFlag = this.entity.transform.registerWorldChangeFlag();
    this._updateFlag.flag = false;
  }

  /** apply a force to the DynamicCollider. */
  applyForce(force: Vector3): void {
    this._dynamicCollider.addForce(force);
  }

  /** apply a torque to the DynamicCollider. */
  applyTorque(torque: Vector3): void {
    this._dynamicCollider.addTorque(torque);
  }

  onUpdate() {
    if (this._updateFlag.flag) {
      this._dynamicCollider.setGlobalPose(this.entity.transform.position, this.entity.transform.rotationQuaternion);
      this._updateFlag.flag = false;
    }
  }
}
