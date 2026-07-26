export interface ShowcaseVisualSelectionInput {
  readonly mode: string;
  readonly caseFilter: string;
  readonly updateReason: string;
  readonly updateApproval: string;
  readonly availableCaseIds: readonly string[];
  readonly defaultCaseIds?: readonly string[];
  readonly updateEligibleCaseIds?: readonly string[];
}

export interface ShowcaseVisualSelection {
  readonly requestedCaseIds: readonly string[];
  readonly selectedCaseIds: readonly string[];
}

export const WATER_SHOWCASE_VISUAL_CANDIDATE_CASE_IDS: readonly string[];
export const WATER_SHOWCASE_VISUAL_APPROVED_CASE_IDS: readonly string[];

export function resolveShowcaseVisualSelection(input: ShowcaseVisualSelectionInput): ShowcaseVisualSelection;

export function assertShowcaseBaselineCaseIds(
  manifestCaseIds: readonly string[],
  approvedCaseIds: readonly string[],
  permittedMissingCaseIds?: readonly string[]
): void;

export function assertImmutableShowcaseCases(
  previousManifest: Readonly<Record<string, unknown>>,
  nextManifest: Readonly<Record<string, unknown>>,
  updatedCaseId: string
): void;

export function assertImmutableShowcaseHashes(
  previousHashes: Readonly<Record<string, unknown>>,
  nextHashes: Readonly<Record<string, unknown>>,
  updatedCaseId: string
): void;

export function assertMissingShowcaseBaselineAllowed(mode: string, caseId: string): "candidate" | "approved-update";

export function resolveRetiredShowcaseCaseIds(
  retiredCaseIds: unknown,
  promotedCaseId: string
): readonly string[];

export interface ShowcaseBaselineTransactionFile {
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

export interface ShowcaseBaselineTransactionRecovery {
  readonly transactionRoot: string;
  readonly stagedRoot: string;
  readonly backupRoot: string;
  readonly failedRoot: string;
  readonly baselineRoot: string;
}

export interface ShowcaseBaselineTransactionInput {
  readonly baselineRoot: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly updatedCaseId: string;
  readonly files: readonly ShowcaseBaselineTransactionFile[];
  readonly previousHashes: Readonly<Record<string, unknown>>;
  readonly validateManifestFilesAtRoot: (
    manifest: Readonly<Record<string, unknown>>,
    root: string
  ) => Promise<Readonly<Record<string, unknown>>>;
  readonly onPhase?: (phase: string, recovery: ShowcaseBaselineTransactionRecovery) => void | Promise<void>;
}

export interface ShowcaseBaselineTransactionResult {
  readonly status: "committed";
  readonly updatedCaseId: string;
  readonly transactionRoot: string;
  readonly cleanupWarning: string | null;
}

export function commitShowcaseBaselineTransaction(
  input: ShowcaseBaselineTransactionInput
): Promise<ShowcaseBaselineTransactionResult>;
