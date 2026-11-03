import { directorSnapshotId } from "./DirectorSnapshot";
export { directorSnapshotId } from "./DirectorSnapshot";
import { sampleSchedule } from "./DirectorSampling";
export { sampleSchedule } from "./DirectorSampling";
import { planningGroundSurface } from "../../semantic-study/PlanningHeightmap";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { poiMemberIds } from "../../semantic-study/PoiContents";
import { planningWhiteboxes } from "../../semantic-study/PlanningWhiteboxes";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { DIRECTOR_CAMERA, distance, type DirectorRoute, type WalkTrack } from "./DirectorRoute";
import type { PixelMeasurement, RoleMap } from "./DirectorMask";
export interface TargetBand {
  start: number;
  end: number;
  role: "push" | "pull" | "cue";
  min: number;
  max: number;
}
export interface DirectorPolicy {
  version: 1;
  spacingM: number;
  minimumSpacingM: number;
  maxSamples: number;
  visualDelta: number;
  turnDegrees: number;
  targets: TargetBand[];
  randomness: number;
}
export const DEFAULT_DIRECTOR_POLICY: DirectorPolicy = {
  version: 1,
  spacingM: 4,
  minimumSpacingM: 0.5,
  maxSamples: 800,
  visualDelta: 0.04,
  turnDegrees: 12,
  randomness: 0,
  targets: [
    { start: 0.25, end: 0.65, role: "push", min: 0.1, max: 0.5 },
    { start: 0.75, end: 1, role: "pull", min: 0.005, max: 0.6 }
  ]
};
export interface AuditSample {
  distance: number;
  fraction: number;
  reasons: string[];
  measurement: PixelMeasurement;
  failures: string[];
}
export interface DirectorReport {
  snapshotId: string;
  camera: typeof DIRECTOR_CAMERA;
  version: 1;
  revision: number;
  seed: number;
  route: DirectorRoute;
  speedMps: number;
  policy: DirectorPolicy;
  roles: RoleMap;
  status: "pass" | "fail" | "incomplete";
  samples: AuditSample[];
  unresolved: [number, number][];
  walk: { reached: boolean; reason: string };
  elapsedMs: number;
}
/** Stable per-relationship random targets. Strength changes do not alter another relationship's random stream. */
export function routePolicy(base: DirectorPolicy, seed: number, id: string): DirectorPolicy {
  const policy = structuredClone(base);
  if (!Number.isFinite(policy.randomness) || policy.randomness < 0 || policy.randomness > 1)
    throw new Error("随机变化须在0–1");
  for (const [i, t] of policy.targets.entries()) {
    const delta = (settlementRandom(seed, `${id}:target:${i}`) * 2 - 1) * policy.randomness * 0.1;
    t.min = Math.max(0, t.min + delta);
    t.max = Math.max(t.min, Math.min(1, t.max + delta));
  }
  if (
    !(
      [policy.spacingM, policy.minimumSpacingM, policy.maxSamples, policy.visualDelta, policy.turnDegrees].every(
        Number.isFinite
      ) &&
      Number.isInteger(policy.maxSamples) &&
      policy.targets.length > 0 &&
      policy.spacingM > 0 &&
      policy.minimumSpacingM > 0 &&
      policy.minimumSpacingM <= policy.spacingM &&
      policy.maxSamples >= 3 &&
      policy.maxSamples <= 10000 &&
      policy.visualDelta > 0 &&
      policy.turnDegrees > 0
    )
  )
    throw new Error("采样配置无效");
  for (const t of policy.targets)
    if (
      !["push", "pull", "cue"].includes(t.role) ||
      ![t.start, t.end, t.min, t.max].every(Number.isFinite) ||
      t.start < 0 ||
      t.end > 1 ||
      t.start >= t.end ||
      t.min < 0 ||
      t.max > 1 ||
      t.min > t.max
    )
      throw new Error("目标区间无效");
  return policy;
}
/** Route-local role associations. Geometry kind does not determine its role in another relationship. */
export function defaultRoles(plan: IslandPlan, route: DirectorRoute): RoleMap {
  const roles: RoleMap = {},
    sites = plan.poiDistribution?.sites ?? [],
    target = sites.find((p) => p.id === route.to);
  if (target) {
    const members = new Set(poiMemberIds(plan, target));
    for (const item of [...plan.buildings, ...plan.rocks, ...(plan.landscapes ?? []).filter((p) => p.role === "poi")])
      if (members.has(item.id)) roles[item.id] = "pull";
  }
  const near = (p: { x: number; z: number }, margin: number) =>
    route.points.slice(1).some((b, i) => {
      const a = route.points[i],
        dx = b.x - a.x,
        dz = b.z - a.z,
        t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      return distance(p, { x: a.x + t * dx, z: a.z + t * dz }) < margin;
    });
  for (const part of planningWhiteboxes(plan, planningGroundSurface(plan).sample))
    if (!roles[part.id] && part.boxes.some((b) => b.occlusion && near(b.center, 40))) {
      const small = sites.some((p) => p.tier === "small" && poiMemberIds(plan, p).includes(part.id));
      roles[part.id] = small ? "cue" : "push";
    }
  return roles;
}
/** Report range failures individually; missing target projection never becomes a successful visibility assertion. */
export function sampleFailures(m: PixelMeasurement, fraction: number, policy: DirectorPolicy): string[] {
  return policy.targets
    .filter((t) => fraction >= t.start - 1e-6 && fraction <= t.end + 1e-6)
    .flatMap((t) => {
      const n = m[t.role];
      return n < t.min || n > t.max
        ? [`${t.role} ${(n * 100).toFixed(2)}% 不在 ${(t.min * 100).toFixed(1)}–${(t.max * 100).toFixed(1)}%`]
        : [];
    });
}
/** Bounded asynchronous GPU audit. Unknown intervals stay incomplete, never silently pass. */
export async function auditDirector(input: {
  plan: IslandPlan;
  route: DirectorRoute;
  track: WalkTrack;
  revision: number;
  policy: DirectorPolicy;
  roles: RoleMap;
  measure: (distance: number) => PixelMeasurement;
  signal?: AbortSignal;
  progress?: (count: number) => void;
}): Promise<DirectorReport> {
  const { plan, route, track, revision, roles, measure, signal } = input,
    policy = routePolicy(input.policy, plan.parameters.seed, route.id),
    started = performance.now(),
    samples = new Map<number, AuditSample>(),
    unresolved: [number, number][] = [];
  const sample = async (d: number, reasons: string[]) => {
    if (signal?.aborted) throw new Error("测试已取消");
    d = Math.round(d * 1000) / 1000;
    if (samples.has(d)) {
      samples.get(d)!.reasons.push(...reasons);
      return samples.get(d)!;
    }
    if (samples.size >= policy.maxSamples) return null;
    const measurement = measure(d),
      fraction = d / (track.lengthM || 1),
      s = { distance: d, fraction, reasons, measurement, failures: sampleFailures(measurement, fraction, policy) };
    samples.set(d, s);
    if (samples.size % 8 === 0) {
      input.progress?.(samples.size);
      await new Promise((r) => setTimeout(r, 0));
    }
    return s;
  };
  const schedule = sampleSchedule(plan, route, track, policy);
  for (const s of schedule)
    if (!(await sample(s.distance, s.reasons))) {
      unresolved.push([s.distance, s.distance]);
    }
  const refine = async (a: number, b: number, always: boolean): Promise<void> => {
    if (b - a <= policy.minimumSpacingM + 1e-6) return;
    const left = samples.get(Math.round(a * 1000) / 1000),
      right = samples.get(Math.round(b * 1000) / 1000);
    if (!left || !right) {
      unresolved.push([a, b]);
      return;
    }
    const delta = (x: AuditSample, y: AuditSample) =>
      Math.max(
        ...(["push", "pull", "cue"] as const).map((k) => Math.abs(x.measurement[k] - y.measurement[k])),
        Math.abs((x.measurement.occlusion ?? 0) - (y.measurement.occlusion ?? 0))
      );
    if (!always && delta(left, right) <= policy.visualDelta && left.failures.join() === right.failures.join()) return;
    const mid = (a + b) / 2,
      m = await sample(mid, ["visual-midpoint"]);
    if (!m) {
      unresolved.push([a, b]);
      return;
    }
    if (delta(left, m) > policy.visualDelta || left.failures.join() !== m.failures.join())
      await refine(a, m.distance, true);
    if (delta(m, right) > policy.visualDelta || m.failures.join() !== right.failures.join())
      await refine(m.distance, b, true);
  };
  for (let i = 1; i < schedule.length; i++) await refine(schedule[i - 1].distance, schedule[i].distance, true);
  const sorted = [...samples.values()].sort((a, b) => a.distance - b.distance);
  return {
    version: 1,
    snapshotId: directorSnapshotId(plan),
    camera: DIRECTOR_CAMERA,
    revision,
    seed: plan.parameters.seed,
    route,
    speedMps: track.speedMps,
    policy,
    roles,
    status: unresolved.length
      ? "incomplete"
      : !track.reached || !sorted.length || sorted.some((s) => s.failures.length)
        ? "fail"
        : "pass",
    samples: sorted,
    unresolved,
    walk: { reached: track.reached, reason: track.reason },
    elapsedMs: performance.now() - started
  };
}
