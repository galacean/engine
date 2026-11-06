import type { PlanPoint } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { RoadGuidanceZone } from "@galacean/engine-world-planning/spatial/guidance/RoadGuidanceCues";
import { trackObserver, type WalkTrack } from "@galacean/engine-world-planning/spatial/director/DirectorRoute";

/** Project preplanned world-space cues onto the actual walked track, including reversed journeys. */
function trackDistance(track: WalkTrack, p: PlanPoint) {
  let best = Infinity,
    at = 0;
  for (let i = 1; i < track.frames.length; i++) {
    const a = track.frames[i - 1],
      b = track.frames[i],
      dx = b.position.x - a.position.x,
      dz = b.position.z - a.position.z;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.position.x) * dx + (p.z - a.position.z) * dz) / (dx * dx + dz * dz || 1))
    );
    const error = Math.hypot(p.x - a.position.x - t * dx, p.z - a.position.z - t * dz);
    if (error < best) {
      best = error;
      at = a.distance + t * (b.distance - a.distance);
    }
  }
  return at;
}
export function roadJourneySchedule(track: WalkTrack, cues: RoadGuidanceZone[], spacingM: number) {
  const points = new Map<number, Set<string>>();
  const add = (d: number, reason: string) => {
    const key = Math.round(Math.max(0, Math.min(track.lengthM, d)) * 1000) / 1000;
    const reasons = points.get(key) ?? new Set<string>();
    reasons.add(reason);
    points.set(key, reasons);
  };
  add(0, "start");
  add(track.lengthM, "end");
  for (let d = spacingM; d < track.lengthM; d += spacingM) add(d, "distance");
  for (const cue of cues) {
    const at = trackDistance(track, cue.point);
    add(at, `keypoint:${cue.id}`);
    for (const offset of [-8, -4, 4, 8]) add(at + offset, "keypoint-approach");
  }
  // Preserve turn/grade events without selecting thousands of individual rock extents.
  for (let d = 2; d < track.lengthM - 2; d += 2) {
    const a = trackObserver(track, d - 2),
      b = trackObserver(track, d + 2),
      c = trackObserver(track, d);
    const dot = a.forward.x * b.forward.x + a.forward.z * b.forward.z;
    if (dot < Math.cos((20 * Math.PI) / 180)) add(d, "turn");
    if (Math.abs(a.position.y + b.position.y - 2 * c.position.y) > 0.5) add(d, "grade");
  }
  return [...points].sort((a, b) => a[0] - b[0]).map(([distance, reasons]) => ({ distance, reasons: [...reasons] }));
}
/** Distance-weighted threshold crossing estimate, independent of adaptive sample count. */
export function coveredRouteFraction(
  samples: { distance: number; coverage: number }[],
  target: number,
  lengthM: number
) {
  let covered = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i],
      length = b.distance - a.distance;
    if (a.coverage >= target && b.coverage >= target) covered += length;
    else if (a.coverage >= target || b.coverage >= target) {
      const crossing = (target - a.coverage) / (b.coverage - a.coverage);
      covered += length * (a.coverage >= target ? crossing : 1 - crossing);
    }
  }
  return lengthM > 0 ? covered / lengthM : 0;
}
