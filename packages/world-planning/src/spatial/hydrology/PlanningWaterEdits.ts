import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { PlanningDocument } from "../PlanningDocument";
import { resolveComponent } from "../SpatialDocument";
import { planningRegistry } from "../PlanningComponents";
import { planningGroundSurface, inheritPlanningHeightmap } from "../../semantic-study/PlanningHeightmap";
import { planningLakeBoundary } from "../../semantic-study/PlanningLakeBoundary";
import type { SemanticResult } from "../../semantic-study/WorldPlanningContract";
import { inheritPlanningQueryData } from "../PlanningQueryDataOwner";

/** Transaction policy, never persisted as generated world state. */
export interface WaterEditOptions {
  mode?: "simple" | "complex";
  rebuildShoreVegetation?: boolean;
  affectTerrain?: boolean;
}
export interface PlanningEditOptions {
  water?: WaterEditOptions;
}
export interface PlanningWaterUpdate {
  bodyId: string;
  appearance: boolean;
  surface: boolean;
  edit: Required<WaterEditOptions>;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function resolveWaterEditOptions(
  options: WaterEditOptions | undefined,
  terrainRequired: boolean
): Required<WaterEditOptions> {
  const mode =
    options?.mode ??
    (terrainRequired || options?.affectTerrain || options?.rebuildShoreVegetation ? "complex" : "simple");
  if (mode !== "simple" && mode !== "complex") throw new Error("INVALID_WATER_EDIT: unknown mode");
  for (const value of [options?.affectTerrain, options?.rebuildShoreVegetation])
    if (value !== undefined && typeof value !== "boolean")
      throw new Error("INVALID_WATER_EDIT: options must be boolean");
  if (terrainRequired && (mode === "simple" || options?.affectTerrain === false))
    throw new Error("TERRAIN_CHANGE_REQUIRED: use complex mode with affectTerrain=true for basin edits");
  const resolved = {
    mode,
    affectTerrain: options?.affectTerrain ?? mode === "complex",
    rebuildShoreVegetation: options?.rebuildShoreVegetation ?? mode === "complex"
  };
  if (mode === "simple" && (resolved.affectTerrain || resolved.rebuildShoreVegetation))
    throw new Error("INVALID_WATER_EDIT: simple mode requires affectTerrain=false and rebuildShoreVegetation=false");
  if (mode === "complex" && !resolved.affectTerrain)
    throw new Error(
      "INVALID_WATER_EDIT: the full publication requires affectTerrain=true; use simple for a fixed-bed edit"
    );
  if (mode === "complex" && !resolved.rebuildShoreVegetation)
    throw new Error("INVALID_WATER_EDIT: the full publication requires rebuildShoreVegetation=true");
  return resolved;
}

/** Prove the complete before/after authoring difference. Unknown and mixed edits remain full edits. */
export function classifyPlanningWaterEdit(
  before: PlanningDocument,
  after: PlanningDocument,
  previous: SemanticResult,
  options?: WaterEditOptions
): { update?: PlanningWaterUpdate; reason?: string } {
  const a = structuredClone(before),
    b = structuredClone(after);
  a.revision = b.revision = 0;
  const changes = new Map<string, { appearance: boolean; surface: boolean }>();
  let terrainRequired = false;
  for (const id of new Set([...Object.keys(a.entities), ...Object.keys(b.entities)])) {
    const old = a.entities[id]?.components.lakes,
      next = b.entities[id]?.components.lakes;
    if (equal(old, next)) continue;
    const water = previous.plan.waters.find((water) => water.id === id && water.lake);
    const oldValues = old?.values ?? {},
      newValues = next?.values ?? {};
    const keys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
    if (
      [...keys].some(
        (key) =>
          [
            "enabled",
            "depthM",
            "radiusM",
            "shoreline",
            "centerX",
            "centerZ",
            "referenceLevel",
            "allowCarving",
            "bankWidthM",
            "seed"
          ].includes(key) && !equal(oldValues[key], newValues[key])
      )
    )
      terrainRequired = true;
    if (!water || terrainRequired) continue;
    const oldEntity = a.entities[id],
      nextEntity = b.entities[id];
    const metadata = (entity: typeof oldEntity) => entity && { ...entity, components: undefined };
    if (oldEntity && nextEntity && !equal(metadata(oldEntity), metadata(nextEntity))) continue;
    const materialized = oldEntity ?? nextEntity;
    if ((!oldEntity || !nextEntity) && materialized?.name !== water.label) continue;
    if (!equal(oldValues.levelOffsetM, newValues.levelOffsetM)) changes.set(id, { appearance: false, surface: true });
    for (const document of [a, b]) {
      const entity = document.entities[id],
        component = entity?.components.lakes;
      if (!component) continue;
      delete component.values.levelOffsetM;
      if (
        !Object.keys(component.values).length &&
        (!component.base || (component.base.entity === "world" && component.base.component === "lakes"))
      )
        delete entity.components.lakes;
      if (
        !Object.keys(entity.components).length &&
        Object.keys(entity).every((key) => ["id", "name", "components"].includes(key))
      )
        delete document.entities[id];
    }
  }
  const resolved = resolveWaterEditOptions(options, terrainRequired);
  if (resolved.mode === "complex") return { reason: terrainRequired ? "basin-edit" : "complex-request" };
  if (!equal(a, b)) return { reason: "mixed-or-unknown-authoring" };
  if (changes.size !== 1) return { reason: changes.size ? "multiple-water-bodies" : "no-water-change" };
  const [bodyId, effects] = [...changes][0];
  if (!previous.plan.waters.some((water) => water.id === bodyId)) return { reason: "water-base-unavailable" };
  return { update: { bodyId, ...effects, edit: resolved } };
}

/** A simple edit is a projection over the accepted bed. No global planner or ecosystem solve. */
export function preparePlanningWaterEdit(
  before: PlanningDocument,
  after: PlanningDocument,
  previous: SemanticResult,
  options?: WaterEditOptions
): { result?: SemanticResult; reason?: string } {
  const classified = classifyPlanningWaterEdit(before, after, previous, options),
    update = classified.update;
  if (!update) return { reason: classified.reason };
  const base = previous.plan;
  planningGroundSurface(base); // Establish immutable bed ownership before copying the plan container.
  const plan = {
    ...base,
    ...(after.authoredResources ? { authoredResources: structuredClone(after.authoredResources) } : {}),
    waters: base.waters.map((water) => (water.id === update.bodyId ? { ...water } : water)),
    planning: base.planning && {
      ...base.planning,
      profiles: base.planning.profiles.map((profile) =>
        profile.ownerId === update.bodyId && profile.kind === "water"
          ? { ...profile, points: profile.points.map((point) => ({ ...point })) }
          : profile
      )
    }
  };
  inheritPlanningHeightmap(plan, base);
  const water = plan.waters.find((water) => water.id === update.bodyId)!;
  if (update.surface) {
    let level: number;
    if (water.lake) {
      const values = after.entities[water.id]?.components.lakes
        ? resolveComponent(after, water.id, "lakes", planningRegistry).values
        : {};
      const offset = Number(values.levelOffsetM ?? previous.recipe.parameters.lakes?.levelOffsetM ?? 0);
      level = water.lake.referenceLevel + offset;
      if (!Number.isFinite(level) || level > water.lake.referenceLevel + 1e-6)
        throw new Error("M1 不支持超出湖岸的漫岸演算");
      water.lake = { ...water.lake, waterLevel: level };
      // Retains the existing final-bed isoline and EMPTY_WATER / open-boundary validation.
      try {
        planningLakeBoundary(plan, water);
      } catch (error) {
        if (error instanceof Error && /no wet/.test(error.message))
          throw new Error(`EMPTY_WATER: 湖泊 ${water.id} 在当前水位没有实际水域`);
        throw error;
      }
    } else throw new Error("Source lake base is unavailable");
    for (const profile of plan.planning?.profiles ?? [])
      if (profile.ownerId === water.id && profile.kind === "water")
        profile.points = profile.points.map((point) => ({ ...point, y: level }));
  }
  inheritPlanningQueryData(plan, base);
  return {
    result: {
      ...previous,
      plan,
      waterUpdate: update,
      waterFallbackReason: undefined,
      contentUpdate: undefined,
      parameterCorrections: undefined,
      execution: "water",
      changedIds: [update.bodyId],
      timings: { water: 0 }
    }
  };
}

const queryProjections = new WeakMap<IslandPlan, { presented: IslandPlan; projection: IslandPlan }>();
/** Agent catalog retains presented solid coordinates while water metadata follows the accepted Water batch. */
export function planningWaterQueryProjection(plan: IslandPlan, presented: IslandPlan): IslandPlan {
  if (plan === presented) return plan;
  const cached = queryProjections.get(plan);
  if (cached?.presented === presented) return cached.projection;
  const projection = {
    ...presented,
    waters: plan.waters,
    authoredResources: plan.authoredResources,
    planning: plan.planning
  };
  inheritPlanningHeightmap(projection, plan);
  queryProjections.set(plan, { presented, projection });
  return projection;
}
