import { planningGroundSurface } from "../../semantic-study/PlanningHeightmap";
import { planningWhiteboxes } from "../../semantic-study/PlanningWhiteboxes";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { distance, trackObserver, type DirectorRoute, type WalkTrack } from "./DirectorRoute";
export interface SamplingPolicy {
  spacingM: number;
  minimumSpacingM: number;
  maxSamples: number;
  visualDelta: number;
  turnDegrees: number;
  /** Historical report boundaries; current object sampling does not define aesthetic bands. */
  targets?: { start: number; end: number }[];
}
/** Base distance coverage plus geometry events; every interval will also receive a midpoint check. */
export function sampleSchedule<T extends SamplingPolicy>(
  plan: IslandPlan,
  route: DirectorRoute,
  track: WalkTrack,
  policy: T
) {
  const points = new Map<number, Set<string>>();
  const add = (d: number, reason: string) => {
    d = Math.round(Math.max(0, Math.min(track.lengthM, d)) * 1000) / 1000;
    const reasons = points.get(d) ?? new Set();
    reasons.add(reason);
    points.set(d, reasons);
  };
  add(0, "start");
  add(track.lengthM, "end");
  for (let d = policy.spacingM; d < track.lengthM; d += policy.spacingM) add(d, "distance");
  const event = (d: number, reason: string) => {
    for (const offset of [-policy.minimumSpacingM, 0, policy.minimumSpacingM]) add(d + offset, reason);
  };
  for (let d = 1; d < track.lengthM; d += 1) {
    const a = trackObserver(track, Math.max(0, d - 1)),
      b = trackObserver(track, d + 1);
    const angle =
      (Math.acos(Math.max(-1, Math.min(1, a.forward.x * b.forward.x + a.forward.z * b.forward.z))) * 180) / Math.PI;
    if (angle > policy.turnDegrees) event(d, "turn");
    const y = trackObserver(track, d).position.y,
      slopeBefore = y - a.position.y,
      slopeAfter = b.position.y - y;
    if (Math.abs(slopeAfter - slopeBefore) > 0.12) event(d, "grade");
  }
  for (const t of policy.targets ?? []) {
    event(t.start * track.lengthM, "target-boundary");
    event(t.end * track.lengthM, "target-boundary");
  }
  // Project nearby solid extents and declared road nodes onto the actual walked trajectory.
  const frames = track.frames.filter((_, i) => i % 30 === 0);
  const obstacles = planningWhiteboxes(plan, planningGroundSurface(plan).sample).flatMap((p) =>
    p.boxes.filter((b) => b.occlusion).map((b) => ({ p: b.center, r: Math.hypot(b.sizeX, b.sizeZ) / 2 }))
  );
  for (const o of [...obstacles, ...(plan.roadNetwork?.nodes ?? []).map((n) => ({ p: n.position, r: 0 }))]) {
    let best = Infinity,
      at = 0;
    for (const f of frames) {
      const d = distance(f.position, o.p);
      if (d < best) {
        best = d;
        at = f.distance;
      }
    }
    if (best < o.r + 6) {
      event(at - o.r, "near-obstacle");
      event(at, "near-obstacle");
      event(at + o.r, "near-obstacle");
    }
  }
  return [...points].sort((a, b) => a[0] - b[0]).map(([distance, reasons]) => ({ distance, reasons: [...reasons] }));
}
