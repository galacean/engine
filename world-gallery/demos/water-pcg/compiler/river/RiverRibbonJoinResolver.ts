import type { RiverSamplePoint } from "./types";
import { RIVER_GEOMETRY_EPSILON, RIVER_RIBBON_MITER_LIMIT } from "./constants";

export interface RiverRibbonJoinFrame {
  readonly normalX: number;
  readonly normalZ: number;
  readonly widthScale: number;
  readonly usedFallback: boolean;
}

function normalize2(x: number, z: number): readonly [number, number] | undefined {
  const length = Math.hypot(x, z);
  if (length <= RIVER_GEOMETRY_EPSILON) return undefined;
  return [x / length, z / length];
}

function segmentNormal(from: RiverSamplePoint, to: RiverSamplePoint): readonly [number, number] | undefined {
  const direction = normalize2(to.position.x - from.position.x, to.position.z - from.position.z);
  return direction ? ([-direction[1], direction[0]] as const) : undefined;
}

function tangentNormal(sample: RiverSamplePoint): readonly [number, number] {
  const normal = normalize2(-sample.tangent.z, sample.tangent.x);
  return normal ?? ([0, 1] as const);
}

/** Resolves a bounded XZ miter. Near reversals fall back to a capped bisector. */
export function resolveRiverRibbonJoinFrame(
  samples: readonly RiverSamplePoint[],
  sampleIndex: number
): RiverRibbonJoinFrame {
  const sample = samples[sampleIndex];
  const previousNormal = sampleIndex > 0 ? segmentNormal(samples[sampleIndex - 1], sample) : undefined;
  const nextNormal = sampleIndex + 1 < samples.length ? segmentNormal(sample, samples[sampleIndex + 1]) : undefined;
  if (!previousNormal || !nextNormal) {
    const normal = previousNormal ?? nextNormal ?? tangentNormal(sample);
    return { normalX: normal[0], normalZ: normal[1], widthScale: 1, usedFallback: false };
  }

  const bisector = normalize2(previousNormal[0] + nextNormal[0], previousNormal[1] + nextNormal[1]);
  if (!bisector) {
    const normal = tangentNormal(sample);
    return {
      normalX: normal[0],
      normalZ: normal[1],
      widthScale: RIVER_RIBBON_MITER_LIMIT,
      usedFallback: true
    };
  }

  const denominator = Math.abs(bisector[0] * nextNormal[0] + bisector[1] * nextNormal[1]);
  const unclampedScale = denominator > RIVER_GEOMETRY_EPSILON ? 1 / denominator : Number.POSITIVE_INFINITY;
  const usedFallback = !Number.isFinite(unclampedScale) || unclampedScale > RIVER_RIBBON_MITER_LIMIT;
  return {
    normalX: bisector[0],
    normalZ: bisector[1],
    widthScale: usedFallback ? RIVER_RIBBON_MITER_LIMIT : unclampedScale,
    usedFallback
  };
}
