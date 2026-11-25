import { ForceMode, IDynamicActor, RigidbodyConstraints } from "@galacean/engine-design";
import { MathUtil, Quaternion, type QuaternionLike, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import type { ICloneHook } from "../clone/ICloneHook";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { ActiveChangeFlag } from "../enums/ActiveChangeFlag";
import type { Scene } from "../Scene";
import { Transform } from "../Transform";
import { Utils } from "../Utils";
import { Collider } from "./Collider";
import { differsF32, isValidPositiveFloat32, rotationDiffersF32 } from "./float32";
import type { Joint } from "./joint/Joint";

export { ForceMode, RigidbodyConstraints } from "@galacean/engine-design";

/** @internal */
export interface RigidbodyPose {
  position: Vector3;
  rotation: Quaternion;
}

/**
 * Simulates the motion of an Entity and its compound collision shape.
 * @remarks Each Entity can have one Rigidbody. It owns colliders on its Entity and descendants up to the next
 * Rigidbody. Setting `enabled` to false removes those shapes from simulation and queries while preserving their `enabled` values.
 * Removing it lets the next ancestor Rigidbody take ownership, or makes the shapes static if there is no ancestor body.
 * @decorator `@dependentComponents(Transform, DependentMode.CheckOnly)`
 */
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Rigidbody extends Component implements ICloneHook<Rigidbody> {
  private static readonly _tempPosition = new Vector3();
  private static readonly _tempRotation = new Quaternion();
  private static readonly _tempCenter = new Vector3();
  private static readonly _tempVec0 = new Vector3();
  private static readonly _tempVec1 = new Vector3();
  private static readonly _tempVec2 = new Vector3();
  private static _validateNonNegativeFloat32(value: number, name: string): void {
    if (typeof value !== "number" || !(value >= 0 && Number.isFinite(Math.fround(value)))) {
      throw new RangeError(`Rigidbody ${name} must be finite and nonnegative.`);
    }
  }

  private static _validateSpeedLimit(value: number): void {
    if (typeof value !== "number" || !(value >= 0 && Number.isFinite(Math.fround(Math.fround(value) ** 2)))) {
      throw new RangeError("Rigidbody speed limit must be nonnegative with a finite Float32 square.");
    }
  }

  private static _transformRelativeVector(actor: IDynamicActor, local: Vector3): Vector3 | null {
    const rotation = Rigidbody._tempRotation;
    const world = Rigidbody._tempVec0;
    actor.getWorldTransform(Rigidbody._tempPosition, rotation);
    Vector3.transformByQuat(local, rotation, world);
    return Number.isFinite(world.x) && Number.isFinite(world.y) && Number.isFinite(world.z) ? world : null;
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
  private _writingPose: RigidbodyPose | null = null;

  @ignoreClone
  private _poseSynced = false;
  @ignoreClone
  private _registeredScene: Scene | null = null;
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
  private _maxLinearVelocity = 1e16;
  private _maxAngularVelocity = 100;
  private _maxDepenetrationVelocity = 10;
  private _solverIterations = 4;
  private _solverVelocityIterations = 1;
  private _useGravity = true;
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
    Rigidbody._validateNonNegativeFloat32(value, "linearDamping");
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
    Rigidbody._validateNonNegativeFloat32(value, "angularDamping");
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
      this._linearVelocity._onValueChanged = null;
      actor.getLinearVelocity(this._linearVelocity);
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
      this._angularVelocity._onValueChanged = null;
      actor.getAngularVelocity(this._angularVelocity);
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
   * A read-only snapshot of the inertia tensor's principal-axis rotation relative to the body.
   * @remarks Assign a complete rotation to normalize and disable {@link automaticInertiaTensor}.
   * @throws When the rotation is not finite or has zero length.
   */
  get inertiaTensorRotation(): Readonly<QuaternionLike> {
    if (this._automaticInertiaTensor) {
      const actor = this._getSyncedActor();
      actor && this._readInertiaTensorRotation(actor);
    }
    return this._inertiaTensorRotation;
  }

  set inertiaTensorRotation(value: Readonly<QuaternionLike>) {
    this._setInertiaTensorRotation(value);
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
   * @throws When assigned a negative or non-finite Float32 value.
   */
  get maxDepenetrationVelocity(): number {
    return this._maxDepenetrationVelocity;
  }

  set maxDepenetrationVelocity(value: number) {
    Rigidbody._validateNonNegativeFloat32(value, "maxDepenetrationVelocity");
    if (this._maxDepenetrationVelocity !== value) {
      this._maxDepenetrationVelocity = value;
      this._nativeActor?.setMaxDepenetrationVelocity(value);
    }
  }

  /**
   * The mass-normalized energy threshold, below which objects start going to sleep.
   * @throws When assigned a negative or non-finite Float32 value.
   */
  get sleepThreshold(): number {
    return this._sleepThreshold;
  }

  set sleepThreshold(value: number) {
    Rigidbody._validateNonNegativeFloat32(value, "sleepThreshold");
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
      this._poseSynced = false;
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
      // Revisit the hierarchy so excluded shapes rejoin on kinematic or re-evaluate dynamic constraints.
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
   * @throws When physics is not initialized on the Engine or the Entity already has a Rigidbody.
   */
  constructor(entity: Entity) {
    if (!entity.engine._physicsInitialized) {
      throw new Error("Physics is not initialized on this Engine.");
    }
    if (entity.getComponent(Rigidbody)) {
      throw new Error(`Entity "${entity.name}" already has a Rigidbody.`);
    }
    super(entity);

    this._setLinearVelocity = this._setLinearVelocity.bind(this);
    this._setAngularVelocity = this._setAngularVelocity.bind(this);
    this._handleCenterOfMassChanged = this._handleCenterOfMassChanged.bind(this);
    this._handleInertiaTensorChanged = this._handleInertiaTensorChanged.bind(this);
    this._onTransformChanged = this._onTransformChanged.bind(this);

    this._linearVelocity._onValueChanged = this._setLinearVelocity;
    this._angularVelocity._onValueChanged = this._setAngularVelocity;
    this._centerOfMass._onValueChanged = this._handleCenterOfMassChanged;
    this._inertiaTensor._onValueChanged = this._handleInertiaTensorChanged;
    entity._updateFlagManager.addListener(this._onTransformChanged);
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
    if (!scene) return false;
    scene.physics._syncColliders(false);
    const mass = this._nativeActor!.setDensity(density, this._automaticCenterOfMass, this._automaticInertiaTensor);
    if (mass === 0) return false;
    this._mass = mass;
    this._massChanges = MassChanges.None;
    return true;
  }

  /**
   * Writes the world-space position of the center of mass to `out`.
   * @returns The output vector.
   */
  getWorldCenterOfMass(out: Vector3): Vector3 {
    const transform = this.entity.transform;
    const center = Rigidbody._tempCenter;
    Vector3.transformByQuat(this.centerOfMass, transform.worldRotationQuaternion, center);
    Vector3.add(center, transform.worldPosition, out);
    return out;
  }

  /**
   * Writes the simulated world-space velocity at a world-space point.
   * @param point - Point in world space.
   * @param out - Receives the velocity, or zero before the body has a physics actor.
   * @returns The output vector.
   */
  getPointVelocity(point: Vector3, out: Vector3): Vector3 {
    return this._computePointVelocity(point, out, false);
  }

  /**
   * Writes the simulated world-space velocity at a point in the unscaled local frame of the body.
   * @param point - Point in the body's local frame.
   * @param out - Receives the velocity, or zero before the body has a physics actor.
   * @returns The output vector.
   */
  getRelativePointVelocity(point: Vector3, out: Vector3): Vector3 {
    return this._computePointVelocity(point, out, true);
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
    if (mode !== ForceMode.Force && mode !== ForceMode.Impulse) {
      throw new RangeError("applyForceAtPosition requires ForceMode.Force or ForceMode.Impulse.");
    }
    this._getForceActor()?.addForceAtPosition(force, position, mode === ForceMode.Impulse);
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
    const actor = this._getForceActor();
    const worldForce = actor && Rigidbody._transformRelativeVector(actor, force);
    worldForce && actor.addForce(worldForce, mode);
  }

  /**
   * Applies a torque around the body's local axes.
   * @param torque - Body-local vector in the units of the selected mode.
   * @param mode - How the value changes angular velocity. Defaults to `ForceMode.Force`.
   */
  applyRelativeTorque(torque: Vector3, mode: ForceMode = ForceMode.Force): void {
    const actor = this._getForceActor();
    const worldTorque = actor && Rigidbody._transformRelativeVector(actor, torque);
    worldTorque && actor.addTorque(worldTorque, mode);
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
    if (
      this._index === -1 ||
      this._isKinematic ||
      !Number.isFinite(strength) ||
      !Number.isFinite(radius) ||
      radius < 0 ||
      !Number.isFinite(upwardOffset) ||
      !Number.isFinite(origin.x) ||
      !Number.isFinite(origin.y) ||
      !Number.isFinite(origin.z)
    ) {
      return;
    }
    const actor = this._getSyncedActor()!;

    const position = Rigidbody._tempPosition;
    const rotation = Rigidbody._tempRotation;
    const center = Rigidbody._tempCenter;
    const surface = Rigidbody._tempVec0;
    const force = Rigidbody._tempVec1;
    const torque = Rigidbody._tempVec2;
    actor.getWorldTransform(position, rotation);
    actor.getCenterOfMass(center);
    Vector3.transformByQuat(center, rotation, center);
    center.add(position);

    let pointX = center.x;
    let pointY = center.y;
    let pointZ = center.z;
    let closest = Number.MAX_VALUE;
    const colliders = this._attachedColliders;
    for (let i = 0, n = colliders.length; i < n; i++) {
      const distance = colliders[i]._getVolumeDistance(origin, surface);
      if (distance === 0) {
        pointX = center.x;
        pointY = center.y;
        pointZ = center.z;
        break;
      }
      if (distance > 0 && distance < closest) {
        closest = distance;
        pointX = surface.x;
        pointY = surface.y;
        pointZ = surface.z;
      }
    }

    const x = pointX - origin.x;
    const y = pointY - origin.y;
    const z = pointZ - origin.z;
    const xzSquared = x * x + z * z;
    const falloff = radius === 0 ? 1 : 1 - Math.sqrt(xzSquared + y * y) / radius;
    if (falloff <= 0) return;

    const raisedY = y + upwardOffset;
    const length = Math.sqrt(xzSquared + raisedY * raisedY);
    if (length === 0) return;

    const scale = (strength * falloff) / length;
    force.set(x * scale, raisedY * scale, z * scale);
    surface.set(pointX - center.x, pointY - center.y, pointZ - center.z);
    Vector3.cross(surface, force, torque);
    if (
      !Number.isFinite(Math.fround(force.x)) ||
      !Number.isFinite(Math.fround(force.y)) ||
      !Number.isFinite(Math.fround(force.z)) ||
      !Number.isFinite(Math.fround(torque.x)) ||
      !Number.isFinite(Math.fround(torque.y)) ||
      !Number.isFinite(Math.fround(torque.z))
    ) {
      return;
    }

    this._cancelPendingSleep();
    actor.addForce(force, mode);
    actor.addTorque(torque, mode);
  }

  /**
   * Sets the world-space target position for the next kinematic simulation step, preserving the target rotation.
   * @remarks The target is used for scene queries immediately. The Entity's transform advances during simulation.
   * @throws When the body is dynamic.
   */
  move(position: Vector3): void;

  /**
   * Sets the world-space target rotation for the next kinematic simulation step, preserving the target position.
   * @remarks Requires an active kinematic Rigidbody.
   * @throws When the body is dynamic.
   */
  move(rotation: Quaternion): void;

  /**
   * Sets the world-space target position and rotation for the next kinematic simulation step.
   * @remarks Requires an active kinematic Rigidbody.
   * @throws When the body is dynamic.
   */
  move(position: Vector3, rotation: Quaternion): void;

  move(positionOrRotation: Vector3 | Quaternion, rotation?: Quaternion): void {
    if (!this._isKinematic) throw new Error("Rigidbody.move requires a kinematic body.");
    if (this._index === -1) return;
    // Teleport pending transform edits first so the move starts from the current pose
    const actor = this._getSyncedActor()!;
    this._poseSynced = false;
    if (rotation) {
      actor.move(<Vector3>positionOrRotation, rotation);
    } else if (positionOrRotation instanceof Vector3) {
      actor.move(positionOrRotation, null);
    } else {
      actor.move(null, positionOrRotation);
    }
  }

  /**
   * Puts an active dynamic body to sleep.
   * @remarks A request before registration in a scene applies before the first simulation step after registration.
   */
  sleep(): void {
    if (this._isKinematic) return;
    const scene = this._registeredScene;
    if (!scene) {
      this._sleepPending = true;
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
   * Wakes a dynamic body and cancels a pending sleep request.
   */
  wakeUp(): void {
    this._cancelPendingSleep();
    this._wakeNative();
  }

  /** @internal Wakes the native actor while preserving an explicit sleep request for activation. */
  _wakeNative(): void {
    this._poseSynced = false;
    if (this._index !== -1 && !this._isKinematic) {
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
    this._poseSynced = false;
    this._markMassDirty();
    this._sleepPending && scene.physics._scheduleSleep(this, true);
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
    this._poseSynced = false;
    this._sleepPending && scene.physics._scheduleSleep(this, false);
    this._syncJoints();
    if (!this.destroyed) this._detachOrphanedColliders();
    scene.physics._removeRigidbody(this);
  }

  /** @internal */
  _getRegisteredActor(scene: Scene): IDynamicActor | null {
    return this._registeredScene === scene ? this._nativeActor : null;
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
      actor.setLinearDamping(this._linearDamping);
      actor.setAngularDamping(this._angularDamping);
      if (!this._isKinematic) {
        actor.setLinearVelocity(this._linearVelocity);
        actor.setAngularVelocity(this._angularVelocity);
      }
      actor.setMassProperties(
        this._mass,
        this._automaticCenterOfMass ? undefined : this._centerOfMass,
        this._automaticInertiaTensor ? undefined : this._inertiaTensor,
        this._automaticInertiaTensor ? undefined : this._inertiaTensorRotation
      );
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
    if (Utils.removeFromArray(this._attachedColliders, collider)) this._markMassDirty();
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
    this._joints && Utils.removeFromArray(this._joints, joint);
  }

  /**
   * @internal
   * Recompute automatic mass properties before the next simulation step or mass-dependent access.
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
      this._poseSynced = false;
      nativePosition.copyFrom(position);
      nativeRotation.copyFrom(rotation);
      actor.setWorldTransform(position, rotation);
      // A query inside a Transform setter can commit a newer authored pose during writeback.
      const publishing = this._writingPose;
      if (publishing) {
        publishing.position.copyFrom(position);
        publishing.rotation.copyFrom(rotation);
      }
    }
  }

  /**
   * @internal
   * Write the simulated pose back to the Entity.
   */
  _writeBack(scene: Scene, pose: RigidbodyPose): void {
    if (this._registeredScene !== scene) return;
    const actor = this._nativeActor!;
    if (this._poseSynced && (this._isKinematic || actor.isSleeping())) return;
    this._poseSynced = this._isKinematic;

    // A nested simulation of this body must publish its newer pose to the outer setter as well.
    const previous = this._writingPose;
    const { position, rotation } = (this._writingPose = previous ?? pose);
    actor.getWorldTransform(position, rotation);
    const transform = this.entity.transform;
    const worldPosition = transform.worldPosition;
    const positionChanged = differsF32(position, worldPosition);
    if (positionChanged) transform.worldPosition = position;
    const worldRotation = transform.worldRotationQuaternion;
    const rotationChanged = rotationDiffersF32(rotation, worldRotation);
    if (rotationChanged) transform.worldRotationQuaternion = rotation;

    // A constrained Transform can publish a different pose from the one the actor supplied.
    const changed = positionChanged || rotationChanged;
    this._nativePosition.copyFrom(changed ? transform.worldPosition : worldPosition);
    this._nativeRotation.copyFrom(changed ? transform.worldRotationQuaternion : worldRotation);
    // Poll sleep once the pose settles, including transforms that constrain the simulated pose.
    if (
      !this._isKinematic &&
      (!changed || differsF32(position, this._nativePosition) || rotationDiffersF32(rotation, this._nativeRotation)) &&
      this._registeredScene === scene
    ) {
      this._poseSynced = actor.isSleeping();
    }
    this._writingPose = previous;
  }

  /** @internal Retry an interrupted Transform write on the next step. */
  _abortWriteBack(pose: RigidbodyPose): void {
    if (this._writingPose === pose) this._writingPose = null;
    this._poseSynced = false;
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
    const autoCom = this._automaticCenterOfMass;
    const autoInertia = this._automaticInertiaTensor;
    // PhysX uses zero as infinite mass, but automatic mass properties require a positive mass.
    if ((autoCom || autoInertia) && isValidPositiveFloat32(mass)) {
      const colliders = this._attachedColliders;
      const count = colliders.length;
      // Dynamic actors already exclude kinematic-only geometry when their shapes attach.
      let i = this._isKinematic ? 0 : count;
      while (i < count && colliders[i]._nativeSupportsDynamicBody()) i++;
      if (i === count) {
        actor.updateMassAndInertia(
          mass,
          autoCom ? null : this._centerOfMass,
          autoInertia ? null : this._inertiaTensor,
          autoInertia ? null : this._inertiaTensorRotation
        );
        return;
      }
    }
    changes & MassChanges.Mass && actor.setMassProperties(mass);
  }

  /** @internal Consumes a sleep request after the scene has synchronized all Collider edits. */
  _applyScheduledSleep(): void {
    this._sleepPending = false;
    this._nativeActor!.sleep();
  }

  protected override _onDestroy(): void {
    this._linearVelocity._onValueChanged = this._angularVelocity._onValueChanged = null;
    this._centerOfMass._onValueChanged = this._inertiaTensor._onValueChanged = null;
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

  private _syncJoints(): void {
    const joints = this._joints;
    if (joints) {
      for (let i = joints.length - 1; i >= 0; i--) {
        joints[i]._syncActiveJoint();
      }
    }
  }

  private _markCollidersDirty(entity = this.entity): void {
    if (!entity._isActiveInScene || (entity.getComponent(Rigidbody) ?? this) !== this) return;
    const { _components: components, children } = entity;
    for (let i = 0, n = components.length; i < n; i++) {
      const component = components[i];
      component instanceof Collider && component._attachedBody !== this && component._markDirty();
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
      centerOfMass._onValueChanged = null;
      actor.getCenterOfMass(centerOfMass);
      centerOfMass._onValueChanged = this._handleCenterOfMassChanged;
    }
  }

  private _readInertiaTensor(actor: IDynamicActor): void {
    const inertiaTensor = this._inertiaTensor;
    inertiaTensor._onValueChanged = null;
    actor.getInertiaTensor(inertiaTensor);
    inertiaTensor._onValueChanged = this._handleInertiaTensorChanged;
  }

  private _readInertiaTensorRotation(actor: IDynamicActor): void {
    const rotation = Rigidbody._tempRotation;
    actor.getInertiaTensorRotation(rotation);
    const current = this._inertiaTensorRotation;
    if (current.x !== rotation.x || current.y !== rotation.y || current.z !== rotation.z || current.w !== rotation.w) {
      this._inertiaTensorRotation = rotation.clone();
    }
  }

  private _computePointVelocity(point: Vector3, out: Vector3, relative: boolean): Vector3 {
    const actor = this._getSyncedActor();
    if (!actor) return out.set(0, 0, 0);
    const position = Rigidbody._tempPosition;
    const rotation = Rigidbody._tempRotation;
    const center = Rigidbody._tempCenter;
    const linearVelocity = Rigidbody._tempVec0;
    const angularVelocity = Rigidbody._tempVec1;
    const offset = Rigidbody._tempVec2;
    actor.getWorldTransform(position, rotation);
    actor.getCenterOfMass(center);
    if (relative) {
      offset.set(point.x - center.x, point.y - center.y, point.z - center.z);
      Vector3.transformByQuat(offset, rotation, offset);
    } else {
      Vector3.transformByQuat(center, rotation, center);
      center.add(position);
      offset.set(point.x - center.x, point.y - center.y, point.z - center.z);
    }
    actor.getLinearVelocity(linearVelocity);
    actor.getAngularVelocity(angularVelocity);
    Vector3.cross(angularVelocity, offset, offset);
    Vector3.add(offset, linearVelocity, out);
    return out;
  }

  /**
   * Synchronizes pending Collider pose/ownership edits and flushes this body's pending mass update.
   */
  private _getSyncedActor(): IDynamicActor | null {
    this._registeredScene?.physics._syncColliders(false);
    if (this._massChanges && this._nativeActor) {
      this._updateMass();
    }
    return this._nativeActor;
  }

  private _getForceActor(): IDynamicActor | null {
    if (this._index === -1 || this._isKinematic) return null;
    this._cancelPendingSleep();
    return this._getSyncedActor();
  }

  private _cancelPendingSleep(): void {
    if (this._sleepPending) {
      this._sleepPending = false;
      this._registeredScene?.physics._scheduleSleep(this, false);
    }
  }

  @ignoreClone
  private _onTransformChanged(): void {
    if (this._writingPose) return;
    this._poseSynced = false;
    this._registeredScene?.physics._markBodyDirty(this);
  }

  @ignoreClone
  private _setLinearVelocity(): void {
    if (!this._isKinematic) {
      this._cancelPendingSleep();
      this._nativeActor?.setLinearVelocity(this._linearVelocity);
    }
  }

  @ignoreClone
  private _setAngularVelocity(): void {
    if (!this._isKinematic) {
      this._cancelPendingSleep();
      this._nativeActor?.setAngularVelocity(this._angularVelocity);
    }
  }

  @ignoreClone
  private _handleCenterOfMassChanged(): void {
    this._automaticCenterOfMass = false;
    this._nativeActor?.setMassProperties(undefined, this._centerOfMass);
  }

  @ignoreClone
  private _handleInertiaTensorChanged(): void {
    if (this._automaticInertiaTensor) {
      // Changing mass alone does not move the principal axes; defer scalar mass until manual flags commit.
      const deferMass = this._massChanges === MassChanges.Mass;
      if (deferMass) this._massChanges = MassChanges.None;
      const actor = this._getSyncedActor();
      actor && this._readInertiaTensorRotation(actor);
      deferMass && this._markMassDirty(MassChanges.Mass);
    }
    this._automaticInertiaTensor = false;
    this._nativeActor?.setMassProperties(undefined, undefined, this._inertiaTensor);
  }

  // Runtime Prefab calls use this method name.
  private _setInertiaTensorRotation(value: Readonly<QuaternionLike>): void {
    const { x, y, z, w } = value;
    const length = Math.hypot(x, y, z, w);
    if (!Number.isFinite(length) || length === 0) {
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
    const current = this._inertiaTensorRotation;
    if (current.x !== nx || current.y !== ny || current.z !== nz || current.w !== nw) {
      this._inertiaTensorRotation = new Quaternion(nx, ny, nz, nw);
    }
    actor?.setMassProperties(undefined, undefined, undefined, this._inertiaTensorRotation);
  }
}

const enum MassChanges {
  None = 0,
  Mass = 1,
  Geometry = 2
}
