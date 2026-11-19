import { MathUtil, Quaternion, Vector3 } from "@galacean/engine";
import { IDynamicCollider } from "@galacean/engine-design";
import { HavokCollider } from "./HavokCollider";
import { HavokPhysics } from "./HavokPhysics";
import type { HavokPhysicsScene } from "./HavokPhysicsScene";
import { HKMassProperties, HP_ConstraintId, HP_ShapeId } from "./HavokTypes";
import type { HavokColliderShape } from "./shape/HavokColliderShape";
import { HavokPlaneColliderShape } from "./shape/HavokPlaneColliderShape";

interface PendingPosForce {
  fx: number;
  fy: number;
  fz: number;
  px: number;
  py: number;
  pz: number;
}

/**
 * Dynamic / Kinematic rigid body actor for Havok.
 */
export class HavokDynamicCollider extends HavokCollider implements IDynamicCollider {
  private static _dynTempPos = new Vector3();
  private static _dynTempRot = new Quaternion();
  private static _dynTempVec = new Vector3();
  private static _dynTempInvRot = new Quaternion();
  private static _dynTempAxisX = new Vector3();
  private static _dynTempAxisY = new Vector3();

  private _mass = 1.0;
  private _centerOfMass = new Vector3();
  private _inertiaTensor = new Vector3(1, 1, 1);
  private _inertiaOrientation = new Quaternion(0, 0, 0, 1);
  private _isKinematic = false;
  private _useGravity = true;
  private _maxAngularVelocityRad = 100;
  private _constraintsFlags = 0;
  private _dofConstraint: HP_ConstraintId | null = null;

  private _hasPendingKinematicTarget = false;
  private _kinematicTargetPos = new Vector3();
  private _kinematicTargetRot = new Quaternion(0, 0, 0, 1);
  private _needsKinematicVelocityZero = false;
  private _movedKinematicThisStep = false;

  private _accumForce = new Vector3();
  private _hasPendingForce = false;
  private _accumTorque = new Vector3();
  private _hasPendingTorque = false;
  private _pendingPosForces: PendingPosForce[] = [];
  private _pendingPosForceCount = 0;

  constructor(havokPhysics: HavokPhysics, position: Vector3, rotation: Quaternion) {
    super(havokPhysics, position, rotation);
    const hk = havokPhysics._hk;
    hk.HP_Body_SetMotionType(this._hkBody, hk.MotionType.DYNAMIC);
    hk.HP_Body_SetLinearDamping(this._hkBody, 0);
    hk.HP_Body_SetAngularDamping(this._hkBody, 0.05);
    hk.HP_Body_SetGravityFactor(this._hkBody, 1);
    this._pushMassProperties();
  }

  /** @internal */
  _isKinematicBody(): boolean {
    return this._isKinematic;
  }

  /** @internal */
  _didMoveKinematicThisStep(): boolean {
    return this._movedKinematicThisStep;
  }

  setLinearDamping(value: number): void {
    this._havokPhysics._hk.HP_Body_SetLinearDamping(this._hkBody, Math.max(0, value));
  }

  setAngularDamping(value: number): void {
    this._havokPhysics._hk.HP_Body_SetAngularDamping(this._hkBody, Math.max(0, value));
  }

  getLinearVelocity(out: Vector3): Vector3 {
    const [, vel] = this._havokPhysics._hk.HP_Body_GetLinearVelocity(this._hkBody);
    return out.set(vel[0], vel[1], vel[2]);
  }

  setLinearVelocity(value: Vector3): void {
    const hk = this._havokPhysics._hk;
    hk.HP_Body_SetLinearVelocity(this._hkBody, [value.x, value.y, value.z]);
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
    const maxR = this._maxAngularVelocityRad;
    if (magSq > maxR * maxR && magSq > 0) {
      const s = maxR / Math.sqrt(magSq);
      rx *= s;
      ry *= s;
      rz *= s;
    }
    const hk = this._havokPhysics._hk;
    hk.HP_Body_SetAngularVelocity(this._hkBody, [rx, ry, rz]);
    if (!this._isKinematic && magSq > 0) {
      hk.HP_Body_SetActivationState(this._hkBody, hk.ActivationState.ACTIVE);
    }
  }

  setMass(value: number): void {
    this._mass = Math.max(value, 1e-6);
    this._pushMassProperties();
  }

  setCenterOfMass(value: Vector3): void {
    this._centerOfMass.copyFrom(value);
    this._pushMassProperties();
  }

  getCenterOfMass(out: Vector3): Vector3 {
    return out.copyFrom(this._centerOfMass);
  }

  setInertiaTensor(value: Vector3): void {
    this._inertiaTensor.copyFrom(value);
    this._inertiaOrientation.set(0, 0, 0, 1);
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
    const solidShapes: HavokColliderShape[] = [];
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

    const hk = this._havokPhysics._hk;
    let massShape: HP_ShapeId | null;
    let tempContainer: HP_ShapeId | null = null;
    if (solidShapes.length === shapes.length && this._containerShape) {
      massShape = this._containerShape;
    } else if (solidShapes.length === 1 && !solidShapes[0]._hasNonIdentityLocalPose()) {
      massShape = solidShapes[0]._hkShape;
    } else {
      tempContainer = hk.HP_Shape_CreateContainer()[1];
      for (let i = 0, n = solidShapes.length; i < n; i++) {
        const s = solidShapes[i];
        const p = s._localPosition;
        const q = s._localRotation;
        hk.HP_Shape_AddChild(tempContainer, s._hkShape!, [
          [p.x, p.y, p.z],
          [q.x, q.y, q.z, q.w],
          [1, 1, 1]
        ]);
      }
      massShape = tempContainer;
    }

    try {
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
    } finally {
      if (tempContainer) {
        hk.HP_Shape_Release(tempContainer);
      }
    }
    this._pushMassProperties();
  }

  setMaxAngularVelocity(value: number): void {
    this._maxAngularVelocityRad = Math.max(0, MathUtil.degreeToRadian(value));
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
    this._useGravity = value;
    this._havokPhysics._hk.HP_Body_SetGravityFactor(this._hkBody, value ? 1 : 0);
  }

  setMotionState(isKinematic: boolean): void {
    // Havok WASM does not expose per-body CCD mode toggling.
    const hk = this._havokPhysics._hk;
    if (this._isKinematic && !isKinematic && this._needsKinematicVelocityZero) {
      this._needsKinematicVelocityZero = false;
      hk.HP_Body_SetLinearVelocity(this._hkBody, [0, 0, 0]);
      hk.HP_Body_SetAngularVelocity(this._hkBody, [0, 0, 0]);
    }
    this._hasPendingKinematicTarget = false;
    this._movedKinematicThisStep = false;
    this._isKinematic = isKinematic;
    hk.HP_Body_SetMotionType(this._hkBody, isKinematic ? hk.MotionType.KINEMATIC : hk.MotionType.DYNAMIC);
    if (!isKinematic) {
      hk.HP_Body_SetGravityFactor(this._hkBody, this._useGravity ? 1 : 0);
      this._pushMassProperties();
    }
    this._syncDofConstraint();
  }

  setConstraints(flags: number): void {
    this._constraintsFlags = flags;
    this._syncDofConstraint();
  }

  addForce(force: Vector3): void {
    if (this._isKinematic) return;
    this._accumForce.add(force);
    this._hasPendingForce = true;
    this.wakeUp();
  }

  addForceAtPosition(force: Vector3, position: Vector3): void {
    if (this._isKinematic) return;
    const idx = this._pendingPosForceCount++;
    let item = this._pendingPosForces[idx];
    if (!item) {
      item = { fx: 0, fy: 0, fz: 0, px: 0, py: 0, pz: 0 };
      this._pendingPosForces[idx] = item;
    }
    item.fx = force.x;
    item.fy = force.y;
    item.fz = force.z;
    item.px = position.x;
    item.py = position.y;
    item.pz = position.z;
    this.wakeUp();
  }

  addTorque(torque: Vector3): void {
    if (this._isKinematic) return;
    this._accumTorque.add(torque);
    this._hasPendingTorque = true;
    this.wakeUp();
  }

  move(positionOrRotation: Vector3 | Quaternion, rotation?: Quaternion): void {
    if (rotation) {
      this._kinematicTargetPos.copyFrom(positionOrRotation as Vector3);
      this._kinematicTargetRot.set(0, 0, 0, 1);
      Quaternion.normalize(rotation, this._kinematicTargetRot);
      this._hasPendingKinematicTarget = true;
      return;
    }

    const curPos = HavokDynamicCollider._dynTempPos;
    const curRot = HavokDynamicCollider._dynTempRot;
    if (this._hasPendingKinematicTarget) {
      curPos.copyFrom(this._kinematicTargetPos);
      curRot.copyFrom(this._kinematicTargetRot);
    } else {
      this.getWorldTransform(curPos, curRot);
    }
    if (positionOrRotation instanceof Vector3) {
      this._kinematicTargetPos.copyFrom(positionOrRotation);
      this._kinematicTargetRot.set(0, 0, 0, 1);
      Quaternion.normalize(curRot, this._kinematicTargetRot);
    } else {
      this._kinematicTargetPos.copyFrom(curPos);
      this._kinematicTargetRot.set(0, 0, 0, 1);
      Quaternion.normalize(curRot, this._kinematicTargetRot);
      Quaternion.normalize(positionOrRotation, this._kinematicTargetRot);
    }
    this._hasPendingKinematicTarget = true;
  }

  sleep(): void {
    const hk = this._havokPhysics._hk;
    hk.HP_Body_SetLinearVelocity(this._hkBody, [0, 0, 0]);
    hk.HP_Body_SetAngularVelocity(this._hkBody, [0, 0, 0]);
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

  /** @internal */
  _preStep(dt: number): void {
    if (this._isKinematic) {
      this._clearForces();
      if (this._hasPendingKinematicTarget && dt > 0) {
        this._hasPendingKinematicTarget = false;
        const p = this._kinematicTargetPos;
        const q = this._kinematicTargetRot;
        // Applied after HP_World_SetIdealStepTime(dt) so Havok derives exact single-step velocity
        this._havokPhysics._hk.HP_Body_SetTargetQTransform(this._hkBody, [
          [p.x, p.y, p.z],
          [q.x, q.y, q.z, q.w]
        ]);
        this._needsKinematicVelocityZero = true;
        this._movedKinematicThisStep = true;
      } else {
        this._movedKinematicThisStep = false;
      }
      return;
    }

    this._movedKinematicThisStep = false;
    this._flushForces(dt);
  }

  /** @internal */
  _postStep(): void {
    const hk = this._havokPhysics._hk;
    if (this._isKinematic) {
      if (this._needsKinematicVelocityZero) {
        // Havok keeps kinematic target velocity across subsequent steps unless cleared;
        // PhysX setKinematicTarget stops at the target after one simulation step.
        this._needsKinematicVelocityZero = false;
        hk.HP_Body_SetLinearVelocity(this._hkBody, [0, 0, 0]);
        hk.HP_Body_SetAngularVelocity(this._hkBody, [0, 0, 0]);
      }
      return;
    }

    const maxR = this._maxAngularVelocityRad;
    if (maxR < 1e5) {
      const [, vel] = hk.HP_Body_GetAngularVelocity(this._hkBody);
      const magSq = vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2];
      if (magSq > maxR * maxR && magSq > 0) {
        const s = maxR / Math.sqrt(magSq);
        hk.HP_Body_SetAngularVelocity(this._hkBody, [vel[0] * s, vel[1] * s, vel[2] * s]);
      }
    }
  }

  override setWorldTransform(position: Vector3, rotation: Quaternion): void {
    this._hasPendingKinematicTarget = false;
    if (this._isKinematic && this._needsKinematicVelocityZero) {
      this._needsKinematicVelocityZero = false;
      const hk = this._havokPhysics._hk;
      hk.HP_Body_SetLinearVelocity(this._hkBody, [0, 0, 0]);
      hk.HP_Body_SetAngularVelocity(this._hkBody, [0, 0, 0]);
    }
    super.setWorldTransform(position, rotation);
    if (this._constraintsFlags !== 0) {
      this._syncDofConstraint();
    }
  }

  override _onAddedToScene(scene: HavokPhysicsScene): void {
    super._onAddedToScene(scene);
    this._syncDofConstraint();
  }

  override _onRemovedFromScene(): void {
    this._hasPendingKinematicTarget = false;
    this._needsKinematicVelocityZero = false;
    this._movedKinematicThisStep = false;
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

  private _flushForces(dt: number): void {
    if (dt <= 0) {
      this._clearForces();
      return;
    }
    const hk = this._havokPhysics._hk;

    if (this._hasPendingForce) {
      const pos = HavokDynamicCollider._dynTempPos;
      const rot = HavokDynamicCollider._dynTempRot;
      const worldCom = HavokDynamicCollider._dynTempVec;
      this.getWorldTransform(pos, rot);
      Vector3.transformByQuat(this._centerOfMass, rot, worldCom);
      worldCom.add(pos);
      hk.HP_Body_ApplyImpulse(
        this._hkBody,
        [worldCom.x, worldCom.y, worldCom.z],
        [this._accumForce.x * dt, this._accumForce.y * dt, this._accumForce.z * dt]
      );
      this._accumForce.set(0, 0, 0);
      this._hasPendingForce = false;
    }

    if (this._pendingPosForceCount > 0) {
      for (let i = 0; i < this._pendingPosForceCount; i++) {
        const f = this._pendingPosForces[i];
        hk.HP_Body_ApplyImpulse(this._hkBody, [f.px, f.py, f.pz], [f.fx * dt, f.fy * dt, f.fz * dt]);
      }
      this._pendingPosForceCount = 0;
    }

    if (this._hasPendingTorque) {
      hk.HP_Body_ApplyAngularImpulse(this._hkBody, [
        this._accumTorque.x * dt,
        this._accumTorque.y * dt,
        this._accumTorque.z * dt
      ]);
      this._accumTorque.set(0, 0, 0);
      this._hasPendingTorque = false;
    }
  }

  private _clearForces(): void {
    this._accumForce.set(0, 0, 0);
    this._hasPendingForce = false;
    this._accumTorque.set(0, 0, 0);
    this._hasPendingTorque = false;
    this._pendingPosForceCount = 0;
  }

  private _pushMassProperties(): void {
    const mass = Math.max(this._mass, 1e-6);
    const invMass = 1.0 / mass;
    // Havok expects unit-mass inertia (I / mass).
    const mp: HKMassProperties = [
      [this._centerOfMass.x, this._centerOfMass.y, this._centerOfMass.z],
      mass,
      [this._inertiaTensor.x * invMass, this._inertiaTensor.y * invMass, this._inertiaTensor.z * invMass],
      [this._inertiaOrientation.x, this._inertiaOrientation.y, this._inertiaOrientation.z, this._inertiaOrientation.w]
    ];
    this._havokPhysics._hk.HP_Body_SetMassProperties(this._hkBody, mp);
  }

  private _syncDofConstraint(): void {
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

    const pos = HavokDynamicCollider._dynTempPos;
    const rot = HavokDynamicCollider._dynTempRot;
    this.getWorldTransform(pos, rot);

    hk.HP_Constraint_SetAnchorInParent(this._dofConstraint, [pos.x, pos.y, pos.z], [1, 0, 0], [0, 1, 0]);
    const invRot = HavokDynamicCollider._dynTempInvRot;
    Quaternion.invert(rot, invRot);
    const childAxisX = HavokDynamicCollider._dynTempAxisX.set(1, 0, 0);
    const childAxisY = HavokDynamicCollider._dynTempAxisY.set(0, 1, 0);
    Vector3.transformByQuat(childAxisX, invRot, childAxisX);
    Vector3.transformByQuat(childAxisY, invRot, childAxisY);
    hk.HP_Constraint_SetAnchorInChild(
      this._dofConstraint,
      [0, 0, 0],
      [childAxisX.x, childAxisX.y, childAxisX.z],
      [childAxisY.x, childAxisY.y, childAxisY.z]
    );

    const { FREE, LOCKED } = hk.ConstraintAxisLimitMode;
    const axis = hk.ConstraintAxis;
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, axis.LINEAR_X, flags & 1 ? LOCKED : FREE);
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, axis.LINEAR_Y, flags & 2 ? LOCKED : FREE);
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, axis.LINEAR_Z, flags & 4 ? LOCKED : FREE);
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, axis.ANGULAR_X, flags & 8 ? LOCKED : FREE);
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, axis.ANGULAR_Y, flags & 16 ? LOCKED : FREE);
    hk.HP_Constraint_SetAxisMode(this._dofConstraint, axis.ANGULAR_Z, flags & 32 ? LOCKED : FREE);
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
