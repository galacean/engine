import { IDynamicActor } from "@galacean/engine-design";
import { MathUtil, Quaternion, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import type { ICloneHook } from "../clone/ICloneHook";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { ActiveChangeFlag } from "../enums/ActiveChangeFlag";
import type { Scene } from "../Scene";
import { Script } from "../Script";
import { Transform } from "../Transform";
import { Collider } from "./Collider";
import { differsF32, isValidPositiveFloat32, rotationDiffersF32 } from "./float32";
import type { Joint } from "./joint/Joint";

/**
 * Simulates the motion of an Entity and its compound collision shape.
 * @remarks Each Entity can have one Rigidbody. It owns colliders on its Entity and descendants up to the next
 * Rigidbody. Setting `enabled` to false removes those shapes from simulation and queries while preserving their `enabled` values.
 * Removing it lets the next ancestor Rigidbody take ownership, or makes the shapes static if there is no ancestor body.
 * @decorator `@dependentComponents(Transform, DependentMode.CheckOnly)`
 */
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Rigidbody extends Component implements ICloneHook<Rigidbody> {
  private static _validateDamping(value: number): void {
    if (typeof value !== "number" || !(value >= 0 && Number.isFinite(Math.fround(value)))) {
      throw new RangeError("Rigidbody damping must be finite and nonnegative.");
    }
  }

  private static _validateSpeedLimit(value: number): void {
    if (typeof value !== "number" || !(value >= 0 && Number.isFinite(Math.fround(Math.fround(value) ** 2)))) {
      throw new RangeError("Rigidbody speed limit must be nonnegative with a finite Float32 square.");
    }
  }

  private static _isPositionImpulse(mode: ForceMode.Force | ForceMode.Impulse): boolean {
    if (mode !== ForceMode.Force && mode !== ForceMode.Impulse) {
      throw new RangeError("applyForceAtPosition requires ForceMode.Force or ForceMode.Impulse.");
    }
    return mode === ForceMode.Impulse;
  }
  /** @internal */
  @ignoreClone
  _dirtyIndex = -1;
  /** @internal Index in the scene's mass update queue, or -1 when not queued. */
  @ignoreClone
  _massDirtyIndex = -1;
  /** @internal Index in the physics scene's enabled bodies. */
  @ignoreClone
  _index = -1;
  @ignoreClone
  private _writingBack = false;

  @ignoreClone
  private _wasSleeping = false;
  @ignoreClone
  private _registeredScene: Scene | null = null;
  @ignoreClone
  private _sleepEventId = 0;
  @ignoreClone
  private _sleepPending = false;
  @ignoreClone
  private _massChanges = MassChanges.None;
  @ignoreClone
  private _nativeActor: IDynamicActor | null = null;
  @ignoreClone
  private _attachedColliders: Collider[] = [];
  @ignoreClone
  private _joints: Joint[] | null = null;
  @ignoreClone
  private _nativePosition: Vector3;
  @ignoreClone
  private _nativeRotation: Quaternion;

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
  @ignoreClone
  private _inertiaTensorRotation = new Quaternion();
  @ignoreClone
  private _lastValidInertiaTensorRotation?: Quaternion;
  private _maxLinearVelocity = 1e16;
  private _maxAngularVelocity = 100;
  private _maxDepenetrationVelocity = 10;
  private _solverIterations = 4;
  private _solverVelocityIterations = 1;
  private _useGravity = true;
  private _simulationEnabled = true;
  private _isKinematic = false;
  private _constraints: RigidbodyConstraints = 0;
  private _useCCD = false;
  private _sleepThreshold = 5e-3;
  private _automaticCenterOfMass = true;
  private _automaticInertiaTensor = true;

  /**
   * The linear damping of the Rigidbody.
   * @throws When assigned a negative or non-finite Float32 value.
   */
  get linearDamping(): number {
    return this._linearDamping;
  }

  set linearDamping(value: number) {
    Rigidbody._validateDamping(value);
    if (this._linearDamping !== value) {
      this._linearDamping = value;
      this._nativeActor?.setLinearDamping(value);
    }
  }

  /**
   * The angular damping of the Rigidbody.
   * @throws When assigned a negative or non-finite Float32 value.
   */
  get angularDamping(): number {
    return this._angularDamping;
  }

  set angularDamping(value: number) {
    Rigidbody._validateDamping(value);
    if (this._angularDamping !== value) {
      this._angularDamping = value;
      this._nativeActor?.setAngularDamping(value);
    }
  }

  /**
   * Linear velocity in world space, in world units per second.
   */
  get linearVelocity(): Vector3 {
    const actor = this._nativeActor;
    if (actor) {
      //@ts-ignore
      this._linearVelocity._onValueChanged = null;
      actor.getLinearVelocity(this._linearVelocity);
      //@ts-ignore
      this._linearVelocity._onValueChanged = this._setLinearVelocity;
    }
    return this._linearVelocity;
  }

  set linearVelocity(value: Vector3) {
    this._linearVelocity !== value && this._linearVelocity.copyFrom(value);
  }

  /**
   * Angular velocity in world space, in radians per second.
   */
  get angularVelocity(): Vector3 {
    const actor = this._nativeActor;
    if (actor) {
      //@ts-ignore
      this._angularVelocity._onValueChanged = null;
      actor.getAngularVelocity(this._angularVelocity);
      //@ts-ignore
      this._angularVelocity._onValueChanged = this._setAngularVelocity;
    }
    return this._angularVelocity;
  }

  set angularVelocity(value: Vector3) {
    this._angularVelocity !== value && this._angularVelocity.copyFrom(value);
  }

  /**
   * The mass of the Rigidbody. PhysX treats zero as infinite mass.
   * @throws When the value is neither zero nor a positive normal Float32.
   */
  get mass(): number {
    return this._mass;
  }

  set mass(value: number) {
    if (typeof value !== "number" || (value !== 0 && !isValidPositiveFloat32(value))) {
      throw new RangeError("Rigidbody mass must be zero or a positive, normal, finite Float32.");
    }
    if (this._mass !== value) {
      this._mass = value;
      if (this._registeredScene) {
        this._markMassDirty(MassChanges.Mass);
      } else if (this._nativeActor) {
        this._massChanges |= MassChanges.Mass;
      }
    }
  }

  /**
   * Sets mass from the volume of the currently attached solid Colliders.
   * @param density - Mass per cubic world unit. Must be a positive normal Float32.
   * @returns Whether the registered body produced valid mass properties and accepted the mass.
   * @remarks Recomputes automatic mass properties and preserves manual center of mass and inertia.
   * Missing or unsupported volume leaves mass unchanged. Later geometry edits keep the resulting mass.
   * @throws When density is not a positive normal Float32.
   */
  setDensity(density: number): boolean {
    if (typeof density !== "number" || !isValidPositiveFloat32(density)) {
      throw new RangeError("Rigidbody density must be a positive, normal, finite Float32.");
    }
    const scene = this._registeredScene;
    if (!scene || this._index === -1) return false;
    scene.physics._syncColliders();
    const mass = this._nativeActor!.setDensity(density, this._automaticCenterOfMass, this._automaticInertiaTensor);
    if (mass === 0) return false;
    this._mass = mass;
    this._massChanges = MassChanges.None;
    return true;
  }

  /**
   * Whether the center of mass is calculated automatically from the attached Colliders.
   * @remarks Disabling preserves the current value.
   */
  get automaticCenterOfMass(): boolean {
    return this._automaticCenterOfMass;
  }

  set automaticCenterOfMass(value: boolean) {
    if (this._automaticCenterOfMass !== value) {
      if (value) {
        this._automaticCenterOfMass = true;
        this._markMassDirty();
      } else {
        this._readComputedCenterOfMass();
        this._automaticCenterOfMass = false;
      }
    }
  }

  /**
   * The center of mass relative to the transform's origin.
   * @remarks Writing disables {@link automaticCenterOfMass}.
   */
  get centerOfMass(): Vector3 {
    this._automaticCenterOfMass && this._readComputedCenterOfMass();
    return this._centerOfMass;
  }

  set centerOfMass(value: Vector3) {
    this._centerOfMass !== value && this._centerOfMass.copyFrom(value);
  }

  /**
   * Whether the inertia tensor is calculated automatically from the attached Colliders and mass.
   * @remarks Disabling preserves the current value.
   */
  get automaticInertiaTensor(): boolean {
    return this._automaticInertiaTensor;
  }

  set automaticInertiaTensor(value: boolean) {
    if (this._automaticInertiaTensor !== value) {
      if (value) {
        this._automaticInertiaTensor = true;
        this._markMassDirty();
      } else {
        const actor = this._getSyncedActor();
        if (actor) {
          this._readInertiaTensor(actor);
          this._readInertiaTensorRotation(actor);
        }
        this._automaticInertiaTensor = false;
      }
    }
  }

  /**
   * The diagonal inertia tensor of mass relative to the center of mass.
   * @remarks Writing disables {@link automaticInertiaTensor}.
   */
  get inertiaTensor(): Vector3 {
    if (this._automaticInertiaTensor) {
      const actor = this._getSyncedActor();
      actor && this._readInertiaTensor(actor);
    }
    return this._inertiaTensor;
  }

  set inertiaTensor(value: Vector3) {
    this._inertiaTensor !== value && this._inertiaTensor.copyFrom(value);
  }

  /**
   * The rotation of the inertia tensor's principal axes relative to the body.
   * @remarks Assigning or mutating normalizes the quaternion and disables {@link automaticInertiaTensor}.
   * @throws When the rotation is not finite or has zero length.
   */
  get inertiaTensorRotation(): Quaternion {
    if (this._automaticInertiaTensor) {
      const actor = this._getSyncedActor();
      actor && this._readInertiaTensorRotation(actor);
    }
    return this._inertiaTensorRotation;
  }

  set inertiaTensorRotation(value: Quaternion) {
    this._inertiaTensorRotation !== value && this._applyInertiaTensorRotation(value);
  }

  /**
   * Writes the world-space position of the center of mass to `out`.
   * @returns The output vector.
   */
  getWorldCenterOfMass(out: Vector3): Vector3 {
    const transform = this.entity.transform;
    Vector3.transformByQuat(this.centerOfMass, transform.worldRotationQuaternion, out);
    return out.add(transform.worldPosition);
  }

  /**
   * Writes the simulated world-space velocity at a world-space point.
   * @param point - Point in world space.
   * @param out - Receives the velocity, or zero before the body has a physics actor.
   * @returns The output vector.
   */
  getPointVelocity(point: Vector3, out: Vector3): Vector3 {
    return this._getSyncedActor()?.getPointVelocity(point, out) ?? out.set(0, 0, 0);
  }

  /**
   * Writes the simulated world-space velocity at a point in the unscaled local frame of the body.
   * @param point - Point in the body's local frame.
   * @param out - Receives the velocity, or zero before the body has a physics actor.
   * @returns The output vector.
   */
  getRelativePointVelocity(point: Vector3, out: Vector3): Vector3 {
    return this._getSyncedActor()?.getRelativePointVelocity(point, out) ?? out.set(0, 0, 0);
  }

  /**
   * Maximum linear speed in world units per second before solving.
   * @defaultValue 1e16
   * @remarks The speed can temporarily exceed the limit as a result of contact or joint solving.
   * @throws When assigned a negative limit or one whose square exceeds Float32 range.
   */
  get maxLinearVelocity(): number {
    return this._maxLinearVelocity;
  }

  set maxLinearVelocity(value: number) {
    Rigidbody._validateSpeedLimit(value);
    if (this._maxLinearVelocity !== value) {
      this._maxLinearVelocity = value;
      this._nativeActor?.setMaxLinearVelocity(value);
    }
  }

  /**
   * Maximum angular speed in radians per second before solving.
   * @remarks The speed can temporarily exceed the limit as a result of contact or joint solving.
   * @throws When assigned a negative limit or one whose square exceeds Float32 range.
   */
  get maxAngularVelocity(): number {
    return this._maxAngularVelocity;
  }

  set maxAngularVelocity(value: number) {
    Rigidbody._validateSpeedLimit(value);
    if (this._maxAngularVelocity !== value) {
      this._maxAngularVelocity = value;
      this._nativeActor?.setMaxAngularVelocity(value);
    }
  }

  /**
   * Maximum speed at which the solver separates overlapping bodies, in world units per second.
   * @defaultValue 10
   */
  get maxDepenetrationVelocity(): number {
    return this._maxDepenetrationVelocity;
  }

  set maxDepenetrationVelocity(value: number) {
    if (this._maxDepenetrationVelocity !== value) {
      this._maxDepenetrationVelocity = value;
      this._nativeActor?.setMaxDepenetrationVelocity(value);
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
      this._nativeActor?.setSleepThreshold(value);
    }
  }

  /**
   * The number of solver position iterations, clamped to an integer from 1 to 255.
   * @throws When the value is not finite.
   */
  get solverIterations(): number {
    return this._solverIterations;
  }

  set solverIterations(value: number) {
    if (!Number.isFinite(value)) {
      throw new Error("Rigidbody solverIterations must be finite.");
    }
    value = MathUtil.clamp(Math.round(value), 1, 255);
    if (this._solverIterations !== value) {
      this._solverIterations = value;
      this._nativeActor?.setSolverIterations(value, this._solverVelocityIterations);
    }
  }

  /**
   * The number of solver velocity iterations, clamped to an integer from 1 to 255.
   * @defaultValue 1
   * @throws When the value is not finite.
   */
  get solverVelocityIterations(): number {
    return this._solverVelocityIterations;
  }

  set solverVelocityIterations(value: number) {
    if (!Number.isFinite(value)) {
      throw new Error("Rigidbody solverVelocityIterations must be finite.");
    }
    value = MathUtil.clamp(Math.round(value), 1, 255);
    if (this._solverVelocityIterations !== value) {
      this._solverVelocityIterations = value;
      this._nativeActor?.setSolverIterations(this._solverIterations, value);
    }
  }

  /**
   * Controls whether gravity affects the Rigidbody.
   */
  get useGravity(): boolean {
    return this._useGravity;
  }

  set useGravity(value: boolean) {
    if (this._useGravity !== value) {
      this._useGravity = value;
      this._nativeActor?.setUseGravity(value);
    }
  }

  /**
   * Whether the body participates in physics simulation.
   * @remarks A query-only body follows the Entity's Transform and retains its Collider query settings.
   * Switching a registered body out of simulation clears its forces, velocities and kinematic target.
   * Active trigger overlaps end on the first step while the body is query-only.
   * Unbroken joints resume when both connected bodies participate in simulation.
   * @defaultValue true
   */
  get simulationEnabled(): boolean {
    return this._simulationEnabled;
  }

  set simulationEnabled(value: boolean) {
    if (this._simulationEnabled !== value) {
      this._simulationEnabled = value;
      this._wasSleeping = false;
      !value && this._cancelPendingSleep();
      this._nativeActor?.setSimulationEnabled(value);
      this._syncSleepEventRegistration();
      const joints = this._joints;
      if (this._index !== -1 && joints) {
        for (const joint of joints) joint._wakeOtherBody(this);
      }
    }
  }

  /**
   * Whether the body follows a target pose instead of responding to forces.
   * @remarks Use {@link move} to set a kinematic target. When changing to dynamic motion, kinematic-only shapes
   * leave simulation and queries until the body becomes kinematic again.
   */
  get isKinematic(): boolean {
    return this._isKinematic;
  }

  set isKinematic(value: boolean) {
    if (this._isKinematic !== value) {
      this._isKinematic = value;
      this._wasSleeping = false;
      if (value) {
        this._cancelPendingSleep();
      } else {
        // Detach attached native kinematic-only shapes before clearing eKINEMATIC on the actor
        const colliders = this._attachedColliders;
        for (let i = colliders.length - 1; i >= 0; i--) {
          const collider = colliders[i];
          if (!collider._nativeSupportsDynamicBody()) {
            collider._detach();
            collider._markDirty();
          }
        }
      }
      this._nativeActor?.setMotionState(value, this._useCCD);
      // Revisit the hierarchy so previously excluded shapes can rejoin when the body becomes kinematic.
      this._registeredScene && this._markCollidersDirty();
    }
  }

  /**
   * The flags that freeze motion of the Rigidbody.
   */
  get constraints(): RigidbodyConstraints {
    return this._constraints;
  }

  set constraints(value: RigidbodyConstraints) {
    if (this._constraints !== value) {
      this._constraints = value;
      this._nativeActor?.setConstraints(value);
    }
  }

  /**
   * Whether to use continuous collision detection.
   * @defaultValue false
   * @remarks PhysX sweeps linear motion for dynamic bodies and uses speculative contacts for kinematic bodies.
   */
  get useCCD(): boolean {
    return this._useCCD;
  }

  set useCCD(value: boolean) {
    if (this._useCCD !== value) {
      this._useCCD = value;
      this._nativeActor?.setMotionState(this._isKinematic, value);
    }
  }

  /**
   * @internal
   * @throws When the Entity already has a Rigidbody.
   */
  constructor(entity: Entity) {
    if (entity.getComponent(Rigidbody)) {
      throw new Error(`Entity "${entity.name}" already has a Rigidbody.`);
    }
    super(entity);

    this._setLinearVelocity = this._setLinearVelocity.bind(this);
    this._setAngularVelocity = this._setAngularVelocity.bind(this);
    this._handleCenterOfMassChanged = this._handleCenterOfMassChanged.bind(this);
    this._handleInertiaTensorChanged = this._handleInertiaTensorChanged.bind(this);
    this._handleInertiaTensorRotationChanged = this._handleInertiaTensorRotationChanged.bind(this);
    this._onTransformChanged = this._onTransformChanged.bind(this);

    //@ts-ignore
    this._linearVelocity._onValueChanged = this._setLinearVelocity;
    //@ts-ignore
    this._angularVelocity._onValueChanged = this._setAngularVelocity;
    //@ts-ignore
    this._centerOfMass._onValueChanged = this._handleCenterOfMassChanged;
    //@ts-ignore
    this._inertiaTensor._onValueChanged = this._handleInertiaTensorChanged;
    //@ts-ignore
    this._inertiaTensorRotation._onValueChanged = this._handleInertiaTensorRotationChanged;
    entity._updateFlagManager.addListener(this._onTransformChanged);
  }

  /**
   * Applies a world-space force at the center of mass.
   * @param force - Value in the units of the selected mode.
   * @param mode - How the value changes velocity.
   */
  applyForce(force: Vector3, mode: ForceMode = ForceMode.Force): void {
    // The current mass properties convert the force, so pending Collider changes are applied first
    this._getForceActor()?.addForce(force, mode);
  }

  /**
   * Applies a world-space force or impulse at a world-space position.
   * @param force - World-space vector in the units of the selected mode.
   * @param position - Point in world space where the force is applied.
   * @param mode - Force or impulse. Defaults to `ForceMode.Force`.
   * @throws When the mode is neither force nor impulse.
   */
  applyForceAtPosition(
    force: Vector3,
    position: Vector3,
    mode: ForceMode.Force | ForceMode.Impulse = ForceMode.Force
  ): void {
    const impulse = Rigidbody._isPositionImpulse(mode);
    this._getForceActor()?.addForceAtPosition(force, position, impulse);
  }

  /**
   * Applies a world-space torque.
   * @param torque - Value in the units of the selected mode.
   * @param mode - How the value changes angular velocity.
   */
  applyTorque(torque: Vector3, mode: ForceMode = ForceMode.Force): void {
    this._getForceActor()?.addTorque(torque, mode);
  }

  /**
   * Applies a force along the body's local axes at its center of mass.
   * @param force - Body-local vector in the units of the selected mode.
   * @param mode - How the value changes velocity. Defaults to `ForceMode.Force`.
   */
  applyRelativeForce(force: Vector3, mode: ForceMode = ForceMode.Force): void {
    this._getForceActor()?.addRelativeForce(force, mode);
  }

  /**
   * Applies a torque around the body's local axes.
   * @param torque - Body-local vector in the units of the selected mode.
   * @param mode - How the value changes angular velocity. Defaults to `ForceMode.Force`.
   */
  applyRelativeTorque(torque: Vector3, mode: ForceMode = ForceMode.Force): void {
    this._getForceActor()?.addRelativeTorque(torque, mode);
  }

  /**
   * Applies a radial force and the resulting torque to an active dynamic body.
   * @param strength - Value at the explosion origin in the units of the selected mode.
   * @param origin - Explosion center in world space.
   * @param radius - Nonnegative radius in world units. Strength falls off linearly to zero at the radius.
   * A radius of zero applies the full strength at any distance.
   * @param upwardOffset - Lowers the apparent origin along world Y for the direction calculation, in world units.
   * @param mode - How the force and torque change the body's velocity. Defaults to `ForceMode.Force`.
   * @remarks Uses the closest Collider surface. If the origin is inside a Collider or no volume is available,
   * the force is applied at the center of mass.
   */
  applyExplosionForce(
    strength: number,
    origin: Vector3,
    radius: number,
    upwardOffset = 0,
    mode: ForceMode = ForceMode.Force
  ): void {
    if (this._index === -1) return;
    if (this._getSyncedActor()!.addExplosionForce(strength, origin, radius, upwardOffset, mode)) {
      this._cancelPendingSleep();
    }
  }

  /**
   * Sets the world-space target position for the next kinematic simulation step, preserving the target rotation.
   * @remarks A body participating in simulation uses the target for scene queries immediately.
   * The Entity's transform advances during simulation.
   * @throws When the body is dynamic.
   */
  move(position: Vector3): void;

  /**
   * Sets the world-space target rotation for the next kinematic simulation step, preserving the target position.
   * @remarks Requires an active kinematic Rigidbody with simulation enabled.
   */
  move(rotation: Quaternion): void;

  /**
   * Sets the world-space target position and rotation for the next kinematic simulation step.
   * @remarks Requires an active kinematic Rigidbody with simulation enabled.
   */
  move(position: Vector3, rotation: Quaternion): void;

  move(positionOrRotation: Vector3 | Quaternion, rotation?: Quaternion): void {
    if (!this._isKinematic) throw new Error("Rigidbody.move requires a kinematic body.");
    if (!this._simulationEnabled || this._index === -1) return;
    // Teleport pending transform edits first so the move starts from the current pose
    this._getSyncedActor()!.move(positionOrRotation, rotation);
  }

  /**
   * Puts a simulated dynamic body to sleep.
   * @remarks A request before or during activation applies before the first step after activation.
   */
  sleep(): void {
    if (this._isKinematic || !this._simulationEnabled) return;
    const scene = this._registeredScene;
    if (!scene || this._index === -1 || this._isActivating()) {
      this._sleepPending = true;
      this._index !== -1 && scene?.physics._scheduleSleep(this, true);
    } else {
      this._cancelPendingSleep();
      this._getSyncedActor()!.sleep();
    }
  }

  /**
   * Returns whether the body is registered in the physics scene and sleeping.
   */
  isSleeping(): boolean {
    return this._index !== -1 && this._nativeActor!.isSleeping();
  }

  /**
   * Wakes a simulated dynamic body and cancels a pending sleep request.
   */
  wakeUp(): void {
    this._cancelPendingSleep();
    this._wakeNative();
  }

  /** @internal Wakes the native actor while preserving an explicit sleep request for activation. */
  _wakeNative(): void {
    this._wasSleeping = false;
    if (this._index !== -1 && !this._isKinematic && this._simulationEnabled) {
      this._nativeActor!.wakeUp();
    }
  }

  /**
   * @internal
   * @inheritDoc
   */
  _onClone(target: Rigidbody): void {
    target._linearVelocity.copyFrom(this.linearVelocity);
    target._angularVelocity.copyFrom(this.angularVelocity);
    if (!this._automaticCenterOfMass) target.centerOfMass = this._centerOfMass;
    if (!this._automaticInertiaTensor) {
      target.inertiaTensor = this._inertiaTensor;
      target.inertiaTensorRotation = this._inertiaTensorRotation;
    }
  }

  /**
   * @internal
   */
  override _setActive(value: boolean, activeChangeFlag: ActiveChangeFlag): void {
    if (value && activeChangeFlag === ActiveChangeFlag.All && !this.enabled) {
      // Adding a disabled body changes ownership without registering an actor.
      this._markCollidersDirty();
    }
    super._setActive(value, activeChangeFlag);
  }

  /** @internal */
  override _onEnableInScene(): void {
    const scene = this.scene!;
    const actor = this._getNativeActor();
    this._detachOrphanedColliders();
    scene.physics._addRigidbody(this, actor);
    this._registeredScene = scene;
    this._wasSleeping = false;
    this._markMassDirty();
    this._sleepPending && scene.physics._scheduleSleep(this, true);
    this._syncSleepEventRegistration();
    this._syncJoints();
    this._markCollidersDirty();
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    const scene = this._registeredScene;
    if (!scene) return;
    this._registeredScene = null;
    this._wasSleeping = false;
    this._sleepPending && scene.physics._scheduleSleep(this, false);
    this._setSleepEventRegistration(scene, false);
    this._syncJoints();
    this._detachOrphanedColliders();
    scene.physics._removeRigidbody(this);
  }

  private _detachOrphanedColliders(): void {
    const colliders = this._attachedColliders;
    for (let i = colliders.length - 1; i >= 0; i--) {
      const collider = colliders[i];
      if (collider._findRigidbody() !== this) {
        // A hierarchy change while disabled or before re-entry may belong to another scene.
        collider._detach();
        collider._markDirty();
      }
    }
  }

  /** @internal Reconcile native sleep notifications with the active observers on this Entity. */
  _syncSleepEventRegistration(): void {
    const scene = this._registeredScene;
    if (!scene || this._index === -1) return;

    if (this._simulationEnabled) {
      const { prototype } = Script;
      const scripts = this.entity._scripts;
      for (let i = 0, count = scripts.length; i < count; i++) {
        const script = scripts.get(i);
        if (script && (script.onSleep !== prototype.onSleep || script.onWake !== prototype.onWake)) {
          this._setSleepEventRegistration(scene, true);
          return;
        }
      }
    }
    this._setSleepEventRegistration(scene, false);
  }

  private _setSleepEventRegistration(scene: Scene, enabled: boolean): void {
    const id = this._sleepEventId;
    if (enabled === (id !== 0)) return;

    const physics = scene.physics;
    if (enabled) {
      this._sleepEventId = physics._registerEventTarget(this);
    } else {
      physics._unregisterEventTarget(id);
      this._sleepEventId = 0;
    }
    this._nativeActor!.setSleepEventId(this._sleepEventId);
  }

  /** @internal */
  _getRegisteredActor(scene: Scene): IDynamicActor | null {
    return this._registeredScene === scene && this._index !== -1 ? this._nativeActor : null;
  }

  /**
   * @internal
   * The native actor, created from the current fields and world pose on first use.
   */
  _getNativeActor(): IDynamicActor {
    let actor = this._nativeActor;
    if (!actor) {
      const transform = this.entity.transform;
      const position = transform.worldPosition;
      const rotation = transform.worldRotationQuaternion;
      this._nativeActor = actor = Engine._nativePhysics.createDynamicActor(position, rotation);
      this._nativePosition = position.clone();
      this._nativeRotation = rotation.clone();

      // Non-convex triangle meshes require a kinematic native actor before attachment
      actor.setMotionState(this._isKinematic, this._useCCD);
      !this._simulationEnabled && actor.setSimulationEnabled(false);
      actor.setLinearDamping(this._linearDamping);
      actor.setAngularDamping(this._angularDamping);
      if (this._simulationEnabled && !this._isKinematic) {
        actor.setLinearVelocity(this._linearVelocity);
        actor.setAngularVelocity(this._angularVelocity);
      }
      actor.setMass(this._mass);
      this._automaticCenterOfMass || actor.setCenterOfMass(this._centerOfMass);
      if (!this._automaticInertiaTensor) {
        actor.setInertiaTensor(this._inertiaTensor);
        actor.setInertiaTensorRotation(this._inertiaTensorRotation);
      }
      actor.setMaxLinearVelocity(this._maxLinearVelocity);
      actor.setMaxAngularVelocity(this._maxAngularVelocity);
      actor.setMaxDepenetrationVelocity(this._maxDepenetrationVelocity);
      actor.setSleepThreshold(this._sleepThreshold);
      actor.setSolverIterations(this._solverIterations, this._solverVelocityIterations);
      actor.setUseGravity(this._useGravity);
      actor.setConstraints(this._constraints);
    }
    return actor;
  }

  /**
   * @internal
   */
  _attachCollider(collider: Collider): void {
    this._attachedColliders.push(collider);
    this._markMassDirty();
  }

  /**
   * @internal
   */
  _detachCollider(collider: Collider): void {
    const colliders = this._attachedColliders;
    const index = colliders.indexOf(collider);
    if (index !== -1) {
      colliders[index] = colliders[colliders.length - 1];
      colliders.length--;
      this._markMassDirty();
    }
  }

  /**
   * @internal
   */
  _attachJoint(joint: Joint): void {
    (this._joints ||= []).push(joint);
  }

  /**
   * @internal
   */
  _detachJoint(joint: Joint): void {
    const joints = this._joints;
    if (joints) {
      const index = joints.indexOf(joint);
      if (index !== -1) {
        joints[index] = joints[joints.length - 1];
        joints.length--;
      }
    }
  }

  private _syncJoints(): void {
    const joints = this._joints;
    if (joints) {
      for (let i = joints.length - 1; i >= 0; i--) {
        joints[i]._syncActiveJoint();
      }
    }
  }

  /**
   * @internal
   * Recompute automatic mass properties before the next simulation step or query.
   */
  _markMassDirty(changes = MassChanges.Geometry): void {
    this._massChanges |= changes;
    if (
      this._massDirtyIndex === -1 &&
      (this._automaticCenterOfMass || this._automaticInertiaTensor || this._massChanges & MassChanges.Mass)
    ) {
      this._registeredScene?.physics._queueMassUpdate(this);
    }
  }

  /**
   * @internal
   * Teleport the native actor to the Entity's world pose when it changed.
   */
  _syncPose(): void {
    const actor = this._nativeActor!;
    this._registeredScene!.physics._checkBodyOrder(this);
    const transform = this.entity.transform;
    // Reading the world matrix re-arms transform change notifications that are only sent from a clean state
    transform.worldMatrix;
    const position = transform.worldPosition;
    const rotation = transform.worldRotationQuaternion;
    const nativePosition = this._nativePosition;
    const nativeRotation = this._nativeRotation;
    if (differsF32(position, nativePosition) || rotationDiffersF32(rotation, nativeRotation)) {
      this._wasSleeping = false;
      nativePosition.copyFrom(position);
      nativeRotation.copyFrom(rotation);
      actor.setWorldTransform(position, rotation);
    }
  }

  /**
   * @internal
   * Write the simulated pose back to the Entity.
   */
  _writeBack(position: Vector3, rotation: Quaternion): void {
    if (!this._simulationEnabled) return;
    const actor = this._nativeActor!;
    if (!this._isKinematic) {
      if (actor.isSleeping()) {
        if (this._wasSleeping) return;
        this._wasSleeping = true;
      } else {
        this._wasSleeping = false;
      }
    }

    actor.getWorldTransform(position, rotation);
    const transform = this.entity.transform;
    const worldPosition = transform.worldPosition;
    const positionChanged = !Vector3.equals(position, worldPosition);
    this._writingBack = true;
    if (positionChanged) transform.worldPosition = position;

    const worldRotation = transform.worldRotationQuaternion;
    const rotationChanged = !Quaternion.equals(rotation, worldRotation);
    if (rotationChanged) transform.worldRotationQuaternion = rotation;
    this._writingBack = false;

    if (positionChanged || rotationChanged) {
      // Re-read the published pose so constrained transforms such as UITransform do not trigger a false teleport.
      this._nativePosition.copyFrom(transform.worldPosition);
      this._nativeRotation.copyFrom(transform.worldRotationQuaternion);
    } else {
      this._nativePosition.copyFrom(worldPosition);
      this._nativeRotation.copyFrom(worldRotation);
    }
  }

  /**
   * @internal
   * Commit an authored mass change and recompute automatic properties when attached geometry has volume.
   */
  _updateMass(): void {
    const changes = this._massChanges;
    this._massChanges = MassChanges.None;
    if (changes === MassChanges.None) return;
    const actor = this._nativeActor!;
    const mass = this._mass;
    // PhysX uses zero as infinite mass, but automatic mass properties require a positive mass.
    if ((this._automaticCenterOfMass || this._automaticInertiaTensor) && isValidPositiveFloat32(mass)) {
      const colliders = this._attachedColliders;
      const count = colliders.length;
      let i = 0;
      while (i < count && colliders[i]._nativeSupportsDynamicBody()) i++;
      if (i === count) {
        // PhysX overwrites both properties, restore the manual ones
        actor.setMassAndUpdateInertia(mass);
        this._automaticCenterOfMass || actor.setCenterOfMass(this._centerOfMass);
        if (!this._automaticInertiaTensor) {
          actor.setInertiaTensor(this._inertiaTensor);
          actor.setInertiaTensorRotation(this._inertiaTensorRotation);
        }
        return;
      }
    }
    changes & MassChanges.Mass && actor.setMass(mass);
  }

  protected override _onDestroy(): void {
    //@ts-ignore
    this._linearVelocity._onValueChanged = this._angularVelocity._onValueChanged = null;
    //@ts-ignore
    this._centerOfMass._onValueChanged = this._inertiaTensor._onValueChanged = null;
    //@ts-ignore
    this._inertiaTensorRotation._onValueChanged = null;
    super._onDestroy();
    this.entity._updateFlagManager.removeListener(this._onTransformChanged);
    const joints = this._joints;
    if (joints) {
      this._joints = null;
      for (let i = joints.length - 1; i >= 0; i--) {
        joints[i]._onBodyDestroyed(this);
      }
    }
    const actor = this._nativeActor;
    if (actor) {
      const colliders = this._attachedColliders;
      for (let i = 0, n = colliders.length; i < n; i++) {
        colliders[i]._onBodyDestroyed();
      }
      colliders.length = 0;
      actor.destroy();
      this._nativeActor = null;
    }
    // Owned and excluded Colliders find their new owner on the next sync
    this._markCollidersDirty();
  }

  private _markCollidersDirty(entity = this.entity): void {
    if (!entity._isActiveInScene || (entity.getComponent(Rigidbody) ?? this) !== this) return;
    const { _components: components, children } = entity;
    for (let i = 0, n = components.length; i < n; i++) {
      const component = components[i];
      component instanceof Collider && component._markDirty();
    }
    for (let i = 0, n = children.length; i < n; i++) this._markCollidersDirty(children[i]);
  }

  /**
   * Read the computed center of mass into its field, applying pending changes first.
   */
  private _readComputedCenterOfMass(): void {
    const actor = this._getSyncedActor();
    if (actor) {
      const centerOfMass = this._centerOfMass;
      // @ts-ignore
      centerOfMass._onValueChanged = null;
      actor.getCenterOfMass(centerOfMass);
      // @ts-ignore
      centerOfMass._onValueChanged = this._handleCenterOfMassChanged;
    }
  }

  private _readInertiaTensor(actor: IDynamicActor): void {
    const inertiaTensor = this._inertiaTensor;
    // @ts-ignore
    inertiaTensor._onValueChanged = null;
    actor.getInertiaTensor(inertiaTensor);
    // @ts-ignore
    inertiaTensor._onValueChanged = this._handleInertiaTensorChanged;
  }

  private _readInertiaTensorRotation(actor: IDynamicActor): void {
    const rotation = this._inertiaTensorRotation;
    // @ts-ignore
    const listener = rotation._onValueChanged;
    // @ts-ignore
    rotation._onValueChanged = null;
    actor.getInertiaTensorRotation(rotation);
    // @ts-ignore
    rotation._onValueChanged = listener;
  }

  private _writeInertiaTensorRotationUnchecked(x: number, y: number, z: number, w: number): void {
    const rotation = this._inertiaTensorRotation;
    // @ts-ignore
    const listener = rotation._onValueChanged;
    // @ts-ignore
    rotation._onValueChanged = null;
    rotation.set(x, y, z, w);
    // @ts-ignore
    rotation._onValueChanged = listener;
  }

  /**
   * Synchronizes pending Collider and mass changes before returning the native actor.
   */
  private _getSyncedActor(): IDynamicActor | null {
    if (this._registeredScene) {
      this._registeredScene.physics._syncColliders();
    } else if (this._massChanges && this._nativeActor) {
      this._updateMass();
    }
    return this._nativeActor;
  }

  private _getForceActor(): IDynamicActor | null {
    if (this._index === -1 || this._isKinematic || !this._simulationEnabled) return null;
    this._cancelPendingSleep();
    return this._getSyncedActor();
  }

  /** @internal */
  _isActivating(): boolean {
    for (let entity: Entity | null = this.entity; entity; entity = entity.parent) {
      if (entity._isActivating) return true;
    }
    return false;
  }

  /** @internal Consumes a sleep request after the scene has synchronized all Collider edits. */
  _applyScheduledSleep(): void {
    this._sleepPending = false;
    this._nativeActor!.sleep();
  }

  private _cancelPendingSleep(): void {
    if (this._sleepPending) {
      this._sleepPending = false;
      this._registeredScene?.physics._scheduleSleep(this, false);
    }
  }

  @ignoreClone
  private _onTransformChanged(): void {
    if (this._writingBack) return;
    this._wasSleeping = false;
    this._registeredScene?.physics._markBodyDirty(this);
  }

  @ignoreClone
  private _setLinearVelocity(): void {
    if (!this._isKinematic && this._simulationEnabled) {
      this._cancelPendingSleep();
      this._nativeActor?.setLinearVelocity(this._linearVelocity);
    }
  }

  @ignoreClone
  private _setAngularVelocity(): void {
    if (!this._isKinematic && this._simulationEnabled) {
      this._cancelPendingSleep();
      this._nativeActor?.setAngularVelocity(this._angularVelocity);
    }
  }

  @ignoreClone
  private _handleCenterOfMassChanged(): void {
    this._automaticCenterOfMass = false;
    this._nativeActor?.setCenterOfMass(this._centerOfMass);
  }

  @ignoreClone
  private _handleInertiaTensorChanged(): void {
    if (this._automaticInertiaTensor) {
      // Changing mass alone does not move the principal axes; defer scalar mass until manual flags commit.
      const deferMass = this._massDirtyIndex !== -1 && (this._massChanges & ~MassChanges.Mass) === 0;
      if (deferMass) this._massChanges = MassChanges.None;
      this._registeredScene?.physics._syncColliders();
      this._nativeActor && this._readInertiaTensorRotation(this._nativeActor);
      deferMass && this._markMassDirty(MassChanges.Mass);
    }
    this._automaticInertiaTensor = false;
    this._nativeActor?.setInertiaTensor(this._inertiaTensor);
  }

  @ignoreClone
  private _handleInertiaTensorRotationChanged(): void {
    this._applyInertiaTensorRotation(this._inertiaTensorRotation);
  }

  private _applyInertiaTensorRotation(value: Quaternion): void {
    const { x, y, z, w } = value;
    const length = Math.hypot(x, y, z, w);
    if (!Number.isFinite(length) || length === 0) {
      if (value === this._inertiaTensorRotation) {
        if (this._nativeActor) {
          this._readInertiaTensorRotation(this._nativeActor);
        } else {
          const last = this._lastValidInertiaTensorRotation;
          this._writeInertiaTensorRotationUnchecked(
            last ? last.x : 0,
            last ? last.y : 0,
            last ? last.z : 0,
            last ? last.w : 1
          );
        }
      }
      throw new Error("Rigidbody inertia rotation must be nonzero and finite.");
    }
    const nx = x / length;
    const ny = y / length;
    const nz = z / length;
    const nw = w / length;
    let actor: IDynamicActor | null;
    if (this._automaticInertiaTensor) {
      actor = this._getSyncedActor();
      actor && this._readInertiaTensor(actor);
      this._automaticInertiaTensor = false;
    } else {
      actor = this._nativeActor;
    }
    this._writeInertiaTensorRotationUnchecked(nx, ny, nz, nw);
    if (!actor) (this._lastValidInertiaTensorRotation ||= new Quaternion()).set(nx, ny, nz, nw);
    actor?.setInertiaTensorRotation(this._inertiaTensorRotation);
  }
}

const enum MassChanges {
  None = 0,
  Mass = 1,
  Geometry = 2
}

/** How a force or torque changes a body's velocity. */
export enum ForceMode {
  /** Force or torque multiplied by the timestep and divided by the mass or inertia. */
  Force = 0,
  /** Impulse divided by the mass or inertia. */
  Impulse = 1,
  /** One-time change to velocity or angular velocity. */
  VelocityChange = 2,
  /** Acceleration multiplied by the timestep. */
  Acceleration = 3
}

/**
 * Use these flags to constrain motion of a Rigidbody.
 */
export enum RigidbodyConstraints {
  /** Not Freeze. */
  None = 0,
  /** Freeze motion along the world X-axis. */
  FreezePositionX = 1,
  /** Freeze motion along the world Y-axis. */
  FreezePositionY = 2,
  /** Freeze motion along the world Z-axis. */
  FreezePositionZ = 4,
  /** Freeze rotation about the world X-axis. */
  FreezeRotationX = 8,
  /** Freeze rotation about the world Y-axis. */
  FreezeRotationY = 16,
  /** Freeze rotation about the world Z-axis. */
  FreezeRotationZ = 32,
  /** Freeze translation along all axes. */
  FreezePosition = FreezePositionX | FreezePositionY | FreezePositionZ,
  /** Freeze rotation about all axes. */
  FreezeRotation = FreezeRotationX | FreezeRotationY | FreezeRotationZ,
  /** Freeze all translation and rotation. */
  FreezeAll = FreezePosition | FreezeRotation
}
