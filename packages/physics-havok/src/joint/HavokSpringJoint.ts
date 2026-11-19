import { ISpringJoint } from "@galacean/engine-design";
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
  private _axesConfigured = false;

  setMinDistance(distance: number): void {
    const next = Math.max(0, distance);
    if (this._minDistance === next) return;
    this._minDistance = next;
    this._configDirty = true;
  }

  setMaxDistance(distance: number): void {
    const next = Math.max(0, distance);
    if (this._maxDistance === next) return;
    this._maxDistance = next;
    this._configDirty = true;
  }

  setTolerance(tolerance: number): void {
    const next = Math.max(0, tolerance);
    if (this._tolerance === next) return;
    this._tolerance = next;
    this._configDirty = true;
  }

  setStiffness(stiffness: number): void {
    const next = Math.max(0, stiffness);
    if (this._stiffness === next) return;
    this._stiffness = next;
    this._configDirty = true;
  }

  setDamping(damping: number): void {
    const next = Math.max(0, damping);
    if (this._damping === next) return;
    this._damping = next;
    this._configDirty = true;
  }

  protected override _onConstraintRecreated(): void {
    this._axesConfigured = false;
  }

  protected override _applyConstraintConfig(): void {
    const hk = this._havokPhysics._hk;
    const axis = hk.ConstraintAxis.LINEAR_DISTANCE;
    if (!this._axesConfigured) {
      hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis, hk.ConstraintAxisLimitMode.LIMITED);
      this._axesConfigured = true;
    }
    const minLim = Math.max(0, this._minDistance - this._tolerance);
    const maxLim = Math.max(minLim, this._maxDistance + this._tolerance);
    hk.HP_Constraint_SetAxisMinLimit(this._hkConstraint, axis, minLim);
    hk.HP_Constraint_SetAxisMaxLimit(this._hkConstraint, axis, maxLim);
    hk.HP_Constraint_SetAxisStiffness(this._hkConstraint, axis, this._stiffness);
    hk.HP_Constraint_SetAxisDamping(this._hkConstraint, axis, this._damping);
  }
}
