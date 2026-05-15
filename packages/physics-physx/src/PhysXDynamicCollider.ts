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

  /**
   * Whether actor is currently kinematic.
   * PhysX 拒绝在 kinematic actor 上启用 CCD（会打印警告并忽略），
   * 所以 setCollisionDetectionMode 在 kinematic 状态下只缓存目标值，
   * 等切回 dynamic 时再真正写到 PhysX。
   */
  private _isKinematic: boolean = false;

  /**
   * Cached collision detection mode. Always reflects user's intent.
   * 实际 PhysX CCD flag 可能跟这个不一致（kinematic 时强制 Discrete）。
   */
  private _collisionDetectionMode: number = CollisionDetectionMode.Discrete;

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
   *
   * PhysX 在 kinematic actor 上调用 setRigidBodyFlag(eENABLE_CCD, true) 会触发警告:
   *   "kinematic bodies with CCD enabled are not supported! CCD will be ignored"
   * 虽然 PhysX 会忽略这次调用而非真的拒绝（切回 dynamic 时 flag 不会自动恢复），
   * 但每次 setIsKinematic 切换都会让这个 warning 重复打印，污染日志，
   * 同时让 actor 在 dynamic 状态下 CCD flag 状态不确定。
   *
   * 解决: 只在 dynamic 状态时立即 apply CCD flags。kinematic 时仅缓存到
   * `_collisionDetectionMode`，等切回 dynamic 时由 setIsKinematic 重新 apply。
   */
  setCollisionDetectionMode(value: number): void {
    this._collisionDetectionMode = value;
    if (!this._isKinematic) {
      this._applyCollisionDetectionFlags(value);
    }
  }

  /**
   * {@inheritDoc IDynamicCollider.setUseGravity }
   */
  setUseGravity(value: boolean): void {
    this._pxActor.setActorFlag(this._physXPhysics._physX.PxActorFlag.eDISABLE_GRAVITY, !value);
  }

  /**
   * {@inheritDoc IDynamicCollider.setIsKinematic }
   *
   * 切换 kinematic 状态时同步处理 CCD flag：
   *   - 切到 kinematic 前先关 CCD（避免 PhysX 警告 + 让状态显式）
   *   - 切回 dynamic 后恢复用户期望的 CCD mode（来自 `_collisionDetectionMode` 缓存）
   */
  setIsKinematic(value: boolean): void {
    if (this._isKinematic === value) return;
    const physX = this._physXPhysics._physX;
    if (value) {
      this._applyCollisionDetectionFlags(CollisionDetectionMode.Discrete);
      this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eKINEMATIC, true);
    } else {
      this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eKINEMATIC, false);
      this._applyCollisionDetectionFlags(this._collisionDetectionMode);
    }
    this._isKinematic = value;
  }

  private _applyCollisionDetectionFlags(value: number): void {
    const physX = this._physXPhysics._physX;
    switch (value) {
      case CollisionDetectionMode.Continuous:
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD, true);
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD_FRICTION, false);
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD, false);
        break;
      case CollisionDetectionMode.ContinuousDynamic:
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD, true);
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD_FRICTION, true);
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD, false);
        break;
      case CollisionDetectionMode.ContinuousSpeculative:
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD, false);
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD_FRICTION, false);
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD, true);
        break;
      case CollisionDetectionMode.Discrete:
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD, false);
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_CCD_FRICTION, false);
        this._pxActor.setRigidBodyFlag(physX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD, false);
        break;
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
   *
   * PhysX 在 kinematic actor 上调 addForce 是 no-op（doc: "kinematic bodies don't
   * respond to forces"）。提前 return 避免无意义的 wasm boundary cross。
   *
   * Sleeping actor 不需要显式 wakeUp — wasm binding 调用 `addForce(force, eFORCE,
   * autowake=true)`，PhysX 自动唤醒（已通过 `applyForce on sleeping actor` 测试验证）。
   */
  addForce(force: Vector3) {
    if (this._isKinematic) return;
    this._pxActor.addForce({ x: force.x, y: force.y, z: force.z });
  }

  /**
   * {@inheritDoc IDynamicCollider.addTorque }
   *
   * 同 addForce — kinematic 提前 return，sleeping 由 PhysX autowake 自动处理。
   */
  addTorque(torque: Vector3) {
    if (this._isKinematic) return;
    this._pxActor.addTorque({ x: torque.x, y: torque.y, z: torque.z });
  }

  /**
   * {@inheritDoc IDynamicCollider.move }
   *
   * PhysX 要求 setKinematicTarget 的 rotation 是 normalized quaternion，否则会触发
   * 内部 assertion / 警告，并把 actor 转到错误的姿态。所以在写入 wasm 边界前统一 normalize。
   */
  move(positionOrRotation: Vector3 | Quaternion, rotation?: Quaternion): void {
    const tempTranslation = PhysXDynamicCollider._tempTranslation;
    const tempRotation = PhysXDynamicCollider._tempRotation;

    if (rotation) {
      tempRotation.copyFrom(rotation).normalize();
      this._pxActor.setKinematicTarget(positionOrRotation, tempRotation);
      return;
    }

    if (positionOrRotation instanceof Vector3) {
      this.getWorldTransform(tempTranslation, tempRotation);
      // current rotation read from PhysX is already normalized; no extra work needed
      this._pxActor.setKinematicTarget(positionOrRotation, tempRotation);
    } else {
      this.getWorldTransform(tempTranslation, tempRotation);
      tempRotation.copyFrom(positionOrRotation).normalize();
      this._pxActor.setKinematicTarget(tempTranslation, tempRotation);
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
