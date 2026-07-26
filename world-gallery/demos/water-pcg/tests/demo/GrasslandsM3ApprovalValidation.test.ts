import { describe, expect, it } from "vitest";
import {
  parseAndValidateJson,
  regressionMetricsPass,
  validateInitialReviewResult,
  validateM3ApprovalRecord
} from "../../e2e/grasslands-m3-approval.mjs";

const CAPTURE_STATES = [
  "hero",
  "detail-normal",
  "refraction",
  "depth-color",
  "contact-foam",
  "coastal-alpha",
  "direct-specular",
  "reflection"
] as const;
const HASHES = Object.fromEntries(CAPTURE_STATES.map((state, index) => [state, `${index + 1}`.repeat(64)]));
const COMMIT = "a".repeat(40);
const FIXTURE_SHA256 = "b".repeat(64);
const REFERENCE_SHA256 = "c".repeat(64);
const CORE_SHA256 = "d".repeat(64);
const SIDE_BY_SIDE_SHA256 = "e".repeat(64);
const APPROVAL_RECORD_SHA256 = "f".repeat(64);

function createApprovalRecord() {
  return {
    schemaVersion: 1,
    recordType: "grasslands-m3-visual-approval",
    decision: "approved",
    caseId: "showcase-grasslands-stylized-water",
    commit: COMMIT,
    approvedAt: "2026-07-25T10:00:00+08:00",
    approver: { authority: "user", displayName: "user" },
    source: { kind: "explicit-user-confirmation", reference: "task-message" },
    parityClaim: "water-material-mechanism-parity",
    exclusions: ["environment-reflection-pattern"],
    fixtureManifestSha256: FIXTURE_SHA256,
    referenceTargetSha256: REFERENCE_SHA256,
    reviewedEvidence: {
      controlledCalibrationCoreSha256: CORE_SHA256,
      sideBySidePngSha256: SIDE_BY_SIDE_SHA256,
      captureStatePngSha256: { ...HASHES }
    },
    mechanisms: {
      detailNormal: { approved: true, directionApproved: true, flipGreenApproved: true, flipGreen: false },
      refraction: { approved: true },
      depthColor: { approved: true },
      contactFoam: { approved: true },
      coastalAlpha: { approved: true },
      specularReflection: { approved: true }
    }
  };
}

const APPROVAL_EXPECTED = {
  caseId: "showcase-grasslands-stylized-water",
  commit: COMMIT,
  fixtureManifestSha256: FIXTURE_SHA256,
  referenceTargetSha256: REFERENCE_SHA256,
  controlledCalibrationCoreSha256: CORE_SHA256,
  sideBySidePngSha256: SIDE_BY_SIDE_SHA256,
  captureHashes: HASHES,
  captureStates: CAPTURE_STATES,
  flipGreen: false
} as const;

function createInitialReviewResult() {
  const approval = createApprovalRecord();
  return {
    schemaVersion: 1,
    gate: "grasslands-water-parity",
    parityPhase: "m3",
    status: "passed",
    automationResult: "formal-m3-initial-review-gate-passed",
    evidenceClassification: { status: "qualified-clean-native" },
    fixtureManifest: { sha256: FIXTURE_SHA256 },
    source: {
      start: { head: COMMIT, fullStatus: "" },
      end: { head: COMMIT, fullStatus: "" }
    },
    controlledGpuCalibration: { coreSha256: CORE_SHA256 },
    referenceParity: { sideBySide: { sha256: SIDE_BY_SIDE_SHA256 } },
    captureStates: CAPTURE_STATES.map((state) => ({ state, artifact: { sha256: HASHES[state] } })),
    regressionGoldenEvaluation: { status: "passed" },
    phaseGate: {
      m3: {
        approvalMode: "initial-review",
        status: "passed",
        initialReviewQualification: { status: "current-run-verified", valid: true },
        visualApprovalRecord: { valid: true, sha256: APPROVAL_RECORD_SHA256, record: approval }
      }
    }
  };
}

const RECEIPT_EXPECTED = {
  gate: "grasslands-water-parity",
  qualifiedStatus: "qualified-clean-native",
  fixtureManifestSha256: FIXTURE_SHA256,
  approvalRecordSha256: APPROVAL_RECORD_SHA256,
  approvalCommit: COMMIT,
  controlledCalibrationCoreSha256: CORE_SHA256,
  sideBySidePngSha256: SIDE_BY_SIDE_SHA256,
  captureHashes: HASHES,
  captureStates: CAPTURE_STATES
} as const;

describe("Grasslands M3 approval validation", () => {
  it("binds every current evidence identity in initial-review mode", () => {
    expect(validateM3ApprovalRecord(createApprovalRecord(), APPROVAL_EXPECTED, "initial-review")).toEqual([]);

    const wrongCommit = createApprovalRecord();
    wrongCommit.commit = "9".repeat(40);
    expect(validateM3ApprovalRecord(wrongCommit, APPROVAL_EXPECTED, "initial-review")).toContain(
      "approval commit does not match the initial-review run commit"
    );

    const wrongCore = createApprovalRecord();
    wrongCore.reviewedEvidence.controlledCalibrationCoreSha256 = "8".repeat(64);
    expect(validateM3ApprovalRecord(wrongCore, APPROVAL_EXPECTED, "initial-review")).toContain(
      "controlled calibration core SHA-256 does not match the initial-review evidence"
    );

    const wrongSideBySide = createApprovalRecord();
    wrongSideBySide.reviewedEvidence.sideBySidePngSha256 = "7".repeat(64);
    expect(validateM3ApprovalRecord(wrongSideBySide, APPROVAL_EXPECTED, "initial-review")).toContain(
      "side-by-side PNG SHA-256 does not match the initial-review evidence"
    );

    const wrongCapture = createApprovalRecord();
    wrongCapture.reviewedEvidence.captureStatePngSha256.hero = "6".repeat(64);
    expect(validateM3ApprovalRecord(wrongCapture, APPROVAL_EXPECTED, "initial-review")).toContain(
      "approval capture-state SHA-256 map does not match the eight states in the initial-review run"
    );
  });

  it("allows current regression evidence to differ while keeping approval provenance valid", () => {
    const laterRun = {
      ...APPROVAL_EXPECTED,
      commit: "1".repeat(40),
      controlledCalibrationCoreSha256: "2".repeat(64),
      sideBySidePngSha256: "3".repeat(64),
      captureHashes: Object.fromEntries(CAPTURE_STATES.map((state) => [state, "4".repeat(64)]))
    };
    expect(validateM3ApprovalRecord(createApprovalRecord(), laterRun, "regression")).toEqual([]);
  });

  it("rejects a receipt when any initial-review binding is changed", () => {
    expect(validateInitialReviewResult(createInitialReviewResult(), RECEIPT_EXPECTED)).toEqual([]);

    const wrongApproval = createInitialReviewResult();
    wrongApproval.phaseGate.m3.visualApprovalRecord.sha256 = "0".repeat(64);
    expect(validateInitialReviewResult(wrongApproval, RECEIPT_EXPECTED)).toContain(
      "initial-review result is not bound to the current approval record"
    );

    const wrongCapture = createInitialReviewResult();
    wrongCapture.captureStates[0].artifact.sha256 = "0".repeat(64);
    expect(validateInitialReviewResult(wrongCapture, RECEIPT_EXPECTED)).toContain(
      "initial-review result is not bound to the eight approval capture hashes"
    );

    const duplicateCapture = createInitialReviewResult();
    duplicateCapture.captureStates.push(structuredClone(duplicateCapture.captureStates[0]));
    expect(validateInitialReviewResult(duplicateCapture, RECEIPT_EXPECTED)).toContain(
      "initial-review result is not bound to the eight approval capture hashes"
    );

    const unqualifiedIdentity = createInitialReviewResult();
    unqualifiedIdentity.phaseGate.m3.initialReviewQualification.status = "pending";
    expect(validateInitialReviewResult(unqualifiedIdentity, RECEIPT_EXPECTED)).toContain(
      "initial-review current-run identity qualification is invalid"
    );
  });

  it("keeps the frozen non-zero Regression tolerance path reachable", () => {
    const thresholds = {
      maximumDiffPixelRatio: 0.01,
      maximumMeanAbsoluteChannelDifference: 1.5
    };
    expect(regressionMetricsPass({ diffPixelRatio: 0.009, meanAbsoluteChannelDifference: 1.4 }, thresholds)).toBe(true);
    expect(regressionMetricsPass({ diffPixelRatio: 0.011, meanAbsoluteChannelDifference: 1.4 }, thresholds)).toBe(
      false
    );
    expect(regressionMetricsPass({ diffPixelRatio: 0.009, meanAbsoluteChannelDifference: 1.6 }, thresholds)).toBe(
      false
    );
  });

  it("validates parsed JSON null instead of treating it as an empty sentinel", () => {
    const receiptNull = parseAndValidateJson("null", "initial-review result is invalid JSON", (record) =>
      validateInitialReviewResult(record, RECEIPT_EXPECTED)
    );
    expect(receiptNull.failures).toEqual(["initial-review result root must be an object"]);

    const approvalNull = parseAndValidateJson("null", "approval record is not valid JSON", (record) =>
      validateM3ApprovalRecord(record, APPROVAL_EXPECTED, "initial-review")
    );
    expect(approvalNull.failures).toEqual(["approval record root must be an object"]);

    const invalidJson = parseAndValidateJson("{", "initial-review result is invalid JSON", (record) =>
      validateInitialReviewResult(record, RECEIPT_EXPECTED)
    );
    expect(invalidJson.failures[0]).toMatch(/^initial-review result is invalid JSON:/);
  });
});
