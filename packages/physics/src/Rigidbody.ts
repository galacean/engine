import { PhysXManager } from "./PhysXManager";
import { Component, Quaternion, Vector3 } from "oasis-engine";
import { Collider } from "./Collider";

/** The collision detection mode constants used for Rigidbody.collisionDetectionMode. */
export enum CollisionDetectionMode {
  /** Continuous collision detection is off for this Rigidbody. */
  Discrete,
  /** Continuous collision detection is on for colliding with static mesh geometry. */
  Continuous,
  /** Continuous collision detection is on for colliding with static and dynamic geometry. */
  ContinuousDynamic,
  /** Speculative continuous collision detection is on for static and dynamic geometries */
  ContinuousSpeculative
}

/** Use these flags to constrain motion of Rigidbodies. */
export enum RigidbodyConstraints {
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

/** Control of an object's position through physics simulation. */
export class Rigidbody extends Component {
  private _position: Vector3 = this.entity.transform.position;
  private _rotation: Quaternion = this.entity.transform.rotationQuaternion;
  private _collider: Collider;

  private _drag: number;
  private _angularDrag: number;

  private _velocity: Vector3;
  private _angularVelocity: Vector3;

  private _mass: number;
  private _centerOfMass: Vector3;
  private _inertiaTensor: Vector3;

  private _maxAngularVelocity: number;
  private _maxDepenetrationVelocity: number;

  private _sleepThreshold: number;
  private _solverIterations: number;

  private _collisionDetectionMode: CollisionDetectionMode;
  private _isKinematic: boolean;

  private _constraints: RigidbodyConstraints;
  private _freezeRotation: boolean;

  /**
   * PhysX rigid body object
   * @internal
   */
  _pxRigidActor: any;

  /** The drag of the object. */
  get drag(): number {
    return this._drag;
  }

  set drag(value: number) {
    this._drag = value;
    this._pxRigidActor.setLinearDamping(value);
  }

  /** The angular drag of the object. */
  get angularDrag(): number {
    return this._angularDrag;
  }

  set angularDrag(value: number) {
    this._angularDrag = value;
    this._pxRigidActor.setAngularDamping(value);
  }

  /** The velocity vector of the rigidbody. It represents the rate of change of Rigidbody position. */
  get velocity(): Vector3 {
    return this._velocity;
  }

  set velocity(value: Vector3) {
    this._velocity = value;
    const vel = { x: value.x, y: value.y, z: value.z };
    this._pxRigidActor.setLinearVelocity(vel, true);
  }

  /** The angular velocity vector of the rigidbody measured in radians per second. */
  get angularVelocity(): Vector3 {
    return this._angularVelocity;
  }

  set angularVelocity(value: Vector3) {
    this._angularVelocity = value;
    this._pxRigidActor.setAngularVelocity({ x: value.x, y: value.y, z: value.z }, true);
  }

  /** The mass of the rigidbody. */
  get mass(): number {
    return this._mass;
  }

  set mass(value: number) {
    this._mass = value;
    this._pxRigidActor.setMass(value);
  }

  /** The center of mass relative to the transform's origin. */
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
    this._pxRigidActor.setCMassLocalPose(transform);
  }

  /** The diagonal inertia tensor of mass relative to the center of mass. */
  get inertiaTensor(): Vector3 {
    return this._inertiaTensor;
  }

  set inertiaTensor(value: Vector3) {
    this._inertiaTensor = value;
    this._pxRigidActor.setMassSpaceInertiaTensor({ x: value.x, y: value.y, z: value.z });
  }

  /** The maximum angular velocity of the rigidbody measured in radians per second. (Default 7) range { 0, infinity }. */
  get maxAngularVelocity(): number {
    return this._maxAngularVelocity;
  }

  set maxAngularVelocity(value: number) {
    this._maxAngularVelocity = value;
    this._pxRigidActor.setMaxAngularVelocity(value);
  }

  /** Maximum velocity of a rigidbody when moving out of penetrating state. */
  get maxDepenetrationVelocity(): number {
    return this._maxDepenetrationVelocity;
  }

  set maxDepenetrationVelocity(value: number) {
    this._maxDepenetrationVelocity = value;
    this._pxRigidActor.setMaxDepenetrationVelocity(value);
  }

  /** The mass-normalized energy threshold, below which objects start going to sleep. */
  get sleepThreshold(): number {
    return this._sleepThreshold;
  }

  set sleepThreshold(value: number) {
    this._sleepThreshold = value;
    this._pxRigidActor.setSleepThreshold(value);
  }

  /** The solverIterations determines how accurately Rigidbody joints and collision contacts are resolved.
   * Overrides Physics.defaultSolverIterations. Must be positive.
   */
  get solverIterations(): number {
    return this._solverIterations;
  }

  set solverIterations(value: number) {
    this._solverIterations = value;
    this._pxRigidActor.setSolverIterationCounts(value, 1);
  }

  /** The Rigidbody's collision detection mode. */
  get collisionDetectionMode(): CollisionDetectionMode {
    return this._collisionDetectionMode;
  }

  set collisionDetectionMode(value: CollisionDetectionMode) {
    this._collisionDetectionMode = value;
    switch (value) {
      case CollisionDetectionMode.Continuous:
        this._pxRigidActor.setRigidBodyFlag(PhysXManager.PhysX.PxRigidBodyFlag.eENABLE_CCD, true);
        break;
      case CollisionDetectionMode.ContinuousDynamic:
        this._pxRigidActor.setRigidBodyFlag(PhysXManager.PhysX.PxRigidBodyFlag.eENABLE_CCD_FRICTION, true);
        break;
      case CollisionDetectionMode.ContinuousSpeculative:
        this._pxRigidActor.setRigidBodyFlag(PhysXManager.PhysX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD, true);
        break;
      case CollisionDetectionMode.Discrete:
        this._pxRigidActor.setRigidBodyFlag(PhysXManager.PhysX.PxRigidBodyFlag.eENABLE_CCD, false);
        this._pxRigidActor.setRigidBodyFlag(PhysXManager.PhysX.PxRigidBodyFlag.eENABLE_CCD_FRICTION, false);
        this._pxRigidActor.setRigidBodyFlag(PhysXManager.PhysX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD, false);
        break;
    }
  }

  /** Controls whether physics affects the rigidbody. */
  get isKinematic(): boolean {
    return this._isKinematic;
  }

  set isKinematic(value: boolean) {
    this._isKinematic = value;
    if (value) {
      this._pxRigidActor.setRigidBodyFlag(PhysXManager.PhysX.PxRigidBodyFlag.eKINEMATIC, true);
    } else {
      this._pxRigidActor.setRigidBodyFlag(PhysXManager.PhysX.PxRigidBodyFlag.eKINEMATIC, false);
    }
  }

  /** Controls which degrees of freedom are allowed for the simulation of this Rigidbody. */
  get constraints(): RigidbodyConstraints {
    return this._constraints;
  }

  setConstraints(flag: RigidbodyConstraints, value: boolean) {
    if (value) this._constraints = this._constraints | flag;
    else this._constraints = this._constraints & ~flag;

    switch (flag) {
      case RigidbodyConstraints.FreezePositionX:
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_LINEAR_X, value);
        break;
      case RigidbodyConstraints.FreezePositionY:
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        break;
      case RigidbodyConstraints.FreezePositionZ:
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        break;
      case RigidbodyConstraints.FreezeRotationX:
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_X, value);
        break;
      case RigidbodyConstraints.FreezeRotationY:
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Y, value);
        break;
      case RigidbodyConstraints.FreezeRotationZ:
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Z, value);
        break;
      case RigidbodyConstraints.FreezeAll:
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_LINEAR_X, value);
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_X, value);
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Y, value);
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Z, value);
        break;
      case RigidbodyConstraints.FreezePosition:
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_LINEAR_X, value);
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_LINEAR_Y, value);
        break;
      case RigidbodyConstraints.FreezeRotation:
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_X, value);
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Y, value);
        this._pxRigidActor.setRigidDynamicLockFlag(PhysXManager.PhysX.PxRigidDynamicLockFlag.eLOCK_ANGULAR_Z, value);
        break;
    }
  }

  /** Controls whether physics will change the rotation of the object. */
  get freezeRotation(): boolean {
    return this._freezeRotation;
  }

  set freezeRotation(value: boolean) {
    this._freezeRotation = value;
    this.setConstraints(RigidbodyConstraints.FreezeRotation, value);
  }

  //----------------------------------------------------------------------------
  /**
   * Adds a force to the Rigidbody.
   * @param force Force vector in world coordinates.
   * @remark addForce must called after add into scene.
   */
  addForce(force: Vector3) {
    this._pxRigidActor.addForce({ x: force.x, y: force.y, z: force.z });
  }

  /**
   * Adds a torque to the rigidbody.
   * @param torque Torque vector in world coordinates.
   * @remark addTorque must called after add into scene.
   */
  addTorque(torque: Vector3) {
    this._pxRigidActor.addTorque({ x: torque.x, y: torque.y, z: torque.z });
  }

  /**
   * Applies force at position. As a result this will apply a torque and force on the object.
   * @param force Force vector in world coordinates.
   * @param pos Position in world coordinates.
   */
  addForceAtPosition(force: Vector3, pos: Vector3) {
    this._pxRigidActor.addForceAtPos({ x: force.x, y: force.y, z: force.z }, { x: pos.x, y: pos.y, z: pos.z });
  }

  /**
   * The velocity of the rigidbody at the point worldPoint in global space.
   * @param pos The point in global space.
   */
  getPointVelocity(pos: Vector3): Vector3 {
    const vel = this._pxRigidActor.getVelocityAtPos({ x: pos.x, y: pos.y, z: pos.z });
    return new Vector3(vel.x, vel.y, vel.z);
  }

  /**
   * The velocity relative to the rigidbody at the point relativePoint.
   * @param pos The relative point
   */
  getRelativePointVelocity(pos: Vector3): Vector3 {
    const vel = this._pxRigidActor.getLocalVelocityAtLocalPos({ x: pos.x, y: pos.y, z: pos.z });
    return new Vector3(vel.x, vel.y, vel.z);
  }

  getGlobalPose(): { translation: Vector3; rotation: Quaternion } {
    const transform = this._pxRigidActor.getGlobalPose();
    return {
      translation: new Vector3(transform.translation.x, transform.translation.y, transform.translation.z),
      rotation: new Quaternion(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w)
    };
  }

  /**
   * Moves the kinematic Rigidbody towards position.
   * @param value Provides the new position for the Rigidbody object.
   */
  MovePosition(value: Vector3) {
    const transform = {
      translation: {
        x: value.x,
        y: value.y,
        z: value.z
      },
      rotation: {
        w: this.entity.transform.rotationQuaternion.w, // PHYSX uses WXYZ quaternions,
        x: this.entity.transform.rotationQuaternion.x,
        y: this.entity.transform.rotationQuaternion.y,
        z: this.entity.transform.rotationQuaternion.z
      }
    };
    this._pxRigidActor.setKinematicTarget(transform);
  }

  /**
   * Rotates the rigidbody to rotation.
   * @param value The new rotation for the Rigidbody.
   */
  MoveRotation(value: Quaternion) {
    const transform = {
      translation: {
        x: this.entity.transform.position.x,
        y: this.entity.transform.position.y,
        z: this.entity.transform.position.z
      },
      rotation: {
        w: value.w, // PHYSX uses WXYZ quaternions,
        x: value.x,
        y: value.y,
        z: value.z
      }
    };
    this._pxRigidActor.setKinematicTarget(transform);
  }

  /**
   * Is the rigidbody sleeping?
   */
  isSleeping(): boolean {
    return this._pxRigidActor.isSleeping();
  }

  /**
   * Forces a rigidbody to sleep at least one frame.
   */
  sleep() {
    return this._pxRigidActor.putToSleep();
  }

  /**
   * Forces a rigidbody to wake up.
   */
  wakeUp() {
    return this._pxRigidActor.wakeUp();
  }

  //----------------------------------------------------------------------------
  /** The position of the rigidbody. */
  get position(): Vector3 {
    return this._position;
  }

  /** The rotation of the Rigidbody. */
  get rotation(): Quaternion {
    return this._rotation;
  }

  /**
   * init RigidBody and alloc PhysX objects.
   * @param position
   * @param rotation
   */
  init(position?: Vector3, rotation?: Quaternion) {
    if (position != undefined) {
      this._position = position;
    }

    if (rotation != undefined) {
      this._rotation = rotation;
    }
    this._allocActor();
  }

  /** The Collider attached */
  get collider(): Collider {
    return this._collider;
  }

  /**
   * attach Collider with Rigidbody
   * @param shape The Collider attached
   * @remark must call after init.
   */
  attachShape(shape: Collider) {
    this._collider = shape;
    this._pxRigidActor.attachShape(shape._pxShape);
  }

  //----------------------------------------------------------------------------
  private _allocActor() {
    const transform = {
      translation: {
        x: this._position.x,
        y: this._position.y,
        z: this._position.z
      },
      rotation: {
        w: this._rotation.w, // PHYSX uses WXYZ quaternions,
        x: this._rotation.x,
        y: this._rotation.y,
        z: this._rotation.z
      }
    };
    this._pxRigidActor = PhysXManager.physics.createRigidDynamic(transform);
  }
}
