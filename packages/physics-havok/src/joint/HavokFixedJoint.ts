import { Quaternion, Vector3 } from "@galacean/engine";
import { IFixedJoint } from "@galacean/engine-design";
import { HavokCollider } from "../HavokCollider";
import { HavokPhysics } from "../HavokPhysics";
import { HavokJoint } from "./HavokJoint";

/**
 * Fixed joint locking all 6 degrees of freedom in Havok.
 */
export class HavokFixedJoint extends HavokJoint implements IFixedJoint {
  private static _tempPosA = new Vector3();
  private static _tempPosB = new Vector3();
  private static _tempRotA = new Quaternion();
  private static _tempRotB = new Quaternion();
  private static _tempInvRel = new Quaternion();
  private static _tempAnchorA = new Vector3();
  private static _tempAnchorB = new Vector3();

  private _axesConfigured = false;

  constructor(havokPhysics: HavokPhysics, collider: HavokCollider) {
    super(havokPhysics, collider);
  }

  override _checkBreak(dt: number): void {
    super._checkBreak(dt);
    if (this._broken || this._destroyed || !this._enabled) return;
    this._projectToImmovableAnchor();
  }

  protected override _onConstraintRecreated(): void {
    this._axesConfigured = false;
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
    const hk = this._havokPhysics._hk;
    const dynamicType = hk.MotionType.DYNAMIC.value;
    const parentBody = this._collider._hkBody;
    const parentDynamic = hk.HP_Body_GetMotionType(parentBody)[1].value === dynamicType;
    const childCollider = this._connectedCollider;
    const childDynamic =
      childCollider !== null && hk.HP_Body_GetMotionType(childCollider._hkBody)[1].value === dynamicType;

    if (parentDynamic === childDynamic) {
      return;
    }

    const posA = HavokFixedJoint._tempPosA;
    const posB = HavokFixedJoint._tempPosB;
    const rotA = HavokFixedJoint._tempRotA;
    const rotB = HavokFixedJoint._tempRotB;
    const ancA = HavokFixedJoint._tempAnchorA;
    const ancB = HavokFixedJoint._tempAnchorB;

    if (parentDynamic) {
      let vx = 0,
        vy = 0,
        vz = 0;
      let wx = 0,
        wy = 0,
        wz = 0;
      if (childCollider) {
        childCollider.getWorldTransform(posB, rotB);
        const [, linVel] = hk.HP_Body_GetLinearVelocity(childCollider._hkBody);
        const [, angVel] = hk.HP_Body_GetAngularVelocity(childCollider._hkBody);
        vx = linVel[0];
        vy = linVel[1];
        vz = linVel[2];
        wx = angVel[0];
        wy = angVel[1];
        wz = angVel[2];
      } else {
        posB.set(0, 0, 0);
        rotB.set(0, 0, 0, 1);
      }

      Quaternion.multiply(rotB, this._rotation, rotA);
      rotA.normalize();
      Vector3.transformByQuat(this._connectedAnchor, rotB, ancB);
      Vector3.transformByQuat(this._anchor, rotA, ancA);
      const px = posB.x + ancB.x - ancA.x;
      const py = posB.y + ancB.y - ancA.y;
      const pz = posB.z + ancB.z - ancA.z;

      hk.HP_Body_SetQTransform(parentBody, [
        [px, py, pz],
        [rotA.x, rotA.y, rotA.z, rotA.w]
      ]);
      this._scene?._markBroadphaseDirty(this._collider);

      const rx = px - posB.x;
      const ry = py - posB.y;
      const rz = pz - posB.z;
      hk.HP_Body_SetLinearVelocity(parentBody, [
        vx + wy * rz - wz * ry,
        vy + wz * rx - wx * rz,
        vz + wx * ry - wy * rx
      ]);
      hk.HP_Body_SetAngularVelocity(parentBody, [wx, wy, wz]);
    } else if (childCollider) {
      const childBody = childCollider._hkBody;
      this._collider.getWorldTransform(posA, rotA);
      const [, linVel] = hk.HP_Body_GetLinearVelocity(parentBody);
      const [, angVel] = hk.HP_Body_GetAngularVelocity(parentBody);
      const vx = linVel[0],
        vy = linVel[1],
        vz = linVel[2];
      const wx = angVel[0],
        wy = angVel[1],
        wz = angVel[2];

      const invRel = HavokFixedJoint._tempInvRel;
      Quaternion.invert(this._rotation, invRel);
      Quaternion.multiply(rotA, invRel, rotB);
      rotB.normalize();
      Vector3.transformByQuat(this._anchor, rotA, ancA);
      Vector3.transformByQuat(this._connectedAnchor, rotB, ancB);
      const px = posA.x + ancA.x - ancB.x;
      const py = posA.y + ancA.y - ancB.y;
      const pz = posA.z + ancA.z - ancB.z;

      hk.HP_Body_SetQTransform(childBody, [
        [px, py, pz],
        [rotB.x, rotB.y, rotB.z, rotB.w]
      ]);
      this._scene?._markBroadphaseDirty(childCollider);

      const rx = px - posA.x;
      const ry = py - posA.y;
      const rz = pz - posA.z;
      hk.HP_Body_SetLinearVelocity(childBody, [vx + wy * rz - wz * ry, vy + wz * rx - wx * rz, vz + wx * ry - wy * rx]);
      hk.HP_Body_SetAngularVelocity(childBody, [wx, wy, wz]);
    }
  }
}
