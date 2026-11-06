import type { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { planningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { planningAlphamap } from "@galacean/engine-world-planning/semantic-study/PlanningAlphamap";
import { planningSeedWorldDataSnapshot } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedWorldData";
import { planningQueryDataOwner } from "@galacean/engine-world-planning/spatial/PlanningQueryDataOwner";
import { createPlanningWaterQuery, planningWaterRegions } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterQueries";

/** Water queries follow the accepted result; non-water data belongs to the retained full plan. */
export function planningSpatialSnapshotReader(session: Pick<PlanningSession, "result">) {
  let result: PlanningSession["result"];
  let snapshot: ReturnType<typeof compile>;
  function compile() {
    if (!session.result) throw new Error("Planning draft is not ready");
    const source = session.result.plan;
    const retained = planningQueryDataOwner(source);
    const { plan, fields, population } = planningSeedWorldDataSnapshot(retained, () => ({
      height: planningHeightmap(retained), alpha: planningAlphamap(retained)
    }));
    const height = planningHeightmap(source);
    const queryWater = createPlanningWaterQuery(source, height.sample);
    return { plan, fields, population, queryWater, queryWaterRegions: (kind: "ocean" | "river" | "lake", limit: number) => planningWaterRegions(source, kind, limit) };
  }
  return () => {
    if (result !== session.result || !snapshot) { snapshot = compile(); result = session.result; }
    return snapshot;
  };
}
