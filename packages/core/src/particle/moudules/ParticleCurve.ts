import { ParticleCurveMode } from "../enums/ParticleCurveMode";

/**
 * Particle curve.
 */
export class ParticleCurve {
  /** The curve mode. */
  mode: ParticleCurveMode = ParticleCurveMode.Constant;
  /* The constant value used by the curve if mode is set to `Constant`. */
  constant: number = 0;
  /* The min constant value used by the curve if mode is set to `TwoConstants`. */
  constantMin: number = 0;
  /* The max constant value used by the curve if mode is set to`TwoConstants`. */
  constantMax: number = 0;
}
