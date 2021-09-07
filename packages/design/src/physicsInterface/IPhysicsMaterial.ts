export interface IPhysicsMaterial {
  /** the coefficient of restitution */
  bounciness: number;

  /** the coefficient of dynamic friction. */
  dynamicFriction: number;

  /** Retrieves the coefficient of static friction. */
  staticFriction: number;

  /** the restitution combine mode. */
  bounceCombine: number;

  /** the friction combine mode. */
  frictionCombine: number;
}
