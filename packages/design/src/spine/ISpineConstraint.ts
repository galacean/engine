import type { ISpineConstraintData } from "./ISpineConstraintData";

export interface ISpineConstraint {
  readonly data: ISpineConstraintData;
  isActive(): boolean;
}
