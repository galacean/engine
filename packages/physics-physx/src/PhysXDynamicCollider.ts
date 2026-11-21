import { IDynamicCollider } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXCollider } from "./PhysXCollider";
import { PhysXPhysics } from "./PhysXPhysics";

/**
 * A dynamic collider can act with self-defined movement or physical force
 */
export class PhysXDynamicCollider extends PhysXCollider implements IDynamicCollider {
  private static _tempRotation = new Quaternion();

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
    return out.set(velocity.x, velocity.y, velocity.z);
  }

  /**
   * {@inheritDoc IDynamicCollider.setAngularVelocity }
   */
  setAngularVelocity(value: Vector3): void {
    this._pxActor.setAngularVelocity(value, true);
  }

  /** {@inheritDoc IDynamicCollider.getPointVelocity} */
  getPointVelocity(point: Vector3, out: Vector3): Vector3 {
    this._pxActor.getVelocityAtPos(point, out);
    return out;
  }

  /** {@inheritDoc IDynamicCollider.getRelativePointVelocity} */
  getRelativePointVelocity(point: Vector3, out: Vector3): Vector3 {
    this._pxActor.getLocalVelocityAtLocalPos(point, out);
    return out;
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

  /** {@inheritDoc IDynamicCollider.getInertiaTensorRotation} */
  getInertiaTensorRotation(out: Quaternion): void {
    out.copyFrom(this._pxActor.getCMassLocalPose().rotation);
  }

  /** {@inheritDoc IDynamicCollider.setInertiaTensorRotation} */
  setInertiaTensorRotation(rotation: Quaternion): void {
    this._pxActor.setInertiaTensorRotation(rotation);
  }

  /**
   * {@inheritDoc IDynamicCollider.setMassAndUpdateInertia }
   */
  setMassAndUpdateInertia(mass: number): void {
    this._pxActor.setMassAndUpdateInertia(mass);
  }

  /** {@inheritDoc IDynamicCollider.setDensity } */
  setDensity(density: number, automaticCenterOfMass: boolean, automaticInertiaTensor: boolean): number {
    return this._pxActor.setDensity(density, automaticCenterOfMass, automaticInertiaTensor);
  }

  /** {@inheritDoc IDynamicCollider.setMaxLinearVelocity} */
  setMaxLinearVelocity(value: number): void {
    this._pxActor.setMaxLinearVelocity(value);
  }

  /** {@inheritDoc IDynamicCollider.setMaxAngularVelocity} */
  setMaxAngularVelocity(value: number): void {
    this._pxActor.setMaxAngularVelocity(value);
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

  /** {@inheritDoc IDynamicCollider.setSleepEventId} */
  setSleepEventId(id: number): void {
    this._pxActor.setSleepEventId(id);
  }

  /**
   * {@inheritDoc IDynamicCollider.setSolverIterations }
   */
  setSolverIterations(positionIterations: number, velocityIterations: number): void {
    this._pxActor.setSolverIterationCounts(positionIterations, velocityIterations);
  }

  /**
   * {@inheritDoc IDynamicCollider.setUseGravity }
   */
  setUseGravity(value: boolean): void {
    this._pxActor.setActorFlag(this._physXPhysics._physX.PxActorFlag.eDISABLE_GRAVITY, !value);
  }

  /** {@inheritDoc IDynamicCollider.setSimulationEnabled} */
  setSimulationEnabled(value: boolean): void {
    if (!this._pxActor.setSimulationEnabled(value)) return;
    const scene = this._scene;
    if (scene) {
      for (const shape of this._shapes) scene._refreshTriggerPairsForShape(shape._id);
    }
  }

  /**
   * {@inheritDoc IDynamicCollider.setMotionState }
   */
  setMotionState(isKinematic: boolean, useCCD: boolean): void {
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
   * {@inheritDoc IDynamicCollider.setConstraints }
   */
  setConstraints(flags: number): void {
    this._pxActor.setRigidDynamicLockFlags(flags);
  }

  /**
   * {@inheritDoc IDynamicCollider.addForce }
   */
  addForce(force: Vector3, mode: number): void {
    this._pxActor.addForce(force, this._physXPhysics._physX.PxForceMode.values[mode]);
  }

  /**
   * {@inheritDoc IDynamicCollider.addForceAtPosition }
   */
  addForceAtPosition(force: Vector3, position: Vector3) {
    this._pxActor.addForceAtPos(force, position);
  }

  /**
   * {@inheritDoc IDynamicCollider.addImpulseAtPosition }
   */
  addImpulseAtPosition(impulse: Vector3, position: Vector3): void {
    this._pxActor.addImpulseAtPos(impulse, position);
  }

  /**
   * {@inheritDoc IDynamicCollider.addTorque }
   */
  addTorque(torque: Vector3, mode: number): void {
    this._pxActor.addTorque(torque, this._physXPhysics._physX.PxForceMode.values[mode]);
  }

  /** {@inheritDoc IDynamicCollider.addRelativeForce } */
  addRelativeForce(force: Vector3, mode: number): void {
    this._pxActor.addRelativeForce(force, this._physXPhysics._physX.PxForceMode.values[mode]);
  }

  /** {@inheritDoc IDynamicCollider.addRelativeTorque } */
  addRelativeTorque(torque: Vector3, mode: number): void {
    this._pxActor.addRelativeTorque(torque, this._physXPhysics._physX.PxForceMode.values[mode]);
  }

  /** {@inheritDoc IDynamicCollider.addForceAtLocalPosition } */
  addForceAtLocalPosition(force: Vector3, position: Vector3, impulse: boolean): void {
    if (impulse) {
      this._pxActor.addImpulseAtLocalPos(force, position);
    } else {
      this._pxActor.addForceAtLocalPos(force, position);
    }
  }

  /** {@inheritDoc IDynamicCollider.addRelativeForceAtLocalPosition } */
  addRelativeForceAtLocalPosition(force: Vector3, position: Vector3, impulse: boolean): void {
    if (impulse) {
      this._pxActor.addLocalImpulseAtLocalPos(force, position);
    } else {
      this._pxActor.addLocalForceAtLocalPos(force, position);
    }
  }

  /** {@inheritDoc IDynamicCollider.addExplosionForce } */
  addExplosionForce(strength: number, origin: Vector3, radius: number, upwardOffset: number, mode: number): boolean {
    return this._pxActor.addExplosionForce(
      strength,
      origin,
      radius,
      upwardOffset,
      this._physXPhysics._physX.PxForceMode.values[mode]
    );
  }

  /**
   * {@inheritDoc IDynamicCollider.setWorldTransform }
   */
  override setWorldTransform(position: Vector3, rotation: Quaternion): void {
    const transform = this._transform(position, rotation);
    this._pxActor.setGlobalPose(transform, true);
    // Replace the pending target so the next simulation step preserves the new pose.
    if (this._pxActor.getKinematicTarget()) {
      this._pxActor.setKinematicTarget(transform.translation, transform.rotation);
    }
  }

  /**
   * {@inheritDoc IDynamicCollider.move }
   */
  move(positionOrRotation: Vector3 | Quaternion, rotation?: Quaternion): void {
    const actor = this._pxActor;
    const tempRotation = PhysXDynamicCollider._tempRotation;
    if (rotation) {
      tempRotation.set(0, 0, 0, 1);
      Quaternion.normalize(rotation, tempRotation);
      actor.setKinematicTarget(positionOrRotation, tempRotation);
      return;
    }

    const pose = actor.getKinematicTarget() ?? actor.getGlobalPose();
    if (positionOrRotation instanceof Vector3) {
      actor.setKinematicTarget(positionOrRotation, pose.rotation);
    } else {
      const priorRotation = pose.rotation;
      tempRotation.set(priorRotation.x, priorRotation.y, priorRotation.z, priorRotation.w);
      Quaternion.normalize(positionOrRotation, tempRotation);
      actor.setKinematicTarget(pose.translation, tempRotation);
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
}
