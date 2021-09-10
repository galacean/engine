export interface IPhysicsMaterial {
  /** the coefficient of restitution */
  setBounciness(value: number): void;

  /** the coefficient of dynamic friction. */
  setDynamicFriction(value: number): void;

  /** Retrieves the coefficient of static friction. */
  setStaticFriction(value: number): void;

  /** the restitution combine mode. */
  setBounceCombine(value: number): void;

  /** the friction combine mode. */
  setFrictionCombine(value: number): void;
}
