import {
  vegetationRank as rank,
  vegetationKeyHash,
  vegetationRankFromHash
} from "@galacean/engine-vegetation/world/VegetationRandom";
import { createVegetationSpeciesRegions } from "@galacean/engine-vegetation/world/VegetationSpeciesRegions";
import { vegetationColorVariation } from "@galacean/engine-vegetation/world/VegetationColorVariation";
import {
  createVegetationCompanionPatches,
  type VegetationCompanionAnchor
} from "@galacean/engine-vegetation/world/VegetationCompanionPatches";
import { createLandscapePolylineQuery } from "@galacean/engine-vegetation/world/LandscapePolylineQuery";
import type { NaturalVegetationLayerRule } from "./NaturalVegetationLayers.ts";
import {
  createLandscapeVisibilityQuery,
  landscapePolygonContains,
  landscapePolygonDistance,
  type LandscapePoint,
  type LandscapePlantAsset,
  type LandscapePlantInstance,
  type LandscapePopulationArea,
  type LandscapeSurfaceSample,
  type VegetationLandscapePlan,
  type VegetationLandscapeRequest
} from "@galacean/engine-vegetation/world/VegetationLandscapePlan";

interface NaturalCellSampling {
  /** Additional prepared footprint contacts; preserves the same exclusion rejection category. */
  readonly excludes?: (point: LandscapePoint, radius: number) => boolean;
  readonly bounds: { readonly min: LandscapePoint; readonly max: LandscapePoint };
  readonly anchors: readonly VegetationCompanionAnchor[];
  readonly populationAreas: Readonly<Record<string, readonly LandscapePopulationArea[]>>;
  readonly populationAssetWeights: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>>;
  /** One world-addressed proposal stream; rejected decorations are never replenished. */
  readonly populationFields?: Readonly<
    Record<
      string,
      {
        readonly ratePerM2: number;
        readonly at: (
          x: number,
          z: number
        ) => { scopeId: string; densityPerM2: number; maxSlopeDegrees: number } | undefined;
      }
    >
  >;
  /** Published habitat and authored reveal fraction, independent of plant dimensions. */
  readonly density: (x: number, z: number, layerId: string) => number;
  /** World-wide proposal rates stay independent of which edges intersect this render cell. */
  readonly edgeMultiplier: (layerId: string) => number;
}
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function clipArea(source: readonly LandscapePoint[], min: LandscapePoint, max: LandscapePoint): LandscapePoint[] {
  let points = [...source];
  for (const [axis, bound, sign] of [
    [0, min[0], 1],
    [0, max[0], -1],
    [1, min[1], 1],
    [1, max[1], -1]
  ]) {
    const clipped: LandscapePoint[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        u = (a[axis] - bound) * sign,
        v = (b[axis] - bound) * sign;
      if (u >= 0) clipped.push(a);
      if (u >= 0 !== v >= 0) clipped.push([lerp(a[0], b[0], u / (u - v)), lerp(a[1], b[1], u / (u - v))]);
    }
    points = clipped;
  }
  return points;
}

/** Construct a native vegetation cell from independently addressed candidates.
 * Like tree slots, each candidate has a fixed location and is accepted or hidden once.
 * Plants never reserve space against other layers or trigger replacement attempts.
 * @param request Published world boundaries, layer recipes and optional subject sightlines.
 * @param assets Measured native plant dimensions in metres.
 * @param surface Ground height and slope; queried only after density and footprint rejection.
 * @param sampling Cell bounds, fixed canopy anchors, flower regions and reveal fields.
 * @returns Deterministic instances and actual rejection counts; flower density is not a quota.
 * @throws If the finite candidate or output work budget is exceeded.
 */
export function compileNaturalVegetationCell(
  request: Pick<
    VegetationLandscapeRequest,
    "seed" | "regionId" | "region" | "seams" | "exclusions" | "views" | "focalTargets" | "budget"
  > & { readonly layers: readonly NaturalVegetationLayerRule[] },
  assets: readonly LandscapePlantAsset[],
  surface: (x: number, z: number) => LandscapeSurfaceSample,
  sampling: NaturalCellSampling
): VegetationLandscapePlan {
  const { seed } = request,
    { min, max } = sampling.bounds;
  const byAsset = new Map(assets.map((asset) => [asset.id, asset]));
  const instances: LandscapePlantInstance[] = [],
    rejected: Record<string, number> = {},
    layers: Record<string, number> = {};
  const decorations: Record<string, { attempts: number; placed: number; rejected: Record<string, number> }> = {};
  const populations: Record<
    string,
    {
      expected: number;
      requested: number;
      placed: number;
      shortfall: number;
      attempts: number;
      rejected: Record<string, number>;
    }
  > = {};
  const occludes = createLandscapeVisibilityQuery(request.views, request.focalTargets);
  const exclusions = request.exclusions.map((exclusion) => ({
    ...exclusion,
    minX: Math.min(...exclusion.polygon.outer.map((p) => p[0])),
    maxX: Math.max(...exclusion.polygon.outer.map((p) => p[0])),
    minZ: Math.min(...exclusion.polygon.outer.map((p) => p[1])),
    maxZ: Math.max(...exclusion.polygon.outer.map((p) => p[1]))
  }));
  // Bucket only broad-phase bounds. Exact polygons and each plant's own radius
  // still decide overlap; neighbouring candidates never reserve or move space.
  const maximumRadius = Math.max(
    0,
    ...request.layers
      .filter((layer) => layer.density > 0)
      .flatMap((layer) =>
        layer.palette.map(
          (member) =>
            byAsset.get(member.assetId)!.radius *
            (member.scale ?? layer.scale)[1] *
            (member.horizontalVariation?.[1] ?? 1)
        )
      )
  );
  const exclusionStep = Math.max(
    maximumRadius * 2,
    Math.sqrt(((max[0] - min[0]) * (max[1] - min[1])) / Math.max(1, exclusions.length))
  );
  const exclusionColumns = Math.max(1, Math.ceil((max[0] - min[0]) / exclusionStep));
  const exclusionRows = Math.max(1, Math.ceil((max[1] - min[1]) / exclusionStep));
  const exclusionBins: (typeof exclusions)[] = Array.from({ length: exclusionColumns * exclusionRows }, () => []);
  for (const exclusion of exclusions) {
    const reach = maximumRadius + exclusion.clearance;
    for (
      let z = Math.max(0, Math.floor((exclusion.minZ - reach - min[1]) / exclusionStep));
      z <= Math.min(exclusionRows - 1, Math.floor((exclusion.maxZ + reach - min[1]) / exclusionStep));
      z++
    )
      for (
        let x = Math.max(0, Math.floor((exclusion.minX - reach - min[0]) / exclusionStep));
        x <= Math.min(exclusionColumns - 1, Math.floor((exclusion.maxX + reach - min[0]) / exclusionStep));
        x++
      )
        exclusionBins[z * exclusionColumns + x].push(exclusion);
  }
  const seams = (request.seams ?? []).map((seam) => ({ ...seam, query: createLandscapePolylineQuery(seam.points) }));
  let candidates = 0;
  for (const layer of request.layers) {
    layers[layer.id] = 0;
    if (layer.density === 0) continue;
    const field = sampling.populationFields?.[layer.id];
    const decoration = field
      ? (decorations[layer.id] = { attempts: 0, placed: 0, rejected: {} as Record<string, number> })
      : undefined;
    const areas = field ? undefined : sampling.populationAreas[layer.id];
    const scopes = new Map<string, LandscapePopulationArea[]>();
    if (areas)
      for (const area of areas) {
        if (!(area.densityPerM2 > 0)) continue;
        const polygon = clipArea(area.polygon, min, max);
        if (polygon.length < 3) continue;
        const key = area.scopeId ?? "",
          group = scopes.get(key) ?? [];
        group.push({ ...area, polygon });
        scopes.set(key, group);
      }
    // Decoration fields already contain source-bound roadside/plaza influence.
    // Do not multiply it by a second edge field or oversample the whole cell at
    // the strongest possible roadside multiplier just to reject most proposals.
    const layerSeams = field ? [] : seams.filter((seam) => seam.layers.includes(layer.id));
    const maximumEdgeBoost = Math.max(1, ...layerSeams.map((seam) => seam.densityMultiplier));
    // Authored flower polygons already define their patches; do not cluster them a second time.
    const companion = !field && !areas && layer.companionPlanting?.strength ? layer.companionPlanting : undefined;
    const pockets = companion ? createVegetationCompanionPatches(seed, sampling.anchors, companion.patches) : undefined;
    const localCompanions = companion?.densityPerM2 !== undefined && !areas;
    const envelope = field
      ? 1
      : Math.max(1, localCompanions ? 1 : (companion?.densityMultiplier ?? 1), sampling.edgeMultiplier(layer.id));
    // A fixed four-corner field replaces the all-cluster nearest-neighbour search.
    const patchValues = new Map<string, number>();
    const patchAt = (x: number, z: number) => {
      const key = `${x}/${z}`;
      let value = patchValues.get(key);
      if (value === undefined) {
        value = rank(seed, `${layer.id}/patch/${key}`);
        patchValues.set(key, value);
      }
      return value;
    };
    const backgroundAt = (p: LandscapePoint) => {
      const x = p[0] / layer.clusterRadius,
        z = p[1] / layer.clusterRadius;
      const ix = Math.floor(x),
        iz = Math.floor(z),
        u = smooth(x - ix),
        v = smooth(z - iz);
      const value = lerp(
        lerp(patchAt(ix, iz), patchAt(ix + 1, iz), u),
        lerp(patchAt(ix, iz + 1), patchAt(ix + 1, iz + 1), u),
        v
      );
      return lerp(1, value * value, layer.clusterStrength);
    };
    for (const [scopeId, scopeAreas] of areas
      ? [...scopes].sort(([a], [b]) => a.localeCompare(b))
      : [["", undefined] as const]) {
      const weights = sampling.populationAssetWeights[layer.id]?.[scopeId];
      const palette = layer.palette
        .map((member) => ({ ...member, weight: weights?.[member.assetId] ?? member.weight }))
        .filter((member) => member.weight > 0)
        .sort((a, b) => a.assetId.localeCompare(b.assetId));
      if (!palette.length) continue;
      const speciesAt = layer.speciesRegions
        ? createVegetationSpeciesRegions(seed, palette, layer.speciesRegions)
        : undefined;
      const scopedPalettes = new Map<string, typeof palette>();
      const scopedSpecies = new Map<string, ReturnType<typeof createVegetationSpeciesRegions>>();
      const totalWeight = palette.reduce((total, member) => total + member.weight, 0);
      const density =
        field?.ratePerM2 ??
        (scopeAreas ? Math.max(layer.density, ...scopeAreas.map((area) => area.densityPerM2)) : layer.density);
      const areaQueries = scopeAreas?.map((area) => ({
        ...area,
        minX: Math.min(...area.polygon.map((p) => p[0])),
        maxX: Math.max(...area.polygon.map((p) => p[0])),
        minZ: Math.min(...area.polygon.map((p) => p[1])),
        maxZ: Math.max(...area.polygon.map((p) => p[1]))
      }));
      let population: (typeof populations)[string] | undefined;
      if (scopeAreas) {
        population = populations[layer.id] ??= {
          expected: 0,
          requested: 0,
          placed: 0,
          shortfall: 0,
          attempts: 0,
          rejected: {}
        };
        for (const area of scopeAreas)
          population.expected +=
            (Math.abs(
              area.polygon.reduce((sum, a, i) => {
                const b = area.polygon[(i + 1) % area.polygon.length];
                return sum + a[0] * b[1] - b[0] * a[1];
              }, 0)
            ) /
              2) *
            area.densityPerM2;
      }
      const reject = (reason: string) => {
        rejected[reason] = (rejected[reason] ?? 0) + 1;
        if (decoration) decoration.rejected[reason] = (decoration.rejected[reason] ?? 0) + 1;
        if (population) population.rejected[reason] = (population.rejected[reason] ?? 0) + 1;
      };
      const accept = (id: string, hash: number, p: LandscapePoint, local = false) => {
        if (++candidates > request.budget.candidates) throw new Error("Natural vegetation candidate budget exceeded");
        if (population) population.attempts++;
        if (decoration) decoration.attempts++;
        const random = (domain: string) => vegetationRankFromHash(hash, `/${domain}`);
        const location = field?.at(p[0], p[1]);
        if (field && !location) {
          reject("density");
          return;
        }
        const resolvedScope = location?.scopeId ?? scopeId;
        let suitability = sampling.density(p[0], p[1], layer.id) * (location ? location.densityPerM2 / density : 1);
        if (areaQueries) {
          let areaDensity = 0;
          for (const area of areaQueries)
            if (
              p[0] >= area.minX &&
              p[0] <= area.maxX &&
              p[1] >= area.minZ &&
              p[1] <= area.maxZ &&
              landscapePolygonContains(p, { outer: area.polygon })
            )
              areaDensity = Math.max(areaDensity, area.densityPerM2);
          suitability *= areaDensity / density;
        }
        if (suitability <= 0) {
          reject("density");
          return;
        }
        const revealRank = random("density");
        if (revealRank >= suitability) {
          reject("density");
          return;
        }
        const pocket = pockets?.(p);
        const clustered =
          field || scopeAreas
            ? 1
            : localCompanions
              ? local
                ? pocket!.weight / (pocket!.overlapCount || 1)
                : backgroundAt(p)
              : companion
                ? lerp(backgroundAt(p), pocket!.weight, companion.strength)
                : backgroundAt(p);
        let boost = localCompanions ? 1 : lerp(1, companion?.densityMultiplier ?? 1, pocket?.weight ?? 0),
          suppression = 1;
        // Even the strongest edge cannot reveal this candidate. Skip all exact
        // road/wall distances; the original final comparison still owns acceptance.
        if (revealRank >= (suitability * clustered * Math.max(boost, maximumEdgeBoost)) / envelope) {
          reject("density");
          return;
        }
        for (const seam of layerSeams) {
          const factor = lerp(
            1,
            seam.densityMultiplier,
            1 - smooth(seam.query.distance(p, seam.width / 2) / (seam.width / 2))
          );
          if (factor >= 1) boost = Math.max(boost, factor);
          else suppression *= factor;
        }
        if (revealRank >= (suitability * clustered * boost * suppression) / envelope) {
          reject("density");
          return;
        }
        // Species and geometry are resolved only for surviving proposals.
        let localPalette = palette,
          localSpecies = speciesAt;
        if (field) {
          const localWeights = sampling.populationAssetWeights[layer.id]?.[resolvedScope];
          if (localWeights) {
            let scoped = scopedPalettes.get(resolvedScope);
            if (!scoped) {
              scoped = palette
                .map((member) => ({ ...member, weight: localWeights[member.assetId] ?? member.weight }))
                .filter((member) => member.weight > 0);
              scopedPalettes.set(resolvedScope, scoped);
              if (scoped.length && layer.speciesRegions)
                scopedSpecies.set(resolvedScope, createVegetationSpeciesRegions(seed, scoped, layer.speciesRegions));
            }
            localPalette = scoped;
            localSpecies = scopedSpecies.get(resolvedScope);
          }
        }
        if (!localPalette.length) {
          reject("species");
          return;
        }
        const speciesRegion = localSpecies?.(p, id);
        let chosen = speciesRegion?.member;
        if (!chosen) {
          let selection =
            random("species") *
            (localPalette === palette ? totalWeight : localPalette.reduce((sum, member) => sum + member.weight, 0));
          chosen =
            localPalette.find((member) => (selection -= member.weight) < 0) ?? localPalette[localPalette.length - 1];
        }
        const asset = byAsset.get(chosen.assetId)!,
          scale = lerp(...(chosen.scale ?? layer.scale), random("scale"));
        const heightScale = lerp(...(chosen.heightScale ?? chosen.scale ?? layer.scale), random("scale"));
        const variation = chosen.horizontalVariation ?? [1, 1];
        const scaleAxes = [
          scale * lerp(...variation, random("scale-x")),
          heightScale,
          scale * lerp(...variation, random("scale-z"))
        ] as const;
        const radius = asset.radius * Math.max(scaleAxes[0], scaleAxes[2]),
          footprint = radius * (layer.footprintRatio ?? 1);
        if (landscapePolygonDistance(p, request.region) < footprint) {
          reject("region");
          return;
        }
        const nearbyExclusions =
          exclusionBins[
            Math.floor((p[1] - min[1]) / exclusionStep) * exclusionColumns + Math.floor((p[0] - min[0]) / exclusionStep)
          ];
        if (
          sampling.excludes?.(p, radius) ||
          nearbyExclusions.some((exclusion) => {
            const reach = radius + exclusion.clearance;
            return (
              p[0] >= exclusion.minX - reach &&
              p[0] <= exclusion.maxX + reach &&
              p[1] >= exclusion.minZ - reach &&
              p[1] <= exclusion.maxZ + reach &&
              landscapePolygonDistance(p, exclusion.polygon) >= -reach
            );
          })
        ) {
          reject("exclusion");
          return;
        }
        const ground = surface(p[0], p[1]);
        if (ground.slopeDegrees > Math.min(layer.maxSlopeDegrees, location?.maxSlopeDegrees ?? 90)) {
          reject("slope");
          return;
        }
        const instance: LandscapePlantInstance = {
          id,
          assetId: asset.id,
          layerId: layer.id,
          clusterId: pocket?.patchId ?? id,
          ...(resolvedScope ? { scopeId: resolvedScope } : {}),
          ...(pocket?.anchorId ? { companionAnchorId: pocket.anchorId } : {}),
          position: [p[0], ground.height, p[1]],
          yaw: random("yaw") * 360,
          scale,
          ...(chosen.heightScale || chosen.horizontalVariation ? { scaleAxes } : {}),
          radius,
          height: asset.height * heightScale,
          ...(asset.groundingOffset !== undefined ? { groundingOffset: asset.groundingOffset * heightScale } : {}),
          ...(speciesRegion && (chosen.foliageVariation || chosen.barkVariation)
            ? {
                appearance: {
                  ...(chosen.foliageVariation
                    ? {
                        foliage: vegetationColorVariation(
                          seed,
                          chosen.speciesGroup ?? chosen.assetId,
                          id,
                          speciesRegion,
                          chosen.foliageVariation,
                          "foliage"
                        )
                      }
                    : {}),
                  ...(chosen.barkVariation
                    ? {
                        bark: vegetationColorVariation(
                          seed,
                          chosen.speciesGroup ?? chosen.assetId,
                          id,
                          speciesRegion,
                          chosen.barkVariation,
                          "bark"
                        )
                      }
                    : {})
                }
              }
            : {})
        };
        if (occludes(instance)) {
          reject("visibility");
          return;
        }
        if (instances.length >= request.budget.instances)
          throw new Error("Natural vegetation instance budget exceeded");
        instances.push(instance);
        layers[layer.id]++;
        if (population) population.placed++;
        if (decoration) decoration.placed++;
      };
      const rate = density * envelope * (localCompanions ? 1 - companion!.strength : 1);
      if (rate > 0) {
        const step = 1 / Math.sqrt(rate);
        const nx = Math.ceil(max[0] / step) - Math.floor(min[0] / step),
          nz = Math.ceil(max[1] / step) - Math.floor(min[1] / step);
        if (!Number.isFinite(nx * nz) || nx * nz > request.budget.candidates)
          throw new Error("Natural vegetation candidate budget exceeded");
        for (let z = Math.floor(min[1] / step); z < Math.ceil(max[1] / step); z++)
          for (let x = Math.floor(min[0] / step); x < Math.ceil(max[0] / step); x++) {
            const id = `natural/${layer.id}/${scopeId}/${x}/${z}`;
            const hash = vegetationKeyHash(seed, id);
            const p: LandscapePoint = [
              (x + vegetationRankFromHash(hash, "/x")) * step,
              (z + vegetationRankFromHash(hash, "/z")) * step
            ];
            if (p[0] >= min[0] && p[0] < max[0] && p[1] >= min[1] && p[1] < max[1]) accept(id, hash, p);
          }
      }
      if (localCompanions)
        for (const patch of pockets!.patches) {
          const mass = Math.PI * patch.a * patch.b * companion!.densityPerM2! * companion!.strength * envelope;
          if (!Number.isFinite(mass)) throw new Error("Natural vegetation candidate budget exceeded");
          let arrival = 0;
          for (let i = 0; ; i++) {
            const id = `${patch.id}/${layer.id}/plant/${i}`;
            const hash = vegetationKeyHash(seed, id);
            arrival -= Math.log(1 - vegetationRankFromHash(hash, "/arrival"));
            if (arrival >= mass) break;
            if (i >= request.budget.candidates) throw new Error("Natural vegetation candidate budget exceeded");
            const r = Math.sqrt(vegetationRankFromHash(hash, "/radius")),
              angle = vegetationRankFromHash(hash, "/angle") * Math.PI * 2;
            const u = r * Math.cos(angle) * patch.a,
              v = r * Math.sin(angle) * patch.b;
            const p: LandscapePoint = [
              patch.x + u * patch.cos - v * patch.sin,
              patch.z + u * patch.sin + v * patch.cos
            ];
            if (p[0] >= min[0] && p[0] < max[0] && p[1] >= min[1] && p[1] < max[1]) accept(id, hash, p, true);
          }
        }
    }
  }
  for (const population of Object.values(populations)) {
    population.requested = Math.round(population.expected);
    population.shortfall = Math.max(0, population.requested - population.placed);
  }
  return {
    version: 1,
    regionId: request.regionId,
    seed,
    instances,
    diagnostics: { candidates, rejected, layers, populations, decorations, views: {} }
  };
}
