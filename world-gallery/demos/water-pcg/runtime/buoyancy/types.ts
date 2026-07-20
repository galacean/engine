import type { Vector3 } from "@galacean/engine-math";

/** A caller-authored spherical buoyancy probe in the owning entity's local space. */
export interface BuoyancyPontoon {
  localPosition: Vector3;
  radius: number;
  enabled: boolean;
}

/**
 * Caller-owned inputs for one Pontoon force evaluation.
 *
 * Vector references may point at engine-owned state because the solver never mutates them.
 * Scalar fields are mutable so a component can reuse one input object for every fixed step.
 */
export interface BuoyancyPointForceInput {
  pontoonCenter: Vector3;
  surfacePosition: Vector3;
  waterVelocity: Vector3;
  linearVelocity: Vector3;
  angularVelocityDegrees: Vector3;
  worldCenterOfMass: Vector3;
  gravity: Vector3;
  radius: number;
  totalRadiusCubed: number;
  mass: number;
  buoyancyCoefficient: number;
  verticalDamping: number;
  maxForceMultiplier: number;
  applyHorizontalDrag: boolean;
  horizontalLinearDrag: number;
  waterDensity: number;
  horizontalDragCoefficient: number;
  horizontalDragAreaScale: number;
  maxHorizontalDragSpeed: number;
  maxHorizontalForceMultiplier: number;
}

/** Caller-owned result for one Pontoon force evaluation. */
export interface BuoyancyPointForceOutput {
  readonly force: Vector3;
  readonly horizontalForce: Vector3;
  submergedRatio: number;
  radiusCubedWeight: number;
  verticalSpeed: number;
  horizontalRelativeSpeed: number;
  submergedProjectedArea: number;
  submergedAreaRatio: number;
  horizontalForceClamped: boolean;
}

/**
 * Caller-owned vectors reused by the solver's hot path.
 *
 * Every field, the output force, and every input vector must be a distinct Vector3 instance.
 */
export interface BuoyancySolverScratch {
  readonly up: Vector3;
  readonly angularVelocityRadians: Vector3;
  readonly offsetFromCenterOfMass: Vector3;
  readonly pointVelocity: Vector3;
  readonly relativeVelocity: Vector3;
  readonly horizontalRelativeVelocity: Vector3;
}
