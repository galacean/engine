import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  analyzeGrasslandsDetailFrequency,
  evaluateGrasslandsDetailFrequencyParity
} from "./grasslands-water-frequency.mjs";
import {
  createControlledCalibrationCore,
  parseAndValidateJson,
  regressionMetricsPass,
  validateInitialReviewResult,
  validateM3ApprovalRecord
} from "./grasslands-m3-approval.mjs";
import {
  SOFTWARE_RENDERER_PATTERN,
  assertAcceptance,
  assertCanvasHealthy,
  assertCaseIdentity,
  assertNoPageErrors,
  assertRuntimeHealthy,
  collectPageDiagnostics,
  collectWebGlEnvironment,
  createCaseUrl,
  createRunContext,
  DEFAULT_WATER_PCG_URL,
  meanAbsoluteDifference,
  readCanvasProbe,
  serializeError,
  summarizeCanvasProbe,
  waitForAnimationFrames,
  waitForCaseReady,
  writeAcceptanceReport,
  WORLD_GALLERY_ROOT
} from "./water-acceptance-harness.mjs";

const GATE = "grasslands-water-parity";
const QUALIFIED_CLEAN_NATIVE_STATUS = "qualified-clean-native";
const SCRIPT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const REPOSITORY_ROOT = resolve(WORLD_GALLERY_ROOT, "..");
const BASELINE_MANIFEST_PATH = resolve(SCRIPT_DIRECTORY, "baselines/grasslands-water/manifest.json");
const BASELINE_DIRECTORY = resolve(BASELINE_MANIFEST_PATH, "..");
const FROZEN_REFERENCE_SHA256 = "c0f711b35a06a31557c3a4ca922ed06cb3c02bca769df420024749b6fd77b4cb";
const FROZEN_WATER_MASK_SHA256 = "49809d5ab371836ec33ccc3cd3a5a6561f25f4c838d4b007acfb65a27e619570";
const FROZEN_REFERENCE_ROIS_SHA256 = "aed18aa74a20ef1a284d40684e7d45c669ce8499c6e2511257c83eae3556abbb";
const FROZEN_MECHANISM_THRESHOLDS_SHA256 = "a8aef214471996de3bf31074eaf0e278cd59b8301bc99fa8be57e6e58755348a";
const PRE_LANDSCAPE_PROTECTION_ROIS_SHA256 = "ed763a36281d2e2602ad5ba2c08ccb71089c30c73a674befb49e87bc57f40f16";
const PRE_LANDSCAPE_ANCHOR_ROIS_SHA256 = "5ebd53433eac5ce94dff91011f0537529ba1ad5f3a9636fb449fde6d6790e838";
const PRE_LANDSCAPE_SUPPLEMENTAL_ROIS_SHA256 = "a5693297131795026c6b2bf4b2515c5ff0f88acdeb94878cb2f8536443f24077";
const EXPECTED_CANDIDATE_ROI_IDS = Object.freeze([
  "detail-normal",
  "refraction",
  "depth-color",
  "contact-foam-left",
  "contact-foam-right",
  "coastal-alpha",
  "specular-response"
]);
const CASE_DEFINITION = Object.freeze({
  id: "showcase-grasslands-stylized-water",
  label: "Grasslands Stylized Water",
  group: "showcase",
  runtime: "grasslands",
  preset: "hero-grasslands"
});
const FIXED_ENVIRONMENT = Object.freeze({
  viewport: Object.freeze({ width: 1340, height: 662 }),
  deviceScaleFactor: 1,
  graphicsApi: "webgl2",
  quality: "high",
  colorSpace: "linear",
  surfaceTime: 12.5,
  seed: 20260724,
  statsEnabled: false,
  hudEnabled: false,
  debugUiEnabled: false
});
const CAPTURE_STATES = Object.freeze([
  "hero",
  "detail-normal",
  "refraction",
  "depth-color",
  "contact-foam",
  "coastal-alpha",
  "direct-specular",
  "reflection"
]);
const CAPTURE_STATE_DEBUG_MODES = Object.freeze({
  hero: 0,
  "detail-normal": 23,
  refraction: 9,
  "depth-color": 25,
  "contact-foam": 26,
  "coastal-alpha": 27,
  "direct-specular": 28,
  reflection: 21
});
const APPENDED_DEBUG_MODES = Object.freeze([
  Object.freeze({ value: 23, name: "DetailNormal" }),
  Object.freeze({ value: 24, name: "SceneDepthDelta" }),
  Object.freeze({ value: 25, name: "DepthTint" }),
  Object.freeze({ value: 26, name: "ContactFoam" }),
  Object.freeze({ value: 27, name: "CoastalAlpha" }),
  Object.freeze({ value: 28, name: "DirectSpecular" }),
  Object.freeze({ value: 29, name: "EffectiveRoughness" })
]);
const CAUSAL_FEATURES = Object.freeze([
  "externalNormal",
  "refraction",
  "depthColor",
  "contactFoam",
  "coastalAlpha",
  "directSpecular",
  "reflection"
]);
const FEATURE_TARGET_ROIS = Object.freeze({
  externalNormal: Object.freeze(["detail-normal"]),
  refraction: Object.freeze(["refraction"]),
  depthColor: Object.freeze(["depth-color"]),
  contactFoam: Object.freeze(["anchor-rock-left-foreground", "anchor-rock-right-bank"]),
  coastalAlpha: Object.freeze(["coastal-alpha"]),
  directSpecular: Object.freeze(["specular-response"]),
  reflection: Object.freeze(["specular-response"])
});
const FEATURE_PROTECTION_CAPTURES = Object.freeze({
  externalNormal: Object.freeze([]),
  refraction: Object.freeze([Object.freeze({ state: "contact-foam", roiIds: FEATURE_TARGET_ROIS.contactFoam })]),
  depthColor: Object.freeze([Object.freeze({ state: "detail-normal", roiIds: FEATURE_TARGET_ROIS.externalNormal })]),
  contactFoam: Object.freeze([
    Object.freeze({ state: "contact-foam", roiIds: Object.freeze(["protection-open-water"]) })
  ]),
  coastalAlpha: Object.freeze([
    Object.freeze({ state: "direct-specular", roiIds: FEATURE_TARGET_ROIS.directSpecular })
  ]),
  directSpecular: Object.freeze([
    Object.freeze({ state: "depth-color", roiIds: FEATURE_TARGET_ROIS.depthColor }),
    Object.freeze({ state: "contact-foam", roiIds: FEATURE_TARGET_ROIS.contactFoam })
  ]),
  reflection: Object.freeze([
    Object.freeze({ state: "depth-color", roiIds: FEATURE_TARGET_ROIS.depthColor }),
    Object.freeze({ state: "contact-foam", roiIds: FEATURE_TARGET_ROIS.contactFoam })
  ])
});
const M1_PROTECTION_ROIS = Object.freeze([
  Object.freeze({
    id: "protection-bank-left",
    x: 0,
    y: 200,
    width: 150,
    height: 80,
    purpose: "candidate-only non-water terrain protection; fixed camera keeps this rectangle entirely on the left bank"
  }),
  Object.freeze({
    id: "protection-bank-right",
    x: 1190,
    y: 200,
    width: 150,
    height: 80,
    purpose: "candidate-only non-water terrain protection; fixed camera keeps this rectangle entirely on the right bank"
  }),
  Object.freeze({
    id: "protection-open-water",
    x: 580,
    y: 450,
    width: 180,
    height: 120,
    purpose:
      "candidate-only open-water protection; fixed terrain and anchor geometry leave this rectangle clear of banks and rocks"
  })
]);
const M1_TERRAIN_PROTECTION_ROI_IDS = Object.freeze(["protection-bank-left", "protection-bank-right"]);
const M1_ANCHOR_ROIS = Object.freeze([
  Object.freeze({
    id: "anchor-rock-left-foreground",
    x: 240,
    y: 275,
    width: 125,
    height: 100,
    purpose: "candidate-only Scene Depth contact ROI for anchor-rock-left-foreground"
  }),
  Object.freeze({
    id: "anchor-rock-right-bank",
    x: 1075,
    y: 285,
    width: 120,
    height: 100,
    purpose: "candidate-only Scene Depth contact ROI for anchor-rock-right-bank"
  }),
  Object.freeze({
    id: "anchor-rock-channel",
    x: 685,
    y: 170,
    width: 150,
    height: 90,
    purpose: "candidate-only Scene Depth contact ROI for anchor-rock-channel"
  })
]);
const ROI_SAMPLE_SIZE = Object.freeze({ width: 64, height: 36 });
const SETTLE_FRAME_COUNT = 8;
const CONTACT_STABILITY_FRAME_COUNT = 60;
const CONTROLLED_CALIBRATION_TIMEOUT_MS = 30_000;
const CONTROLLED_CALIBRATION_PROFILE_SAMPLE_COUNT = 2048;
const CONTROLLED_CALIBRATION_DETAIL_SIZE = 128;
const CONTROLLED_CALIBRATION_RESOURCE_KEYS = Object.freeze([
  "shader",
  "program",
  "buffer",
  "vertexArray",
  "texture",
  "framebuffer",
  "renderbuffer"
]);
const baseUrl = process.env.GRASSLANDS_WATER_URL?.trim() || process.env.WATER_PCG_URL?.trim() || DEFAULT_WATER_PCG_URL;
const headed = process.env.GRASSLANDS_WATER_HEADED === "1" || process.env.WATER_PCG_HEADED === "1";
const diagnosticMode = process.env.GRASSLANDS_WATER_DIAGNOSTIC === "1";
const parityPhase = process.env.GRASSLANDS_PARITY_PHASE?.trim().toLowerCase() || "m3";
assertAcceptance(parityPhase === "m1" || parityPhase === "m3", "GRASSLANDS_PARITY_PHASE must be 'm1' or 'm3'.", {
  parityPhase
});
const requestedM3ApprovalMode = process.env.GRASSLANDS_M3_APPROVAL_MODE?.trim().toLowerCase();
const m3ApprovalMode = requestedM3ApprovalMode || (parityPhase === "m1" ? "regression" : "unset");
const m3ApprovalModeExplicit =
  requestedM3ApprovalMode !== undefined && (m3ApprovalMode === "initial-review" || m3ApprovalMode === "regression");
const explicitEvidenceRoot = process.env.GRASSLANDS_WATER_EVIDENCE_DIR?.trim();
const runEnvironment = explicitEvidenceRoot
  ? { ...process.env, WATER_PCG_ACCEPTANCE_OUTPUT_DIR: explicitEvidenceRoot }
  : process.env;
const run = createRunContext(GATE, runEnvironment);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hashJson(value) {
  return sha256(Buffer.from(JSON.stringify(value), "utf8"));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactObjectKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function runCommand(command, args, cwd = REPOSITORY_ROOT) {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

function readRepositorySourceEvidence() {
  try {
    return {
      status: "available",
      repositoryRoot: runCommand("git", ["rev-parse", "--show-toplevel"]),
      head: runCommand("git", ["rev-parse", "HEAD"]),
      branch: runCommand("git", ["branch", "--show-current"]) || "detached",
      fullStatus: runCommand("git", ["status", "--porcelain=v1", "--untracked-files=all"])
    };
  } catch (error) {
    return { status: "unavailable", error: serializeError(error) };
  }
}

function inspectLocalViteListener(urlText) {
  const url = new URL(urlText);
  assertAcceptance(
    url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1"),
    "Grasslands parity requires an HTTP localhost Vite server.",
    { baseUrl: urlText }
  );
  const port = Number(url.port);
  assertAcceptance(
    Number.isInteger(port) && port > 0 && port <= 65535,
    "Grasslands parity URL needs an explicit port.",
    {
      baseUrl: urlText
    }
  );
  const listenerLines = runCommand("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpct"])
    .split("\n")
    .filter(Boolean);
  const pidLine = listenerLines.find((line) => line.startsWith("p"));
  assertAcceptance(pidLine, `No localhost listener is serving Grasslands parity on port ${port}.`, listenerLines);
  const pid = Number(pidLine.slice(1));
  assertAcceptance(Number.isInteger(pid) && pid > 0, "Grasslands parity listener PID is invalid.", listenerLines);
  const cwdLine = runCommand("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
    .split("\n")
    .find((line) => line.startsWith("n"));
  const cwd = cwdLine?.slice(1) ?? "";
  const command = runCommand("ps", ["-p", String(pid), "-o", "command="]);
  assertAcceptance(
    cwd === WORLD_GALLERY_ROOT,
    "Grasslands parity listener is not rooted at this world-gallery checkout.",
    {
      pid,
      cwd,
      expectedCwd: WORLD_GALLERY_ROOT,
      command
    }
  );
  assertAcceptance(/\bvite\b/i.test(command), "Grasslands parity listener is not a Vite process.", {
    pid,
    cwd,
    command
  });
  return {
    baseUrl: url.href,
    protocol: url.protocol,
    hostname: url.hostname,
    port,
    pid,
    cwd,
    command,
    listenerLines
  };
}

function readPngDimensions(bytes) {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assertAcceptance(
    bytes.byteLength >= 24 && bytes.subarray(0, 8).equals(pngSignature) && bytes.toString("ascii", 12, 16) === "IHDR",
    "Grasslands target reference is not a valid PNG with an IHDR header."
  );
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function assertPolygonCollection(polygons, label, width, height) {
  assertAcceptance(Array.isArray(polygons) && polygons.length > 0, `${label} must contain frozen polygons.`, polygons);
  for (const polygon of polygons) {
    assertAcceptance(Array.isArray(polygon) && polygon.length >= 3, `${label} contains an invalid polygon.`, polygon);
    for (const point of polygon) {
      assertAcceptance(
        Array.isArray(point) &&
          point.length === 2 &&
          point.every(Number.isInteger) &&
          point[0] >= 0 &&
          point[0] < width &&
          point[1] >= 0 &&
          point[1] < height,
        `${label} contains an out-of-bounds point.`,
        point
      );
    }
  }
}

function flattenReferenceRois(referenceRois) {
  const output = [];
  for (const [group, definitions] of Object.entries(referenceRois)) {
    assertAcceptance(Array.isArray(definitions) && definitions.length > 0, `Reference ROI group '${group}' is empty.`);
    definitions.forEach((definition, index) => {
      output.push({
        id:
          group === "contact-foam"
            ? index === 0
              ? "contact-foam-left"
              : index === 1
                ? "contact-foam-right"
                : `contact-foam-${index + 1}`
            : group,
        group,
        ...definition
      });
    });
  }
  return output;
}

function assertRoiDefinitions(referenceRois, candidateRois) {
  const flattenedReference = flattenReferenceRois(referenceRois);
  assertAcceptance(
    JSON.stringify(flattenedReference.map(({ id }) => id)) === JSON.stringify(EXPECTED_CANDIDATE_ROI_IDS),
    "Frozen reference mechanism ROI IDs or order changed.",
    flattenedReference
  );
  assertAcceptance(
    JSON.stringify(candidateRois.map(({ id }) => id)) === JSON.stringify(EXPECTED_CANDIDATE_ROI_IDS),
    "Candidate fixture mechanism ROI IDs or order changed.",
    candidateRois
  );
  for (const candidate of candidateRois) {
    const reference = flattenedReference.find(({ id }) => id === candidate.id);
    assertAcceptance(reference, `Candidate ROI '${candidate.id}' has no frozen reference ROI.`);
    for (const field of ["x", "y", "width", "height"]) {
      assertAcceptance(
        Number.isInteger(candidate[field]) && candidate[field] === reference[field] && candidate[field] >= 0,
        `Candidate ROI '${candidate.id}' ${field} changed from the frozen M0 fixture.`,
        { candidate, reference }
      );
    }
    assertAcceptance(
      candidate.width > 0 &&
        candidate.height > 0 &&
        candidate.x + candidate.width <= FIXED_ENVIRONMENT.viewport.width &&
        candidate.y + candidate.height <= FIXED_ENVIRONMENT.viewport.height,
      `Candidate ROI '${candidate.id}' is outside the frozen canvas.`,
      candidate
    );
    assertAcceptance(
      candidate.purpose === reference.purpose,
      `Candidate ROI '${candidate.id}' purpose changed from the frozen M0 fixture.`,
      { candidate, reference }
    );
  }
  return flattenedReference;
}

function assertM1ProtectionRois() {
  const ids = new Set();
  const rois = [...M1_PROTECTION_ROIS, ...M1_ANCHOR_ROIS];
  for (const roi of rois) {
    assertAcceptance(!ids.has(roi.id), `Duplicate M1 supplemental ROI '${roi.id}'.`);
    ids.add(roi.id);
    assertAcceptance(
      Number.isInteger(roi.x) &&
        Number.isInteger(roi.y) &&
        Number.isInteger(roi.width) &&
        Number.isInteger(roi.height) &&
        roi.x >= 0 &&
        roi.y >= 0 &&
        roi.width > 0 &&
        roi.height > 0 &&
        roi.x + roi.width <= FIXED_ENVIRONMENT.viewport.width &&
        roi.y + roi.height <= FIXED_ENVIRONMENT.viewport.height,
      `M1 supplemental ROI '${roi.id}' is outside the frozen candidate canvas.`,
      roi
    );
  }
  return rois;
}

function assertCandidateSupplementalRoiMigration(candidateRois) {
  assertAcceptance(
    Array.isArray(candidateRois) && candidateRois.length === 16,
    "Expanded Grasslands fixture must expose 16 candidate-only supplemental ROIs.",
    candidateRois
  );
  const byId = new Map();
  for (const roi of candidateRois) {
    assertAcceptance(!byId.has(roi.id), `Duplicate candidate supplemental ROI '${roi.id}'.`, candidateRois);
    assertAcceptance(
      Number.isInteger(roi.x) &&
        Number.isInteger(roi.y) &&
        Number.isInteger(roi.width) &&
        Number.isInteger(roi.height) &&
        roi.x >= 0 &&
        roi.y >= 0 &&
        roi.width > 0 &&
        roi.height > 0 &&
        roi.x + roi.width <= FIXED_ENVIRONMENT.viewport.width &&
        roi.y + roi.height <= FIXED_ENVIRONMENT.viewport.height,
      `Candidate supplemental ROI '${roi.id}' is outside the fixed viewport.`,
      roi
    );
    byId.set(roi.id, roi);
  }
  const mappings = [
    ["candidate-left-bank", M1_PROTECTION_ROIS[0]],
    ["candidate-right-bank", M1_PROTECTION_ROIS[1]],
    ["candidate-open-water", M1_PROTECTION_ROIS[2]],
    ["candidate-anchor-left", M1_ANCHOR_ROIS[0]],
    ["candidate-anchor-right", M1_ANCHOR_ROIS[1]],
    ["candidate-anchor-channel", M1_ANCHOR_ROIS[2]]
  ];
  for (const [candidateId, harnessRoi] of mappings) {
    const candidate = byId.get(candidateId);
    assertAcceptance(candidate, `Candidate supplemental ROI '${candidateId}' is missing.`, candidateRois);
    for (const field of ["x", "y", "width", "height"]) {
      assertAcceptance(
        candidate[field] === harnessRoi[field],
        `Candidate supplemental ROI '${candidateId}' does not match its harness projection.`,
        { candidate, harnessRoi }
      );
    }
  }
  return {
    sourceCommit: "f3643895821f2767c9a1b91ef1902f71deab1d5e",
    reason: "hero-camera-and-landscape-layout",
    candidateOnly: true,
    referenceArtifactsChanged: false,
    oldProtectionRoisSha256: PRE_LANDSCAPE_PROTECTION_ROIS_SHA256,
    oldAnchorRoisSha256: PRE_LANDSCAPE_ANCHOR_ROIS_SHA256,
    oldSupplementalRoisSha256: PRE_LANDSCAPE_SUPPLEMENTAL_ROIS_SHA256,
    newCandidateRoisSha256: hashJson(candidateRois),
    rois: candidateRois
  };
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonArtifact(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, bytes);
  return {
    path,
    relativePath: relative(run.outputDirectory, path),
    sha256: sha256(bytes),
    byteLength: bytes.byteLength
  };
}

async function decodeFullResolutionRoi(page, pngBytes, roi, label) {
  return page.evaluate(
    async ({ screenshotUrl, definition, expectedWidth, expectedHeight, sourceLabel }) => {
      const source = await new Promise((resolveImage, rejectImage) => {
        const image = new Image();
        image.onload = () => resolveImage(image);
        image.onerror = () => rejectImage(new Error(`Unable to decode ${sourceLabel} for frequency analysis.`));
        image.src = screenshotUrl;
      });
      if (source.naturalWidth !== expectedWidth || source.naturalHeight !== expectedHeight) {
        throw new Error(
          `${sourceLabel} is ${source.naturalWidth}x${source.naturalHeight}; ` +
            `expected ${expectedWidth}x${expectedHeight}.`
        );
      }
      if (
        definition.x < 0 ||
        definition.y < 0 ||
        definition.width <= 0 ||
        definition.height <= 0 ||
        definition.x + definition.width > source.naturalWidth ||
        definition.y + definition.height > source.naturalHeight
      ) {
        throw new Error(`${sourceLabel} ROI is outside the frozen image.`);
      }
      const canvas = document.createElement("canvas");
      canvas.width = definition.width;
      canvas.height = definition.height;
      const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
      if (!context) throw new Error(`Unable to create ${sourceLabel} full-resolution ROI context.`);
      context.drawImage(
        source,
        definition.x,
        definition.y,
        definition.width,
        definition.height,
        0,
        0,
        definition.width,
        definition.height
      );
      const pixels = context.getImageData(0, 0, definition.width, definition.height).data;
      return {
        width: definition.width,
        height: definition.height,
        rgbaBytes: Array.from(pixels)
      };
    },
    {
      screenshotUrl: `data:image/png;base64,${pngBytes.toString("base64")}`,
      definition: roi,
      expectedWidth: FIXED_ENVIRONMENT.viewport.width,
      expectedHeight: FIXED_ENVIRONMENT.viewport.height,
      sourceLabel: label
    }
  );
}

async function compareRegressionPngBytes(page, oldBytes, newBytes, thresholds, rois = []) {
  return page.evaluate(
    async ({ oldUrl, newUrl, expectedWidth, expectedHeight, frozenThresholds, roiDefinitions }) => {
      const decode = (url) =>
        new Promise((resolveImage, rejectImage) => {
          const image = new Image();
          image.onload = () => resolveImage(image);
          image.onerror = () => rejectImage(new Error("Unable to decode Grasslands Regression Golden PNG."));
          image.src = url;
        });
      const [oldImage, newImage] = await Promise.all([decode(oldUrl), decode(newUrl)]);
      if (
        oldImage.naturalWidth !== expectedWidth ||
        oldImage.naturalHeight !== expectedHeight ||
        newImage.naturalWidth !== expectedWidth ||
        newImage.naturalHeight !== expectedHeight
      ) {
        throw new Error(
          `Regression PNG dimensions differ: old=${oldImage.naturalWidth}x${oldImage.naturalHeight}, ` +
            `new=${newImage.naturalWidth}x${newImage.naturalHeight}.`
        );
      }
      const makeCanvas = () => {
        const canvas = document.createElement("canvas");
        canvas.width = expectedWidth;
        canvas.height = expectedHeight;
        return canvas;
      };
      const oldCanvas = makeCanvas();
      const newCanvas = makeCanvas();
      const diffCanvas = makeCanvas();
      const oldContext = oldCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
      const newContext = newCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
      const diffContext = diffCanvas.getContext("2d", { alpha: false });
      if (!oldContext || !newContext || !diffContext) {
        throw new Error("Regression Golden comparison contexts are unavailable.");
      }
      oldContext.drawImage(oldImage, 0, 0);
      newContext.drawImage(newImage, 0, 0);
      const oldPixels = oldContext.getImageData(0, 0, expectedWidth, expectedHeight).data;
      const newPixels = newContext.getImageData(0, 0, expectedWidth, expectedHeight).data;
      const diffImage = diffContext.createImageData(expectedWidth, expectedHeight);
      let diffPixelCount = 0;
      let absoluteChannelDifference = 0;
      let maximumChannelDifference = 0;
      for (let offset = 0; offset < oldPixels.length; offset += 4) {
        let pixelMaximum = 0;
        let pixelDifference = 0;
        for (let channel = 0; channel < 3; channel++) {
          const difference = Math.abs(oldPixels[offset + channel] - newPixels[offset + channel]);
          absoluteChannelDifference += difference;
          pixelDifference += difference;
          pixelMaximum = Math.max(pixelMaximum, difference);
        }
        maximumChannelDifference = Math.max(maximumChannelDifference, pixelMaximum);
        if (pixelMaximum > frozenThresholds.perChannelByteTolerance) diffPixelCount++;
        const amplified = Math.min(255, pixelMaximum * 4);
        diffImage.data[offset] = amplified;
        diffImage.data[offset + 1] = Math.min(255, Math.round(pixelDifference / 3));
        diffImage.data[offset + 2] = amplified > 0 ? 32 : 0;
        diffImage.data[offset + 3] = 255;
      }
      diffContext.putImageData(diffImage, 0, 0);
      const pixelCount = expectedWidth * expectedHeight;
      const roiMetrics = roiDefinitions.map((roi) => {
        let roiDiffPixelCount = 0;
        let roiAbsoluteChannelDifference = 0;
        let roiMaximumChannelDifference = 0;
        for (let y = roi.y; y < roi.y + roi.height; y++) {
          for (let x = roi.x; x < roi.x + roi.width; x++) {
            const offset = (y * expectedWidth + x) * 4;
            let pixelMaximum = 0;
            for (let channel = 0; channel < 3; channel++) {
              const difference = Math.abs(oldPixels[offset + channel] - newPixels[offset + channel]);
              roiAbsoluteChannelDifference += difference;
              pixelMaximum = Math.max(pixelMaximum, difference);
            }
            roiMaximumChannelDifference = Math.max(roiMaximumChannelDifference, pixelMaximum);
            if (pixelMaximum > frozenThresholds.perChannelByteTolerance) roiDiffPixelCount++;
          }
        }
        const roiPixelCount = roi.width * roi.height;
        return {
          id: roi.id,
          sourceRectangle: { x: roi.x, y: roi.y, width: roi.width, height: roi.height },
          pixelCount: roiPixelCount,
          diffPixelCount: roiDiffPixelCount,
          diffPixelRatio: roiDiffPixelCount / roiPixelCount,
          meanAbsoluteChannelDifference: roiAbsoluteChannelDifference / (roiPixelCount * 3),
          maximumChannelDifference: roiMaximumChannelDifference
        };
      });
      return {
        metrics: {
          width: expectedWidth,
          height: expectedHeight,
          pixelCount,
          diffPixelCount,
          diffPixelRatio: diffPixelCount / pixelCount,
          meanAbsoluteChannelDifference: absoluteChannelDifference / (pixelCount * 3),
          maximumChannelDifference
        },
        roiMetrics,
        diffDataUrl: diffCanvas.toDataURL("image/png")
      };
    },
    {
      oldUrl: `data:image/png;base64,${oldBytes.toString("base64")}`,
      newUrl: `data:image/png;base64,${newBytes.toString("base64")}`,
      expectedWidth: FIXED_ENVIRONMENT.viewport.width,
      expectedHeight: FIXED_ENVIRONMENT.viewport.height,
      frozenThresholds: thresholds,
      roiDefinitions: rois
    }
  );
}

async function evaluateLandscapeComposition(
  page,
  capturesByState,
  candidateValidationRois,
  initialSnapshot,
  run,
  artifactIndex
) {
  const hero = capturesByState.get("hero");
  const detailNormal = capturesByState.get("detail-normal");
  assertAcceptance(hero?.bytes && detailNormal?.bytes, "Landscape composition captures are incomplete.");
  const requiredLandscapeRoiIds = [
    "candidate-far-river",
    "candidate-narrow-channel",
    "candidate-mid-bay",
    "candidate-near-shoal"
  ];
  const landscapeRois = requiredLandscapeRoiIds.map((id) => candidateValidationRois.find((roi) => roi.id === id));
  assertAcceptance(
    landscapeRois.every(Boolean),
    "Grasslands candidate fixture does not define all four landscape region ROIs.",
    candidateValidationRois
  );
  const comparison = await compareRegressionPngBytes(
    page,
    hero.bytes,
    detailNormal.bytes,
    { perChannelByteTolerance: 8 },
    landscapeRois
  );
  const waterScreenCoverageRatio = comparison.metrics.diffPixelRatio;
  assertAcceptance(
    waterScreenCoverageRatio >= 0.5 && waterScreenCoverageRatio <= 0.65,
    `Grasslands Hero water screen coverage ${waterScreenCoverageRatio} is outside [0.50, 0.65].`,
    comparison.metrics
  );
  assertAcceptance(
    initialSnapshot.scene.connectedWaterBodyCount === 1,
    "Grasslands expanded landscape is not one connected Heightfield water body.",
    initialSnapshot.scene
  );
  assertAcceptance(
    initialSnapshot.scene.landscapeExtentScaleXZ.every((scale) => scale >= 2 && scale <= 3),
    "Grasslands landscape extent is outside the approved 2x-3x range.",
    initialSnapshot.scene.landscapeExtentScaleXZ
  );
  const regionProbes = comparison.roiMetrics;
  for (const probe of regionProbes) {
    assertAcceptance(
      probe.diffPixelCount > 0,
      `Grasslands landscape region '${probe.id}' has no visible water signal.`,
      probe
    );
  }

  const directory = resolve(run.outputDirectory, "landscape-composition");
  await mkdir(directory, { recursive: true });
  const overlayBytes = Buffer.from(comparison.diffDataUrl.slice(comparison.diffDataUrl.indexOf(",") + 1), "base64");
  const overlayPath = resolve(directory, "water-screen-coverage-overlay.png");
  await writeFile(overlayPath, overlayBytes);
  const result = {
    status: "passed",
    method:
      "full-frame fixed-time Hero versus Debug 23 DetailNormal changed-pixel ratio at per-channel byte tolerance 8",
    waterScreenCoverageRatio,
    requiredRange: [0.5, 0.65],
    connectedWaterBodyCount: initialSnapshot.scene.connectedWaterBodyCount,
    extentScaleXZ: initialSnapshot.scene.landscapeExtentScaleXZ,
    landscapeRegionIds: initialSnapshot.scene.landscapeRegionIds,
    terrainTopology: {
      shorelineSampleCount: initialSnapshot.scene.terrainShorelineSampleCount,
      degenerateTriangleCount: initialSnapshot.scene.terrainDegenerateTriangleCount,
      directMudGrassAdjacencyCount: initialSnapshot.scene.terrainDirectMudGrassAdjacencyCount
    },
    regionProbes,
    overlay: {
      path: overlayPath,
      sha256: sha256(overlayBytes),
      byteLength: overlayBytes.byteLength
    }
  };
  const jsonArtifact = await writeJsonArtifact(resolve(directory, "landscape-composition.json"), result);
  artifactIndex.push(
    {
      category: "landscape-composition",
      name: "water-screen-coverage-overlay",
      path: overlayPath,
      relativePath: relative(run.outputDirectory, overlayPath),
      sha256: result.overlay.sha256,
      byteLength: overlayBytes.byteLength
    },
    {
      category: "landscape-composition",
      name: "metrics",
      ...jsonArtifact
    }
  );
  return result;
}

async function readCalibrationHostState(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas");
    const api = window.waterPcgGrasslands;
    if (!(canvas instanceof HTMLCanvasElement) || !api) {
      throw new Error("Grasslands calibration host canvas or API is unavailable.");
    }
    const pinnedKey = "__waterPcgGrasslandsCalibrationMainCanvas";
    const host = globalThis;
    if (!(host[pinnedKey] instanceof HTMLCanvasElement)) host[pinnedKey] = canvas;
    const context = canvas.getContext("webgl2");
    const snapshot = api.snapshot();
    return {
      documentCanvasCount: document.querySelectorAll("canvas").length,
      mainCanvasMatchesPinnedIdentity: host[pinnedKey] === canvas,
      mainCanvasWidth: canvas.width,
      mainCanvasHeight: canvas.height,
      mainContextAvailable: context !== null,
      mainContextLost: context?.isContextLost() ?? null,
      resources: structuredClone(snapshot.resources)
    };
  });
}

function requireCalibration(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function requireFiniteNumber(
  value,
  label,
  { minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY } = {}
) {
  requireCalibration(
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum,
    `${label} must be a finite number in [${minimum}, ${maximum}].`,
    value
  );
  return value;
}

function requireByteArray(value, expectedLength, label) {
  requireCalibration(Array.isArray(value), `${label} must be an array.`, value);
  requireCalibration(value.length === expectedLength, `${label} length changed.`, {
    expectedLength,
    actualLength: value.length
  });
  requireCalibration(
    value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255),
    `${label} must contain RGBA8 byte integers.`,
    value.slice(0, 32)
  );
  return value;
}

function requireRgbaProfileChannels(bytes, label) {
  for (let offset = 0; offset < bytes.length; offset += 4) {
    requireCalibration(
      bytes[offset] === bytes[offset + 1] && bytes[offset] === bytes[offset + 2] && bytes[offset + 3] === 255,
      `${label} contains an invalid scalar RGBA sample.`,
      { offset, rgba: bytes.slice(offset, offset + 4) }
    );
  }
}

function scalarProfile(bytes) {
  const values = [];
  for (let offset = 0; offset < bytes.length; offset += 4) values.push(bytes[offset]);
  return values;
}

function profileDepth(index, sampleCount, minimum, maximum) {
  return minimum + ((maximum - minimum) * index) / Math.max(1, sampleCount - 1);
}

function evaluateDepthAndContactMetrics(readback, thresholds) {
  requireCalibration(readback && typeof readback === "object", "Depth/contact GPU readback is missing.", readback);
  requireCalibration(
    JSON.stringify(readback.sampleDepthDeltaMeters) === JSON.stringify(thresholds.depthColor.sampleDepthDeltaMeters),
    "GPU depth sample steps changed from the frozen fixture.",
    readback.sampleDepthDeltaMeters
  );
  requireFiniteNumber(readback.rangeMeters, "depth range", { minimum: Number.MIN_VALUE });
  requireFiniteNumber(readback.exponent, "depth exponent", { minimum: Number.MIN_VALUE });
  requireCalibration(readback.rangeMeters === thresholds.depthColor.rangeMeters, "GPU depth range changed.", readback);
  requireCalibration(readback.exponent === thresholds.depthColor.exponent, "GPU depth exponent changed.", readback);
  const depthBytes = requireByteArray(
    readback.depthTintRgbaBytes,
    thresholds.depthColor.sampleDepthDeltaMeters.length * 4,
    "depthTintRgbaBytes"
  );
  requireRgbaProfileChannels(depthBytes, "depthTintRgbaBytes");
  let maximumLinearRgbChannelErrorBytes = 0;
  let monotonic = true;
  let previous = Number.NEGATIVE_INFINITY;
  const depthSamples = thresholds.depthColor.sampleDepthDeltaMeters.map((depthMeters, index) => {
    const expectedFactor = Math.pow(
      Math.min(1, Math.max(0, depthMeters / thresholds.depthColor.rangeMeters)),
      thresholds.depthColor.exponent
    );
    const expectedByte = Math.round(expectedFactor * 255);
    const actualByte = depthBytes[index * 4];
    maximumLinearRgbChannelErrorBytes = Math.max(
      maximumLinearRgbChannelErrorBytes,
      Math.abs(actualByte - expectedByte)
    );
    if (actualByte < previous) monotonic = false;
    previous = actualByte;
    return { depthMeters, expectedFactor, expectedByte, actualByte };
  });

  const contact = readback.contactProfile;
  requireCalibration(contact && typeof contact === "object", "Contact profile is missing.", contact);
  requireCalibration(contact.minimumDepthMeters === 0, "Contact profile minimum depth changed.", contact);
  requireFiniteNumber(contact.maximumDepthMeters, "contact profile maximum depth", { minimum: Number.MIN_VALUE });
  requireCalibration(
    contact.sampleCount === CONTROLLED_CALIBRATION_PROFILE_SAMPLE_COUNT,
    "Contact profile sample count changed.",
    contact.sampleCount
  );
  requireCalibration(
    contact.contactDistanceMeters === thresholds.contactFoam.contactRangeMeters,
    "Contact profile distance changed.",
    contact
  );
  const contactBytes = requireByteArray(
    contact.rgbaBytes,
    CONTROLLED_CALIBRATION_PROFILE_SAMPLE_COUNT * 4,
    "contactProfile.rgbaBytes"
  );
  requireRgbaProfileChannels(contactBytes, "contactProfile.rgbaBytes");
  const contactValues = scalarProfile(contactBytes);
  const positiveIndices = contactValues.map((value, index) => (value > 0 ? index : -1)).filter((index) => index >= 0);
  requireCalibration(positiveIndices.length > 0, "Contact profile contains no positive samples.", contactValues);
  const firstPositiveIndex = positiveIndices[0];
  const lastPositiveIndex = positiveIndices.at(-1);
  requireCalibration(firstPositiveIndex > 0, "Contact profile must fail closed at zero depth.", {
    firstPositiveIndex,
    firstValue: contactValues[0]
  });
  requireCalibration(
    lastPositiveIndex + 1 < contactValues.length,
    "Contact profile has no zero sample after its contact band.",
    { lastPositiveIndex }
  );
  let brokenEdgeCount = 0;
  for (let index = firstPositiveIndex + 1; index <= lastPositiveIndex; index++) {
    if (contactValues[index] === 0 || contactValues[index] > contactValues[index - 1]) brokenEdgeCount++;
  }
  const measuredContactRangeMeters = profileDepth(
    lastPositiveIndex + 1,
    contact.sampleCount,
    contact.minimumDepthMeters,
    contact.maximumDepthMeters
  );
  let openWaterLeakPixelCount = 0;
  let maximumContactReferenceErrorBytes = 0;
  for (let index = 0; index < contactValues.length; index++) {
    const depthMeters = profileDepth(
      index,
      contact.sampleCount,
      contact.minimumDepthMeters,
      contact.maximumDepthMeters
    );
    const expectedMask =
      depthMeters > 0 && depthMeters < contact.contactDistanceMeters
        ? 1 - depthMeters / contact.contactDistanceMeters
        : 0;
    maximumContactReferenceErrorBytes = Math.max(
      maximumContactReferenceErrorBytes,
      Math.abs(contactValues[index] - Math.round(expectedMask * 255))
    );
    if (depthMeters >= contact.contactDistanceMeters && contactValues[index] !== 0) openWaterLeakPixelCount++;
  }
  return {
    source: "harness-recomputed-from-raw-gpu-rgba8",
    depthColor: {
      samples: depthSamples,
      maximumLinearRgbChannelErrorBytes,
      monotonic
    },
    contactFoam: {
      firstPositiveIndex,
      lastPositiveIndex,
      measuredContactRangeMeters,
      rangeErrorMeters: Math.abs(measuredContactRangeMeters - thresholds.contactFoam.contactRangeMeters),
      maximumContactReferenceErrorBytes,
      openWaterLeakPixelCount,
      brokenEdgeCount
    }
  };
}

function expectedGradientSample(uv, size) {
  const x = Math.min(size[0] - 1, Math.max(0, Math.floor(Math.min(0.999999, Math.max(0, uv[0])) * size[0])));
  const y = Math.min(size[1] - 1, Math.max(0, Math.floor(Math.min(0.999999, Math.max(0, uv[1])) * size[1])));
  return [Math.round((x / (size[0] - 1)) * 255), Math.round((y / (size[1] - 1)) * 255), (x * 17 + y * 31) % 256, 255];
}

function evaluateRefractionMetrics(readback, thresholds) {
  requireCalibration(readback && typeof readback === "object", "Refraction GPU readback is missing.", readback);
  requireCalibration(
    Array.isArray(readback.normalDelta) &&
      readback.normalDelta.length === 2 &&
      readback.normalDelta.every((value) => typeof value === "number" && Number.isFinite(value)),
    "Refraction normal delta is invalid.",
    readback.normalDelta
  );
  requireFiniteNumber(readback.strength, "refraction strength", { minimum: 0 });
  requireFiniteNumber(readback.deltaEncodingScale, "refraction encoding scale", { minimum: Number.MIN_VALUE });
  const encoded = requireByteArray(readback.encodedUvDeltaRgbaBytes, 4, "encodedUvDeltaRgbaBytes");
  const measuredDelta = [
    (encoded[0] / 255 - 0.5) / readback.deltaEncodingScale,
    (encoded[1] / 255 - 0.5) / readback.deltaEncodingScale
  ];
  const normalMagnitudeSquared =
    readback.normalDelta[0] * readback.normalDelta[0] + readback.normalDelta[1] * readback.normalDelta[1];
  requireCalibration(normalMagnitudeSquared > 0, "Refraction normal delta is zero.", readback.normalDelta);
  const measuredOffsetScale =
    (measuredDelta[0] * readback.normalDelta[0] + measuredDelta[1] * readback.normalDelta[1]) / normalMagnitudeSquared;
  const measuredOffsetRelativeError =
    Math.abs(measuredOffsetScale - thresholds.refraction.expectedOffsetScale) /
    thresholds.refraction.expectedOffsetScale;
  requireCalibration(
    Array.isArray(readback.gradientTextureSize) &&
      readback.gradientTextureSize.length === 2 &&
      readback.gradientTextureSize.every((value) => Number.isInteger(value) && value > 1),
    "Refraction gradient size is invalid.",
    readback.gradientTextureSize
  );
  requireCalibration(
    Array.isArray(readback.centeredUv) &&
      readback.centeredUv.length === 2 &&
      readback.centeredUv.every((value) => typeof value === "number" && Number.isFinite(value)),
    "Refraction centered UV is invalid.",
    readback.centeredUv
  );
  const centered = requireByteArray(readback.centeredSampleRgbaBytes, 4, "centeredSampleRgbaBytes");
  const displaced = requireByteArray(readback.validDisplacedSampleRgbaBytes, 4, "validDisplacedSampleRgbaBytes");
  const guarded = requireByteArray(readback.aboveWaterGuardedSampleRgbaBytes, 4, "aboveWaterGuardedSampleRgbaBytes");
  const expectedCentered = expectedGradientSample(readback.centeredUv, readback.gradientTextureSize);
  const expectedDisplaced = expectedGradientSample(
    [
      readback.centeredUv[0] + readback.normalDelta[0] * readback.strength,
      readback.centeredUv[1] + readback.normalDelta[1] * readback.strength
    ],
    readback.gradientTextureSize
  );
  let maximumCpuReferenceChannelErrorBytes = 0;
  for (const [actual, expected] of [
    [centered, expectedCentered],
    [displaced, expectedDisplaced],
    [guarded, expectedCentered]
  ]) {
    for (let channel = 0; channel < 3; channel++) {
      maximumCpuReferenceChannelErrorBytes = Math.max(
        maximumCpuReferenceChannelErrorBytes,
        Math.abs(actual[channel] - expected[channel])
      );
    }
  }
  const aboveWaterWrongSampleCount = guarded.slice(0, 3).some((value, channel) => value !== centered[channel]) ? 1 : 0;
  return {
    source: "harness-recomputed-from-raw-gpu-rgba8",
    measuredDelta,
    measuredOffsetScale,
    measuredOffsetRelativeError,
    expectedCentered,
    expectedDisplaced,
    maximumCpuReferenceChannelErrorBytes,
    aboveWaterWrongSampleCount
  };
}

function evaluateCoastalMetrics(readback, thresholds) {
  requireCalibration(readback && typeof readback === "object", "Coastal-alpha GPU readback is missing.", readback);
  requireCalibration(readback.minimumDepthMeters === 0, "Coastal profile minimum depth changed.", readback);
  requireFiniteNumber(readback.maximumDepthMeters, "coastal profile maximum depth", { minimum: Number.MIN_VALUE });
  requireCalibration(
    readback.sampleCount === CONTROLLED_CALIBRATION_PROFILE_SAMPLE_COUNT,
    "Coastal profile sample count changed.",
    readback.sampleCount
  );
  requireCalibration(
    readback.distanceMeters === thresholds.coastalAlpha.transitionWidthMeters,
    "Coastal profile distance changed.",
    readback
  );
  const bytes = requireByteArray(
    readback.rgbaBytes,
    CONTROLLED_CALIBRATION_PROFILE_SAMPLE_COUNT * 4,
    "coastalAlpha.rgbaBytes"
  );
  requireRgbaProfileChannels(bytes, "coastalAlpha.rgbaBytes");
  const values = scalarProfile(bytes);
  let maximumCpuReferenceChannelErrorBytes = 0;
  let brokenEdgeCount = 0;
  let firstSaturatedIndex = -1;
  for (let index = 0; index < values.length; index++) {
    const depthMeters = profileDepth(
      index,
      readback.sampleCount,
      readback.minimumDepthMeters,
      readback.maximumDepthMeters
    );
    const expectedByte = Math.round(Math.min(1, Math.max(0, depthMeters / readback.distanceMeters)) * 255);
    maximumCpuReferenceChannelErrorBytes = Math.max(
      maximumCpuReferenceChannelErrorBytes,
      Math.abs(values[index] - expectedByte)
    );
    if (index > 0 && values[index] < values[index - 1]) brokenEdgeCount++;
    if (firstSaturatedIndex < 0 && values[index] === 255) firstSaturatedIndex = index;
  }
  requireCalibration(firstSaturatedIndex > 0, "Coastal profile never reaches its saturated edge.", {
    firstSaturatedIndex
  });
  const measuredTransitionWidthMeters = profileDepth(
    firstSaturatedIndex,
    readback.sampleCount,
    readback.minimumDepthMeters,
    readback.maximumDepthMeters
  );
  return {
    source: "harness-recomputed-from-raw-gpu-rgba8",
    measuredTransitionWidthMeters,
    widthErrorMeters: Math.abs(measuredTransitionWidthMeters - thresholds.coastalAlpha.transitionWidthMeters),
    maximumCpuReferenceChannelErrorBytes,
    monotonic: brokenEdgeCount === 0,
    brokenEdgeCount
  };
}

function evaluateWaterSurfaceDirectBrdfForCalibration(fresnelF0, roughness, angleDegrees) {
  const saturate = (value) => Math.min(1, Math.max(0, value));
  const minimumRoughness = 0.045;
  const epsilon = 0.000001;
  const normalDot = saturate(Math.cos((angleDegrees * Math.PI) / 180));
  const resolvedRoughness = Math.max(minimumRoughness, saturate(roughness));
  const alpha = resolvedRoughness * resolvedRoughness;
  const minimumAlpha = minimumRoughness * minimumRoughness;
  const resolvedAlpha = Math.max(minimumAlpha, alpha);
  const alphaSquared = resolvedAlpha * resolvedAlpha;
  const distributionDenominator = normalDot * normalDot * (alphaSquared - 1) + 1;
  const distribution =
    ((1 / Math.PI) * alphaSquared) / Math.max(distributionDenominator * distributionDenominator, epsilon);
  const smithTerm = normalDot * Math.sqrt(alphaSquared + (1 - alphaSquared) * normalDot * normalDot);
  const visibility = 0.5 / Math.max(smithTerm + smithTerm, epsilon);
  const boundedFresnel = saturate(fresnelF0);
  return boundedFresnel * distribution * visibility * normalDot * Math.PI;
}

function measureHalfPeakProfile(values, minimumAngle, maximumAngle) {
  const sampleCount = values.length;
  const angleAt = (index) => minimumAngle + ((maximumAngle - minimumAngle) * index) / (sampleCount - 1);
  const peakValue = Math.max(...values);
  requireCalibration(Number.isFinite(peakValue) && peakValue > 0, "Specular profile peak is invalid.", peakValue);
  const peakIndices = values
    .map((value, index) => (Math.abs(value - peakValue) <= 1e-12 ? index : -1))
    .filter((index) => index >= 0);
  const peakDirectionDegrees =
    peakIndices.reduce((sum, index) => sum + angleAt(index), 0) / Math.max(1, peakIndices.length);
  const halfPeak = peakValue * 0.5;
  const aboveHalf = values.map((value, index) => (value >= halfPeak ? index : -1)).filter((index) => index >= 0);
  requireCalibration(aboveHalf.length > 0, "Specular profile has no half-peak interval.", values.slice(0, 32));
  const first = aboveHalf[0];
  const last = aboveHalf.at(-1);
  const interpolateBoundary = (lowerIndex, upperIndex) => {
    const lowerValue = values[lowerIndex];
    const upperValue = values[upperIndex];
    if (lowerValue === upperValue) return angleAt(upperIndex);
    const ratio = (halfPeak - lowerValue) / (upperValue - lowerValue);
    return angleAt(lowerIndex) + (angleAt(upperIndex) - angleAt(lowerIndex)) * ratio;
  };
  const left = first > 0 ? interpolateBoundary(first - 1, first) : angleAt(first);
  const right = last < sampleCount - 1 ? interpolateBoundary(last + 1, last) : angleAt(last);
  return {
    peakValue,
    peakDirectionDegrees,
    halfPeakWidthDegrees: right - left
  };
}

function evaluateSpecularMetrics(readback, thresholds) {
  requireCalibration(readback && typeof readback === "object", "Specular GPU readback is missing.", readback);
  requireCalibration(readback.source === "gpu-controlled-normal-wedge", "Specular source is invalid.", readback.source);
  requireFiniteNumber(readback.minimumAngleDegrees, "specular minimum angle");
  requireFiniteNumber(readback.maximumAngleDegrees, "specular maximum angle");
  requireCalibration(
    readback.maximumAngleDegrees > readback.minimumAngleDegrees,
    "Specular angle range is invalid.",
    readback
  );
  requireCalibration(
    readback.sampleCount === CONTROLLED_CALIBRATION_PROFILE_SAMPLE_COUNT,
    "Specular sample count changed.",
    readback.sampleCount
  );
  requireFiniteNumber(readback.encodingScale, "specular encoding scale", { minimum: Number.MIN_VALUE });
  requireFiniteNumber(readback.roughness, "specular roughness", { minimum: 0, maximum: 1 });
  requireFiniteNumber(readback.fresnelF0, "specular Fresnel F0", { minimum: 0, maximum: 1 });
  requireCalibration(
    JSON.stringify(readback.viewDirection) === JSON.stringify([0, 0, 1]) &&
      JSON.stringify(readback.lightDirection) === JSON.stringify([0, 0, 1]),
    "Specular controlled directions changed.",
    readback
  );
  const bytes = requireByteArray(
    readback.rgbaBytes,
    CONTROLLED_CALIBRATION_PROFILE_SAMPLE_COUNT * 4,
    "specularResponse.rgbaBytes"
  );
  requireRgbaProfileChannels(bytes, "specularResponse.rgbaBytes");
  const encodedValues = scalarProfile(bytes);
  requireCalibration(
    encodedValues.every((value) => value < 255),
    "Specular RGBA8 encoding saturated; peak evidence is lossy.",
    { saturatedSampleCount: encodedValues.filter((value) => value === 255).length }
  );
  const gpuValues = encodedValues.map((value) => value / 255 / readback.encodingScale);
  const cpuValues = Array.from({ length: readback.sampleCount }, (_, index) => {
    const angle =
      readback.minimumAngleDegrees +
      ((readback.maximumAngleDegrees - readback.minimumAngleDegrees) * index) / (readback.sampleCount - 1);
    return evaluateWaterSurfaceDirectBrdfForCalibration(readback.fresnelF0, readback.roughness, angle);
  });
  const gpuProfile = measureHalfPeakProfile(gpuValues, readback.minimumAngleDegrees, readback.maximumAngleDegrees);
  const cpuProfile = measureHalfPeakProfile(cpuValues, readback.minimumAngleDegrees, readback.maximumAngleDegrees);
  const peakDirectionErrorDegrees = Math.abs(gpuProfile.peakDirectionDegrees - cpuProfile.peakDirectionDegrees);
  const halfPeakWidthRelativeError =
    Math.abs(gpuProfile.halfPeakWidthDegrees - cpuProfile.halfPeakWidthDegrees) / cpuProfile.halfPeakWidthDegrees;
  const peakLuminanceRelativeError = Math.abs(gpuProfile.peakValue - cpuProfile.peakValue) / cpuProfile.peakValue;
  return {
    source: "harness-recomputed-from-raw-gpu-normal-wedge",
    gpuProfile,
    cpuProfile,
    peakDirectionErrorDegrees,
    halfPeakWidthRelativeError,
    peakLuminanceRelativeError,
    frozenThresholds: thresholds.specularResponse
  };
}

function cloneWithoutPixels(probe) {
  const { pixels: _pixels, ...summary } = probe;
  return summary;
}

function compareSampledPixels(left, right) {
  assertAcceptance(
    left.width === right.width &&
      left.height === right.height &&
      left.pixels.length === right.pixels.length &&
      left.pixels.length > 0,
    `ROI samples '${left.id}' and '${right.id}' are incompatible.`
  );
  let absoluteChannelDifference = 0;
  let maximumChannelDifference = 0;
  let changedPixelCount = 0;
  const pixelCount = left.width * left.height;
  for (let offset = 0; offset < left.pixels.length; offset += 4) {
    let pixelMaximum = 0;
    for (let channel = 0; channel < 3; channel++) {
      const difference = Math.abs(left.pixels[offset + channel] - right.pixels[offset + channel]);
      absoluteChannelDifference += difference;
      pixelMaximum = Math.max(pixelMaximum, difference);
    }
    maximumChannelDifference = Math.max(maximumChannelDifference, pixelMaximum);
    if (pixelMaximum > 0) changedPixelCount++;
  }
  return {
    analysisResolution: Object.freeze({ width: left.width, height: left.height }),
    pixelCount,
    changedPixelCount,
    changedPixelRatio: changedPixelCount / pixelCount,
    meanAbsoluteChannelDifference: absoluteChannelDifference / (pixelCount * 3),
    maximumChannelDifference,
    leftFingerprint: left.fingerprint,
    rightFingerprint: right.fingerprint
  };
}

function compareRoiProbeSets(left, right) {
  const rightById = new Map(right.map((probe) => [probe.id, probe]));
  return Object.fromEntries(
    left.map((probe) => {
      const match = rightById.get(probe.id);
      assertAcceptance(match, `Missing comparison ROI '${probe.id}'.`);
      return [probe.id, compareSampledPixels(probe, match)];
    })
  );
}

function splitTargetAndProtectionMetrics(comparisons, targetRoiIds) {
  const targetSet = new Set(targetRoiIds);
  return {
    target: Object.fromEntries(Object.entries(comparisons).filter(([id]) => targetSet.has(id))),
    nonTargetProtection: Object.fromEntries(Object.entries(comparisons).filter(([id]) => !targetSet.has(id)))
  };
}

async function readReferenceFixtureManifest() {
  const bytes = await readFile(BASELINE_MANIFEST_PATH);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(
      `Grasslands reference fixture manifest is invalid: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertAcceptance(manifest.schemaVersion === 1, "Grasslands fixture manifest schemaVersion must be 1.", manifest);
  assertAcceptance(manifest.caseId === CASE_DEFINITION.id, "Grasslands fixture manifest caseId changed.", manifest);
  assertAcceptance(
    JSON.stringify(manifest.captureStates) === JSON.stringify(CAPTURE_STATES),
    "Grasslands fixture capture states changed.",
    manifest.captureStates
  );
  assertAcceptance(
    manifest.environment?.viewport?.width === FIXED_ENVIRONMENT.viewport.width &&
      manifest.environment?.viewport?.height === FIXED_ENVIRONMENT.viewport.height &&
      manifest.environment?.deviceScaleFactor === FIXED_ENVIRONMENT.deviceScaleFactor &&
      manifest.environment?.graphicsApi === FIXED_ENVIRONMENT.graphicsApi &&
      manifest.environment?.quality === FIXED_ENVIRONMENT.quality &&
      manifest.environment?.colorSpace === FIXED_ENVIRONMENT.colorSpace &&
      manifest.environment?.surfaceTime === FIXED_ENVIRONMENT.surfaceTime &&
      manifest.environment?.seed === FIXED_ENVIRONMENT.seed &&
      manifest.environment?.statsEnabled === FIXED_ENVIRONMENT.statsEnabled &&
      manifest.environment?.hudEnabled === FIXED_ENVIRONMENT.hudEnabled &&
      manifest.environment?.debugUiEnabled === FIXED_ENVIRONMENT.debugUiEnabled,
    "Grasslands fixture environment changed.",
    manifest.environment
  );
  assertAcceptance(
    manifest.reference?.repositoryStored === false &&
      typeof manifest.reference?.localPath === "string" &&
      manifest.reference?.sha256 === FROZEN_REFERENCE_SHA256 &&
      manifest.reference?.width === FIXED_ENVIRONMENT.viewport.width &&
      manifest.reference?.height === FIXED_ENVIRONMENT.viewport.height,
    "Grasslands external reference metadata is invalid.",
    manifest.reference
  );
  assertAcceptance(
    hashJson(manifest.reference.waterMask) === FROZEN_WATER_MASK_SHA256,
    "Grasslands frozen target water mask changed.",
    manifest.reference.waterMask
  );
  assertAcceptance(
    manifest.reference.waterMask.coordinateSpace === "reference-pixels",
    "Grasslands target water mask coordinate space changed.",
    manifest.reference.waterMask
  );
  assertPolygonCollection(
    manifest.reference.waterMask.includePolygons,
    "Grasslands target include mask",
    manifest.reference.width,
    manifest.reference.height
  );
  assertPolygonCollection(
    manifest.reference.waterMask.excludePolygons,
    "Grasslands target exclude mask",
    manifest.reference.width,
    manifest.reference.height
  );
  assertAcceptance(
    hashJson(manifest.reference.mechanismRois) === FROZEN_REFERENCE_ROIS_SHA256,
    "Grasslands frozen reference mechanism ROIs changed.",
    manifest.reference.mechanismRois
  );
  assertAcceptance(
    hashJson(manifest.mechanismThresholds) === FROZEN_MECHANISM_THRESHOLDS_SHA256,
    "Grasslands frozen mechanism thresholds changed.",
    manifest.mechanismThresholds
  );
  assertAcceptance(
    typeof manifest.regressionGolden?.status === "string" &&
      manifest.regressionGolden.status.length > 0 &&
      manifest.regressionGolden?.referenceTargetIsAutomaticGolden === false,
    "Grasslands fixture must keep Reference Parity separate from the Regression Golden.",
    manifest.regressionGolden
  );
  return {
    manifest,
    bytes,
    sha256: sha256(bytes)
  };
}

async function verifyExternalReference(reference) {
  assertAcceptance(
    await fileExists(reference.localPath),
    `Grasslands external target reference is missing at ${reference.localPath}.`
  );
  const bytes = await readFile(reference.localPath);
  const actualSha256 = sha256(bytes);
  assertAcceptance(
    actualSha256 === reference.sha256,
    `Grasslands external target reference SHA-256 is ${actualSha256}, expected ${reference.sha256}.`
  );
  const dimensions = readPngDimensions(bytes);
  assertAcceptance(
    dimensions.width === reference.width && dimensions.height === reference.height,
    "Grasslands external target reference PNG dimensions differ from the frozen fixture.",
    { dimensions, declared: { width: reference.width, height: reference.height } }
  );
  return {
    repositoryStored: false,
    localPath: reference.localPath,
    expectedSha256: reference.sha256,
    actualSha256,
    byteLength: bytes.byteLength,
    declaredWidth: reference.width,
    declaredHeight: reference.height,
    actualWidth: dimensions.width,
    actualHeight: dimensions.height,
    bytes
  };
}

async function assertFixedBrowserEnvironment(page) {
  const environment = await page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas");
    const rectangle = canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect() : undefined;
    const hiddenUi = Object.fromEntries(
      ["#example-bar", "#case-intro", "#grasslands-water-hud", "#fixture-mark"].map((selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return [selector, { exists: false, visible: false }];
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.visibility !== "collapse" &&
          Number(style.opacity) > 0 &&
          bounds.width > 0 &&
          bounds.height > 0 &&
          element.getClientRects().length > 0;
        return [
          selector,
          {
            exists: true,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            width: bounds.width,
            height: bounds.height,
            clientRectCount: element.getClientRects().length,
            visible
          }
        ];
      })
    );
    return {
      innerWidth,
      innerHeight,
      devicePixelRatio,
      canvasWidth: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
      canvasHeight: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
      canvasCssWidth: rectangle?.width ?? 0,
      canvasCssHeight: rectangle?.height ?? 0,
      hiddenUi
    };
  });
  assertAcceptance(
    environment.innerWidth === FIXED_ENVIRONMENT.viewport.width &&
      environment.innerHeight === FIXED_ENVIRONMENT.viewport.height &&
      environment.devicePixelRatio === FIXED_ENVIRONMENT.deviceScaleFactor,
    "Grasslands parity browser viewport or DPR differs from the frozen fixture.",
    environment
  );
  assertAcceptance(
    environment.canvasWidth === FIXED_ENVIRONMENT.viewport.width &&
      environment.canvasHeight === FIXED_ENVIRONMENT.viewport.height &&
      environment.canvasCssWidth === FIXED_ENVIRONMENT.viewport.width &&
      environment.canvasCssHeight === FIXED_ENVIRONMENT.viewport.height,
    "Grasslands canvas does not match the frozen 1340x662 fixture.",
    environment
  );
  assertAcceptance(
    Object.entries(environment.hiddenUi).every(([, state]) => state.exists === true && state.visible === false),
    "Grasslands automation capture UI is missing or still visible.",
    environment.hiddenUi
  );
  return environment;
}

async function readGrasslandsSnapshot(page) {
  return page.evaluate(() => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    return structuredClone(api.snapshot());
  });
}

async function resetGrasslands(page) {
  await page.evaluate(async () => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    await api.reset();
  });
  await waitForAnimationFrames(page, SETTLE_FRAME_COUNT);
  return readGrasslandsSnapshot(page);
}

function assertBaseSnapshot(snapshot, label) {
  assertAcceptance(snapshot.ready === true, `${label} is not ready.`, snapshot);
  assertAcceptance(snapshot.finite === true, `${label} is not finite.`, snapshot);
  assertAcceptance(snapshot.runtimeError === null, `${label} reported a runtime error.`, snapshot);
  assertAcceptance(snapshot.caseId === CASE_DEFINITION.id, `${label} caseId changed.`, snapshot);
  assertAcceptance(snapshot.runtime === CASE_DEFINITION.runtime, `${label} runtime changed.`, snapshot);
  assertAcceptance(snapshot.preset === CASE_DEFINITION.preset, `${label} preset changed.`, snapshot);
  assertAcceptance(snapshot.waterBodyType === "heightfield", `${label} waterBodyType changed.`, snapshot);
  assertAcceptance(snapshot.qualityTier === "high", `${label} is not High quality.`, snapshot);
  assertAcceptance(snapshot.opticsTier === "high", `${label} is not High optics.`, snapshot);
  assertAcceptance(snapshot.surfaceTime === FIXED_ENVIRONMENT.surfaceTime, `${label} surfaceTime changed.`, snapshot);
  assertAcceptance(snapshot.seed === FIXED_ENVIRONMENT.seed, `${label} seed changed.`, snapshot);
  assertAcceptance(
    JSON.stringify(snapshot.captureViewport) ===
      JSON.stringify([FIXED_ENVIRONMENT.viewport.width, FIXED_ENVIRONMENT.viewport.height]),
    `${label} capture viewport changed.`,
    snapshot.captureViewport
  );
}

function assertInitialStrictSnapshot(snapshot) {
  assertBaseSnapshot(snapshot, "Grasslands initial strict snapshot");
  assertAcceptance(snapshot.strictMaterialReady === true, "Grasslands strict material is not ready.", snapshot);
  assertAcceptance(snapshot.appearanceFallbackReason === null, "Grasslands strict run used a fallback.", snapshot);
  assertAcceptance(snapshot.descriptorSchema === 1, "Grasslands descriptor schema changed.", snapshot);
  assertAcceptance(snapshot.appearanceVariantKey === "surface-appearance-v1", "Appearance variant changed.", snapshot);
  assertAcceptance(snapshot.normal.active === true, "Grasslands external normal is inactive.", snapshot.normal);
  assertAcceptance(snapshot.normal.layerCount === 2, "Grasslands external normal is not dual-layer.", snapshot.normal);
  assertAcceptance(
    snapshot.normal.width === 1024 &&
      snapshot.normal.height === 1024 &&
      snapshot.normal.colorSpace === "linear" &&
      snapshot.normal.wrapU === "repeat" &&
      snapshot.normal.wrapV === "repeat" &&
      snapshot.normal.filter === "bilinear" &&
      snapshot.normal.mipmaps === true &&
      snapshot.normal.anisotropy === 1 &&
      snapshot.normal.ownership === "borrowed",
    "Grasslands external normal sampling or ownership changed.",
    snapshot.normal
  );
  assertAcceptance(
    snapshot.cameraFeatures.requested.depthTexture === true &&
      snapshot.cameraFeatures.requested.opaqueTexture === true &&
      snapshot.cameraFeatures.requested.opaqueDownsampling === "none" &&
      snapshot.cameraFeatures.effective.depthCopyPassCount === 1 &&
      snapshot.cameraFeatures.effective.colorCopyPassCount === 1,
    "Grasslands High camera feature broker contract changed.",
    snapshot.cameraFeatures
  );
  assertAcceptance(
    snapshot.directLight.bound === true &&
      snapshot.directLight.matchesFixture === true &&
      snapshot.directLight.count === 1 &&
      snapshot.directLight.state === "default" &&
      snapshot.directLight.enabled === true,
    "Grasslands default DirectLight is not bound.",
    snapshot.directLight
  );
  assertAcceptance(
    snapshot.reflection.requestedSource === "sky" &&
      snapshot.reflection.effectiveSource === "sky" &&
      snapshot.reflection.fallbackReason === null &&
      snapshot.reflection.cameraCount === 0 &&
      snapshot.reflection.renderTargetCount === 0,
    "Grasslands analytic Sky fixture changed.",
    snapshot.reflection
  );
  assertAcceptance(
    snapshot.runtimeSet.activeSetCount === 1 &&
      snapshot.runtimeSet.gameplayQueryRegistered === false &&
      snapshot.runtimeSet.perFrameMeshUpload === false,
    "Grasslands runtime-set contract changed.",
    snapshot.runtimeSet
  );
  assertAcceptance(
    snapshot.scene.anchorRockCount === 3 &&
      snapshot.scene.scenicRockCount === 15 &&
      snapshot.scene.submergedScenicRockCount === 8 &&
      snapshot.scene.shoreScenicRockCount === 7 &&
      snapshot.scene.contactProbeCount === 3 &&
      snapshot.scene.terrainIndexCount === snapshot.scene.terrainBedIndexCount + snapshot.scene.terrainBankIndexCount &&
      snapshot.scene.terrainIndexCount ===
        snapshot.scene.terrainMudStonesIndexCount +
          snapshot.scene.terrainSandIndexCount +
          snapshot.scene.terrainGrassMudIndexCount &&
      snapshot.scene.terrainBedIndexCount > 0 &&
      snapshot.scene.terrainBankIndexCount > 0 &&
      snapshot.scene.terrainMudStonesIndexCount > 0 &&
      snapshot.scene.terrainSandIndexCount > 0 &&
      snapshot.scene.terrainGrassMudIndexCount > 0 &&
      snapshot.scene.environmentReady === true &&
      snapshot.scene.environmentAssetSetHash === "2a1d1e0591c0d2a1125332a4b4c08938d89a782a9ea6c46b11c3fd7d35b31580" &&
      snapshot.scene.terrainMaterialRegionCount === 3 &&
      snapshot.scene.terrainMaterialRegionIds.join(",") === "mud-stones,sand,grass-mud" &&
      snapshot.scene.rockModelResourceCount === 5 &&
      snapshot.scene.largeRockVariantCount === 2 &&
      snapshot.scene.smallRockVariantCount === 3 &&
      snapshot.scene.sharedRockMeshCount === 5 &&
      snapshot.scene.proxyRockMeshCount === 0 &&
      snapshot.scene.sceneMeshUploadCount === 6 &&
      snapshot.scene.terrainShorelineSampleCount === 386 &&
      snapshot.scene.terrainDegenerateTriangleCount === 0 &&
      snapshot.scene.terrainDirectMudGrassAdjacencyCount === 0 &&
      snapshot.scene.connectedWaterBodyCount === 1 &&
      snapshot.scene.landscapeRegionCount === 4 &&
      snapshot.scene.landscapeRegionIds.join(",") === "far-river,narrow-channel,mid-bay,near-shoal" &&
      snapshot.scene.landscapeExtentScaleXZ[0] >= 2 &&
      snapshot.scene.landscapeExtentScaleXZ[0] <= 3 &&
      snapshot.scene.landscapeExtentScaleXZ[1] >= 2 &&
      snapshot.scene.landscapeExtentScaleXZ[1] <= 3 &&
      snapshot.resources.environmentTextureCreateCount === 10 &&
      snapshot.resources.environmentTextureDestroyCount === 0 &&
      snapshot.resources.environmentMaterialCreateCount === 5 &&
      snapshot.resources.environmentMaterialDestroyCount === 0 &&
      snapshot.resources.environmentGltfResourceCreateCount === 5 &&
      snapshot.resources.environmentGltfResourceDestroyCount === 0 &&
      snapshot.resources.environmentMeshCreateCount === 5 &&
      snapshot.resources.environmentMeshDestroyCount === 0 &&
      snapshot.resources.environmentActiveRockInstanceCount === 18 &&
      snapshot.resources.environmentRockInstanceCreateCount === 18 &&
      snapshot.resources.environmentRockInstanceDestroyCount === 0 &&
      snapshot.scene.directLightCount === 1 &&
      snapshot.scene.skyboxCount === 0 &&
      snapshot.scene.planarCameraCount === 0 &&
      snapshot.scene.reflectionProbeCount === 0 &&
      snapshot.scene.renderTargetCount === 0,
    "Grasslands scene fixture ownership changed.",
    snapshot.scene
  );
}

async function readRoiProbes(page, rois, screenshotBytes) {
  return page.evaluate(
    async ({ definitions, sampleSize, screenshotUrl, expectedWidth, expectedHeight }) => {
      const source = await new Promise((resolveImage, rejectImage) => {
        const image = new Image();
        image.onload = () => resolveImage(image);
        image.onerror = () => rejectImage(new Error("Unable to decode captured Grasslands PNG for ROI analysis."));
        image.src = screenshotUrl;
      });
      if (source.naturalWidth !== expectedWidth || source.naturalHeight !== expectedHeight) {
        throw new Error(
          `Captured Grasslands PNG is ${source.naturalWidth}x${source.naturalHeight}, ` +
            `expected ${expectedWidth}x${expectedHeight}.`
        );
      }
      return definitions.map((roi) => {
        const sourceCrop = document.createElement("canvas");
        sourceCrop.width = roi.width;
        sourceCrop.height = roi.height;
        const sourceContext = sourceCrop.getContext("2d", { alpha: false, willReadFrequently: true });
        if (!sourceContext) throw new Error(`Unable to create source analysis context for ROI '${roi.id}'.`);
        sourceContext.drawImage(source, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height);
        const sourcePixels = sourceContext.getImageData(0, 0, roi.width, roi.height).data;
        let sourceNonBlackPixelCount = 0;
        let sourceFingerprint = 0x811c9dc5;
        for (let offset = 0; offset < sourcePixels.length; offset += 4) {
          if (sourcePixels[offset] !== 0 || sourcePixels[offset + 1] !== 0 || sourcePixels[offset + 2] !== 0) {
            sourceNonBlackPixelCount++;
          }
          for (let channel = 0; channel < 4; channel++) {
            sourceFingerprint ^= sourcePixels[offset + channel];
            sourceFingerprint = Math.imul(sourceFingerprint, 0x01000193);
          }
        }

        const sampled = document.createElement("canvas");
        sampled.width = sampleSize.width;
        sampled.height = sampleSize.height;
        const context = sampled.getContext("2d", { alpha: false, willReadFrequently: true });
        if (!context) throw new Error(`Unable to create sampled analysis context for ROI '${roi.id}'.`);
        context.drawImage(sourceCrop, 0, 0, sampled.width, sampled.height);
        const pixels = context.getImageData(0, 0, sampled.width, sampled.height).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let luminance = 0;
        let luminanceSquares = 0;
        let fingerprint = 0x811c9dc5;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          red += pixels[offset];
          green += pixels[offset + 1];
          blue += pixels[offset + 2];
          const value = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
          luminance += value;
          luminanceSquares += value * value;
          for (let channel = 0; channel < 4; channel++) {
            fingerprint ^= pixels[offset + channel];
            fingerprint = Math.imul(fingerprint, 0x01000193);
          }
        }
        const pixelCount = sampled.width * sampled.height;
        const meanLuminance = luminance / pixelCount;
        return {
          ...roi,
          coordinateSpace: "candidate-canvas-pixels",
          width: sampled.width,
          height: sampled.height,
          sourceRectangle: {
            x: roi.x,
            y: roi.y,
            width: roi.width,
            height: roi.height
          },
          pixelCount,
          sourcePixelCount: roi.width * roi.height,
          sourceNonBlackPixelCount,
          sourceFingerprint: (sourceFingerprint >>> 0).toString(16).padStart(8, "0"),
          meanRgb: [red / pixelCount, green / pixelCount, blue / pixelCount],
          meanLuminance,
          luminanceVariance: luminanceSquares / pixelCount - meanLuminance * meanLuminance,
          fingerprint: (fingerprint >>> 0).toString(16).padStart(8, "0"),
          pixels: Array.from(pixels)
        };
      });
    },
    {
      definitions: rois,
      sampleSize: ROI_SAMPLE_SIZE,
      screenshotUrl: `data:image/png;base64,${screenshotBytes.toString("base64")}`,
      expectedWidth: FIXED_ENVIRONMENT.viewport.width,
      expectedHeight: FIXED_ENVIRONMENT.viewport.height
    }
  );
}

function assertRoiProbeSetHealthy(probes, label) {
  const allBlack = probes.every((probe) => probe.sourceNonBlackPixelCount === 0);
  const uniqueFingerprints = new Set(probes.map((probe) => probe.sourceFingerprint));
  assertAcceptance(
    !allBlack && uniqueFingerprints.size > 1,
    `${label} produced an all-black or uniform ROI probe set; WebGL backing-buffer reads are not valid evidence.`,
    {
      allBlack,
      uniqueFingerprintCount: uniqueFingerprints.size,
      probes: probes.map(cloneWithoutPixels)
    }
  );
}

async function captureFrame(page, rois, category, name, artifactIndex, options = {}) {
  await waitForAnimationFrames(page, SETTLE_FRAME_COUNT);
  const snapshot = await readGrasslandsSnapshot(page);
  assertBaseSnapshot(snapshot, `${category}/${name}`);
  const canvasProbe = await readCanvasProbe(page);
  assertCanvasHealthy(canvasProbe, `${category}/${name}`);
  const directory = resolve(run.outputDirectory, "captures", category);
  const path = resolve(directory, `${name}.png`);
  await mkdir(directory, { recursive: true });
  const bytes = await page.locator("canvas#canvas").screenshot({
    type: "png",
    animations: "disabled"
  });
  await writeFile(path, bytes);
  const roiProbes = await readRoiProbes(page, rois, bytes);
  if (options.requireVisibleRoiSignal !== false) {
    assertRoiProbeSetHealthy(roiProbes, `${category}/${name}`);
  }
  const artifact = {
    category,
    name,
    path,
    relativePath: relative(run.outputDirectory, path),
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    width: FIXED_ENVIRONMENT.viewport.width,
    height: FIXED_ENVIRONMENT.viewport.height
  };
  artifactIndex.push(artifact);
  return {
    record: {
      artifact,
      canvas: summarizeCanvasProbe(canvasProbe),
      rois: roiProbes.map(cloneWithoutPixels),
      acceptance: snapshot
    },
    fullLuminance: canvasProbe.luminance,
    roiProbes,
    bytes
  };
}

async function captureNamedState(page, state, rois, artifactIndex) {
  const apiState = await page.evaluate((requestedState) => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    if (!api.states.includes(requestedState)) {
      throw new Error(`Grasslands capture state '${requestedState}' is unavailable.`);
    }
    api.setCaptureState(requestedState);
    return { states: [...api.states], currentState: api.currentState };
  }, state);
  assertAcceptance(apiState.currentState === state, `Grasslands did not enter capture state '${state}'.`, apiState);
  const capture = await captureFrame(page, rois, "capture-states", state, artifactIndex);
  assertAcceptance(
    capture.record.acceptance.captureState === state &&
      capture.record.acceptance.requestedDebugMode === CAPTURE_STATE_DEBUG_MODES[state] &&
      capture.record.acceptance.effectiveDebugMode === CAPTURE_STATE_DEBUG_MODES[state],
    `Grasslands capture state '${state}' did not resolve Debug ${CAPTURE_STATE_DEBUG_MODES[state]}.`,
    capture.record.acceptance
  );
  return { state, api: apiState, ...capture.record, bytes: capture.bytes };
}

async function captureDebugMode(page, definition, rois, artifactIndex) {
  await page.evaluate((mode) => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    api.setDebugMode(mode);
  }, definition.value);
  const capture = await captureFrame(
    page,
    rois,
    "debug-23-29",
    `${definition.value}-${definition.name}`,
    artifactIndex
  );
  assertAcceptance(
    capture.record.acceptance.requestedDebugMode === definition.value &&
      capture.record.acceptance.effectiveDebugMode === definition.value,
    `Grasslands Debug ${definition.value} (${definition.name}) did not remain effective.`,
    capture.record.acceptance
  );
  return {
    mode: definition.value,
    name: definition.name,
    rgba8CaptureSemantics:
      definition.value === 24
        ? "raw linear eye-depth delta in meters; framebuffer values above 1m saturate in this PNG"
        : "diagnostic framebuffer",
    ...capture.record
  };
}

function maximumMetric(metrics, field) {
  const values = Object.values(metrics).map((metric) => metric[field]);
  return values.length > 0 ? Math.max(...values) : 0;
}

function minimumMetric(metrics, field) {
  const values = Object.values(metrics).map((metric) => metric[field]);
  return values.length > 0 ? Math.min(...values) : 0;
}

function assertExactPixelRestoration(comparisons, label) {
  for (const [roiId, metric] of Object.entries(comparisons)) {
    assertAcceptance(
      metric.changedPixelCount === 0 &&
        metric.changedPixelRatio === 0 &&
        metric.meanAbsoluteChannelDifference === 0 &&
        metric.maximumChannelDifference === 0 &&
        metric.leftFingerprint === metric.rightFingerprint,
      `${label} did not restore ROI '${roiId}' exactly at fixed surfaceTime.`,
      metric
    );
  }
}

function findPixelRestorationFailures(comparisons) {
  return Object.entries(comparisons)
    .filter(
      ([, metric]) =>
        metric.changedPixelCount !== 0 ||
        metric.changedPixelRatio !== 0 ||
        metric.meanAbsoluteChannelDifference !== 0 ||
        metric.maximumChannelDifference !== 0 ||
        metric.leftFingerprint !== metric.rightFingerprint
    )
    .map(([roiId, metric]) => ({ roiId, metric }));
}

function selectRoiMetrics(comparisons, roiIds) {
  const selected = new Set(roiIds);
  return Object.fromEntries(Object.entries(comparisons).filter(([id]) => selected.has(id)));
}

async function captureCausalProtectionPhase(page, feature, phase, analysisRois, artifactIndex) {
  const captures = [];
  for (const definition of FEATURE_PROTECTION_CAPTURES[feature]) {
    await page.evaluate((state) => window.waterPcgGrasslands?.setCaptureState(state), definition.state);
    const capture = await captureFrame(
      page,
      analysisRois,
      `causal/${feature}/protection/${definition.state}`,
      phase,
      artifactIndex
    );
    captures.push({
      state: definition.state,
      roiIds: definition.roiIds,
      record: capture.record,
      roiProbes: capture.roiProbes
    });
  }
  return captures;
}

function evaluateCausalSeparation(feature, targetComparisons, protectionPhases) {
  const targetRoiIds = FEATURE_TARGET_ROIS[feature];
  const phases = {
    onToOff: splitTargetAndProtectionMetrics(targetComparisons.onToOff, targetRoiIds),
    offToRestored: splitTargetAndProtectionMetrics(targetComparisons.offToRestored, targetRoiIds),
    onToRestored: splitTargetAndProtectionMetrics(targetComparisons.onToRestored, targetRoiIds)
  };
  const failures = [];
  for (const phaseName of ["onToOff", "offToRestored"]) {
    const target = phases[phaseName].target;
    if (
      !(minimumMetric(target, "meanAbsoluteChannelDifference") > 0 && minimumMetric(target, "changedPixelRatio") > 0)
    ) {
      failures.push({ phase: phaseName, reason: "target-roi-did-not-change", details: target });
    }
  }

  const terrainOnToOff = selectRoiMetrics(targetComparisons.onToOff, M1_TERRAIN_PROTECTION_ROI_IDS);
  const terrainProtectionFailures = findPixelRestorationFailures(terrainOnToOff);
  if (terrainProtectionFailures.length > 0) {
    failures.push({
      phase: "onToOff",
      reason: "candidate-bank-protection-changed",
      details: terrainProtectionFailures
    });
  }
  const restorationFailures = findPixelRestorationFailures(targetComparisons.onToRestored);
  if (restorationFailures.length > 0) {
    failures.push({
      phase: "onToRestored",
      reason: "fixed-fixture-restoration-not-byte-exact",
      details: restorationFailures
    });
  }

  const semanticProtection = [];
  for (const onCapture of protectionPhases.on) {
    const offCapture = protectionPhases.off.find(({ state }) => state === onCapture.state);
    const restoredCapture = protectionPhases.restored.find(({ state }) => state === onCapture.state);
    assertAcceptance(
      offCapture && restoredCapture,
      `${feature} protection capture '${onCapture.state}' is incomplete.`
    );
    const onToOff = selectRoiMetrics(compareRoiProbeSets(onCapture.roiProbes, offCapture.roiProbes), onCapture.roiIds);
    const onToRestored = selectRoiMetrics(
      compareRoiProbeSets(onCapture.roiProbes, restoredCapture.roiProbes),
      onCapture.roiIds
    );
    const onToOffFailures = findPixelRestorationFailures(onToOff);
    const onToRestoredFailures = findPixelRestorationFailures(onToRestored);
    if (onToOffFailures.length > 0) {
      failures.push({
        phase: `protection/${onCapture.state}/onToOff`,
        reason: "semantic-protection-changed",
        details: onToOffFailures
      });
    }
    if (onToRestoredFailures.length > 0) {
      failures.push({
        phase: `protection/${onCapture.state}/onToRestored`,
        reason: "semantic-protection-restoration-changed",
        details: onToRestoredFailures
      });
    }
    if (feature === "contactFoam" && onCapture.state === "contact-foam") {
      const openWater = onCapture.roiProbes.find(({ id }) => id === "protection-open-water");
      if (openWater?.sourceNonBlackPixelCount !== 0) {
        failures.push({
          phase: "protection/contact-foam/on",
          reason: "open-water-foam-leak",
          details: openWater
        });
      }
    }
    semanticProtection.push({
      state: onCapture.state,
      roiIds: onCapture.roiIds,
      onToOff,
      onToRestored
    });
  }
  return {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    policy:
      "Hero target ROI must change ON/OFF and restore byte-exactly; candidate-only bank ROIs and mechanism-specific Debug protection ROIs must be byte-exact.",
    calibrationProvenance: {
      candidateProtectionRois: M1_PROTECTION_ROIS,
      basis:
        "Fixed Grasslands camera plus analytic terrain/anchor fixture geometry; rectangles were frozen before reading causal deltas.",
      provisionalArtifactAcceptedForNumericCalibration: false,
      provisionalArtifactReason: "dirty SwiftShader run used invalid cleared-backing-buffer ROI reads",
      addedNumericThresholds: false
    },
    phases,
    semanticProtection
  };
}

async function captureCausalFeature(page, feature, analysisRois, artifactIndex) {
  await page.evaluate(() => window.waterPcgGrasslands?.setCaptureState("hero"));
  const on = await captureFrame(page, analysisRois, `causal/${feature}`, "on", artifactIndex);
  assertAcceptance(
    on.record.acceptance.activeAbState[feature] === true && on.record.acceptance.strictMaterialReady === true,
    `${feature} was not enabled for the ON capture.`,
    on.record.acceptance
  );
  const protectionOn = await captureCausalProtectionPhase(page, feature, "on", analysisRois, artifactIndex);
  await page.evaluate((name) => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    api.setCausalFeature(name, false);
  }, feature);
  await page.evaluate(() => window.waterPcgGrasslands?.setCaptureState("hero"));
  const off = await captureFrame(page, analysisRois, `causal/${feature}`, "off", artifactIndex);
  assertAcceptance(
    off.record.acceptance.activeAbState[feature] === false && off.record.acceptance.strictMaterialReady === false,
    `${feature} OFF did not fail strict material readiness.`,
    off.record.acceptance
  );
  const protectionOff = await captureCausalProtectionPhase(page, feature, "off", analysisRois, artifactIndex);
  await page.evaluate((name) => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    api.setCausalFeature(name, true);
  }, feature);
  await page.evaluate(() => window.waterPcgGrasslands?.setCaptureState("hero"));
  const restored = await captureFrame(page, analysisRois, `causal/${feature}`, "restored", artifactIndex);
  assertAcceptance(
    restored.record.acceptance.activeAbState[feature] === true &&
      restored.record.acceptance.strictMaterialReady === true,
    `${feature} was not enabled for the restored capture.`,
    restored.record.acceptance
  );
  const protectionRestored = await captureCausalProtectionPhase(page, feature, "restored", analysisRois, artifactIndex);
  const onToOff = compareRoiProbeSets(on.roiProbes, off.roiProbes);
  const offToRestored = compareRoiProbeSets(off.roiProbes, restored.roiProbes);
  const onToRestored = compareRoiProbeSets(on.roiProbes, restored.roiProbes);
  const causalGate = evaluateCausalSeparation(
    feature,
    { onToOff, offToRestored, onToRestored },
    { on: protectionOn, off: protectionOff, restored: protectionRestored }
  );
  return {
    feature,
    targetRoiIds: FEATURE_TARGET_ROIS[feature],
    captureState: "hero",
    gate: causalGate,
    captures: {
      on: on.record,
      off: off.record,
      restored: restored.record
    },
    protectionCaptures: {
      on: protectionOn.map(({ state, roiIds, record }) => ({ state, roiIds, record })),
      off: protectionOff.map(({ state, roiIds, record }) => ({ state, roiIds, record })),
      restored: protectionRestored.map(({ state, roiIds, record }) => ({ state, roiIds, record }))
    },
    fullFrameLuminanceMad: {
      onToOff: meanAbsoluteDifference(on.fullLuminance, off.fullLuminance),
      offToRestored: meanAbsoluteDifference(off.fullLuminance, restored.fullLuminance),
      onToRestored: meanAbsoluteDifference(on.fullLuminance, restored.fullLuminance)
    },
    sampledRoiDifferences: {
      onToOff: causalGate.phases.onToOff,
      offToRestored: causalGate.phases.offToRestored,
      onToRestored: causalGate.phases.onToRestored
    }
  };
}

async function captureAnchorProbeSequence(page, rockId, rois, artifactIndex) {
  await page.evaluate(() => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    api.setDebugMode(26);
  });
  const initial = await captureFrame(page, rois, `anchors/${rockId}`, "default", artifactIndex);
  const initialRock = initial.record.acceptance.scene.anchorRocks.find((rock) => rock.id === rockId);
  assertAcceptance(
    initialRock?.state === "default" &&
      initialRock.active === true &&
      initialRock.crossesWaterSurface === true &&
      initialRock.sceneDepthContactExpected === true,
    `Anchor '${rockId}' is not a default Scene Depth contact probe.`,
    initialRock
  );
  assertAcceptance(
    initial.record.acceptance.strictMaterialReady === true,
    `Anchor '${rockId}' default phase is not strict.`,
    initial.record.acceptance
  );
  const raisedReadback = await page.evaluate((id) => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    return structuredClone(api.raiseContactProbe(id));
  }, rockId);
  const raised = await captureFrame(page, rois, `anchors/${rockId}`, "raised", artifactIndex);
  assertAcceptance(
    raisedReadback.state === "raised" &&
      raisedReadback.active === true &&
      raisedReadback.crossesWaterSurface === false &&
      raisedReadback.sceneDepthContactExpected === false,
    `Anchor '${rockId}' did not leave the water when raised.`,
    raisedReadback
  );

  const restoredReadback = await page.evaluate((id) => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    return structuredClone(api.restoreContactProbe(id));
  }, rockId);
  const restored = await captureFrame(page, rois, `anchors/${rockId}`, "restored", artifactIndex);
  assertAcceptance(
    restoredReadback.state === "default" &&
      restoredReadback.active === true &&
      restoredReadback.crossesWaterSurface === true &&
      restoredReadback.sceneDepthContactExpected === true,
    `Anchor '${rockId}' did not restore its water crossing.`,
    restoredReadback
  );
  assertAcceptance(
    restored.record.acceptance.strictMaterialReady === true,
    `Anchor '${rockId}' restored phase is not strict.`,
    restored.record.acceptance
  );

  const removedReadback = await page.evaluate((id) => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    return structuredClone(api.removeContactProbe(id));
  }, rockId);
  const removed = await captureFrame(page, rois, `anchors/${rockId}`, "removed", artifactIndex);
  assertAcceptance(
    removedReadback.state === "removed" &&
      removedReadback.active === false &&
      removedReadback.crossesWaterSurface === false &&
      removedReadback.sceneDepthContactExpected === false,
    `Anchor '${rockId}' did not become an inactive removed probe.`,
    removedReadback
  );
  await page.evaluate((id) => window.waterPcgGrasslands?.restoreContactProbe(id), rockId);

  const comparisons = {
    defaultToRaised: compareRoiProbeSets(initial.roiProbes, raised.roiProbes),
    defaultToRestored: compareRoiProbeSets(initial.roiProbes, restored.roiProbes),
    defaultToRemoved: compareRoiProbeSets(initial.roiProbes, removed.roiProbes)
  };
  const contactIds = [rockId];
  const gateFailures = [];
  for (const phaseName of ["defaultToRaised", "defaultToRemoved"]) {
    const contactMetrics = Object.fromEntries(
      Object.entries(comparisons[phaseName]).filter(([roiId]) => contactIds.includes(roiId))
    );
    if (
      !(
        maximumMetric(contactMetrics, "changedPixelRatio") > 0 &&
        maximumMetric(contactMetrics, "meanAbsoluteChannelDifference") > 0
      )
    ) {
      gateFailures.push({
        phase: phaseName,
        reason: "contact-roi-did-not-change",
        details: contactMetrics
      });
    }
  }
  const restorationFailures = findPixelRestorationFailures(comparisons.defaultToRestored);
  if (restorationFailures.length > 0) {
    gateFailures.push({
      phase: "defaultToRestored",
      reason: "fixed-fixture-restoration-not-byte-exact",
      details: restorationFailures
    });
  }
  return {
    rockId,
    gate: {
      status: gateFailures.length === 0 ? "passed" : "failed",
      failures: gateFailures,
      raisedAndRemovedChangeContactRoi: gateFailures.every(({ reason }) => reason !== "contact-roi-did-not-change"),
      restoredByteExact: restorationFailures.length === 0,
      candidateAnchorRoi: M1_ANCHOR_ROIS.find(({ id }) => id === rockId)
    },
    readbacks: {
      default: initialRock,
      raised: raisedReadback,
      restored: restoredReadback,
      removed: removedReadback
    },
    captures: {
      default: initial.record,
      raised: raised.record,
      restored: restored.record,
      removed: removed.record
    },
    sampledRoiDifferences: comparisons
  };
}

async function captureDirectLightProtectionPhase(page, phase, rois, artifactIndex) {
  const definitions = [
    { state: "depth-color", roiIds: ["protection-open-water"] },
    { state: "contact-foam", roiIds: ["protection-open-water"] }
  ];
  const captures = [];
  for (const definition of definitions) {
    await page.evaluate((state) => window.waterPcgGrasslands?.setCaptureState(state), definition.state);
    const capture = await captureFrame(page, rois, `direct-light/protection/${definition.state}`, phase, artifactIndex);
    captures.push({ ...definition, record: capture.record, roiProbes: capture.roiProbes });
  }
  return captures;
}

async function captureDirectLightSequence(page, rois, artifactIndex) {
  await page.evaluate(() => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    api.setDebugMode(28);
    api.setDirectLightState("default");
  });
  const initial = await captureFrame(page, rois, "direct-light", "default", artifactIndex);
  assertAcceptance(
    initial.record.acceptance.directLight.state === "default" &&
      initial.record.acceptance.directLight.enabled === true &&
      initial.record.acceptance.directLight.bound === true &&
      initial.record.acceptance.directLight.matchesFixture === true &&
      initial.record.acceptance.strictMaterialReady === true,
    "Default DirectLight is not active in Debug 28.",
    initial.record.acceptance.directLight
  );
  const defaultProtection = await captureDirectLightProtectionPhase(page, "default", rois, artifactIndex);

  await page.evaluate(() => {
    window.waterPcgGrasslands?.setDirectLightState("rotated");
    window.waterPcgGrasslands?.setDebugMode(28);
  });
  const rotated = await captureFrame(page, rois, "direct-light", "rotated", artifactIndex);
  assertAcceptance(
    rotated.record.acceptance.directLight.state === "rotated" &&
      rotated.record.acceptance.directLight.enabled === true &&
      rotated.record.acceptance.directLight.bound === true &&
      rotated.record.acceptance.directLight.matchesFixture === false &&
      rotated.record.acceptance.strictMaterialReady === false,
    "Rotated DirectLight did not remain bound.",
    rotated.record.acceptance.directLight
  );
  const rotatedProtection = await captureDirectLightProtectionPhase(page, "rotated", rois, artifactIndex);

  await page.evaluate(() => {
    window.waterPcgGrasslands?.setDirectLightState("disabled");
    window.waterPcgGrasslands?.setDebugMode(28);
  });
  const disabled = await captureFrame(page, rois, "direct-light", "disabled", artifactIndex, {
    requireVisibleRoiSignal: false
  });
  assertAcceptance(
    disabled.record.acceptance.directLight.state === "disabled" &&
      disabled.record.acceptance.directLight.enabled === false &&
      disabled.record.acceptance.directLight.bound === false &&
      disabled.record.acceptance.directLight.matchesFixture === false &&
      disabled.record.acceptance.strictMaterialReady === false,
    "Disabled DirectLight remained bound.",
    disabled.record.acceptance.directLight
  );
  const disabledProtection = await captureDirectLightProtectionPhase(page, "disabled", rois, artifactIndex);

  await page.evaluate(() => {
    window.waterPcgGrasslands?.setDirectLightState("default");
    window.waterPcgGrasslands?.setDebugMode(28);
  });
  const restored = await captureFrame(page, rois, "direct-light", "restored", artifactIndex);
  assertAcceptance(
    restored.record.acceptance.directLight.state === "default" &&
      restored.record.acceptance.directLight.enabled === true &&
      restored.record.acceptance.directLight.bound === true &&
      restored.record.acceptance.directLight.matchesFixture === true &&
      restored.record.acceptance.strictMaterialReady === true,
    "DirectLight did not restore to the frozen default.",
    restored.record.acceptance.directLight
  );
  const restoredProtection = await captureDirectLightProtectionPhase(page, "restored", rois, artifactIndex);

  const comparisons = {
    defaultToRotated: compareRoiProbeSets(initial.roiProbes, rotated.roiProbes),
    defaultToDisabled: compareRoiProbeSets(initial.roiProbes, disabled.roiProbes),
    defaultToRestored: compareRoiProbeSets(initial.roiProbes, restored.roiProbes)
  };
  const gateFailures = [];
  for (const phaseName of ["defaultToRotated", "defaultToDisabled"]) {
    const split = splitTargetAndProtectionMetrics(comparisons[phaseName], FEATURE_TARGET_ROIS.directSpecular);
    if (
      !(
        minimumMetric(split.target, "changedPixelRatio") > 0 &&
        minimumMetric(split.target, "meanAbsoluteChannelDifference") > 0
      )
    ) {
      gateFailures.push({
        phase: phaseName,
        reason: "specular-target-roi-did-not-change",
        details: split.target
      });
    }
  }
  const protectionComparisons = [];
  for (const baseline of defaultProtection) {
    for (const [phase, candidates] of [
      ["defaultToRotated", rotatedProtection],
      ["defaultToDisabled", disabledProtection],
      ["defaultToRestored", restoredProtection]
    ]) {
      const candidate = candidates.find(({ state }) => state === baseline.state);
      assertAcceptance(candidate, `DirectLight protection capture '${baseline.state}' is missing for ${phase}.`);
      const metrics = selectRoiMetrics(compareRoiProbeSets(baseline.roiProbes, candidate.roiProbes), baseline.roiIds);
      const protectionFailures = findPixelRestorationFailures(metrics);
      if (protectionFailures.length > 0) {
        gateFailures.push({
          phase: `protection/${baseline.state}/${phase}`,
          reason: "depth-or-foam-protection-changed",
          details: protectionFailures
        });
      }
      protectionComparisons.push({ state: baseline.state, phase, metrics });
    }
  }
  const restorationFailures = findPixelRestorationFailures(comparisons.defaultToRestored);
  if (restorationFailures.length > 0) {
    gateFailures.push({
      phase: "defaultToRestored",
      reason: "fixed-fixture-restoration-not-byte-exact",
      details: restorationFailures
    });
  }
  return {
    gate: {
      status: gateFailures.length === 0 ? "passed" : "failed",
      failures: gateFailures,
      default: "bound=true, matchesFixture=true, strict=true",
      rotated: "bound=true, matchesFixture=false, strict=false",
      disabled: "bound=false, matchesFixture=false, strict=false",
      restored: "bound=true, matchesFixture=true, strict=true",
      framebufferTargetChanged: gateFailures.every(({ reason }) => reason !== "specular-target-roi-did-not-change"),
      protectionSeparated: gateFailures.every(({ reason }) => reason !== "depth-or-foam-protection-changed"),
      restoredByteExact: restorationFailures.length === 0
    },
    captures: {
      default: initial.record,
      rotated: rotated.record,
      disabled: disabled.record,
      restored: restored.record
    },
    protectionCaptures: {
      default: defaultProtection.map(({ state, roiIds, record }) => ({ state, roiIds, record })),
      rotated: rotatedProtection.map(({ state, roiIds, record }) => ({ state, roiIds, record })),
      disabled: disabledProtection.map(({ state, roiIds, record }) => ({ state, roiIds, record })),
      restored: restoredProtection.map(({ state, roiIds, record }) => ({ state, roiIds, record }))
    },
    protectionComparisons,
    sampledRoiDifferences: {
      ...comparisons
    }
  };
}

async function captureAnalyticSkyEvaluation(page, rois, artifactIndex) {
  await page.evaluate(() => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    api.setCausalFeature("reflection", true);
    api.setDebugMode(21);
    api.setReflectionScenario("analytic-sky");
  });
  const analytic = await captureFrame(page, rois, "eng-06-analytic-sky", "analytic-sky", artifactIndex);
  assertAcceptance(
    analytic.record.acceptance.reflection.requestedSource === "sky" &&
      analytic.record.acceptance.reflection.effectiveSource === "sky" &&
      analytic.record.acceptance.reflection.fallbackReason === null &&
      analytic.record.acceptance.reflection.cameraCount === 0 &&
      analytic.record.acceptance.reflection.renderTargetCount === 0 &&
      analytic.record.acceptance.strictMaterialReady === true,
    "Grasslands analytic Sky readback changed.",
    analytic.record.acceptance.reflection
  );

  await page.evaluate(() => window.waterPcgGrasslands?.setReflectionScenario("missing-probe"));
  const missingProbe = await captureFrame(page, rois, "eng-06-analytic-sky", "missing-probe", artifactIndex);
  assertAcceptance(
    missingProbe.record.acceptance.reflection.requestedSource === "probe" &&
      missingProbe.record.acceptance.reflection.effectiveSource === "sky" &&
      missingProbe.record.acceptance.reflection.fallbackReason === "probe-unavailable" &&
      missingProbe.record.acceptance.reflection.cameraCount === 0 &&
      missingProbe.record.acceptance.reflection.renderTargetCount === 0 &&
      missingProbe.record.acceptance.strictMaterialReady === false,
    "Grasslands missing-Probe scenario did not fail closed to analytic Sky.",
    missingProbe.record.acceptance.reflection
  );

  await page.evaluate(() => window.waterPcgGrasslands?.setReflectionScenario("analytic-sky"));
  const restored = await captureFrame(page, rois, "eng-06-analytic-sky", "restored", artifactIndex);
  assertAcceptance(
    restored.record.acceptance.reflection.requestedSource === "sky" &&
      restored.record.acceptance.reflection.effectiveSource === "sky" &&
      restored.record.acceptance.reflection.fallbackReason === null &&
      restored.record.acceptance.strictMaterialReady === true,
    "Grasslands analytic Sky did not restore.",
    restored.record.acceptance.reflection
  );
  const analyticToRestored = compareRoiProbeSets(analytic.roiProbes, restored.roiProbes);
  assertExactPixelRestoration(analyticToRestored, "Analytic Sky restored");
  return {
    workPackage: "GS-ENG-06",
    codeExpansionStatus: "not-triggered-by-automation",
    visualTriggerDecision: "pending-m3-user-review",
    interpretation:
      "This records deterministic analytic-Sky and missing-Probe fallback evidence; it does not decide target reflection-tone parity.",
    captures: {
      analyticSky: analytic.record,
      missingProbe: missingProbe.record,
      restored: restored.record
    },
    sampledRoiDifferences: {
      analyticToMissingProbe: compareRoiProbeSets(analytic.roiProbes, missingProbe.roiProbes),
      analyticToRestored
    },
    internal: {
      analyticRoiProbes: analytic.roiProbes
    }
  };
}

async function captureAnalyticSkyFreshReload(page, rois, artifactIndex, baselineRoiProbes) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
  const ready = await waitForCaseReady(page, CASE_DEFINITION);
  assertCaseIdentity(ready, CASE_DEFINITION);
  assertRuntimeHealthy(ready, CASE_DEFINITION);
  await assertFixedBrowserEnvironment(page);
  const snapshot = await resetGrasslands(page);
  assertInitialStrictSnapshot(snapshot);
  await page.evaluate(() => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable after fresh reload.");
    api.setCausalFeature("reflection", true);
    api.setDebugMode(21);
    api.setReflectionScenario("analytic-sky");
  });
  const fresh = await captureFrame(page, rois, "eng-06-analytic-sky", "fresh-reload", artifactIndex);
  assertAcceptance(
    fresh.record.acceptance.reflection.requestedSource === "sky" &&
      fresh.record.acceptance.reflection.effectiveSource === "sky" &&
      fresh.record.acceptance.reflection.fallbackReason === null &&
      fresh.record.acceptance.strictMaterialReady === true,
    "Fresh reload did not restore strict analytic Sky.",
    fresh.record.acceptance
  );
  const comparison = compareRoiProbeSets(baselineRoiProbes, fresh.roiProbes);
  assertExactPixelRestoration(comparison, "Analytic Sky fresh reload");
  return {
    capture: fresh.record,
    sampledRoiDifferences: comparison,
    gate: {
      freshReloadStrict: true,
      byteExactAtFixedFixture: true
    }
  };
}

async function captureContactStabilityFrames(page, rois) {
  await page.evaluate(() => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    api.setDebugMode(26);
  });
  const contactRois = rois.filter((roi) => roi.id.startsWith("contact-foam"));
  const openWaterRoi = rois.find((roi) => roi.id === "protection-open-water");
  assertAcceptance(openWaterRoi, "Grasslands contact stability requires the frozen open-water ROI.");
  const analysisRois = [openWaterRoi, ...contactRois];
  const frames = [];
  for (let index = 0; index < CONTACT_STABILITY_FRAME_COUNT; index++) {
    await waitForAnimationFrames(page, 1);
    const bytes = await page.locator("canvas#canvas").screenshot({
      type: "png",
      animations: "disabled"
    });
    const probes = await readRoiProbes(page, analysisRois, bytes);
    const snapshot = await readGrasslandsSnapshot(page);
    assertBaseSnapshot(snapshot, `contact-stability frame ${index + 1}`);
    assertAcceptance(snapshot.strictMaterialReady === true, `Contact stability frame ${index + 1} is not strict.`);
    assertRoiProbeSetHealthy(
      probes.filter((probe) => probe.id.startsWith("contact-foam")),
      `contact-stability frame ${index + 1}`
    );
    frames.push({
      frame: index + 1,
      rois: probes.map(cloneWithoutPixels),
      finite: snapshot.finite,
      runtimeError: snapshot.runtimeError
    });
  }
  const fingerprintsByRoi = Object.fromEntries(
    analysisRois.map((roi) => [
      roi.id,
      frames.map((frame) => frame.rois.find((probe) => probe.id === roi.id)?.fingerprint ?? "")
    ])
  );
  const uniqueFingerprintCountByRoi = Object.fromEntries(
    Object.entries(fingerprintsByRoi).map(([id, fingerprints]) => [id, new Set(fingerprints).size])
  );
  const unstableRois = [];
  for (const roi of contactRois) {
    if (uniqueFingerprintCountByRoi[roi.id] !== 1) unstableRois.push(roi.id);
  }
  const maxOpenWaterLeakPixelCount = Math.max(
    ...frames.map(
      (frame) =>
        frame.rois.find((probe) => probe.id === openWaterRoi.id)?.sourceNonBlackPixelCount ?? Number.POSITIVE_INFINITY
    )
  );
  return {
    frameCount: frames.length,
    fixedSurfaceTime: FIXED_ENVIRONMENT.surfaceTime,
    gate: {
      status: unstableRois.length === 0 && maxOpenWaterLeakPixelCount === 0 ? "passed" : "failed",
      minimumStableFrameCount: CONTACT_STABILITY_FRAME_COUNT,
      exactFingerprintStability: unstableRois.length === 0,
      unstableRois,
      openWaterLeakPixelCount: maxOpenWaterLeakPixelCount,
      openWaterLeakThreshold: 0
    },
    uniqueFingerprintCountByRoi,
    frames
  };
}

function createSceneDepthCpuCurve(initialSnapshot, fixtureManifest) {
  const depthTint = initialSnapshot.appearance.depthTint;
  const coastalAlpha = initialSnapshot.appearance.coastalAlpha;
  const samples = fixtureManifest.mechanismThresholds.depthColor.sampleDepthDeltaMeters;
  return {
    schemaVersion: 1,
    source: {
      function: "pow(saturate(sceneDepthDelta / distance), exponent)",
      invalidDepthBehavior: "non-finite or non-positive depth delta fails closed to 0",
      distanceMeters: depthTint.distance,
      exponent: depthTint.exponent,
      tintLinearRgba: depthTint.color,
      coastalAlphaFunction: "saturate(sceneDepthDelta / coastalDistance)",
      coastalDistanceMeters: coastalAlpha.distance
    },
    debug24CaptureEncoding:
      "SceneDepthDelta keeps meter semantics; ordinary RGBA8 PNG values above 1m saturate, so 2/5/10m are preserved here as JSON CPU evidence.",
    samples: samples.map((sceneDepthDeltaMeters) => {
      const finitePositiveDepth =
        Number.isFinite(sceneDepthDeltaMeters) && sceneDepthDeltaMeters > 0 ? sceneDepthDeltaMeters : 0;
      const depthRatio = Math.min(1, finitePositiveDepth / depthTint.distance);
      const depthTintFactor = depthRatio === 0 ? 0 : Math.pow(depthRatio, depthTint.exponent);
      const coastalAlphaFactor = Math.min(1, finitePositiveDepth / coastalAlpha.distance);
      return {
        sceneDepthDeltaMeters,
        normalizedDepth: depthRatio,
        depthTintFactor,
        depthTintLinearRgbaContribution: depthTint.color.map((channel) => channel * depthTintFactor),
        coastalAlphaFactor,
        rgba8Debug24EncodedValue: Math.round(Math.min(1, finitePositiveDepth) * 255)
      };
    }),
    evidenceUse:
      "declared CPU reference only; explicitly non-qualifying for the controlled GPU/framebuffer mechanism Gate",
    thresholdEvaluation: "unmet-until-page-exposes-controlled-gpu-calibration-readback"
  };
}

async function evaluateControlledGpuCalibration(
  page,
  fixtureManifest,
  expectedSnapshot,
  detailNormalFrequency,
  mainWebGl
) {
  const thresholds = fixtureManifest.mechanismThresholds;
  const unmet = [];
  const hostBefore = await readCalibrationHostState(page);
  let readbacks;
  let readError = null;
  try {
    readbacks = await page.evaluate(async (timeoutMs) => {
      const api = window.waterPcgGrasslands;
      if (!api || typeof api.readControlledCalibration !== "function") {
        throw new Error("window.waterPcgGrasslands.readControlledCalibration is unavailable.");
      }
      const readWithTimeout = () =>
        new Promise((resolveReadback, rejectReadback) => {
          const timeout = setTimeout(
            () => rejectReadback(new Error(`Controlled GPU calibration timed out after ${timeoutMs}ms.`)),
            timeoutMs
          );
          api
            .readControlledCalibration()
            .then((value) => resolveReadback(structuredClone(value)))
            .catch(rejectReadback)
            .finally(() => clearTimeout(timeout));
        });
      return [await readWithTimeout(), await readWithTimeout()];
    }, CONTROLLED_CALIBRATION_TIMEOUT_MS);
  } catch (error) {
    readError = serializeError(error);
  }
  const hostAfter = await readCalibrationHostState(page);
  const hostHealthy =
    hostBefore.documentCanvasCount === 1 &&
    hostAfter.documentCanvasCount === hostBefore.documentCanvasCount &&
    hostBefore.mainCanvasMatchesPinnedIdentity === true &&
    hostAfter.mainCanvasMatchesPinnedIdentity === true &&
    hostBefore.mainContextAvailable === true &&
    hostAfter.mainContextAvailable === true &&
    hostBefore.mainContextLost === false &&
    hostAfter.mainContextLost === false &&
    hostAfter.mainCanvasWidth === hostBefore.mainCanvasWidth &&
    hostAfter.mainCanvasHeight === hostBefore.mainCanvasHeight &&
    JSON.stringify(hostAfter.resources) === JSON.stringify(hostBefore.resources);
  if (!hostHealthy) {
    unmet.push({
      mechanism: "calibration-host-lifecycle",
      message: "Transient calibration changed the main canvas, context, DOM canvas count, or Engine resource vector.",
      hostBefore,
      hostAfter
    });
  }
  if (readError || !Array.isArray(readbacks) || readbacks.length !== 2) {
    unmet.push({
      mechanism: "controlled-gpu-readback",
      message: "Two sequential controlled GPU calibration readbacks are required.",
      error: readError,
      readbackCount: Array.isArray(readbacks) ? readbacks.length : 0
    });
    return {
      status: "unmet",
      source: "controlled-gpu-calibration-unavailable",
      frozenThresholds: thresholds,
      detailNormalFrequency,
      host: { before: hostBefore, after: hostAfter, healthy: hostHealthy },
      readback: null,
      readbackHashes: [],
      deterministic: false,
      metrics: null,
      unmet
    };
  }

  const readbackHashes = readbacks.map(hashJson);
  const deterministic = readbackHashes[0] === readbackHashes[1];
  if (!deterministic) {
    unmet.push({
      mechanism: "controlled-gpu-determinism",
      message: "Sequential raw GPU calibration readbacks differ.",
      readbackHashes
    });
  }
  const readback = readbacks[0];
  const captureSchemaFailure = (mechanism, operation) => {
    try {
      return operation();
    } catch (error) {
      unmet.push({
        mechanism,
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? error.details : undefined
      });
      return null;
    }
  };

  const coreValid = captureSchemaFailure("controlled-gpu-schema-and-provenance", () => {
    requireCalibration(readback && typeof readback === "object", "Controlled GPU readback is not an object.", readback);
    requireCalibration(readback.schemaVersion === 1, "Controlled GPU schemaVersion changed.", readback.schemaVersion);
    requireCalibration(
      readback.source === "grasslands-active-runtime-plus-transient-webgl2",
      "Controlled GPU adapter source changed.",
      readback.source
    );
    const runtimeInput = readback.runtimeInput;
    requireCalibration(
      runtimeInput && typeof runtimeInput === "object",
      "Controlled runtime input is missing.",
      runtimeInput
    );
    requireCalibration(
      runtimeInput.appearanceAssetId === expectedSnapshot.appearance.assetId &&
        runtimeInput.appearanceHash === expectedSnapshot.appearance.appearanceHash &&
        runtimeInput.normalAssetId === expectedSnapshot.normal.assetId &&
        runtimeInput.normalContentHash === expectedSnapshot.normal.contentHash,
      "Controlled runtime identity differs from the active strict runtime.",
      { runtimeInput, expectedAppearance: expectedSnapshot.appearance, expectedNormal: expectedSnapshot.normal }
    );
    requireCalibration(
      typeof runtimeInput.normalSourceUrl === "string" &&
        runtimeInput.normalSourceUrl.length > 0 &&
        Number.isInteger(runtimeInput.normalByteLength) &&
        runtimeInput.normalByteLength > 0 &&
        runtimeInput.opticsRequestedTier === "high" &&
        runtimeInput.opticsResolvedTier === "high",
      "Controlled runtime asset/optics provenance is invalid.",
      runtimeInput
    );
    const gpu = readback.gpu;
    requireCalibration(gpu && typeof gpu === "object", "Transient GPU readback is missing.", gpu);
    requireCalibration(
      gpu.schemaVersion === 1 && gpu.source === "transient-webgl2-shared-glsl",
      "Transient GPU source/schema changed.",
      gpu
    );
    requireCalibration(
      typeof gpu.context?.version === "string" &&
        /WebGL\s*2/i.test(gpu.context.version) &&
        typeof gpu.context.renderer === "string" &&
        gpu.context.renderer.length > 0 &&
        typeof gpu.context.unmaskedRenderer === "string" &&
        gpu.context.unmaskedRenderer.length > 0 &&
        !SOFTWARE_RENDERER_PATTERN.test(`${gpu.context.renderer} ${gpu.context.unmaskedRenderer}`) &&
        gpu.context.framebufferStatus === "complete" &&
        gpu.context.readPixelsFormat === "rgba8" &&
        gpu.context.glError === 0,
      "Transient calibration is not native complete WebGL2 RGBA8 evidence.",
      gpu.context
    );
    requireCalibration(
      !mainWebGl.unmaskedRenderer || gpu.context.unmaskedRenderer === mainWebGl.unmaskedRenderer,
      "Transient calibration renderer differs from the main renderer.",
      { transient: gpu.context.unmaskedRenderer, main: mainWebGl.unmaskedRenderer }
    );
    requireCalibration(
      /^[0-9a-f]{64}$/.test(gpu.shader?.vertexSourceSha256) &&
        /^[0-9a-f]{64}$/.test(gpu.shader?.fragmentSourceSha256) &&
        Number.isInteger(gpu.shader.appearanceHelperCallCount) &&
        gpu.shader.appearanceHelperCallCount > 0 &&
        Number.isInteger(gpu.shader.contactFoamHelperCallCount) &&
        gpu.shader.contactFoamHelperCallCount > 0 &&
        Number.isInteger(gpu.shader.brdfHelperCallCount) &&
        gpu.shader.brdfHelperCallCount > 0,
      "Transient shader provenance or shared-helper call counts are invalid.",
      gpu.shader
    );
    const detail = gpu.detailNormal;
    requireCalibration(
      detail?.width === CONTROLLED_CALIBRATION_DETAIL_SIZE &&
        detail.height === CONTROLLED_CALIBRATION_DETAIL_SIZE &&
        JSON.stringify(detail.worldExtentMeters) === JSON.stringify([80, 48]) &&
        detail.tiling === expectedSnapshot.normal.tiling &&
        detail.scrollUvPerSecond === expectedSnapshot.normal.scrollUvPerSecond &&
        detail.strength === expectedSnapshot.normal.strength &&
        detail.flipGreen === expectedSnapshot.normal.flipGreen &&
        detail.surfaceTime === expectedSnapshot.surfaceTime,
      "Transient detail-normal fixture inputs changed.",
      detail
    );
    const detailBytes = requireByteArray(
      detail.rgbaBytes,
      CONTROLLED_CALIBRATION_DETAIL_SIZE * CONTROLLED_CALIBRATION_DETAIL_SIZE * 4,
      "detailNormal.rgbaBytes"
    );
    requireCalibration(
      new Set(detailBytes).size > 8,
      "Transient detail-normal framebuffer is uniform or effectively empty.",
      { uniqueByteValueCount: new Set(detailBytes).size }
    );
    const expectedResources = {
      shader: 2,
      program: 1,
      buffer: 1,
      vertexArray: 1,
      texture: 3,
      framebuffer: 1,
      renderbuffer: 0
    };
    requireCalibration(
      gpu.cleanup?.canvasWasDetached === true && gpu.cleanup.contextReleaseRequested === true,
      "Transient calibration did not detach its canvas and request context release.",
      gpu.cleanup
    );
    for (const key of CONTROLLED_CALIBRATION_RESOURCE_KEYS) {
      requireCalibration(
        gpu.cleanup.created?.[key] === expectedResources[key] &&
          gpu.cleanup.deleted?.[key] === expectedResources[key] &&
          gpu.cleanup.activeAfterCleanup?.[key] === 0,
        `Transient calibration resource '${key}' is not exactly balanced.`,
        gpu.cleanup
      );
    }
    return true;
  });

  const metrics = {
    detailNormalFrequency,
    depthAndContact: coreValid
      ? captureSchemaFailure("scene-depth/depth-color/contact-range", () =>
          evaluateDepthAndContactMetrics(readback.gpu.sceneDepthDepthColor, thresholds)
        )
      : null,
    refraction: coreValid
      ? captureSchemaFailure("refraction", () => evaluateRefractionMetrics(readback.gpu.refraction, thresholds))
      : null,
    coastalAlpha: coreValid
      ? captureSchemaFailure("coastal-alpha", () => evaluateCoastalMetrics(readback.gpu.coastalAlpha, thresholds))
      : null,
    specularResponse: coreValid
      ? captureSchemaFailure("GGX/specular-response", () =>
          evaluateSpecularMetrics(readback.gpu.specularResponse, thresholds)
        )
      : null
  };
  if (detailNormalFrequency.status !== "passed") {
    unmet.push({
      mechanism: "detail-normal-frequency",
      required: thresholds.detailNormal,
      actual: detailNormalFrequency,
      humanDirectionAndFlipGreenApproval: "pending-m3-user"
    });
  }
  if (
    metrics.depthAndContact &&
    (metrics.depthAndContact.depthColor.maximumLinearRgbChannelErrorBytes >
      thresholds.depthColor.maximumLinearRgbChannelErrorBytes ||
      metrics.depthAndContact.depthColor.monotonic !== thresholds.depthColor.monotonic ||
      metrics.depthAndContact.contactFoam.rangeErrorMeters > thresholds.contactFoam.maximumRangeErrorMeters ||
      metrics.depthAndContact.contactFoam.openWaterLeakPixelCount !== thresholds.contactFoam.openWaterLeakPixelCount ||
      metrics.depthAndContact.contactFoam.brokenEdgeCount !== 0)
  ) {
    unmet.push({
      mechanism: "scene-depth/depth-color/contact-range-threshold",
      required: { depthColor: thresholds.depthColor, contactFoam: thresholds.contactFoam },
      actual: metrics.depthAndContact
    });
  }
  if (
    metrics.refraction &&
    (metrics.refraction.measuredOffsetRelativeError > thresholds.refraction.maximumOffsetRelativeError ||
      metrics.refraction.maximumCpuReferenceChannelErrorBytes >
        thresholds.refraction.maximumCpuReferenceChannelErrorBytes ||
      metrics.refraction.aboveWaterWrongSampleCount !== thresholds.refraction.aboveWaterWrongSampleCount)
  ) {
    unmet.push({
      mechanism: "refraction-threshold",
      required: thresholds.refraction,
      actual: metrics.refraction
    });
  }
  if (
    metrics.coastalAlpha &&
    (metrics.coastalAlpha.widthErrorMeters > thresholds.coastalAlpha.maximumWidthErrorMeters ||
      metrics.coastalAlpha.maximumCpuReferenceChannelErrorBytes >
        thresholds.coastalAlpha.maximumCpuReferenceChannelErrorBytes ||
      metrics.coastalAlpha.monotonic !== thresholds.coastalAlpha.monotonic ||
      metrics.coastalAlpha.brokenEdgeCount !== thresholds.coastalAlpha.brokenEdgeCount)
  ) {
    unmet.push({
      mechanism: "coastal-alpha-threshold",
      required: thresholds.coastalAlpha,
      actual: metrics.coastalAlpha
    });
  }
  if (
    metrics.specularResponse &&
    (metrics.specularResponse.peakDirectionErrorDegrees >
      thresholds.specularResponse.maximumPeakDirectionErrorDegrees ||
      metrics.specularResponse.halfPeakWidthRelativeError >
        thresholds.specularResponse.maximumHalfPeakWidthRelativeError ||
      metrics.specularResponse.peakLuminanceRelativeError >
        thresholds.specularResponse.maximumPeakLuminanceRelativeError)
  ) {
    unmet.push({
      mechanism: "GGX/specular-response-threshold",
      required: thresholds.specularResponse,
      actual: metrics.specularResponse
    });
  }
  return {
    status: unmet.length === 0 ? "passed" : "unmet",
    source: "harness-recomputed-from-two-raw-transient-webgl2-readbacks",
    frozenThresholds: thresholds,
    host: { before: hostBefore, after: hostAfter, healthy: hostHealthy },
    readbackHashes,
    deterministic,
    readback,
    metrics,
    unmet
  };
}

async function evaluateDetailNormalFrequencyEvidence(
  page,
  targetBytes,
  candidateHeroBytes,
  candidateDebugBytes,
  targetDetailNormalRoi,
  candidateDetailNormalRoi,
  threshold
) {
  const [targetPixels, candidateHeroPixels, candidateDebugPixels] = await Promise.all([
    decodeFullResolutionRoi(page, targetBytes, targetDetailNormalRoi, "target detail-normal ROI"),
    decodeFullResolutionRoi(page, candidateHeroBytes, candidateDetailNormalRoi, "candidate Hero detail-normal ROI"),
    decodeFullResolutionRoi(page, candidateDebugBytes, candidateDetailNormalRoi, "candidate Debug 23 detail-normal ROI")
  ]);
  const target = analyzeGrasslandsDetailFrequency(targetPixels);
  const candidateHero = analyzeGrasslandsDetailFrequency(candidateHeroPixels);
  const candidateDebug23 = analyzeGrasslandsDetailFrequency(candidateDebugPixels);
  const gate = evaluateGrasslandsDetailFrequencyParity(target, candidateHero, threshold);
  return {
    status: gate.status,
    source: "full-resolution-target-and-candidate-hero-roi-radial-derivative-spectrum",
    targetRoi: targetDetailNormalRoi,
    candidateRoi: candidateDetailNormalRoi,
    targetPngSha256: sha256(targetBytes),
    candidateHeroPngSha256: sha256(candidateHeroBytes),
    candidateDebug23PngSha256: sha256(candidateDebugBytes),
    gate,
    target,
    candidateHero,
    candidateDebug23,
    debug23Role: "mechanism-provenance-only; not compared to target final shading",
    humanDirectionAndFlipGreenApproval: "pending-m3-user"
  };
}

async function readStructuredM3UserApproval(path, expected, approvalMode) {
  if (!path) {
    return {
      status: "pending",
      mode: approvalMode,
      path: null,
      exists: false,
      valid: false,
      failures: ["GRASSLANDS_M3_USER_APPROVAL_RECORD is unset"],
      sha256: null,
      byteLength: 0,
      record: null
    };
  }
  if (!(await fileExists(path))) {
    return {
      status: "pending",
      mode: approvalMode,
      path,
      exists: false,
      valid: false,
      failures: ["approval record does not exist"],
      sha256: null,
      byteLength: 0,
      record: null
    };
  }
  const bytes = await readFile(path);
  const { record, failures } = parseAndValidateJson(
    bytes.toString("utf8"),
    "approval record is not valid JSON",
    (parsedRecord) =>
      validateM3ApprovalRecord(
        parsedRecord,
        {
          ...expected,
          caseId: CASE_DEFINITION.id,
          referenceTargetSha256: FROZEN_REFERENCE_SHA256,
          captureStates: CAPTURE_STATES
        },
        approvalMode
      )
  );
  return {
    status: failures.length === 0 ? "validated-record" : "invalid",
    mode: approvalMode,
    path,
    exists: true,
    valid: failures.length === 0,
    failures,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    record
  };
}

async function readInitialReviewQualification(path, expected) {
  if (!path) {
    return {
      status: "pending",
      path: null,
      exists: false,
      valid: false,
      failures: ["GRASSLANDS_M3_INITIAL_REVIEW_RESULT is unset"],
      sha256: null,
      byteLength: 0
    };
  }
  if (!(await fileExists(path))) {
    return {
      status: "pending",
      path,
      exists: false,
      valid: false,
      failures: ["initial-review result does not exist"],
      sha256: null,
      byteLength: 0
    };
  }
  const failures = [];
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    failures.push(
      `initial-review result metadata is unreadable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (metadata && (!metadata.isFile() || metadata.isSymbolicLink())) {
    failures.push("initial-review result must be a regular non-symlink file");
  }
  let bytes = Buffer.alloc(0);
  if (failures.length === 0) {
    try {
      bytes = await readFile(path);
    } catch (error) {
      failures.push(`initial-review result is unreadable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length === 0) {
    const parsed = parseAndValidateJson(bytes.toString("utf8"), "initial-review result is invalid JSON", (record) =>
      validateInitialReviewResult(record, {
        ...expected,
        gate: GATE,
        qualifiedStatus: QUALIFIED_CLEAN_NATIVE_STATUS,
        captureStates: CAPTURE_STATES
      })
    );
    failures.push(...parsed.failures);
  }
  return {
    status: failures.length === 0 ? "validated-receipt" : "invalid",
    path,
    exists: true,
    valid: failures.length === 0,
    failures,
    sha256: bytes.byteLength > 0 ? sha256(bytes) : null,
    byteLength: bytes.byteLength
  };
}

async function evaluateRegressionGolden(page, manifest, capturesByState, approval, artifactIndex) {
  const golden = manifest?.regressionGolden;
  if (!isRecord(golden)) {
    return {
      status: "failed",
      approved: false,
      manifestStatus: null,
      failures: ["regressionGolden must be an object"],
      thresholds: null,
      results: []
    };
  }
  if (golden.status === "pending-m3-user-approval") {
    return {
      status: "pending",
      approved: false,
      manifestStatus: golden.status,
      failures: ["regressionGolden.status is not exactly 'approved'"],
      thresholds: golden.thresholds,
      results: []
    };
  }
  if (golden.status !== "approved") {
    return {
      status: "failed",
      approved: false,
      manifestStatus: golden.status ?? null,
      failures: ["regressionGolden.status must be exactly 'pending-m3-user-approval' or 'approved'"],
      thresholds: golden.thresholds ?? null,
      results: []
    };
  }
  const failures = [];
  const requireGolden = (condition, message) => {
    if (!condition) failures.push(message);
  };
  requireGolden(golden.schemaVersion === 1, "Regression Golden schemaVersion must be 1");
  requireGolden(golden.source === "first-user-approved-galacean-output", "Regression Golden source changed");
  requireGolden(golden.referenceTargetIsAutomaticGolden === false, "Reference target cannot be the Regression Golden");
  requireGolden(golden.approvalRecordRequired === true, "Regression Golden must require the user approval record");
  requireGolden(
    golden.thresholds?.perChannelByteTolerance === 8 &&
      golden.thresholds?.maximumDiffPixelRatio === 0.01 &&
      golden.thresholds?.maximumMeanAbsoluteChannelDifference === 1.5,
    "Regression Golden thresholds differ from the frozen 8 / 1% / 1.5 contract"
  );
  requireGolden(
    hasExactObjectKeys(golden.states, CAPTURE_STATES),
    "Regression Golden must define exactly the eight frozen capture states"
  );
  if (hasExactObjectKeys(golden.states, CAPTURE_STATES)) {
    for (const state of CAPTURE_STATES) {
      requireGolden(isRecord(golden.states[state]), `${state} Golden definition must be an object`);
    }
  }
  if (failures.length > 0) {
    return {
      status: "failed",
      approved: false,
      manifestStatus: golden.status,
      failures,
      thresholds: golden.thresholds,
      results: []
    };
  }
  const results = [];
  for (const state of CAPTURE_STATES) {
    const definition = golden.states[state];
    if (!isRecord(definition)) {
      failures.push(`${state} Golden definition must be an object`);
      continue;
    }
    const expectedRelativePath = `regression/${state}.png`;
    const expectedPath = resolve(BASELINE_DIRECTORY, expectedRelativePath);
    const fileIsValid = typeof definition.file === "string" && definition.file === expectedRelativePath;
    const hashIsValid = typeof definition.sha256 === "string" && /^[0-9a-f]{64}$/.test(definition.sha256);
    const dimensionsAreValid =
      definition.width === FIXED_ENVIRONMENT.viewport.width && definition.height === FIXED_ENVIRONMENT.viewport.height;
    requireGolden(fileIsValid, `${state} Golden path is invalid`);
    requireGolden(hashIsValid, `${state} Golden SHA-256 is invalid`);
    requireGolden(dimensionsAreValid, `${state} Golden dimensions changed`);
    if (!fileIsValid || !hashIsValid || !dimensionsAreValid) continue;
    const path = resolve(BASELINE_DIRECTORY, definition.file);
    if (path !== expectedPath) {
      failures.push(`${state} Golden path escapes the frozen baseline location`);
      continue;
    }
    if (!(await fileExists(path))) {
      failures.push(`${state} Golden PNG is missing`);
      continue;
    }
    let metadata;
    try {
      metadata = await lstat(path);
    } catch (error) {
      failures.push(
        `${state} Golden metadata is unreadable: ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      failures.push(`${state} Golden must be a regular non-symlink file`);
      continue;
    }
    try {
      runCommand("git", ["ls-files", "--error-unmatch", relative(REPOSITORY_ROOT, path)]);
    } catch {
      failures.push(`${state} Golden PNG is not tracked by Git`);
    }
    let oldBytes;
    try {
      oldBytes = await readFile(path);
    } catch (error) {
      failures.push(`${state} Golden PNG is unreadable: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    requireGolden(sha256(oldBytes) === definition.sha256, `${state} Golden PNG SHA-256 does not match its manifest`);
    let dimensions;
    try {
      dimensions = readPngDimensions(oldBytes);
    } catch (error) {
      failures.push(`${state} Golden PNG is invalid: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    requireGolden(
      dimensions.width === FIXED_ENVIRONMENT.viewport.width && dimensions.height === FIXED_ENVIRONMENT.viewport.height,
      `${state} Golden PNG dimensions are invalid`
    );
    const current = capturesByState.get(state);
    if (!current) {
      failures.push(`${state} current capture bytes are missing`);
      continue;
    }
    requireGolden(
      approval.valid === true &&
        approval.record?.reviewedEvidence?.captureStatePngSha256?.[state] === definition.sha256,
      `${state} Golden SHA-256 is not bound to the validated user approval`
    );
    let comparison;
    try {
      comparison = await compareRegressionPngBytes(page, oldBytes, current.bytes, golden.thresholds);
    } catch (error) {
      failures.push(`${state} Golden comparison failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const diffBytes = Buffer.from(comparison.diffDataUrl.slice(comparison.diffDataUrl.indexOf(",") + 1), "base64");
    const directory = resolve(run.outputDirectory, "regression-golden", state);
    await mkdir(directory, { recursive: true });
    const oldPath = resolve(directory, "old.png");
    const newPath = resolve(directory, "new.png");
    const diffPath = resolve(directory, "diff.png");
    await Promise.all([
      writeFile(oldPath, oldBytes),
      writeFile(newPath, current.bytes),
      writeFile(diffPath, diffBytes)
    ]);
    const passed = regressionMetricsPass(comparison.metrics, golden.thresholds);
    const result = {
      state,
      status: passed ? "passed" : "failed",
      thresholds: golden.thresholds,
      metrics: comparison.metrics,
      hashes: {
        old: sha256(oldBytes),
        new: sha256(current.bytes),
        diff: sha256(diffBytes)
      },
      artifacts: { oldPath, newPath, diffPath }
    };
    const comparisonArtifact = await writeJsonArtifact(resolve(directory, "comparison.json"), result);
    result.artifacts.comparison = comparisonArtifact.path;
    artifactIndex.push(
      {
        category: `regression-golden/${state}`,
        name: "old",
        path: oldPath,
        relativePath: relative(run.outputDirectory, oldPath),
        sha256: result.hashes.old,
        byteLength: oldBytes.byteLength
      },
      {
        category: `regression-golden/${state}`,
        name: "new",
        path: newPath,
        relativePath: relative(run.outputDirectory, newPath),
        sha256: result.hashes.new,
        byteLength: current.bytes.byteLength
      },
      {
        category: `regression-golden/${state}`,
        name: "diff",
        path: diffPath,
        relativePath: relative(run.outputDirectory, diffPath),
        sha256: result.hashes.diff,
        byteLength: diffBytes.byteLength
      },
      {
        category: `regression-golden/${state}`,
        name: "comparison",
        ...comparisonArtifact
      }
    );
    results.push(result);
  }
  return {
    status:
      failures.length === 0 &&
      results.length === CAPTURE_STATES.length &&
      results.every(({ status }) => status === "passed")
        ? "passed"
        : "failed",
    approved: failures.length === 0,
    manifestStatus: golden.status,
    failures,
    thresholds: golden.thresholds,
    results
  };
}

async function createTargetHeroSideBySide(page, targetBytes, heroBytes, artifactIndex) {
  const dataUrl = await page.evaluate(
    async ({ targetUrl, heroUrl, width, height }) => {
      const decode = (url) =>
        new Promise((resolveImage, rejectImage) => {
          const image = new Image();
          image.onload = () => resolveImage(image);
          image.onerror = () => rejectImage(new Error("Unable to decode Grasslands parity image."));
          image.src = url;
        });
      const [target, hero] = await Promise.all([decode(targetUrl), decode(heroUrl)]);
      if (
        target.naturalWidth !== width ||
        target.naturalHeight !== height ||
        hero.naturalWidth !== width ||
        hero.naturalHeight !== height
      ) {
        throw new Error(
          `Grasslands parity dimensions differ: target=${target.naturalWidth}x${target.naturalHeight}, ` +
            `hero=${hero.naturalWidth}x${hero.naturalHeight}, expected=${width}x${height}.`
        );
      }
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Unable to create Grasslands side-by-side canvas.");
      context.drawImage(target, 0, 0);
      context.drawImage(hero, width, 0);
      return canvas.toDataURL("image/png");
    },
    {
      targetUrl: `data:image/png;base64,${targetBytes.toString("base64")}`,
      heroUrl: `data:image/png;base64,${heroBytes.toString("base64")}`,
      width: FIXED_ENVIRONMENT.viewport.width,
      height: FIXED_ENVIRONMENT.viewport.height
    }
  );
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const path = resolve(run.outputDirectory, "reference-parity", "target-left-hero-right.png");
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, bytes);
  const artifact = {
    category: "reference-parity",
    name: "target-left-hero-right",
    path,
    relativePath: relative(run.outputDirectory, path),
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    width: FIXED_ENVIRONMENT.viewport.width * 2,
    height: FIXED_ENVIRONMENT.viewport.height,
    layout: "external target on left; current Galacean hero capture on right"
  };
  artifactIndex.push(artifact);
  return artifact;
}

async function writeDataUrlPngArtifact(dataUrl, category, name, width, height, artifactIndex) {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const path = resolve(run.outputDirectory, category, `${name}.png`);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, bytes);
  const artifact = {
    category,
    name,
    path,
    relativePath: relative(run.outputDirectory, path),
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    width,
    height
  };
  artifactIndex.push(artifact);
  return artifact;
}

async function createFixtureVisualArtifacts(
  page,
  targetBytes,
  heroBytes,
  waterMask,
  referenceRois,
  candidateRois,
  artifactIndex
) {
  const generated = await page.evaluate(
    async ({ targetUrl, heroUrl, width, height, mask, targetRois, currentRois }) => {
      const decode = (url) =>
        new Promise((resolveImage, rejectImage) => {
          const image = new Image();
          image.onload = () => resolveImage(image);
          image.onerror = () => rejectImage(new Error("Unable to decode Grasslands overlay source."));
          image.src = url;
        });
      const [target, hero] = await Promise.all([decode(targetUrl), decode(heroUrl)]);
      const drawOverlay = (image, rois, includeMask) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Unable to create Grasslands overlay canvas.");
        context.drawImage(image, 0, 0);
        if (includeMask) {
          const drawPolygons = (polygons, fillStyle) => {
            context.fillStyle = fillStyle;
            for (const polygon of polygons) {
              context.beginPath();
              polygon.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
              context.closePath();
              context.fill();
            }
          };
          drawPolygons(mask.includePolygons, "rgba(0, 200, 255, 0.18)");
          drawPolygons(mask.excludePolygons, "rgba(255, 64, 64, 0.24)");
        }
        context.font = "16px sans-serif";
        context.lineWidth = 3;
        for (const roi of rois) {
          context.strokeStyle = "#ffff00";
          context.strokeRect(roi.x + 0.5, roi.y + 0.5, roi.width - 1, roi.height - 1);
          context.fillStyle = "rgba(0, 0, 0, 0.7)";
          context.fillRect(roi.x, roi.y, Math.min(roi.width, roi.id.length * 9 + 12), 22);
          context.fillStyle = "#ffff00";
          context.fillText(roi.id, roi.x + 5, roi.y + 17);
        }
        return canvas.toDataURL("image/png");
      };
      const crop = (image, roi) => {
        const canvas = document.createElement("canvas");
        canvas.width = roi.width;
        canvas.height = roi.height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error(`Unable to create Grasslands crop '${roi.id}'.`);
        context.drawImage(image, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height);
        return canvas.toDataURL("image/png");
      };
      return {
        targetOverlay: drawOverlay(target, targetRois, true),
        candidateOverlay: drawOverlay(hero, currentRois, false),
        targetCrops: targetRois.map((roi) => ({
          id: roi.id,
          width: roi.width,
          height: roi.height,
          dataUrl: crop(target, roi)
        })),
        candidateCrops: currentRois.map((roi) => ({
          id: roi.id,
          width: roi.width,
          height: roi.height,
          dataUrl: crop(hero, roi)
        }))
      };
    },
    {
      targetUrl: `data:image/png;base64,${targetBytes.toString("base64")}`,
      heroUrl: `data:image/png;base64,${heroBytes.toString("base64")}`,
      width: FIXED_ENVIRONMENT.viewport.width,
      height: FIXED_ENVIRONMENT.viewport.height,
      mask: waterMask,
      targetRois: referenceRois,
      currentRois: candidateRois
    }
  );
  const targetOverlay = await writeDataUrlPngArtifact(
    generated.targetOverlay,
    "reference-parity",
    "target-water-mask-and-rois",
    FIXED_ENVIRONMENT.viewport.width,
    FIXED_ENVIRONMENT.viewport.height,
    artifactIndex
  );
  const candidateOverlay = await writeDataUrlPngArtifact(
    generated.candidateOverlay,
    "reference-parity",
    "candidate-mechanism-rois",
    FIXED_ENVIRONMENT.viewport.width,
    FIXED_ENVIRONMENT.viewport.height,
    artifactIndex
  );
  const targetCrops = [];
  for (const crop of generated.targetCrops) {
    targetCrops.push(
      await writeDataUrlPngArtifact(
        crop.dataUrl,
        "reference-parity/crops/target",
        crop.id,
        crop.width,
        crop.height,
        artifactIndex
      )
    );
  }
  const candidateCrops = [];
  for (const crop of generated.candidateCrops) {
    candidateCrops.push(
      await writeDataUrlPngArtifact(
        crop.dataUrl,
        "reference-parity/crops/candidate",
        crop.id,
        crop.width,
        crop.height,
        artifactIndex
      )
    );
  }
  return { targetOverlay, candidateOverlay, targetCrops, candidateCrops };
}

function sourceEvidenceClassification(source, renderer, server, contextLost) {
  const sourceUnavailable = source.start.status === "unavailable" || source.end.status === "unavailable";
  const dirty =
    source.start.status === "available" &&
    source.end.status === "available" &&
    (source.start.fullStatus.length > 0 || source.end.fullStatus.length > 0);
  const headChanged =
    source.start.status === "available" && source.end.status === "available" && source.start.head !== source.end.head;
  const branchChanged =
    source.start.status === "available" &&
    source.end.status === "available" &&
    source.start.branch !== source.end.branch;
  const repositoryRootMismatch =
    source.start.status === "available" &&
    source.end.status === "available" &&
    (source.start.repositoryRoot !== REPOSITORY_ROOT || source.end.repositoryRoot !== REPOSITORY_ROOT);
  const rendererText = `${renderer.renderer ?? ""} ${renderer.unmaskedRenderer ?? ""}`;
  const softwareRenderer = SOFTWARE_RENDERER_PATTERN.test(rendererText);
  const qualificationFailures = [];
  if (!headed) qualificationFailures.push("browser-not-headed");
  if (dirty) qualificationFailures.push("dirty-full-repository-worktree");
  if (sourceUnavailable) qualificationFailures.push("git-provenance-unavailable");
  if (headChanged) qualificationFailures.push("head-changed-during-run");
  if (branchChanged) qualificationFailures.push("branch-changed-during-run");
  if (repositoryRootMismatch) qualificationFailures.push("repository-root-mismatch");
  if (softwareRenderer) qualificationFailures.push("software-renderer");
  if (!renderer.unmaskedRenderer) qualificationFailures.push("unmasked-renderer-unavailable");
  if (renderer.graphicsApi !== "webgl2") qualificationFailures.push("not-webgl2");
  if (contextLost !== false) qualificationFailures.push("webgl-context-lost-or-unavailable");
  if (server.cwd !== WORLD_GALLERY_ROOT || !/\bvite\b/i.test(server.command)) {
    qualificationFailures.push("server-provenance-invalid");
  }
  return {
    mode: diagnosticMode ? "diagnostic" : "formal",
    dirty,
    sourceUnavailable,
    headChanged,
    branchChanged,
    repositoryRootMismatch,
    softwareRenderer,
    headed,
    contextLost,
    status: qualificationFailures.length > 0 ? "unqualified" : QUALIFIED_CLEAN_NATIVE_STATUS,
    qualificationFailures
  };
}

const report = {
  schemaVersion: 1,
  gate: GATE,
  status: "running",
  automationResult: "running",
  runId: run.runId,
  generatedAt: new Date().toISOString(),
  resultPath: run.resultPath,
  outputDirectory: run.outputDirectory,
  baseUrl,
  headed,
  diagnosticMode,
  parityPhase,
  environment: FIXED_ENVIRONMENT,
  scope: {
    phase: parityPhase,
    milestone: parityPhase === "m1" ? "M1 controlled mechanism evidence" : "M3 Reference Parity",
    m3VisualApprovalStatus: "pending-user",
    regressionGoldenStatus: "pending-m3-user-approval",
    referenceTargetIsAutomaticGolden: false,
    goldenUpdated: false,
    thresholdPolicy:
      "M1 requires non-zero target change plus byte-exact candidate-bank/semantic protection and restoration, while recording M3 thresholds as pending; M3 evaluates the frozen manifest thresholds exactly and never auto-approves user review."
  },
  source: {
    start: readRepositorySourceEvidence(),
    end: undefined
  },
  server: undefined,
  fixtureManifest: undefined,
  referenceInput: undefined,
  browser: undefined,
  webgl: undefined,
  postCalibrationWebgl: undefined,
  browserEnvironment: undefined,
  initialAcceptance: undefined,
  captureStates: [],
  debugModes: [],
  causalFeatures: [],
  anchorProbes: [],
  directLight: undefined,
  sceneDepthCpuCurve: undefined,
  contactStability: undefined,
  analyticSkyEvaluation: undefined,
  mechanismGates: undefined,
  phaseGate: undefined,
  m1RoiCalibration: undefined,
  detailNormalFrequency: undefined,
  controlledGpuCalibration: undefined,
  regressionGoldenEvaluation: undefined,
  referenceParity: undefined,
  diagnostics: undefined,
  artifactIndex: [],
  sessionManifest: undefined,
  evidenceClassification: undefined,
  failures: []
};

let browser;
let context;
let page;
let diagnostics;
let capturesByState = new Map();
try {
  report.server = inspectLocalViteListener(baseUrl);
  const fixture = await readReferenceFixtureManifest();
  const externalReference = await verifyExternalReference(fixture.manifest.reference);
  report.fixtureManifest = {
    path: BASELINE_MANIFEST_PATH,
    sha256: fixture.sha256,
    fixtureId: fixture.manifest.fixtureId,
    fixtureStatus: fixture.manifest.fixtureStatus,
    parityClaim: fixture.manifest.parityClaim,
    parityExclusions: fixture.manifest.parityExclusions,
    mechanismThresholds: fixture.manifest.mechanismThresholds,
    regressionGolden: fixture.manifest.regressionGolden
  };
  report.referenceInput = {
    repositoryStored: externalReference.repositoryStored,
    localPath: externalReference.localPath,
    expectedSha256: externalReference.expectedSha256,
    actualSha256: externalReference.actualSha256,
    byteLength: externalReference.byteLength,
    declaredWidth: externalReference.declaredWidth,
    declaredHeight: externalReference.declaredHeight,
    actualWidth: externalReference.actualWidth,
    actualHeight: externalReference.actualHeight,
    waterMaskSha256: hashJson(fixture.manifest.reference.waterMask),
    mechanismRoisSha256: hashJson(fixture.manifest.reference.mechanismRois),
    mechanismThresholdsSha256: hashJson(fixture.manifest.mechanismThresholds)
  };

  const launchOptions = { headless: !headed };
  browser = await chromium.launch(launchOptions);
  report.browser = {
    name: "chromium",
    version: browser.version(),
    launchOptions
  };
  context = await browser.newContext({
    viewport: FIXED_ENVIRONMENT.viewport,
    deviceScaleFactor: FIXED_ENVIRONMENT.deviceScaleFactor
  });
  page = await context.newPage();
  diagnostics = collectPageDiagnostics(page);
  const url = createCaseUrl(baseUrl, CASE_DEFINITION, {
    quality: FIXED_ENVIRONMENT.quality,
    surfaceTime: FIXED_ENVIRONMENT.surfaceTime,
    seed: FIXED_ENVIRONMENT.seed
  });
  url.searchParams.set("visual", "1");
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const ready = await waitForCaseReady(page, CASE_DEFINITION);
  assertCaseIdentity(ready, CASE_DEFINITION);
  assertRuntimeHealthy(ready, CASE_DEFINITION);
  report.browserEnvironment = await assertFixedBrowserEnvironment(page);
  report.webgl = await collectWebGlEnvironment(page);
  report.webgl.contextLost = await page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas");
    const gl = canvas instanceof HTMLCanvasElement ? canvas.getContext("webgl2") : null;
    return gl ? gl.isContextLost() : null;
  });
  assertAcceptance(report.webgl.graphicsApi === "webgl2", "Grasslands parity requires WebGL2.", report.webgl);
  assertAcceptance(report.webgl.contextLost === false, "Grasslands parity WebGL2 context is lost.", report.webgl);

  const initialSnapshot = await resetGrasslands(page);
  assertInitialStrictSnapshot(initialSnapshot);
  report.initialAcceptance = initialSnapshot;
  const fixtureRois = initialSnapshot.scene.ready
    ? await page.evaluate(() => structuredClone(window.waterPcgGrasslands?.fixture.mechanismRois ?? []))
    : [];
  const candidateValidationRois = initialSnapshot.scene.ready
    ? await page.evaluate(() => structuredClone(window.waterPcgGrasslands?.fixture.candidateValidationRois ?? []))
    : [];
  assertAcceptance(
    fixtureRois.length === 7,
    "Grasslands fixture must expose seven mechanism ROI records.",
    fixtureRois
  );
  const referenceRois = assertRoiDefinitions(fixture.manifest.reference.mechanismRois, fixtureRois);
  const m1SupplementalRois = assertM1ProtectionRois();
  const candidateRoiMigration = assertCandidateSupplementalRoiMigration(candidateValidationRois);
  const m1AnalysisRois = [...fixtureRois, ...m1SupplementalRois];
  report.m1RoiCalibration = {
    status: "frozen-for-m1-before-causal-delta-evaluation",
    candidateOnly: true,
    numericThresholdsAdded: false,
    rois: m1SupplementalRois,
    basis: "fixed Hero camera plus deterministic analytic terrain and anchor fixture geometry",
    migration: candidateRoiMigration
  };

  for (const state of CAPTURE_STATES) {
    report.captureStates.push(await captureNamedState(page, state, fixtureRois, report.artifactIndex));
  }
  capturesByState = new Map(
    report.captureStates.map((capture) => [
      capture.state,
      {
        bytes: capture.bytes,
        artifact: capture.artifact,
        acceptance: capture.acceptance
      }
    ])
  );
  report.landscapeComposition = await evaluateLandscapeComposition(
    page,
    capturesByState,
    candidateValidationRois,
    initialSnapshot,
    run,
    report.artifactIndex
  );
  const heroCapture = report.captureStates.find((capture) => capture.state === "hero");
  const detailNormalCapture = report.captureStates.find((capture) => capture.state === "detail-normal");
  assertAcceptance(heroCapture, "Grasslands hero capture is missing.");
  assertAcceptance(detailNormalCapture, "Grasslands detail-normal capture is missing.");
  report.referenceParity = {
    status: "pending-m3-user-review",
    automaticPixelGate: false,
    sideBySide: await createTargetHeroSideBySide(
      page,
      externalReference.bytes,
      heroCapture.bytes,
      report.artifactIndex
    ),
    fixtureVisuals: await createFixtureVisualArtifacts(
      page,
      externalReference.bytes,
      heroCapture.bytes,
      fixture.manifest.reference.waterMask,
      referenceRois,
      fixtureRois,
      report.artifactIndex
    )
  };
  const detailNormalRoi = referenceRois.find(({ id }) => id === "detail-normal");
  assertAcceptance(detailNormalRoi, "Frozen detail-normal ROI is missing.");
  const candidateDetailNormalRoi = candidateValidationRois.find(({ id }) => id === "candidate-near-optics");
  assertAcceptance(candidateDetailNormalRoi, "Candidate detail-normal ROI is missing.");
  report.detailNormalFrequency = await evaluateDetailNormalFrequencyEvidence(
    page,
    externalReference.bytes,
    heroCapture.bytes,
    detailNormalCapture.bytes,
    detailNormalRoi,
    candidateDetailNormalRoi,
    fixture.manifest.mechanismThresholds.detailNormal.maximumPrimaryFrequencyPeakRelativeError
  );
  const detailFrequencyArtifact = await writeJsonArtifact(
    resolve(run.outputDirectory, "metrics", "detail-normal-frequency.json"),
    report.detailNormalFrequency
  );
  report.detailNormalFrequency.artifact = detailFrequencyArtifact;
  report.artifactIndex.push({
    category: "metrics",
    name: "detail-normal-frequency",
    ...detailFrequencyArtifact
  });
  for (const capture of report.captureStates) delete capture.bytes;

  await resetGrasslands(page);
  for (const definition of APPENDED_DEBUG_MODES) {
    report.debugModes.push(await captureDebugMode(page, definition, fixtureRois, report.artifactIndex));
  }

  await resetGrasslands(page);
  for (const feature of CAUSAL_FEATURES) {
    report.causalFeatures.push(await captureCausalFeature(page, feature, m1AnalysisRois, report.artifactIndex));
  }

  await resetGrasslands(page);
  const anchorIds = (await readGrasslandsSnapshot(page)).scene.anchorRocks.map((rock) => rock.id);
  assertAcceptance(anchorIds.length === 3, "Grasslands parity requires exactly three anchor probes.", anchorIds);
  for (const rockId of anchorIds) {
    report.anchorProbes.push(await captureAnchorProbeSequence(page, rockId, m1AnalysisRois, report.artifactIndex));
  }

  await resetGrasslands(page);
  report.directLight = await captureDirectLightSequence(page, m1AnalysisRois, report.artifactIndex);

  await resetGrasslands(page);
  report.contactStability = await captureContactStabilityFrames(page, m1AnalysisRois);

  await resetGrasslands(page);
  report.analyticSkyEvaluation = await captureAnalyticSkyEvaluation(page, fixtureRois, report.artifactIndex);
  report.analyticSkyEvaluation.freshReload = await captureAnalyticSkyFreshReload(
    page,
    fixtureRois,
    report.artifactIndex,
    report.analyticSkyEvaluation.internal.analyticRoiProbes
  );
  delete report.analyticSkyEvaluation.internal;

  report.sceneDepthCpuCurve = createSceneDepthCpuCurve(initialSnapshot, fixture.manifest);
  const curveArtifact = await writeJsonArtifact(
    resolve(run.outputDirectory, "metrics", "scene-depth-delta-cpu-curve.json"),
    report.sceneDepthCpuCurve
  );
  report.sceneDepthCpuCurve.artifact = curveArtifact;
  report.artifactIndex.push({
    category: "metrics",
    name: "scene-depth-delta-cpu-curve",
    ...curveArtifact
  });
  const calibrationSnapshot = await resetGrasslands(page);
  assertInitialStrictSnapshot(calibrationSnapshot);
  report.controlledGpuCalibration = await evaluateControlledGpuCalibration(
    page,
    fixture.manifest,
    calibrationSnapshot,
    report.detailNormalFrequency,
    report.webgl
  );
  const calibrationArtifact = await writeJsonArtifact(
    resolve(run.outputDirectory, "metrics", "controlled-gpu-calibration.json"),
    report.controlledGpuCalibration
  );
  report.controlledGpuCalibration.artifact = calibrationArtifact;
  report.artifactIndex.push({
    category: "metrics",
    name: "controlled-gpu-calibration",
    ...calibrationArtifact
  });
  const controlledCalibrationCore = createControlledCalibrationCore(report.controlledGpuCalibration);
  report.controlledGpuCalibration.coreSha256 = hashJson(controlledCalibrationCore);
  report.postCalibrationWebgl = await collectWebGlEnvironment(page);
  report.postCalibrationWebgl.contextLost = await page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas");
    const gl = canvas instanceof HTMLCanvasElement ? canvas.getContext("webgl2") : null;
    return gl ? gl.isContextLost() : null;
  });
  assertAcceptance(
    report.postCalibrationWebgl.graphicsApi === "webgl2" &&
      report.postCalibrationWebgl.contextLost === false &&
      report.postCalibrationWebgl.unmaskedRenderer === report.webgl.unmaskedRenderer,
    "Grasslands main WebGL2 context or renderer changed after transient GPU calibration.",
    { before: report.webgl, after: report.postCalibrationWebgl }
  );
  report.mechanismGates = {
    causalFeatures: Object.fromEntries(
      report.causalFeatures.map(({ feature, gate }) => [feature, { status: gate.status, failures: gate.failures }])
    ),
    anchorProbes: Object.fromEntries(
      report.anchorProbes.map(({ rockId, gate }) => [rockId, { status: gate.status, failures: gate.failures }])
    ),
    directLight: {
      status: report.directLight.gate.status,
      failures: report.directLight.gate.failures
    },
    contactStability: {
      status: report.contactStability.gate.status,
      unstableRois: report.contactStability.gate.unstableRois
    }
  };
  report.mechanismGates.status = [
    ...Object.values(report.mechanismGates.causalFeatures),
    ...Object.values(report.mechanismGates.anchorProbes),
    report.mechanismGates.directLight,
    report.mechanismGates.contactStability
  ].every(({ status }) => status === "passed")
    ? "passed"
    : "failed";
  const approvalRecordPath = process.env.GRASSLANDS_M3_USER_APPROVAL_RECORD?.trim();
  const captureHashes = Object.fromEntries(
    CAPTURE_STATES.map((state) => [state, capturesByState.get(state)?.artifact.sha256])
  );
  const visualApprovalRecord = await readStructuredM3UserApproval(
    approvalRecordPath,
    {
      commit: report.source.start.head,
      fixtureManifestSha256: fixture.sha256,
      controlledCalibrationCoreSha256: report.controlledGpuCalibration.coreSha256,
      sideBySidePngSha256: report.referenceParity.sideBySide.sha256,
      captureHashes,
      flipGreen: calibrationSnapshot.normal.flipGreen
    },
    m3ApprovalMode
  );
  const initialReviewQualification =
    m3ApprovalMode === "initial-review"
      ? {
          status: visualApprovalRecord.valid ? "current-run-verified" : visualApprovalRecord.status,
          path: visualApprovalRecord.path,
          exists: visualApprovalRecord.exists,
          valid: visualApprovalRecord.valid,
          failures: visualApprovalRecord.failures,
          sha256: visualApprovalRecord.sha256,
          byteLength: visualApprovalRecord.byteLength
        }
      : await readInitialReviewQualification(process.env.GRASSLANDS_M3_INITIAL_REVIEW_RESULT?.trim(), {
          fixtureManifestSha256: fixture.sha256,
          approvalRecordSha256: visualApprovalRecord.sha256,
          approvalCommit: visualApprovalRecord.record?.commit,
          controlledCalibrationCoreSha256:
            visualApprovalRecord.record?.reviewedEvidence?.controlledCalibrationCoreSha256,
          sideBySidePngSha256: visualApprovalRecord.record?.reviewedEvidence?.sideBySidePngSha256,
          captureHashes: visualApprovalRecord.record?.reviewedEvidence?.captureStatePngSha256
        });
  report.regressionGoldenEvaluation = await evaluateRegressionGolden(
    page,
    fixture.manifest,
    capturesByState,
    visualApprovalRecord,
    report.artifactIndex
  );
  const referenceParityStatus =
    report.mechanismGates.status === "passed" &&
    report.controlledGpuCalibration.status === "passed" &&
    visualApprovalRecord.valid
      ? "passed"
      : report.mechanismGates.status === "passed" &&
          report.controlledGpuCalibration.status === "passed" &&
          visualApprovalRecord.status === "pending"
        ? "pending-user-review"
        : "failed";
  report.referenceParity.status = referenceParityStatus;
  report.referenceParity.automaticPixelGate = false;
  report.referenceParity.machineThresholdStatus = report.controlledGpuCalibration.status;
  report.referenceParity.visualApprovalStatus = visualApprovalRecord.status;
  const m3FunctionalStatus =
    !m3ApprovalModeExplicit ||
    referenceParityStatus === "failed" ||
    report.regressionGoldenEvaluation.status === "failed" ||
    initialReviewQualification.status === "invalid"
      ? "failed"
      : referenceParityStatus === "pending-user-review" ||
          report.regressionGoldenEvaluation.status === "pending" ||
          !initialReviewQualification.valid
        ? "pending"
        : "passed";
  report.phaseGate = {
    phase: parityPhase,
    m1: {
      status: report.mechanismGates.status,
      functionalStatus: report.mechanismGates.status,
      evidenceQualificationStatus: "pending",
      requirements:
        "clean/same HEAD, headed native WebGL2, hidden automation UI, decoded-PNG Debug/A-B, real anchors, DirectLight, analytic Sky and 60-frame stability"
    },
    m3: {
      status: "pending-evidence-qualification",
      approvalMode: m3ApprovalMode,
      approvalModeExplicit: m3ApprovalModeExplicit,
      functionalStatus: m3FunctionalStatus,
      evidenceQualificationStatus: "pending",
      referenceParityStatus,
      controlledGpuCalibrationStatus: report.controlledGpuCalibration.status,
      detailNormalFrequencyStatus: report.detailNormalFrequency.status,
      visualApprovalRecord,
      initialReviewQualification,
      regressionGoldenStatus: report.regressionGoldenEvaluation.status,
      regressionGoldenApproved: report.regressionGoldenEvaluation.status === "passed"
    }
  };

  await page.evaluate(async () => window.waterPcgGrasslands?.reset());
  await waitForAnimationFrames(page, SETTLE_FRAME_COUNT);
  const restoredSnapshot = await readGrasslandsSnapshot(page);
  assertInitialStrictSnapshot(restoredSnapshot);
  report.restoredAcceptance = restoredSnapshot;
  assertNoPageErrors(diagnostics, "Grasslands parity evidence capture");
  report.diagnostics = diagnostics;

  report.postCalibrationWebgl = await collectWebGlEnvironment(page);
  report.postCalibrationWebgl.contextLost = await page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas");
    const gl = canvas instanceof HTMLCanvasElement ? canvas.getContext("webgl2") : null;
    return gl ? gl.isContextLost() : null;
  });
  assertAcceptance(
    report.postCalibrationWebgl.graphicsApi === "webgl2" &&
      report.postCalibrationWebgl.contextLost === false &&
      report.postCalibrationWebgl.unmaskedRenderer === report.webgl.unmaskedRenderer,
    "Grasslands main WebGL2 context is unhealthy after all M3 calibration and Golden work.",
    { before: report.webgl, after: report.postCalibrationWebgl }
  );
  await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
  assertNoPageErrors(diagnostics, "Grasslands parity cleanup");
  report.source.end = readRepositorySourceEvidence();
  report.evidenceClassification = sourceEvidenceClassification(
    report.source,
    report.postCalibrationWebgl,
    report.server,
    report.postCalibrationWebgl.contextLost
  );
  report.phaseGate.m1.evidenceQualificationStatus = report.evidenceClassification.status;
  report.phaseGate.m1.status =
    report.phaseGate.m1.functionalStatus === "passed" &&
    report.evidenceClassification.status === QUALIFIED_CLEAN_NATIVE_STATUS
      ? "passed"
      : report.phaseGate.m1.functionalStatus === "passed"
        ? "unqualified"
        : "failed";
  report.phaseGate.m3.evidenceQualificationStatus = report.evidenceClassification.status;
  report.phaseGate.m3.status =
    report.phaseGate.m3.functionalStatus === "passed" &&
    report.evidenceClassification.status === QUALIFIED_CLEAN_NATIVE_STATUS
      ? "passed"
      : report.phaseGate.m3.functionalStatus === "passed"
        ? "unqualified"
        : report.phaseGate.m3.functionalStatus;
  if (!diagnosticMode) {
    assertAcceptance(
      report.evidenceClassification.qualificationFailures.length === 0,
      "Grasslands formal parity evidence is not from one clean, unchanged HEAD with headed native WebGL2 and verified Vite provenance.",
      report.evidenceClassification
    );
  }
  const activePhaseStatus = report.phaseGate[parityPhase].status;
  const activePhaseSatisfied =
    diagnosticMode && parityPhase === "m1"
      ? report.phaseGate.m1.functionalStatus === "passed"
      : activePhaseStatus === "passed";
  assertAcceptance(
    activePhaseSatisfied,
    parityPhase === "m1"
      ? "Grasslands M1 controlled mechanism Gate is unmet."
      : "Grasslands M3 Reference Parity Gate failed or remains pending controlled calibration, explicit user approval, and approved Regression Golden.",
    report.phaseGate
  );
  report.automationResult = diagnosticMode
    ? `diagnostic-${parityPhase}-functional-passed-${report.evidenceClassification.status}`
    : parityPhase === "m3"
      ? `formal-m3-${m3ApprovalMode}-gate-passed`
      : "formal-m1-gate-passed";
  report.status = diagnosticMode ? `diagnostic-passed-${report.evidenceClassification.status}` : "passed";
} catch (error) {
  report.failures.push(serializeError(error));
  report.status = "failed";
  report.automationResult = "failed";
  if (diagnostics) report.diagnostics = diagnostics;
} finally {
  let contextClosed = false;
  let browserClosed = false;
  await context?.close().catch((error) => {
    report.failures.push({ phase: "context-close", ...serializeError(error) });
    report.status = "failed";
    report.automationResult = "failed";
  });
  contextClosed = context !== undefined && report.failures.every((failure) => failure.phase !== "context-close");
  await browser?.close().catch((error) => {
    report.failures.push({ phase: "browser-close", ...serializeError(error) });
    report.status = "failed";
    report.automationResult = "failed";
  });
  browserClosed = browser !== undefined && report.failures.every((failure) => failure.phase !== "browser-close");
  if (!report.source.end) report.source.end = readRepositorySourceEvidence();
  if (!report.evidenceClassification && report.webgl && report.server) {
    const finalWebGl = report.postCalibrationWebgl ?? report.webgl;
    report.evidenceClassification = sourceEvidenceClassification(
      report.source,
      finalWebGl,
      report.server,
      finalWebGl.contextLost
    );
  }
  report.completedAt = new Date().toISOString();
  const sessionManifest = {
    schemaVersion: 1,
    gate: GATE,
    parityPhase,
    runId: run.runId,
    status: report.status,
    automationResult: report.automationResult,
    evidenceClassification: report.evidenceClassification,
    generatedAt: report.generatedAt,
    completedAt: report.completedAt,
    source: report.source,
    server: report.server,
    environment: report.environment,
    browser: report.browser,
    webgl: report.webgl,
    postCalibrationWebgl: report.postCalibrationWebgl,
    cleanup: {
      aboutBlankNavigationCompleted: page?.url() === "about:blank",
      contextClosed,
      browserClosed,
      writtenAfterBrowserClose: true
    },
    fixture: report.initialAcceptance
      ? {
          manifestPath: BASELINE_MANIFEST_PATH,
          manifestSha256: report.fixtureManifest?.sha256,
          fixtureId: report.fixtureManifest?.fixtureId,
          descriptorHash: report.initialAcceptance.descriptorHash,
          appearanceHash: report.initialAcceptance.appearanceHash,
          externalAssetHash: report.initialAcceptance.externalAssetHash,
          fixtureHash: report.initialAcceptance.fixtureHash,
          referenceSha256: report.referenceInput?.actualSha256
        }
      : undefined,
    captureCounts: {
      captureStates: report.captureStates.length,
      debugModes: report.debugModes.length,
      causalFeaturePhases: report.causalFeatures.length * 3,
      anchorProbePhases: report.anchorProbes.length * 4,
      directLightPhases: report.directLight ? 4 : 0,
      contactStabilityFrames: report.contactStability?.frameCount ?? 0,
      analyticSkyPhases: report.analyticSkyEvaluation ? 4 : 0
    },
    controlledGpuCalibration: {
      status: report.controlledGpuCalibration?.status ?? "not-run",
      coreSha256: report.controlledGpuCalibration?.coreSha256 ?? null,
      readbackHashes: report.controlledGpuCalibration?.readbackHashes ?? [],
      unmet: report.controlledGpuCalibration?.unmet ?? []
    },
    phaseGate: report.phaseGate,
    m3: {
      approvalMode: report.phaseGate?.m3.approvalMode ?? m3ApprovalMode,
      initialReviewQualificationStatus: report.phaseGate?.m3.initialReviewQualification.status ?? "not-run",
      referenceParityStatus: report.phaseGate?.m3.referenceParityStatus ?? "not-run",
      visualApprovalStatus: report.phaseGate?.m3.visualApprovalRecord.valid ? "validated-record" : "pending-user",
      regressionGoldenStatus: report.phaseGate?.m3.regressionGoldenStatus ?? "pending-m3-user-approval",
      goldenUpdated: false,
      referenceParityThresholdEvaluation: report.controlledGpuCalibration?.status ?? "not-run",
      detailNormalFrequencyStatus: report.detailNormalFrequency?.status ?? "not-run"
    },
    failures: report.failures,
    resultPath: run.resultPath,
    artifacts: report.artifactIndex
  };
  try {
    report.sessionManifest = await writeJsonArtifact(
      resolve(run.outputDirectory, "session-manifest.json"),
      sessionManifest
    );
  } catch (error) {
    report.failures.push({ phase: "session-manifest-write", ...serializeError(error) });
    report.status = "failed";
    report.automationResult = "failed";
  }
  await writeAcceptanceReport(run, report);
}

const reportPath = relative(process.cwd(), run.resultPath) || run.resultPath;
if (report.status === "failed") {
  console.error(`Grasslands water parity evidence capture failed. Report: ${reportPath}`);
  for (const failure of report.failures) console.error(failure.stack || failure.message);
  process.exitCode = 1;
} else {
  console.log(`Grasslands water parity ${report.status}; ${parityPhase.toUpperCase()} Gate passed.`);
  if (parityPhase === "m1") {
    console.log("M3 remains independently gated by calibrated Reference Parity, explicit user approval, and Golden.");
  }
  console.log(`Report: ${reportPath}`);
}
