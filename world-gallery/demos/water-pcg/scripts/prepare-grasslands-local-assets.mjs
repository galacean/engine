import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_MANIFEST_SCHEMA_VERSION = 1;
const EXPECTED_CASE_ID = "showcase-grasslands-stylized-water";
const EXPECTED_NORMAL_ROLE = "external-tangent-normal";
const EXPECTED_NORMAL_ASSET_ID = "grasslands-water-normal-1024";
const EXPECTED_NORMAL_FILENAME = "grasslands-water-normal-1024.png";
const EXPECTED_NORMAL_SHA256 = "0d9bfdded6d8c46cff4afe145cf052ec31f079ae03d89b73599ccb7807c02332";
const EXPECTED_NORMAL_BYTE_LENGTH = 533511;
const EXPECTED_NORMAL_WIDTH = 1024;
const EXPECTED_NORMAL_HEIGHT = 1024;
const SOURCE_PATH_ANCHOR = "galacean-inputs";
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST_PATH = resolve(SCRIPT_DIRECTORY, "..", "demo", "grasslands", "assets", "manifest.json");
const DEFAULT_LOCAL_ASSETS_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..", "demo", "grasslands", "local-assets");

function assertRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function assertSha256(value, label) {
  const hash = assertNonEmptyString(value, label);
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return hash;
}

function assertExactSampling(value) {
  const sampling = assertRecord(value, "Grasslands normal asset sampling");
  const expected = {
    colorSpace: "linear",
    wrapU: "repeat",
    wrapV: "repeat",
    filter: "bilinear",
    mipmaps: true,
    anisotropy: 1
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (sampling[field] !== expectedValue) {
      throw new Error(
        `Grasslands normal asset sampling.${field} must be ${JSON.stringify(expectedValue)}, received ${JSON.stringify(sampling[field])}.`
      );
    }
  }
}

function assertExactOwnership(value) {
  const ownership = assertRecord(value, "Grasslands normal asset ownership");
  const expected = {
    creator: "GrasslandsAssetLoader",
    runtime: "borrowed",
    destroyer: "GrasslandsAssetLoader"
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (ownership[field] !== expectedValue) {
      throw new Error(
        `Grasslands normal asset ownership.${field} must be ${JSON.stringify(expectedValue)}, received ${JSON.stringify(ownership[field])}.`
      );
    }
  }
}

function sourceRelativePathFromManifest(sourcePath, trackedFilename) {
  const sourceSegments = sourcePath.split(/[\\/]+/);
  const anchorIndex = sourceSegments.lastIndexOf(SOURCE_PATH_ANCHOR);
  if (anchorIndex < 0) {
    throw new Error(
      `Grasslands normal asset sourcePath must contain the audited ${SOURCE_PATH_ANCHOR} directory: ${sourcePath}`
    );
  }
  const relativeSegments = sourceSegments.slice(anchorIndex);
  if (relativeSegments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error(`Grasslands normal asset sourcePath has an unsafe audited-root suffix: ${sourcePath}`);
  }
  if (relativeSegments.at(-1) !== trackedFilename) {
    throw new Error(
      `Grasslands normal asset source/tracked filenames differ: ${relativeSegments.at(-1)} vs ${trackedFilename}.`
    );
  }
  return relativeSegments.join(sep);
}

async function readNormalAssetManifest(manifestPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Grasslands asset manifest is unavailable or invalid at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const manifest = assertRecord(parsed, "Grasslands asset manifest");
  if (manifest.schemaVersion !== EXPECTED_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Grasslands asset manifest schemaVersion must be ${EXPECTED_MANIFEST_SCHEMA_VERSION}, received ${JSON.stringify(manifest.schemaVersion)}.`
    );
  }
  if (manifest.caseId !== EXPECTED_CASE_ID) {
    throw new Error(
      `Grasslands asset manifest caseId must be ${EXPECTED_CASE_ID}, received ${JSON.stringify(manifest.caseId)}.`
    );
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== 1) {
    throw new Error("Grasslands asset manifest must contain exactly one normal asset.");
  }

  const asset = assertRecord(manifest.assets[0], "Grasslands normal asset");
  const assetId = assertNonEmptyString(asset.id, "Grasslands normal asset id");
  if (assetId !== EXPECTED_NORMAL_ASSET_ID) {
    throw new Error(
      `Grasslands normal asset id must be ${EXPECTED_NORMAL_ASSET_ID}, received ${JSON.stringify(assetId)}.`
    );
  }
  if (asset.role !== EXPECTED_NORMAL_ROLE) {
    throw new Error(
      `Grasslands normal asset role must be ${EXPECTED_NORMAL_ROLE}, received ${JSON.stringify(asset.role)}.`
    );
  }
  const sourcePath = assertNonEmptyString(asset.sourcePath, "Grasslands normal asset sourcePath");
  const sourceSha256 = assertSha256(asset.sourceSha256, "Grasslands normal asset sourceSha256");
  if (sourceSha256 !== EXPECTED_NORMAL_SHA256) {
    throw new Error(
      `Grasslands normal asset sourceSha256 must be ${EXPECTED_NORMAL_SHA256}, received ${sourceSha256}.`
    );
  }
  const trackedPath = assertNonEmptyString(asset.trackedPath, "Grasslands normal asset trackedPath");
  const trackedPathPortable = trackedPath.replaceAll("\\", "/");
  const trackedSegments = trackedPathPortable.split("/");
  if (
    trackedPath !== trackedPathPortable ||
    trackedSegments.length !== 4 ||
    trackedSegments[0] !== "demo" ||
    trackedSegments[1] !== "grasslands" ||
    trackedSegments[2] !== "assets" ||
    trackedSegments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`Grasslands normal asset trackedPath must use portable separators: ${trackedPath}`);
  }
  const trackedFilename = basename(trackedPath);
  if (trackedFilename === "." || trackedFilename === sep || trackedFilename.length === 0) {
    throw new Error(`Grasslands normal asset trackedPath has no filename: ${trackedPath}`);
  }
  if (trackedFilename !== EXPECTED_NORMAL_FILENAME) {
    throw new Error(
      `Grasslands normal asset tracked filename must be ${EXPECTED_NORMAL_FILENAME}, received ${trackedFilename}.`
    );
  }
  const trackedUrl = assertNonEmptyString(asset.trackedUrl, "Grasslands normal asset trackedUrl");
  const expectedTrackedUrl = `./${trackedPathPortable}`;
  if (trackedUrl !== expectedTrackedUrl) {
    throw new Error(
      `Grasslands normal asset trackedUrl must match trackedPath: expected ${expectedTrackedUrl}, received ${trackedUrl}.`
    );
  }
  const trackedSha256 = assertSha256(asset.trackedSha256, "Grasslands normal asset trackedSha256");
  if (trackedSha256 !== EXPECTED_NORMAL_SHA256) {
    throw new Error(
      `Grasslands normal asset trackedSha256 must be ${EXPECTED_NORMAL_SHA256}, received ${trackedSha256}.`
    );
  }
  if (trackedSha256 !== sourceSha256) {
    throw new Error(`Grasslands normal asset source/tracked SHA-256 differ: ${sourceSha256} vs ${trackedSha256}.`);
  }
  const byteLength = assertPositiveInteger(asset.byteLength, "Grasslands normal asset byteLength");
  const width = assertPositiveInteger(asset.width, "Grasslands normal asset width");
  const height = assertPositiveInteger(asset.height, "Grasslands normal asset height");
  if (byteLength !== EXPECTED_NORMAL_BYTE_LENGTH) {
    throw new Error(
      `Grasslands normal asset byteLength must be ${EXPECTED_NORMAL_BYTE_LENGTH}, received ${byteLength}.`
    );
  }
  if (width !== EXPECTED_NORMAL_WIDTH || height !== EXPECTED_NORMAL_HEIGHT) {
    throw new Error(
      `Grasslands normal asset dimensions must be ${EXPECTED_NORMAL_WIDTH}x${EXPECTED_NORMAL_HEIGHT}, received ${width}x${height}.`
    );
  }
  const derivative = assertRecord(asset.derivative, "Grasslands normal asset derivative");
  if (derivative.kind !== "same-byte-copy") {
    throw new Error(
      `Grasslands normal asset derivative.kind must be same-byte-copy, received ${JSON.stringify(derivative.kind)}.`
    );
  }
  assertExactSampling(asset.sampling);
  assertExactOwnership(asset.ownership);

  return Object.freeze({
    manifestPath,
    assetId,
    sourceRelativePath: sourceRelativePathFromManifest(sourcePath, trackedFilename),
    trackedFilename,
    sha256: sourceSha256,
    byteLength,
    width,
    height
  });
}

async function sha256(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

async function assertRegularFile(filePath, label) {
  let details;
  try {
    details = await stat(filePath);
  } catch (error) {
    throw new Error(
      `${label} is unavailable at ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!details.isFile()) {
    throw new Error(`${label} is not a regular file: ${filePath}`);
  }
  return details;
}

function isMissingFile(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export async function prepareGrasslandsLocalAssets(options = {}) {
  const caseRoot = options.caseRoot ?? process.env.GRASSLANDS_CASE_ROOT;
  if (typeof caseRoot !== "string" || caseRoot.trim().length === 0) {
    throw new Error("GRASSLANDS_CASE_ROOT must point to the audited Grasslands case directory.");
  }
  const manifestPath = resolve(options.manifestPath ?? DEFAULT_MANIFEST_PATH);
  const asset = await readNormalAssetManifest(manifestPath);
  const sourcePath = resolve(caseRoot, asset.sourceRelativePath);
  const localAssetsDirectory = resolve(options.localAssetsDirectory ?? DEFAULT_LOCAL_ASSETS_DIRECTORY);
  const expectedDestinationPath = resolve(localAssetsDirectory, asset.trackedFilename);
  const destinationPath = resolve(options.destinationPath ?? expectedDestinationPath);
  if (destinationPath !== expectedDestinationPath) {
    throw new Error(
      `Grasslands destination must be the manifest asset inside localAssetsDirectory: expected ${expectedDestinationPath}, received ${destinationPath}.`
    );
  }
  const sourceDetails = await assertRegularFile(sourcePath, "Grasslands source normal");
  if (sourceDetails.size !== asset.byteLength) {
    throw new Error(
      `Grasslands source normal byte length mismatch: expected ${asset.byteLength}, received ${sourceDetails.size}.`
    );
  }
  const sourceHash = await sha256(sourcePath);
  if (sourceHash !== asset.sha256) {
    throw new Error(`Grasslands source normal SHA-256 mismatch: expected ${asset.sha256}, received ${sourceHash}.`);
  }

  await mkdir(dirname(destinationPath), { recursive: true });
  try {
    const existingHash = await sha256(destinationPath);
    if (existingHash === asset.sha256) {
      const existingDetails = await stat(destinationPath);
      if (existingDetails.size !== asset.byteLength) {
        throw new Error(
          `Grasslands destination normal byte length mismatch: expected ${asset.byteLength}, received ${existingDetails.size}.`
        );
      }
      return Object.freeze({
        status: "already-current",
        assetId: asset.assetId,
        manifestPath,
        sourcePath,
        destinationPath,
        sha256: asset.sha256,
        byteLength: existingDetails.size
      });
    }
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  const temporaryPath = `${destinationPath}.tmp-${process.pid}-${randomUUID()}`;
  await rm(temporaryPath, { force: true });
  try {
    await copyFile(sourcePath, temporaryPath);
    const copiedDetails = await assertRegularFile(temporaryPath, "Grasslands copied normal");
    const copiedHash = await sha256(temporaryPath);
    if (copiedHash !== asset.sha256) {
      throw new Error(`Grasslands copied normal SHA-256 mismatch: expected ${asset.sha256}, received ${copiedHash}.`);
    }
    if (copiedDetails.size !== asset.byteLength) {
      throw new Error(
        `Grasslands copied normal byte length mismatch: expected ${asset.byteLength}, received ${copiedDetails.size}.`
      );
    }
    await rename(temporaryPath, destinationPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }

  const destinationHash = await sha256(destinationPath);
  if (destinationHash !== asset.sha256) {
    throw new Error(
      `Grasslands destination normal SHA-256 mismatch: expected ${asset.sha256}, received ${destinationHash}.`
    );
  }
  const destinationDetails = await stat(destinationPath);
  if (destinationDetails.size !== asset.byteLength) {
    throw new Error(
      `Grasslands destination normal byte length mismatch: expected ${asset.byteLength}, received ${destinationDetails.size}.`
    );
  }
  return Object.freeze({
    status: "copied",
    assetId: asset.assetId,
    manifestPath,
    sourcePath,
    destinationPath,
    sha256: destinationHash,
    byteLength: destinationDetails.size
  });
}

function isCliEntry() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntry()) {
  prepareGrasslandsLocalAssets()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
