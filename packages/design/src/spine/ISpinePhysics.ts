import type { ISpinePhysicsConstraint } from "./ISpinePhysicsConstraint";

/** Physics participates in the skeleton's ordered constraint evaluation, not a separate simulation. */
export interface ISpinePhysics {
  readonly physicsConstraints: readonly ISpinePhysicsConstraint[];
  physicsTranslate(x: number, y: number): void;
  physicsRotate(x: number, y: number, degrees: number): void;
}
