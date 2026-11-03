import type { SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import { SEED_WORLD_CLIFF_1_ASSET_PROFILE } from "./SeedWorldCliffAssetCatalog.ts";
import {
  SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS,
  refinalizeSeedWorldRockAssemblySubset,
  solveSeedWorldRockAssemblies,
  solveSeedWorldRockAssembliesRuntime,
  type SeedWorldRockAssemblyCompilation,
  type SeedWorldRockAssemblyDecision,
  type SeedWorldRockAssemblyOptions,
  type SeedWorldRockRuntimePlanningDiagnostics,
  type SeedWorldSolvedRockObb
} from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblySolver";
import type { SeedWorldGeologyLayout } from "@galacean/engine-world-planning/runtime/SeedWorldGeologyLayout";
import {
  analyzeSeedWorldRockTerrain,
  type SeedWorldRockCanyonPair,
  type SeedWorldRockCoverageTarget,
  type SeedWorldRockTerrainAnalysis
} from "@galacean/engine-world-planning/runtime/SeedWorldRockTerrainAnalysis";

/** Rock-owned policy for collapsing OBBs which express the same visible terrain summit. */
export interface SeedWorldRockTargetSelectionOptions {
  /** Minimum independently exposed OBB surface required for a second rock covering an already-covered crest. */
  readonly minimumIndependentObbContributionRatio: number;
}

/** Default final-target deduplication policy shared by the runtime and debug overlays. */
export const SEED_WORLD_ROCK_TARGET_SELECTION_DEFAULTS = Object.freeze<SeedWorldRockTargetSelectionOptions>({
  minimumIndependentObbContributionRatio: 0.55
});

const MINIMUM_REDUNDANT_SHOULDER_COVERAGE_RATIO = 0.95;

/** Terrain analysis and final asset-neutral OBB compositions for one generated world. */
export interface SeedWorldRockCompilation {
  /** Rock-owned interpretation of final terrain convexities and shoulder frames. */
  readonly terrain: SeedWorldRockTerrainAnalysis;
  /** Parameter-driven one-, two-, or four-piece Clif OBB compositions. */
  readonly assemblies: SeedWorldRockAssemblyCompilation;
  /** Explicit asset-level owner for every terrain target considered by the compiler. */
  readonly coverageAssignments: readonly SeedWorldRockCoverageAssignment[];
  /** Targets deliberately left without a composition because every fitted option would form a visible pile. */
  readonly coverageRejections: readonly SeedWorldRockCoverageRejection[];
}

export interface SeedWorldRockCoverageRejection {
  readonly targetId: string;
  readonly reason:
    | "visible-crowding"
    | "support-owner-rejected"
    | "runtime-local-infeasible"
    | "runtime-cross-target-conflict"
    | "runtime-operation-budget";
  readonly minimumIndependentObbContributionRatio: number;
  readonly maximumCrossTargetVisibleOverlapRatio: number;
  /** Already-absorbed shoulders which lose their last valid support if this target is removed. */
  readonly dependentTargetIds?: readonly string[];
}

/** Why one fitted composition owns a final-terrain shoulder. */
export interface SeedWorldRockCoverageAssignment {
  /** Complete terrain-analysis target whose shoulder still requires coverage evidence. */
  readonly coveredTargetId: string;
  /** Committed target whose fitted rocks provide that coverage. */
  readonly ownerTargetId: string;
  /** Every committed composition contributing physical shoulder samples to this assignment. */
  readonly supportingTargetIds: readonly string[];
  /** Whether the target kept its own composition or was absorbed to prevent a visible pile. */
  readonly ownership: "self" | "absorbed-visible-overlap";
  /** Portion of the covered target's physical shoulder sampled inside the owner's final OBBs. */
  readonly shoulderCoverageRatio: number;
}

/** Optional rock-owned policy; no option mutates layout or Heightmap data. */
export interface SeedWorldRockCompilerOptions {
  /** OBB composition feasibility thresholds and diagnostic piece-count mode. */
  readonly assemblies?: SeedWorldRockAssemblyOptions;
  /** Final-target deduplication thresholds applied only after real OBB fitting. */
  readonly targetSelection?: Partial<SeedWorldRockTargetSelectionOptions>;
}

/**
 * Compiles final terrain facts into deterministic Clif OBB compositions.
 * @param layout Pure geology layout supplying identities and directional relationships.
 * @param fields Final post-Hydrology Heightmap used for every measurement and contact solve.
 * @param options Rock-owned coverage and composition policy.
 * @returns Immutable terrain evidence and runtime-ready OBB transforms.
 */
export function compileSeedWorldRocks(
  layout: SeedWorldGeologyLayout,
  fields: SeedWorldFields,
  options: SeedWorldRockCompilerOptions = {}
): SeedWorldRockCompilation {
  return compileSeedWorldRocksWithAssemblySolver(layout, fields, options, solveSeedWorldRockAssembliesRuntime);
}

/**
 * Compiles the same terrain with the exhaustive solver for offline A/B reference fixtures.
 * Runtime code must call {@link compileSeedWorldRocks}.
 */
export function compileSeedWorldRocksExhaustiveReference(
  layout: SeedWorldGeologyLayout,
  fields: SeedWorldFields,
  options: SeedWorldRockCompilerOptions = {}
): SeedWorldRockCompilation {
  return compileSeedWorldRocksWithAssemblySolver(layout, fields, options, solveSeedWorldRockAssemblies);
}

function compileSeedWorldRocksWithAssemblySolver(
  layout: SeedWorldGeologyLayout,
  fields: SeedWorldFields,
  options: SeedWorldRockCompilerOptions,
  assemblySolver: (
    analysis: SeedWorldRockTerrainAnalysis,
    fields: SeedWorldFields,
    assets: readonly (typeof SEED_WORLD_CLIFF_1_ASSET_PROFILE)[],
    assemblyOptions: SeedWorldRockAssemblyOptions
  ) => SeedWorldRockAssemblyCompilation
): SeedWorldRockCompilation {
  const analyzedTerrain = analyzeSeedWorldRockTerrain(layout, fields);
  const assemblyOptions = Object.freeze({
    ...SEED_WORLD_ROCK_ASSEMBLY_DEFAULTS,
    ...options.assemblies
  });
  const targetSelectionOptions = Object.freeze({
    ...SEED_WORLD_ROCK_TARGET_SELECTION_DEFAULTS,
    ...options.targetSelection
  });
  validateTargetSelectionOptions(targetSelectionOptions);
  const provisionalAssemblies = assemblySolver(
    analyzedTerrain,
    fields,
    [SEED_WORLD_CLIFF_1_ASSET_PROFILE],
    assemblyOptions
  );
  const provisionalTargetIds = new Set(provisionalAssemblies.decisions.map((decision) => decision.targetId));
  const provisionalTargets = analyzedTerrain.targets.filter((target) => provisionalTargetIds.has(target.id));
  const provisionalCanyonPairs = analyzedTerrain.canyonPairs.filter(
    (pair) => provisionalTargetIds.has(pair.leftTargetId) && provisionalTargetIds.has(pair.rightTargetId)
  );
  const selection = retainMinimumCanyonPairs(
    provisionalTargets,
    selectIndependentCoverageTargets(
      provisionalTargets,
      provisionalAssemblies.decisions,
      fields,
      assemblyOptions.minimumTerrainCoverageRatio,
      targetSelectionOptions.minimumIndependentObbContributionRatio
    ),
    provisionalAssemblies.decisions,
    provisionalCanyonPairs
  );
  const ownerByCoveredTargetId = new Map(selection.ownerByCoveredTargetId);
  let selectedTargets = selection.targets;
  let terrain = withSelectedTargets(analyzedTerrain, selectedTargets);
  let assemblies = refinalizeRuntimeSubset(
    filterDecisions(provisionalAssemblies.decisions, selectedTargets),
    fields,
    assemblyOptions,
    provisionalAssemblies.runtimeDiagnostics
  );
  const coverageRejections: SeedWorldRockCoverageRejection[] = [];
  registerRuntimeOmissions(
    analyzedTerrain.targets,
    selectedTargets,
    assemblies.decisions,
    fields,
    provisionalAssemblies.runtimeDiagnostics,
    assemblyOptions.minimumTerrainCoverageRatio,
    ownerByCoveredTargetId,
    coverageRejections
  );
  let coverageAssignments = finalizeCoverageAssignments(
    analyzedTerrain.targets,
    Object.freeze({ targets: selectedTargets, ownerByCoveredTargetId }),
    assemblies.decisions,
    fields
  );
  for (let iteration = 0; iteration < analyzedTerrain.targets.length; iteration++) {
    const absorption = selectPostFitAbsorption(
      analyzedTerrain.targets,
      selectedTargets,
      assemblies.decisions,
      analyzedTerrain.canyonPairs,
      fields,
      assemblyOptions,
      coverageAssignments
    );
    const rejection = absorption
      ? undefined
      : selectCrowdedTargetRejection(
          analyzedTerrain.targets,
          selectedTargets,
          assemblies.decisions,
          analyzedTerrain.canyonPairs,
          fields,
          assemblyOptions,
          coverageAssignments
        );
    if (!absorption && !rejection) break;
    const removedTargetId = absorption?.coveredTargetId ?? rejection!.targetId;
    selectedTargets = Object.freeze(selectedTargets.filter((target) => target.id !== removedTargetId));
    if (absorption) {
      for (const [coveredTargetId, ownerTargetId] of ownerByCoveredTargetId) {
        if (ownerTargetId === absorption.coveredTargetId) {
          ownerByCoveredTargetId.set(coveredTargetId, absorption.ownerTargetId);
        }
      }
      ownerByCoveredTargetId.set(absorption.coveredTargetId, absorption.ownerTargetId);
    } else {
      ownerByCoveredTargetId.delete(rejection!.targetId);
      coverageRejections.push(rejection!);
      for (const dependentTargetId of rejection!.dependentTargetIds ?? []) {
        ownerByCoveredTargetId.delete(dependentTargetId);
        coverageRejections.push(
          Object.freeze({
            targetId: dependentTargetId,
            reason: "support-owner-rejected",
            minimumIndependentObbContributionRatio: 0,
            maximumCrossTargetVisibleOverlapRatio: rejection!.maximumCrossTargetVisibleOverlapRatio
          })
        );
      }
    }
    terrain = withSelectedTargets(analyzedTerrain, selectedTargets);
    assemblies = refinalizeRuntimeSubset(
      filterDecisions(assemblies.decisions, selectedTargets),
      fields,
      assemblyOptions,
      provisionalAssemblies.runtimeDiagnostics
    );
    coverageAssignments = finalizeCoverageAssignments(
      analyzedTerrain.targets,
      Object.freeze({ targets: selectedTargets, ownerByCoveredTargetId }),
      assemblies.decisions,
      fields
    );
  }
  return Object.freeze({
    terrain,
    assemblies,
    coverageAssignments,
    coverageRejections: Object.freeze(coverageRejections)
  });
}

function refinalizeRuntimeSubset(
  decisions: readonly SeedWorldRockAssemblyDecision[],
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions,
  runtimeDiagnostics: SeedWorldRockRuntimePlanningDiagnostics | undefined
): SeedWorldRockAssemblyCompilation {
  const finalized = refinalizeSeedWorldRockAssemblySubset(decisions, fields, options);
  return runtimeDiagnostics ? Object.freeze({ ...finalized, runtimeDiagnostics }) : finalized;
}

function registerRuntimeOmissions(
  allTargets: readonly SeedWorldRockCoverageTarget[],
  _selectedTargets: readonly SeedWorldRockCoverageTarget[],
  decisions: readonly SeedWorldRockAssemblyDecision[],
  fields: SeedWorldFields,
  runtimeDiagnostics: SeedWorldRockRuntimePlanningDiagnostics | undefined,
  minimumTerrainCoverageRatio: number,
  ownerByCoveredTargetId: Map<string, string>,
  coverageRejections: SeedWorldRockCoverageRejection[]
): void {
  if (!runtimeDiagnostics) return;
  const targetById = new Map(allTargets.map((target) => [target.id, target] as const));
  for (const skipped of runtimeDiagnostics.skippedTargets) {
    const target = targetById.get(skipped.targetId)!;
    const coverage = findCollectiveShoulderCoverage(target, decisions, fields);
    if (coverage.ownerTargetId && coverage.shoulderCoverageRatio >= minimumTerrainCoverageRatio) {
      ownerByCoveredTargetId.set(target.id, coverage.ownerTargetId);
      continue;
    }
    coverageRejections.push(
      Object.freeze({
        targetId: target.id,
        reason:
          skipped.reason === "local-infeasible"
            ? "runtime-local-infeasible"
            : skipped.reason === "operation-budget"
              ? "runtime-operation-budget"
              : "runtime-cross-target-conflict",
        minimumIndependentObbContributionRatio: 0,
        maximumCrossTargetVisibleOverlapRatio: 0
      })
    );
  }
}

function filterDecisions(
  decisions: readonly SeedWorldRockAssemblyDecision[],
  targets: readonly SeedWorldRockCoverageTarget[]
): readonly SeedWorldRockAssemblyDecision[] {
  const targetIds = new Set(targets.map((target) => target.id));
  return Object.freeze(decisions.filter((decision) => targetIds.has(decision.targetId)));
}

interface TargetSelection {
  readonly targets: readonly SeedWorldRockCoverageTarget[];
  readonly ownerByCoveredTargetId: ReadonlyMap<string, string>;
}

function selectIndependentCoverageTargets(
  targets: readonly SeedWorldRockCoverageTarget[],
  decisions: readonly SeedWorldRockAssemblyDecision[],
  fields: SeedWorldFields,
  minimumTerrainCoverageRatio: number,
  minimumIndependentContributionRatio: number
): TargetSelection {
  const decisionByTargetId = new Map(decisions.map((decision) => [decision.targetId, decision] as const));
  const targetsByPriority = targets
    .slice()
    .sort((left, right) => coveragePriority(right) - coveragePriority(left) || left.id.localeCompare(right.id));
  const retained: SeedWorldRockCoverageTarget[] = [];
  const retainedDecisions: SeedWorldRockAssemblyDecision[] = [];
  const ownerByCoveredTargetId = new Map<string, string>();
  for (const target of targetsByPriority) {
    const decision = decisionByTargetId.get(target.id);
    if (!decision) throw new Error(`Missing provisional rock decision for ${target.id}`);
    const owner = findCollectiveShoulderCoverage(target, retainedDecisions, fields);
    if (
      decision.minimumGlobalObbContributionRatio < minimumIndependentContributionRatio &&
      owner.ownerTargetId &&
      owner.shoulderCoverageRatio >= minimumTerrainCoverageRatio
    ) {
      ownerByCoveredTargetId.set(target.id, owner.ownerTargetId);
      continue;
    }
    retained.push(target);
    retainedDecisions.push(decision);
    ownerByCoveredTargetId.set(target.id, target.id);
  }
  const retainedIds = new Set(retained.map((target) => target.id));
  return Object.freeze({
    targets: Object.freeze(targets.filter((target) => retainedIds.has(target.id))),
    ownerByCoveredTargetId
  });
}

function retainMinimumCanyonPairs(
  allTargets: readonly SeedWorldRockCoverageTarget[],
  selection: TargetSelection,
  decisions: readonly SeedWorldRockAssemblyDecision[],
  canyonPairs: readonly SeedWorldRockCanyonPair[]
): TargetSelection {
  const selectedIds = new Set(selection.targets.map((target) => target.id));
  const ownerByCoveredTargetId = new Map(selection.ownerByCoveredTargetId);
  const decisionByTargetId = new Map(decisions.map((decision) => [decision.targetId, decision] as const));
  const canyonIds = [...new Set(canyonPairs.map((pair) => pair.canyonId))].sort();
  for (const canyonId of canyonIds) {
    const candidates = canyonPairs.filter((pair) => pair.canyonId === canyonId);
    if (candidates.some((pair) => selectedIds.has(pair.leftTargetId) && selectedIds.has(pair.rightTargetId))) continue;
    const pair = candidates.slice().sort((left, right) => {
      const leftSelectedCount =
        Number(selectedIds.has(left.leftTargetId)) + Number(selectedIds.has(left.rightTargetId));
      const rightSelectedCount =
        Number(selectedIds.has(right.leftTargetId)) + Number(selectedIds.has(right.rightTargetId));
      const leftVisibility = Math.min(
        decisionByTargetId.get(left.leftTargetId)!.minimumGlobalObbContributionRatio,
        decisionByTargetId.get(left.rightTargetId)!.minimumGlobalObbContributionRatio
      );
      const rightVisibility = Math.min(
        decisionByTargetId.get(right.leftTargetId)!.minimumGlobalObbContributionRatio,
        decisionByTargetId.get(right.rightTargetId)!.minimumGlobalObbContributionRatio
      );
      return (
        rightSelectedCount - leftSelectedCount || rightVisibility - leftVisibility || left.id.localeCompare(right.id)
      );
    })[0]!;
    for (const targetId of [pair.leftTargetId, pair.rightTargetId]) {
      selectedIds.add(targetId);
      ownerByCoveredTargetId.set(targetId, targetId);
    }
  }
  return Object.freeze({
    targets: Object.freeze(allTargets.filter((target) => selectedIds.has(target.id))),
    ownerByCoveredTargetId
  });
}

function selectPostFitAbsorption(
  allTargets: readonly SeedWorldRockCoverageTarget[],
  targets: readonly SeedWorldRockCoverageTarget[],
  decisions: readonly SeedWorldRockAssemblyDecision[],
  canyonPairs: readonly SeedWorldRockCanyonPair[],
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions,
  coverageAssignments: readonly SeedWorldRockCoverageAssignment[]
): Readonly<{ coveredTargetId: string; ownerTargetId: string }> | undefined {
  const targetById = new Map(targets.map((target) => [target.id, target] as const));
  const allTargetById = new Map(allTargets.map((target) => [target.id, target] as const));
  const selectedIds = new Set(targetById.keys());
  const unpairedTargetIds = findUnpairedCanyonTargetIds(selectedIds, canyonPairs);
  const conflicts = decisions.flatMap((decision) =>
    decision.rocks.flatMap((rock) =>
      rock.crossTargetOverlapRockIds.flatMap((competitorRockId) => {
        const competitorTargetId = targetIdFromRockId(competitorRockId);
        if (competitorTargetId === decision.targetId) return [];
        const left = targetById.get(decision.targetId);
        const right = targetById.get(competitorTargetId);
        if (!left || !right) return [];
        const ordered = [left, right].sort((first, second) => {
          const firstUnpaired = unpairedTargetIds.has(first.id) ? 1 : 0;
          const secondUnpaired = unpairedTargetIds.has(second.id) ? 1 : 0;
          return (
            secondUnpaired - firstUnpaired ||
            coveragePriority(first) - coveragePriority(second) ||
            first.id.localeCompare(second.id)
          );
        });
        const covered = ordered.find((candidate) => {
          const remainingDecisions = decisions.filter((entry) => entry.targetId !== candidate.id);
          const coverage = findCollectiveShoulderCoverage(candidate, remainingDecisions, fields);
          const preservesExistingAssignments = coverageAssignments
            .filter(
              (assignment) =>
                assignment.ownership === "absorbed-visible-overlap" && assignment.coveredTargetId !== candidate.id
            )
            .every(
              (assignment) =>
                findCollectiveShoulderCoverage(
                  allTargetById.get(assignment.coveredTargetId)!,
                  remainingDecisions,
                  fields
                ).shoulderCoverageRatio >= options.minimumTerrainCoverageRatio
            );
          return (
            canRemoveWithoutLosingCanyonPair(candidate.id, selectedIds, canyonPairs) &&
            coverage.shoulderCoverageRatio >= MINIMUM_REDUNDANT_SHOULDER_COVERAGE_RATIO &&
            preservesExistingAssignments
          );
        });
        if (!covered) return [];
        const owner = findCollectiveShoulderCoverage(
          covered,
          decisions.filter((entry) => entry.targetId !== covered.id),
          fields
        );
        if (!owner.ownerTargetId) return [];
        return [
          Object.freeze({
            coveredTargetId: covered.id,
            ownerTargetId: owner.ownerTargetId,
            severity: Math.max(
              decision.maximumCrossTargetVisibleOverlapRatio - options.maximumCrossTargetVisibleOverlapRatio,
              options.minimumGlobalObbContributionRatio - decision.minimumGlobalObbContributionRatio
            ),
            unpaired: unpairedTargetIds.has(covered.id)
          })
        ];
      })
    )
  );
  const selected = conflicts.sort(
    (left, right) =>
      Number(right.unpaired) - Number(left.unpaired) ||
      right.severity - left.severity ||
      left.coveredTargetId.localeCompare(right.coveredTargetId)
  )[0];
  return selected
    ? Object.freeze({ coveredTargetId: selected.coveredTargetId, ownerTargetId: selected.ownerTargetId })
    : undefined;
}

function selectCrowdedTargetRejection(
  allTargets: readonly SeedWorldRockCoverageTarget[],
  targets: readonly SeedWorldRockCoverageTarget[],
  decisions: readonly SeedWorldRockAssemblyDecision[],
  canyonPairs: readonly SeedWorldRockCanyonPair[],
  fields: SeedWorldFields,
  options: SeedWorldRockAssemblyOptions,
  coverageAssignments: readonly SeedWorldRockCoverageAssignment[]
): SeedWorldRockCoverageRejection | undefined {
  const targetById = new Map(targets.map((target) => [target.id, target] as const));
  const allTargetById = new Map(allTargets.map((target) => [target.id, target] as const));
  const selectedIds = new Set(targetById.keys());
  const candidate = decisions
    .filter((decision) => {
      if (
        decision.minimumGlobalObbContributionRatio >= options.minimumGlobalObbContributionRatio &&
        decision.maximumCrossTargetVisibleOverlapRatio <= options.maximumCrossTargetVisibleOverlapRatio
      )
        return false;
      return (
        (decision.minimumGlobalObbContributionRatio < options.minimumGlobalObbContributionRatio ||
          decision.maximumCrossTargetVisibleOverlapRatio > options.maximumCrossTargetVisibleOverlapRatio) &&
        canRemoveWithoutLosingCanyonPair(decision.targetId, selectedIds, canyonPairs)
      );
    })
    .sort(
      (left, right) =>
        left.minimumGlobalObbContributionRatio - right.minimumGlobalObbContributionRatio ||
        coveragePriority(targetById.get(left.targetId)!) - coveragePriority(targetById.get(right.targetId)!) ||
        left.targetId.localeCompare(right.targetId)
    )[0];
  return candidate
    ? Object.freeze({
        targetId: candidate.targetId,
        reason: "visible-crowding",
        minimumIndependentObbContributionRatio: candidate.minimumGlobalObbContributionRatio,
        maximumCrossTargetVisibleOverlapRatio: candidate.maximumCrossTargetVisibleOverlapRatio,
        dependentTargetIds: Object.freeze(
          coverageAssignments
            .filter(
              (assignment) =>
                assignment.ownership === "absorbed-visible-overlap" && assignment.coveredTargetId !== candidate.targetId
            )
            .filter(
              (assignment) =>
                findCollectiveShoulderCoverage(
                  allTargetById.get(assignment.coveredTargetId)!,
                  decisions.filter((entry) => entry.targetId !== candidate.targetId),
                  fields
                ).shoulderCoverageRatio < options.minimumTerrainCoverageRatio
            )
            .map((assignment) => assignment.coveredTargetId)
        )
      })
    : undefined;
}

function findUnpairedCanyonTargetIds(
  selectedIds: ReadonlySet<string>,
  canyonPairs: readonly SeedWorldRockCanyonPair[]
): ReadonlySet<string> {
  const canyonTargetIds = new Set(canyonPairs.flatMap((pair) => [pair.leftTargetId, pair.rightTargetId]));
  const pairedIds = new Set(
    canyonPairs
      .filter((pair) => selectedIds.has(pair.leftTargetId) && selectedIds.has(pair.rightTargetId))
      .flatMap((pair) => [pair.leftTargetId, pair.rightTargetId])
  );
  return new Set([...selectedIds].filter((targetId) => canyonTargetIds.has(targetId) && !pairedIds.has(targetId)));
}

function canRemoveWithoutLosingCanyonPair(
  targetId: string,
  selectedIds: ReadonlySet<string>,
  canyonPairs: readonly SeedWorldRockCanyonPair[]
): boolean {
  const targetPair = canyonPairs.find((pair) => pair.leftTargetId === targetId || pair.rightTargetId === targetId);
  if (!targetPair) return true;
  const canyonPairsAfterRemoval = canyonPairs.filter(
    (pair) =>
      pair.canyonId === targetPair.canyonId &&
      pair.leftTargetId !== targetId &&
      pair.rightTargetId !== targetId &&
      selectedIds.has(pair.leftTargetId) &&
      selectedIds.has(pair.rightTargetId)
  );
  return canyonPairsAfterRemoval.length > 0;
}

function targetIdFromRockId(rockId: string): string {
  const separator = rockId.lastIndexOf(":rock-");
  return separator < 0 ? rockId : rockId.slice(0, separator);
}

function findCollectiveShoulderCoverage(
  target: SeedWorldRockCoverageTarget,
  decisions: readonly SeedWorldRockAssemblyDecision[],
  fields: SeedWorldFields
): Readonly<{
  ownerTargetId?: string;
  supportingTargetIds: readonly string[];
  shoulderCoverageRatio: number;
}> {
  let ownerTargetId: string | undefined;
  let score = 0;
  const supportingTargetIds: string[] = [];
  for (const decision of decisions) {
    const shoulderCoverageRatio = measureShoulderCoverage(target, decision.rocks, fields);
    if (shoulderCoverageRatio > 0) supportingTargetIds.push(decision.targetId);
    const containsCrest = decision.rocks.some((rock) => pointInsideSolvedObb(target.crest, rock));
    const candidateScore = shoulderCoverageRatio + (containsCrest ? 2 : 0);
    if (candidateScore <= score) continue;
    ownerTargetId = decision.targetId;
    score = candidateScore;
  }
  const shoulderCoverageRatio = measureShoulderCoverage(
    target,
    decisions.flatMap((decision) => decision.rocks),
    fields
  );
  return Object.freeze({
    ...(ownerTargetId ? { ownerTargetId } : {}),
    supportingTargetIds: Object.freeze(supportingTargetIds),
    shoulderCoverageRatio
  });
}

function finalizeCoverageAssignments(
  allTargets: readonly SeedWorldRockCoverageTarget[],
  selection: TargetSelection,
  decisions: readonly SeedWorldRockAssemblyDecision[],
  fields: SeedWorldFields
): readonly SeedWorldRockCoverageAssignment[] {
  const decisionByTargetId = new Map(decisions.map((decision) => [decision.targetId, decision] as const));
  const selectedTargetIds = new Set(selection.targets.map((target) => target.id));
  return Object.freeze(
    allTargets.flatMap((target) => {
      const isSelfOwned = selectedTargetIds.has(target.id);
      if (!isSelfOwned && !selection.ownerByCoveredTargetId.has(target.id)) return [];
      const coverage = isSelfOwned
        ? findCollectiveShoulderCoverage(target, [decisionByTargetId.get(target.id)!], fields)
        : findCollectiveShoulderCoverage(target, decisions, fields);
      const ownerTargetId = isSelfOwned ? target.id : coverage.ownerTargetId;
      if (!ownerTargetId) throw new Error(`Missing rock coverage owner for ${target.id}`);
      return [
        Object.freeze({
          coveredTargetId: target.id,
          ownerTargetId,
          supportingTargetIds: isSelfOwned ? Object.freeze([target.id]) : coverage.supportingTargetIds,
          ownership: isSelfOwned ? "self" : "absorbed-visible-overlap",
          shoulderCoverageRatio: coverage.shoulderCoverageRatio
        })
      ];
    })
  );
}

function measureShoulderCoverage(
  target: SeedWorldRockCoverageTarget,
  rocks: readonly SeedWorldSolvedRockObb[],
  _fields: SeedWorldFields
): number {
  const footprints = rocks.map(makePlanFootprint);
  let coveredSamples = 0;
  for (const offset of target.rockPlanShoulder.sampleOffsets) {
    const worldX = target.crest[0] + offset[0];
    const worldZ = target.crest[2] + offset[1];
    if (footprints.some((footprint) => pointInsidePlanFootprint(worldX, worldZ, footprint))) coveredSamples++;
  }
  return coveredSamples / Math.max(1, target.rockPlanShoulder.sampleOffsets.length);
}

interface PlanFootprint {
  readonly center: readonly [x: number, z: number];
  readonly tangent: readonly [x: number, z: number];
  readonly uphill: readonly [x: number, z: number];
  readonly halfTangent: number;
  readonly halfUphill: number;
}

function makePlanFootprint(rock: SeedWorldSolvedRockObb): PlanFootprint {
  const tangent3 = rotateVectorByQuaternion([1, 0, 0], rock.obbRotationQuaternion);
  const uphill3 = rotateVectorByQuaternion([0, 0, 1], rock.obbRotationQuaternion);
  const uphillLength = Math.max(1e-9, Math.hypot(uphill3[0], uphill3[2]));
  return Object.freeze({
    center: Object.freeze([rock.obbCenter[0], rock.obbCenter[2]] as const),
    tangent: Object.freeze([tangent3[0], tangent3[2]] as const),
    uphill: Object.freeze([uphill3[0] / uphillLength, uphill3[2] / uphillLength] as const),
    halfTangent: rock.obbSizeMetres[0] * 0.5,
    halfUphill: Math.abs(uphill3[1]) * rock.obbSizeMetres[1] * 0.5 + uphillLength * rock.obbSizeMetres[2] * 0.5
  });
}

function pointInsidePlanFootprint(worldX: number, worldZ: number, footprint: PlanFootprint): boolean {
  const deltaX = worldX - footprint.center[0];
  const deltaZ = worldZ - footprint.center[1];
  return (
    Math.abs(deltaX * footprint.tangent[0] + deltaZ * footprint.tangent[1]) <= footprint.halfTangent + 1e-6 &&
    Math.abs(deltaX * footprint.uphill[0] + deltaZ * footprint.uphill[1]) <= footprint.halfUphill + 1e-6
  );
}

function withSelectedTargets(
  terrain: SeedWorldRockTerrainAnalysis,
  targets: readonly SeedWorldRockCoverageTarget[]
): SeedWorldRockTerrainAnalysis {
  const targetIds = new Set(targets.map((target) => target.id));
  return Object.freeze({
    ...terrain,
    targets: Object.freeze([...targets]),
    canyonPairs: Object.freeze(
      terrain.canyonPairs.filter((pair) => targetIds.has(pair.leftTargetId) && targetIds.has(pair.rightTargetId))
    )
  });
}

function coveragePriority(target: SeedWorldRockCoverageTarget): number {
  return target.prominenceMetres * Math.sqrt(Math.max(1, target.tangentSpanMetres));
}

function pointInsideSolvedObb(point: readonly [number, number, number], rock: SeedWorldSolvedRockObb): boolean {
  const delta = Object.freeze([
    point[0] - rock.obbCenter[0],
    point[1] - rock.obbCenter[1],
    point[2] - rock.obbCenter[2]
  ] as const);
  const local = rotateVectorByQuaternionConjugate(delta, rock.obbRotationQuaternion);
  return rock.obbSizeMetres.every((size, index) => Math.abs(local[index]!) <= size * 0.5 + 1e-6);
}

function rotateVectorByQuaternionConjugate(
  vector: readonly [number, number, number],
  quaternion: readonly [number, number, number, number]
): readonly [number, number, number] {
  return rotateVectorByQuaternion(vector, [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]]);
}

function rotateVectorByQuaternion(
  vector: readonly [number, number, number],
  quaternion: readonly [number, number, number, number]
): readonly [number, number, number] {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return Object.freeze([
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx)
  ] as const);
}

function validateTargetSelectionOptions(options: SeedWorldRockTargetSelectionOptions): void {
  if (
    !Number.isFinite(options.minimumIndependentObbContributionRatio) ||
    options.minimumIndependentObbContributionRatio < 0 ||
    options.minimumIndependentObbContributionRatio > 1
  ) {
    throw new RangeError("Rock target independent OBB contribution ratio must be within [0, 1]");
  }
}
