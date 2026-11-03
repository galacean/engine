import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { pathSample } from "./GuidancePolicy";

export interface RoadGuidanceCue {
  id: string;
  kind: "turn";
  distance: number;
  point: PlanPoint;
  turnDegrees: number;
}
/** Choose geometric decision locations BEFORE looking at pixels. Smooth over grid-sized bends,
 * then suppress nearby peaks so one bend cannot become a chain of corridor walls.
 * Straight/open sections do not acquire a quota simply because they have length.
 */
export function roadGuidanceCues(points: PlanPoint[], spacingM: number): RoadGuidanceCue[] {
  const length = points.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - points[i].x, p.z - points[i].z), 0);
  if (length < 48) return [];
  const candidates: RoadGuidanceCue[] = [];
  for (let d = 24; d <= length - 24; d += 4) {
    const a = pathSample(points, (d - 16) / length).point;
    const b = pathSample(points, d / length).point;
    const c = pathSample(points, (d + 16) / length).point;
    const ux = b.x - a.x,
      uz = b.z - a.z,
      vx = c.x - b.x,
      vz = c.z - b.z;
    const angle = (Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz) * 180) / Math.PI;
    if (Math.abs(angle) < 30) continue;
    candidates.push({
      id: `turn:${Math.round(b.x * 10)}:${Math.round(b.z * 10)}`,
      kind: "turn",
      distance: d,
      point: b,
      turnDegrees: angle
    });
  }
  const selected: RoadGuidanceCue[] = [];
  for (const cue of candidates.sort(
    (a, b) => Math.abs(b.turnDegrees) - Math.abs(a.turnDegrees) || a.distance - b.distance
  ))
    if (selected.every((s) => Math.abs(s.distance - cue.distance) >= spacingM)) selected.push(cue);
  return selected.sort((a, b) => a.distance - b.distance);
}

export interface RoadGuidanceZone extends RoadGuidanceCue {
  startM: number;
  endM: number;
}
/** Allocate a length budget to the strongest separated bends, with gaps between zones.
 * Insufficient geometric cues are reported as a shortfall, never filled with arbitrary walls.
 */
export function roadGuidanceZones(
  points: PlanPoint[],
  policy: { routeCoverage: number; keypointSpacingM: number; cueSpanM: number }
) {
  const lengthM = points.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - points[i].x, p.z - points[i].z), 0);
  if (
    ![policy.routeCoverage, policy.keypointSpacingM, policy.cueSpanM].every(Number.isFinite) ||
    policy.routeCoverage < 0 ||
    policy.routeCoverage > 1 ||
    policy.keypointSpacingM <= 0 ||
    policy.cueSpanM <= 0
  )
    throw Error("引导区域参数无效");
  let remaining = lengthM * policy.routeCoverage;
  const zones: RoadGuidanceZone[] = [];
  for (const cue of roadGuidanceCues(points, policy.keypointSpacingM).sort(
    (a, b) => Math.abs(b.turnDegrees) - Math.abs(a.turnDegrees) || a.distance - b.distance
  )) {
    if (remaining < 1e-6) break;
    const span = Math.min(
      remaining,
      policy.cueSpanM,
      policy.keypointSpacingM * 0.8,
      2 * Math.min(cue.distance - 6, lengthM - 6 - cue.distance)
    );
    if (span <= 0) continue;
    zones.push({ ...cue, startM: cue.distance - span / 2, endM: cue.distance + span / 2 });
    remaining -= span;
  }
  return {
    zones: zones.sort((a, b) => a.distance - b.distance),
    lengthM,
    requestedFraction: policy.routeCoverage,
    plannedFraction: lengthM ? (lengthM * policy.routeCoverage - remaining) / lengthM : 0
  };
}
