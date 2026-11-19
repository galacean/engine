import { ISpringJoint } from "@galacean/engine-design";
import { HavokCollider } from "../HavokCollider";
import { HavokPhysics } from "../HavokPhysics";
import { HavokJoint } from "./HavokJoint";

/**
 * Spring / distance joint for Havok using LINEAR_DISTANCE axis.
 */
export class HavokSpringJoint extends HavokJoint implements ISpringJoint {
  private _minDistance = 0;
  private _maxDistance = 0;
  private _tolerance = 0.25;
  private _stiffness = 0;
  private _damping = 0;

  constructor(havokPhysics: HavokPhysics, collider: HavokCollider) {
    super(havokPhysics, collider);
  }

  setMinDistance(distance: number): void {
    this._minDistance = Math.max(0, distance);
    this._dirty = true;
  }

  setMaxDistance(distance: number): void {
    this._maxDistance = Math.max(0, distance);
    this._dirty = true;
  }

  setTolerance(tolerance: number): void {
    this._tolerance = Math.max(0, tolerance);
    this._dirty = true;
  }

  setStiffness(stiffness: number): void {
    this._stiffness = Math.max(0, stiffness);
    this._dirty = true;
  }

  setDamping(damping: number): void {
    this._damping = Math.max(0, damping);
    this._dirty = true;
  }

  protected override _applyConstraintConfig(): void {
    const hk = this._havokPhysics._hk;
    const axis = hk.ConstraintAxis.LINEAR_DISTANCE;
    const minLim = Math.max(0, this._minDistance - this._tolerance);
    const maxLim = Math.max(minLim, this._maxDistance + this._tolerance);
    hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis, hk.ConstraintAxisLimitMode.LIMITED);
    hk.HP_Constraint_SetAxisMinLimit(this._hkConstraint, axis, minLim);
    hk.HP_Constraint_SetAxisMaxLimit(this._hkConstraint, axis, maxLim);
    hk.HP_Constraint_SetAxisStiffness(this._hkConstraint, axis, this._stiffness);
    hk.HP_Constraint_SetAxisDamping(this._hkConstraint, axis, this._damping);
  }
}
