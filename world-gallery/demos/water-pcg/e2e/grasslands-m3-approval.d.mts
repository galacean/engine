export function parseAndValidateJson(
  text: string,
  invalidJsonPrefix: string,
  validator: (record: unknown) => string[]
): Readonly<{
  record: unknown;
  failures: string[];
}>;

export function createControlledCalibrationCore(record: unknown): unknown;

export function validateM3ApprovalRecord(
  record: unknown,
  expected: Readonly<{
    caseId: string;
    commit: string;
    fixtureManifestSha256: string;
    referenceTargetSha256: string;
    controlledCalibrationCoreSha256: string;
    sideBySidePngSha256: string;
    captureHashes: Readonly<Record<string, string>>;
    captureStates: readonly string[];
    flipGreen: boolean;
  }>,
  approvalMode: "initial-review" | "regression"
): string[];

export function validateInitialReviewResult(
  record: unknown,
  expected: Readonly<{
    gate: string;
    qualifiedStatus: string;
    fixtureManifestSha256: string;
    approvalRecordSha256: string;
    approvalCommit: string;
    controlledCalibrationCoreSha256: string;
    sideBySidePngSha256: string;
    captureHashes: Readonly<Record<string, string>>;
    captureStates: readonly string[];
  }>
): string[];

export function regressionMetricsPass(
  metrics: Readonly<{
    diffPixelRatio: number;
    meanAbsoluteChannelDifference: number;
  }>,
  thresholds: Readonly<{
    maximumDiffPixelRatio: number;
    maximumMeanAbsoluteChannelDifference: number;
  }>
): boolean;
