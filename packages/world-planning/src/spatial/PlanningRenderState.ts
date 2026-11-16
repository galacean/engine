import type { IslandPlan } from "../semantic-study/IslandPlanModel";

/** Preserve the publication's JSON comparison contract, stopping at the first changed field.
 * Plans contain JSON data. Checks/classifier signatures are not rendered state.
 */
export function samePlanningRenderState(before: IslandPlan, after: IslandPlan): boolean {
  if (before === after) return true;
  const normalize = (plan: IslandPlan) => ({
    ...plan,
    planning: plan.planning ? { ...plan.planning, checks: [], changedIds: [] } : plan.planning,
    spatialLayout: plan.spatialLayout && {
      ...plan.spatialLayout,
      instanceInputSignature: undefined,
      revealInputSignature: undefined
    }
  });
  const a = normalize(before),
    b = normalize(after);
  const keys = (value: typeof a) =>
    (Object.keys(value) as (keyof typeof value)[]).filter((key) => value[key] !== undefined);
  const left = keys(a),
    right = keys(b);
  if (left.length !== right.length || left.some((key, i) => key !== right[i])) return false;
  return left.every((key) => a[key] === b[key] || JSON.stringify(a[key]) === JSON.stringify(b[key]));
}
