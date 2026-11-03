import type { V2Budget } from "../spatial/V2Model.ts";
/** Shared deterministic operation limits and a cancellation-only wall clock ceiling. */
export const DEFAULT_V2_BUDGET: V2Budget = { operations: 40000000, searchExpansions: 100000, maxMilliseconds: 12000 };
/** Explicit budget exhaustion, distinct from proven infeasibility. */
export class V2BudgetExceeded extends Error {}
/** One accounting object passed through generation, search and final validation. */
export class V2Meter {
  operations = 0;
  searchExpansions = 0;
  readonly start = performance.now();
  /** Create a single transaction meter. @param budget Limits shared by all stages. */
  constructor(readonly budget: V2Budget = DEFAULT_V2_BUDGET) {}
  /** Consume deterministic work units. @param count Primitive operations charged by the caller. */
  spend(count = 1): void {
    this.operations += count;
    if (this.operations > this.budget.operations) throw new V2BudgetExceeded("共享操作预算耗尽");
    if ((this.operations & 4095) < count && performance.now() - this.start > this.budget.maxMilliseconds)
      throw new V2BudgetExceeded("作业时间预算耗尽");
  }
  /** Charge one graph node expansion. */
  expand(): void {
    this.searchExpansions++;
    this.spend();
    if (this.searchExpansions > this.budget.searchExpansions) throw new V2BudgetExceeded("共享路径展开预算耗尽");
  }
  /** Check wall time between coarse stages. */
  checkpoint(): void {
    if (performance.now() - this.start > this.budget.maxMilliseconds) throw new V2BudgetExceeded("作业时间预算耗尽");
  }
}
