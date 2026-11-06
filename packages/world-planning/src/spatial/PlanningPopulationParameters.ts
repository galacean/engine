/** Editable generation ranges; lower endpoints guide planning rather than force placement. */
export interface PlanningPopulationOptions {
  villageMin?: number;
  villageMax?: number;
  buildingMin?: number;
  buildingMax?: number;
  /** @deprecated Import compatibility; use villageMin and villageMax. */
  villageTarget?: number;
  /** @deprecated Import compatibility; use buildingMax. */
  buildingLimit?: number;
}

/** Resolved nonnegative integer ranges for an explicit population planning operation. */
export interface PlanningPopulationRanges {
  villageMin: number;
  villageMax: number;
  buildingMin: number;
  buildingMax: number;
}

/** Convert retired population inputs in place without generating or changing layouts.
 * @param values Sparse author values or a private recipe population object.
 */
export function migratePopulationRanges(values: Record<string, unknown>): void {
  if (values.villageTarget !== undefined) {
    values.villageMin ??= values.villageTarget;
    values.villageMax ??= values.villageTarget;
    delete values.villageTarget;
  }
  if (values.buildingLimit !== undefined) {
    values.buildingMin ??= 0;
    values.buildingMax ??= values.buildingLimit;
    delete values.buildingLimit;
  }
}

/** Resolve sparse inputs and reject inverted ranges; cross-range scarcity remains a planning result.
 * @param options Authored population ranges, including imported retired fields.
 * @returns Independent validated endpoints.
 * @throws If an endpoint is not a nonnegative integer or a range is inverted.
 */
export function resolvePopulationRanges(options: PlanningPopulationOptions = {}): PlanningPopulationRanges {
  const values = { ...options };
  migratePopulationRanges(values);
  const result = {
    villageMin: values.villageMin ?? 1,
    villageMax: values.villageMax ?? 10,
    buildingMin: values.buildingMin ?? 0,
    buildingMax: values.buildingMax ?? 20
  };
  if (!Object.values(result).every((value) => Number.isSafeInteger(value) && value >= 0))
    throw new Error("村庄与建筑数量范围须为非负整数");
  if (result.villageMin > result.villageMax || result.buildingMin > result.buildingMax)
    throw new Error("数量范围下限须不大于上限");
  return result;
}
