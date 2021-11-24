import { PhysXPhysics } from "./PhysXPhysics";
import { Quaternion, Vector3 } from "oasis-engine";
import { IDynamicCollider } from "@oasis-engine/design";
import { PhysXCollider } from "./PhysXCollider";

/**
 * The collision detection mode constants used for PhysXDynamicCollider.collisionDetectionMode.
 * */
export enum CollisionDetectionMode {
  /** Continuous collision detection is off for this dynamic collider. */
  Discrete,
  /** Continuous collision detection is on for colliding with static mesh geometry. */
  Continuous,
  /** Continuous collision detection is on for colliding with static and dynamic geometry. */
  ContinuousDynamic,
  /** Speculative continuous collision detection is on for static and dynamic geometries */
  ContinuousSpeculative
}

/**
 * A dynamic collider can act with self-defined movement or physical force
 */
export class PhysXDynamicCollider extends PhysXCollider implements IDynamicCollider {
  constructor(position: Vector3, rotation: Quaternion) {
    super();
    const transform = this._transform(position, rotation);
    this._pxActor = PhysXPhysics._pxPhysics.createRigidDynamic(transform);
  }

  /**
   * {@inheritDoc IDynamicCollider.setLinearDamping }
   */
  setLinearDamping(value: number): void {
    this._pxActor.setLinearDamping(value);
  }

  /**
   * {@inheritDoc IDynamicCollider.setAngularDamping }
   */
  setAngularDamping(value: number): void {
    this._pxActor.setAngularDamping(value);
  }

  /**
   * {@inheritDoc IDynamicCollider.setLinearVelocity }
   */
  setLinearVelocity(value: Vector3): void {
    this._pxActor.setLinearVelocity({ x: value.x, y: value.y, z: value.z }, true);
  }

  /**
   * {@inheritDoc IDynamicCollider.setAngularVelocity }
   */
  setAngularVelocity(value: Vector3): void {
    this._pxActor.setAngularVelocity({ x: value.x, y: value.y, z: value.z }, true);
  }

  /**
   * {@inheritDoc IDynamicCollider.setMass }
   */
  setMass(value: number): void {
    this._pxActor.setMass(value);
  }

  /**
   * {@inheritDoc IDynamicCollider.setCenterOfMass }
   */
  setCenterOfMass(position: Vector3): void {
    this._pxActor.setCMassLocalPose(position);
  }

  /**
   * {@inheritDoc IDynamicCollider.setInertiaTensor }
   */
  setInertiaTensor(value: Vector3): void {
    this._pxActor.setMassSpaceInertiaTensor(value);
  }

  /**
   * {@inheritDoc IDynamicCollider.setMaxAngularVelocity }
   */
  setMaxAngularVelocity(value: number): void {
    this._pxActor.setMaxAngularVelocity(value);
  }

  /**
   * {@inheritDoc IDynamicCollider.setMaxDepenetrationVelocity }
   */
  setMaxDepenetrationVelocity(value: number): void {
    this._pxActor.setMaxDepenetrationVelocity(value);
  }

  /**
   * {@inheritDoc IDynamicCollider.setSleepThreshold }
   */
  setSleepThreshold(value: number): void {
    this._pxActor.setSleepThreshold(value);
  }

  /**
   * {@inheritDoc IDynamicCollider.setSolverIterations }
   */
  setSolverIterations(value: number): void {
    this._pxActor.setSolverIterationCounts(value, 1);
  }

  /**
   * {@inheritDoc IDynamicCollider.setCollisionDetectionMode }
   */
  setCollisionDetectionMode(value: number): void {
    switch (value) {
      case CollisionDetectionMode.Continuous:
        this._pxActor.setRigidBodyFlag(PhysXPhysics._physX.PxRigidBodyFlag.eENABLE_CCD, true);
        break;
      case CollisionDetectionMode.ContinuousDynamic:
        this._pxActor.setRigidBodyFlag(PhysXPhysics._physX.PxRigidBodyFlag.eENABLE_CCD_FRICTION, true);
        break;
      case CollisionDetectionMode.ContinuousSpeculative:
        this._pxActor.setRigidBodyFlag(PhysXPhysics._physX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD, true);
        break;
      case CollisionDetectionMode.Discrete:
        this._pxActor.setRigidBodyFlag(PhysXPhysics._physX.PxRigidBodyFlag.eENABLE_CCD, false);
        this._pxActor.setRigidBodyFlag(PhysXPhysics._physX.PxRigidBodyFlag.eENABLE_CCD_FRICTION, false);
        this._pxActor.setRigidBodyFlag(PhysXPhysics._physX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD, false);
        break;
    }
  }

  /**
   * {@inheritDoc IDynamicCollider.setIsKinematic }
   */
  setIsKinematic(value: boolean): void {
    if (value) {
      this._pxActor.setRigidBodyFlag(PhysXPhysics._physX.PxRigidBodyFlag.eKINEMATIC, true);
    } else {
      this._pxActor.setRigidBodyFlag(PhysXPhysics._physX.PxRigidBodyFlag.eKINEMATIC, false);
    }
  }

  /**
   * {@inheritDoc IDynamicCollider.setFreezeRotation }
   */
  setFreezeRotation(value: boolean): void {
    this._pxActor.setFreezeRotation(value);
  }

  /**
   * {@inheritDoc IDynamicCollider.setConstraints }
   */
  setConstraints(flags: number): void {
    this._pxActor.setRigidDynamicLockFlags(flags);
  }

  /**
   * {@inheritDoc IDynamicCollider.addForce }
   */
  addForce(force: Vector3) {
    this._pxActor.addForce({ x: force.x, y: force.y, z: force.z });
  }

  /**
   * {@inheritDoc IDynamicCollider.addTorque }
   */
  addTorque(torque: Vector3) {
    this._pxActor.addTorque({ x: torque.x, y: torque.y, z: torque.z });
  }

  /**
   * {@inheritDoc IDynamicCollider.setKinematicTarget }
   */
  setKinematicTarget(position: Vector3, rotation: Quaternion): void {
    this._pxActor.setKinematicTarget(position, rotation);
  }

  /**
   * {@inheritDoc IDynamicCollider.putToSleep }
   */
  putToSleep(): void {
    return this._pxActor.putToSleep();
  }

  /**
   * {@inheritDoc IDynamicCollider.wakeUp }
   */
  wakeUp() {
    return this._pxActor.wakeUp();
  }
}
