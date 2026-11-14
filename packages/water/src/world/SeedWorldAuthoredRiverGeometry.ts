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
