import { SEED_WORLD_CANYON_BANK_PAIR_MAXIMUM_GUIDE_DELTA, type SeedWorldGeologyLayout } from "@galacean/engine-world-planning/runtime/SeedWorldGeologyLayout";
import { SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS } from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblySolver";
import { SEED_WORLD_ROCK_TARGET_SELECTION_DEFAULTS, type SeedWorldRockCompilation } from "./SeedWorldRockCompiler.ts";

/** Stable category emitted by the deterministic rock-layout audit. */
export type SeedWorldRockAuditViolationCode =
  | "target-rock-cardinality"
  | "assembly-solve-failure"
  | "uncovered-crest"
  | "insufficient-assigned-shoulder-coverage"
  | "duplicate-convexity-claim"
  | "insufficient-contact"
  | "unsupported-root"
  | "tail-detail-underexposed"
  | "surface-depth-conflict"
  | "excessive-member-overlap"
  | "excessive-neighbor-occlusion"
  | "cross-target-visible-overlap"
  | "unpaired-canyon-bank"
  | "canyon-cross-section"
  | "canyon-direction"
  | "obb-orthogonality"
  | "excessive-burial";

/** One actionable quantitative failure with stable target identities. */
export interface SeedWorldRockAuditViolation {
  /** Machine-readable failure category. */
  readonly code: SeedWorldRockAuditViolationCode;
  /** Convexities involved in this failure. */
  readonly targetIds: readonly string[];
  /** Exact solved members involved when the failure is pairwise at rock granularity. */
  readonly rockIds?: readonly string[];
  /** Concise evidence suitable for the in-page acceptance panel. */
  readonly message: string;
}

/** Thresholds shared by the runtime audit and its visible report. */
export interface SeedWorldRockAuditThresholds {
  /** Lowest final OBB support contact accepted as terrain-integrated. */
  readonly minimumContactRatio: number;
  /** Lowest physical-shoulder fraction accepted after cross-target ownership is resolved. */
  readonly minimumAssignedShoulderCoverageRatio: number;
  /** Lowest OBB surface fraction that must remain independently visible. */
  readonly minimumGlobalVisibilityRatio: number;
  /** Largest above-Hfinal OBB surface penetration allowed between distinct terrain targets. */
  readonly maximumCrossTargetVisibleOverlapRatio: number;
  /** Largest gap in the required root-support quantile relative to OBB thickness. */
  readonly maximumSupportGapThicknessRatio: number;
  /** Largest same-hill member footprint overlap ratio. */
  readonly maximumMemberPlanOverlapRatio: number;
  /** Largest normalized canyon-guide separation accepted as one cross-section. */
  readonly maximumCanyonPairGuideDelta: number;
  /** Largest disagreement between canyon exterior and selected downhill direction. */
  readonly maximumCanyonDirectionErrorDegrees: number;
  /** Largest insertion depth relative to the solved vertical OBB size. */
  readonly maximumBurialThicknessRatio: number;
  /** Largest normalized dot product allowed between any two OBB axes. */
  readonly maximumObbOrthogonalityError: number;
}

/** Compact deterministic evidence for one complete rock compilation. */
export interface SeedWorldRockAuditSnapshot {
  /** Versioned browser/clipboard contract. */
  readonly schema: "seed-world-rock-audit/v1";
  /** Whether every hard first-principles constraint passed. */
  readonly status: "PASS" | "FAIL";
  /** Stable signature over target identities and solved transforms. */
  readonly signature: string;
  /** Active thresholds used to produce this report. */
  readonly thresholds: SeedWorldRockAuditThresholds;
  /** Count and extrema used for fast visual acceptance. */
  readonly metrics: Readonly<{
    sourceHillCount: number;
    physicalConvexityCount: number;
    rejectedConvexityCount: number;
    visibleCrowdingRejectionCount: number;
    committedTargetCount: number;
    rockCount: number;
    canyonTargetCount: number;
    unpairedCanyonTargetCount: number;
    uncoveredTargetCount: number;
    duplicateSourceClaimCount: number;
    failedAssemblyCount: number;
    minimumContactRatio: number;
    minimumAssignedShoulderCoverageRatio: number;
    maximumSupportGapThicknessRatio: number;
    minimumTailDetailExposureRatio: number;
    surfaceConflictSampleCount: number;
    maximumMemberPlanOverlapRatio: number;
    maximumCanyonPairGuideDelta: number;
    minimumGlobalVisibilityRatio: number;
    maximumGlobalOcclusionRatio: number;
    maximumCrossTargetVisibleOverlapRatio: number;
    maximumBurialThicknessRatio: number;
    maximumObbOrthogonalityError: number;
  }>;
  /** Stable ordered failures; an empty list means PASS. */
  readonly violations: readonly SeedWorldRockAuditViolation[];
}

/** Default hard gates shared by every generated world; the audit never reads Seed or target IDs. */
export const SEED_WORLD_ROCK_AUDIT_DEFAULTS = Object.freeze<SeedWorldRockAuditThresholds>({
  minimumContactRatio: 0.68,
  minimumAssignedShoulderCoverageRatio: SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS.minimumTerrainCoverageRatio,
  minimumGlobalVisibilityRatio: SEED_WORLD_ROCK_TARGET_SELECTION_DEFAULTS.minimumIndependentObbContributionRatio,
  maximumCrossTargetVisibleOverlapRatio: SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS.maximumCrossTargetVisibleOverlapRatio,
  maximumSupportGapThicknessRatio: SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS.maximumSupportGapThicknessRatio,
  maximumMemberPlanOverlapRatio: SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS.maximumMemberPlanOverlapRatio,
  maximumCanyonPairGuideDelta: SEED_WORLD_CANYON_BANK_PAIR_MAXIMUM_GUIDE_DELTA,
  maximumCanyonDirectionErrorDegrees: 45,
  maximumBurialThicknessRatio: 0.24,
  maximumObbOrthogonalityError: 0.001
});

/**
 * Audits one final Heightmap-driven rock compilation without changing its transforms.
 * @param layout Read-only terrain identities used only for source-count evidence.
 * @param compilation Final convexity analysis and solved OBB transforms.
 * @param thresholds Hard quantitative gates shared by browser and automation consumers.
 * @returns Frozen deterministic snapshot suitable for UI, clipboard, or CI consumption.
 */
export function compileSeedWorldRockAudit(
  layout: SeedWorldGeologyLayout,
  compilation: SeedWorldRockCompilation,
  thresholds: SeedWorldRockAuditThresholds = SEED_WORLD_ROCK_AUDIT_DEFAULTS
): SeedWorldRockAuditSnapshot {
  const targets = compilation.terrain.targets;
  const decisions = compilation.assemblies.decisions;
  const rocks = compilation.assemblies.rocks;
  const decisionByTargetId = new Map(decisions.map((decision) => [decision.targetId, decision] as const));
  const violations: SeedWorldRockAuditViolation[] = [];

  if (decisions.length !== targets.length || rocks.length < targets.length) {
    violations.push(
      violation(
        "target-rock-cardinality",
        targets.map((target) => target.id),
        `目标 ${targets.length} / 决策 ${decisions.length} / 岩石成员 ${rocks.length}`
      )
    );
  }

  const failedAssemblyDecisions = decisions.filter((decision) => decision.violations.length > 0);
  if (failedAssemblyDecisions.length > 0) {
    const failureCodes = [...new Set(failedAssemblyDecisions.flatMap((decision) => decision.violations))].sort();
    violations.push(
      violation(
        "assembly-solve-failure",
        failedAssemblyDecisions.map((decision) => decision.targetId),
        `${failedAssemblyDecisions.length} 个山丘没有满足岩石求解约束：${failureCodes.join(" / ")}`
      )
    );
  }

  const uncoveredTargetIds = targets
    .filter((target) => {
      const decision = decisionByTargetId.get(target.id);
      return !decision || decision.rocks.length === 0 || !decision.crestCovered;
    })
    .map((target) => target.id);
  if (uncoveredTargetIds.length > 0) {
    violations.push(
      violation("uncovered-crest", uncoveredTargetIds, `${uncoveredTargetIds.length} 个凸包尖端未被 OBB 覆盖`)
    );
  }

  const insufficientCoverageAssignments = compilation.coverageAssignments.filter(
    (assignment) => assignment.shoulderCoverageRatio < thresholds.minimumAssignedShoulderCoverageRatio
  );
  if (insufficientCoverageAssignments.length > 0) {
    violations.push(
      violation(
        "insufficient-assigned-shoulder-coverage",
        insufficientCoverageAssignments.map((assignment) => assignment.coveredTargetId),
        `${insufficientCoverageAssignments.length} 个山肩在归属合并后覆盖率低于 ${(thresholds.minimumAssignedShoulderCoverageRatio * 100).toFixed(0)}%`
      )
    );
  }

  const sourceClaims = new Map<string, string[]>();
  for (const target of targets) {
    for (const hillId of target.sourceHillIds) {
      const claims = sourceClaims.get(hillId) ?? [];
      claims.push(target.id);
      sourceClaims.set(hillId, claims);
    }
  }
  const duplicateClaims = [...sourceClaims.entries()].filter(([, targetIds]) => targetIds.length > 1);
  if (duplicateClaims.length > 0) {
    violations.push(
      violation(
        "duplicate-convexity-claim",
        [...new Set(duplicateClaims.flatMap(([, targetIds]) => targetIds))],
        `${duplicateClaims.length} 个源山丘被多个最终凸包重复认领`
      )
    );
  }

  const insufficientContact = rocks.filter((rock) => rock.contactRatio < thresholds.minimumContactRatio);
  if (insufficientContact.length > 0) {
    violations.push(
      violation(
        "insufficient-contact",
        insufficientContact.map((rock) => targetIdFromRockId(rock.id)),
        `${insufficientContact.length} 块岩石接地率低于 ${(thresholds.minimumContactRatio * 100).toFixed(0)}%`
      )
    );
  }

  const unsupportedRoots = rocks.filter(
    (rock) =>
      rock.maximumSupportGapMetres / Math.max(1, rock.obbSizeMetres[1]) > thresholds.maximumSupportGapThicknessRatio
  );
  if (unsupportedRoots.length > 0) {
    violations.push(
      violation(
        "unsupported-root",
        unsupportedRoots.map((rock) => targetIdFromRockId(rock.id)),
        `${unsupportedRoots.length} 块岩石的必要根部支撑存在悬空间隙`
      )
    );
  }

  const tailDetailUnderexposed = rocks.filter(
    (rock) => rock.tailDetailExposureRatio + 1e-6 < rock.tailDetailRequiredExposureRatio
  );
  if (tailDetailUnderexposed.length > 0) {
    violations.push(
      violation(
        "tail-detail-underexposed",
        tailDetailUnderexposed.map((rock) => targetIdFromRockId(rock.id)),
        `${tailDetailUnderexposed.length} 块岩石没有露出资产配置要求的尾部细节`
      )
    );
  }

  const surfaceConflicts = rocks.filter((rock) => rock.surfaceConflictSampleCount > 0);
  if (surfaceConflicts.length > 0) {
    violations.push(
      violation(
        "surface-depth-conflict",
        surfaceConflicts.map((rock) => targetIdFromRockId(rock.id)),
        `${surfaceConflicts.reduce((sum, rock) => sum + rock.surfaceConflictSampleCount, 0)} 个上表面样本进入深度冲突带`
      )
    );
  }

  const memberOverlapDecisions = decisions.filter(
    (decision) => decision.maximumMemberPlanOverlapRatio > thresholds.maximumMemberPlanOverlapRatio
  );
  if (memberOverlapDecisions.length > 0) {
    violations.push(
      violation(
        "excessive-member-overlap",
        memberOverlapDecisions.map((decision) => decision.targetId),
        `${memberOverlapDecisions.length} 个山丘组合的成员覆盖率超过上限`
      )
    );
  }

  const occluded = rocks.filter(
    (rock) => rock.globalIndependentObbContributionRatio < thresholds.minimumGlobalVisibilityRatio
  );
  if (occluded.length > 0) {
    violations.push(
      violation(
        "excessive-neighbor-occlusion",
        occluded.map((rock) => targetIdFromRockId(rock.id)),
        `${occluded.length} 块岩石独立露出低于 ${(thresholds.minimumGlobalVisibilityRatio * 100).toFixed(0)}%`
      )
    );
  }

  const crossTargetOverlaps = rocks.filter(
    (rock) => rock.crossTargetVisibleOverlapRatio > thresholds.maximumCrossTargetVisibleOverlapRatio
  );
  if (crossTargetOverlaps.length > 0) {
    const overlappingRockPairs = new Set(
      crossTargetOverlaps.flatMap((rock) =>
        rock.crossTargetOverlapRockIds.map((competitorId) =>
          rock.id < competitorId ? `${rock.id}\u0000${competitorId}` : `${competitorId}\u0000${rock.id}`
        )
      )
    );
    const overlappingRockIds = [...new Set([...overlappingRockPairs].flatMap((pair) => pair.split("\u0000")))];
    violations.push(
      violation(
        "cross-target-visible-overlap",
        [...new Set(overlappingRockIds.map(targetIdFromRockId))],
        `${overlappingRockPairs.size} 对不同山丘岩石在 Hfinal 以上发生 OBB 穿插`,
        overlappingRockIds
      )
    );
  }

  const pairedCanyonIds = new Set(compilation.terrain.canyonPairs.map((pair) => pair.canyonId));
  const unpairedCanyonTargets = targets.filter(
    (target) => target.frame.canyonId && target.frame.bankSide && !pairedCanyonIds.has(target.frame.canyonId)
  );
  if (unpairedCanyonTargets.length > 0) {
    violations.push(
      violation(
        "unpaired-canyon-bank",
        unpairedCanyonTargets.map((target) => target.id),
        `${new Set(unpairedCanyonTargets.map((target) => target.frame.canyonId)).size} 条峡谷缺少左右对岸岩石组合`
      )
    );
  }

  const canyonPairGuideDeltas = compilation.terrain.canyonPairs.map((pair) =>
    Math.abs(pair.leftGuideParameter - pair.rightGuideParameter)
  );
  const misalignedCanyonPairs = compilation.terrain.canyonPairs.filter(
    (pair) => Math.abs(pair.leftGuideParameter - pair.rightGuideParameter) > thresholds.maximumCanyonPairGuideDelta
  );
  if (misalignedCanyonPairs.length > 0) {
    violations.push(
      violation(
        "canyon-cross-section",
        misalignedCanyonPairs.flatMap((pair) => [pair.leftTargetId, pair.rightTargetId]),
        `${misalignedCanyonPairs.length} 组峡谷岩石超出同横截面参数窗口`
      )
    );
  }

  const wrongCanyonDirectionTargetIds = compilation.terrain.canyonPairs.flatMap((pair) => {
    return opposingUphillDirectionErrorDegrees(pair.leftUphillBearingRadians, pair.rightUphillBearingRadians) >
      thresholds.maximumCanyonDirectionErrorDegrees
      ? [pair.leftTargetId, pair.rightTargetId]
      : [];
  });
  if (wrongCanyonDirectionTargetIds.length > 0) {
    violations.push(
      violation(
        "canyon-direction",
        wrongCanyonDirectionTargetIds,
        `${new Set(wrongCanyonDirectionTargetIds).size} 个峡谷目标的尖端没有与对岸形成相向关系`
      )
    );
  }

  const orthogonalityErrors = rocks.map((rock) => obbOrthogonalityError(rock.obbRotationQuaternion));
  const maximumObbOrthogonalityError = maximumOrZero(orthogonalityErrors);
  if (maximumObbOrthogonalityError > thresholds.maximumObbOrthogonalityError) {
    violations.push(
      violation(
        "obb-orthogonality",
        rocks
          .filter((rock) => obbOrthogonalityError(rock.obbRotationQuaternion) > thresholds.maximumObbOrthogonalityError)
          .map((rock) => targetIdFromRockId(rock.id)),
        `OBB 最大轴误差 ${maximumObbOrthogonalityError.toFixed(5)}`
      )
    );
  }

  const burialRatios = rocks.map((rock) => rock.insertionDepthMetres / Math.max(1, rock.obbSizeMetres[1]));
  const maximumBurialThicknessRatio = maximumOrZero(burialRatios);
  const overBuried = rocks.filter(
    (rock) =>
      rock.insertionDepthMetres / Math.max(1, rock.obbSizeMetres[1]) > thresholds.maximumBurialThicknessRatio + 1e-9
  );
  if (overBuried.length > 0) {
    violations.push(
      violation(
        "excessive-burial",
        overBuried.map((rock) => targetIdFromRockId(rock.id)),
        `${overBuried.length} 块岩石埋深超过 OBB 高度的 ${(thresholds.maximumBurialThicknessRatio * 100).toFixed(0)}%`
      )
    );
  }

  const contactRatios = rocks.map((rock) => rock.contactRatio);
  const visibilityRatios = rocks.map((rock) => rock.globalIndependentObbContributionRatio);
  const canyonTargets = targets.filter((target) => target.frame.canyonId && target.frame.bankSide);
  const snapshotBase = {
    schema: "seed-world-rock-audit/v1" as const,
    status: violations.length === 0 ? ("PASS" as const) : ("FAIL" as const),
    thresholds,
    metrics: Object.freeze({
      sourceHillCount: layout.hills.length,
      physicalConvexityCount: compilation.terrain.candidates?.length ?? targets.length,
      rejectedConvexityCount: Math.max(0, (compilation.terrain.candidates?.length ?? targets.length) - targets.length),
      visibleCrowdingRejectionCount: compilation.coverageRejections.length,
      committedTargetCount: targets.length,
      rockCount: rocks.length,
      canyonTargetCount: canyonTargets.length,
      unpairedCanyonTargetCount: unpairedCanyonTargets.length,
      uncoveredTargetCount: uncoveredTargetIds.length,
      duplicateSourceClaimCount: duplicateClaims.length,
      failedAssemblyCount: failedAssemblyDecisions.length,
      minimumContactRatio: minimumOrZero(contactRatios),
      minimumAssignedShoulderCoverageRatio: minimumOrZero(
        compilation.coverageAssignments.map((assignment) => assignment.shoulderCoverageRatio)
      ),
      maximumSupportGapThicknessRatio: maximumOrZero(
        rocks.map((rock) => rock.maximumSupportGapMetres / Math.max(1, rock.obbSizeMetres[1]))
      ),
      minimumTailDetailExposureRatio: minimumOrZero(rocks.map((rock) => rock.tailDetailExposureRatio)),
      surfaceConflictSampleCount: rocks.reduce((sum, rock) => sum + rock.surfaceConflictSampleCount, 0),
      maximumMemberPlanOverlapRatio: maximumOrZero(decisions.map((decision) => decision.maximumMemberPlanOverlapRatio)),
      maximumCanyonPairGuideDelta: maximumOrZero(canyonPairGuideDeltas),
      minimumGlobalVisibilityRatio: minimumOrZero(visibilityRatios),
      maximumGlobalOcclusionRatio: 1 - minimumOrZero(visibilityRatios),
      maximumCrossTargetVisibleOverlapRatio: maximumOrZero(rocks.map((rock) => rock.crossTargetVisibleOverlapRatio)),
      maximumBurialThicknessRatio,
      maximumObbOrthogonalityError
    }),
    violations: Object.freeze(violations)
  };
  return Object.freeze({ ...snapshotBase, signature: auditSignature(compilation) });
}

function opposingUphillDirectionErrorDegrees(leftBearingRadians: number, rightBearingRadians: number): number {
  const leftUphill = bearingVector(leftBearingRadians);
  const rightUphill = bearingVector(rightBearingRadians);
  const separation = Math.acos(clamp(dot(leftUphill, rightUphill), -1, 1));
  return (Math.abs(Math.PI - separation) * 180) / Math.PI;
}

function obbOrthogonalityError(quaternion: readonly [number, number, number, number]): number {
  const [x, y, z, w] = quaternion;
  const axes = [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]
  ] as const;
  const normalized = axes.map((axis) => {
    const length = Math.max(1e-9, Math.hypot(axis[0], axis[1], axis[2]));
    return [axis[0] / length, axis[1] / length, axis[2] / length] as const;
  });
  return Math.max(
    Math.abs(dot(normalized[0]!, normalized[1]!)),
    Math.abs(dot(normalized[0]!, normalized[2]!)),
    Math.abs(dot(normalized[1]!, normalized[2]!))
  );
}

function violation(
  code: SeedWorldRockAuditViolationCode,
  targetIds: readonly string[],
  message: string,
  rockIds?: readonly string[]
): SeedWorldRockAuditViolation {
  return Object.freeze({
    code,
    targetIds: Object.freeze([...new Set(targetIds)].sort()),
    message,
    ...(rockIds ? { rockIds: Object.freeze([...new Set(rockIds)].sort()) } : {})
  });
}

function auditSignature(compilation: SeedWorldRockCompilation): string {
  const payload = JSON.stringify({
    targets: compilation.terrain.targets.map((target) => target.id),
    coverageAssignments: compilation.coverageAssignments.map((assignment) => ({
      coveredTargetId: assignment.coveredTargetId,
      ownerTargetId: assignment.ownerTargetId,
      supportingTargetIds: assignment.supportingTargetIds,
      shoulderCoverageRatio: roundMillionth(assignment.shoulderCoverageRatio)
    })),
    coverageRejections: compilation.coverageRejections,
    rocks: compilation.assemblies.rocks.map((rock) => ({
      id: rock.id,
      position: rock.position.map(roundMillimetres),
      rotation: rock.rotationQuaternion.map(roundMillionth),
      scale: roundMillionth(rock.uniformScale)
    }))
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index++) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function targetIdFromRockId(rockId: string): string {
  const separator = rockId.lastIndexOf(":rock-");
  return separator < 0 ? rockId : rockId.slice(0, separator);
}

function bearingVector(bearingRadians: number): readonly [number, number, number] {
  return [Math.sin(bearingRadians), 0, Math.cos(bearingRadians)];
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!;
}

function minimumOrZero(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.min(...values);
}

function maximumOrZero(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundMillimetres(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function roundMillionth(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
