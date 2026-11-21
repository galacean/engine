import type { BranchCoverage, BranchSignature, DeclarationCoexistence } from "./BaseToken";

/**
 * Branch-reasoning operations supplied only to analyzer parser instances.
 * @internal
 */
export interface BranchSemantics {
  /**
   * Determines whether two branches may coexist.
   * @param left - First branch signature.
   * @param right - Second branch signature.
   * @returns Whether the branches overlap.
   * @internal
   */
  canBranchesOverlap(left: BranchSignature, right: BranchSignature): boolean;
  /**
   * Determines whether two declarations may coexist.
   * @param earlier - Earlier declaration branch.
   * @param later - Later declaration branch.
   * @returns Whether coexistence has not been disproven.
   * @internal
   */
  canDeclarationsCoexist(earlier: BranchSignature, later: BranchSignature): boolean;
  /**
   * Classifies declaration coverage at a reference.
   * @param candidates - Declaration branches.
   * @param callSiteBranch - Reference branch.
   * @returns Proven coverage, proven absence, or unknown coverage.
   * @internal
   */
  getBranchCoverage(candidates: readonly BranchSignature[], callSiteBranch: BranchSignature): BranchCoverage;
  /**
   * Classifies whether two declarations can coexist.
   * @param earlier - Earlier declaration branch.
   * @param later - Later declaration branch.
   * @returns Proven coexistence, proven exclusivity, or an unknown relation.
   * @internal
   */
  getDeclarationCoexistence(earlier: BranchSignature, later: BranchSignature): DeclarationCoexistence;
  /**
   * Determines whether a branch has a satisfying macro configuration.
   * @param branch - Branch signature to test.
   * @returns Whether the branch is reachable.
   * @internal
   */
  isBranchReachable(branch: BranchSignature): boolean;
  /**
   * Determines whether a declaration is guaranteed at a reference.
   * @param defBranch - Declaration branch.
   * @param callSiteBranch - Reference branch.
   * @returns Whether every reachable call-site configuration includes the declaration.
   * @internal
   */
  isBranchVisibleFrom(defBranch: BranchSignature, callSiteBranch: BranchSignature): boolean;
}
