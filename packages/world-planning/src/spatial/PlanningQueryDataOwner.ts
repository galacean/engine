import type { IslandPlan } from "../semantic-study/IslandPlanModel";

const owners = new WeakMap<IslandPlan, IslandPlan>();
/** The full snapshot that still owns terrain/population/road query data. */
export function planningQueryDataOwner(plan: IslandPlan): IslandPlan {
  return owners.get(plan) ?? plan;
}
/** Only exact publication clones and validated simple water edits may inherit this owner. */
export function inheritPlanningQueryData(plan: IslandPlan, previous: IslandPlan): void {
  owners.set(plan, planningQueryDataOwner(previous));
}
