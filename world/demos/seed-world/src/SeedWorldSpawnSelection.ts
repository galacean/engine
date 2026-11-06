import { sampleSeedWorldHeight, sampleSeedWorldPopulation, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { SeedWorldGeologyPoint, SeedWorldGeologySuitableRegion } from "@galacean/engine-world-planning/runtime/SeedWorldGeologyLayout";
import type { SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import type { SeedWorldPopulationPreview } from "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan";

/** Eye height used by both deterministic spawn visibility scoring and the initial 3D camera. */
export const SEED_WORLD_SPAWN_EYE_HEIGHT_METRES = 1.8;

const WATER_VIEW_MINIMUM_VISIBILITY = 0.72;
const WATER_VIEW_LINE_SAMPLE_SPACING_METRES = 24;
const WATER_VIEW_LINE_MINIMUM_SAMPLES = 12;
const WATER_VIEW_LINE_MAXIMUM_SAMPLES = 36;

/** Final 3D spawn and viewing direction selected after Height, water, surface, roads, and Population exist. */
export interface SeedWorldSpawnView {
  /** Terrain contact in centred world metres. */
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  /** Distant viewing target chosen from multi-layer visibility. */
  readonly target: Readonly<{ x: number; y: number; z: number }>;
  /** Stable geology opportunity that supplied the winning candidate. */
  readonly regionId: string;
  /** Composite zero-to-one diagnostic score. */
  readonly score: number;
}

interface SeedWorldInlandWaterViewTarget {
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly opennessMetres: number;
}

interface SeedWorldScoredInlandWaterView {
  readonly target: SeedWorldInlandWaterViewTarget;
  readonly score: number;
  readonly elevationScore: number;
}

/**
 * Selects the final spawn only after Hydrology, surface coverage, roads, and Population are known.
 * @param plan Final generated plan carrying every terrain-only suitable region.
 * @param fields Final Height, water, material, road, and moisture fields.
 * @param population Exact tree instances and grass/flower density fields.
 * @returns Stable spawn contact and view direction. Every terrain opportunity remains eligible; edge clearance is scored only after final-world data exists.
 */
export function selectSeedWorldSpawnView(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  population: Pick<SeedWorldPopulationPreview, "treeInstances" | "detailDensityFields">
): SeedWorldSpawnView {
  const layout = plan.geologyLayout;
  if (!layout || layout.suitableRegions.length === 0) return fallbackSpawn(fields);
  const inlandWaterTargets = collectInlandWaterViewTargets(fields);
  const candidates: Array<
    Readonly<{
      region: SeedWorldGeologySuitableRegion;
      point: SeedWorldGeologyPoint;
      score: number;
      waterView?: SeedWorldScoredInlandWaterView;
    }>
  > = [];
  for (const region of layout.suitableRegions) {
    for (const point of regionSamplePoints(region)) {
      const sample = sampleSeedWorldPopulation(plan, fields, point.x, point.z);
      if (!sample || sample.water || sample.wetlandWeight > 0.62 || sample.slope * 90 > 13 || sample.height < 1) {
        continue;
      }
      const roadScore = bell(sample.roadDistanceMetres, 18, 70);
      const waterView = chooseInlandWaterView(fields, point, sample.height, inlandWaterTargets);
      const waterScore = waterView?.score ?? 0;
      const canyonDistance = nearestCanyonDistance(layout.canyons, point);
      const canyonScore = bell(canyonDistance, layout.parameters.canyonWidth * 1.05, 520);
      const grassAndFlowers = sampleDetailVegetation(population, fields, point);
      const treeScore = scoreTreeLayer(population, fields.sizeMetres, point);
      const surfaceScore = sample.grassSurfaceWeight * 0.62 + bell(sample.moisture, 0.52, 0.48) * 0.38;
      const terrainScore = region.terrainScore * 0.55 + (1 - sample.slope / (13 / 90)) * 0.45;
      const edgeClearanceMetres = layout.worldSizeMetres * 0.5 - Math.max(Math.abs(point.x), Math.abs(point.z));
      const explorationHeadroom = smootherstep(180, 720, edgeClearanceMetres);
      const elevatedWaterViewScore = waterView?.elevationScore ?? 0;
      const score =
        terrainScore * 0.15 +
        roadScore * 0.13 +
        waterScore * 0.28 +
        canyonScore * 0.15 +
        surfaceScore * 0.07 +
        grassAndFlowers * 0.05 +
        treeScore * 0.04 +
        explorationHeadroom * 0.07 +
        elevatedWaterViewScore * 0.06;
      candidates.push(Object.freeze({ region, point, score, ...(waterView ? { waterView } : {}) }));
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.region.id.localeCompare(right.region.id));
  const best = candidates[0];
  if (!best) return fallbackSpawn(fields);
  const height = sampleSeedWorldHeight(fields, best.point.x, best.point.z) ?? 0;
  const target = best.waterView?.target.position ?? chooseLayeredViewTarget(plan, fields, best.point, height);
  return Object.freeze({
    position: Object.freeze({ x: best.point.x, y: height, z: best.point.z }),
    target,
    regionId: best.region.id,
    score: best.score
  });
}

function chooseLayeredViewTarget(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  position: SeedWorldGeologyPoint,
  sourceHeight: number
): Readonly<{ x: number; y: number; z: number }> {
  const layout = plan.geologyLayout!;
  let bestBearing = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestHeight = sourceHeight;
  for (let ordinal = 0; ordinal < 24; ordinal++) {
    const bearing = (ordinal / 24) * Math.PI * 2;
    const directionX = Math.sin(bearing);
    const directionZ = Math.cos(bearing);
    let road = 0;
    let heightLayer = 0;
    let targetHeight = sourceHeight;
    for (const distance of [90, 180, 300, 460]) {
      const x = position.x + directionX * distance;
      const z = position.z + directionZ * distance;
      const sample = sampleSeedWorldPopulation(plan, fields, x, z);
      if (!sample) continue;
      road = Math.max(road, bell(sample.roadDistanceMetres, 0, 55));
      heightLayer = Math.max(heightLayer, Math.min(1, Math.abs(sample.height - sourceHeight) / 105));
      targetHeight = sample.height;
    }
    const rayEnd = Object.freeze({ x: position.x + directionX * 520, z: position.z + directionZ * 520 });
    const canyon = 1 - Math.min(1, nearestCanyonDistance(layout.canyons, rayEnd) / 420);
    const score = canyon * 0.46 + road * 0.31 + heightLayer * 0.23;
    if (score > bestScore) {
      bestScore = score;
      bestBearing = bearing;
      bestHeight = targetHeight;
    }
  }
  return Object.freeze({
    x: position.x + Math.sin(bestBearing) * 360,
    y: Math.max(sourceHeight + 5, bestHeight + 14),
    z: position.z + Math.cos(bestBearing) * 360
  });
}

function collectInlandWaterViewTargets(fields: SeedWorldFields): readonly SeedWorldInlandWaterViewTarget[] {
  const candidates: Array<Readonly<{ target: SeedWorldInlandWaterViewTarget; index: number }>> = [];
  const resolution = fields.surfaceResolution;
  for (let index = 0; index < fields.waterMask.length; index++) {
    if (fields.waterMask[index] === 0 || fields.wetlandWeight[index]! < 128) continue;
    const x = index % resolution;
    const z = Math.floor(index / resolution);
    const worldX = ((x + 0.5) / resolution - 0.5) * fields.sizeMetres;
    const worldZ = ((z + 0.5) / resolution - 0.5) * fields.sizeMetres;
    candidates.push(
      Object.freeze({
        index,
        target: Object.freeze({
          position: Object.freeze({
            x: worldX,
            y: fields.wetlandWaterLevelMetres[index]! + 3,
            z: worldZ
          }),
          opennessMetres: Math.max(0, -fields.riverBankDistanceMetres[index]!)
        })
      })
    );
  }
  candidates.sort(
    (left, right) => right.target.opennessMetres - left.target.opennessMetres || left.index - right.index
  );
  const targets: SeedWorldInlandWaterViewTarget[] = [];
  for (const candidate of candidates) {
    if (
      targets.some(
        (target) =>
          Math.hypot(target.position.x - candidate.target.position.x, target.position.z - candidate.target.position.z) <
          96
      )
    ) {
      continue;
    }
    targets.push(candidate.target);
    if (targets.length >= 48) break;
  }
  return Object.freeze(targets);
}

function chooseInlandWaterView(
  fields: SeedWorldFields,
  position: SeedWorldGeologyPoint,
  sourceHeight: number,
  targets: readonly SeedWorldInlandWaterViewTarget[]
): SeedWorldScoredInlandWaterView | undefined {
  let best: SeedWorldScoredInlandWaterView | undefined;
  for (const target of targets) {
    const distance = Math.hypot(target.position.x - position.x, target.position.z - position.z);
    if (distance < 70 || distance > 720) continue;
    const distanceScore = bell(distance, 260, 330);
    const opennessScore = Math.min(1, target.opennessMetres / 52);
    const visibilityScore = scoreTerrainLineOfSight(fields, position, sourceHeight, target.position);
    if (visibilityScore < WATER_VIEW_MINIMUM_VISIBILITY) continue;
    const relativeHeightMetres = sourceHeight - target.position.y;
    const elevationScore =
      smootherstep(4, 32, relativeHeightMetres) * (1 - smootherstep(72, 150, relativeHeightMetres) * 0.55);
    const score = distanceScore * 0.25 + opennessScore * 0.1 + visibilityScore * 0.52 + elevationScore * 0.13;
    if (!best || score > best.score) best = Object.freeze({ target, score, elevationScore });
  }
  return best;
}

function scoreTerrainLineOfSight(
  fields: SeedWorldFields,
  source: SeedWorldGeologyPoint,
  sourceHeight: number,
  target: Readonly<{ x: number; y: number; z: number }>
): number {
  const eyeHeight = sourceHeight + SEED_WORLD_SPAWN_EYE_HEIGHT_METRES;
  let clearSamples = 0;
  let minimumClearanceMetres = Number.POSITIVE_INFINITY;
  const distanceMetres = Math.hypot(target.x - source.x, target.z - source.z);
  const sampleCount = Math.min(
    WATER_VIEW_LINE_MAXIMUM_SAMPLES,
    Math.max(WATER_VIEW_LINE_MINIMUM_SAMPLES, Math.ceil(distanceMetres / WATER_VIEW_LINE_SAMPLE_SPACING_METRES))
  );
  for (let ordinal = 1; ordinal <= sampleCount; ordinal++) {
    const progress = ordinal / (sampleCount + 1);
    const worldX = source.x + (target.x - source.x) * progress;
    const worldZ = source.z + (target.z - source.z) * progress;
    const terrainHeight = sampleSeedWorldHeight(fields, worldX, worldZ);
    if (terrainHeight === undefined) continue;
    const sightlineHeight = eyeHeight + (target.y - eyeHeight) * progress;
    const clearanceMetres = sightlineHeight - (terrainHeight + 0.75);
    minimumClearanceMetres = Math.min(minimumClearanceMetres, clearanceMetres);
    if (clearanceMetres > 0) clearSamples++;
  }
  if (!Number.isFinite(minimumClearanceMetres)) return 0;
  const clearFraction = clearSamples / sampleCount;
  const worstPointScore = smootherstep(-8, 3, minimumClearanceMetres);
  return clearFraction * 0.35 + worstPointScore * 0.65;
}

function regionSamplePoints(region: SeedWorldGeologySuitableRegion): readonly SeedWorldGeologyPoint[] {
  const points: SeedWorldGeologyPoint[] = [region.center];
  const radius = region.radiusMetres * 0.48;
  for (let ordinal = 0; ordinal < 8; ordinal++) {
    const angle = (ordinal / 8) * Math.PI * 2;
    points.push(
      Object.freeze({
        x: region.center.x + Math.cos(angle) * radius,
        z: region.center.z + Math.sin(angle) * radius
      })
    );
  }
  return Object.freeze(points);
}

function sampleDetailVegetation(
  population: Pick<SeedWorldPopulationPreview, "detailDensityFields">,
  fields: SeedWorldFields,
  point: SeedWorldGeologyPoint
): number {
  let grass = 0;
  let flower = 0;
  for (const field of population.detailDensityFields) {
    const normalizedX = point.x / fields.sizeMetres + 0.5;
    const normalizedZ = point.z / fields.sizeMetres + 0.5;
    const x = Math.min(field.resolution - 1, Math.max(0, Math.floor(normalizedX * field.resolution)));
    const z = Math.min(field.resolution - 1, Math.max(0, Math.floor(normalizedZ * field.resolution)));
    const value = field.samples[z * field.resolution + x]! / 255;
    if (field.category === "grass") grass = Math.max(grass, value);
    if (field.category === "flower") flower = Math.max(flower, value);
  }
  return grass * 0.58 + flower * 0.42;
}

function scoreTreeLayer(
  population: Pick<SeedWorldPopulationPreview, "treeInstances">,
  worldSizeMetres: number,
  point: SeedWorldGeologyPoint
): number {
  let nearby = 0;
  let blocking = 0;
  for (const instance of population.treeInstances) {
    if (instance.category !== "tree") continue;
    const worldX = (instance.normalizedPosition.x - 0.5) * worldSizeMetres;
    const worldZ = (instance.normalizedPosition.y - 0.5) * worldSizeMetres;
    const distance = Math.hypot(worldX - point.x, worldZ - point.z);
    if (distance < 16) blocking++;
    else if (distance < 230) nearby++;
  }
  if (blocking > 0) return 0;
  return Math.min(1, nearby / 12);
}

function nearestCanyonDistance(
  canyons: NonNullable<SeedWorldPlan["geologyLayout"]>["canyons"],
  point: SeedWorldGeologyPoint
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const canyon of canyons) {
    for (let index = 1; index < canyon.points.length; index++) {
      nearest = Math.min(nearest, pointSegmentDistance(point, canyon.points[index - 1]!, canyon.points[index]!));
    }
  }
  return nearest;
}

function pointSegmentDistance(
  point: SeedWorldGeologyPoint,
  start: SeedWorldGeologyPoint,
  end: SeedWorldGeologyPoint
): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const squaredLength = deltaX * deltaX + deltaZ * deltaZ;
  const parameter =
    squaredLength === 0
      ? 0
      : Math.min(1, Math.max(0, ((point.x - start.x) * deltaX + (point.z - start.z) * deltaZ) / squaredLength));
  return Math.hypot(point.x - (start.x + deltaX * parameter), point.z - (start.z + deltaZ * parameter));
}

function fallbackSpawn(fields: SeedWorldFields): SeedWorldSpawnView {
  const height = sampleSeedWorldHeight(fields, 0, 0) ?? 0;
  return Object.freeze({
    position: Object.freeze({ x: 0, y: height, z: 0 }),
    target: Object.freeze({ x: 36, y: height + SEED_WORLD_SPAWN_EYE_HEIGHT_METRES, z: 36 }),
    regionId: "fallback",
    score: 0
  });
}

function bell(value: number, centre: number, radius: number): number {
  const normalized = (value - centre) / Math.max(radius, Number.EPSILON);
  return Math.exp(-normalized * normalized * 2);
}

function smootherstep(edge0: number, edge1: number, value: number): number {
  const ratio = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return ratio * ratio * ratio * (ratio * (ratio * 6 - 15) + 10);
}
