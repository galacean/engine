import { Quaternion, Vector3 } from "@galacean/engine";
import { IJoint } from "@galacean/engine-design";
import { HavokCollider } from "../HavokCollider";
import { HavokPhysics } from "../HavokPhysics";
import type { HavokPhysicsScene } from "../HavokPhysicsScene";
import {
  HKQuaternion,
  HKVector3,
  HP_ConstraintId,
  SCRATCH_VEC3_A,
  SCRATCH_VEC3_B,
  SCRATCH_VEC3_C,
  writeVec3
} from "../HavokTypes";

// Half-ULP of Havok's internal hkHalf16 (7-bit mantissa) SIMD Jacobian storage:
// prevents false breaking at exact force === breakForce boundaries on offset anchors.
const BREAK_IMPULSE_TOLERANCE = 1 + 1 / 256;

/**
 * Base class for Havok constraints implementing Galacean IJoint.
 */
export abstract class HavokJoint implements IJoint {
  protected static _tempVecA = new Vector3();
  protected static _tempVecB = new Vector3();
  protected static _tempVecC = new Vector3();
  protected static _tempQuatA = new Quaternion();
  protected static _tempQuatB = new Quaternion();
  /** @internal */
  protected static _tempQTransform: [HKVector3, HKQuaternion] = [
    [0, 0, 0],
    [0, 0, 0, 1]
  ];

  /** @internal */
  _hkConstraint: HP_ConstraintId;
  /** @internal */
  _broken = false;

  protected _havokPhysics: HavokPhysics;
  protected _collider: HavokCollider;
  protected _connectedCollider: HavokCollider | null = null;
  protected _scene: HavokPhysicsScene | null = null;
  protected _anchor = new Vector3();
  protected _connectedAnchor = new Vector3();
  protected _rotation = new Quaternion(0, 0, 0, 1);
  protected _breakForce = Infinity;
  protected _breakTorque = Infinity;
  protected _destroyed = false;
  protected _enabled = false;
  protected _everEnabled = false;
  protected _anchorsDirty = true;
  protected _configDirty = true;
  protected _needsRebuild = false;
  protected _axesConfigured = false;

  private _boundParentBodyPtr = 0;
  private _boundChildBodyPtr = 0;
  private _boundScene: HavokPhysicsScene | null = null;

  constructor(havokPhysics: HavokPhysics, collider: HavokCollider) {
    this._havokPhysics = havokPhysics;
    this._collider = collider;
    this._hkConstraint = havokPhysics._hk.HP_Constraint_Create()[1];
    collider._addJoint(this);
    this._attachToScene(collider._scene);
  }

  /** @internal */
  _isBreakable(): boolean {
    return !this._broken && (Number.isFinite(this._breakForce) || Number.isFinite(this._breakTorque));
  }

  /** @internal */
  _preStep(dt: number): void {
    this._syncConstraint(dt);
  }

  /** @internal */
  _checkBreak(dt: number): void {
    if (!this._enabled || !this._isBreakable() || dt <= 0) return;
    const hk = this._havokPhysics._hk;
    const [res, linImp, angImp] = hk.HP_Constraint_GetAppliedImpulses(this._hkConstraint);
    if (res.value !== hk.Result.RESULT_OK.value) return;

    const invDt = 1.0 / dt;
    const forceSq = (linImp[0] * linImp[0] + linImp[1] * linImp[1] + linImp[2] * linImp[2]) * invDt * invDt;
    const torqueSq = (angImp[0] * angImp[0] + angImp[1] * angImp[1] + angImp[2] * angImp[2]) * invDt * invDt;
    const maxForce = Math.max(0, this._breakForce) * BREAK_IMPULSE_TOLERANCE;
    const maxTorque = Math.max(0, this._breakTorque) * BREAK_IMPULSE_TOLERANCE;

    if (forceSq > maxForce * maxForce || torqueSq > maxTorque * maxTorque) {
      this._broken = true;
      hk.HP_Constraint_SetEnabled(this._hkConstraint, 0);
      this._enabled = false;
    }
  }

  /** @internal */
  _onColliderSceneChanged(): void {
    if (this._destroyed) return;
    this._anchorsDirty = true;
    this._configDirty = true;
    const scene = this._collider._scene;
    if (scene && (!this._connectedCollider || this._connectedCollider._scene === scene)) {
      this._attachToScene(scene);
    } else {
      this._attachToScene(null);
    }
  }

  setConnectedCollider(value: HavokCollider | null | undefined): void {
    if (this._destroyed) return;
    const next = value || null;
    if (this._connectedCollider !== next) {
      if (this._connectedCollider && this._connectedCollider !== this._collider) {
        this._connectedCollider._removeJoint(this);
      }
      this._connectedCollider = next;
      if (next && next !== this._collider) {
        next._addJoint(this);
      }
    }
    this._broken = false;
    this._onColliderSceneChanged();
  }

  setAnchor(value: Vector3): void {
    const a = this._anchor;
    if (a.x === value.x && a.y === value.y && a.z === value.z) return;
    a.copyFrom(value);
    this._anchorsDirty = true;
  }

  setConnectedAnchor(value: Vector3): void {
    const a = this._connectedAnchor;
    if (a.x === value.x && a.y === value.y && a.z === value.z) return;
    a.copyFrom(value);
    this._anchorsDirty = true;
  }

  setRotation(value: Quaternion): void {
    const r = this._rotation;
    if (r.x === value.x && r.y === value.y && r.z === value.z && r.w === value.w) return;
    r.copyFrom(value);
    this._anchorsDirty = true;
  }

  setConnectedMassScale(scale: number): void;
  setConnectedMassScale(): void {
    // Not exposed in Havok WASM constraint API.
  }

  setMassScale(scale: number): void;
  setMassScale(): void {
    // Not exposed in Havok WASM constraint API.
  }

  setConnectedInertiaScale(scale: number): void;
  setConnectedInertiaScale(): void {
    // Not exposed in Havok WASM constraint API.
  }

  setInertiaScale(scale: number): void;
  setInertiaScale(): void {
    // Not exposed in Havok WASM constraint API.
  }

  setBreakForce(value: number): void {
    this._breakForce = value;
  }

  setBreakTorque(value: number): void {
    this._breakTorque = value;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._collider?._removeJoint(this);
    if (this._connectedCollider && this._connectedCollider !== this._collider) {
      this._connectedCollider._removeJoint(this);
    }
    this._scene?._removeJoint(this);
    this._scene = null;
    this._boundScene = null;
    const hk = this._havokPhysics._hk;
    if (hk) {
      if (this._enabled) {
        hk.HP_Constraint_SetEnabled(this._hkConstraint, 0);
        this._enabled = false;
      }
      hk.HP_Constraint_Release(this._hkConstraint);
    } else {
      this._enabled = false;
    }
    this._collider = null!;
    this._connectedCollider = null;
  }

  protected _getParentBasis(outAxisX: Vector3, outAxisY: Vector3): void {
    outAxisX.set(1, 0, 0);
    outAxisY.set(0, 1, 0);
  }

  protected _onConstraintRecreated(): void {}

  protected abstract _applyConstraintConfig(dt: number): void;

  protected _syncAnchors(): void {
    const hk = this._havokPhysics._hk;
    const ax = HavokJoint._tempVecA;
    const ay = HavokJoint._tempVecB;
    this._getParentBasis(ax, ay);

    hk.HP_Constraint_SetAnchorInParent(
      this._hkConstraint,
      writeVec3(this._anchor, SCRATCH_VEC3_A),
      writeVec3(ax, SCRATCH_VEC3_B),
      writeVec3(ay, SCRATCH_VEC3_C)
    );

    Vector3.transformByQuat(ax, this._rotation, ax);
    Vector3.transformByQuat(ay, this._rotation, ay);
    hk.HP_Constraint_SetAnchorInChild(
      this._hkConstraint,
      writeVec3(this._connectedAnchor, SCRATCH_VEC3_A),
      writeVec3(ax, SCRATCH_VEC3_B),
      writeVec3(ay, SCRATCH_VEC3_C)
    );
  }

  protected _attachToScene(scene: HavokPhysicsScene | null): void {
    if (this._scene === scene) return;
    if (this._enabled) {
      const hk = this._havokPhysics._hk;
      if (hk) {
        hk.HP_Constraint_SetEnabled(this._hkConstraint, 0);
      }
      this._enabled = false;
    }
    if (scene !== null && this._boundScene !== null && this._boundScene !== scene) {
      this._needsRebuild = true;
    }
    this._scene?._removeJoint(this);
    this._scene = scene;
    this._scene?._addJoint(this);
    this._anchorsDirty = true;
    this._configDirty = true;
  }

  protected _syncConstraint(dt: number): void {
    if (this._destroyed) return;
    const hk = this._havokPhysics._hk;
    const scene = this._collider._scene;

    if (this._broken || !scene || (this._connectedCollider && this._connectedCollider._scene !== scene)) {
      if (this._enabled) {
        hk.HP_Constraint_SetEnabled(this._hkConstraint, 0);
        this._enabled = false;
      }
      return;
    }

    const parentBody = this._collider._hkBody;
    const parentBodyPtr = this._collider._hkBodyPtr;
    const childBody = this._connectedCollider ? this._connectedCollider._hkBody : scene._worldAnchorBody;
    const childBodyPtr = this._connectedCollider ? this._connectedCollider._hkBodyPtr : scene._worldAnchorBodyPtr;

    // Havok WASM bakes parent/child bodies into the solver constraint on first HP_Constraint_SetEnabled(1);
    // retargeting bodies or clearing soft-limit modifiers requires recreating the constraint handle.
    const bodiesChanged =
      this._everEnabled && (this._boundParentBodyPtr !== parentBodyPtr || this._boundChildBodyPtr !== childBodyPtr);

    if (this._needsRebuild || bodiesChanged) {
      if (this._enabled) {
        hk.HP_Constraint_SetEnabled(this._hkConstraint, 0);
        this._enabled = false;
      }
      hk.HP_Constraint_Release(this._hkConstraint);
      this._hkConstraint = hk.HP_Constraint_Create()[1];
      this._everEnabled = false;
      this._needsRebuild = false;
      this._anchorsDirty = true;
      this._configDirty = true;
      this._axesConfigured = false;
      this._boundParentBodyPtr = 0;
      this._boundChildBodyPtr = 0;
      this._boundScene = null;
      this._onConstraintRecreated();
    }

    if (this._anchorsDirty || this._configDirty || !this._enabled) {
      if (!this._everEnabled) {
        hk.HP_Constraint_SetCollisionsEnabled(this._hkConstraint, 0);
        hk.HP_Constraint_SetParentBody(this._hkConstraint, parentBody);
        hk.HP_Constraint_SetChildBody(this._hkConstraint, childBody);
        this._boundParentBodyPtr = parentBodyPtr;
        this._boundChildBodyPtr = childBodyPtr;
      }

      if (this._anchorsDirty) {
        this._syncAnchors();
        this._anchorsDirty = false;
      }
      if (this._configDirty) {
        this._applyConstraintConfig(dt);
        this._configDirty = false;
      }

      if (!this._enabled) {
        hk.HP_Constraint_SetEnabled(this._hkConstraint, 1);
        this._enabled = true;
        this._everEnabled = true;
        this._boundScene = scene;
      }
    }
  }
}
