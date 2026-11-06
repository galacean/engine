/** Maximum number of natural Lakes published by one generation. */
export const SEED_WORLD_MAXIMUM_LAKE_COUNT = 5 as const;
/** Shared physical-candidate budget distributed across the terrain-qualified slots. */
export const SEED_WORLD_MAXIMUM_LAKE_CANDIDATE_EVALUATIONS = 15 as const;

export const SEED_WORLD_LAKE_CANDIDATE_REJECTION_REASONS = Object.freeze([
  "world-boundary-clearance",
  "planned-topology-overlap",
  "planned-ownership-overlap",
  "fine-basin-support-overlap",
  "ownership-outside-basin-support",
  "invalid-or-disconnected-footprint",
  "insufficient-internal-clearance",
  "inter-lake-clearance"
] as const);

/** Recoverable natural reasons for skipping one Lake candidate. */
export type LakeCandidateRejectionReason = (typeof SEED_WORLD_LAKE_CANDIDATE_REJECTION_REASONS)[number];

export interface SeedWorldLakeCandidateAcceptedResult {
  readonly accepted: true;
}

export interface SeedWorldLakeCandidateRejectedResult {
  readonly accepted: false;
  readonly reason: LakeCandidateRejectionReason;
  readonly message: string;
}

export type SeedWorldLakeCandidateEvaluationResult =
  | SeedWorldLakeCandidateAcceptedResult
  | SeedWorldLakeCandidateRejectedResult;

/** Read-only bounded-search evidence published with Topology and HydrologyArtifact. */
export interface SeedWorldLakeSearchDiagnostics {
  readonly maximumCount: typeof SEED_WORLD_MAXIMUM_LAKE_COUNT;
  readonly publishedCount: number;
  readonly attemptedCandidateCount: number;
  readonly rejectionCounts: Readonly<Record<LakeCandidateRejectionReason, number>>;
}

export const SEED_WORLD_LAKE_CANDIDATE_ACCEPTED = Object.freeze<SeedWorldLakeCandidateAcceptedResult>({
  accepted: true
});

export function rejectSeedWorldLakeCandidate(
  reason: LakeCandidateRejectionReason,
  message: string
): Readonly<SeedWorldLakeCandidateRejectedResult> {
  return Object.freeze({ accepted: false, reason, message });
}

/**
 * Typed recoverable failure used only while evaluating a tentative Lake set.
 * Final Artifact sealing deliberately does not catch this error.
 */
export class SeedWorldLakeCandidateRejectionError extends Error {
  constructor(
    readonly reason: LakeCandidateRejectionReason,
    message: string
  ) {
    super(message);
    this.name = "SeedWorldLakeCandidateRejectionError";
  }
}

export function createSeedWorldLakeCandidateRejectionCounts(): Record<LakeCandidateRejectionReason, number> {
  return Object.fromEntries(SEED_WORLD_LAKE_CANDIDATE_REJECTION_REASONS.map((reason) => [reason, 0])) as Record<
    LakeCandidateRejectionReason,
    number
  >;
}

export function freezeSeedWorldLakeSearchDiagnostics(
  publishedCount: number,
  attemptedCandidateCount: number,
  rejectionCounts: Readonly<Record<LakeCandidateRejectionReason, number>>
): Readonly<SeedWorldLakeSearchDiagnostics> {
  if (!Number.isInteger(publishedCount) || publishedCount < 0 || publishedCount > SEED_WORLD_MAXIMUM_LAKE_COUNT) {
    throw new RangeError(`Seed World published Lake count must be 0-${SEED_WORLD_MAXIMUM_LAKE_COUNT}.`);
  }
  if (
    !Number.isInteger(attemptedCandidateCount) ||
    attemptedCandidateCount < publishedCount ||
    attemptedCandidateCount > SEED_WORLD_MAXIMUM_LAKE_CANDIDATE_EVALUATIONS
  ) {
    throw new RangeError("Seed World attempted Lake candidate count lies outside the optional slot contract.");
  }
  let rejectedCount = 0;
  const frozenCounts = createSeedWorldLakeCandidateRejectionCounts();
  for (const reason of SEED_WORLD_LAKE_CANDIDATE_REJECTION_REASONS) {
    const count = rejectionCounts[reason];
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`Seed World Lake rejection count '${reason}' must be a non-negative integer.`);
    }
    frozenCounts[reason] = count;
    rejectedCount += count;
  }
  if (publishedCount + rejectedCount !== attemptedCandidateCount) {
    throw new Error("Seed World Lake search diagnostics do not account for every attempted candidate.");
  }
  return Object.freeze({
    maximumCount: SEED_WORLD_MAXIMUM_LAKE_COUNT,
    publishedCount,
    attemptedCandidateCount,
    rejectionCounts: Object.freeze(frozenCounts)
  });
}
