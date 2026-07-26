import { access, cp, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const VISUAL_MODES = new Set(["capture", "compare", "update"]);

export const WATER_SHOWCASE_VISUAL_CASE_IDS = Object.freeze(["showcase-grasslands-stylized-water"]);

function parseCaseFilter(caseFilter) {
  return [
    ...new Set(
      caseFilter
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ];
}

export function resolveShowcaseVisualSelection({ mode, caseFilter, updateReason, updateApproval, availableCaseIds }) {
  if (!VISUAL_MODES.has(mode)) throw new RangeError(`Unknown visual mode '${mode}'. Use capture, compare, or update.`);
  const requestedCaseIds = parseCaseFilter(caseFilter);
  const unknownCaseIds = requestedCaseIds.filter((id) => !availableCaseIds.includes(id));
  if (unknownCaseIds.length > 0) {
    throw new RangeError(`Unknown Showcase visual case filter: ${unknownCaseIds.join(", ")}.`);
  }
  const selectedCaseIds = requestedCaseIds.length === 0 ? [...availableCaseIds] : requestedCaseIds;
  if (selectedCaseIds.length === 0) throw new Error("Showcase visual case filter selected no cases.");

  if (mode === "update") {
    if (requestedCaseIds.length !== 1) {
      throw new Error("Baseline update requires exactly one explicit WATER_PCG_VISUAL_CASE.");
    }
    if (updateReason.length < 12) {
      throw new Error("Baseline update requires WATER_PCG_VISUAL_UPDATE_REASON with at least 12 characters.");
    }
    const expectedApproval = `approved:${requestedCaseIds[0]}`;
    if (updateApproval !== expectedApproval) {
      throw new Error(
        `Baseline update requires WATER_PCG_VISUAL_UPDATE_APPROVAL='${expectedApproval}' after human review.`
      );
    }
  }

  return Object.freeze({
    requestedCaseIds: Object.freeze(requestedCaseIds),
    selectedCaseIds: Object.freeze(selectedCaseIds)
  });
}

export function assertImmutableShowcaseCases(previousManifest, nextManifest, updatedCaseId) {
  const previousCases = previousManifest?.cases ?? {};
  const nextCases = nextManifest?.cases ?? {};
  for (const [caseId, previousCase] of Object.entries(previousCases)) {
    if (caseId === updatedCaseId) continue;
    if (JSON.stringify(nextCases[caseId]) !== JSON.stringify(previousCase)) {
      throw new Error(`Unselected Showcase baseline manifest entry changed: ${caseId}.`);
    }
  }
}

export function assertImmutableShowcaseHashes(previousHashes, nextHashes, updatedCaseId) {
  for (const [caseId, previousCaseHashes] of Object.entries(previousHashes)) {
    if (caseId === updatedCaseId) continue;
    if (JSON.stringify(nextHashes[caseId]) !== JSON.stringify(previousCaseHashes)) {
      throw new Error(`Unselected Showcase baseline PNG hashes changed: ${caseId}.`);
    }
  }
}

export function assertMissingShowcaseBaselineAllowed(mode, caseId) {
  if (mode === "capture") return "candidate";
  if (mode === "update") return "approved-update";
  throw new Error(`${caseId} has no reviewed Showcase baseline.`);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stagedFilePath(stagedRoot, relativePath) {
  const path = resolve(stagedRoot, relativePath);
  if (!path.startsWith(`${stagedRoot}/`))
    throw new Error(`Baseline transaction path escapes staging: ${relativePath}.`);
  return path;
}

export async function commitShowcaseBaselineTransaction({
  baselineRoot,
  manifest,
  updatedCaseId,
  files,
  previousHashes,
  validateManifestFilesAtRoot,
  onPhase = async () => {}
}) {
  const transactionRoot = await mkdtemp(resolve(dirname(baselineRoot), `.${basename(baselineRoot)}-transaction-`));
  const stagedRoot = resolve(transactionRoot, basename(baselineRoot));
  const backupRoot = resolve(transactionRoot, `${basename(baselineRoot)}-backup`);
  const failedRoot = resolve(transactionRoot, `${basename(baselineRoot)}-failed`);
  const recovery = Object.freeze({ transactionRoot, stagedRoot, backupRoot, failedRoot, baselineRoot });
  let originalMoved = false;
  let stagedMoved = false;
  let preserveTransactionRoot = false;
  let cleanupWarning = null;
  try {
    await cp(baselineRoot, stagedRoot, { recursive: true, force: false, errorOnExist: true });
    for (const file of files) {
      const path = stagedFilePath(stagedRoot, file.relativePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.bytes, { flag: "w" });
    }
    await writeFile(resolve(stagedRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const stagedHashes = await validateManifestFilesAtRoot(manifest, stagedRoot);
    assertImmutableShowcaseHashes(previousHashes, stagedHashes, updatedCaseId);
    await onPhase("staged", recovery);

    await rename(baselineRoot, backupRoot);
    originalMoved = true;
    await onPhase("after-original-move", recovery);
    await rename(stagedRoot, baselineRoot);
    stagedMoved = true;
    await onPhase("after-staged-move", recovery);
    const committedHashes = await validateManifestFilesAtRoot(manifest, baselineRoot);
    assertImmutableShowcaseHashes(previousHashes, committedHashes, updatedCaseId);
    await onPhase("committed", recovery);
  } catch (error) {
    let rollbackError;
    if (originalMoved) {
      try {
        if (stagedMoved && (await pathExists(baselineRoot))) await rename(baselineRoot, failedRoot);
        await onPhase("before-rollback-restore", recovery);
        if (await pathExists(backupRoot)) await rename(backupRoot, baselineRoot);
        await onPhase("rolled-back", recovery);
      } catch (caughtRollbackError) {
        rollbackError = caughtRollbackError;
        preserveTransactionRoot = true;
      }
    }
    if (rollbackError) {
      const transactionError = new Error(
        `Showcase baseline transaction failed and rollback also failed. Recovery files are preserved at ${transactionRoot}.`
      );
      transactionError.cause = error;
      transactionError.rollbackError = rollbackError;
      transactionError.recovery = recovery;
      throw transactionError;
    }
    throw error;
  } finally {
    if (!preserveTransactionRoot) {
      try {
        await rm(transactionRoot, { recursive: true, force: true });
      } catch (error) {
        cleanupWarning = error instanceof Error ? error.message : String(error);
      }
    }
  }
  return Object.freeze({
    status: "committed",
    updatedCaseId,
    transactionRoot,
    cleanupWarning
  });
}
