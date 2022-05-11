/**
 * Interface of physics material.
 */
export interface IPhysicsMaterial {
  /**
   * Set the coefficient of bounciness.
   * @param value - The bounciness
   */
  setBounciness(value: number): void;

  /**
   * Set the coefficient of dynamic friction.
   * @param value - The dynamic friction
   */
  setDynamicFriction(value: number): void;

  /**
   * Set the coefficient of static friction.
   * @param value - The static friction
   */
  setStaticFriction(value: number): void;

  /**
   * Set the bounciness combine mode.
   * @param value - The combine mode
   */
  setBounceCombine(value: number): void;

  /**
   * Set the friction combine mode.
   * @param value - The combine mode
   */
  setFrictionCombine(value: number): void;

  /**
   * Decrements the reference count of a material and releases it if the new reference count is zero.
   */
  destroy(): void;
}
