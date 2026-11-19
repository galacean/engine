import { MathUtil, Quaternion, Vector3 } from "@galacean/engine";
import { IDynamicCollider } from "@galacean/engine-design";
import { HavokCollider } from "./HavokCollider";
import { HavokPhysics } from "./HavokPhysics";
import type { HavokPhysicsScene } from "./HavokPhysicsScene";
import {
  HKMassProperties,
  HKVector3,
  HP_ConstraintId,
  HP_ShapeId,
  HP_WorldId,
  normalizeQuatOrIdentity,
  SCRATCH_VEC3_A,
  SCRATCH_VEC3_B,
  writeQTransform,
  writeVec3,
  ZERO_VEC3
} from "./HavokTypes";
import type { HavokColliderShape } from "./shape/HavokColliderShape";
import { HavokPlaneColliderShape } from "./shape/HavokPlaneColliderShape";

const AXIS_X: HKVector3 = [1, 0, 0];
const AXIS_Y: HKVector3 = [0, 1, 0];

/**
 * Dynamic / Kinematic rigid body actor for Havok.
 */
export class HavokDynamicCollider extends HavokCollider implements IDynamicCollider {
  private static _tempSolidShapes: HavokColliderShape[] = [];
  private static _tempMassProps: HKMassProperties = [[0, 0, 0], 1, [1, 1, 1], [0, 0, 0, 1]];

  /** @internal */
  override readonly _isDynamic = true;
  /** @internal */
  _isKinematic = false;
  /** @internal */
  _maxAngularVelocityRad = 100;
  /** @internal */
  _hasPendingKinematicTarget = false;

  private _mass = 1.0;
  private _linearDamping = 0;
  private _angularDamping = 0.05;
  private _centerOfMass = new Vector3();
  private _inertiaTensor = new Vector3(1, 1, 1);
  private _inertiaOrientation = new Quaternion(0, 0, 0, 1);
  private _useGravity = true;
  private _constraintsFlags = 0;
  private _dofConstraint: HP_ConstraintId | null = null;

  private _kinematicTargetPos: Vector3 | null = null;
  private _kinematicTargetRot: Quaternion | null = null;

  private _accumForce: Vector3 | null = null;
  private _hasPendingForce = false;
  private _accumTorque: Vector3 | null = null;
  private _hasPendingTorque = false;
  private _pendingPosForces: number[] | null = null;
  private _pendingPosForceLen = 0;

  constructor(havokPhysics: HavokPhysics, position: Vector3, rotation: Quaternion) {
    super(havokPhysics, position, rotation);
    const hk = havokPhysics._hk;
    hk.HP_Body_SetMotionType(this._hkBody, hk.MotionType.DYNAMIC);
    // Havok defaults: linearDamping=0, gravityFactor=1, massProps=([0,0,0], 1, [1,1,1], [0,0,0,1]);
    // only angularDamping (Havok default 0.1 vs Galacean 0.05) needs an initial write.
    hk.HP_Body_SetAngularDamping(this._hkBody, 0.05);
  }

  /** @internal */
  _hasPendingForces(): boolean {
    return this._hasPendingForce || this._hasPendingTorque || this._pendingPosForceLen > 0;
  }

  setLinearDamping(value: number): void {
    const v = Math.max(0, value);
    if (this._linearDamping === v) return;
    this._linearDamping = v;
    this._havokPhysics._hk.HP_Body_SetLinearDamping(this._hkBody, v);
  }

  setAngularDamping(value: number): void {
    const v = Math.max(0, value);
    if (this._angularDamping === v) return;
    this._angularDamping = v;
    this._havokPhysics._hk.HP_Body_SetAngularDamping(this._hkBody, v);
  }

  getLinearVelocity(out: Vector3): Vector3 {
    const [, vel] = this._havokPhysics._hk.HP_Body_GetLinearVelocity(this._hkBody);
    return out.set(vel[0], vel[1], vel[2]);
  }

  setLinearVelocity(value: Vector3): void {
    const hk = this._havokPhysics._hk;
    hk.HP_Body_SetLinearVelocity(this._hkBody, writeVec3(value, SCRATCH_VEC3_A));
    if (!this._isKinematic && value.lengthSquared() > 0) {
      hk.HP_Body_SetActivationState(this._hkBody, hk.ActivationState.ACTIVE);
    }
  }

  getAngularVelocity(out: Vector3): Vector3 {
    const [, vel] = this._havokPhysics._hk.HP_Body_GetAngularVelocity(this._hkBody);
    return out.set(MathUtil.radianToDegree(vel[0]), MathUtil.radianToDegree(vel[1]), MathUtil.radianToDegree(vel[2]));
  }

  setAngularVelocity(value: Vector3): void {
    let rx = MathUtil.degreeToRadian(value.x);
    let ry = MathUtil.degreeToRadian(value.y);
    let rz = MathUtil.degreeToRadian(value.z);
    const magSq = rx * rx + ry * ry + rz * rz;
    if (this._scene) {
      const maxR = this._maxAngularVelocityRad;
      if (magSq > maxR * maxR && magSq > 0) {
        const s = maxR / Math.sqrt(magSq);
        rx *= s;
        ry *= s;
        rz *= s;
      }
    }
    const hk = this._havokPhysics._hk;
    const v = SCRATCH_VEC3_A;
    v[0] = rx;
    v[1] = ry;
    v[2] = rz;
    hk.HP_Body_SetAngularVelocity(this._hkBody, v);
    if (!this._isKinematic && magSq > 0) {
      hk.HP_Body_SetActivationState(this._hkBody, hk.ActivationState.ACTIVE);
    }
  }

  setMass(value: number): void {
    const m = Math.max(value, 1e-6);
    if (this._mass === m) return;
    this._mass = m;
    this._pushMassProperties();
  }

  setCenterOfMass(value: Vector3): void {
    const com = this._centerOfMass;
    if (com.x === value.x && com.y === value.y && com.z === value.z) return;
    com.copyFrom(value);
    this._pushMassProperties();
  }

  getCenterOfMass(out: Vector3): Vector3 {
    return out.copyFrom(this._centerOfMass);
  }

  setInertiaTensor(value: Vector3): void {
    const it = this._inertiaTensor;
    const io = this._inertiaOrientation;
    if (
      it.x === value.x &&
      it.y === value.y &&
      it.z === value.z &&
      io.x === 0 &&
      io.y === 0 &&
      io.z === 0 &&
      io.w === 1
    ) {
      return;
    }
    it.copyFrom(value);
    io.set(0, 0, 0, 1);
    this._pushMassProperties();
  }

  getInertiaTensor(out: Vector3): Vector3 {
    return out.copyFrom(this._inertiaTensor);
  }

  setMassAndUpdateInertia(mass: number): void {
    // Ensure container reflects latest shapes & local poses before building mass properties
    this._flushShapeIfDirty();
    this._mass = Math.max(mass, 1e-6);

    const shapes = this._shapes;
    const solidShapes = HavokDynamicCollider._tempSolidShapes;
    solidShapes.length = 0;
    let tempContainer: HP_ShapeId | null = null;
    const hk = this._havokPhysics._hk;

    try {
      for (let i = 0, n = shapes.length; i < n; i++) {
        const s = shapes[i];
        if (s._hkShape && !s._isTrigger && !(s instanceof HavokPlaneColliderShape)) {
          solidShapes.push(s);
        }
      }

      // PhysX contract: when no solid volumetric shapes remain (all removed or triggers), reset CoM to (0,0,0) and inertia to (1,1,1)
      if (solidShapes.length === 0) {
        this._centerOfMass.set(0, 0, 0);
        this._inertiaTensor.set(1, 1, 1);
        this._inertiaOrientation.set(0, 0, 0, 1);
        this._pushMassProperties();
        return;
      }

      let massShape: HP_ShapeId | null;
      if (solidShapes.length === shapes.length && this._containerShape) {
        massShape = this._containerShape;
      } else if (solidShapes.length === 1 && !solidShapes[0]._hasNonIdentityLocalPose()) {
        massShape = solidShapes[0]._hkShape;
      } else {
        tempContainer = this._createContainerShape(solidShapes);
        massShape = tempContainer;
      }

      if (massShape) {
        const [res, mp] = hk.HP_Shape_BuildMassProperties(massShape);
        if (res.value === hk.Result.RESULT_OK.value) {
          const com = mp[0];
          const unitInertia = mp[2];
          const orient = mp[3];
          if (unitInertia[0] > 1e-8 && unitInertia[1] > 1e-8 && unitInertia[2] > 1e-8) {
            this._centerOfMass.set(com[0], com[1], com[2]);
            this._inertiaTensor.set(
              unitInertia[0] * this._mass,
              unitInertia[1] * this._mass,
              unitInertia[2] * this._mass
            );
            this._inertiaOrientation.set(orient[0], orient[1], orient[2], orient[3]);
            this._pushMassProperties();
            return;
          }
        }
      }
      this._pushMassProperties();
    } finally {
      solidShapes.length = 0;
      if (tempContainer) {
        hk.HP_Shape_Release(tempContainer);
      }
    }
  }

  setMaxAngularVelocity(value: number): void {
    if (Number.isNaN(value)) return;
    const nextRad = Math.max(0, MathUtil.degreeToRadian(value));
    if (this._maxAngularVelocityRad === nextRad) return;
    const prevRad = this._maxAngularVelocityRad;
    this._maxAngularVelocityRad = nextRad;
    if (!this._isKinematic && this._scene) {
      this._scene._onDynamicMaxAngularVelocityChanged(this, prevRad, nextRad);
    }
  }

  setMaxDepenetrationVelocity(): void {
    // Not exposed in Havok WASM API.
  }

  setSleepThreshold(): void {
    // Not exposed in Havok WASM API.
  }

  setSolverIterations(): void {
    // Not exposed in Havok WASM API.
  }

  setUseGravity(value: boolean): void {
    if (this._useGravity === value) return;
    this._useGravity = value;
    this._havokPhysics._hk.HP_Body_SetGravityFactor(this._hkBody, value ? 1 : 0);
  }

  setMotionState(isKinematic: boolean): void {
    // Havok WASM does not expose per-body CCD mode toggling.
    if (this._isKinematic === isKinematic) return;
    const hk = this._havokPhysics._hk;
    if (isKinematic) {
      this._clearForces();
    }
    this._hasPendingKinematicTarget = false;
    this._isKinematic = isKinematic;
    if (this._scene) {
      this._scene._onDynamicMotionStateChanged(this, isKinematic);
    } else {
      hk.HP_Body_SetMotionType(this._hkBody, isKinematic ? hk.MotionType.KINEMATIC : hk.MotionType.DYNAMIC);
    }
    if (!isKinematic) {
      hk.HP_Body_SetGravityFactor(this._hkBody, this._useGravity ? 1 : 0);
      this._pushMassProperties();
    }
    this._syncDofConstraint();
  }

  setConstraints(flags: number): void {
    if (this._constraintsFlags === flags) return;
    this._constraintsFlags = flags;
    this._syncDofConstraint();
  }

  addForce(force: Vector3): void {
    if (this._isKinematic) return;
    const accum = (this._accumForce ||= new Vector3());
    accum.add(force);
    this._hasPendingForce = true;
    this._scene?._pendingForceColliders.add(this);
    this.wakeUp();
  }

  addForceAtPosition(force: Vector3, position: Vector3): void {
    if (this._isKinematic) return;
    const buf = (this._pendingPosForces ||= []);
    const offset = this._pendingPosForceLen;
    buf[offset] = force.x;
    buf[offset + 1] = force.y;
    buf[offset + 2] = force.z;
    buf[offset + 3] = position.x;
    buf[offset + 4] = position.y;
    buf[offset + 5] = position.z;
    this._pendingPosForceLen = offset + 6;
    this._scene?._pendingForceColliders.add(this);
    this.wakeUp();
  }

  addTorque(torque: Vector3): void {
    if (this._isKinematic) return;
    const accum = (this._accumTorque ||= new Vector3());
    accum.add(torque);
    this._hasPendingTorque = true;
    this._scene?._pendingForceColliders.add(this);
    this.wakeUp();
  }

  move(positionOrRotation: Vector3 | Quaternion, rotation?: Quaternion): void {
    const targetPos = (this._kinematicTargetPos ||= new Vector3());
    const targetRot = (this._kinematicTargetRot ||= new Quaternion());
    if (rotation) {
      targetPos.copyFrom(positionOrRotation as Vector3);
      normalizeQuatOrIdentity(rotation, targetRot);
      this._hasPendingKinematicTarget = true;
      if (this._isKinematic) {
        this._scene?._pendingKinematicMoves.add(this);
      }
      return;
    }

    if (positionOrRotation instanceof Vector3) {
      if (!this._hasPendingKinematicTarget) {
        this.getWorldTransform(HavokCollider._tempPos, targetRot);
      }
      targetPos.copyFrom(positionOrRotation);
    } else {
      if (!this._hasPendingKinematicTarget) {
        this.getWorldTransform(targetPos, targetRot);
      }
      // 1-arg zero quaternion preserves current orientation (`Quaternion.normalize` leaves `targetRot` untouched on zero quat).
      Quaternion.normalize(positionOrRotation, targetRot);
    }
    this._hasPendingKinematicTarget = true;
    if (this._isKinematic) {
      this._scene?._pendingKinematicMoves.add(this);
    }
  }

  sleep(): void {
    const hk = this._havokPhysics._hk;
    this._zeroVelocities();
    hk.HP_Body_SetActivationState(this._hkBody, hk.ActivationState.INACTIVE);
  }

  isSleeping(): boolean {
    const hk = this._havokPhysics._hk;
    const [, state] = hk.HP_Body_GetActivationState(this._hkBody);
    return state.value === hk.ActivationState.INACTIVE.value;
  }

  wakeUp(): void {
    const hk = this._havokPhysics._hk;
    hk.HP_Body_SetActivationState(this._hkBody, hk.ActivationState.ACTIVE);
  }

  /** @internal Re-allocate Havok motion properties after raising world angular speed limit. */
  _refreshDynamicMotionProperties(): void {
    if (this._isKinematic) return;
    const hk = this._havokPhysics._hk;
    const wasAsleep = hk.HP_Body_GetActivationState(this._hkBody)[1].value === hk.ActivationState.INACTIVE.value;
    const [, linVel] = hk.HP_Body_GetLinearVelocity(this._hkBody);
    const [, angVel] = hk.HP_Body_GetAngularVelocity(this._hkBody);
    hk.HP_Body_SetMotionType(this._hkBody, hk.MotionType.STATIC);
    hk.HP_Body_SetMotionType(this._hkBody, hk.MotionType.DYNAMIC);
    hk.HP_Body_SetLinearDamping(this._hkBody, this._linearDamping);
    hk.HP_Body_SetAngularDamping(this._hkBody, this._angularDamping);
    hk.HP_Body_SetGravityFactor(this._hkBody, this._useGravity ? 1 : 0);
    this._pushMassProperties();
    hk.HP_Body_SetLinearVelocity(this._hkBody, linVel);
    hk.HP_Body_SetAngularVelocity(this._hkBody, angVel);
    if (wasAsleep) {
      hk.HP_Body_SetActivationState(this._hkBody, hk.ActivationState.INACTIVE);
    }
  }

  /** @internal */
  _applyKinematicMove(dt: number, hkWorld: HP_WorldId, worldMaxAngVel: number, appliedWorldMaxAngVel: number): boolean {
    if (!this._isKinematic || !this._hasPendingKinematicTarget || dt <= 0) {
      return false;
    }
    this._hasPendingKinematicTarget = false;
    const hk = this._havokPhysics._hk;
    const targetRot = this._kinematicTargetRot!;
    const qt = HavokCollider._tempQTransform;
    writeQTransform(this._kinematicTargetPos!, targetRot, qt);

    // Bracket fast single-step kinematic rotations (> ~99 rad/s) whenever either the flushed world limit or
    // the pending limit (for newly added bodies) is < 1e6, so Havok derives uncapped velocity for this body
    // without un-clamping dynamic bodies.
    const effectiveLimit = worldMaxAngVel < appliedWorldMaxAngVel ? worldMaxAngVel : appliedWorldMaxAngVel;
    const halfLimitRad = effectiveLimit * dt * 0.495;
    let needsFastRotBracket = false;
    if (effectiveLimit < 1e6 && halfLimitRad < Math.PI * 0.5) {
      this.getWorldTransform(HavokCollider._tempPos, HavokCollider._tempRot);
      const curRot = HavokCollider._tempRot;
      const dot = Math.abs(
        curRot.x * targetRot.x + curRot.y * targetRot.y + curRot.z * targetRot.z + curRot.w * targetRot.w
      );
      needsFastRotBracket = dot < Math.cos(halfLimitRad);
    }

    // Applied after HP_World_SetIdealStepTime(dt) so Havok derives exact single-step velocity
    if (needsFastRotBracket) {
      if (worldMaxAngVel < 1e6) {
        hk.HP_World_SetSpeedLimit(hkWorld, 1e6, 1e6);
      }
      hk.HP_Body_SetMotionType(this._hkBody, hk.MotionType.STATIC);
      hk.HP_Body_SetMotionType(this._hkBody, hk.MotionType.KINEMATIC);
      hk.HP_Body_SetTargetQTransform(this._hkBody, qt);
      if (worldMaxAngVel < 1e6) {
        hk.HP_World_SetSpeedLimit(hkWorld, 1e6, worldMaxAngVel);
      }
    } else {
      hk.HP_Body_SetTargetQTransform(this._hkBody, qt);
    }
    return true;
  }

  /** @internal */
  _zeroVelocities(): void {
    const hk = this._havokPhysics._hk;
    hk.HP_Body_SetLinearVelocity(this._hkBody, ZERO_VEC3);
    hk.HP_Body_SetAngularVelocity(this._hkBody, ZERO_VEC3);
  }

  /** @internal */
  _clampAngularVelocity(): void {
    const maxR = this._maxAngularVelocityRad;
    if (maxR >= 1e5) return;
    const hk = this._havokPhysics._hk;
    const [, vel] = hk.HP_Body_GetAngularVelocity(this._hkBody);
    const magSq = vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2];
    if (magSq > maxR * maxR && magSq > 0) {
      const s = maxR / Math.sqrt(magSq);
      const out = SCRATCH_VEC3_A;
      out[0] = vel[0] * s;
      out[1] = vel[1] * s;
      out[2] = vel[2] * s;
      hk.HP_Body_SetAngularVelocity(this._hkBody, out);
    }
  }

  /** @internal */
  _flushForces(dt: number): void {
    if (dt <= 0) {
      this._clearForces();
      return;
    }
    const hk = this._havokPhysics._hk;
    const loc = SCRATCH_VEC3_A;
    const imp = SCRATCH_VEC3_B;

    if (this._hasPendingForce) {
      const pos = HavokCollider._tempPos;
      const rot = HavokCollider._tempRot;
      this.getWorldTransform(pos, rot);
      const com = this._centerOfMass;
      if (com.x !== 0 || com.y !== 0 || com.z !== 0) {
        const worldCom = HavokCollider._tempVec;
        Vector3.transformByQuat(com, rot, worldCom);
        loc[0] = worldCom.x + pos.x;
        loc[1] = worldCom.y + pos.y;
        loc[2] = worldCom.z + pos.z;
      } else {
        loc[0] = pos.x;
        loc[1] = pos.y;
        loc[2] = pos.z;
      }
      const accum = this._accumForce!;
      imp[0] = accum.x * dt;
      imp[1] = accum.y * dt;
      imp[2] = accum.z * dt;
      hk.HP_Body_ApplyImpulse(this._hkBody, loc, imp);
      accum.set(0, 0, 0);
      this._hasPendingForce = false;
    }

    if (this._pendingPosForceLen > 0) {
      const buf = this._pendingPosForces!;
      for (let i = 0, n = this._pendingPosForceLen; i < n; i += 6) {
        imp[0] = buf[i] * dt;
        imp[1] = buf[i + 1] * dt;
        imp[2] = buf[i + 2] * dt;
        loc[0] = buf[i + 3];
        loc[1] = buf[i + 4];
        loc[2] = buf[i + 5];
        hk.HP_Body_ApplyImpulse(this._hkBody, loc, imp);
      }
      this._pendingPosForceLen = 0;
    }

    if (this._hasPendingTorque) {
      const accum = this._accumTorque!;
      imp[0] = accum.x * dt;
      imp[1] = accum.y * dt;
      imp[2] = accum.z * dt;
      hk.HP_Body_ApplyAngularImpulse(this._hkBody, imp);
      accum.set(0, 0, 0);
      this._hasPendingTorque = false;
    }
  }

  override setWorldTransform(position: Vector3, rotation: Quaternion): void {
    if (this._hasPendingKinematicTarget) {
      this._hasPendingKinematicTarget = false;
      this._scene?._pendingKinematicMoves.delete(this);
    }
    super.setWorldTransform(position, rotation);
    if (this._constraintsFlags !== 0) {
      const q = HavokCollider._tempQTransform[1];
      HavokCollider._tempRot.set(q[0], q[1], q[2], q[3]);
      this._syncDofConstraint(position, HavokCollider._tempRot);
    }
  }

  override _onAddedToScene(scene: HavokPhysicsScene): void {
    super._onAddedToScene(scene);
    this._syncDofConstraint();
  }

  override _onRemovedFromScene(): void {
    this._hasPendingKinematicTarget = false;
    this._releaseDofConstraint();
    super._onRemovedFromScene();
  }

  override destroy(): void {
    this._releaseDofConstraint();
    super.destroy();
  }

  protected override _onAfterShapeUpdated(): void {
    if (!this._isKinematic) {
      this._pushMassProperties();
    }
  }

  private _clearForces(): void {
    if (this._accumForce) {
      this._accumForce.set(0, 0, 0);
    }
    this._hasPendingForce = false;
    if (this._accumTorque) {
      this._accumTorque.set(0, 0, 0);
    }
    this._hasPendingTorque = false;
    this._pendingPosForceLen = 0;
  }

  private _pushMassProperties(): void {
    const mass = Math.max(this._mass, 1e-6);
    const invMass = 1.0 / mass;
    // Havok expects unit-mass inertia (I / mass).
    const mp = HavokDynamicCollider._tempMassProps;
    const com = mp[0];
    com[0] = this._centerOfMass.x;
    com[1] = this._centerOfMass.y;
    com[2] = this._centerOfMass.z;
    mp[1] = mass;
    const inertia = mp[2];
    inertia[0] = this._inertiaTensor.x * invMass;
    inertia[1] = this._inertiaTensor.y * invMass;
    inertia[2] = this._inertiaTensor.z * invMass;
    const orient = mp[3];
    orient[0] = this._inertiaOrientation.x;
    orient[1] = this._inertiaOrientation.y;
    orient[2] = this._inertiaOrientation.z;
    orient[3] = this._inertiaOrientation.w;
    this._havokPhysics._hk.HP_Body_SetMassProperties(this._hkBody, mp);
  }

  private _syncDofConstraint(knownPos?: Vector3, knownRot?: Quaternion): void {
    const flags = this._constraintsFlags;
    if (flags === 0 || this._isKinematic || !this._scene) {
      this._releaseDofConstraint();
      return;
    }

    const hk = this._havokPhysics._hk;
    if (!this._dofConstraint) {
      this._dofConstraint = hk.HP_Constraint_Create()[1];
      hk.HP_Constraint_SetParentBody(this._dofConstraint, this._scene._worldAnchorBody);
      hk.HP_Constraint_SetChildBody(this._dofConstraint, this._hkBody);
      hk.HP_Constraint_SetCollisionsEnabled(this._dofConstraint, 0);
    }

    let pos: Vector3;
    let rot: Quaternion;
    if (knownPos && knownRot) {
      pos = knownPos;
      rot = knownRot;
    } else {
      pos = HavokCollider._tempPos;
      rot = HavokCollider._tempRot;
      this.getWorldTransform(pos, rot);
    }

    hk.HP_Constraint_SetAnchorInParent(this._dofConstraint, writeVec3(pos, SCRATCH_VEC3_A), AXIS_X, AXIS_Y);

    const invRot = HavokCollider._tempInvRot;
    Quaternion.invert(rot, invRot);
    const axis = HavokCollider._tempVec;
    axis.set(1, 0, 0);
    Vector3.transformByQuat(axis, invRot, axis);
    writeVec3(axis, SCRATCH_VEC3_A);
    axis.set(0, 1, 0);
    Vector3.transformByQuat(axis, invRot, axis);
    writeVec3(axis, SCRATCH_VEC3_B);
    hk.HP_Constraint_SetAnchorInChild(this._dofConstraint, ZERO_VEC3, SCRATCH_VEC3_A, SCRATCH_VEC3_B);

    const { FREE, LOCKED } = hk.ConstraintAxisLimitMode;
    const cAxis = hk.ConstraintAxis;
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, cAxis.LINEAR_X, flags & 1 ? LOCKED : FREE);
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, cAxis.LINEAR_Y, flags & 2 ? LOCKED : FREE);
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, cAxis.LINEAR_Z, flags & 4 ? LOCKED : FREE);
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, cAxis.ANGULAR_X, flags & 8 ? LOCKED : FREE);
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, cAxis.ANGULAR_Y, flags & 16 ? LOCKED : FREE);
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, cAxis.ANGULAR_Z, flags & 32 ? LOCKED : FREE);
    hk.HP_Constraint_SetEnabled(this._dofConstraint, 1);
  }

  private _releaseDofConstraint(): void {
    if (this._dofConstraint) {
      const hk = this._havokPhysics._hk;
      if (hk) {
        hk.HP_Constraint_SetEnabled(this._dofConstraint, 0);
        hk.HP_Constraint_Release(this._dofConstraint);
      }
      this._dofConstraint = null;
    }
  }
}
