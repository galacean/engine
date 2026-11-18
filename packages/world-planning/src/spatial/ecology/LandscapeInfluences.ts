import rules from "../../planning-data/landscape-influences.json";
import type { IslandPlan, PlanLandscape } from "../../semantic-study/IslandPlanModel";
import type { SemanticEdit } from "../../semantic-study/WorldPlanningContract";

/** Source-bound ecological rules modify the existing regional population, never its ownership or slots. */
export interface LandscapeInfluence {
  densityMultiplier: number;
  treeHeightMinM?: number;
  treeHeightMaxM?: number;
}
export const LANDSCAPE_INFLUENCE_DEFAULTS: Readonly<LandscapeInfluence> = Object.freeze({ ...rules.defaults });
export interface LandscapeInfluenceSource {
  id: string;
  context: string;
  memberIds: string[];
  defaults: LandscapeInfluence;
}

/** Bind meaningful spatial owners to the same source footprints used by context classification.
 * An assembled landform owns its constituent rock footprints without exposing every OBB as a control.
 */
export function landscapeInfluenceSources(plan: IslandPlan): LandscapeInfluenceSource[] {
  const sources = new Map<string, LandscapeInfluenceSource>();
  for (const binding of rules.bindings) {
    const objects =
      (plan as unknown as Record<string, { id: string; outline?: unknown; [key: string]: unknown }[]>)[
        binding.collection
      ] ?? [];
    for (const object of objects) {
      if (!object.outline) continue;
      const id = binding.ownerField ? String(object[binding.ownerField] ?? object.id) : object.id;
      const key = `${binding.context}:${id}`;
      let source = sources.get(key);
      if (!source)
        sources.set(
          key,
          (source = {
            id,
            context: binding.context,
            memberIds: [],
            defaults: { ...LANDSCAPE_INFLUENCE_DEFAULTS }
          })
        );
      source.memberIds.push(object.id);
    }
  }
  return [...sources.values()];
}

/** Sparse local or inherited values override source configuration. Missing height bounds follow each region. */
export function resolveLandscapeInfluence(
  source: LandscapeInfluenceSource,
  edit?: Partial<LandscapeInfluence>
): LandscapeInfluence {
  const value = {
    ...source.defaults,
    ...Object.fromEntries(Object.entries(edit ?? {}).filter(([, v]) => v !== undefined))
  };
  if (!Number.isFinite(value.densityMultiplier) || value.densityMultiplier < 0)
    throw new Error("周边景观密度倍率须为有限非负数");
  for (const height of [value.treeHeightMinM, value.treeHeightMaxM])
    if (height !== undefined && (!Number.isFinite(height) || height <= 0)) throw new Error("周边树高须为有限正数");
  if (
    value.treeHeightMinM !== undefined &&
    value.treeHeightMaxM !== undefined &&
    value.treeHeightMinM > value.treeHeightMaxM
  )
    throw new Error("周边树高下限不能超过上限");
  return value;
}

/** Compile once per solve. Context and nearest-source selection stay in ContextLandscape's geometry stage. */
export function landscapeInfluenceLookup(plan: IslandPlan, edits: Readonly<Record<string, SemanticEdit>>) {
  const values = new Map<string, LandscapeInfluence>();
  for (const source of landscapeInfluenceSources(plan)) {
    const value = resolveLandscapeInfluence(source, edits[source.id]?.landscapeInfluence);
    for (const member of source.memberIds) values.set(`${source.context}:${member}`, value);
  }
  return (item: Pick<PlanLandscape, "context" | "sourceId">): LandscapeInfluence | undefined =>
    values.get(`${item.context}:${item.sourceId}`);
}

/** Absolute local bounds override the regional range; a missing endpoint keeps the regional endpoint when feasible. */
export function landscapeInfluenceHeightRange(
  region: { treeHeightMinM: number; treeHeightMaxM: number },
  influence?: LandscapeInfluence
): { min: number; max: number } {
  const min = influence?.treeHeightMinM ?? Math.min(region.treeHeightMinM, influence?.treeHeightMaxM ?? Infinity);
  const max = influence?.treeHeightMaxM ?? Math.max(region.treeHeightMaxM, influence?.treeHeightMinM ?? 0);
  return { min, max };
}
