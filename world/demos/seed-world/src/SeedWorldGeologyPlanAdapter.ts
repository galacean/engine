import { SEED_WORLD_SEA_LEVEL_METRES, type SeedWorldFbmParameters } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import {
  compileSeedWorldGeologyHeightfield,
  sampleSeedWorldGeologyHeight,
  type SeedWorldGeologyLayout,
  type SeedWorldGeologyPoint
} from "@galacean/engine-world-planning/runtime/SeedWorldGeologyLayout";
import type {
  SeedWorldMountainRidge,
  SeedWorldPlan,
  SeedWorldPoint,
  SeedWorldPoi,
  SeedWorldRoad,
  SeedWorldRoadPoint,
  SeedWorldSummit
} from "@galacean/engine-world-planning/world/SeedWorldPlanner";

/**
 * Replaces the legacy plan's terrain-owned semantics with one shared geology layout.
 * @param source Existing downstream Hydrology and Population plan.
 * @param layout Deterministic geology layout shared with the acceptance page.
 * @param fbm Optional debug FBM profile used only by the natural ground term.
 * @returns Immutable plan whose terrain, coast, roads, and hill annotations all reference the shared layout.
 */
export function applySeedWorldGeologyLayoutToPlan(
  source: SeedWorldPlan,
  layout: SeedWorldGeologyLayout,
  fbm?: SeedWorldFbmParameters
): SeedWorldPlan {
  if (source.sizeMetres !== layout.worldSizeMetres) {
    throw new RangeError("Seed World geology layout and downstream plan must use the same world extent");
  }
  const sourceAlreadyUsesLayout = source.geologyLayout?.worldId === layout.worldId;
  const field = sourceAlreadyUsesLayout
    ? undefined
    : compileSeedWorldGeologyHeightfield(layout, source.resolution, fbm);
  const height = field ? normalizeHeightField(field.heights) : source.height;
  const slope = field
    ? Float32Array.from(field.slopesDegrees, (value) => Math.min(1, Math.max(0, value / 90)))
    : source.slope;
  const curvature = field
    ? Float32Array.from(field.curvaturePerMetre, (value) => Math.min(1, Math.max(-1, value * 64)))
    : source.curvature;
  const landMask = field
    ? Uint8Array.from(field.heights, (value) => (value >= SEED_WORLD_SEA_LEVEL_METRES ? 1 : 0))
    : source.landMask;
  const roads = makeRoads(layout, fbm);
  const roadMask = rasterizeRoadMask(layout, source.resolution);
  const roadDistance = distanceFromMask(roadMask, source.resolution);
  const roadWidths = roads.flatMap((road) => road.points);
  const coreHalfWidths = roadWidths.map((point) => point.coreHalfWidthMetres);
  const shoulderWidths = roadWidths.map((point) => point.shoulderWidthMetres);
  const roadStyle =
    roadWidths.length === 0
      ? source.roadStyle
      : Object.freeze({
          ...source.roadStyle,
          coreHalfWidthMetres: Math.max(...coreHalfWidths),
          minimumCoreHalfWidthMetres: Math.min(...coreHalfWidths),
          shoulderWidthMetres: Object.freeze([Math.min(...shoulderWidths), Math.max(...shoulderWidths)] as const)
        });
  const pois = makeRoadPois(layout);
  const mountainRidges = makeMountainRidges(layout);
  const summits = Object.freeze<readonly SeedWorldSummit[]>(
    layout.hills.map((hill) =>
      Object.freeze({
        ...toNormalizedPoint(hill.center, layout.worldSizeMetres),
        elevation: Math.min(1, Math.max(0, (hill.pedestalLiftMetres + hill.peakReliefMetres) / 420))
      })
    )
  );
  return Object.freeze({
    ...source,
    geologyLayout: layout,
    coastShape: Object.freeze({
      ...source.coastShape,
      geology: Object.freeze({ geologySeed: layout.geologySeed, parameters: layout.parameters })
    }),
    spawnReserve: Object.freeze({
      center: Object.freeze({ x: 0.5, y: 0.5 }),
      protectedRadiusMetres: 0,
      mountainClearanceRadiusMetres: 0,
      heightAttenuationStartRadiusMetres: 0,
      heightAttenuationEndRadiusMetres: 0
    }),
    mountainRidges,
    mountainUpliftSamples: new Uint16Array(source.resolution ** 2),
    landMask,
    coastline: Object.freeze([]),
    height,
    slope,
    curvature,
    roadMask,
    roadDistance,
    summits,
    roads,
    pois,
    roadStyle
  });
}

function normalizeHeightField(samples: Float32Array): Float32Array {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    minimum = Math.min(minimum, sample);
    maximum = Math.max(maximum, sample);
  }
  const range = Math.max(1, maximum - minimum);
  return Float32Array.from(samples, (value) => (value - minimum) / range);
}

function makeMountainRidges(layout: SeedWorldGeologyLayout): readonly SeedWorldMountainRidge[] {
  return Object.freeze(
    layout.hills.map((hill) =>
      Object.freeze({
        id: `geology-${hill.id}`,
        brushes: Object.freeze([
          Object.freeze({
            id: hill.id,
            center: toNormalizedPoint(hill.center, layout.worldSizeMetres),
            majorRadiusMetres: hill.bodyRadiusMetres.major,
            minorRadiusMetres: hill.bodyRadiusMetres.minor,
            angleRadians: hill.rotationRadians,
            upliftMetres: hill.pedestalLiftMetres + hill.peakReliefMetres,
            smoothUnionMetres: 0,
            layers: Object.freeze([])
          })
        ])
      })
    )
  );
}

function makeRoads(layout: SeedWorldGeologyLayout, fbm?: SeedWorldFbmParameters): readonly SeedWorldRoad[] {
  return Object.freeze(
    layout.roads.map((road) => {
      const points = Object.freeze<readonly SeedWorldRoadPoint[]>(
        road.points.map((point) =>
          Object.freeze({
            ...toNormalizedPoint(point, layout.worldSizeMetres),
            bridge: false,
            naturalHeightMetres: sampleSeedWorldGeologyHeight(layout, point.x, point.z, fbm).heightMetres,
            coreHalfWidthMetres: point.coreHalfWidthMetres,
            shoulderWidthMetres: point.shoulderWidthMetres
          })
        )
      );
      return Object.freeze({
        id: road.id,
        fromPoiId: `${road.id}-start`,
        toPoiId: `${road.id}-end`,
        points,
        bridgeIntervals: Object.freeze([])
      });
    })
  );
}

function makeRoadPois(layout: SeedWorldGeologyLayout): readonly SeedWorldPoi[] {
  return Object.freeze(
    layout.roadNodes.map((node) =>
      Object.freeze({
        id: node.id,
        kind: node.kind === "branch-junction" ? "crossroads" : "settlement",
        position: toNormalizedPoint(node.position, layout.worldSizeMetres)
      })
    )
  );
}

function rasterizeRoadMask(layout: SeedWorldGeologyLayout, resolution: number): Uint8Array {
  const mask = new Uint8Array(resolution ** 2);
  const spacingMetres = layout.worldSizeMetres / (resolution - 1);
  for (const road of layout.roads) {
    for (let segmentIndex = 1; segmentIndex < road.points.length; segmentIndex++) {
      const start = road.points[segmentIndex - 1]!;
      const end = road.points[segmentIndex]!;
      const maximumOuterWidthMetres = Math.max(
        start.coreHalfWidthMetres + start.shoulderWidthMetres,
        end.coreHalfWidthMetres + end.shoulderWidthMetres
      );
      const radiusCells = Math.ceil(maximumOuterWidthMetres / spacingMetres) + 1;
      const startCell = toGridPoint(start, layout.worldSizeMetres, resolution);
      const endCell = toGridPoint(end, layout.worldSizeMetres, resolution);
      const minimumX = Math.max(0, Math.floor(Math.min(startCell.x, endCell.x)) - radiusCells);
      const maximumX = Math.min(resolution - 1, Math.ceil(Math.max(startCell.x, endCell.x)) + radiusCells);
      const minimumY = Math.max(0, Math.floor(Math.min(startCell.y, endCell.y)) - radiusCells);
      const maximumY = Math.min(resolution - 1, Math.ceil(Math.max(startCell.y, endCell.y)) + radiusCells);
      for (let y = minimumY; y <= maximumY; y++) {
        for (let x = minimumX; x <= maximumX; x++) {
          const point = Object.freeze({
            x: (x / (resolution - 1) - 0.5) * layout.worldSizeMetres,
            z: (y / (resolution - 1) - 0.5) * layout.worldSizeMetres
          });
          const projection = pointSegmentProjection(point, start, end);
          const outerWidthMetres = mix(
            start.coreHalfWidthMetres + start.shoulderWidthMetres,
            end.coreHalfWidthMetres + end.shoulderWidthMetres,
            projection.progress
          );
          if (projection.distance <= outerWidthMetres) {
            mask[y * resolution + x] = 1;
          }
        }
      }
    }
  }
  return mask;
}

function distanceFromMask(mask: Uint8Array, resolution: number): Uint16Array {
  const distance = new Uint16Array(mask.length);
  distance.fill(0xffff);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    distance[index] = 0;
    queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++]!;
    const x = index % resolution;
    const y = Math.floor(index / resolution);
    const nextDistance = Math.min(0xffff, distance[index]! + 1);
    for (const [offsetX, offsetY] of CARDINAL_NEIGHBOURS) {
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= resolution || nextY >= resolution) continue;
      const next = nextY * resolution + nextX;
      if (nextDistance >= distance[next]!) continue;
      distance[next] = nextDistance;
      queue[tail++] = next;
    }
  }
  return distance;
}

function pointSegmentDistance(
  point: SeedWorldGeologyPoint,
  start: SeedWorldGeologyPoint,
  end: SeedWorldGeologyPoint
): number {
  return pointSegmentProjection(point, start, end).distance;
}

function pointSegmentProjection(
  point: SeedWorldGeologyPoint,
  start: SeedWorldGeologyPoint,
  end: SeedWorldGeologyPoint
): Readonly<{ distance: number; progress: number }> {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const squaredLength = deltaX * deltaX + deltaZ * deltaZ;
  const parameter =
    squaredLength === 0
      ? 0
      : Math.min(1, Math.max(0, ((point.x - start.x) * deltaX + (point.z - start.z) * deltaZ) / squaredLength));
  return Object.freeze({
    distance: Math.hypot(point.x - (start.x + deltaX * parameter), point.z - (start.z + deltaZ * parameter)),
    progress: parameter
  });
}

function toNormalizedPoint(point: SeedWorldGeologyPoint, sizeMetres: number): SeedWorldPoint {
  return Object.freeze({ x: point.x / sizeMetres + 0.5, y: point.z / sizeMetres + 0.5 });
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function toGridPoint(
  point: SeedWorldGeologyPoint,
  sizeMetres: number,
  resolution: number
): Readonly<{ x: number; y: number }> {
  return Object.freeze({
    x: (point.x / sizeMetres + 0.5) * (resolution - 1),
    y: (point.z / sizeMetres + 0.5) * (resolution - 1)
  });
}

const CARDINAL_NEIGHBOURS = Object.freeze([
  Object.freeze([-1, 0] as const),
  Object.freeze([1, 0] as const),
  Object.freeze([0, -1] as const),
  Object.freeze([0, 1] as const)
]);
