import { publishNaturalVegetation } from "../../planning-data/NaturalVegetationProfile";
import { worldTemplateEcology } from "../WorldTemplateEcology";
import { isGlobalRoadId } from "./RoadIdentity";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { overlap } from "../../semantic-study/WorldPlanningGeometry";
import { footprintLookup } from "./FootprintLookup";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { SemanticResult, SemanticRecipe, PlanningCheck } from "../../semantic-study/WorldPlanningContract";
import { defaultPoiLayout } from "../../semantic-study/PoiDistribution";
import {
  prepareLandscapeBasemap,
  revealLandscapeBasemap,
  type LandscapeBasemap
} from "../../semantic-study/ContextLandscape";
import { poiTerritories } from "../ecology/PoiTerritories";
import { planFlowerRegions } from "../ecology/FlowerRegions";
import { flowerShape } from "../ecology/FlowerShape";
import { prepareGuidanceEcology } from "../guidance/GuidanceEcology";
import { wayfindingPolicy } from "../guidance/WayfindingPolicy";
import { GUIDANCE_GENERATION_VERSION, guidanceBudgetCheck, planVisualGuidance } from "../guidance/VisualGuidance";
import type { PlanningDocument } from "../PlanningDocument";
import { boxOutline, bounds, intersects, sameVolumeFootprint, type Bounds, type Volume } from "./Volumes";

/** Explicit stage inputs. Derived systems may publish only their own population/coverage/guidance outputs. */
export interface EnvironmentContext {
  plan: IslandPlan;
  recipe: SemanticRecipe;
  document: PlanningDocument;
  previous?: SemanticResult;
  compatible: boolean;
  terrainChanged: boolean;
  value: (id: string, type: string) => Record<string, unknown>;
  ground: (point: PlanPoint) => number;
  geometryBounds?: Bounds;
  volumeBounds?: Bounds[];
  /** Guidance probes observe ecological geometry too; stale reports cannot survive changed probe inputs. */
  guidanceEnvironmentChanged?: boolean;
  timings?: Record<string, number>;
  landscapeBase?: LandscapeBasemap;
}

/** Regional height/habitat edits affect the proposals owned by those regions.
 * Proposal thinning reads neighbour positions/priorities, never neighbour dimensions;
 * createSlots supplies the complete finite halo even for rejected neighbours.
 */
function localLandscapeArea(context: EnvironmentContext): Bounds | undefined {
  const { plan, previous, recipe } = context;
  if (!previous || JSON.stringify(recipe.parameters) !== JSON.stringify(previous.recipe.parameters)) return;
  const points: PlanPoint[] = [];
  const territories = new Map(poiTerritories(plan).map((t) => [t.poiId, t]));
  for (const id of new Set([...Object.keys(recipe.edits), ...Object.keys(previous.recipe.edits)])) {
    const a = previous.recipe.edits[id] ?? {},
      b = recipe.edits[id] ?? {};
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (JSON.stringify({ ...a, landscape: undefined }) !== JSON.stringify({ ...b, landscape: undefined })) return;
    const territory = territories.get(id);
    const domain = plan.poiDistribution!.domains.find((d) => d.id === (territory?.domainId ?? id));
    if (!domain) return;
    if (territory) {
      const cell = bounds(territory.outline),
        land = bounds(domain.outline);
      points.push(
        { x: Math.max(cell.x0, land.x0), z: Math.max(cell.z0, land.z0) },
        { x: Math.min(cell.x1, land.x1), z: Math.min(cell.z1, land.z1) }
      );
    } else points.push(...domain.outline);
  }
  return points.length ? bounds(points) : undefined;
}
/** Rebuild influenced ecological candidates; keep unaffected area outputs and return its dirty bounds. */
export function updateSpatialEcology(
  context: EnvironmentContext,
  changedVolumes: Volume[],
  removedVolumes: Volume[]
): Bounds | undefined {
  const stageStarted = performance.now();
  const { plan, recipe, previous, compatible, terrainChanged } = context;
  const p = recipe.parameters,
    config = worldTemplateEcology(p.worldTemplate?.id, p.poiLayout ?? defaultPoiLayout());
  const initialFlowers = plan.flowerRegions;
  const oldVolumes = new Map(
    previous?.plan.spatialLayout?.groups.flatMap((g) => g.volumes.map((v) => [v.id, v] as const))
  );
  const changedFootprints = changedVolumes.filter((v) => !sameVolumeFootprint(v, oldVolumes.get(v.id)));
  const geometryChanged = changedFootprints.length > 0 || removedVolumes.length > 0;
  const flowersInput = (r: typeof recipe) =>
    JSON.stringify([
      r.parameters.flowers,
      r.parameters.poiLayout?.landscape.boundaryBlendM,
      Object.entries(r.edits)
        .filter(([, e]) => e.flowers || e.flowerInfluence)
        .map(([id, e]) => [id, e.flowers, e.flowerInfluence])
    ]);
  const oldRoutes = new Map(previous?.plan.routes.map((r) => [r.id, r]));
  const currentRouteIds = new Set(plan.routes.map((r) => r.id));
  const changedRoutes = plan.routes.filter((r) => {
    const old = oldRoutes.get(r.id);
    return old !== r && JSON.stringify(old?.outline ?? old?.points) !== JSON.stringify(r.outline ?? r.points);
  });
  const removedRoutes = previous?.plan.routes.filter((r) => !currentRouteIds.has(r.id)) ?? [];
  const dirtyPoints = [...changedFootprints, ...removedVolumes].flatMap((v) => v.boxes.flatMap(boxOutline));
  for (const route of [...changedRoutes, ...removedRoutes])
    for (const point of route.outline ?? route.points) dirtyPoints.push(point);
  const dirty = dirtyPoints.length ? bounds(dirtyPoints) : undefined;
  context.geometryBounds = dirty;
  context.volumeBounds = [...changedVolumes, ...removedVolumes].map((v) => bounds(v.boxes.flatMap(boxOutline)));
  // A geometry change can alter decay throughout the owning cell. Include its cell
  // instead of inventing a metre radius from a dimensionless percentage.
  if (dirty)
    for (const territory of poiTerritories(plan)) {
      if (!territory.outline.length || !intersects(bounds(territory.outline), dirty)) continue;
      const domain = plan.poiDistribution?.domains.find((d) => d.id === territory.domainId);
      const cell = bounds(territory.outline),
        land = domain ? bounds(domain.outline) : cell;
      dirtyPoints.push(
        { x: Math.max(cell.x0, land.x0), z: Math.max(cell.z0, land.z0) },
        { x: Math.min(cell.x1, land.x1), z: Math.min(cell.z1, land.z1) }
      );
    }
  const ecologyBounds = dirtyPoints.length ? bounds(dirtyPoints) : undefined;
  const influenceM = 32;
  const area = ecologyBounds
    ? {
        x0: ecologyBounds.x0 - influenceM,
        z0: ecologyBounds.z0 - influenceM,
        x1: ecologyBounds.x1 + influenceM,
        z1: ecologyBounds.z1 + influenceM
      }
    : undefined;
  // Only rocks affect flower masks. Trees are deferred candidates, never unvalidated
  // physical objects in the plan. Guidance footprints filter them before reveal.
  const previousBase = previous?.plan.spatialLayout?.landscapeBase;
  const localArea =
    compatible &&
    !terrainChanged &&
    !geometryChanged &&
    !changedRoutes.length &&
    !removedRoutes.length &&
    previousBase?.candidateSlots
      ? localLandscapeArea(context)
      : undefined;
  const base = (context.landscapeBase = prepareLandscapeBasemap(
    plan,
    config.landscape,
    recipe.edits,
    undefined,
    localArea ? { base: previousBase!, area: localArea } : undefined
  ));
  plan.landscapes = (plan.landscapes ?? []).filter((p) => p.role === "poi");
  plan.naturalVegetation = publishNaturalVegetation(plan, config.landscape, recipe.edits);
  if (context.timings) context.timings["ecology.landscape"] = performance.now() - stageStarted;
  const flowerStarted = performance.now();
  const baseChanged = previous?.plan.spatialLayout?.landscapeBase?.signature !== base.signature;
  // Trees are not flower obstacles. A local tree-height edit must not rebuild every flower region.
  const rocksChanged =
    baseChanged &&
    JSON.stringify(base.candidateSlots?.filter((p) => p.kind === "rock")) !==
      JSON.stringify(previousBase?.candidateSlots?.filter((p) => p.kind === "rock"));
  const flowersChanged =
    !compatible || terrainChanged || rocksChanged || flowersInput(recipe) !== flowersInput(previous!.recipe);
  if (flowersChanged || geometryChanged || changedRoutes.length || removedRoutes.length) {
    const owners = new Set(
      poiTerritories(plan)
        .filter((t) => area && t.outline.length && intersects(bounds(t.outline), area))
        .map((t) => t.poiId)
    );
    for (const flower of plan.flowerRegions ?? [])
      if (area && intersects(bounds(flower.outline), area)) owners.add(flower.ownerId);
    plan.flowerRegions = planFlowerRegions(
      plan,
      p.flowers,
      recipe.edits,
      config.landscape.boundaryBlendM,
      flowerShape,
      !flowersChanged ? { owners, previous: plan.flowerRegions ?? [] } : undefined,
      base.slots.filter((p) => p.kind === "rock")
    );
  }
  if (context.timings) context.timings["ecology.flowers"] = performance.now() - flowerStarted;
  // Regional ambient trees yield to accepted road masses; their dimensions
  // cannot change placement. Reapply exact ecological exclusions below instead.
  context.guidanceEnvironmentChanged =
    (baseChanged && (!localArea || rocksChanged)) || initialFlowers !== plan.flowerRegions;
  return area;
}

/** Finish generation before applying content visibility and unconstrained instance edits. */
export function revealSpatialEcology(context: EnvironmentContext): LandscapeBasemap | undefined {
  if (!context.landscapeBase) return;
  const { plan, recipe } = context;
  const members = new Set(plan.visualGuidance?.flatMap((g) => g.memberIds));
  const masses = [...plan.rocks, ...(plan.landscapes ?? [])].filter((p) => members.has(p.id));
  const massesAt = footprintLookup(masses, (p) => p.outline);
  const base: LandscapeBasemap = {
    ...context.landscapeBase,
    slots: [
      ...context.landscapeBase.slots.filter(
        (p) => !massesAt(p.center, Math.hypot(p.width, p.depth) / 2).some((m) => overlap(p.outline, m.outline))
      ),
      ...(plan.landscapes ?? []).filter((p) => members.has(p.id) && p.role === "ambient")
    ]
  };
  const config = worldTemplateEcology(
    recipe.parameters.worldTemplate?.id,
    recipe.parameters.poiLayout ?? defaultPoiLayout()
  );
  plan.landscapes = revealLandscapeBasemap(plan, base, config.landscape, recipe.edits);
  return base;
}

/** Reuse unaffected road guidance, rebuild changed relations, and reconcile their ecological exclusions. */
export function updateSpatialGuidance(context: EnvironmentContext, area: Bounds | undefined): PlanningCheck[] {
  const { plan, recipe, previous, compatible, terrainChanged } = context;
  const p = recipe.parameters,
    checks: PlanningCheck[] = [];
  const ecologyOrder = new Map(plan.landscapes?.map((item, index) => [item.id, index]));
  const intents = plan.routes
    .filter((route) => isGlobalRoadId(route.id))
    .map((route) => {
      const edge = plan.roadNetwork?.edges.find((edge) => edge.routeId === route.id);
      return {
        id: route.id,
        points: route.points,
        fromPoi: edge && plan.roadNetwork?.nodes.find((node) => node.id === edge.a)?.poiId,
        toPoi: edge && plan.roadNetwork?.nodes.find((node) => node.id === edge.b)?.poiId,
        strength: 1,
        policy: wayfindingPolicy(p.wayfinding, recipe.edits[route.id]?.wayfinding)
      };
    });
  const routeInputs = new Map(intents.map((intent) => [intent.id, JSON.stringify([intent.points, intent.policy])]));
  // A moved/resized supplement is a publication override, never the next generation's obstacle.
  const guidanceRocks = previous?.plan.spatialLayout?.baselineGuidanceRocks ?? [];
  const oldPolicy = (id: string) =>
    wayfindingPolicy(previous?.recipe.parameters.wayfinding, previous?.recipe.edits[id]?.wayfinding);
  const changedRoadFootprints = plan.routes
    .filter(
      (r) =>
        r.outline &&
        JSON.stringify(r.outline) !== JSON.stringify(previous?.plan.routes.find((o) => o.id === r.id)?.outline)
    )
    .map((r) => ({ bounds: bounds(r.outline!), query: createPlanningRingQuery(r.outline!) }));
  const waterRings = plan.waters.map((w) => createPlanningRingQuery(w.outline));
  const kept =
    compatible &&
    !!previous?.plan.spatialLayout?.baselineGuidanceRocks &&
    !terrainChanged &&
    !context.guidanceEnvironmentChanged
      ? (previous!.plan.visualGuidance ?? []).filter((g) => {
          if (g.collisionPolicyVersion !== GUIDANCE_GENERATION_VERSION) return false;
          if (
            guidanceRocks.some(
              (r) => g.memberIds.includes(r.id) && waterRings.some((w) => w.overlapsPolygon(r.outline))
            )
          )
            return false;
          const oldRoute = previous!.plan.routes.find((r) => r.id === g.sourceId);
          if (!oldRoute || !routeInputs.has(g.sourceId)) return false;
          // A changed route invalidates its own intent below. Only touched solids can
          // invalidate neighbouring unchanged guidance, not the union of whole road extents.
          if (
            context.volumeBounds?.some((b) =>
              intersects(
                bounds(
                  g.points,
                  Math.max(
                    10,
                    oldPolicy(g.sourceId).corridorWidthM / 2 +
                      oldPolicy(g.sourceId).massWidthM +
                      oldPolicy(g.sourceId).massDepthM
                  )
                ),
                b
              )
            )
          )
            return false;
          if (
            guidanceRocks.some(
              (rock) =>
                g.memberIds.includes(rock.id) &&
                changedRoadFootprints.some(
                  (r) => intersects(bounds(rock.outline), r.bounds) && r.query.overlapsPolygon(rock.outline)
                )
            )
          )
            return false;
          return routeInputs.get(g.sourceId) === JSON.stringify([oldRoute.points, oldPolicy(g.sourceId)]);
        })
      : [];
  const keptIds = new Set(kept.flatMap((g) => g.memberIds));
  plan.rocks.push(...guidanceRocks.filter((r) => keptIds.has(r.id)));
  plan.landscapes?.push(...(previous?.plan.spatialLayout?.baselineLandscapes?.filter((p) => keptIds.has(p.id)) ?? []));
  const ecologicalYield = prepareGuidanceEcology(plan, keptIds);
  // Replay footprints in their original acceptance order, not the sorted render arrays.
  // Overlapping footprints must retain which member first claimed each ecology exclusion.
  const members = new Map([...plan.rocks, ...(plan.landscapes ?? [])].map((member) => [member.id, member]));
  const keptReports = kept.map((g) => ({
    ...g,
    ecologyExclusions: g.memberIds.flatMap((id) => {
      const member = members.get(id);
      return member ? ecologicalYield.exclude(member.outline) : [];
    })
  }));
  checks.push(
    ...keptReports.map(guidanceBudgetCheck),
    ...planVisualGuidance(
      plan,
      intents.filter((i) => !kept.some((g) => g.sourceId === i.id))
    ).map((c) => ({ ...c, required: false }))
  );
  plan.visualGuidance = [...keptReports, ...(plan.visualGuidance ?? [])].sort((a, b) =>
    a.sourceId.localeCompare(b.sourceId)
  );
  plan.rocks.sort((a, b) => a.id.localeCompare(b.id));
  plan.landscapes?.sort((a, b) => a.id.localeCompare(b.id));
  for (const report of plan.visualGuidance) {
    // Reconcile source order without running optional horizon measurements.
    report.ecologyExclusions = report.ecologyExclusions
      .map((item) => ({ ...item, originalIndex: ecologyOrder.get(item.element.id) ?? item.originalIndex }))
      .sort((a, b) => a.originalIndex - b.originalIndex);
  }
  return checks;
}
