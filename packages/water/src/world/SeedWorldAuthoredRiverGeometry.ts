import { roundTiesToEven } from "./WaterMetricEncodingV1";

/** Structural river geometry input kept independent from the Authoring aggregate to avoid a module cycle. */
export interface SeedWorldAuthoredRiverGeometryInputV1 {
  readonly startXOffsetMillimetres: number;
  readonly startZOffsetMillimetres: number;
  readonly headingMilliDegrees: number;
  readonly lengthMillimetres: number;
  readonly widthMillimetres: number;
  readonly depthMillimetres: number;
  readonly meanderPermille: number;
}

export interface SeedWorldAuthoredRiverPointV1 {
  readonly x: number;
  readonly z: number;
}

export interface SeedWorldAuthoredRiverBoundsV1 {
  readonly minimumX: number;
  readonly minimumZ: number;
  readonly maximumX: number;
  readonly maximumZ: number;
}

const CENTERLINE_POINT_COUNT = 7;
const CENTERLINE_CACHE = new WeakMap<object, Map<number, readonly Readonly<SeedWorldAuthoredRiverPointV1>[]>>();

/** One deterministic world-space centerline shared by terrain carving and Water publication. */
export function resolveSeedWorldAuthoredRiverCenterlineV1(
  river: Readonly<SeedWorldAuthoredRiverGeometryInputV1>,
  sizeMetres: number
): readonly Readonly<SeedWorldAuthoredRiverPointV1>[] {
  const cached = CENTERLINE_CACHE.get(river)?.get(sizeMetres);
  if (cached) return cached;
  const half = sizeMetres * 0.5;
  const startX = river.startXOffsetMillimetres / 1_000 - half;
  const startZ = river.startZOffsetMillimetres / 1_000 - half;
  const heading = (river.headingMilliDegrees / 1_000 / 180) * Math.PI;
  const forwardX = Math.sin(heading);
  const forwardZ = -Math.cos(heading);
  const rightX = -forwardZ;
  const rightZ = forwardX;
  const length = river.lengthMillimetres / 1_000;
  const meanderAmplitude = length * 0.12 * (river.meanderPermille / 1_000);
  const result = Object.freeze(
    Array.from({ length: CENTERLINE_POINT_COUNT }, (_, index) => {
      const t = index / (CENTERLINE_POINT_COUNT - 1);
      const lateral = Math.sin(t * Math.PI * 2) * meanderAmplitude;
      return Object.freeze({
        x: startX + forwardX * length * t + rightX * lateral,
        z: startZ + forwardZ * length * t + rightZ * lateral
      });
    })
  );
  let bySize = CENTERLINE_CACHE.get(river);
  if (!bySize) {
    bySize = new Map();
    CENTERLINE_CACHE.set(river, bySize);
  }
  bySize.set(sizeMetres, result);
  return result;
}

export function seedWorldAuthoredRiverBoundsV1(
  river: Readonly<SeedWorldAuthoredRiverGeometryInputV1>,
  sizeMetres: number
): Readonly<SeedWorldAuthoredRiverBoundsV1> {
  const points = resolveSeedWorldAuthoredRiverCenterlineV1(river, sizeMetres);
  const padding = river.widthMillimetres / 1_000 + Math.min(10, river.widthMillimetres / 1_000);
  return Object.freeze({
    minimumX: Math.min(...points.map(({ x }) => x)) - padding,
    minimumZ: Math.min(...points.map(({ z }) => z)) - padding,
    maximumX: Math.max(...points.map(({ x }) => x)) + padding,
    maximumZ: Math.max(...points.map(({ z }) => z)) + padding
  });
}

/** Smooth channel profile: full authored depth on centerline, zero outside water plus bank feather. */
export function sampleSeedWorldAuthoredRiverHeightDeltaMillimetresV1(
  river: Readonly<SeedWorldAuthoredRiverGeometryInputV1>,
  sizeMetres: number,
  xOffsetMillimetres: number,
  zOffsetMillimetres: number
): number {
  const halfMillimetres = sizeMetres * 500;
  const x = (xOffsetMillimetres - halfMillimetres) / 1_000;
  const z = (zOffsetMillimetres - halfMillimetres) / 1_000;
  const distance = seedWorldAuthoredRiverDistanceV1(river, sizeMetres, x, z);
  const halfWidth = river.widthMillimetres / 2_000;
  const feather = Math.min(10, Math.max(1, river.widthMillimetres / 1_000));
  if (distance >= halfWidth + feather) return 0;
  if (distance <= halfWidth) return -river.depthMillimetres;
  const ratio = 1 - (distance - halfWidth) / feather;
  const smooth = ratio * ratio * (3 - 2 * ratio);
  return roundTiesToEven(-river.depthMillimetres * smooth, "riverChannelDelta");
}

/** Shortest world-space distance to the authored centerline. */
export function seedWorldAuthoredRiverDistanceV1(
  river: Readonly<SeedWorldAuthoredRiverGeometryInputV1>,
  sizeMetres: number,
  worldX: number,
  worldZ: number
): number {
  const points = resolveSeedWorldAuthoredRiverCenterlineV1(river, sizeMetres);
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index++) {
    distance = Math.min(distance, distanceToSegment(worldX, worldZ, points[index - 1]!, points[index]!));
  }
  return distance;
}

function distanceToSegment(
  x: number,
  z: number,
  start: Readonly<SeedWorldAuthoredRiverPointV1>,
  end: Readonly<SeedWorldAuthoredRiverPointV1>
): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const t =
    lengthSquared <= 1e-9
      ? 0
      : Math.min(1, Math.max(0, ((x - start.x) * deltaX + (z - start.z) * deltaZ) / lengthSquared));
  return Math.hypot(x - (start.x + deltaX * t), z - (start.z + deltaZ * t));
}
