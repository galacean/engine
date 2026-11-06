import type { RiverSamplePoint } from "./types";
import { RIVER_GEOMETRY_EPSILON, RIVER_RIBBON_MITER_LIMIT } from "./constants";

type RiverRibbonSample = Pick<RiverSamplePoint, "position" | "tangent">;

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

function segmentNormal(from: RiverRibbonSample, to: RiverRibbonSample): readonly [number, number] | undefined {
  const direction = normalize2(to.position.x - from.position.x, to.position.z - from.position.z);
  return direction ? ([-direction[1], direction[0]] as const) : undefined;
}

function tangentNormal(sample: RiverRibbonSample): readonly [number, number] {
  const normal = normalize2(-sample.tangent.z, sample.tangent.x);
  return normal ?? ([0, 1] as const);
}

/** Resolves a bounded XZ miter. Near reversals fall back to a capped bisector. */
function resolveLocalJoinFrame(samples: readonly RiverRibbonSample[], sampleIndex: number): RiverRibbonJoinFrame {
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

function isCorner(samples: readonly RiverRibbonSample[], index: number): boolean {
  if (index === 0 || index === samples.length - 1) return true;
  const a = segmentNormal(samples[index - 1], samples[index]);
  const b = segmentNormal(samples[index], samples[index + 1]);
  return !a || !b || a[0] * b[0] + a[1] * b[1] < 1 - RIVER_GEOMETRY_EPSILON;
}

function interpolateJoin(
  samples: readonly RiverRibbonSample[],
  sampleIndex: number,
  start: number,
  end: number,
  a: RiverRibbonJoinFrame,
  b: RiverRibbonJoinFrame
): RiverRibbonJoinFrame {
  const p = samples[sampleIndex].position,
    from = samples[start].position,
    to = samples[end].position;
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const t = Math.min(1, Math.hypot(p.x - from.x, p.z - from.z) / Math.max(length, RIVER_GEOMETRY_EPSILON));
  const x = a.normalX * a.widthScale * (1 - t) + b.normalX * b.widthScale * t;
  const z = a.normalZ * a.widthScale * (1 - t) + b.normalZ * b.widthScale * t;
  const scale = Math.hypot(x, z);
  if (scale <= RIVER_GEOMETRY_EPSILON) return resolveLocalJoinFrame(samples, sampleIndex);
  return { normalX: x / scale, normalZ: z / scale, widthScale: scale, usedFallback: false };
}

/** Resolve every straight span once, preserving its endpoint miters in O(N) work.
 * Geometry and diagnostics share this result rather than searching from every row. */
export function resolveRiverRibbonJoinFrames(samples: readonly RiverRibbonSample[]): RiverRibbonJoinFrame[] {
  if (!samples.length) return [];
  const frames: RiverRibbonJoinFrame[] = new Array(samples.length);
  let start = 0;
  frames[0] = resolveLocalJoinFrame(samples, 0);
  for (let end = 1; end < samples.length; end++) {
    if (!isCorner(samples, end)) continue;
    frames[end] = resolveLocalJoinFrame(samples, end);
    for (let index = start + 1; index < end; index++)
      frames[index] = interpolateJoin(samples, index, start, end, frames[start], frames[end]);
    start = end;
  }
  return frames;
}

/** Single-point access for junction endpoints. Whole-reach consumers use the batch function. */
export function resolveRiverRibbonJoinFrame(
  samples: readonly RiverRibbonSample[],
  sampleIndex: number
): RiverRibbonJoinFrame {
  if (isCorner(samples, sampleIndex)) return resolveLocalJoinFrame(samples, sampleIndex);
  return resolveRiverRibbonJoinFrames(samples)[sampleIndex];
}
