import type { IslandPlan } from "../semantic-study/IslandPlanModel";

export function sameMasonryPlan(a: IslandPlan, b: IslandPlan): boolean {
  return (
    JSON.stringify([a.buildings, a.courtyards, a.fences]) === JSON.stringify([b.buildings, b.courtyards, b.fences])
  );
}
