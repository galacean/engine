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
  /** The linear damping of the dynamic collider. */
  private _drag: number;
  /** The angular damping of the dynamic collider. */
  private _angularDrag: number;
  /** The linear velocity vector of the dynamic collider measured in world unit per second. */
  private _velocity: Vector3;
  /** The angular velocity vector of the dynamic collider measured in radians per second. */
  private _angularVelocity: Vector3;
  /** The mass of the dynamic collider. */
  private _mass: number;
  private _centerOfMass: Vector3;
  private _inertiaTensor: Vector3;

  private _maxAngularVelocity: number;
  private _maxDepenetrationVelocity: number;

  private _sleepThreshold: number;
  private _solverIterations: number;

  private _collisionDetectionMode: CollisionDetectionMode;
  /** Controls whether physics affects the dynamic collider. */
  private _isKinematic: boolean;

  private _constraints: DynamicColliderConstraints;
  private _freezeRotation: boolean;

  /**
   * The drag of the object.
   */
  get linearDamping(): number {
    return this._drag;
  }

  set linearDamping(value: number) {
    this._drag = value;
    this._pxActor.setLinearDamping(value);
  }

  /**
   * The angular drag of the object.
   */
  get angularDamping(): number {
    return this._angularDrag;
  }

  set angularDamping(value: number) {
    this._angularDrag = value;
    this._pxActor.setAngularDamping(value);
  }

  /**
   * The velocity vector of the collider. It represents the rate of change of collider position.
   */
  get linearVelocity(): Vector3 {
    return this._velocity;
  }

  set linearVelocity(value: Vector3) {
    this._velocity = value;
    const vel = { x: value.x, y: value.y, z: value.z };
    this._pxActor.setLinearVelocity(vel, true);
  }

  /**
   * The angular velocity vector of the collider measured in radians per second.
   */
  get angularVelocity(): Vector3 {
    return this._angularVelocity;
  }

  set angularVelocity(value: Vector3) {
    this._angularVelocity = value;
    this._pxActor.setAngularVelocity({ x: value.x, y: value.y, z: value.z }, true);
  }

  /**
   * The mass of the collider.
   */
  get mass(): number {
    return this._mass;
  }

  set mass(value: number) {
    this._mass = value;
    this._pxActor.setMass(value);
  }

  /**
   * The center of mass relative to the transform's origin.
   */
  get centerOfMass(): Vector3 {
    return this._centerOfMass;
  }

  set centerOfMass(value: Vector3) {
    this._centerOfMass = value;
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
   * The diagonal inertia tensor of mass relative to the center of mass.
   */
  get inertiaTensor(): Vector3 {
    return this._inertiaTensor;
  }

  set inertiaTensor(value: Vector3) {
    this._inertiaTensor = value;
    this._pxActor.setMassSpaceInertiaTensor({ x: value.x, y: value.y, z: value.z });
  }

  /**
   * The maximum angular velocity of the collider measured in radians per second. (Default 7) range { 0, infinity }.
   */
  get maxAngularVelocity(): number {
    return this._maxAngularVelocity;
  }

  set maxAngularVelocity(value: number) {
    this._maxAngularVelocity = value;
    this._pxActor.setMaxAngularVelocity(value);
  }

  /**
   * Maximum velocity of a collider when moving out of penetrating state.
   */
  get maxDepenetrationVelocity(): number {
    return this._maxDepenetrationVelocity;
  }

  set maxDepenetrationVelocity(value: number) {
    this._maxDepenetrationVelocity = value;
    this._pxActor.setMaxDepenetrationVelocity(value);
  }

  /**
   * The mass-normalized energy threshold, below which objects start going to sleep.
   */
  get sleepThreshold(): number {
    return this._sleepThreshold;
  }

  set sleepThreshold(value: number) {
    this._sleepThreshold = value;
    this._pxActor.setSleepThreshold(value);
  }

  /**
   * The solverIterations determines how accurately collider joints and collision contacts are resolved.
   * Overrides Physics.defaultSolverIterations. Must be positive.
   */
  get solverIterations(): number {
    return this._solverIterations;
  }

  set solverIterations(value: number) {
    this._solverIterations = value;
    this._pxActor.setSolverIterationCounts(value, 1);
  }

  /**
   * The colliders' collision detection mode.
   */
  get collisionDetectionMode(): CollisionDetectionMode {
    return this._collisionDetectionMode;
  }

  set collisionDetectionMode(value: CollisionDetectionMode) {
    this._collisionDetectionMode = value;
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
   * Controls whether physics affects the collider.
   */
  get isKinematic(): boolean {
    return this._isKinematic;
  }

  set isKinematic(value: boolean) {
    this._isKinematic = value;
    if (value) {
      this._pxActor.setRigidBodyFlag(PhysXPhysics._physX.PxRigidBodyFlag.eKINEMATIC, true);
    } else {
      this._pxActor.setRigidBodyFlag(PhysXPhysics._physX.PxRigidBodyFlag.eKINEMATIC, false);
    }
  }

  /**
   * Controls which degrees of freedom are allowed for the simulation of this collider.
   */
  get constraints(): DynamicColliderConstraints {
    return this._constraints;
  }

  /**
   * Controls whether physics will change the rotation of the object.
   */
  get freezeRotation(): boolean {
    return this._freezeRotation;
  }

  set freezeRotation(value: boolean) {
    this._freezeRotation = value;
    this.setConstraints(DynamicColliderConstraints.FreezeRotation, value);
  }

  constructor(position: Vector3, rotation: Quaternion) {
    super();
    const transform = this._transform(position, rotation);
    this._pxActor = PhysXPhysics._pxPhysics.createRigidDynamic(transform);
  }

  /**
   * Set constraint flags
   * @param flag Collider Constraint
   * @param value true or false
   */
  setConstraints(flag: DynamicColliderConstraints, value: boolean) {
    if (value) this._constraints = this._constraints | flag;
    else this._constraints = this._constraints & ~flag;

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
   * Applies force at position. As a result this will apply a torque and force on the object.
   * @param force Force vector in world coordinates.
   * @param pos Position in world coordinates.
   */
  addForceAtPosition(force: Vector3, pos: Vector3) {
    this._pxActor.addForceAtPos({ x: force.x, y: force.y, z: force.z }, { x: pos.x, y: pos.y, z: pos.z });
  }

  /**
   * The velocity of the collider at the point worldPoint in global space.
   * @param pos The point in global space.
   */
  getPointVelocity(pos: Vector3): Vector3 {
    const vel = this._pxActor.getVelocityAtPos({ x: pos.x, y: pos.y, z: pos.z });
    return new Vector3(vel.x, vel.y, vel.z);
  }

  /**
   * The velocity relative to the collider at the point relativePoint.
   * @param pos The relative point
   */
  getRelativePointVelocity(pos: Vector3): Vector3 {
    const vel = this._pxActor.getLocalVelocityAtLocalPos({ x: pos.x, y: pos.y, z: pos.z });
    return new Vector3(vel.x, vel.y, vel.z);
  }

  /**
   * Moves the kinematic collider towards position.
   * @param value Provides the new position for the collider object.
   */
  MovePosition(value: Vector3) {
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
   * Rotates the collider to rotation.
   * @param value The new rotation for the collider.
   */
  MoveRotation(value: Quaternion) {
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
   * Is the collider sleeping?
   */
  isSleeping(): boolean {
    return this._pxActor.isSleeping();
  }

  /**
   * Forces a collider to sleep at least one frame.
   */
  sleep() {
    return this._pxActor.putToSleep();
  }

  /**
   * Forces a collider to wake up.
   */
  wakeUp() {
    return this._pxActor.wakeUp();
  }
}
