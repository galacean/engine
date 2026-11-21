import { BranchSignature } from "./BaseToken";

export interface IBaseSymbol {
  isInMacroBranch: boolean;
  branchSignature: BranchSignature;
  /** ShaderLab inheritance layer owning the declaration. */
  sourceScope?: number;

  readonly ident: string;

  equal(other: IBaseSymbol): boolean;
}
