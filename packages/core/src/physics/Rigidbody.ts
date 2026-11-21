import { IDynamicCollider } from "@galacean/engine-design";
import { MathUtil, Quaternion, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import type { ICloneHook } from "../clone/ICloneHook";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { ActiveChangeFlag } from "../enums/ActiveChangeFlag";
import { Scene } from "../Scene";
import { Transform } from "../Transform";
import { Collider } from "./Collider";
import type { Joint } from "./joint/Joint";

/**
 * A Rigidbody puts its Entity under physics control and owns the Colliders on its Entity and descendants, stopping at
 * a nested Rigidbody.
 * @remarks
 * An Entity can have at most one Rigidbody. Disabling the Rigidbody removes it and its Colliders from simulation and
 * queries; their `enabled` values are unchanged. Removing it passes its Colliders to the nearest Rigidbody on an
 * ancestor, or makes them static when there is none.
 * @decorator `@dependentComponents(Transform, DependentMode.CheckOnly)`
 */
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Rigidbody extends Component implements ICloneHook<Rigidbody> {
  private static _tempPosition = new Vector3();
  private static _tempRotation = new Quaternion();

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
  private _massChanged = false;
  @ignoreClone
  private _nativeActor: IDynamicCollider | null = null;
  @ignoreClone
  private _attachedColliders: Collider[] = [];
  @ignoreClone
  private _connectedJoints: Joint[] | null = null;
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
  private _centerOfMassAuthored = false;
  private _inertiaTensorAuthored = false;
  private _maxAngularVelocity = 18000 / Math.PI;
  private _maxDepenetrationVelocity = 1.0000000331813535e32;
  private _solverIterations = 4;
  private _useGravity = true;
  private _isKinematic = false;
  private _constraints: RigidbodyConstraints = 0;
  private _collisionDetectionMode: CollisionDetectionMode = CollisionDetectionMode.Discrete;
  private _sleepThreshold = 5e-3;
  private _automaticCenterOfMass = true;
  private _automaticInertiaTensor = true;

  /**
   * The linear damping of the Rigidbody.
   */
  get linearDamping(): number {
    return this._linearDamping;
  }

  set linearDamping(value: number) {
    if (this._linearDamping !== value) {
      this._linearDamping = value;
      this._nativeActor?.setLinearDamping(value);
    }
  }

  /**
   * The angular damping of the Rigidbody.
   */
  get angularDamping(): number {
    return this._angularDamping;
  }

  set angularDamping(value: number) {
    if (this._angularDamping !== value) {
      this._angularDamping = value;
      this._nativeActor?.setAngularDamping(value);
    }
  }

  /**
   * The linear velocity vector of the Rigidbody measured in world unit per second.
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
    if (this._linearVelocity !== value) {
      this._linearVelocity.copyFrom(value);
    }
  }

  /**
   * The angular velocity vector of the Rigidbody measured in degrees per second.
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
    if (this._angularVelocity !== value) {
      this._angularVelocity.copyFrom(value);
    }
  }

  /**
   * The mass of the Rigidbody.
   */
  get mass(): number {
    return this._mass;
  }

  set mass(value: number) {
    if (this._mass !== value) {
      this._mass = value;
      if (this._registeredScene) {
        this._massChanged = true;
        this._markMassDirty();
      } else {
        this._nativeActor?.setMass(value);
        this._massChanged = false;
      }
    }
  }

  /**
   * Whether the center of mass is calculated automatically from the attached Colliders.
   * @remarks Disabling uses the authored value, or preserves the current computed value if none was authored.
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
        const authored = this._centerOfMassAuthored;
        if (!authored) this._readComputedCenterOfMass();
        this._automaticCenterOfMass = false;
        if (authored) this._nativeActor?.setCenterOfMass(this._centerOfMass);
      }
    }
  }

  /**
   * The center of mass relative to the transform's origin.
   * @remarks Reads the authored value once written, otherwise the last effective value.
   * Simulation uses the computed value while `automaticCenterOfMass` is true.
   */
  get centerOfMass(): Vector3 {
    if (this._automaticCenterOfMass && !this._centerOfMassAuthored) this._readComputedCenterOfMass();
    return this._centerOfMass;
  }

  set centerOfMass(value: Vector3) {
    if (this._centerOfMass !== value) {
      this._centerOfMass.copyFrom(value);
    }
  }

  /**
   * Whether the inertia tensor is calculated automatically from the attached Colliders and mass.
   * @remarks Disabling uses the authored value, or preserves the current computed value if none was authored.
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
        const authored = this._inertiaTensorAuthored;
        if (!authored) this._readComputedInertiaTensor();
        this._automaticInertiaTensor = false;
        if (authored) this._nativeActor?.setInertiaTensor(this._inertiaTensor);
      }
    }
  }

  /**
   * The diagonal inertia tensor of mass relative to the center of mass.
   * @remarks Reads the authored value once written, otherwise the last effective value.
   * Simulation uses the computed value while `automaticInertiaTensor` is true.
   */
  get inertiaTensor(): Vector3 {
    if (this._automaticInertiaTensor && !this._inertiaTensorAuthored) this._readComputedInertiaTensor();
    return this._inertiaTensor;
  }

  set inertiaTensor(value: Vector3) {
    if (this._inertiaTensor !== value) {
      this._inertiaTensor.copyFrom(value);
    }
  }

  /**
   * The maximum angular velocity of the Rigidbody measured in degrees per second.
   */
  get maxAngularVelocity(): number {
    return this._maxAngularVelocity;
  }

  set maxAngularVelocity(value: number) {
    if (this._maxAngularVelocity !== value) {
      this._maxAngularVelocity = value;
      this._nativeActor?.setMaxAngularVelocity(value);
    }
  }

  /**
   * Maximum velocity of the Rigidbody when moving out of penetrating state.
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
   * The solverIterations determines how accurately joints and collision contacts are resolved.
   * Clamped to an integer in `[1, 255]`.
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
      this._nativeActor?.setSolverIterations(value);
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
   * Controls whether physics affects the Rigidbody.
   * @remarks Colliders that only support kinematic bodies, such as a non-convex {@link MeshCollider} or a
   * {@link PlaneCollider}, are excluded while this is false and automatically re-attached when set to true.
   */
  get isKinematic(): boolean {
    return this._isKinematic;
  }

  set isKinematic(value: boolean) {
    if (this._isKinematic !== value) {
      this._isKinematic = value;
      if (!value) {
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
      this._nativeActor?.setMotionState(value, this._collisionDetectionMode);
      // Owned colliders re-sync to exclude unsupported geometries on dynamic bodies or re-attach on kinematic ones
      this._phasedActiveInScene && this._markCollidersDirty();
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
   * The collision detection mode.
   * @remarks With the PhysX backend, Continuous and ContinuousDynamic are mapped to speculative CCD while the
   * Rigidbody is kinematic.
   */
  get collisionDetectionMode(): CollisionDetectionMode {
    return this._collisionDetectionMode;
  }

  set collisionDetectionMode(value: CollisionDetectionMode) {
    if (this._collisionDetectionMode !== value) {
      this._collisionDetectionMode = value;
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
    this._onTransformChanged = this._onTransformChanged.bind(this);

    //@ts-ignore
    this._linearVelocity._onValueChanged = this._setLinearVelocity;
    //@ts-ignore
    this._angularVelocity._onValueChanged = this._setAngularVelocity;
    //@ts-ignore
    this._centerOfMass._onValueChanged = this._handleCenterOfMassChanged;
    //@ts-ignore
    this._inertiaTensor._onValueChanged = this._handleInertiaTensorChanged;
    entity._updateFlagManager.addListener(this._onTransformChanged);
  }

  /**
   * Apply a force to the Rigidbody.
   * @param force - The force make the Rigidbody move
   */
  applyForce(force: Vector3): void {
    // The current mass properties convert the force, so pending Collider changes are applied first
    this._phasedActiveInScene && this._getSyncedActor()!.addForce(force);
  }

  /**
   * Apply a force to the Rigidbody at a given position in world space.
   * @param force - The force to apply, in world space
   * @param position - The position where the force is applied, in world space
   */
  applyForceAtPosition(force: Vector3, position: Vector3): void {
    this._phasedActiveInScene && this._getSyncedActor()!.addForceAtPosition(force, position);
  }

  /**
   * Apply a torque to the Rigidbody.
   * @param torque - The force make the Rigidbody rotate
   */
  applyTorque(torque: Vector3): void {
    this._phasedActiveInScene && this._getSyncedActor()!.addTorque(torque);
  }

  /**
   * Moves the kinematic Rigidbody to the specified position.
   * @remarks Only available when {@link isKinematic} is true.
   * Unlike setting the transform directly (teleport), this method affects Rigidbodies along the movement path.
   * @param position - The desired position for the kinematic Rigidbody
   */
  move(position: Vector3): void;

  /**
   * Moves the kinematic Rigidbody to the specified rotation.
   * @remarks Only available when {@link isKinematic} is true.
   * Unlike setting the transform directly (teleport), this method affects Rigidbodies along the movement path.
   * @param rotation - The desired rotation for the kinematic Rigidbody
   */
  move(rotation: Quaternion): void;

  /**
   * Moves the kinematic Rigidbody to the specified position and rotation.
   * @remarks Only available when {@link isKinematic} is true.
   * Unlike setting the transform directly (teleport), this method affects Rigidbodies along the movement path.
   * @param position - The desired position for the kinematic Rigidbody
   * @param rotation - The desired rotation for the kinematic Rigidbody
   */
  move(position: Vector3, rotation: Quaternion): void;

  move(positionOrRotation: Vector3 | Quaternion, rotation?: Quaternion): void {
    if (!this._isKinematic) {
      console.warn("Rigidbody: move() is only supported when isKinematic is true.");
      return;
    }
    // Teleport pending transform edits first so the move starts from the current pose
    this._phasedActiveInScene && this._getSyncedActor()!.move(positionOrRotation, rotation);
  }

  /**
   * Forces the Rigidbody to sleep at least one frame.
   */
  sleep(): void {
    this._nativeActor?.sleep();
  }

  /**
   * Returns whether the Rigidbody is sleeping.
   * @returns True if the Rigidbody is sleeping, false otherwise.
   */
  isSleeping(): boolean {
    return this._nativeActor?.isSleeping() ?? false;
  }

  /**
   * Forces the Rigidbody to wake up.
   */
  wakeUp(): void {
    this._nativeActor?.wakeUp();
  }

  /**
   * @internal
   * @inheritdoc
   */
  _onClone(target: Rigidbody): void {
    target._linearVelocity.copyFrom(this.linearVelocity);
    target._angularVelocity.copyFrom(this.angularVelocity);
    if (!this._automaticCenterOfMass || this._centerOfMassAuthored) {
      target._centerOfMass.copyFrom(this._centerOfMass);
      target._centerOfMassAuthored = this._centerOfMassAuthored;
    }
    if (!this._automaticInertiaTensor || this._inertiaTensorAuthored) {
      target._inertiaTensor.copyFrom(this._inertiaTensor);
      target._inertiaTensorAuthored = this._inertiaTensorAuthored;
    }
  }

  /**
   * @internal
   */
  override _onSceneChanged(scene: Scene): void {
    const joints = this._connectedJoints;
    if (joints) {
      for (let i = joints.length - 1; i >= 0; i--) {
        const joint = joints[i];
        const jointScene = joint.scene;
        if (jointScene === scene) {
          joint._syncNativeConnectedBody();
        } else if (jointScene && jointScene._mergingInto !== scene && scene._mergingInto !== jointScene) {
          joint._onConnectedBodyCrossScene();
        }
      }
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
    this.scene!.physics._addRigidbody(this);
    this._markCollidersDirty();
  }

  /**
   * @internal
   */
  override _onDisableInScene(scene: Scene): void {
    if (scene._mergingInto) {
      const joints = this._connectedJoints;
      if (joints) {
        for (let i = joints.length - 1; i >= 0; i--) {
          if (joints[i].scene === scene) {
            joints[i]._detachNativeConnectedBody();
          }
        }
      }
    }
    const colliders = this._attachedColliders;
    for (let i = colliders.length - 1; i >= 0; i--) {
      const collider = colliders[i];
      if (collider._findRigidbody() !== this) {
        // A hierarchy change may be waiting for the next collider sync.
        collider._detach();
        collider._markDirty();
      }
    }
    scene.physics._removeRigidbody(this);
  }

  /**
   * @internal
   * The native actor, created from the current fields and world pose on first use.
   */
  _getNativeActor(): IDynamicCollider {
    let actor = this._nativeActor;
    if (!actor) {
      const transform = this.entity.transform;
      const position = transform.worldPosition;
      const rotation = transform.worldRotationQuaternion;
      this._nativeActor = actor = Engine._nativePhysics.createDynamicCollider(position, rotation);
      this._nativePosition = position.clone();
      this._nativeRotation = rotation.clone();

      // Non-convex triangle meshes require a kinematic native actor before attachment
      actor.setMotionState(this._isKinematic, this._collisionDetectionMode);
      actor.setLinearDamping(this._linearDamping);
      actor.setAngularDamping(this._angularDamping);
      actor.setLinearVelocity(this._linearVelocity);
      actor.setAngularVelocity(this._angularVelocity);
      actor.setMass(this._mass);
      this._automaticCenterOfMass || actor.setCenterOfMass(this._centerOfMass);
      this._automaticInertiaTensor || actor.setInertiaTensor(this._inertiaTensor);
      actor.setMaxAngularVelocity(this._maxAngularVelocity);
      actor.setMaxDepenetrationVelocity(this._maxDepenetrationVelocity);
      actor.setSleepThreshold(this._sleepThreshold);
      actor.setSolverIterations(this._solverIterations);
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
  _attachConnectedJoint(joint: Joint): void {
    const joints = (this._connectedJoints ||= []);
    joints.push(joint);
  }

  /**
   * @internal
   */
  _detachConnectedJoint(joint: Joint): void {
    const joints = this._connectedJoints;
    if (joints) {
      const index = joints.indexOf(joint);
      if (index !== -1) {
        joints[index] = joints[joints.length - 1];
        joints.length--;
      }
    }
  }

  /**
   * @internal
   * Recompute automatic mass properties before the next simulation step or query.
   */
  _markMassDirty(): void {
    if (
      this._massDirtyIndex === -1 &&
      (this._automaticCenterOfMass || this._automaticInertiaTensor || this._massChanged)
    ) {
      this._registeredScene?.physics._queueMassUpdate(this);
    }
  }

  /**
   * @internal
   * Teleport the native actor to the Entity's world pose when it changed.
   */
  _syncPose(): void {
    const actor = this._nativeActor;
    if (actor) {
      const transform = this.entity.transform;
      // Reading the world matrix re-arms transform change notifications that are only sent from a clean state
      transform.worldMatrix;
      const position = transform.worldPosition;
      const rotation = transform.worldRotationQuaternion;
      const nativePosition = this._nativePosition;
      const nativeRotation = this._nativeRotation;
      if (Collider._differsF32(position, nativePosition) || Collider._rotationDiffersF32(rotation, nativeRotation)) {
        nativePosition.copyFrom(position);
        nativeRotation.copyFrom(rotation);
        actor.setWorldTransform(position, rotation);
      }
    }
  }

  /**
   * @internal
   * Write the simulated pose back to the Entity.
   */
  _writeBack(): void {
    const position = Rigidbody._tempPosition;
    const rotation = Rigidbody._tempRotation;
    this._nativeActor!.getWorldTransform(position, rotation);
    const transform = this.entity.transform;
    const worldPosition = transform.worldPosition;
    const positionChanged = !Vector3.equals(position, worldPosition);
    if (positionChanged) transform.worldPosition = position;

    const worldRotation = transform.worldRotationQuaternion;
    const rotationChanged = !Quaternion.equals(rotation, worldRotation);
    if (rotationChanged) transform.worldRotationQuaternion = rotation;

    // A constrained Transform can change position while resolving a rotation write.
    this._nativePosition.copyFrom(positionChanged || rotationChanged ? transform.worldPosition : worldPosition);
    this._nativeRotation.copyFrom(rotationChanged ? transform.worldRotationQuaternion : worldRotation);
  }

  /**
   * @internal
   * Commit an authored mass change and recompute automatic properties when attached geometry has volume.
   */
  _updateMass(): void {
    const massChanged = this._massChanged;
    this._massChanged = false;
    const actor = this._nativeActor;
    if (!actor) return;
    const mass = this._mass;
    // PhysX uses zero as infinite mass, but automatic mass properties require a positive mass.
    if ((this._automaticCenterOfMass || this._automaticInertiaTensor) && Collider._isValidPositiveFloat32(mass)) {
      const colliders = this._attachedColliders;
      const count = colliders.length;
      let i = 0;
      while (i < count && colliders[i]._nativeSupportsDynamicBody()) i++;
      if (i === count) {
        // PhysX overwrites both properties, restore the manual ones
        actor.setMassAndUpdateInertia(mass);
        this._automaticCenterOfMass || actor.setCenterOfMass(this._centerOfMass);
        this._automaticInertiaTensor || actor.setInertiaTensor(this._inertiaTensor);
        return;
      }
    }
    if (massChanged) actor.setMass(mass);
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this.entity._updateFlagManager.removeListener(this._onTransformChanged);
    const joints = this._connectedJoints;
    if (joints) {
      this._connectedJoints = null;
      for (let i = joints.length - 1; i >= 0; i--) {
        joints[i]._onConnectedBodyDestroyed();
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
      if (component instanceof Collider) component._markDirty();
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

  /**
   * Read the computed inertia tensor into its field, applying pending changes first.
   */
  private _readComputedInertiaTensor(): void {
    const actor = this._getSyncedActor();
    if (actor) {
      const inertiaTensor = this._inertiaTensor;
      // @ts-ignore
      inertiaTensor._onValueChanged = null;
      actor.getInertiaTensor(inertiaTensor);
      // @ts-ignore
      inertiaTensor._onValueChanged = this._handleInertiaTensorChanged;
    }
  }

  /**
   * The native actor after pending Collider and mass changes are applied, like before a query.
   */
  private _getSyncedActor(): IDynamicCollider | null {
    this._registeredScene?.physics._syncColliders();
    return this._nativeActor;
  }

  @ignoreClone
  private _onTransformChanged(): void {
    this._registeredScene?.physics._markBodyDirty(this);
  }

  @ignoreClone
  private _setLinearVelocity(): void {
    this._nativeActor?.setLinearVelocity(this._linearVelocity);
  }

  @ignoreClone
  private _setAngularVelocity(): void {
    this._nativeActor?.setAngularVelocity(this._angularVelocity);
  }

  @ignoreClone
  private _handleCenterOfMassChanged(): void {
    this._centerOfMassAuthored = true;
    if (!this._automaticCenterOfMass) this._nativeActor?.setCenterOfMass(this._centerOfMass);
  }

  @ignoreClone
  private _handleInertiaTensorChanged(): void {
    this._inertiaTensorAuthored = true;
    if (!this._automaticInertiaTensor) this._nativeActor?.setInertiaTensor(this._inertiaTensor);
  }
}

/**
 * The collision detection mode constants.
 */
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

/**
 * Use these flags to constrain motion of a Rigidbody.
 */
export enum RigidbodyConstraints {
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
