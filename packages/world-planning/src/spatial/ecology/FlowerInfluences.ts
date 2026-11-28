import rules from "../../planning-data/flower-influences.json";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { SemanticEdit } from "../../semantic-study/WorldPlanningContract";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { polygonBounds } from "../../semantic-study/WorldPlanningGeometry";

/** Retained only to read saved recipes; new authoring uses source-bound influences. */
export interface LegacyFlowerContext {
  roadBandM?: number;
  roadMultiplier?: number;
  plazaMultiplier?: number;
  backgroundMultiplier?: number;
}
/** One source footprint influences surrounding flower coverage without changing flower shape. */
export interface FlowerInfluence {
  enabled: boolean;
  bandM: number;
  multiplier: number;
  falloff: number;
}
export interface FlowerInfluenceSource {
  id: string;
  outline: PlanPoint[];
  regionOwner: boolean;
  label: string;
  defaults: FlowerInfluence;
  legacyBand?: string;
  legacyMultiplier?: string;
}
/** Bind recipe rules to concrete geometry. Adding a source collection does not change the field evaluator. */
export function flowerInfluenceSources(plan: IslandPlan): FlowerInfluenceSource[] {
  return rules.bindings.flatMap((binding) => {
    const objects =
      (plan as unknown as Record<string, { id: string; outline?: PlanPoint[] }[]>)[binding.collection] ?? [];
    return objects
      .filter((o) => o.outline?.length)
      .map((o) => ({
        id: o.id,
        outline: o.outline!,
        regionOwner: binding.regionOwner,
        label: binding.label,
        defaults: { enabled: true, bandM: binding.bandM, multiplier: binding.multiplier, falloff: binding.falloff },
        legacyBand: binding.legacyBand,
        legacyMultiplier: binding.legacyMultiplier
      }));
  });
}
/** Source-local overrides take precedence over compatible historical regional rules. */
export function resolveFlowerInfluence(
  source: FlowerInfluenceSource,
  legacy: LegacyFlowerContext,
  edit?: Partial<FlowerInfluence>
): FlowerInfluence {
  const values = legacy as Record<string, number | undefined>;
  return {
    ...source.defaults,
    ...(source.legacyBand && values[source.legacyBand] !== undefined ? { bandM: values[source.legacyBand] } : {}),
    ...(source.legacyMultiplier && values[source.legacyMultiplier] !== undefined
      ? { multiplier: values[source.legacyMultiplier] }
      : {}),
    ...edit
  } as FlowerInfluence;
}
type PreparedSource = FlowerInfluenceSource & {
  query: ReturnType<typeof createPlanningRingQuery>;
  bounds: ReturnType<typeof polygonBounds>;
};
interface ResolvedSource {
  source: PreparedSource;
  influence: FlowerInfluence;
}
/** A conservative broad phase only. Exact polygon tests below determine every value and ownership tie. */
function influenceCandidates(entries: ResolvedSource[]): (point: PlanPoint) => readonly ResolvedSource[] {
  const cellSize = 64,
    cells = new Map<string, ResolvedSource[]>();
  const empty: readonly ResolvedSource[] = [];
  for (const entry of entries) {
    const { bounds } = entry.source,
      radius = entry.influence.bandM;
    const minX = Math.floor((bounds.minX - radius) / cellSize),
      maxX = Math.floor((bounds.maxX + radius) / cellSize),
      minZ = Math.floor((bounds.minZ - radius) / cellSize),
      maxZ = Math.floor((bounds.maxZ + radius) / cellSize);
    // Legacy recipes may contain unusually broad bands. Keep their exact behavior without unbounded indexing.
    if (!Number.isFinite(minX + maxX + minZ + maxZ) || (maxX - minX + 1) * (maxZ - minZ + 1) > 4096)
      return () => entries;
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++) {
        const key = `${x}:${z}`,
          bucket = cells.get(key);
        if (bucket) bucket.push(entry);
        else cells.set(key, [entry]);
      }
  }
  // Insertion preserves source order, including equal-weight road ties and first-owner selection.
  return (point) => cells.get(`${Math.floor(point.x / cellSize)}:${Math.floor(point.z / cellSize)}`) ?? empty;
}
/** Reusable footprint-distance field. Regions select ownership; overlapping proximity sources use the strongest weight. */
export function flowerInfluenceField(plan: IslandPlan, edits: Record<string, SemanticEdit>) {
  const sources: PreparedSource[] = flowerInfluenceSources(plan).map((s) => ({
    ...s,
    query: createPlanningRingQuery(s.outline),
    bounds: polygonBounds(s.outline)
  }));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const legacyKeys = [
    ...new Set(sources.flatMap((s) => [s.legacyBand, s.legacyMultiplier].filter((key): key is string => !!key)))
  ];
  interface CompiledSettings {
    byId: Map<string, FlowerInfluence>;
    owners: ReturnType<typeof influenceCandidates>;
    proximity: ReturnType<typeof influenceCandidates>;
  }
  const compiled = new Map<string, CompiledSettings>();
  // Compile one immutable solve's source rules per effective legacy configuration.
  // The key uses values, so changing a caller's legacy object cannot return stale settings.
  const settings = (legacy: LegacyFlowerContext) => {
    const values = legacy as Record<string, number | undefined>;
    let key = "";
    for (const name of legacyKeys) key += `${values[name]},`;
    let result = compiled.get(key);
    if (!result) {
      const byId = new Map(
        sources.map((source) => [source.id, resolveFlowerInfluence(source, legacy, edits[source.id]?.flowerInfluence)])
      );
      const entries = sources
        .map((source) => ({ source, influence: byId.get(source.id)! }))
        .filter((entry) => entry.influence.enabled);
      result = {
        byId,
        owners: influenceCandidates(entries.filter((entry) => entry.source.regionOwner)),
        proximity: influenceCandidates(entries.filter((entry) => !entry.source.regionOwner))
      };
      compiled.set(key, result);
    }
    return result;
  };
  const base = settings({});
  return {
    ownerAt(p: PlanPoint) {
      for (const { source, influence: q } of base.owners(p))
        if (source.query.within(p, q.bandM) && (source.query.inside(p) || source.query.distance(p, q.bandM) < q.bandM))
          return source;
      return undefined;
    },
    multiplierAt(p: PlanPoint, legacy: LegacyFlowerContext, owner?: FlowerInfluenceSource) {
      const resolved = settings(legacy);
      if (owner) {
        const q = resolved.byId.get(owner.id)!;
        if (q.falloff === 0) return q.multiplier;
        const query = sourceById.get(owner.id)!.query;
        const t = query.inside(p) ? 1 : 1 - Math.min(1, query.distance(p, q.bandM) / Math.max(0.1, q.bandM));
        const background = legacy.backgroundMultiplier ?? rules.backgroundMultiplier;
        return background + (q.multiplier - background) * Math.pow(t, q.falloff);
      }
      const background = legacy.backgroundMultiplier ?? rules.backgroundMultiplier;
      let strongest = 0,
        multiplier = background;
      for (const { source, influence: q } of resolved.proximity(p)) {
        if (!source.query.within(p, q.bandM)) continue;
        const t = source.query.inside(p)
          ? 1
          : 1 - Math.min(1, source.query.distance(p, q.bandM) / Math.max(0.1, q.bandM));
        const weight = t > 0 ? Math.pow(t, q.falloff) : 0;
        if (weight <= strongest) continue;
        strongest = weight;
        multiplier = background + (q.multiplier - background) * weight;
      }
      return multiplier;
    }
  };
}
