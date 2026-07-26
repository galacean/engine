const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactObjectKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function parseAndValidateJson(text, invalidJsonPrefix, validator) {
  try {
    const record = JSON.parse(text);
    return {
      record,
      failures: validator(record)
    };
  } catch (error) {
    return {
      record: null,
      failures: [`${invalidJsonPrefix}: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

export function createControlledCalibrationCore(record) {
  if (!isRecord(record)) return record;
  const { artifact: _artifact, coreSha256: _coreSha256, readback: _readback, ...core } = record;
  if (!isRecord(core.metrics)) return core;

  const metrics = { ...core.metrics };
  if (isRecord(metrics.detailNormalFrequency)) {
    const { artifact: _detailNormalArtifact, ...detailNormalFrequency } = metrics.detailNormalFrequency;
    metrics.detailNormalFrequency = detailNormalFrequency;
  }
  return { ...core, metrics };
}

export function validateM3ApprovalRecord(record, expected, approvalMode) {
  const failures = [];
  const requireApproval = (condition, message) => {
    if (!condition) failures.push(message);
  };
  if (!isRecord(record)) return ["approval record root must be an object"];

  const requiresCurrentEvidenceIdentity = approvalMode === "initial-review";
  requireApproval(record.schemaVersion === 1, "schemaVersion must be 1");
  requireApproval(record.recordType === "grasslands-m3-visual-approval", "recordType is invalid");
  requireApproval(record.decision === "approved", "decision must be exactly 'approved'");
  requireApproval(record.caseId === expected.caseId, "caseId does not match Grasslands");
  requireApproval(COMMIT_PATTERN.test(record.commit), "commit must be a full lowercase Git SHA");
  if (requiresCurrentEvidenceIdentity) {
    requireApproval(record.commit === expected.commit, "approval commit does not match the initial-review run commit");
  }
  requireApproval(
    typeof record.approvedAt === "string" && Number.isFinite(Date.parse(record.approvedAt)),
    "approvedAt must be a valid RFC3339 timestamp"
  );
  requireApproval(
    record.approver?.authority === "user" &&
      typeof record.approver?.displayName === "string" &&
      record.approver.displayName.trim().length > 0,
    "approver must identify user authority and a non-empty displayName"
  );
  requireApproval(
    record.source?.kind === "explicit-user-confirmation" &&
      typeof record.source?.reference === "string" &&
      record.source.reference.trim().length > 0,
    "source must identify an explicit user confirmation"
  );
  requireApproval(record.parityClaim === "water-material-mechanism-parity", "parityClaim changed");
  requireApproval(
    JSON.stringify(record.exclusions) === JSON.stringify(["environment-reflection-pattern"]),
    "approval must explicitly and exclusively record the environment-reflection-pattern exclusion"
  );
  requireApproval(
    record.fixtureManifestSha256 === expected.fixtureManifestSha256,
    "fixture manifest SHA-256 does not match the reviewed fixture"
  );
  requireApproval(
    record.referenceTargetSha256 === expected.referenceTargetSha256,
    "reference target SHA-256 does not match the frozen target"
  );

  const reviewedCalibrationCoreSha256 = record.reviewedEvidence?.controlledCalibrationCoreSha256;
  requireApproval(
    requiresCurrentEvidenceIdentity
      ? reviewedCalibrationCoreSha256 === expected.controlledCalibrationCoreSha256
      : typeof reviewedCalibrationCoreSha256 === "string" && SHA256_PATTERN.test(reviewedCalibrationCoreSha256),
    requiresCurrentEvidenceIdentity
      ? "controlled calibration core SHA-256 does not match the initial-review evidence"
      : "controlled calibration core SHA-256 is invalid"
  );
  const reviewedSideBySideSha256 = record.reviewedEvidence?.sideBySidePngSha256;
  requireApproval(
    requiresCurrentEvidenceIdentity
      ? reviewedSideBySideSha256 === expected.sideBySidePngSha256
      : typeof reviewedSideBySideSha256 === "string" && SHA256_PATTERN.test(reviewedSideBySideSha256),
    requiresCurrentEvidenceIdentity
      ? "side-by-side PNG SHA-256 does not match the initial-review evidence"
      : "side-by-side PNG SHA-256 is invalid"
  );
  const captureHashes = record.reviewedEvidence?.captureStatePngSha256;
  requireApproval(
    hasExactObjectKeys(captureHashes, expected.captureStates) &&
      expected.captureStates.every(
        (state) =>
          SHA256_PATTERN.test(captureHashes[state]) &&
          (!requiresCurrentEvidenceIdentity || captureHashes[state] === expected.captureHashes[state])
      ),
    requiresCurrentEvidenceIdentity
      ? "approval capture-state SHA-256 map does not match the eight states in the initial-review run"
      : "approval capture-state SHA-256 map does not define exactly the eight reviewed Golden states"
  );
  const mechanisms = record.mechanisms;
  requireApproval(
    mechanisms?.detailNormal?.approved === true &&
      mechanisms.detailNormal.directionApproved === true &&
      mechanisms.detailNormal.flipGreenApproved === true &&
      mechanisms.detailNormal.flipGreen === expected.flipGreen,
    "detailNormal approval, direction, or flipGreen is incomplete"
  );
  for (const mechanism of ["refraction", "depthColor", "contactFoam", "coastalAlpha", "specularReflection"]) {
    requireApproval(mechanisms?.[mechanism]?.approved === true, `${mechanism} is not explicitly approved`);
  }
  return failures;
}

export function validateInitialReviewResult(record, expected) {
  const failures = [];
  const requireQualification = (condition, message) => {
    if (!condition) failures.push(message);
  };
  if (!isRecord(record)) return ["initial-review result root must be an object"];

  const approval = record.phaseGate?.m3?.visualApprovalRecord;
  requireQualification(record.schemaVersion === 1, "initial-review result schemaVersion must be 1");
  requireQualification(
    record.gate === expected.gate && record.parityPhase === "m3",
    "initial-review result gate or parity phase is invalid"
  );
  requireQualification(record.status === "passed", "initial-review result status must be 'passed'");
  requireQualification(
    record.automationResult === "formal-m3-initial-review-gate-passed",
    "initial-review result automationResult is invalid"
  );
  requireQualification(
    record.evidenceClassification?.status === expected.qualifiedStatus,
    "initial-review result is not qualified clean native evidence"
  );
  requireQualification(
    record.phaseGate?.m3?.approvalMode === "initial-review" && record.phaseGate.m3.status === "passed",
    "initial-review phase Gate did not pass in initial-review mode"
  );
  requireQualification(
    record.phaseGate?.m3?.initialReviewQualification?.status === "current-run-verified" &&
      record.phaseGate.m3.initialReviewQualification.valid === true,
    "initial-review current-run identity qualification is invalid"
  );
  requireQualification(
    record.fixtureManifest?.sha256 === expected.fixtureManifestSha256,
    "initial-review fixture manifest SHA-256 does not match the current regression fixture"
  );
  requireQualification(
    approval?.sha256 === expected.approvalRecordSha256 && approval?.valid === true,
    "initial-review result is not bound to the current approval record"
  );
  requireQualification(
    record.source?.start?.head === expected.approvalCommit &&
      record.source?.end?.head === expected.approvalCommit &&
      record.source.start.fullStatus === "" &&
      record.source.end.fullStatus === "",
    "initial-review source is not the clean approval commit"
  );
  requireQualification(
    record.controlledGpuCalibration?.coreSha256 === expected.controlledCalibrationCoreSha256,
    "initial-review controlled calibration core is not bound to the approval"
  );
  requireQualification(
    record.referenceParity?.sideBySide?.sha256 === expected.sideBySidePngSha256,
    "initial-review side-by-side PNG is not bound to the approval"
  );
  const receiptCaptureStates = Array.isArray(record.captureStates) ? record.captureStates : [];
  const receiptCaptureHashes = Object.fromEntries(
    receiptCaptureStates.map((capture) => [capture?.state, capture?.artifact?.sha256])
  );
  requireQualification(
    receiptCaptureStates.length === expected.captureStates.length &&
      hasExactObjectKeys(receiptCaptureHashes, expected.captureStates) &&
      expected.captureStates.every((state) => receiptCaptureHashes[state] === expected.captureHashes[state]),
    "initial-review result is not bound to the eight approval capture hashes"
  );
  requireQualification(
    record.regressionGoldenEvaluation?.status === "passed",
    "initial-review result did not pass the approved Regression Golden"
  );
  return failures;
}

export function regressionMetricsPass(metrics, thresholds) {
  return (
    metrics.diffPixelRatio <= thresholds.maximumDiffPixelRatio &&
    metrics.meanAbsoluteChannelDifference <= thresholds.maximumMeanAbsoluteChannelDifference
  );
}
