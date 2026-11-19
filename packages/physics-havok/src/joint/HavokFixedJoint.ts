import { Quaternion, Vector3 } from "@galacean/engine";
import { IFixedJoint } from "@galacean/engine-design";
import type { HavokCollider } from "../HavokCollider";
import type { HavokDynamicCollider } from "../HavokDynamicCollider";
import { SCRATCH_VEC3_A, SCRATCH_VEC3_B, ZERO_VEC3 } from "../HavokTypes";
import { HavokJoint } from "./HavokJoint";

/**
 * Fixed joint locking all 6 degrees of freedom in Havok.
 */
export class HavokFixedJoint extends HavokJoint implements IFixedJoint {
  /** @internal */
  override _checkBreak(dt: number): void {
    super._checkBreak(dt);
    if (this._broken || this._destroyed || !this._enabled) return;
    this._projectToImmovableAnchor();
  }

  protected override _applyConstraintConfig(): void {
    if (this._axesConfigured) return;
    const hk = this._havokPhysics._hk;
    const axis = hk.ConstraintAxis;
    const locked = hk.ConstraintAxisLimitMode.LOCKED;
    hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis.LINEAR_X, locked);
    hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis.LINEAR_Y, locked);
    hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis.LINEAR_Z, locked);
    hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis.ANGULAR_X, locked);
    hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis.ANGULAR_Y, locked);
    hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis.ANGULAR_Z, locked);
    this._axesConfigured = true;
  }

  /**
   * Post-solve rigid projection when one side is immovable (static/kinematic/world),
   * matching PhysX FixedJoint's single-step exact convergence despite Havok's hardcoded m_tau = 0.6.
   */
  private _projectToImmovableAnchor(): void {
    const parentCol = this._collider;
    const childCol = this._connectedCollider;
    const parentDynamic = parentCol._isDynamic && !(parentCol as HavokDynamicCollider)._isKinematic;
    const childDynamic = childCol !== null && childCol._isDynamic && !(childCol as HavokDynamicCollider)._isKinematic;

    if (parentDynamic === childDynamic) {
      return;
    }

    const dynCol = (parentDynamic ? parentCol : childCol!) as HavokDynamicCollider;
    const immCol: HavokCollider | null = parentDynamic ? childCol : parentCol;
    const dynAnchor = parentDynamic ? this._anchor : this._connectedAnchor;
    const immAnchor = parentDynamic ? this._connectedAnchor : this._anchor;

    const hk = this._havokPhysics._hk;
    const immPos = HavokJoint._tempVecA;
    const immRot = HavokJoint._tempQuatA;
    let vx = 0,
      vy = 0,
      vz = 0;
    let wx = 0,
      wy = 0,
      wz = 0;

    if (immCol) {
      immCol.getWorldTransform(immPos, immRot);
      // Only kinematic bodies (which have `_isDynamic === true`) can have non-zero velocity; static anchors are always 0.
      if (immCol._isDynamic) {
        const [, linVel] = hk.HP_Body_GetLinearVelocity(immCol._hkBody);
        const [, angVel] = hk.HP_Body_GetAngularVelocity(immCol._hkBody);
        vx = linVel[0];
        vy = linVel[1];
        vz = linVel[2];
        wx = angVel[0];
        wy = angVel[1];
        wz = angVel[2];
      }
    } else {
      immPos.set(0, 0, 0);
      immRot.set(0, 0, 0, 1);
    }

    const dynRot = HavokJoint._tempQuatB;
    if (parentDynamic) {
      Quaternion.multiply(immRot, this._rotation, dynRot);
    } else {
      Quaternion.invert(this._rotation, dynRot);
      Quaternion.multiply(immRot, dynRot, dynRot);
    }
    dynRot.normalize();

    const ancImm = HavokJoint._tempVecB;
    const ancDyn = HavokJoint._tempVecC;
    Vector3.transformByQuat(immAnchor, immRot, ancImm);
    Vector3.transformByQuat(dynAnchor, dynRot, ancDyn);
    const px = immPos.x + ancImm.x - ancDyn.x;
    const py = immPos.y + ancImm.y - ancDyn.y;
    const pz = immPos.z + ancImm.z - ancDyn.z;

    // Compare target pose against current dynamic pose (reuse ancImm/immRot after ancImm is consumed).
    // Use sign-aligned squared component diff (> 1e-10) rather than `1 - |dot| > 1e-12` so float32
    // normalization ULP (~1e-7) from WASM does not trigger spurious writes on settled rotated joints.
    const curDynPos = HavokJoint._tempVecB;
    const curDynRot = HavokJoint._tempQuatA;
    dynCol.getWorldTransform(curDynPos, curDynRot);
    const dx = px - curDynPos.x;
    const dy = py - curDynPos.y;
    const dz = pz - curDynPos.z;
    const qs = Quaternion.dot(curDynRot, dynRot) < 0 ? -1 : 1;
    const qdx = curDynRot.x - qs * dynRot.x;
    const qdy = curDynRot.y - qs * dynRot.y;
    const qdz = curDynRot.z - qs * dynRot.z;
    const qdw = curDynRot.w - qs * dynRot.w;
    const poseDirty = dx * dx + dy * dy + dz * dz > 1e-10 || qdx * qdx + qdy * qdy + qdz * qdz + qdw * qdw > 1e-10;
    const immMoving = vx !== 0 || vy !== 0 || vz !== 0 || wx !== 0 || wy !== 0 || wz !== 0;

    if (!poseDirty && !immMoving && dynCol.isSleeping()) {
      return;
    }

    const dynBody = dynCol._hkBody;
    if (poseDirty) {
      const qt = HavokJoint._tempQTransform;
      qt[0][0] = px;
      qt[0][1] = py;
      qt[0][2] = pz;
      qt[1][0] = dynRot.x;
      qt[1][1] = dynRot.y;
      qt[1][2] = dynRot.z;
      qt[1][3] = dynRot.w;
      hk.HP_Body_SetQTransform(dynBody, qt);
      this._scene?._queueBroadphaseDirtyCollider(dynCol);
    }

    if (immMoving) {
      const rx = px - immPos.x;
      const ry = py - immPos.y;
      const rz = pz - immPos.z;
      const lin = SCRATCH_VEC3_A;
      lin[0] = vx + wy * rz - wz * ry;
      lin[1] = vy + wz * rx - wx * rz;
      lin[2] = vz + wx * ry - wy * rx;
      const ang = SCRATCH_VEC3_B;
      ang[0] = wx;
      ang[1] = wy;
      ang[2] = wz;
      hk.HP_Body_SetLinearVelocity(dynBody, lin);
      hk.HP_Body_SetAngularVelocity(dynBody, ang);
    } else {
      hk.HP_Body_SetLinearVelocity(dynBody, ZERO_VEC3);
      hk.HP_Body_SetAngularVelocity(dynBody, ZERO_VEC3);
    }
  }
}
