import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { SemanticEdit } from "../../semantic-study/WorldPlanningContract";
import { poiTerritories } from "../ecology/PoiTerritories";
import { createPlanningGroundSampler } from "../../semantic-study/WorldPlanningTerrain";
import {
  compileRegionScalarField,
  propagateRegionValue,
  regionAdjacency,
  type RegionScalarField
} from "../regions/RegionScalarField";
import rules from "./poi-region-elevation.json";

export interface PoiRegionElevationConfig {
  heightM: number;
  neighbourRings: number;
  blendM: number;
  sources: "villages-canyons" | "villages" | "canyons";
}
export type PoiRegionElevationEdit = Partial<Pick<PoiRegionElevationConfig, "heightM" | "neighbourRings">>;
export const POI_REGION_ELEVATION_DEFAULTS = Object.freeze(rules.defaults as PoiRegionElevationConfig);
const cache = new Map<string, (p: PlanPoint) => number>();

/** The inspector and solver agree whether an untouched POI is an automatic source. */
export function isAutomaticPoiElevationSource(
  plan: IslandPlan,
  poiId: string,
  sources = plan.parameters.regionElevation?.sources ?? POI_REGION_ELEVATION_DEFAULTS.sources
): boolean {
  const members = plan.poiDistribution?.sites.find((site) => site.id === poiId)?.memberIds ?? [];
  const village = members.some((id) => plan.regions.some((region) => region.id === id && region.kind === "village"));
  const canyon = members.some((id) =>
    plan.mountains.some((mountain) => mountain.id === id && mountain.semanticKind === "canyon")
  );
  return (village && sources !== "canyons") || (canyon && sources !== "villages");
}

/** Height is one consumer of the generic region field. Domain topology is shared with the POI management map. */
export function planPoiRegionElevation(
  plan: IslandPlan,
  config: Partial<PoiRegionElevationConfig> | undefined,
  edits: Readonly<Record<string, SemanticEdit>>
): void {
  if (!plan.poiDistribution) return;
  const previousSample = poiRegionElevationSampler(plan);
  const q = { ...POI_REGION_ELEVATION_DEFAULTS, ...config };
  if (
    ![q.heightM, q.blendM].every(Number.isFinite) ||
    q.heightM < 0 ||
    q.heightM > 160 ||
    q.blendM < 16 ||
    q.blendM > 256 ||
    !Number.isInteger(q.neighbourRings) ||
    q.neighbourRings < 0 ||
    q.neighbourRings > 8 ||
    !["villages-canyons", "villages", "canyons"].includes(q.sources)
  )
    throw new Error("POI 分区海拔参数无效");
  const sites = plan.poiDistribution.sites;
  const field: RegionScalarField = {
    id: "elevation",
    unit: "m",
    blendM: q.blendM,
    domains: plan.poiDistribution.domains,
    cells: poiTerritories(plan).map((cell) => ({
      id: cell.poiId,
      domainId: cell.domainId,
      center: sites.find((site) => site.id === cell.poiId)!.center,
      outline: cell.outline,
      weightM2: cell.weightM2,
      value: 0
    }))
  };
  const adjacency = regionAdjacency(field);
  for (const site of sites) {
    const edit = edits[site.id]?.regionElevation;
    const enabled = isAutomaticPoiElevationSource(plan, site.id, q.sources);
    if (!enabled && !edit) continue;
    const height = edit?.heightM ?? (enabled ? q.heightM : 0);
    if (!Number.isFinite(height) || height < 0 || height > 160) throw new Error("POI 分区抬升高度无效");
    const values = propagateRegionValue(adjacency, site.id, height, edit?.neighbourRings ?? q.neighbourRings);
    for (const cell of field.cells) cell.value = Math.max(cell.value, values.get(cell.id) ?? 0);
  }
  plan.regionFields = { ...plan.regionFields, elevation: field };
  const sample = poiRegionElevationSampler(plan);
  const dryGround = createPlanningGroundSampler({ ...plan, waters: [] });
  // A canyon carries its water vertically with the region while preserving its authored downhill profile.
  for (const site of sites)
    for (const id of site.memberIds) {
      const canyon = plan.mountains.find((mountain) => mountain.id === id && mountain.semanticKind === "canyon");
      if (!canyon) continue;
      const members = new Set(plan.planning?.modules.find((module) => module.id === id)?.memberIds ?? []);
      const waterProfiles = (plan.planning?.profiles ?? []).filter(
        (profile) => members.has(profile.ownerId) && profile.kind === "water"
      );
      // A region is not uniformly high along a canyon. Fit the whole authored longitudinal profile
      // below its lowest surrounding bank; simply adding the centre height can leave its ends airborne.
      const clearance = Math.min(
        Infinity,
        ...waterProfiles.flatMap((profile) => profile.points.map((point) => dryGround(point) - point.y - 1))
      );
      const requestedRise = Math.min(sample(site.center) - previousSample(site.center), clearance);
      const rise = Math.abs(requestedRise) < 1e-8 ? 0 : requestedRise;
      for (const profile of plan.planning?.profiles ?? [])
        if (members.has(profile.ownerId) && (profile.kind === "bed" || profile.kind === "water"))
          for (const point of profile.points) point.y += rise;
      for (const port of plan.planning?.ports ?? [])
        if ((members.has(port.ownerId) || port.ownerId === id) && port.kind === "water") port.height += rise;
    }
}

/** Cached derived field; immutable recipes remain independent from GPU or raster storage. */
export function poiRegionElevationSampler(
  plan: Pick<IslandPlan, "regionFields" | "parameters">
): (p: PlanPoint) => number {
  const field = plan.regionFields?.elevation;
  if (!field || !field.cells.some((cell) => cell.value !== 0)) return () => 0;
  const key = JSON.stringify([field, plan.parameters.width, plan.parameters.depth]);
  let sample = cache.get(key);
  if (!sample) {
    sample = compileRegionScalarField(field, plan.parameters.width, plan.parameters.depth);
    cache.set(key, sample);
    if (cache.size > 4) cache.delete(cache.keys().next().value!);
  }
  return sample;
}
