import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { WayfindingPolicy } from "@galacean/engine-world-planning/spatial/guidance/WayfindingPolicy";
import { DIRECTOR_CAMERA, type DirectorRoute, type WalkTrack } from "@galacean/engine-world-planning/spatial/director/DirectorRoute";
import { roadJourneys } from "./RoadJourneys.ts";
import { roadJourneySchedule, coveredRouteFraction } from "./RoadJourneySampling.ts";
import { auditObjects } from "./DirectorObjectAudit.ts";
import type { DirectorSemanticReport } from "@galacean/engine-world-planning/spatial/director/DirectorSemantic";
import { directorSnapshotId } from "@galacean/engine-world-planning/spatial/director/DirectorSnapshot";

export const ROAD_AUDIT_SAMPLING = {
  spacingM: 16,
  minimumSpacingM: 2,
  maxSamples: 600,
  visualDelta: 0.08,
  turnDegrees: 12,
  maxDurationMs: 120000
};
export interface RoadJourneyResult {
  from: string;
  to: string;
  routeId: string;
  routeIds: string[];
  target: number;
  status: "pass" | "fail" | "incomplete";
  reached: boolean;
  reason: string;
  minimum?: number;
  mean?: number;
  distanceMean?: number;
  /** Whole-route measured length fraction; never an unweighted count of samples. */
  measuredRouteCoverage?: number;
  requestedRouteCoverage?: number;
  plannedRouteCoverage?: number;
  keypointCount?: number;
  keypointPassed?: number;
  keypointMinimum?: number;
  visualStatus?: "pass" | "fail" | "unassigned" | "disabled";
  policy?: WayfindingPolicy;
  lengthM?: number;
  samples: {
    distance: number;
    coverage: number;
    rock: number;
    building: number;
    raisedTerrain: number;
    reasons: string[];
  }[];
  unresolved?: [number, number][];
}
/** Check traversal in both directions. The visual target applies only to preplanned keypoints.
 * Open views elsewhere remain valid; whole-route coverage is measured separately by length.
 */
export async function auditRoadJourneys(input: {
  plan: IslandPlan;
  policy: WayfindingPolicy;
  signal: AbortSignal;
  aspect: number;
  routePolicy?: (routeId: string) => WayfindingPolicy;
  prepare: (from: string, to: string, routeId: string) => Promise<{ route: DirectorRoute; track: WalkTrack }>;
  measure: (track: WalkTrack, distance: number, from: string, to: string) => Promise<DirectorSemanticReport>;
  progress: (message: string, results: RoadJourneyResult[]) => void;
}) {
  const pairs = roadJourneys(input.plan);
  const results: RoadJourneyResult[] = [];
  const snapshotId = directorSnapshotId(input.plan);
  for (const [index, pair] of pairs.entries()) {
    input.signal.throwIfAborted();
    const row: RoadJourneyResult = {
      ...pair,
      routeIds: [],
      target: (input.routePolicy?.(pair.routeId) ?? input.policy).targetCoverage,
      status: "fail",
      reached: false,
      reason: "",
      samples: []
    };
    row.policy = input.routePolicy?.(pair.routeId) ?? input.policy;
    input.progress(`道路旅程 ${index + 1}/${pairs.length} · ${pair.from} → ${pair.to}`, results);
    try {
      const { route, track } = await input.prepare(pair.from, pair.to, pair.routeId);
      row.routeIds = route.routeIds;
      row.lengthM = track.lengthM;
      row.reached = track.reached;
      row.reason = track.reason;
      if (track.reached) {
        const guidance = input.plan.visualGuidance?.find((g) => g.sourceId === pair.routeId);
        const cues = row.policy!.routeCoverage > 0 ? (guidance?.keypoints ?? []) : [];
        row.requestedRouteCoverage = row.policy!.routeCoverage;
        row.plannedRouteCoverage = guidance?.plannedRouteCoverage ?? 0;
        row.keypointCount = cues.length;
        const capture = await auditObjects({
          signal: input.signal,
          policy: ROAD_AUDIT_SAMPLING,
          schedule: roadJourneySchedule(track, cues, ROAD_AUDIT_SAMPLING.spacingM),
          measure: async (distance) => {
            const semantic = await input.measure(track, distance, pair.from, pair.to);
            return {
              version: 2,
              groups: { red: semantic.blockedScreen, blue: semantic.originVisible, green: semantic.targetVisible },
              visibleTarget: semantic.targetVisible,
              projectedTarget: semantic.targetProjected,
              occlusion: semantic.targetOcclusion,
              contributions: {},
              pixels: semantic.pixels,
              width: semantic.width,
              height: semantic.height,
              semantic
            };
          },
          progress: (n) => input.progress(`道路旅程 ${index + 1}/${pairs.length} · 已采样 ${n} 帧`, results)
        });
        row.samples = capture.samples.map((s) => ({
          distance: s.distance,
          coverage: s.measurement.semantic!.solidScreen,
          rock: s.measurement.semantic!.categories.rock,
          building: s.measurement.semantic!.categories.building,
          raisedTerrain: s.measurement.semantic!.raisedTerrain,
          reasons: s.reasons
        }));
        row.minimum = Math.min(...row.samples.map((s) => s.coverage));
        row.mean = row.samples.reduce((n, s) => n + s.coverage, 0) / Math.max(1, row.samples.length);
        row.distanceMean =
          row.samples
            .slice(1)
            .reduce(
              (sum, s, i) =>
                sum + ((s.distance - row.samples[i].distance) * (s.coverage + row.samples[i].coverage)) / 2,
              0
            ) / Math.max(0.001, track.lengthM);
        row.measuredRouteCoverage = coveredRouteFraction(row.samples, row.target, track.lengthM);
        const keypoints = row.samples.filter((s) => s.reasons.some((r) => r.startsWith("keypoint:")));
        row.keypointPassed = keypoints.filter((s) => s.coverage >= row.target).length;
        row.keypointMinimum = keypoints.length ? Math.min(...keypoints.map((s) => s.coverage)) : undefined;
        row.visualStatus =
          row.policy!.routeCoverage === 0
            ? "disabled"
            : !cues.length
              ? "unassigned"
              : row.keypointPassed === cues.length
                ? "pass"
                : "fail";
        row.unresolved = capture.unresolved;
        row.status =
          capture.status !== "complete" || row.visualStatus === "unassigned"
            ? "incomplete"
            : row.visualStatus === "fail"
              ? "fail"
              : "pass";
      }
    } catch (error) {
      input.signal.throwIfAborted();
      row.reason = String(error);
    }
    results.push(row);
  }
  return {
    snapshotId,
    seed: input.plan.parameters.seed,
    policy: input.policy,
    target: input.policy.targetCoverage,
    scope: "each inter-POI road, both directions; visual target only at preplanned guidance keypoints",
    routeCoverageMetric:
      "length fraction above target, linearly interpolated between GPU samples; not sample-count fraction",
    acceptance: "traversal and assigned keypoints; requested/planned/measured route fractions reported separately",
    metric: "rock + building + terrain above horizontal camera horizon; screen pixels",
    camera: { ...DIRECTOR_CAMERA, aspect: input.aspect, speedMps: 4 },
    sampling: ROAD_AUDIT_SAMPLING,
    status: pairs.length && results.every((r) => r.status === "pass") ? "pass" : "fail",
    results
  };
}
