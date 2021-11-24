import { IDynamicCollider } from "@oasis-engine/design";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { PhysicsManager } from "./PhysicsManager";
import { Vector3, Quaternion } from "@oasis-engine/math";

/**
 * The collision detection mode constants used for PhysXDynamicCollider.collisionDetectionMode.
 */
export enum CollisionDetectionMode {
  /// Continuous collision detection is off for this dynamic collider.
  Discrete,
  /// Continuous collision detection is on for colliding with static mesh geometry.
  Continuous,
  /// Continuous collision detection is on for colliding with static and dynamic geometry.
  ContinuousDynamic,
  /// Speculative continuous collision detection is on for static and dynamic geometries
  ContinuousSpeculative
}

/**
 * Use these flags to constrain motion of dynamic collider.
 */
export enum DynamicColliderConstraints {
  /** Freeze motion along the X-axis. */
  FreezePositionX = 1,
  /** Freeze motion along the Y-axis. */
  FreezePositionY = 2,
  /** Freeze motion along the Z-axis. */
  FreezePositionZ = 4,
  /** Freeze rotation along the X-axis. */
  FreezeRotationX = 8,
  /** Freeze rotation along the Y-axis. */
  FreezeRotationY = 16,
  /** Freeze rotation along the Z-axis. */
  FreezeRotationZ = 32
}

/**
 * A dynamic collider can act with self-defined movement or physical force.
 */
export class DynamicCollider extends Collider {
  private _linearDamping: number = 0;
  private _angularDamping: number = 0;
  private _linearVelocity = new Vector3();
  private _angularVelocity = new Vector3();
  private _mass: number = 0;
  private _centerOfMass = new Vector3();
  private _inertiaTensor = new Vector3();
  private _maxAngularVelocity: number = 0;
  private _maxDepenetrationVelocity: number = 0;
  private _sleepThreshold: number = 0;
  private _solverIterations: number = 0;
  private _isKinematic: boolean = false;
  private _freezeRotation: boolean = false;
  private _constraints: number = 0;
  private _collisionDetectionMode: CollisionDetectionMode = CollisionDetectionMode.Discrete;

  /**
   * The linear damping of the dynamic collider.
   */
  get linearDamping(): number {
    return this._linearDamping;
  }

  set linearDamping(newValue: number) {
    this._linearDamping = newValue;
    (<IDynamicCollider>this._nativeCollider).setLinearDamping(newValue);
  }

  /**
   * The angular damping of the dynamic collider.
   */
  get angularDamping(): number {
    return this._angularDamping;
  }

  set angularDamping(newValue: number) {
    this._angularDamping = newValue;
    (<IDynamicCollider>this._nativeCollider).setAngularDamping(newValue);
  }

  /**
   * The linear velocity vector of the dynamic collider measured in world unit per second.
   */
  get linearVelocity(): Vector3 {
    return this._linearVelocity;
  }

  set linearVelocity(newValue: Vector3) {
    if (this._linearVelocity !== newValue) {
      newValue.cloneTo(this._linearVelocity);
    }
    (<IDynamicCollider>this._nativeCollider).setLinearVelocity(this._linearVelocity);
  }

  /**
   * The angular velocity vector of the dynamic collider measured in radians per second.
   */
  get angularVelocity(): Vector3 {
    return this._angularVelocity;
  }

  set angularVelocity(newValue: Vector3) {
    if (this._angularVelocity !== newValue) {
      newValue.cloneTo(this._angularVelocity);
    }
    (<IDynamicCollider>this._nativeCollider).setAngularVelocity(this._angularVelocity);
  }

  /**
   * The mass of the dynamic collider.
   */
  get mass(): number {
    return this._mass;
  }

  set mass(newValue: number) {
    this._mass = newValue;
    (<IDynamicCollider>this._nativeCollider).setMass(newValue);
  }

  /**
   * The center of mass relative to the transform's origin.
   */
  get centerOfMass(): Vector3 {
    return this._centerOfMass;
  }

  set centerOfMass(newValue: Vector3) {
    if (this._centerOfMass !== newValue) {
      newValue.cloneTo(this._centerOfMass);
    }
    (<IDynamicCollider>this._nativeCollider).setCenterOfMass(this._centerOfMass);
  }

  /**
   * The diagonal inertia tensor of mass relative to the center of mass.
   */
  get inertiaTensor(): Vector3 {
    return this._inertiaTensor;
  }

  set inertiaTensor(newValue: Vector3) {
    if (this._inertiaTensor !== newValue) {
      newValue.cloneTo(this._inertiaTensor);
    }
    (<IDynamicCollider>this._nativeCollider).setInertiaTensor(this._inertiaTensor);
  }

  /**
   * The maximum angular velocity of the collider measured in radians per second. (Default 7) range { 0, infinity }.
   */
  get maxAngularVelocity(): number {
    return this._maxAngularVelocity;
  }

  set maxAngularVelocity(newValue: number) {
    this._maxAngularVelocity = newValue;
    (<IDynamicCollider>this._nativeCollider).setMaxAngularVelocity(newValue);
  }

  /**
   * Maximum velocity of a collider when moving out of penetrating state.
   */
  get maxDepenetrationVelocity(): number {
    return this._maxDepenetrationVelocity;
  }

  set maxDepenetrationVelocity(newValue: number) {
    this._maxDepenetrationVelocity = newValue;
    (<IDynamicCollider>this._nativeCollider).setMaxDepenetrationVelocity(newValue);
  }

  /**
   * The mass-normalized energy threshold, below which objects start going to sleep.
   */
  get sleepThreshold(): number {
    return this._sleepThreshold;
  }

  set sleepThreshold(newValue: number) {
    this._sleepThreshold = newValue;
    (<IDynamicCollider>this._nativeCollider).setSleepThreshold(newValue);
  }

  /**
   * The solverIterations determines how accurately collider joints and collision contacts are resolved.
   */
  get solverIterations(): number {
    return this._solverIterations;
  }

  set solverIterations(newValue: number) {
    this._solverIterations = newValue;
    (<IDynamicCollider>this._nativeCollider).setSolverIterations(newValue);
  }

  /**
   * Controls whether physics affects the dynamic collider.
   */
  get isKinematic(): boolean {
    return this._isKinematic;
  }

  set isKinematic(newValue: boolean) {
    this._isKinematic = newValue;
    (<IDynamicCollider>this._nativeCollider).setIsKinematic(newValue);
  }

  /**
   * Controls whether physics will change the rotation of the object.
   */
  get freezeRotation(): boolean {
    return this._freezeRotation;
  }

  set freezeRotation(newValue: boolean) {
    this._freezeRotation = newValue;
    (<IDynamicCollider>this._nativeCollider).setFreezeRotation(newValue);
  }

  /**
   * The particular rigid dynamic lock flag.
   */
  get constraints(): number {
    return this._constraints;
  }

  set constraints(newValue: number) {
    this._constraints = newValue;
    (<IDynamicCollider>this._nativeCollider).setConstraints(newValue);
  }

  /**
   * The colliders' collision detection mode.
   */
  get collisionDetectionMode(): CollisionDetectionMode {
    return this._collisionDetectionMode;
  }

  set collisionDetectionMode(newValue: CollisionDetectionMode) {
    this._collisionDetectionMode = newValue;
    (<IDynamicCollider>this._nativeCollider).setCollisionDetectionMode(newValue);
  }

  constructor(entity: Entity) {
    super(entity);
    const { transform } = this.entity;
    this._nativeCollider = PhysicsManager._nativePhysics.createDynamicCollider(
      transform.worldPosition,
      transform.worldRotationQuaternion
    );
  }

  /**
   * Apply a force to the DynamicCollider.
   * @param force - The force make the collider move
   */
  applyForce(force: Vector3): void {
    (<IDynamicCollider>this._nativeCollider).addForce(force);
  }

  /**
   * Apply a torque to the DynamicCollider.
   * @param torque - The force make the collider rotate
   */
  applyTorque(torque: Vector3): void {
    (<IDynamicCollider>this._nativeCollider).addTorque(torque);
  }

  /**
   * Moves kinematically controlled dynamic actors through the game world.
   * @param position The desired position for the kinematic actor
   * @param rotation The desired rotation for the kinematic actor
   */
  setKinematicTarget(position: Vector3, rotation: Quaternion) {
    (<IDynamicCollider>this._nativeCollider).setKinematicTarget(position, rotation);
  }

  /**
   * Forces a collider to sleep at least one frame.
   */
  putToSleep() {
    (<IDynamicCollider>this._nativeCollider).putToSleep();
  }

  /**
   * Forces a collider to wake up.
   */
  wakeUp() {
    (<IDynamicCollider>this._nativeCollider).wakeUp();
  }

  /**
   * @override
   * @internal
   */
  _onLateUpdate() {
    const { transform } = this.entity;
    const { worldPosition, worldRotationQuaternion } = transform;
    this._nativeCollider.getWorldTransform(worldPosition, worldRotationQuaternion);
    transform.worldPosition = worldPosition;
    transform.worldRotationQuaternion = worldRotationQuaternion;
    this._updateFlag.flag = false;
  }
}
