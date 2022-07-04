/**
 * Constraint flags.
 */
export enum ConstraintFlag {
  /** whether the constraint is broken */
  Broken = 1,
  /** whether collider1 should get projected to collider0 for this constraint (note: projection of a static/kinematic collider to a dynamic collider will be ignored) */
  ProjectToCollider0 = 2,
  /** whether collider0 should get projected to collider1 for this constraint (note: projection of a static/kinematic collider to a dynamic collider will be ignored) */
  ProjectToCollider1 = 4,
  /** whether the colliders should get projected for this constraint (the direction will be chosen by Backend) */
  Projection = 6,
  /** whether contacts should be generated between the objects this constraint constrains */
  CollisionEnabled = 8,
  /** limits for drive strength are forces rather than impulses */
  DriveLimitsAreForces = 32,
  /** perform preprocessing for improved accuracy on D6 Slerp Drive (this flag will be removed in a future release when preprocessing is no longer required) */
  ImprovedSlerp = 64,
  /** suppress constraint preprocessing, intended for use with rowResponseThreshold. May result in worse solver accuracy for ill-conditioned constraints. */
  DisablePreprocessing = 128,
  /** enables extended limit ranges for angular limits (e.g. limit values > PxPi or < -PxPi) */
  EnableExtendedLimits = 256
}
