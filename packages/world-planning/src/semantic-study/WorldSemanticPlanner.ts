import { PLANNING_REFERENCE } from "../planning-data/PlanningReference";
import { updatePlanningLandform } from "./WorldLandformUpdate";
import { finalizeMountainSemantics } from "./WorldMountainSemantics";
import { updateVillageDensity } from "./WorldVillageDensity";
import { generateWorldLayout, WORLD_LAYOUT_MODULES } from "./WorldLayoutPlanner";
import {
  SEMANTIC_DEFAULTS,
  type SemanticParameters,
  type SemanticEdit,
  type SemanticResult,
  type PlanningCheck
} from "./WorldPlanningContract";
import { finalizeWorldValleys } from "./WorldPlanningValley";
import { finalizePlanningTerrain } from "./WorldPlanningTerrain";
import { validatePlanningWorld } from "./WorldPlanningValidation";
import { planningCorridor, refreshPlanningRouteHeights, buildPlanningVisuals } from "./WorldLayoutRoutes";
import { requestPlanningRepairs } from "./WorldPlanningCoordination";
import { ringArea } from "./WorldPlanningGeometry";
import { finalizeVillageAreaPaths } from "./WorldLayoutPlaces";
/** Visual composition and visibility are preferences, never edit vetoes.
 * Geometry, grounding and required circulation retain their original severity.
 */
export function planningCheckBlocksEdit(check: PlanningCheck): boolean {
  return check.required && check.status !== "pass" && check.rule !== "V01" && check.rule !== "V02";
}
type NumericSemanticParameter = {
  [K in keyof SemanticParameters]-?: SemanticParameters[K] extends number ? K : never;
}[keyof SemanticParameters];
const numeric = (v: number, fallback: number, min = 0, max = 1) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
/** Generate or edit a complete planning transaction, preserving the accepted map on failure.
 * @param overrides Relative global parameters; seed is an unsigned 32 bit integer.
 * @param edits Per-instance relative authoring intents.
 * @param previous Last accepted result for rollback and change evidence.
 * @param options Optional unvalidated module-stage preview callback for responsive editing.
 * @returns Requested recipe, resolved map, and independent constraint evidence.
 */
export function generateSemanticWorld(
  overrides: Partial<SemanticParameters> = {},
  edits: Record<string, SemanticEdit> = {},
  previous?: SemanticResult,
  options?: {
    landformStudy?: boolean;
    canyonStudy?: boolean;
    audit?: boolean;
    onPreview?: (plan: import("./IslandPlanModel").IslandPlan, stage: string) => void;
  }
): SemanticResult {
  const parameters = { ...SEMANTIC_DEFAULTS };
  for (const key of Object.keys(SEMANTIC_DEFAULTS) as NumericSemanticParameter[])
    if (overrides[key] !== undefined) parameters[key] = overrides[key]!;
  for (const key of Object.keys(SEMANTIC_DEFAULTS) as NumericSemanticParameter[])
    parameters[key] =
      key === "seed"
        ? Number.isInteger(parameters.seed) && parameters.seed >= 0 && parameters.seed <= 4294967295
          ? parameters.seed
          : SEMANTIC_DEFAULTS.seed
        : numeric(
            parameters[key],
            SEMANTIC_DEFAULTS[key],
            key === "crossingDetourRatio" ? 1 : 0,
            key === "crossingDetourRatio" ? 4 : 1
          );
  parameters.openness = 0;
  parameters.routeLoops = 0;
  parameters.complexity = 1;
  const normalized = structuredClone(edits);
  const localLandform =
    previous && options?.audit === false && updatePlanningLandform(parameters, normalized, previous);
  if (localLandform) return localLandform;
  const incremental = previous && updateVillageDensity(parameters, normalized, previous, options?.audit !== false);
  if (incremental) return incremental;
  for (const edit of Object.values(normalized)) delete edit.complexity;
  if (previous && previous.recipe.parameters.seed === parameters.seed) {
    for (const [id, edit] of Object.entries(normalized)) {
      if (JSON.stringify(edit) === JSON.stringify(previous.recipe.edits[id] ?? {})) continue;
      const priority = 1 + Math.max(0, ...Object.values(previous.recipe.edits).map((e) => e.placement?.priority ?? 0));
      if (edit.placement) {
        edit.placement.priority = priority;
        continue;
      }
      const module = previous.plan.planning?.modules.find((m) => m.id === id);
      if (!module) continue;
      const shape = previous.plan.shapeRecipes?.find((s) => s.id === id),
        resolved = module.resolved;
      const rock = previous.plan.rocks.find((r) => r.groupId === id && r.role === "peak");
      const water = previous.plan.waters.find((w) => w.id === id && w.centerline?.length);
      const origin =
        water?.centerline?.[0] ??
        (Number.isFinite(resolved.originX) ? { x: resolved.originX, z: resolved.originZ } : rock?.center);
      if (!origin) continue;
      edit.placement = {
        priority,
        origin: { ...origin },
        size: previous.recipe.edits[id]?.size ?? 1,
        footprints:
          module.kind === "teleport"
            ? []
            : module.kind === "mountain"
              ? previous.plan.rocks.filter((r) => r.groupId === id).map((r) => r.obb)
              : [module.outline],
        half: Number.isFinite(resolved.halfX)
          ? { x: resolved.halfX, z: resolved.halfZ }
          : shape?.boundaryBounds
            ? { x: shape.boundaryBounds.halfX, z: shape.boundaryBounds.halfZ }
            : undefined,
        end: water?.centerline?.at(-1)
      };
    }
  }
  const recipe = { version: 2 as const, parameters, edits: normalized };
  // One semantic recipe has addressed module streams. Density does not mutate the seed.
  const q = {
    landformStudy: options?.landformStudy ? 1 : 0,
    canyonStudy: options?.canyonStudy ? 1 : 0,
    globalElevation: parameters.elevation * 240,
    elevationAngle: parameters.landOrientation * Math.PI * 2 - Math.PI / 2,
    draftLayout: options?.audit === false ? 1 : 0,
    seed: parameters.seed,
    landAspect: parameters.landAspect,
    landOrientation: parameters.landOrientation,
    crossingDetourRatio: parameters.crossingDetourRatio,
    offshoreCoverage: parameters.offshoreCoverage,
    landSize: Math.max(0.2, parameters.landCoverage),
    complexity: 10,
    contourDetail: parameters.complexity,
    coast: 0.6,
    islands: Math.round(parameters.islandRichness * 4),
    mountains: 2 + Math.round(parameters.terrainRichness * 5),
    mountainWidth: PLANNING_REFERENCE.world.mountainWidthM,
    mountainHeight: PLANNING_REFERENCE.world.mountainHeightM,
    openness: parameters.openness,
    rivers: Math.max(1, Math.round(parameters.waterRichness * 3)),
    branches: 1 + Math.round(parameters.waterRichness * 4),
    riverWidth: PLANNING_REFERENCE.world.riverWidthM,
    lakeSize: PLANNING_REFERENCE.world.lakeSizeM,
    riverBend: 0.5,
    villages: Math.max(1, Math.round(parameters.villageRichness * 6)),
    villageSize: PLANNING_REFERENCE.world.villageSizeM,
    buildings: PLANNING_REFERENCE.world.buildingBudget,
    roadWidth: PLANNING_REFERENCE.world.roadWidthM * (normalized.routes?.width ?? 1),
    roadWidthVariation: normalized.routes?.widthVariation ?? 0.5,
    roadContourDetail: 1,
    loopiness: parameters.routeLoops,
    climb: 0,
    visibility: 0.7
  };
  if (options?.audit !== false && normalized["valley-main"]?.bend !== undefined) {
    for (let i = 0; i < q.rivers; i++)
      normalized[`river-${i}`] = { ...normalized[`river-${i}`], bend: normalized["valley-main"].bend };
  }
  const schedule =
    options?.audit === false
      ? (options?.canyonStudy
          ? ["domain", "landforms"]
          : ["domain", "landforms", "water", "places", "open", "lookout", "routes"]
        ).map((id, i, ids) => ({ ...WORLD_LAYOUT_MODULES.find((m) => m.id === id)!, requires: i ? [ids[i - 1]] : [] }))
      : undefined;
  let result = generateWorldLayout(q, normalized, schedule, true, options?.onPreview),
    plan = result.plan,
    data = plan.planning!,
    rounds = 0;
  const seen = new Set<string>();
  if (options?.audit === false) {
    if (options.canyonStudy && !plan.structures?.length) {
      const notes = [...result.notes, "当前陆域无法容纳峡谷占地，未发布新的组合"];
      if (previous) return { ...previous, accepted: false, notes };
      data.auditMode = "paused";
      data.status = "invalid";
      return { recipe, plan, accepted: false, checks: [], changedIds: [], notes };
    }
    finalizePlanningTerrain(plan);
    refreshPlanningRouteHeights(plan);
    if (!plan.canyonStudy && !plan.landformStudy) finalizeMountainSemantics(plan);
    data.auditMode = "paused";
    data.checks = [];
    data.rounds = 0;
    data.status = "valid";
    data.revision = (previous?.plan.planning?.revision ?? 0) + 1;
    data.changedIds = data.modules
      .filter(
        (m) =>
          !plan.canyonStudy ||
          !previous ||
          JSON.stringify(m) !== JSON.stringify(previous.plan.planning?.modules.find((old) => old.id === m.id))
      )
      .map((m) => m.id);
    return {
      recipe,
      plan,
      accepted: true,
      checks: [],
      changedIds: data.changedIds,
      notes: [...result.notes, "约束审计与自动修复已暂停；当前为布局草案"]
    };
  }
  for (; rounds < 4; ) {
    rounds++;
    for (const id of Object.keys(normalized)) {
      if (previous?.plan.planning?.modules.some((m) => m.id === id) && !data.requiredIds.includes(id))
        data.requiredIds.push(id);
    }
    finalizePlanningTerrain(plan);
    finalizeVillageAreaPaths(plan);
    refreshPlanningRouteHeights(plan);
    finalizeWorldValleys(plan);
    if (previous) plan.sights = structuredClone(previous.plan.sights);
    buildPlanningVisuals(plan, 0.7);
    data.checks = [...data.checks, ...validatePlanningWorld(plan)];
    if (!data.checks.some(planningCheckBlocksEdit)) break;
    const requests = requestPlanningRepairs(plan, data.checks, previous?.plan),
      signature = JSON.stringify(requests);
    if (!requests.length || seen.has(signature) || rounds === 4) break;
    seen.add(signature);
    (q as typeof q & { repairCorridors: typeof requests }).repairCorridors = requests;
    result = generateWorldLayout(q, normalized, undefined, true, options?.onPreview);
    plan = result.plan;
    data = plan.planning!;
    data.adjustments.push({ owners: requests.map((r) => r.ownerId), reason: requests[0].reason });
  }
  const moduleData = (p: typeof plan, id: string) => {
    const own = new Set([
      id,
      ...(p.planning?.modules.find((m) => m.id === id)?.memberIds ?? []),
      ...p.rocks.filter((r) => r.groupId === id).map((r) => r.id),
      ...p.buildings.filter((b) => b.regionId === id).map((b) => b.id)
    ]);
    const module = p.planning?.modules.find((m) => m.id === id);
    return JSON.stringify({
      module: module && { ...module, requested: undefined },
      rocks: p.rocks.filter((r) => own.has(r.id)),
      buildings: p.buildings.filter((b) => own.has(b.id)),
      water: p.waters.filter((w) => own.has(w.id)),
      land: id === "land-main" ? p.land : undefined,
      routes: p.routes.filter((r) => id === "routes" || own.has(r.from) || own.has(r.to) || own.has(r.id)),
      ports: p.planning?.ports.filter((v) => own.has(v.ownerId)),
      profiles: p.planning?.profiles.filter((v) => own.has(v.ownerId)),
      reservations: p.planning?.reservations.filter((v) => own.has(v.ownerId))
    });
  };
  if (previous) {
    for (const [id, edit] of Object.entries(previous.recipe.edits)) {
      if (!edit.locked || normalized[id]?.locked === false) continue;
      if (moduleData(previous.plan, id) !== moduleData(plan, id))
        data.checks.push({
          id: `locked-${id}`,
          rule: "E01",
          owners: [id],
          status: "fail",
          required: true,
          message: "锁定对象的占地、体量、高程和端口保持不变；解锁后可修改"
        });
    }
  }
  data.changedIds = data.modules
    .filter((m) => !previous || moduleData(previous.plan, m.id) !== moduleData(plan, m.id))
    .map((m) => m.id);
  data.revision = (previous?.plan.planning?.revision ?? 0) + 1;
  data.rounds = rounds;
  data.adjustments.push(...result.notes.map((reason) => ({ owners: [], reason })));
  for (const check of data.checks) if (check.rule === "V01" || check.rule === "V02") check.required = false;
  data.status = data.checks.some(planningCheckBlocksEdit) ? "invalid" : "valid";
  const accepted = data.status === "valid";
  return {
    recipe,
    plan: !accepted && previous ? previous.plan : plan,
    accepted,
    checks: data.checks,
    changedIds: data.changedIds,
    notes: [...result.notes, ...(!accepted ? ["本次必需约束未满足，保留已接受地图；检查列表对应本次请求"] : [])]
  };
}
