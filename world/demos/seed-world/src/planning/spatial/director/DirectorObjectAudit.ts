import type { ObjectPixelMeasurement } from "@galacean/engine-world-planning/spatial/director/DirectorMask";
import type { SamplingPolicy } from "@galacean/engine-world-planning/spatial/director/DirectorSampling";
import settings from "./sampling.json";
export const OBJECT_SAMPLING = settings;
export interface ObjectSample {
  distance: number;
  reasons: string[];
  measurement: ObjectPixelMeasurement;
}
/** Sampling completion is unrelated to visual quality. A finite grid cannot prove no sub-grid event exists. */
export interface ObjectAudit {
  version: 2;
  status: "complete" | "incomplete";
  samples: ObjectSample[];
  unresolved: [number, number][];
  elapsedMs: number;
  resolutionM: number;
}
export function visualDifference(a: ObjectPixelMeasurement, b: ObjectPixelMeasurement): number {
  const semanticDifference =
    a.semantic && b.semantic
      ? Math.max(
          ...a.semantic.counts.map((n, i) => Math.abs(n / a.pixels - b.semantic!.counts[i] / b.pixels)),
          ...a.semantic.compositionGrid.flatMap((cell, i) =>
            cell.map((n, j) => Math.abs(n / a.pixels - b.semantic!.compositionGrid[i][j] / b.pixels) * 9)
          ),
          ...a.semantic.depthBands.map((n, i) => Math.abs(n / a.pixels - b.semantic!.depthBands[i] / b.pixels))
        )
      : 0;
  return Math.max(
    semanticDifference,
    ...(["red", "blue", "green"] as const).map((k) => Math.abs(a.groups[k] - b.groups[k])),
    Math.abs(a.visibleTarget - b.visibleTarget),
    Math.abs(a.projectedTarget - b.projectedTarget),
    a.occlusion === null || b.occlusion === null
      ? a.occlusion === b.occlusion
        ? 0
        : 1
      : Math.abs(a.occlusion - b.occlusion)
  );
}
/** Input geometry schedule comes from the shared sampler; capture uses the same camera as playback. */
export async function auditObjects(input: {
  schedule: { distance: number; reasons: string[] }[];
  measure: (distance: number) => ObjectPixelMeasurement | Promise<ObjectPixelMeasurement>;
  policy?: SamplingPolicy & { maxDurationMs: number };
  signal?: AbortSignal;
  progress?: (count: number) => void;
}): Promise<ObjectAudit> {
  const p = input.policy ?? OBJECT_SAMPLING;
  if (
    ![p.spacingM, p.minimumSpacingM, p.maxSamples, p.visualDelta, p.turnDegrees, p.maxDurationMs].every(
      Number.isFinite
    ) ||
    p.spacingM <= 0 ||
    p.minimumSpacingM < 0.01 ||
    p.minimumSpacingM > p.spacingM ||
    !Number.isInteger(p.maxSamples) ||
    p.maxSamples < 2 ||
    p.maxSamples > 10000 ||
    p.visualDelta <= 0 ||
    p.maxDurationMs <= 0
  )
    throw Error("采样预算无效");
  const start = performance.now(),
    samples = new Map<number, ObjectSample>(),
    unresolved: [number, number][] = [];
  const key = (d: number) => Math.round(d * 1000) / 1000;
  const check = () => {
    if (input.signal?.aborted) throw Error("沿途测量已取消");
  };
  const sample = async (d: number, reasons: string[]) => {
    check();
    d = key(d);
    const existing = samples.get(d);
    if (existing) {
      existing.reasons = [...new Set([...existing.reasons, ...reasons])];
      return existing;
    }
    if (samples.size >= p.maxSamples || performance.now() - start >= p.maxDurationMs) return null;
    const item = { distance: d, reasons, measurement: await input.measure(d) };
    samples.set(d, item);
    input.progress?.(samples.size);
    // Yield every measurement: camera/render capture may be expensive, and cancel must remain reachable.
    await new Promise((r) => setTimeout(r, 0));
    check();
    return item;
  };
  const schedule = [...input.schedule].sort((a, b) => a.distance - b.distance);
  if (!schedule.length || schedule.some((s) => !Number.isFinite(s.distance) || s.distance < 0))
    throw Error("缺少有效路线采样点");
  for (const s of schedule) if (!(await sample(s.distance, s.reasons))) unresolved.push([s.distance, s.distance]);
  const refine = async (a: number, b: number): Promise<void> => {
    check();
    if (b - a <= p.minimumSpacingM + 1e-6) return;
    const left = samples.get(key(a)),
      right = samples.get(key(b));
    if (!left || !right) {
      unresolved.push([a, b]);
      return;
    }
    const mid = await sample((a + b) / 2, ["visual-midpoint"]);
    if (!mid) {
      unresolved.push([a, b]);
      return;
    }
    if (visualDifference(left.measurement, mid.measurement) > p.visualDelta) await refine(a, mid.distance);
    if (visualDifference(mid.measurement, right.measurement) > p.visualDelta) await refine(mid.distance, b);
  };
  for (let i = 1; i < schedule.length; i++) await refine(schedule[i - 1].distance, schedule[i].distance);
  return {
    version: 2,
    status: unresolved.length ? "incomplete" : "complete",
    samples: [...samples.values()].sort((a, b) => a.distance - b.distance),
    unresolved,
    elapsedMs: performance.now() - start,
    resolutionM: p.minimumSpacingM
  };
}
