import { IDynamicCollider } from "@galacean/engine-design";
import { MathUtil, Quaternion, Vector3 } from "@galacean/engine";
import { PhysXCollider } from "./PhysXCollider";
import { PhysXPhysics } from "./PhysXPhysics";

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
  private static _tempTranslation = new Vector3();
  private static _tempRotation = new Quaternion();

  private _isKinematic = false;

  constructor(physXPhysics: PhysXPhysics, position: Vector3, rotation: Quaternion) {
    super(physXPhysics);
    const transform = this._transform(position, rotation);
    this._pxActor = physXPhysics._pxPhysics.createRigidDynamic(transform);
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
   * {@inheritDoc IDynamicCollider.getLinearVelocity }
   */
  getLinearVelocity(out: Vector3): Vector3 {
    const velocity = this._pxActor.getLinearVelocity();
    return out.set(velocity.x, velocity.y, velocity.z);
  }

  /**
   * {@inheritDoc IDynamicCollider.setLinearVelocity }
   */
  setLinearVelocity(value: Vector3): void {
    this._pxActor.setLinearVelocity(value, true);
  }

  /**
   * {@inheritDoc IDynamicCollider.getAngularVelocity }
   */
  getAngularVelocity(out: Vector3): Vector3 {
    const velocity = this._pxActor.getAngularVelocity();
    return out.set(
      MathUtil.radianToDegree(velocity.x),
      MathUtil.radianToDegree(velocity.y),
      MathUtil.radianToDegree(velocity.z)
    );
  }

  /**
   * {@inheritDoc IDynamicCollider.setAngularVelocity }
   */
  setAngularVelocity(value: Vector3): void {
    PhysXDynamicCollider._tempTranslation.set(
      MathUtil.degreeToRadian(value.x),
      MathUtil.degreeToRadian(value.y),
      MathUtil.degreeToRadian(value.z)
    );
    this._pxActor.setAngularVelocity(PhysXDynamicCollider._tempTranslation, true);
  }

  /**
   * {@inheritDoc IDynamicCollider.setMass }
   */
  setMass(value: number): void {
    this._pxActor.setMass(value);
  }

  /**
   * {@inheritDoc IDynamicCollider.getCenterOfMass }
   */
  getCenterOfMass(out: Vector3): Vector3 {
    const { translation } = this._pxActor.getCMassLocalPose();
    return out.set(translation.x, translation.y, translation.z);
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
   * {@inheritDoc IDynamicCollider.getInertiaTensor }
   */
  getInertiaTensor(out: Vector3): Vector3 {
    const inertia = this._pxActor.getMassSpaceInertiaTensor();
    return out.set(inertia.x, inertia.y, inertia.z);
  }

  /**
   * {@inheritDoc IDynamicCollider.setMassAndUpdateInertia }
   */
  setMassAndUpdateInertia(mass: number): void {
    this._pxActor.setMassAndUpdateInertia(mass);
  }

  /**
   * {@inheritDoc IDynamicCollider.setMaxAngularVelocity }
   */
  setMaxAngularVelocity(value: number): void {
    this._pxActor.setMaxAngularVelocity(MathUtil.degreeToRadian(value));
  }

  /**
   * {@inheritDoc IDynamicCollider.setMaxDepenetrationVelocity }
   */
  setMaxDepenetrationVelocity(value: number): void {
    this._pxActor.setMaxDepenetrationVelocity(value);
  }

  /**
   * {@inheritDoc IDynamicCollider.setSleepThreshold }
   * @default 1e-5f * PxTolerancesScale::speed * PxTolerancesScale::speed
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
    const effectiveMode =
      this._isKinematic && value !== CollisionDetectionMode.ContinuousSpeculative
        ? CollisionDetectionMode.Discrete
        : value;
    this._applyCollisionDetectionFlags(effectiveMode);
  }

  /**
   * {@inheritDoc IDynamicCollider.setUseGravity }
   */
  setUseGravity(value: boolean): void {
    this._pxActor.setActorFlag(this._physXPhysics._physX.PxActorFlag.eDISABLE_GRAVITY, !value);
  }

  /**
   * {@inheritDoc IDynamicCollider.setIsKinematic }
   */
  setIsKinematic(value: boolean): void {
    if (this._isKinematic === value) return;
    const physX = this._physXPhysics._physX;
    // PhysX rejects swept CCD when eKINEMATIC is raised.
    if (value && this._pxActor.getRigidBodyFlags(physX.PxRigidBodyFlag.eENABLE_CCD)) {
      this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD, false);
      this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD_FRICTION, false);
    }
    this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eKINEMATIC, value);
    this._isKinematic = value;
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
    this._pxActor.addForce(force);
  }

  /**
   * {@inheritDoc IDynamicCollider.addForceAtPosition }
   */
  addForceAtPosition(force: Vector3, position: Vector3) {
    this._pxActor.addForceAtPos(force, position);
  }

  /**
   * {@inheritDoc IDynamicCollider.addTorque }
   */
  addTorque(torque: Vector3) {
    this._pxActor.addTorque(torque);
  }

  /**
   * {@inheritDoc IDynamicCollider.move }
   */
  move(positionOrRotation: Vector3 | Quaternion, rotation?: Quaternion): void {
    const tempRotation = PhysXDynamicCollider._tempRotation;

    if (rotation) {
      // PhysX validates kinematic targets before normalizing them internally.
      const targetRotation = rotation.normalized ? rotation : tempRotation.copyFrom(rotation).normalize();
      this._pxActor.setKinematicTarget(positionOrRotation, targetRotation);
      return;
    }

    const tempTranslation = PhysXDynamicCollider._tempTranslation;
    this.getWorldTransform(tempTranslation, tempRotation);
    if (positionOrRotation instanceof Vector3) {
      // Rotations read from PhysX are already normalized.
      this._pxActor.setKinematicTarget(positionOrRotation, tempRotation);
    } else {
      const targetRotation = positionOrRotation.normalized
        ? positionOrRotation
        : tempRotation.copyFrom(positionOrRotation).normalize();
      this._pxActor.setKinematicTarget(tempTranslation, targetRotation);
    }
  }

  /**
   * {@inheritDoc IDynamicCollider.sleep }
   */
  sleep(): void {
    return this._pxActor.putToSleep();
  }

  /**
   * {@inheritDoc IDynamicCollider.isSleeping }
   */
  isSleeping(): boolean {
    return this._pxActor.isSleeping();
  }

  /**
   * {@inheritDoc IDynamicCollider.wakeUp }
   */
  wakeUp(): void {
    return this._pxActor.wakeUp();
  }

  private _applyCollisionDetectionFlags(value: number): void {
    const physX = this._physXPhysics._physX;
    const enableCCD = value === CollisionDetectionMode.Continuous || value === CollisionDetectionMode.ContinuousDynamic;
    // PhysX rejects enabling swept and speculative CCD at the same time.
    if (enableCCD) {
      this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD, false);
    }
    this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD, enableCCD);
    this._pxActor.setRigidBodyFlag(
      physX.PxRigidBodyFlag.eENABLE_CCD_FRICTION,
      value === CollisionDetectionMode.ContinuousDynamic
    );
    if (!enableCCD) {
      this._pxActor.setRigidBodyFlag(
        physX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD,
        value === CollisionDetectionMode.ContinuousSpeculative
      );
    }
  }
}
