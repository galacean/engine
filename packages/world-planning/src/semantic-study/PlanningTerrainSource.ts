import { isGlobalRoadId } from "../spatial/layout/RoadIdentity";
import presentation from "../planning-data/whitebox-presentation.json";
import type { TerrainClipmapRegionSource } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmapSource";
import type { TerrainLayerResidencyRegionSource } from "@galacean/engine-terrain/terrain/clipmap/TerrainLayerResidency";
import type { IslandPlan } from "./IslandPlanModel";
import { planningHeightmap, type PlanningHeightmap } from "./PlanningHeightmap";
import { planningAlphamap, type PlanningAlphamap } from "./PlanningAlphamap";
import { PLANNING_SURFACES } from "./PlanningSurfacePalette";

/** Canonical renderer payload derived from one immutable planning snapshot. */
export interface PlanningTerrainSource {
  height: TerrainClipmapRegionSource;
  layers: TerrainLayerResidencyRegionSource<never>;
  riverBedCoverage?: Uint8Array;
  minimum: number;
  maximum: number;
  spacing: number;
}
const layerCache = new WeakMap<PlanningAlphamap, TerrainLayerResidencyRegionSource<never>>();
const cache = new WeakMap<PlanningHeightmap, WeakMap<PlanningAlphamap, PlanningTerrainSource>>();
/** Compile planning intent for the production Terrain renderer; water weights describe bed material, not a water plane.
 * @param plan Published semantic snapshot, in metres with +Z row order.
 * @returns Height and layer sources with one shared stable region identity.
 */
export function planningTerrainSource(
  plan: IslandPlan,
  visibility: Readonly<Record<string, boolean>> = {}
): PlanningTerrainSource {
  const shown = (id: string, layer: string) => visibility["object:" + id] !== false && visibility[layer] !== false;
  const routes = plan.routes.filter((r) =>
    shown(r.id, plan.poiDistribution ? (isGlobalRoadId(r.id) ? "road-world" : "road-local") : "route")
  );
  const plazas = plan.plazas?.filter((p) => shown(p.id, "route"));
  const surfacePlan =
    routes.length === plan.routes.length && plazas?.length === plan.plazas?.length ? plan : { ...plan, routes, plazas };
  const height = planningHeightmap(plan),
    alpha = planningAlphamap(surfacePlan);
  const saved = cache.get(height)?.get(alpha);
  if (saved) return saved;
  if (height.spacingX !== height.spacingZ) throw new Error("Terrain requires equal X/Z sample spacing");
  const id = "planning-terrain";
  let layerSource = layerCache.get(alpha);
  if (!layerSource) {
    // Terrain continues under water. Dry/wet bed material is distinct from the independent water surface.
    const weights = new Uint8Array(alpha.weights.length);
    for (let i = 0; i < alpha.coverage.length; i++) {
      const grass = alpha.weights[i * 4];
      weights[i * 4] = grass;
      weights[i * 4 + 1] = 255 - grass;
    }
    const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const layers = PLANNING_SURFACES.filter((surface) => surface.id !== "water").map((surface) => {
      const color = [...surface.color.map((c) => linear(c / 255)), 1] as [number, number, number, number];
      return {
        id: surface.id,
        appearance: surface.id === "grass" ? ("grass" as const) : surface.id === "soil" ? ("road" as const) : undefined,
        tileSize: [
          presentation.gridCellM * presentation.gridMajorEvery,
          presentation.gridCellM * presentation.gridMajorEvery
        ] as const,
        tileOffset: [0, 0] as const,
        normalScale: 0,
        diffuseRemapMin: [0, 0, 0, 0] as const,
        diffuseRemapMax: color,
        maskRemapMin: [0, 0, 0, 0] as const,
        maskRemapMax: [1, 1, 1, 1] as const,
        metallic: 0,
        smoothness: 0,
        specular: [0, 0, 0, 0] as const,
        snowResponse: 0
      };
    });
    layerSource = {
      id,
      layers,
      alphamaps: [{ sampleSize: [alpha.resolution, alpha.resolution], layers: ["grass", "soil", null, null], weights }]
    };
    layerCache.set(alpha, layerSource);
  }
  const result: PlanningTerrainSource = {
    height: {
      id,
      worldPosition: [0, 0, 0],
      worldSize: [plan.parameters.width, 1, plan.parameters.depth],
      heightSampleSize: [height.resolution, height.resolution],
      heightDecodeOffset: height.decodeOffset,
      heightDecodeScale: height.decodeScale,
      heightSamples: height.encoded,
      surfaceHeights: height.heights
    },
    layers: layerSource,
    riverBedCoverage: alpha.riverBedCoverage,
    minimum: height.decodeOffset,
    maximum: height.decodeOffset + height.decodeScale,
    spacing: height.spacingX
  };
  if (!cache.has(height)) cache.set(height, new WeakMap());
  cache.get(height)!.set(alpha, result);
  return result;
}
