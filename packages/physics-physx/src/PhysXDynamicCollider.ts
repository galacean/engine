import { IDynamicCollider } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
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

  constructor(physXPhysics: PhysXPhysics, position: Vector3, rotation: Quaternion) {
    super(physXPhysics);
    const transform = this._transform(position, rotation);
    this._pxActor = physXPhysics._pxPhysics.createRigidDynamic(transform);
  }

  getLinearDamping(): number {
    return this._pxActor.getLinearDamping();
  }

  /**
   * {@inheritDoc IDynamicCollider.setLinearDamping }
   */
  setLinearDamping(value: number): void {
    this._pxActor.setLinearDamping(value);
  }

  getAngularDamping(): number {
    return this._pxActor.getAngularDamping();
  }

  /**
   * {@inheritDoc IDynamicCollider.setAngularDamping }
   */
  setAngularDamping(value: number): void {
    this._pxActor.setAngularDamping(value);
  }

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

  getAngularVelocity(out: Vector3): Vector3 {
    const velocity = this._pxActor.getAngularVelocity();
    return out.set(velocity.x, velocity.y, velocity.z);
  }
  /**
   * {@inheritDoc IDynamicCollider.setAngularVelocity }
   */
  setAngularVelocity(value: Vector3): void {
    this._pxActor.setAngularVelocity(value, true);
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

  getInertiaTensor(out: Vector3): Vector3 {
    const inertia = this._pxActor.getMassSpaceInertiaTensor();
    return out.set(inertia.x, inertia.y, inertia.z);
  }

  setMassAndUpdateInertia(mass: number): void {
    this._pxActor.setMassAndUpdateInertia(mass);
  }

  getMaxAngularVelocity(): number {
    return this._pxActor.getMaxAngularVelocity();
  }

  /**
   * {@inheritDoc IDynamicCollider.setMaxAngularVelocity }
   */
  setMaxAngularVelocity(value: number): void {
    this._pxActor.setMaxAngularVelocity(value);
  }

  getMaxDepenetrationVelocity(): number {
    return this._pxActor.getMaxDepenetrationVelocity();
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
    const physX = this._physXPhysics._physX;

    switch (value) {
      case CollisionDetectionMode.Continuous:
        this._pxActor.setRigidBodyFlag(this._physXPhysics._physX.PxRigidBodyFlag.eENABLE_CCD, true);
        break;
      case CollisionDetectionMode.ContinuousDynamic:
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD, false);
        this._pxActor.setRigidBodyFlag(this._physXPhysics._physX.PxRigidBodyFlag.eENABLE_CCD_FRICTION, true);
        break;
      case CollisionDetectionMode.ContinuousSpeculative:
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD, false);
        this._pxActor.setRigidBodyFlag(this._physXPhysics._physX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD, true);
        break;
      case CollisionDetectionMode.Discrete:
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD, false);
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD_FRICTION, false);
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD, false);
        break;
    }
  }

  /**
   * {@inheritDoc IDynamicCollider.setIsKinematic }
   */
  setIsKinematic(value: boolean): void {
    if (value) {
      this._pxActor.setRigidBodyFlag(this._physXPhysics._physX.PxRigidBodyFlag.eKINEMATIC, true);
    } else {
      this._pxActor.setRigidBodyFlag(this._physXPhysics._physX.PxRigidBodyFlag.eKINEMATIC, false);
    }
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
   * {@inheritDoc IDynamicCollider.move }
   */
  move(positionOrRotation: Vector3 | Quaternion, rotation?: Quaternion): void {
    if (rotation) {
      this._pxActor.setKinematicTarget(positionOrRotation, rotation);
      return;
    }

    const tempTranslation = PhysXDynamicCollider._tempTranslation;
    const tempRotation = PhysXDynamicCollider._tempRotation;
    this.getWorldTransform(tempTranslation, tempRotation);
    if (positionOrRotation instanceof Vector3) {
      this._pxActor.setKinematicTarget(positionOrRotation, tempRotation);
    } else {
      this._pxActor.setKinematicTarget(tempTranslation, positionOrRotation);
    }
  }

  /**
   * {@inheritDoc IDynamicCollider.sleep }
   */
  sleep(): void {
    return this._pxActor.putToSleep();
  }

  isSleeping(): boolean {
    return this._pxActor.isSleeping();
  }

  /**
   * {@inheritDoc IDynamicCollider.wakeUp }
   */
  wakeUp(): void {
    return this._pxActor.wakeUp();
  }
}
