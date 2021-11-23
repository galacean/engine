import { PhysXPhysics } from "./PhysXPhysics";
import { Quaternion, Vector3 } from "oasis-engine";
import { IDynamicCollider } from "@oasis-engine/design";
import { PhysXCollider } from "./PhysXCollider";

/** The collision detection mode constants used for PhysXDynamicCollider.collisionDetectionMode. */
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

/** Use these flags to constrain motion of dynamic collider. */
export enum DynamicColliderConstraints {
  /** Freeze motion along the X-axis. */
  FreezePositionX,
  /** Freeze motion along the Y-axis. */
  FreezePositionY,
  /** Freeze motion along the Z-axis. */
  FreezePositionZ,
  /** Freeze rotation along the X-axis. */
  FreezeRotationX,
  /** Freeze rotation along the Y-axis. */
  FreezeRotationY,
  /** Freeze rotation along the Z-axis. */
  FreezeRotationZ,
  /** Freeze motion along all axes. */
  FreezePosition,
  /** Freeze rotation along all axes. */
  FreezeRotation,
  /** Freeze rotation and motion along all axes. */
  FreezeAll
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
  setCenterOfMass(value: Vector3): void {
    const transform = {
      translation: {
        x: value.x,
        y: value.y,
        z: value.z
      },
      rotation: {
        w: 1,
        x: 0,
        y: 0,
        z: 0
      }
    };
    this._pxActor.setCMassLocalPose(transform);
  }

  /**
   * {@inheritDoc IDynamicCollider.setInertiaTensor }
   */
  setInertiaTensor(value: Vector3): void {
    this._pxActor.setMassSpaceInertiaTensor({ x: value.x, y: value.y, z: value.z });
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
    this._setConstraints(DynamicColliderConstraints.FreezeRotation, value);
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
   * {@inheritDoc IDynamicCollider.addForceAtPosition }
   */
  addForceAtPosition(force: Vector3, pos: Vector3) {
    this._pxActor.addForceAtPos({ x: force.x, y: force.y, z: force.z }, { x: pos.x, y: pos.y, z: pos.z });
  }

  /**
   * {@inheritDoc IDynamicCollider.movePosition }
   */
  movePosition(value: Vector3): void {
    const transform = {
      translation: {
        x: value.x,
        y: value.y,
        z: value.z
      },
      rotation: {
        w: 1,
        x: 0,
        y: 0,
        z: 0
      }
    };
    this._pxActor.setKinematicTarget(transform);
  }

  /**
   * {@inheritDoc IDynamicCollider.moveRotation }
   */
  moveRotation(value: Quaternion): void {
    const transform = {
      translation: {
        x: 0,
        y: 0,
        z: 0
      },
      rotation: {
        w: value.w,
        x: value.x,
        y: value.y,
        z: value.z
      }
    };
    this._pxActor.setKinematicTarget(transform);
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

  private _setConstraints(flag: DynamicColliderConstraints, value: boolean) {
    switch (flag) {
      case DynamicColliderConstraints.FreezePositionX:
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_LINEAR_X, value);
        break;
      case DynamicColliderConstraints.FreezePositionY:
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        break;
      case DynamicColliderConstraints.FreezePositionZ:
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        break;
      case DynamicColliderConstraints.FreezeRotationX:
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_X, value);
        break;
      case DynamicColliderConstraints.FreezeRotationY:
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Y, value);
        break;
      case DynamicColliderConstraints.FreezeRotationZ:
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Z, value);
        break;
      case DynamicColliderConstraints.FreezeAll:
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_LINEAR_X, value);
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_X, value);
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Y, value);
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Z, value);
        break;
      case DynamicColliderConstraints.FreezePosition:
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_LINEAR_X, value);
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        break;
      case DynamicColliderConstraints.FreezeRotation:
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_X, value);
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Y, value);
        this._pxActor.setRigidDynamicLockFlag(PhysXPhysics._physX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Z, value);
        break;
    }
  }
}
