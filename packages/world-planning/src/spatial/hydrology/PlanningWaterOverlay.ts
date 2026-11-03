import { flowerInfluenceSources, resolveFlowerInfluence } from "../ecology/FlowerInfluences";
import { applyLandscapeInstanceEdits } from "../layout/SpatialInstanceEdits";
import { refreshGuidanceEcologyModule } from "../guidance/GuidanceEcology";
import { footprintLookup } from "../layout/FootprintLookup";
import { overlap } from "../../semantic-study/WorldPlanningGeometry";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { SemanticResult } from "../../semantic-study/WorldPlanningContract";
import { defaultPoiLayout } from "../../semantic-study/PoiDistribution";
import {
  compilePlanningWaterHeightmap,
  cachedPlanningHeightmap,
  planningHeightmap,
  planningHeightmapWork,
  inheritPlanningHeightmap,
  type PlanningHeightmap,
  type PlanningHeightBounds
} from "../../semantic-study/PlanningHeightmap";
import {
  landscapeWaterInfluence,
  prepareLandscapeBasemap,
  revealLandscapeBasemap
} from "../../semantic-study/ContextLandscape";
import { exportPlanningRecipe, type PlanningDocument } from "../PlanningDocument";
import { generateSpatialWorld } from "../layout/SpatialWorld";
import { bounds, intersects } from "../layout/Volumes";
import { poiTerritories } from "../ecology/PoiTerritories";
import { planFlowerRegions } from "../ecology/FlowerRegions";
import { excludePlanningFarmLandscape } from "../farming/PlanningFarmingLayout";
import { compileAuthoredLakes } from "./AuthoredLakes";
import { compileAuthoredRivers } from "./AuthoredRivers";

/** Derived provenance only; author files persist intent and the semantic version. */
export interface PlanningWaterOverlayState {
  mode: "overlay" | "legacy";
  baseSignature: string;
  reason: string;
  bounds: readonly PlanningHeightBounds[];
  dirtyWaterIds: string[];
}
const bases = new Map<string, SemanticResult>();
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  return value;
}
function baseDocument(document: PlanningDocument): PlanningDocument {
  const result = structuredClone(document);
  delete result.waterAuthoringVersion;
  delete result.placementState;
  delete result.layoutOverrides;
  result.revision = 0;
  result.authoredResources = (result.authoredResources ?? []).filter(
    (r) => r.resourceType !== "water-body" && r.resourceType !== "river"
  );
  return result;
}
function waterSupport(plan: IslandPlan, map: PlanningHeightmap): PlanningHeightBounds[] {
  // The broad-relief river grade limiter has unbounded support. Preserve its algorithm.
  if (plan.authoredResources?.some((r) => r.resourceType === "river"))
    return [[0, 0, plan.parameters.width, plan.parameters.depth]];
  return (plan.authoredResources ?? []).flatMap((r) =>
    r.resourceType === "water-body"
      ? [
          [
            r.properties.x - r.properties.radiusMetres * 1.5 - map.spacingX,
            r.properties.z - r.properties.radiusMetres * 1.5 - map.spacingZ,
            r.properties.x + r.properties.radiusMetres * 1.5 + map.spacingX,
            r.properties.z + r.properties.radiusMetres * 1.5 + map.spacingZ
          ] as PlanningHeightBounds
        ]
      : []
  );
}
function applyLayer(
  document: PlanningDocument,
  base: SemanticResult,
  signature: string,
  previous: SemanticResult | undefined,
  progress?: (stage: string) => void,
  baseReused = true
): SemanticResult {
  const started = performance.now(),
    recipe = exportPlanningRecipe(document);
  const plan: IslandPlan = {
    ...base.plan,
    authoredWaterLayer: 1,
    authoredResources: structuredClone(document.authoredResources ?? []),
    waters: [...base.plan.waters],
    planning: base.plan.planning && {
      ...base.plan.planning,
      profiles: [...base.plan.planning.profiles],
      revision: document.revision
    }
  };
  compileAuthoredRivers(plan);
  compileAuthoredLakes(plan);
  const support = waterSupport(plan, planningHeightmap(base.plan));
  progress?.("更新作者水体地形采样");
  const heightStarted = performance.now(),
    heightCached = !!cachedPlanningHeightmap(plan);
  const height = compilePlanningWaterHeightmap(plan, planningHeightmap(base.plan), support);
  const timings: Record<string, number> = {
    "waterOverlay.height.wall": performance.now() - heightStarted,
    "waterOverlay.height.cacheHit": Number(heightCached)
  };
  for (const [key, value] of Object.entries(heightCached ? {} : (planningHeightmapWork(height)?.timings ?? {})))
    timings["waterOverlay.height." + key] = value;
  const ecologyStarted = performance.now(),
    config = recipe.parameters.poiLayout ?? defaultPoiLayout();
  const candidates = base.plan.spatialLayout?.landscapeBase;
  if (support.length && candidates) {
    progress?.("更新作者水体局部生态");
    const halo = landscapeWaterInfluence(plan, config.landscape, recipe.edits);
    const area = bounds(
      support.flatMap(([x0, z0, x1, z1]) => [
        { x: x0, z: z0 },
        { x: x1, z: z1 }
      ]),
      halo
    );
    const inside = (p: { x: number; z: number }) =>
      p.x >= area.x0 && p.x <= area.x1 && p.z >= area.z0 && p.z <= area.z1;
    const scoped = prepareLandscapeBasemap(plan, config.landscape, recipe.edits, area);
    const protectedIds = new Set(base.plan.visualGuidance?.flatMap((g) => g.memberIds));
    const proposals = [
      ...candidates.slots.filter((slot) => protectedIds.has(slot.id) || !inside(slot.center)),
      ...scoped.slots.filter((slot) => !protectedIds.has(slot.id))
    ].sort((a, b) => a.id.localeCompare(b.id));
    const masses = [...base.plan.rocks, ...(base.plan.landscapes ?? [])].filter((p) => protectedIds.has(p.id));
    const massesAt = footprintLookup(masses, (p) => p.outline);
    const slots = proposals.filter(
      (p) =>
        protectedIds.has(p.id) ||
        !massesAt(p.center, Math.hypot(p.width, p.depth) / 2).some((m) => overlap(p.outline, m.outline))
    );
    plan.landscapes = [
      ...(base.plan.spatialLayout?.baselineLandscapes ?? base.plan.landscapes ?? []).filter((p) => p.role === "poi"),
      ...slots.flatMap((p) => (p.baseHeight === undefined ? [] : [{ ...p, baseHeight: p.baseHeight }]))
    ];
    const landscapeBase = {
      signature: signature + scoped.signature,
      slots,
      weights: Object.fromEntries(
        slots
          .map((slot) => [slot.id, scoped.weights[slot.id] ?? candidates.weights[slot.id]])
          .filter(([, weight]) => !!weight)
      )
    };
    plan.spatialLayout = { ...base.plan.spatialLayout!, landscapeBase };
    const owners = new Set(
      poiTerritories(plan)
        .filter((t) => t.outline.length && intersects(bounds(t.outline), area))
        .map((t) => t.poiId)
    );
    for (const source of flowerInfluenceSources(plan)) {
      const influence = resolveFlowerInfluence(source, {}, recipe.edits[source.id]?.flowerInfluence);
      if (source.regionOwner && influence.enabled && intersects(bounds(source.outline, influence.bandM), area))
        owners.add(source.id);
    }
    for (const flower of base.plan.flowerRegions ?? [])
      if (flower.outline.length && intersects(bounds(flower.outline), area)) owners.add(flower.ownerId);
    plan.flowerRegions = planFlowerRegions(
      plan,
      recipe.parameters.flowers,
      recipe.edits,
      config.landscape.boundaryBlendM,
      undefined,
      { owners, previous: base.plan.flowerRegions ?? [] },
      slots.filter((p) => p.kind === "rock")
    );
    plan.landscapes = revealLandscapeBasemap(plan, landscapeBase, config.landscape, recipe.edits);
    excludePlanningFarmLandscape(plan);
    applyLandscapeInstanceEdits(plan, document, height.sample);
    refreshGuidanceEcologyModule(plan);
  }
  if (!support.length && plan.spatialLayout) plan.spatialLayout = { ...plan.spatialLayout };
  timings["waterOverlay.ecology"] = performance.now() - ecologyStarted;
  const oldAuthors = previous?.plan.authoredResources ?? [],
    authors = plan.authoredResources ?? [];
  const ids = new Set(
    [...oldAuthors, ...authors]
      .filter((r) => r.resourceType === "water-body" || r.resourceType === "river")
      .map((r) => r.resourceId)
  );
  const dirtyWaterIds = [...ids].filter(
    (id) =>
      JSON.stringify(oldAuthors.find((r) => r.resourceId === id)) !==
      JSON.stringify(authors.find((r) => r.resourceId === id))
  );
  const changedIds = [...dirtyWaterIds];
  if (plan.planning) plan.planning.changedIds = changedIds;
  const hot =
    baseReused && previous?.waterOverlay?.mode === "overlay" && previous.waterOverlay.baseSignature === signature;
  const reason = hot
    ? authors.some((r) => r.resourceType === "river")
      ? "authored-river-unbounded-support"
      : "author-water-only"
    : "base-changed-or-cold";
  const waterOverlay: PlanningWaterOverlayState = {
    mode: "overlay",
    baseSignature: signature,
    reason,
    bounds: support,
    dirtyWaterIds
  };
  timings.total = performance.now() - started;
  const checks = [...base.checks];
  if (plan.planning) plan.planning.checks = checks;
  return {
    recipe,
    plan,
    accepted: base.accepted,
    checks,
    notes: [...base.notes],
    changedIds,
    execution: hot ? "water-overlay" : "full",
    timings,
    waterOverlay
  };
}
function difference(legacy: SemanticResult, overlay: SemanticResult): string | undefined {
  for (const key of [
    "waters",
    "planning",
    "routes",
    "roadApproaches",
    "buildings",
    "rocks",
    "roadGraph",
    "roadNetwork",
    "farming",
    "visualGuidance",
    "landscapes",
    "flowerRegions"
  ] as const) {
    // Planning diagnostics/revisions describe execution, not geometry.
    const geometry = (r: SemanticResult) => (key === "planning" ? r.plan.planning?.profiles : r.plan[key]);
    if (JSON.stringify(canonical(geometry(legacy))) !== JSON.stringify(canonical(geometry(overlay)))) return key;
  }
  const a = planningHeightmap(legacy.plan),
    b = planningHeightmap(overlay.plan);
  if (
    a.resolution !== b.resolution ||
    a.spacingX !== b.spacingX ||
    a.spacingZ !== b.spacingZ ||
    a.heights.some((height, i) => height !== b.heights[i])
  )
    return "canonical-float32-bed";
  return undefined;
}
/** Resolve the independent global plan once; author-only changes never enter its solver. */
export function generateWaterOverlay(
  document: PlanningDocument,
  previous?: SemanticResult,
  progress?: (stage: string) => void,
  runtimeSignature = ""
): SemanticResult {
  if (document.waterAuthoringVersion !== undefined && document.waterAuthoringVersion !== 1)
    throw Error("Unsupported water authoring version");
  const input = baseDocument(document),
    signature = JSON.stringify([runtimeSignature, canonical(input)]);
  const authored = document.authoredResources?.some(
    (r) => r.resourceType === "water-body" || r.resourceType === "river"
  );
  if (!document.waterAuthoringVersion && previous?.waterOverlay?.mode === "legacy") {
    const legacy = generateSpatialWorld(document, previous, progress);
    legacy.waterOverlay = {
      mode: "legacy",
      baseSignature: signature,
      reason: previous.waterOverlay.reason,
      bounds: [],
      dirtyWaterIds: []
    };
    return legacy;
  }
  let base = bases.get(signature);
  const baseReused = !!base;
  if (base) {
    bases.delete(signature);
    bases.set(signature, base);
  }
  if (!base) {
    base = generateSpatialWorld(
      input,
      previous?.waterOverlay?.mode === "overlay" ? bases.get(previous.waterOverlay.baseSignature) : undefined,
      progress
    );
    bases.set(signature, base);
    if (bases.size > 2) bases.delete(bases.keys().next().value!);
  }
  if (
    !authored &&
    !previous?.plan.authoredResources?.some((r) => r.resourceType === "water-body" || r.resourceType === "river")
  ) {
    const checks = [...base.checks];
    const plan = {
      ...base.plan,
      authoredResources: structuredClone(document.authoredResources ?? []),
      planning: base.plan.planning && { ...base.plan.planning, revision: document.revision, checks }
    };
    inheritPlanningHeightmap(plan, base.plan);
    return {
      ...base,
      recipe: exportPlanningRecipe(document),
      plan,
      checks,
      changedIds: [...base.changedIds],
      notes: [...base.notes],
      timings: base.timings && { ...base.timings },
      waterOverlay: {
        mode: "overlay",
        baseSignature: signature,
        reason: "independent-base",
        bounds: [],
        dirtyWaterIds: []
      }
    };
  }
  const overlay = applyLayer(document, base, signature, previous, progress, baseReused);
  if (document.waterAuthoringVersion || !authored) return overlay;
  const legacy = generateSpatialWorld(document, previous, progress);
  const mismatch =
    difference(legacy, overlay) ??
    difference(generateSpatialWorld(document), applyLayer(document, base, signature, undefined));
  if (!mismatch) return overlay;
  legacy.waterOverlay = {
    mode: "legacy",
    baseSignature: signature,
    reason: "legacy-difference:" + mismatch,
    bounds: [],
    dirtyWaterIds: []
  };
  return legacy;
}
