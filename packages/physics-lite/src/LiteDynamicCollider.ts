import { LiteCollider } from "./LiteCollider";
import { IDynamicCollider } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "oasis-engine";

/**
 * A dynamic collider can act with self-defined movement or physical force
 */
export class LiteDynamicCollider extends LiteCollider implements IDynamicCollider {
  /**
   * Initialize dynamic actor.
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
    throw "Physics-lite don't support addForce. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IDynamicCollider.addTorque }
   */
  addTorque(torque: Vector3): void {
    throw "Physics-lite don't support addTorque. Use Physics-PhysX instead!";
  }

  addForceAtPosition(force: Vector3, pos: Vector3): void {
    throw "Physics-lite don't support addForceAtPosition. Use Physics-PhysX instead!";
  }

  movePosition(value: Vector3): void {
    throw "Physics-lite don't support movePosition. Use Physics-PhysX instead!";
  }

  moveRotation(value: Quaternion): void {
    throw "Physics-lite don't support moveRotation. Use Physics-PhysX instead!";
  }

  putToSleep(): void {
    throw "Physics-lite don't support putToSleep. Use Physics-PhysX instead!";
  }

  setAngularDamping(value: number): void {
    throw "Physics-lite don't support setAngularDamping. Use Physics-PhysX instead!";
  }

  setAngularVelocity(value: Vector3): void {
    throw "Physics-lite don't support setAngularVelocity. Use Physics-PhysX instead!";
  }

  setCenterOfMass(value: Vector3): void {
    throw "Physics-lite don't support setCenterOfMass. Use Physics-PhysX instead!";
  }

  setCollisionDetectionMode(value: number): void {
    throw "Physics-lite don't support setCollisionDetectionMode. Use Physics-PhysX instead!";
  }

  setFreezeRotation(value: boolean): void {
    throw "Physics-lite don't support setFreezeRotation. Use Physics-PhysX instead!";
  }

  setInertiaTensor(value: Vector3): void {
    throw "Physics-lite don't support setInertiaTensor. Use Physics-PhysX instead!";
  }

  setIsKinematic(value: boolean): void {
    throw "Physics-lite don't support setIsKinematic. Use Physics-PhysX instead!";
  }

  setLinearDamping(value: number): void {
    throw "Physics-lite don't support setLinearDamping. Use Physics-PhysX instead!";
  }

  setLinearVelocity(value: Vector3): void {
    throw "Physics-lite don't support setLinearVelocity. Use Physics-PhysX instead!";
  }

  setMass(value: number): void {
    throw "Physics-lite don't support setMass. Use Physics-PhysX instead!";
  }

  setMaxAngularVelocity(value: number): void {
    throw "Physics-lite don't support setMaxAngularVelocity. Use Physics-PhysX instead!";
  }

  setMaxDepenetrationVelocity(value: number): void {
    throw "Physics-lite don't support setMaxDepenetrationVelocity. Use Physics-PhysX instead!";
  }

  setSleepThreshold(value: number): void {
    throw "Physics-lite don't support setSleepThreshold. Use Physics-PhysX instead!";
  }

  setSolverIterations(value: number): void {
    throw "Physics-lite don't support setSolverIterations. Use Physics-PhysX instead!";
  }

  wakeUp(): void {
    throw "Physics-lite don't support wakeUp. Use Physics-PhysX instead!";
  }
}
