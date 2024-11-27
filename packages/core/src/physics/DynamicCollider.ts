import { IDynamicCollider } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneManager";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { PhysicsScene } from "./PhysicsScene";
import { ColliderShape } from "./shape";

/**
 * A dynamic collider can act with self-defined movement or physical force.
 */
export class DynamicCollider extends Collider {
  private _linearDamping = 0;
  private _angularDamping = 0.05;
  @ignoreClone
  private _linearVelocity = new Vector3();
  @ignoreClone
  private _angularVelocity = new Vector3();
  private _mass = 1.0;
  @ignoreClone
  private _centerOfMass = new Vector3();
  @ignoreClone
  private _inertiaTensor = new Vector3(1, 1, 1);
  private _maxAngularVelocity = 100;
  private _maxDepenetrationVelocity = 1.0000000331813535e32;
  private _solverIterations = 4;
  private _isKinematic = false;
  private _constraints: DynamicColliderConstraints = 0;
  private _collisionDetectionMode: CollisionDetectionMode = CollisionDetectionMode.Discrete;
  private _sleepThreshold = 5e-3;
  private _automaticCenterOfMass = true;
  private _automaticInertiaTensor = true;

  /**
   * The linear damping of the dynamic collider.
   */
  get linearDamping(): number {
    return this._linearDamping;
  }

  set linearDamping(value: number) {
    if (this._linearDamping !== value) {
      this._linearDamping = value;
      (<IDynamicCollider>this._nativeCollider).setLinearDamping(value);
    }
  }

  /**
   * The angular damping of the dynamic collider.
   */
  get angularDamping(): number {
    return this._angularDamping;
  }

  set angularDamping(value: number) {
    if (this._angularDamping !== value) {
      this._angularDamping = value;
      (<IDynamicCollider>this._nativeCollider).setAngularDamping(value);
    }
  }

  /**
   * The linear velocity vector of the dynamic collider measured in world unit per second.
   */
  get linearVelocity(): Vector3 {
    (<IDynamicCollider>this._nativeCollider).getLinearVelocity(this._linearVelocity);
    return this._linearVelocity;
  }

  set linearVelocity(value: Vector3) {
    if (this._linearVelocity !== value) {
      this._linearVelocity.copyFrom(value);
    }
  }

  /**
   * The angular velocity vector of the dynamic collider measured in radians per second.
   */
  get angularVelocity(): Vector3 {
    (<IDynamicCollider>this._nativeCollider).getAngularVelocity(this._angularVelocity);
    return this._angularVelocity;
  }

  set angularVelocity(value: Vector3) {
    if (this._angularVelocity !== value) {
      this._angularVelocity.copyFrom(value);
    }
  }

  /**
   * The mass of the dynamic collider.
   */
  get mass(): number {
    return this._mass;
  }

  set mass(value: number) {
    if (this._mass !== value) {
      this._mass = value;
      if (this._automaticInertiaTensor || this._automaticCenterOfMass) {
        this._setMassAndUpdateInertia();
      } else {
        (<IDynamicCollider>this._nativeCollider).setMass(value);
      }
    }
  }

  /**
   * Whether or not to calculate the center of mass automatically, if true, the center of mass will be calculated based on the shapes added to the collider.
   */
  get automaticCenterOfMass(): boolean {
    return this._automaticCenterOfMass;
  }

  set automaticCenterOfMass(value: boolean) {
    if (this._automaticCenterOfMass !== value) {
      this._automaticCenterOfMass = value;
      if (value) {
        this._setMassAndUpdateInertia();
      }
    }
  }

  /**
   * The center of mass relative to the transform's origin.
   * @remarks The center of mass is automatically calculated, if you want to set it manually, please set automaticCenterOfMass to false.
   */
  get centerOfMass(): Vector3 {
    if (this._automaticCenterOfMass) {
      this._setMassAndUpdateInertia();
    }
    (<IDynamicCollider>this._nativeCollider).getCenterOfMass(this._centerOfMass);
    return this._centerOfMass;
  }

  set centerOfMass(value: Vector3) {
    if (this._automaticCenterOfMass) {
      console.warn(
        "The center of mass is automatically calculated, if you want to set it manually, please set automaticCenterOfMass to false."
      );
      return;
    }
    if (this._centerOfMass !== value) {
      this._centerOfMass.copyFrom(value);
    }
  }

  /**
   * Whether or not to calculate the inertia tensor automatically, if true, the inertia tensor will be calculated based on the shapes added to the collider.
   */
  get automaticInertiaTensor(): boolean {
    return this._automaticInertiaTensor;
  }

  set automaticInertiaTensor(value: boolean) {
    if (this._automaticInertiaTensor !== value) {
      this._automaticInertiaTensor = value;
      if (value) {
        this._setMassAndUpdateInertia();
      }
    }
  }

  /**
   * The diagonal inertia tensor of mass relative to the center of mass.
   * @remarks The inertia tensor is automatically calculated, if you want to set it manually, please set automaticInertiaTensor to false.
   */
  get inertiaTensor(): Vector3 {
    if (this._automaticInertiaTensor) {
      this._setMassAndUpdateInertia();
    }
    (<IDynamicCollider>this._nativeCollider).getInertiaTensor(this._inertiaTensor);
    return this._inertiaTensor;
  }

  set inertiaTensor(value: Vector3) {
    if (this._automaticInertiaTensor) {
      console.warn(
        "The inertia tensor is automatically calculated, if you want to set it manually, please set automaticInertiaTensor to false."
      );
      return;
    }
    if (this._inertiaTensor !== value) {
      this._inertiaTensor.copyFrom(value);
    }
  }

  /**
   * The maximum angular velocity of the collider measured in radians per second. (Default 7) range { 0, infinity }.
   */
  get maxAngularVelocity(): number {
    return this._maxAngularVelocity;
  }

  set maxAngularVelocity(value: number) {
    if (this._maxAngularVelocity !== value) {
      this._maxAngularVelocity = value;
      (<IDynamicCollider>this._nativeCollider).setMaxAngularVelocity(value);
    }
  }

  /**
   * Maximum velocity of a collider when moving out of penetrating state.
   */
  get maxDepenetrationVelocity(): number {
    return this._maxDepenetrationVelocity;
  }

  set maxDepenetrationVelocity(value: number) {
    if (this._maxDepenetrationVelocity !== value) {
      this._maxDepenetrationVelocity = value;
      (<IDynamicCollider>this._nativeCollider).setMaxDepenetrationVelocity(value);
    }
  }

  /**
   * The mass-normalized energy threshold, below which objects start going to sleep.
   */
  get sleepThreshold(): number {
    return this._sleepThreshold;
  }

  set sleepThreshold(value: number) {
    if (value !== this._sleepThreshold) {
      this._sleepThreshold = value;
      (<IDynamicCollider>this._nativeCollider).setSleepThreshold(value);
    }
  }

  /**
   * The solverIterations determines how accurately collider joints and collision contacts are resolved.
   */
  get solverIterations(): number {
    return this._solverIterations;
  }

  set solverIterations(value: number) {
    if (this._solverIterations !== value) {
      this._solverIterations = value;
      (<IDynamicCollider>this._nativeCollider).setSolverIterations(value);
    }
  }

  /**
   * Controls whether physics affects the dynamic collider.
   */
  get isKinematic(): boolean {
    return this._isKinematic;
  }

  set isKinematic(value: boolean) {
    if (this._isKinematic !== value) {
      this._isKinematic = value;
      (<IDynamicCollider>this._nativeCollider).setIsKinematic(value);
    }
  }

  /**
   * The particular rigid dynamic lock flag.
   */
  get constraints(): DynamicColliderConstraints {
    return this._constraints;
  }

  set constraints(value: DynamicColliderConstraints) {
    if (this._constraints !== value) {
      this._constraints = value;
      (<IDynamicCollider>this._nativeCollider).setConstraints(value);
    }
  }

  /**
   * The colliders' collision detection mode.
   */
  get collisionDetectionMode(): CollisionDetectionMode {
    return this._collisionDetectionMode;
  }

  set collisionDetectionMode(value: CollisionDetectionMode) {
    if (this._collisionDetectionMode !== value) {
      this._collisionDetectionMode = value;
      (<IDynamicCollider>this._nativeCollider).setCollisionDetectionMode(value);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    const { transform } = this.entity;
    this._nativeCollider = PhysicsScene._nativePhysics.createDynamicCollider(
      transform.worldPosition,
      transform.worldRotationQuaternion
    );

    this._setLinearVelocity = this._setLinearVelocity.bind(this);
    this._setAngularVelocity = this._setAngularVelocity.bind(this);
    this._setCenterOfMass = this._setCenterOfMass.bind(this);
    this._setInertiaTensor = this._setInertiaTensor.bind(this);

    //@ts-ignore
    this._linearVelocity._onValueChanged = this._setLinearVelocity;
    //@ts-ignore
    this._angularVelocity._onValueChanged = this._setAngularVelocity;
    //@ts-ignore
    this._centerOfMass._onValueChanged = this._setCenterOfMass;
    //@ts-ignore
    this._inertiaTensor._onValueChanged = this._setInertiaTensor;
  }

  override addShape(shape: ColliderShape): void {
    super.addShape(shape);
    if (this._automaticCenterOfMass || this._automaticInertiaTensor) {
      this._setMassAndUpdateInertia();
    }
  }

  override removeShape(shape: ColliderShape): void {
    super.removeShape(shape);
    if (this._automaticCenterOfMass || this._automaticInertiaTensor) {
      this._setMassAndUpdateInertia();
    }
  }

  override clearShapes(): void {
    super.clearShapes();
    if (this._automaticCenterOfMass || this._automaticInertiaTensor) {
      this._setMassAndUpdateInertia();
    }
  }

  /**
   * Apply a force to the DynamicCollider.
   * @param force - The force make the collider move
   */
  applyForce(force: Vector3): void {
    this._phasedActiveInScene && (<IDynamicCollider>this._nativeCollider).addForce(force);
  }

  /**
   * Apply a torque to the DynamicCollider.
   * @param torque - The force make the collider rotate
   */
  applyTorque(torque: Vector3): void {
    this._phasedActiveInScene && (<IDynamicCollider>this._nativeCollider).addTorque(torque);
  }

  /**
   * Moves kinematically controlled dynamic actors through the game world.
   * @param position - The desired position for the kinematic actor
   */
  move(position: Vector3): void;

  /**
   * Moves kinematically controlled dynamic actors through the game world.
   * @param rotation - The desired rotation for the kinematic actor
   */
  move(rotation: Quaternion): void;

  /**
   * Moves kinematically controlled dynamic actors through the game world.
   * @param position - The desired position for the kinematic actor
   * @param rotation - The desired rotation for the kinematic actor
   */
  move(position: Vector3, rotation: Quaternion): void;

  move(positionOrRotation: Vector3 | Quaternion, rotation?: Quaternion): void {
    this._phasedActiveInScene && (<IDynamicCollider>this._nativeCollider).move(positionOrRotation, rotation);
  }

  /**
   * Forces a collider to sleep at least one frame.
   */
  sleep(): void {
    (<IDynamicCollider>this._nativeCollider).sleep();
  }

  /**
   * Returns whether the collider is sleeping.
   * @returns True if the collider is sleeping, false otherwise.
   */
  isSleeping(): boolean {
    return (<IDynamicCollider>this._nativeCollider).isSleeping();
  }

  /**
   * Forces a collider to wake up.
   */
  wakeUp(): void {
    (<IDynamicCollider>this._nativeCollider).wakeUp();
  }

  /**
   * @internal
   */
  override _onLateUpdate(): void {
    const { transform } = this.entity;
    const { worldPosition, worldRotationQuaternion } = transform;
    (<IDynamicCollider>this._nativeCollider).getWorldTransform(worldPosition, worldRotationQuaternion);
    this._updateFlag.flag = false;
  }

  /**
   * @internal
   */
  override _cloneTo(target: DynamicCollider): void {
    target._linearVelocity.copyFrom(this.linearVelocity);
    target._angularVelocity.copyFrom(this.angularVelocity);
    target._centerOfMass.copyFrom(this.centerOfMass);
    target._inertiaTensor.copyFrom(this.inertiaTensor);
    super._cloneTo(target);
  }

  protected override _syncNative(): void {
    super._syncNative();
    (<IDynamicCollider>this._nativeCollider).setLinearDamping(this._linearDamping);
    (<IDynamicCollider>this._nativeCollider).setAngularDamping(this._angularDamping);
    (<IDynamicCollider>this._nativeCollider).setLinearVelocity(this._linearVelocity);
    (<IDynamicCollider>this._nativeCollider).setAngularVelocity(this._angularVelocity);
    if (this._automaticCenterOfMass || this._automaticInertiaTensor) {
      this._setMassAndUpdateInertia();
    } else {
      (<IDynamicCollider>this._nativeCollider).setMass(this._mass);
      (<IDynamicCollider>this._nativeCollider).setCenterOfMass(this._centerOfMass);
      (<IDynamicCollider>this._nativeCollider).setInertiaTensor(this._inertiaTensor);
    }
    (<IDynamicCollider>this._nativeCollider).setMaxAngularVelocity(this._maxAngularVelocity);
    (<IDynamicCollider>this._nativeCollider).setMaxDepenetrationVelocity(this._maxDepenetrationVelocity);
    (<IDynamicCollider>this._nativeCollider).setSleepThreshold(this._sleepThreshold);
    (<IDynamicCollider>this._nativeCollider).setSolverIterations(this._solverIterations);
    (<IDynamicCollider>this._nativeCollider).setIsKinematic(this._isKinematic);
    (<IDynamicCollider>this._nativeCollider).setConstraints(this._constraints);
    (<IDynamicCollider>this._nativeCollider).setCollisionDetectionMode(this._collisionDetectionMode);
  }

  private _setMassAndUpdateInertia(): void {
    (<IDynamicCollider>this._nativeCollider).setMassAndUpdateInertia(this._mass);
    this._setCenterOfMass();
    this._setInertiaTensor();
  }

  private _setLinearVelocity(): void {
    (<IDynamicCollider>this._nativeCollider).setLinearVelocity(this._linearVelocity);
  }
  private _setAngularVelocity(): void {
    (<IDynamicCollider>this._nativeCollider).setAngularVelocity(this._angularVelocity);
  }

  private _setCenterOfMass(): void {
    if (!this._automaticCenterOfMass) {
      (<IDynamicCollider>this._nativeCollider).setCenterOfMass(this._centerOfMass);
    }
  }

  private _setInertiaTensor(): void {
    if (!this._automaticInertiaTensor) {
      (<IDynamicCollider>this._nativeCollider).setInertiaTensor(this._inertiaTensor);
    }
  }
}

/**
 * The collision detection mode constants.
 */
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
 * Use these flags to constrain motion of dynamic collider.
 */
export enum DynamicColliderConstraints {
  /** Not Freeze. */
  None = 0,
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
