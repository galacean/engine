import { PhysicsMaterialCombineMode } from "./enums/PhysicsMaterialCombineMode";

/**
 * Physics material properties supplied by the engine.
 */
export interface IPhysicsMaterialProperties {
  readonly staticFriction: number;
  readonly dynamicFriction: number;
  readonly bounciness: number;
  readonly frictionCombine: PhysicsMaterialCombineMode;
  readonly bounceCombine: PhysicsMaterialCombineMode;
}

/**
 * Native physics material.
 * @remarks Updating material properties must affect shapes and character controllers currently bound to this material.
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
  setBounceCombine(value: PhysicsMaterialCombineMode): void;

  /**
   * Set the friction combine mode.
   * @param value - The combine mode
   */
  setFrictionCombine(value: PhysicsMaterialCombineMode): void;

  /**
   * Release the native physics material.
   */
  destroy(): void;
}
