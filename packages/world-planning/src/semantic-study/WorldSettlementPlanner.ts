import { VolumeIndex } from "../spatial/layout/Volumes";
import { importPlanningDocument } from "../spatial/PlanningDocument";
import { generatePlanningDocument } from "../spatial/PlanningRuntime";
import {
  SEMANTIC_DEFAULTS,
  type SemanticParameters,
  type SemanticEdit,
  type SemanticResult,
  type PlanningCheck
} from "./WorldPlanningContract";
import type { IslandPlan } from "./IslandPlanModel";
/** Recipe adapter for callers predating PlanningDocument. All current generation runs through spatial rules.
 * Legacy geometry-mutation callbacks are rejected; register a LayoutRule plugin instead.
 */
export function generateSettlementWorld(
  parameters: Partial<SemanticParameters> = {},
  edits: Record<string, SemanticEdit> = {},
  previous?: SemanticResult,
  options: {
    forceFull?: boolean;
    afterDistribution?: (plan: IslandPlan) => PlanningCheck[];
    beforeNetwork?: (plan: IslandPlan) => PlanningCheck[];
    afterLandscape?: (plan: IslandPlan) => PlanningCheck[];
  } = {}
): SemanticResult {
  if (options.afterDistribution || options.beforeNetwork || options.afterLandscape)
    throw new Error("旧生成回调已移除，请注册空间布局规则");
  return generatePlanningDocument(
    importPlanningDocument({ version: 2, parameters: { ...SEMANTIC_DEFAULTS, ...parameters }, edits }),
    options.forceFull ? undefined : previous
  );
}

/** Validate declared volume exclusions in a published snapshot. Roads/regions are not layout vetoes. */
export function validateSettlementPlan(plan: IslandPlan): PlanningCheck[] {
  const groups = plan.spatialLayout?.groups ?? [],
    index = new VolumeIndex(plan.spatialLayout?.exclusions ?? []);
  const volumes = groups.flatMap((g) => g.volumes);
  volumes.forEach((v) => index.set(v));
  return volumes.map((v) => {
    const conflicts = index.conflicts(v);
    return {
      id: `volume:${v.id}`,
      rule: "volume-exclusion",
      owners: [v.id, ...conflicts],
      required: true,
      status: conflicts.length ? ("fail" as const) : ("pass" as const),
      message: conflicts.length ? "声明互斥的体量发生相交" : "已满足声明的互斥关系"
    };
  });
}
