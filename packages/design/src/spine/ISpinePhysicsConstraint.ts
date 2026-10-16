import type { ISpineConstraint } from "./ISpineConstraint";

export interface ISpinePhysicsConstraint extends ISpineConstraint {
  inertia: number;
  strength: number;
  damping: number;
  massInverse: number;
  wind: number;
  gravity: number;
  mix: number;
  reset(): void;
}
