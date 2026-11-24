import { ForceMode, IDynamicActor, RigidbodyConstraints } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXActor } from "./PhysXActor";
import { PhysXPhysics } from "./PhysXPhysics";

/**
 * Dynamic PhysX rigid actor controlled by forces or kinematic motion.
 */
export class PhysXDynamicActor extends PhysXActor implements IDynamicActor {
  private static _tempRotation = new Quaternion();

  private _isKinematic = false;

  constructor(physXPhysics: PhysXPhysics, position: Vector3, rotation: Quaternion) {
    super(physXPhysics);
    const transform = this._transform(position, rotation);
    this._pxActor = physXPhysics._pxPhysics.createRigidDynamic(transform);
  }

  /**
   * {@inheritDoc IDynamicActor.setLinearDamping }
   */
  setLinearDamping(value: number): void {
    this._pxActor.setLinearDamping(value);
  }

  /**
   * {@inheritDoc IDynamicActor.setAngularDamping }
   */
  setAngularDamping(value: number): void {
    this._pxActor.setAngularDamping(value);
  }

  /**
   * {@inheritDoc IDynamicActor.getLinearVelocity }
   */
  getLinearVelocity(out: Vector3): Vector3 {
    const velocity = this._pxActor.getLinearVelocity();
    return out.set(velocity.x, velocity.y, velocity.z);
  }

  /**
   * {@inheritDoc IDynamicActor.setLinearVelocity }
   */
  setLinearVelocity(value: Vector3): void {
    this._pxActor.setLinearVelocity(value, true);
  }

  /**
   * {@inheritDoc IDynamicActor.getAngularVelocity }
   */
  getAngularVelocity(out: Vector3): Vector3 {
    const velocity = this._pxActor.getAngularVelocity();
    return out.set(velocity.x, velocity.y, velocity.z);
  }

  /**
   * {@inheritDoc IDynamicActor.setAngularVelocity }
   */
  setAngularVelocity(value: Vector3): void {
    this._pxActor.setAngularVelocity(value, true);
  }

  /** {@inheritDoc IDynamicActor.setMassProperties } */
  setMassProperties(
    mass?: number,
    centerOfMass?: Vector3,
    inertiaTensor?: Vector3,
    inertiaTensorRotation?: Quaternion
  ): void {
    const actor = this._pxActor;
    mass !== undefined && actor.setMass(mass);
    centerOfMass && actor.setCMassLocalPose(centerOfMass);
    inertiaTensor && actor.setMassSpaceInertiaTensor(inertiaTensor);
    inertiaTensorRotation && actor.setInertiaTensorRotation(inertiaTensorRotation);
  }

  /** {@inheritDoc IDynamicActor.updateMassAndInertia } */
  updateMassAndInertia(
    mass: number,
    centerOfMass: Vector3 | null,
    inertiaTensor: Vector3 | null,
    inertiaTensorRotation: Quaternion | null
  ): void {
    const actor = this._pxActor;
    actor.setMassAndUpdateInertia(mass);
    centerOfMass && actor.setCMassLocalPose(centerOfMass);
    inertiaTensor && actor.setMassSpaceInertiaTensor(inertiaTensor);
    inertiaTensorRotation && actor.setInertiaTensorRotation(inertiaTensorRotation);
  }

  /**
   * {@inheritDoc IDynamicActor.getCenterOfMass }
   */
  getCenterOfMass(out: Vector3): Vector3 {
    const { translation } = this._pxActor.getCMassLocalPose();
    return out.set(translation.x, translation.y, translation.z);
  }

  /**
   * {@inheritDoc IDynamicActor.getInertiaTensor }
   */
  getInertiaTensor(out: Vector3): Vector3 {
    const inertia = this._pxActor.getMassSpaceInertiaTensor();
    return out.set(inertia.x, inertia.y, inertia.z);
  }

  /** {@inheritDoc IDynamicActor.getInertiaTensorRotation} */
  getInertiaTensorRotation(out: Quaternion): Quaternion {
    return out.copyFrom(this._pxActor.getCMassLocalPose().rotation);
  }

  /** {@inheritDoc IDynamicActor.setDensity } */
  setDensity(density: number, automaticCenterOfMass: boolean, automaticInertiaTensor: boolean): number {
    return this._pxActor.setDensity(density, automaticCenterOfMass, automaticInertiaTensor);
  }

  /** {@inheritDoc IDynamicActor.setMaxLinearVelocity} */
  setMaxLinearVelocity(value: number): void {
    this._pxActor.setMaxLinearVelocity(value);
  }

  /** {@inheritDoc IDynamicActor.setMaxAngularVelocity} */
  setMaxAngularVelocity(value: number): void {
    this._pxActor.setMaxAngularVelocity(value);
  }

  /**
   * {@inheritDoc IDynamicActor.setMaxDepenetrationVelocity }
   */
  setMaxDepenetrationVelocity(value: number): void {
    this._pxActor.setMaxDepenetrationVelocity(value);
  }

  /**
   * {@inheritDoc IDynamicActor.setSleepThreshold }
   * @default 1e-5f * PxTolerancesScale::speed * PxTolerancesScale::speed
   */
  setSleepThreshold(value: number): void {
    this._pxActor.setSleepThreshold(value);
  }

  /** {@inheritDoc IDynamicActor.setSleepEventId} */
  setSleepEventId(id: number): void {
    this._pxActor.setSleepEventId(id);
  }

  /**
   * {@inheritDoc IDynamicActor.setSolverIterations }
   */
  setSolverIterations(positionIterations: number, velocityIterations: number): void {
    this._pxActor.setSolverIterationCounts(positionIterations, velocityIterations);
  }

  /**
   * {@inheritDoc IDynamicActor.setUseGravity }
   */
  setUseGravity(value: boolean): void {
    this._pxActor.setActorFlag(this._physXPhysics._physX.PxActorFlag.eDISABLE_GRAVITY, !value);
  }

  /**
   * {@inheritDoc IDynamicActor.setMotionState }
   */
  setMotionState(isKinematic: boolean, useCCD: boolean): void {
    this._isKinematic = isKinematic;
    const { eENABLE_CCD, eENABLE_SPECULATIVE_CCD, eKINEMATIC, eUSE_KINEMATIC_TARGET_FOR_SCENE_QUERIES } =
      this._physXPhysics._physX.PxRigidBodyFlag;
    const actor = this._pxActor;
    // PhysX 4.1 rejects swept CCD combined with either kinematic motion or speculative CCD.
    actor.setRigidBodyFlag(isKinematic ? eENABLE_CCD : eENABLE_SPECULATIVE_CCD, false);
    actor.setRigidBodyFlag(eKINEMATIC, isKinematic);
    actor.setRigidBodyFlag(eUSE_KINEMATIC_TARGET_FOR_SCENE_QUERIES, isKinematic);
    actor.setRigidBodyFlag(isKinematic ? eENABLE_SPECULATIVE_CCD : eENABLE_CCD, useCCD);
  }

  /**
   * {@inheritDoc IDynamicActor.setConstraints }
   */
  setConstraints(flags: RigidbodyConstraints): void {
    this._pxActor.setRigidDynamicLockFlags(flags);
  }

  /**
   * {@inheritDoc IDynamicActor.addForce }
   */
  addForce(force: Vector3, mode: ForceMode): void {
    this._pxActor.addForce(force, this._physXPhysics._physX.PxForceMode.values[mode]);
  }

  /**
   * {@inheritDoc IDynamicActor.addForceAtPosition }
   */
  addForceAtPosition(force: Vector3, position: Vector3, impulse: boolean): void {
    if (impulse) {
      this._pxActor.addImpulseAtPos(force, position);
    } else {
      this._pxActor.addForceAtPos(force, position);
    }
  }

  /**
   * {@inheritDoc IDynamicActor.addTorque }
   */
  addTorque(torque: Vector3, mode: ForceMode): void {
    this._pxActor.addTorque(torque, this._physXPhysics._physX.PxForceMode.values[mode]);
  }

  /**
   * {@inheritDoc IDynamicActor.setWorldTransform }
   */
  override setWorldTransform(position: Vector3, rotation: Quaternion): void {
    const transform = this._transform(position, rotation);
    this._pxActor.setGlobalPose(transform, true);
    // Replace the pending target so the next simulation step preserves the new pose.
    if (this._isKinematic && this._pxActor.getKinematicTarget()) {
      this._pxActor.setKinematicTarget(transform.translation, transform.rotation);
    }
  }

  /**
   * {@inheritDoc IDynamicActor.move }
   */
  move(position: Vector3 | null, rotation: Quaternion | null): void {
    const actor = this._pxActor;
    const tempRotation = PhysXDynamicActor._tempRotation;
    if (position && rotation) {
      tempRotation.set(0, 0, 0, 1);
      Quaternion.normalize(rotation, tempRotation);
      actor.setKinematicTarget(position, tempRotation);
    } else if (position) {
      const pose = actor.getKinematicTarget() ?? actor.getGlobalPose();
      actor.setKinematicTarget(position, pose.rotation);
    } else if (rotation) {
      const pose = actor.getKinematicTarget() ?? actor.getGlobalPose();
      const priorRotation = pose.rotation;
      tempRotation.set(priorRotation.x, priorRotation.y, priorRotation.z, priorRotation.w);
      Quaternion.normalize(rotation, tempRotation);
      actor.setKinematicTarget(pose.translation, tempRotation);
    }
  }

  /**
   * {@inheritDoc IDynamicActor.sleep }
   */
  sleep(): void {
    return this._pxActor.putToSleep();
  }

  /**
   * {@inheritDoc IDynamicActor.isSleeping }
   */
  isSleeping(): boolean {
    return this._pxActor.isSleeping();
  }

  /**
   * {@inheritDoc IDynamicActor.wakeUp }
   */
  wakeUp(): void {
    return this._pxActor.wakeUp();
  }
}
