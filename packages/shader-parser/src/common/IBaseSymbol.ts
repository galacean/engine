import { BranchSignature } from "./BaseToken";

export interface IBaseSymbol {
  isInMacroBranch: boolean;
  branchSignature: BranchSignature;

  readonly ident: string;

  equal(other: IBaseSymbol): boolean;
}
