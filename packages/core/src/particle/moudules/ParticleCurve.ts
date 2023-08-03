import { IClone } from "@galacean/engine-design";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";

/**
 * Particle curve.
 */
export class ParticleCurve implements IClone {
  /** The curve mode. */
  mode: ParticleCurveMode = ParticleCurveMode.Constant;
  /* The constant value used by the curve if mode is set to `Constant`. */
  constant: number = 0;
  /* The min constant value used by the curve if mode is set to `TwoConstants`. */
  constantMin: number = 0;
  /* The max constant value used by the curve if mode is set to`TwoConstants`. */
  constantMax: number = 0;

  /**
   * @inheritDoc
   */
  cloneTo(destEmission: ParticleCurve): void {
    destEmission.mode = this.mode;
    destEmission.constant = this.constant;
    destEmission.constantMin = this.constantMin;
    destEmission.constantMax = this.constantMax;
  }

  /**
   * @inheritDoc
   */
  clone(): ParticleCurve {
    const destEmission = new ParticleCurve();
    this.cloneTo(destEmission);
    return destEmission;
  }
}
