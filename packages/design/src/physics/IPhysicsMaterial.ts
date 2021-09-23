/**
 * interface of physics material.
 */
export interface IPhysicsMaterial {
  /** Set the coefficient of restitution. */
  setBounciness(value: number): void;

  /** Set the coefficient of dynamic friction. */
  setDynamicFriction(value: number): void;

  /** Set the coefficient of static friction. */
  setStaticFriction(value: number): void;

  /** Set the restitution combine mode. */
  setBounceCombine(value: number): void;

  /** Set the friction combine mode. */
  setFrictionCombine(value: number): void;
}
