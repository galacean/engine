import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const DEFAULT_URL = "http://127.0.0.1:4179/demos/water-pcg/#water-optics-lab";
const FIXED_SURFACE_TIME = 12.5;
const REFLECTOR_ANGULAR_RATE = 0.52;
const REFLECTOR_RIGHT_TIME = Math.PI / (2 * REFLECTOR_ANGULAR_RATE);
const REFLECTOR_LEFT_TIME = (3 * Math.PI) / (2 * REFLECTOR_ANGULAR_RATE);
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const ANALYSIS_SIZE = Object.freeze({ width: 256, height: 144 });
const DEVICE_SCALE_FACTOR = 1;
const BORDER_WIDTH = 2;
const fastDiagnostics = process.env.WATER_OPTICS_VISUAL_FAST === "1";
const BORDER_FRAME_COUNT = fastDiagnostics ? 5 : 60;
const requestedTier = process.env.WATER_OPTICS_VISUAL_TIER;
const TIERS = Object.freeze(
  requestedTier === "medium" || requestedTier === "high" ? [requestedTier] : ["medium", "high"]
);
const headed = process.env.WATER_OPTICS_HEADED === "1";
const BASELINE_REVIEW_REASON = (process.env.WATER_OPTICS_P0_BASELINE_REVIEW_REASON ?? "").trim();

const THRESHOLDS = Object.freeze({
  goldenMaximumDiffPixelRatio: 0.005,
  goldenPerChannelByteTolerance: 2,
  refractionMinimumMad: 0.015,
  refractionNoiseMultiplier: 4,
  aboveWaterMaximumMad: 0.006,
  aboveWaterNoiseMultiplier: 3,
  foregroundRailMaximumMad: 0.008,
  foregroundRailNoiseMultiplier: 3,
  foregroundRailLeakDelta: 0.05,
  foregroundRailMaximumLeakRatio: 0.005,
  borderMaximumSentinelToWaterRatio: 0.001,
  planarClipOffMinimumCoverage: 0.05,
  planarClipOnMaximumCoverage: 0.005,
  probeMinimumMad: 0.02,
  probeNoiseMultiplier: 4,
  transmittanceMinimumDepthStep: 0.05,
  compositionPredictionMaximumError: 3 / 255,
  compositionTargetConfirmationMinimumError: 5 / 255,
  compositionTargetMatchMaximumError: 2 / 255,
  transparentOrderingMinimumMad: 0.015,
  transparentOrderingNegativeMaximumMad: 0.004,
  planarAnchorMaximumErrorPixels: 3,
  planarAnchorSearchRadiusPixels: 24,
  planarAnchorMinimumGreenAdvantageByte: 4,
  planarOrientationSearchRadiusPixels: 56,
  planarOrientationMaximumExpectedPointErrorPixels: 3,
  planarOrientationMaximumFinalToReflectionErrorPixels: 3,
  planarOrientationMinimumColorAdvantageByte: 8,
  planarOrientationMinimumSignificantPixelCount: 4,
  crossingColumnMinimumRevealedReflectionPixels: 8,
  localFoamMinimumInsideMad: 0.002,
  localFoamMinimumMeanReduction: 0.001,
  localFoamMinimumFinalInsideMad: 0.003,
  localFoamMinimumInsideOutsideRatio: 4,
  localFoamOutsideMaximumMad: 0.002,
  localFoamMasterOffMaximumMad: 1 / 255,
  localFoamNoiseMultiplier: 4,
  movingReflectorMinimumPlanarMad: 0.0015,
  movingReflectorMinimumPlanarToProbeRatio: 1.5,
  movingReflectorNoiseMultiplier: 4,
  pureTransmissionMaximumMad: 2 / 255,
  pureTransmissionMaximumFresnel: 1 / 255,
  pureTransmissionMinimumValidPixelCount: 1024,
  pureTransmissionMinimumValidity: 0.99,
  referenceMaximumChannelError: 2 / 255
});

const ROIS = Object.freeze({
  shallowBed: Object.freeze([0.15, 0.48, 0.2, 0.24]),
  mediumBed: Object.freeze([0.4, 0.48, 0.2, 0.24]),
  deepBed: Object.freeze([0.65, 0.48, 0.2, 0.24]),
  foregroundRail: Object.freeze([0.23, 0.785, 0.54, 0.03]),
  aboveWaterColumns: Object.freeze([
    Object.freeze([0.235, 0.25, 0.02, 0.1]),
    Object.freeze([0.492, 0.25, 0.02, 0.1]),
    Object.freeze([0.742, 0.25, 0.02, 0.1])
  ]),
  planarClip: Object.freeze([0.78, 0.56, 0.18, 0.09]),
  planarReflector: Object.freeze([0.1, 0.49, 0.8, 0.11]),
  transparentOrderingSentinel: Object.freeze([0.56, 0.34, 0.18, 0.2])
});
const UNDERWATER_ROIS = Object.freeze([ROIS.shallowBed, ROIS.mediumBed, ROIS.deepBed]);
const REFLECTION_ROIS = Object.freeze([...UNDERWATER_ROIS, ROIS.planarClip]);
const COMPOSITION_CALIBRATION_POINT = Object.freeze({
  normalized: Object.freeze([0.5, 0.62]),
  rationale: "Fixed center of the medium-depth checker bed, below the green pillar and away from water edges."
});

const SCRIPT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const WORLD_GALLERY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const DEFAULT_BASELINE_ROOT = resolve(WORLD_GALLERY_ROOT, "demos/water-pcg/e2e/baselines/water-optics/p0");
const BASELINE_ROOT = resolve(process.env.WATER_OPTICS_P0_BASELINE_ROOT ?? DEFAULT_BASELINE_ROOT);
const requestedOutputRoot = resolve(
  process.env.WATER_OPTICS_VISUAL_OUTPUT_DIR ?? resolve(WORLD_GALLERY_ROOT, "output/playwright/water-optics-p0-visual")
);
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputDirectory = resolve(requestedOutputRoot, runId);
const BASELINE_FILES = Object.freeze(["refraction-final.png", "reflection-final.png", "planar-clip-mask.png"]);
const BASELINE_FIXTURE_VISUAL_STATE = Object.freeze({
  markerLayout: "four-asymmetric-markers-v1",
  planarOrientationMarkersVisible: true,
  localFoamMaskEnabled: true,
  localFoamMaskCenterXZ: Object.freeze([-6, 1.5]),
  localFoamMaskHalfSizeXZ: Object.freeze([3.25, 4.25]),
  localFoamMaskFeatherMeters: 0.45,
  reflectorLayout: "moving-reflector-boat-v1",
  reflectorVisible: true,
  reflectorTime: FIXED_SURFACE_TIME,
  featureFlags: Object.freeze({ waves: true, microNormals: true, foam: true })
});
const BASELINE_FIXTURE_VISUAL_HASH = createHash("sha256")
  .update(JSON.stringify(BASELINE_FIXTURE_VISUAL_STATE))
  .digest("hex");
const BASELINE_FROZEN_THRESHOLDS = Object.freeze({
  goldenMaximumDiffPixelRatio: THRESHOLDS.goldenMaximumDiffPixelRatio,
  goldenPerChannelByteTolerance: THRESHOLDS.goldenPerChannelByteTolerance,
  refractionMinimumLinearMad: THRESHOLDS.refractionMinimumMad,
  aboveWaterMaximumLinearMad: THRESHOLDS.aboveWaterMaximumMad,
  foregroundRailMaximumLinearMad: THRESHOLDS.foregroundRailMaximumMad,
  foregroundRailMaximumLeakRatio: THRESHOLDS.foregroundRailMaximumLeakRatio,
  borderMaximumSentinelToWaterRatio: THRESHOLDS.borderMaximumSentinelToWaterRatio,
  planarClipOffMinimumCoverage: THRESHOLDS.planarClipOffMinimumCoverage,
  planarClipOnMaximumCoverage: THRESHOLDS.planarClipOnMaximumCoverage,
  probeMinimumLinearMad: THRESHOLDS.probeMinimumMad,
  transmittanceMinimumDepthStep: THRESHOLDS.transmittanceMinimumDepthStep
});
const BASELINE_REGIONS = Object.freeze({
  shallowBed: ROIS.shallowBed,
  mediumBed: ROIS.mediumBed,
  deepBed: ROIS.deepBed,
  foregroundRail: ROIS.foregroundRail,
  aboveWaterColumns: ROIS.aboveWaterColumns,
  planarClipSentinel: ROIS.planarClip,
  borderWidthAnalysisPixels: BORDER_WIDTH
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function recordCheck(failures, condition, message) {
  if (!condition) failures.push(message);
  return condition;
}

function isInsideDirectory(candidate, directory) {
  return candidate === directory || candidate.startsWith(`${directory}${sep}`);
}

function jsonValuesEqual(actual, expected) {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((value, index) => jsonValuesEqual(value, expected[index]))
    );
  }
  if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object") return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    jsonValuesEqual(actualKeys, expectedKeys) &&
    expectedKeys.every((key) => jsonValuesEqual(actual[key], expected[key]))
  );
}

async function loadCommittedBaselines(tier) {
  const tierDirectory = resolve(BASELINE_ROOT, tier);
  const schemaPath = resolve(tierDirectory, "roi.json");
  let schema;
  try {
    schema = JSON.parse(await readFile(schemaPath, "utf8"));
  } catch (error) {
    throw new Error(
      `${tier}: P0 baseline schema is missing, unreadable, or invalid JSON at ${schemaPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  assert(schema.schemaVersion === 3, `${tier}: committed P0 baseline schema must be version 3.`);
  assert(schema.tier === tier, `${tier}: committed P0 baseline tier is ${schema.tier ?? "missing"}.`);
  assert(
    jsonValuesEqual(schema.viewport, { ...VIEWPORT, devicePixelRatio: DEVICE_SCALE_FACTOR }) &&
      jsonValuesEqual(schema.analysisSize, ANALYSIS_SIZE) &&
      schema.surfaceTime === FIXED_SURFACE_TIME &&
      schema.statsEnabled === false &&
      schema.compositionMode === "precomposed" &&
      jsonValuesEqual(schema.fixtureVisualState, BASELINE_FIXTURE_VISUAL_STATE) &&
      schema.fixtureVisualHash === BASELINE_FIXTURE_VISUAL_HASH,
    `${tier}: committed P0 baseline fixed environment is missing or changed.`
  );
  assert(
    jsonValuesEqual(schema.regions, BASELINE_REGIONS),
    `${tier}: committed P0 baseline regions do not match the frozen Gate.`
  );
  assert(
    jsonValuesEqual(schema.frozenThresholds, BASELINE_FROZEN_THRESHOLDS),
    `${tier}: committed P0 baseline thresholds do not match the frozen Gate.`
  );
  assert(
    jsonValuesEqual(Object.keys(schema.baselines ?? {}).sort(), [...BASELINE_FILES].sort()),
    `${tier}: committed P0 baseline file set is missing or changed.`
  );

  const baselines = {};
  for (const fileName of BASELINE_FILES) {
    const entry = schema.baselines[fileName];
    assert(entry?.file === fileName, `${tier}: ${fileName} baseline schema file name is missing or changed.`);
    assert(
      typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/.test(entry.sha256),
      `${tier}: ${fileName} baseline schema SHA-256 is missing or invalid.`
    );
    const localPath = resolve(tierDirectory, entry.file);
    assert(
      isInsideDirectory(localPath, tierDirectory),
      `${tier}: ${fileName} baseline resolves outside its tier directory.`
    );
    let bytes;
    try {
      bytes = await readFile(localPath);
    } catch (error) {
      throw new Error(
        `${tier}: ${fileName} committed P0 baseline is missing or unreadable at ${localPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    assert(sha256 === entry.sha256, `${tier}: ${fileName} committed P0 baseline SHA-256 does not match roi.json.`);
    baselines[fileName] = Object.freeze({
      fileName,
      localPath,
      sha256,
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`
    });
  }

  return Object.freeze({
    schemaPath,
    schemaVersion: schema.schemaVersion,
    baselines: Object.freeze(baselines)
  });
}

function sanitizeFileName(value) {
  return value
    .replaceAll(/[^a-z0-9-]+/gi, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}

function fingerprintPixels(pixels) {
  let hash = 0x811c9dc5;
  for (const value of pixels) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createTargetUrl(baseUrl, tier) {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "water-optics-lab";
  url.searchParams.set("quality", tier);
  url.searchParams.set("waterOptics", tier);
  url.searchParams.set("opticsPreset", "refraction-correctness");
  url.searchParams.set("reflection", "sky");
  url.searchParams.set("surfaceTime", String(FIXED_SURFACE_TIME));
  url.searchParams.set("stats", "0");
  url.searchParams.set("statsPanel", "hidden");
  url.searchParams.set("screenshot", "1");
  url.searchParams.set("performanceHeaded", headed ? "1" : "0");
  return url;
}

function collectBrowserDiagnostics(page) {
  const diagnostics = {
    errors: [],
    warnings: [],
    readbackWarnings: []
  };
  page.on("pageerror", (error) => diagnostics.errors.push(`[pageerror] ${error.stack ?? error.message}`));
  page.on("crash", () => diagnostics.errors.push("[page-crash] Chromium page crashed."));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") {
      diagnostics.errors.push(`[console-error] ${text}`);
      return;
    }
    if (message.type() !== "warning") return;
    if (/GPU stall due to ReadPixels/i.test(text)) {
      diagnostics.readbackWarnings.push(text);
      return;
    }
    diagnostics.warnings.push(text);
    if (
      /WebGL(?:[\s:.-]|$)|GL_INVALID_|INVALID_(?:ENUM|VALUE|OPERATION|FRAMEBUFFER_OPERATION)|framebuffer\s+(?:incomplete|invalid)|shader\s+(?:compile|link)|Could not (?:compile|link)|CONTEXT_LOST_WEBGL/i.test(
        text
      )
    ) {
      diagnostics.errors.push(`[webgl-warning] ${text}`);
    }
  });
  page.on("requestfailed", (request) => {
    diagnostics.errors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? "unknown"}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) diagnostics.errors.push(`[http-${response.status()}] ${response.url()}`);
  });
  return diagnostics;
}

async function waitForWaterOpticsReady(page) {
  await page.waitForFunction(() => window.waterPcgOptics?.ready === true, null, { timeout: 30_000 });
}

async function waitForRenderedFrames(page, frameCount = 2) {
  await page.evaluate(
    (count) =>
      new Promise((resolveFrame) => {
        let remaining = count;
        const next = () => {
          remaining--;
          if (remaining <= 0) resolveFrame();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frameCount
  );
}

async function sampleRuntimeFrames(page, frameCount) {
  return page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const samples = [];
        const next = () => {
          const metrics = window.waterPcgOptics?.metrics;
          samples.push(
            metrics
              ? {
                  reflectionSource: metrics.reflectionSource,
                  resolvedReflectionSource: metrics.resolvedReflectionSource,
                  reflectionFallbackReason: metrics.reflectionFallbackReason,
                  planarCameraCount: metrics.planarCameraCount,
                  planarRenderTargetCount: metrics.planarRenderTargetCount,
                  runtimeError: metrics.runtimeError
                }
              : null
          );
          if (samples.length >= count) resolve(samples);
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frameCount
  );
}

async function invokeOpticsApi(page, method, ...args) {
  return page.evaluate(
    async ({ methodName, methodArguments }) => {
      const api = window.waterPcgOptics;
      if (!api) throw new Error("window.waterPcgOptics is unavailable.");
      const candidate = api[methodName];
      if (typeof candidate !== "function") throw new Error(`window.waterPcgOptics.${methodName} is unavailable.`);
      return candidate.apply(api, methodArguments);
    },
    { methodName: method, methodArguments: args }
  );
}

async function readMetrics(page) {
  return page.evaluate(() => structuredClone(window.waterPcgOptics?.metrics));
}

async function readDomMetrics(page) {
  return page.evaluate(() => {
    const element = document.getElementById("water-optics-metrics");
    if (!(element instanceof HTMLDListElement)) throw new Error("Water Optics metrics DOM is unavailable.");
    return { ...element.dataset };
  });
}

async function readCanvasPixels(page, size = ANALYSIS_SIZE) {
  const result = await page.evaluate(
    ({ width, height }) =>
      new Promise((resolvePixels, rejectPixels) => {
        requestAnimationFrame(() => {
          try {
            const source = document.querySelector("canvas#canvas");
            if (!(source instanceof HTMLCanvasElement)) throw new Error("Water Optics canvas is unavailable.");
            const analysis = document.createElement("canvas");
            analysis.width = width;
            analysis.height = height;
            const context = analysis.getContext("2d", { alpha: false, colorSpace: "srgb", willReadFrequently: true });
            if (!context) throw new Error("2D analysis canvas is unavailable.");
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.drawImage(source, 0, 0, width, height);
            let imageData;
            try {
              imageData = context.getImageData(0, 0, width, height, { colorSpace: "srgb" });
            } catch {
              imageData = context.getImageData(0, 0, width, height);
            }
            const gl = source.getContext("webgl2") ?? source.getContext("webgl");
            const contextAttributes = context.getContextAttributes?.();
            let pixelBinary = "";
            const pixelBytes = imageData.data;
            for (let offset = 0; offset < pixelBytes.length; offset += 0x8000) {
              pixelBinary += String.fromCharCode(...pixelBytes.subarray(offset, offset + 0x8000));
            }
            resolvePixels({
              width,
              height,
              sourceWidth: source.width,
              sourceHeight: source.height,
              pixelsBase64: btoa(pixelBinary),
              colorSpace: {
                webglDrawingBufferColorSpace: gl?.drawingBufferColorSpace ?? "unavailable",
                canvas2dColorSpace: contextAttributes?.colorSpace ?? "srgb-default",
                imageDataColorSpace: imageData.colorSpace ?? "srgb-default"
              }
            });
          } catch (error) {
            rejectPixels(error);
          }
        });
      }),
    size
  );
  const { pixelsBase64, ...metadata } = result;
  return { ...metadata, pixels: Uint8Array.from(Buffer.from(pixelsBase64, "base64")) };
}

async function readBaselinePixels(page, committedBaseline) {
  const result = await page.evaluate(
    async ({ imageUrl, width, height }) => {
      const prefix = "data:image/png;base64,";
      if (!imageUrl.startsWith(prefix)) throw new Error("Committed baseline is not a local PNG data URL.");
      const binary = atob(imageUrl.slice(prefix.length));
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      try {
        const analysis = document.createElement("canvas");
        analysis.width = width;
        analysis.height = height;
        const context = analysis.getContext("2d", { alpha: false, colorSpace: "srgb", willReadFrequently: true });
        if (!context) throw new Error("2D baseline analysis canvas is unavailable.");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, width, height);
        let imageData;
        try {
          imageData = context.getImageData(0, 0, width, height, { colorSpace: "srgb" });
        } catch {
          imageData = context.getImageData(0, 0, width, height);
        }
        return {
          width,
          height,
          sourceWidth: bitmap.width,
          sourceHeight: bitmap.height,
          pixels: Array.from(imageData.data)
        };
      } finally {
        bitmap.close();
      }
    },
    { imageUrl: committedBaseline.dataUrl, ...ANALYSIS_SIZE }
  );
  return {
    ...result,
    pixels: Uint8Array.from(result.pixels),
    localPath: committedBaseline.localPath,
    sha256: committedBaseline.sha256
  };
}

function compareGoldenBaseline(current, baseline) {
  assert(current.width === baseline.width && current.height === baseline.height, "Golden image dimensions differ.");
  let diffPixelCount = 0;
  let maximumChannelByteDelta = 0;
  let channelByteDeltaSum = 0;
  const pixelCount = current.width * current.height;
  for (let offset = 0; offset < current.pixels.length; offset += 4) {
    let pixelDiffers = false;
    for (let channel = 0; channel < 3; channel++) {
      const channelDelta = Math.abs(current.pixels[offset + channel] - baseline.pixels[offset + channel]);
      maximumChannelByteDelta = Math.max(maximumChannelByteDelta, channelDelta);
      channelByteDeltaSum += channelDelta;
      if (channelDelta > THRESHOLDS.goldenPerChannelByteTolerance) pixelDiffers = true;
    }
    if (pixelDiffers) diffPixelCount++;
  }
  const diffPixelRatio = pixelCount === 0 ? 0 : diffPixelCount / pixelCount;
  return {
    passed: diffPixelRatio <= THRESHOLDS.goldenMaximumDiffPixelRatio,
    pixelCount,
    diffPixelCount,
    diffPixelRatio,
    maximumDiffPixelRatio: THRESHOLDS.goldenMaximumDiffPixelRatio,
    perChannelByteTolerance: THRESHOLDS.goldenPerChannelByteTolerance,
    meanAbsoluteChannelByteDelta: pixelCount === 0 ? 0 : channelByteDeltaSum / (pixelCount * 3),
    maximumChannelByteDelta,
    currentFingerprint: fingerprintPixels(current.pixels),
    baselineFingerprint: fingerprintPixels(baseline.pixels),
    baselineTransport: "sha256-verified-local-data-url",
    baselineSha256: baseline.sha256,
    baselineSourceSize: { width: baseline.sourceWidth, height: baseline.sourceHeight }
  };
}

async function createP0BaselineReviewArtifact(page, tier, fileName, capture, committedBaseline, comparison) {
  const reviewDirectory = resolve(outputDirectory, "baseline-review", tier, fileName.replace(/\.png$/i, ""));
  await mkdir(reviewDirectory, { recursive: true });
  const oldPath = resolve(reviewDirectory, "old.png");
  const nextPath = resolve(reviewDirectory, "new.png");
  const diffPath = resolve(reviewDirectory, "diff.png");
  const metadataPath = resolve(reviewDirectory, "review.json");
  const oldBytes = Buffer.from(committedBaseline.dataUrl.slice(committedBaseline.dataUrl.indexOf(",") + 1), "base64");
  const nextBytes = await readFile(capture.summary.screenshotPath);
  await writeFile(oldPath, oldBytes);
  await writeFile(nextPath, nextBytes);
  const nextDataUrl = `data:image/png;base64,${nextBytes.toString("base64")}`;
  const diffDataUrl = await page.evaluate(
    async ({ oldDataUrl, nextDataUrl }) => {
      const oldImage = new Image();
      oldImage.src = oldDataUrl;
      const nextImage = new Image();
      nextImage.src = nextDataUrl;
      await Promise.all([oldImage.decode(), nextImage.decode()]);
      if (oldImage.naturalWidth !== nextImage.naturalWidth || oldImage.naturalHeight !== nextImage.naturalHeight) {
        throw new Error("P0 baseline review images have different dimensions.");
      }
      const width = nextImage.naturalWidth;
      const height = nextImage.naturalHeight;
      const makeCanvas = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
      };
      const oldCanvas = makeCanvas();
      const nextCanvas = makeCanvas();
      const diffCanvas = makeCanvas();
      const oldContext = oldCanvas.getContext("2d", { willReadFrequently: true });
      const nextContext = nextCanvas.getContext("2d", { willReadFrequently: true });
      const diffContext = diffCanvas.getContext("2d");
      if (!oldContext || !nextContext || !diffContext) throw new Error("P0 baseline review canvas is unavailable.");
      oldContext.drawImage(oldImage, 0, 0);
      nextContext.drawImage(nextImage, 0, 0);
      const oldPixels = oldContext.getImageData(0, 0, width, height).data;
      const nextPixels = nextContext.getImageData(0, 0, width, height).data;
      const diffImage = diffContext.createImageData(width, height);
      for (let offset = 0; offset < oldPixels.length; offset += 4) {
        diffImage.data[offset] = Math.min(255, Math.abs(nextPixels[offset] - oldPixels[offset]) * 4);
        diffImage.data[offset + 1] = Math.min(255, Math.abs(nextPixels[offset + 1] - oldPixels[offset + 1]) * 4);
        diffImage.data[offset + 2] = Math.min(255, Math.abs(nextPixels[offset + 2] - oldPixels[offset + 2]) * 4);
        diffImage.data[offset + 3] = 255;
      }
      diffContext.putImageData(diffImage, 0, 0);
      return diffCanvas.toDataURL("image/png");
    },
    { oldDataUrl: committedBaseline.dataUrl, nextDataUrl }
  );
  const diffBytes = Buffer.from(diffDataUrl.slice(diffDataUrl.indexOf(",") + 1), "base64");
  await writeFile(diffPath, diffBytes);
  const review = {
    schemaVersion: 1,
    gate: "water-optics-p0-baseline-review",
    tier,
    fileName,
    reason: BASELINE_REVIEW_REASON,
    oldPath,
    newPath: nextPath,
    diffPath,
    oldSha256: committedBaseline.sha256,
    newSha256: createHash("sha256").update(nextBytes).digest("hex"),
    diffSha256: createHash("sha256").update(diffBytes).digest("hex"),
    comparison
  };
  await writeFile(metadataPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  return review;
}

async function verifyGoldenBaseline(page, tier, committedBaselines, fileName, capture) {
  const committedBaseline = committedBaselines.baselines[fileName];
  assert(committedBaseline, `${tier}: ${fileName} was not loaded by the local baseline preflight.`);
  const baseline = await readBaselinePixels(page, committedBaseline);
  assert(
    baseline.sourceWidth === VIEWPORT.width && baseline.sourceHeight === VIEWPORT.height,
    `${tier}: ${fileName} baseline is ${baseline.sourceWidth}x${baseline.sourceHeight}, expected ${VIEWPORT.width}x${VIEWPORT.height}.`
  );
  const comparison = {
    fileName,
    localPath: committedBaseline.localPath,
    ...compareGoldenBaseline(capture.image, baseline)
  };
  return {
    ...comparison,
    review:
      BASELINE_REVIEW_REASON.length > 0
        ? await createP0BaselineReviewArtifact(page, tier, fileName, capture, committedBaseline, comparison)
        : undefined
  };
}

function summarizeMetrics(metrics) {
  if (!metrics) return null;
  return {
    ready: metrics.ready,
    requestedTier: metrics.requestedTier,
    resolvedTier: metrics.resolvedTier,
    fallbackReason: metrics.fallbackReason,
    cameraPreset: metrics.cameraPreset,
    waterBody: metrics.waterBody,
    opticsMetricConsumerId: metrics.opticsMetricConsumerId,
    reflectionMode: metrics.reflectionMode,
    reflectionSource: metrics.reflectionSource,
    resolvedReflectionSource: metrics.resolvedReflectionSource,
    reflectionFallbackReason: metrics.reflectionFallbackReason,
    refractionEnabled: metrics.refractionEnabled,
    compositionMode: metrics.compositionMode,
    depthWriteEnabled: metrics.depthWriteEnabled,
    waterRendererPriority: metrics.waterRendererPriority,
    activeWaterRendererPriority: metrics.activeWaterRendererPriority,
    waterBlendEnabled: metrics.waterBlendEnabled,
    transparentOrderingProbeMode: metrics.transparentOrderingProbeMode,
    transparentSentinelPriority: metrics.transparentSentinelPriority,
    transparentSentinelNormalPriority: metrics.transparentSentinelNormalPriority,
    transparentSentinelTransparent: metrics.transparentSentinelTransparent,
    transparentOrderingContractSatisfied: metrics.transparentOrderingContractSatisfied,
    transparentOrderingProbeWaterFirst: metrics.transparentOrderingProbeWaterFirst,
    planarClipEnabled: metrics.planarClipEnabled,
    debugView: metrics.debugView,
    calibrationMode: metrics.calibrationMode,
    calibrationFeatureFlags: metrics.calibrationFeatureFlags,
    calibrationReferenceCompositionEnabled: metrics.calibrationReferenceCompositionEnabled,
    calibrationEffectiveFresnelOverride: metrics.calibrationEffectiveFresnelOverride,
    calibrationOpticalProfile: metrics.calibrationOpticalProfile,
    opticalDepthNormalizationMeters: metrics.opticalDepthNormalizationMeters,
    planarAnchorVisible: metrics.planarAnchorVisible,
    planarOrientationMarkersVisible: metrics.planarOrientationMarkersVisible,
    localFoamMaskEnabled: metrics.localFoamMaskEnabled,
    localFoamMaskCenterXZ: metrics.localFoamMaskCenterXZ,
    localFoamMaskHalfSizeXZ: metrics.localFoamMaskHalfSizeXZ,
    localFoamMaskFeatherMeters: metrics.localFoamMaskFeatherMeters,
    localFoamMaskSuppressesRefraction: metrics.localFoamMaskSuppressesRefraction,
    reflectorMovementEnabled: metrics.reflectorMovementEnabled,
    reflectorVisible: metrics.reflectorVisible,
    reflectorTimeOverrideActive: metrics.reflectorTimeOverrideActive,
    reflectorAnimating: metrics.reflectorAnimating,
    reflectorTime: metrics.reflectorTime,
    reflectorWorldPosition: metrics.reflectorWorldPosition,
    cameraMovementEnabled: metrics.cameraMovementEnabled,
    freeCameraEnabled: metrics.freeCameraEnabled,
    cameraWorldPosition: metrics.cameraWorldPosition,
    cameraWorldForward: metrics.cameraWorldForward,
    cameraCutCount: metrics.cameraCutCount,
    frozen: metrics.frozen,
    surfaceTime: metrics.surfaceTime,
    statsEnabled: metrics.statsEnabled,
    cameraDepthCopyPassCount: metrics.cameraDepthCopyPassCount,
    cameraOpaqueCopyPassCount: metrics.cameraOpaqueCopyPassCount,
    planarOwnerId: metrics.planarOwnerId,
    planarCameraCount: metrics.planarCameraCount,
    planarRenderTargetCount: metrics.planarRenderTargetCount,
    planarRenderTargetBytes: metrics.planarRenderTargetBytes,
    waterLayerMask: metrics.waterLayerMask,
    planarCameraCullingMask: metrics.planarCameraCullingMask,
    waterLayerExcludedFromPlanar: metrics.waterLayerExcludedFromPlanar,
    probeTextureAvailable: metrics.probeTextureAvailable,
    probeTextureBound: metrics.probeTextureBound,
    probeResourceBytes: metrics.probeResourceBytes,
    probeFaceHashes: metrics.probeFaceHashes,
    probeProvenance: metrics.probeProvenance,
    engineTextureBytes: metrics.engineTextureBytes,
    engineBufferBytes: metrics.engineBufferBytes,
    engineTotalBytes: metrics.engineTotalBytes,
    runtimeError: metrics.runtimeError
  };
}

async function captureState(page, tierDirectory, label, expectedDebugView, analysisSize = ANALYSIS_SIZE) {
  await waitForRenderedFrames(page, 2);
  const image = await readCanvasPixels(page, analysisSize);
  const metrics = await readMetrics(page);
  const domMetrics = await readDomMetrics(page);
  const screenshotPath = resolve(tierDirectory, `${sanitizeFileName(label)}.png`);
  await page.locator("canvas#canvas").screenshot({ animations: "disabled", path: screenshotPath });
  return {
    image,
    metrics,
    domMetrics,
    summary: {
      label,
      screenshotPath,
      analysisWidth: image.width,
      analysisHeight: image.height,
      sourceWidth: image.sourceWidth,
      sourceHeight: image.sourceHeight,
      pixelFingerprint: fingerprintPixels(image.pixels),
      expectedDebugView,
      observedDebugView: metrics?.debugView,
      metrics: summarizeMetrics(metrics)
    }
  };
}

function roiBounds(rect, width, height) {
  const [x, y, roiWidth, roiHeight] = rect;
  return {
    x0: Math.max(0, Math.floor(x * width)),
    y0: Math.max(0, Math.floor(y * height)),
    x1: Math.min(width, Math.ceil((x + roiWidth) * width)),
    y1: Math.min(height, Math.ceil((y + roiHeight) * height))
  };
}

function forEachRoiPixel(image, rects, callback) {
  for (const rect of rects) {
    const bounds = roiBounds(rect, image.width, image.height);
    for (let y = bounds.y0; y < bounds.y1; y++) {
      for (let x = bounds.x0; x < bounds.x1; x++) callback((y * image.width + x) * 4, x, y);
    }
  }
}

function countRoiPixels(image, rects) {
  let count = 0;
  forEachRoiPixel(image, rects, () => count++);
  return count;
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

const SRGB_BYTE_TO_LINEAR = Object.freeze(Array.from({ length: 256 }, (_, value) => srgbToLinear(value / 255)));

function percentile(sortedValues, quantile) {
  if (sortedValues.length === 0) return 0;
  const index = Math.max(0, Math.ceil(sortedValues.length * quantile) - 1);
  return sortedValues[index];
}

function readLinearRgb(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [
    SRGB_BYTE_TO_LINEAR[image.pixels[offset]],
    SRGB_BYTE_TO_LINEAR[image.pixels[offset + 1]],
    SRGB_BYTE_TO_LINEAR[image.pixels[offset + 2]]
  ];
}

function createErodedValidityMask(image, rects, minimumValidity) {
  const sourceMask = new Uint8Array(image.width * image.height);
  const erodedMask = new Uint8Array(sourceMask.length);
  forEachRoiPixel(image, rects, (offset, x, y) => {
    if (SRGB_BYTE_TO_LINEAR[image.pixels[offset]] >= minimumValidity) {
      sourceMask[y * image.width + x] = 1;
    }
  });
  let validPixelCount = 0;
  forEachRoiPixel(image, rects, (_offset, x, y) => {
    if (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1) return;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (sourceMask[(y + dy) * image.width + x + dx] === 0) return;
      }
    }
    erodedMask[y * image.width + x] = 1;
    validPixelCount++;
  });
  return { mask: erodedMask, validPixelCount, minimumValidity, erosionRadiusPixels: 1 };
}

function compareMaskedLinearImages(left, right, mask) {
  assert(left.width === right.width && left.height === right.height, "Masked image dimensions differ.");
  assert(mask.length === left.width * left.height, "Masked image validity size differs.");
  let pixelCount = 0;
  let channelDifferenceSum = 0;
  let maximumChannelError = 0;
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] === 0) continue;
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel++) {
      const error = Math.abs(
        SRGB_BYTE_TO_LINEAR[left.pixels[offset + channel]] - SRGB_BYTE_TO_LINEAR[right.pixels[offset + channel]]
      );
      channelDifferenceSum += error;
      maximumChannelError = Math.max(maximumChannelError, error);
    }
    pixelCount++;
  }
  return {
    pixelCount,
    meanAbsoluteChannel: pixelCount === 0 ? Number.POSITIVE_INFINITY : channelDifferenceSum / (pixelCount * 3),
    maximumChannelError
  };
}

function analyzeMaskedScalar(image, mask) {
  assert(mask.length === image.width * image.height, "Scalar image validity size differs.");
  let pixelCount = 0;
  let sum = 0;
  let maximum = 0;
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] === 0) continue;
    const value = SRGB_BYTE_TO_LINEAR[image.pixels[index * 4]];
    sum += value;
    maximum = Math.max(maximum, value);
    pixelCount++;
  }
  return { pixelCount, mean: pixelCount === 0 ? Number.POSITIVE_INFINITY : sum / pixelCount, maximum };
}

function findNearestValidPixel(mask, width, height, normalizedPoint) {
  const targetX = normalizedPoint[0] * (width - 1);
  const targetY = normalizedPoint[1] * (height - 1);
  let best;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) continue;
      const distanceSquared = (x - targetX) ** 2 + (y - targetY) ** 2;
      if (!best || distanceSquared < best.distanceSquared) best = { x, y, distanceSquared };
    }
  }
  return best ? { ...best, distancePixels: Math.sqrt(best.distanceSquared) } : undefined;
}

function analyzePlanarGreenAnchor(reference, planar, expectedPixel) {
  assert(reference.width === planar.width && reference.height === planar.height, "Planar anchor images differ.");
  const radius = THRESHOLDS.planarAnchorSearchRadiusPixels;
  const x0 = Math.max(0, Math.floor(expectedPixel.x - radius));
  const y0 = Math.max(0, Math.floor(expectedPixel.y - radius));
  const x1 = Math.min(planar.width - 1, Math.ceil(expectedPixel.x + radius));
  const y1 = Math.min(planar.height - 1, Math.ceil(expectedPixel.y + radius));
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;
  let significantPixelCount = 0;
  let maximumGreenAdvantageByte = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const offset = (y * planar.width + x) * 4;
      const redDelta = planar.pixels[offset] - reference.pixels[offset];
      const greenDelta = planar.pixels[offset + 1] - reference.pixels[offset + 1];
      const blueDelta = planar.pixels[offset + 2] - reference.pixels[offset + 2];
      const greenAdvantage = greenDelta - Math.max(0, redDelta, blueDelta);
      maximumGreenAdvantageByte = Math.max(maximumGreenAdvantageByte, greenAdvantage);
      if (greenAdvantage < THRESHOLDS.planarAnchorMinimumGreenAdvantageByte) continue;
      weightedX += x * greenAdvantage;
      weightedY += y * greenAdvantage;
      totalWeight += greenAdvantage;
      significantPixelCount++;
    }
  }
  const observedPixel = totalWeight > 0 ? { x: weightedX / totalWeight, y: weightedY / totalWeight } : undefined;
  const errorPixels = observedPixel
    ? Math.hypot(observedPixel.x - expectedPixel.x, observedPixel.y - expectedPixel.y)
    : Number.POSITIVE_INFINITY;
  return {
    expectedPixel,
    observedPixel,
    errorPixels,
    maximumErrorPixels: THRESHOLDS.planarAnchorMaximumErrorPixels,
    searchRadiusPixels: radius,
    searchBounds: { x0, y0, x1, y1 },
    minimumGreenAdvantageByte: THRESHOLDS.planarAnchorMinimumGreenAdvantageByte,
    maximumGreenAdvantageByte,
    significantPixelCount,
    totalWeight,
    passed: significantPixelCount > 0 && errorPixels <= THRESHOLDS.planarAnchorMaximumErrorPixels
  };
}

function planarOrientationColorAdvantage(orientation, redDelta, greenDelta, blueDelta) {
  const red = Math.max(0, redDelta);
  const green = Math.max(0, greenDelta);
  const blue = Math.max(0, blueDelta);
  switch (orientation) {
    case "left":
      return red - Math.max(green, blue);
    case "right":
      return Math.min(green, blue) - red;
    case "up":
      return Math.min(red, green) - blue;
    case "down":
      return Math.min(red, blue) - green;
    default:
      throw new Error(`Unknown Planar orientation marker ${orientation}.`);
  }
}

function analyzePlanarOrientationMarker(
  reference,
  visible,
  expectedPixel,
  orientation,
  maximumExpectedPointErrorPixels
) {
  assert(reference.width === visible.width && reference.height === visible.height, "Planar marker images differ.");
  const radius = THRESHOLDS.planarOrientationSearchRadiusPixels;
  const x0 = Math.max(0, Math.floor(expectedPixel.x - radius));
  const y0 = Math.max(0, Math.floor(expectedPixel.y - radius));
  const x1 = Math.min(visible.width - 1, Math.ceil(expectedPixel.x + radius));
  const y1 = Math.min(visible.height - 1, Math.ceil(expectedPixel.y + radius));
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;
  let significantPixelCount = 0;
  let maximumColorAdvantageByte = 0;
  let nearestExpectedPixel;
  let nearestExpectedErrorPixels = Number.POSITIVE_INFINITY;
  let minimumSignificantX = Number.POSITIVE_INFINITY;
  let minimumSignificantY = Number.POSITIVE_INFINITY;
  let maximumSignificantX = Number.NEGATIVE_INFINITY;
  let maximumSignificantY = Number.NEGATIVE_INFINITY;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const offset = (y * visible.width + x) * 4;
      const advantage = planarOrientationColorAdvantage(
        orientation,
        visible.pixels[offset] - reference.pixels[offset],
        visible.pixels[offset + 1] - reference.pixels[offset + 1],
        visible.pixels[offset + 2] - reference.pixels[offset + 2]
      );
      maximumColorAdvantageByte = Math.max(maximumColorAdvantageByte, advantage);
      if (advantage < THRESHOLDS.planarOrientationMinimumColorAdvantageByte) continue;
      weightedX += x * advantage;
      weightedY += y * advantage;
      totalWeight += advantage;
      significantPixelCount++;
      minimumSignificantX = Math.min(minimumSignificantX, x);
      minimumSignificantY = Math.min(minimumSignificantY, y);
      maximumSignificantX = Math.max(maximumSignificantX, x);
      maximumSignificantY = Math.max(maximumSignificantY, y);
      const expectedPointErrorPixels = Math.hypot(x - expectedPixel.x, y - expectedPixel.y);
      if (expectedPointErrorPixels < nearestExpectedErrorPixels) {
        nearestExpectedPixel = { x, y };
        nearestExpectedErrorPixels = expectedPointErrorPixels;
      }
    }
  }
  const observedPixel = totalWeight > 0 ? { x: weightedX / totalWeight, y: weightedY / totalWeight } : undefined;
  const errorPixels = observedPixel
    ? Math.hypot(observedPixel.x - expectedPixel.x, observedPixel.y - expectedPixel.y)
    : Number.POSITIVE_INFINITY;
  const significantBounds =
    significantPixelCount > 0
      ? {
          x0: minimumSignificantX,
          y0: minimumSignificantY,
          x1: maximumSignificantX,
          y1: maximumSignificantY
        }
      : undefined;
  const significantBoundsCenter = significantBounds
    ? {
        x: (significantBounds.x0 + significantBounds.x1) * 0.5,
        y: (significantBounds.y0 + significantBounds.y1) * 0.5
      }
    : undefined;
  const significantBoundsCenterErrorPixels = significantBoundsCenter
    ? Math.hypot(significantBoundsCenter.x - expectedPixel.x, significantBoundsCenter.y - expectedPixel.y)
    : Number.POSITIVE_INFINITY;
  // The fixed foreground rail can cover the projected marker center. Accept exact visible support, its weighted
  // centroid, or the center of the split visible silhouette, while keeping the same 3 px CPU-reference bound.
  const expectedPointAlignmentCandidates = [
    ["visible-support", nearestExpectedErrorPixels],
    ["weighted-centroid", errorPixels],
    ["visible-support-bounds", significantBoundsCenterErrorPixels]
  ];
  const [expectedPointAlignmentMethod, expectedPointAlignmentErrorPixels] = expectedPointAlignmentCandidates.reduce(
    (best, candidate) => (candidate[1] < best[1] ? candidate : best)
  );
  return {
    orientation,
    expectedPixel,
    observedPixel,
    errorPixels,
    nearestExpectedPixel,
    nearestExpectedErrorPixels,
    significantBounds,
    significantBoundsCenter,
    significantBoundsCenterErrorPixels,
    expectedPointAlignmentMethod,
    expectedPointAlignmentErrorPixels,
    maximumExpectedPointErrorPixels,
    searchRadiusPixels: radius,
    searchBounds: { x0, y0, x1, y1 },
    minimumColorAdvantageByte: THRESHOLDS.planarOrientationMinimumColorAdvantageByte,
    maximumColorAdvantageByte,
    significantPixelCount,
    totalWeight,
    passed:
      significantPixelCount >= THRESHOLDS.planarOrientationMinimumSignificantPixelCount &&
      maximumColorAdvantageByte >= THRESHOLDS.planarOrientationMinimumColorAdvantageByte &&
      expectedPointAlignmentErrorPixels <= maximumExpectedPointErrorPixels
  };
}

function hasMatchingOrientationOrder(expectedPoints, observedPoints) {
  const expectedHorizontal = Math.sign(expectedPoints.left.x - expectedPoints.right.x);
  const observedHorizontal = Math.sign(observedPoints.left.x - observedPoints.right.x);
  const expectedVertical = Math.sign(expectedPoints.up.y - expectedPoints.down.y);
  const observedVertical = Math.sign(observedPoints.up.y - observedPoints.down.y);
  return (
    expectedHorizontal !== 0 &&
    expectedVertical !== 0 &&
    observedHorizontal === expectedHorizontal &&
    observedVertical === expectedVertical
  );
}

function compareImages(left, right, rects, leakThreshold = THRESHOLDS.foregroundRailLeakDelta) {
  assert(left.width === right.width && left.height === right.height, "Image dimensions differ.");
  let pixelCount = 0;
  let rawChannelSum = 0;
  let linearChannelSum = 0;
  let rawMaximum = 0;
  let linearMaximum = 0;
  let leakPixelCount = 0;
  const rawPixelMaximums = [];
  const linearPixelMaximums = [];
  forEachRoiPixel(left, rects, (offset) => {
    let rawPixelMaximum = 0;
    let linearPixelMaximum = 0;
    for (let channel = 0; channel < 3; channel++) {
      const leftByte = left.pixels[offset + channel];
      const rightByte = right.pixels[offset + channel];
      const rawDifference = Math.abs(leftByte - rightByte) / 255;
      const linearDifference = Math.abs(SRGB_BYTE_TO_LINEAR[leftByte] - SRGB_BYTE_TO_LINEAR[rightByte]);
      rawChannelSum += rawDifference;
      linearChannelSum += linearDifference;
      rawPixelMaximum = Math.max(rawPixelMaximum, rawDifference);
      linearPixelMaximum = Math.max(linearPixelMaximum, linearDifference);
    }
    rawMaximum = Math.max(rawMaximum, rawPixelMaximum);
    linearMaximum = Math.max(linearMaximum, linearPixelMaximum);
    rawPixelMaximums.push(rawPixelMaximum);
    linearPixelMaximums.push(linearPixelMaximum);
    if (linearPixelMaximum > leakThreshold) leakPixelCount++;
    pixelCount++;
  });
  rawPixelMaximums.sort((leftValue, rightValue) => leftValue - rightValue);
  linearPixelMaximums.sort((leftValue, rightValue) => leftValue - rightValue);
  return {
    pixelCount,
    rawSrgbEncoded: {
      meanAbsoluteChannel: pixelCount === 0 ? 0 : rawChannelSum / (pixelCount * 3),
      p95MaximumChannel: percentile(rawPixelMaximums, 0.95),
      maximumChannel: rawMaximum
    },
    srgbDecodedLinear: {
      meanAbsoluteChannel: pixelCount === 0 ? 0 : linearChannelSum / (pixelCount * 3),
      p95MaximumChannel: percentile(linearPixelMaximums, 0.95),
      maximumChannel: linearMaximum
    },
    leakThreshold,
    leakPixelCount,
    leakPixelRatio: pixelCount === 0 ? 0 : leakPixelCount / pixelCount
  };
}

function analyzeAlphaImage(image, rects) {
  let pixelCount = 0;
  let rawMeanSum = 0;
  let linearMeanSum = 0;
  const rawChroma = [];
  const linearChroma = [];
  forEachRoiPixel(image, rects, (offset) => {
    const raw = [image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]].map((value) => value / 255);
    const linear = [
      SRGB_BYTE_TO_LINEAR[image.pixels[offset]],
      SRGB_BYTE_TO_LINEAR[image.pixels[offset + 1]],
      SRGB_BYTE_TO_LINEAR[image.pixels[offset + 2]]
    ];
    rawMeanSum += (raw[0] + raw[1] + raw[2]) / 3;
    linearMeanSum += (linear[0] + linear[1] + linear[2]) / 3;
    rawChroma.push(Math.max(...raw) - Math.min(...raw));
    linearChroma.push(Math.max(...linear) - Math.min(...linear));
    pixelCount++;
  });
  rawChroma.sort((left, right) => left - right);
  linearChroma.sort((left, right) => left - right);
  return {
    pixelCount,
    rawSrgbEncoded: {
      mean: pixelCount === 0 ? 0 : rawMeanSum / pixelCount,
      chromaP95: percentile(rawChroma, 0.95)
    },
    srgbDecodedLinear: {
      mean: pixelCount === 0 ? 0 : linearMeanSum / pixelCount,
      chromaP95: percentile(linearChroma, 0.95)
    }
  };
}

function analyzeChannelMeans(image, rects, channel) {
  return rects.map((rect) => {
    let pixelCount = 0;
    let rawSum = 0;
    let linearSum = 0;
    forEachRoiPixel(image, [rect], (offset) => {
      const value = image.pixels[offset + channel];
      rawSum += value / 255;
      linearSum += SRGB_BYTE_TO_LINEAR[value];
      pixelCount++;
    });
    return {
      pixelCount,
      rawSrgbEncodedMean: pixelCount === 0 ? 0 : rawSum / pixelCount,
      srgbDecodedLinearMean: pixelCount === 0 ? 0 : linearSum / pixelCount
    };
  });
}

function analyzeDebugRoiSignal(image, rects) {
  let pixelCount = 0;
  let nonBlackPixelCount = 0;
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let minimumLuminance = Number.POSITIVE_INFINITY;
  let maximumLuminance = Number.NEGATIVE_INFINITY;
  forEachRoiPixel(image, rects, (offset) => {
    const luminance =
      SRGB_BYTE_TO_LINEAR[image.pixels[offset]] * 0.2126 +
      SRGB_BYTE_TO_LINEAR[image.pixels[offset + 1]] * 0.7152 +
      SRGB_BYTE_TO_LINEAR[image.pixels[offset + 2]] * 0.0722;
    if (luminance > 1 / 255) nonBlackPixelCount++;
    luminanceSum += luminance;
    luminanceSquaredSum += luminance * luminance;
    minimumLuminance = Math.min(minimumLuminance, luminance);
    maximumLuminance = Math.max(maximumLuminance, luminance);
    pixelCount++;
  });
  const mean = pixelCount === 0 ? 0 : luminanceSum / pixelCount;
  return {
    pixelCount,
    nonBlackPixelCount,
    nonBlackPixelRatio: pixelCount === 0 ? 0 : nonBlackPixelCount / pixelCount,
    meanLuminance: mean,
    luminanceVariance: pixelCount === 0 ? 0 : luminanceSquaredSum / pixelCount - mean * mean,
    luminanceRange: pixelCount === 0 ? 0 : maximumLuminance - minimumLuminance
  };
}

function analyzeDominantColorCoverage(image, rects, channel) {
  let roiPixelCount = 0;
  let dominantPixelCount = 0;
  forEachRoiPixel(image, rects, (offset) => {
    const primary = image.pixels[offset + channel];
    const secondaryA = image.pixels[offset + ((channel + 1) % 3)];
    const secondaryB = image.pixels[offset + ((channel + 2) % 3)];
    if (primary >= 64 && primary - Math.max(secondaryA, secondaryB) >= 20) dominantPixelCount++;
    roiPixelCount++;
  });
  return {
    roiPixelCount,
    dominantPixelCount,
    coverage: roiPixelCount === 0 ? 0 : dominantPixelCount / roiPixelCount
  };
}

function analyzeComposition(images, rects) {
  const { B, D, C, A, F } = images;
  for (const image of [D, C, A, F]) {
    assert(B.width === image.width && B.height === image.height, "Composition image dimensions differ.");
  }
  const rawPredictionErrors = [];
  const rawTargetErrors = [];
  const rawDisplacedErrors = [];
  const linearPredictionErrors = [];
  const linearTargetErrors = [];
  const linearDisplacedErrors = [];
  forEachRoiPixel(B, rects, (offset) => {
    const alphaRaw = (A.pixels[offset] + A.pixels[offset + 1] + A.pixels[offset + 2]) / (3 * 255);
    const alphaLinear =
      (SRGB_BYTE_TO_LINEAR[A.pixels[offset]] +
        SRGB_BYTE_TO_LINEAR[A.pixels[offset + 1]] +
        SRGB_BYTE_TO_LINEAR[A.pixels[offset + 2]]) /
      3;
    let rawPredictionError = 0;
    let rawTargetError = 0;
    let rawDisplacedError = 0;
    let linearPredictionError = 0;
    let linearTargetError = 0;
    let linearDisplacedError = 0;
    for (let channel = 0; channel < 3; channel++) {
      const backgroundRaw = B.pixels[offset + channel] / 255;
      const displacedRaw = D.pixels[offset + channel] / 255;
      const compositedRaw = C.pixels[offset + channel] / 255;
      const framebufferRaw = F.pixels[offset + channel] / 255;
      const predictedRaw = alphaRaw * compositedRaw + (1 - alphaRaw) * backgroundRaw;
      rawPredictionError = Math.max(rawPredictionError, Math.abs(framebufferRaw - predictedRaw));
      rawTargetError = Math.max(rawTargetError, Math.abs(framebufferRaw - compositedRaw));
      rawDisplacedError = Math.max(rawDisplacedError, Math.abs(displacedRaw - compositedRaw));

      const backgroundLinear = SRGB_BYTE_TO_LINEAR[B.pixels[offset + channel]];
      const displacedLinear = SRGB_BYTE_TO_LINEAR[D.pixels[offset + channel]];
      const compositedLinear = SRGB_BYTE_TO_LINEAR[C.pixels[offset + channel]];
      const framebufferLinear = SRGB_BYTE_TO_LINEAR[F.pixels[offset + channel]];
      const predictedLinear = alphaLinear * compositedLinear + (1 - alphaLinear) * backgroundLinear;
      linearPredictionError = Math.max(linearPredictionError, Math.abs(framebufferLinear - predictedLinear));
      linearTargetError = Math.max(linearTargetError, Math.abs(framebufferLinear - compositedLinear));
      linearDisplacedError = Math.max(linearDisplacedError, Math.abs(displacedLinear - compositedLinear));
    }
    rawPredictionErrors.push(rawPredictionError);
    rawTargetErrors.push(rawTargetError);
    rawDisplacedErrors.push(rawDisplacedError);
    linearPredictionErrors.push(linearPredictionError);
    linearTargetErrors.push(linearTargetError);
    linearDisplacedErrors.push(linearDisplacedError);
  });
  for (const values of [
    rawPredictionErrors,
    rawTargetErrors,
    rawDisplacedErrors,
    linearPredictionErrors,
    linearTargetErrors,
    linearDisplacedErrors
  ]) {
    values.sort((left, right) => left - right);
  }
  return {
    pixelCount: rawPredictionErrors.length,
    rawSrgbEncoded: {
      predictionErrorP95: percentile(rawPredictionErrors, 0.95),
      targetErrorP95: percentile(rawTargetErrors, 0.95),
      displacedToTargetErrorP95: percentile(rawDisplacedErrors, 0.95)
    },
    srgbDecodedLinear: {
      predictionErrorP95: percentile(linearPredictionErrors, 0.95),
      targetErrorP95: percentile(linearTargetErrors, 0.95),
      displacedToTargetErrorP95: percentile(linearDisplacedErrors, 0.95)
    }
  };
}

function analyzeCompositionPixel(images, calibrationPoint) {
  const { B, D, C, A, F } = images;
  const x = Math.min(B.width - 1, Math.max(0, Math.floor(calibrationPoint.normalized[0] * B.width)));
  const y = Math.min(B.height - 1, Math.max(0, Math.floor(calibrationPoint.normalized[1] * B.height)));
  const offset = (y * B.width + x) * 4;
  const analyzeEncoding = (decode) => {
    const background = [0, 1, 2].map((channel) => decode(B.pixels[offset + channel]));
    const displaced = [0, 1, 2].map((channel) => decode(D.pixels[offset + channel]));
    const composited = [0, 1, 2].map((channel) => decode(C.pixels[offset + channel]));
    const framebuffer = [0, 1, 2].map((channel) => decode(F.pixels[offset + channel]));
    const alpha = (decode(A.pixels[offset]) + decode(A.pixels[offset + 1]) + decode(A.pixels[offset + 2])) / 3;
    const predicted = composited.map((channel, index) => alpha * channel + (1 - alpha) * background[index]);
    return {
      centeredOpaqueColor: background,
      displacedOpaqueColor: displaced,
      shaderCompositedColor: composited,
      surfaceAlpha: alpha,
      finalFramebufferColor: framebuffer,
      predictedLegacyFramebufferColor: predicted,
      predictionError: Math.max(...framebuffer.map((channel, index) => Math.abs(channel - predicted[index]))),
      targetError: Math.max(...framebuffer.map((channel, index) => Math.abs(channel - composited[index]))),
      displacedToTargetError: Math.max(...displaced.map((channel, index) => Math.abs(channel - composited[index])))
    };
  };
  return {
    normalized: calibrationPoint.normalized,
    analysisPixel: { x, y },
    rationale: calibrationPoint.rationale,
    stableInterior: true,
    rawSrgbEncoded: analyzeEncoding((value) => value / 255),
    srgbDecodedLinear: analyzeEncoding((value) => SRGB_BYTE_TO_LINEAR[value])
  };
}

function decideComposition(legacyAnalysis, legacyPixel, precomposedDepthOff, precomposedDepthOn, edgeHalo) {
  const pixelLinear = legacyPixel.srgbDecodedLinear;
  const precomposedDepthOffMatches =
    precomposedDepthOff.srgbDecodedLinear.p95MaximumChannel <= THRESHOLDS.compositionTargetMatchMaximumError;
  const precomposedDepthOnMatches =
    precomposedDepthOn.srgbDecodedLinear.p95MaximumChannel <= THRESHOLDS.compositionTargetMatchMaximumError;
  if (
    pixelLinear.predictionError <= THRESHOLDS.compositionPredictionMaximumError &&
    pixelLinear.targetError > THRESHOLDS.compositionTargetConfirmationMinimumError &&
    precomposedDepthOffMatches &&
    precomposedDepthOnMatches &&
    !edgeHalo
  ) {
    return {
      decision: "repeated-background-confirmed",
      selectedMode: "precomposed",
      reason: "At the frozen interior pixel, linear F matches A*C + (1-A)*B and materially differs from C."
    };
  }
  const linear = legacyAnalysis.srgbDecodedLinear;
  if (
    linear.predictionErrorP95 <= THRESHOLDS.compositionPredictionMaximumError &&
    linear.targetErrorP95 > THRESHOLDS.compositionTargetConfirmationMinimumError &&
    precomposedDepthOffMatches &&
    precomposedDepthOnMatches &&
    !edgeHalo
  ) {
    return {
      decision: "repeated-background-confirmed",
      selectedMode: "precomposed",
      reason: "Linear F matches A*C + (1-A)*B and materially differs from C at the frozen P0 thresholds."
    };
  }
  if (linear.targetErrorP95 <= THRESHOLDS.compositionTargetMatchMaximumError && !edgeHalo) {
    return {
      decision: "legacy-target-confirmed",
      selectedMode: "legacy",
      reason: "Linear F matches C at the frozen P0 threshold and the external edge checks found no halo."
    };
  }
  if (
    linear.targetErrorP95 > THRESHOLDS.compositionTargetConfirmationMinimumError &&
    precomposedDepthOffMatches &&
    precomposedDepthOnMatches &&
    !edgeHalo
  ) {
    return {
      decision: "precomposed-target-confirmed",
      selectedMode: "precomposed",
      reason:
        "Legacy F materially misses C, while precomposed-replace matches C with both depth-write states at the frozen threshold."
    };
  }
  return {
    decision: "inconclusive",
    selectedMode: null,
    reason: "The stable ROI does not meet either frozen P0 composition decision rule."
  };
}

function countBorderSentinels(image) {
  const categories = { transparent: 0, black: 0, magenta: 0 };
  let total = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (x >= BORDER_WIDTH && x < image.width - BORDER_WIDTH && y >= BORDER_WIDTH && y < image.height - BORDER_WIDTH)
        continue;
      const offset = (y * image.width + x) * 4;
      const red = image.pixels[offset];
      const green = image.pixels[offset + 1];
      const blue = image.pixels[offset + 2];
      const alpha = image.pixels[offset + 3];
      const transparent = alpha < 250;
      const black = red <= 1 && green <= 1 && blue <= 1;
      const magenta = red >= 250 && green <= 5 && blue >= 250;
      if (transparent) categories.transparent++;
      if (black) categories.black++;
      if (magenta) categories.magenta++;
      if (transparent || black || magenta) total++;
    }
  }
  return { total, categories };
}

async function analyzeBorderSequence(page, referenceImage) {
  const waterRoiPixelCount = countRoiPixels(referenceImage, UNDERWATER_ROIS);
  const allowedSentinelCount = waterRoiPixelCount * THRESHOLDS.borderMaximumSentinelToWaterRatio;
  const frames = [];
  for (let frame = 0; frame < BORDER_FRAME_COUNT; frame++) {
    const image = await readCanvasPixels(page);
    frames.push({ frame, ...countBorderSentinels(image) });
  }
  const maximumSentinelCount = Math.max(...frames.map((frame) => frame.total));
  return {
    frameCount: frames.length,
    borderWidthAtAnalysisResolution: BORDER_WIDTH,
    waterRoiPixelCount,
    allowedSentinelCount,
    maximumSentinelCount,
    maximumSentinelToWaterRatio: waterRoiPixelCount === 0 ? 0 : maximumSentinelCount / waterRoiPixelCount,
    frames,
    passed: maximumSentinelCount <= allowedSentinelCount
  };
}

function analyzePlanarAnchor(sky, planar, rects, significanceThreshold) {
  let significantPixelCount = 0;
  let sumX = 0;
  let sumY = 0;
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  forEachRoiPixel(sky, rects, (offset, x, y) => {
    let difference = 0;
    for (let channel = 0; channel < 3; channel++) {
      difference = Math.max(
        difference,
        Math.abs(
          SRGB_BYTE_TO_LINEAR[sky.pixels[offset + channel]] - SRGB_BYTE_TO_LINEAR[planar.pixels[offset + channel]]
        )
      );
    }
    if (difference <= significanceThreshold) return;
    significantPixelCount++;
    sumX += x;
    sumY += y;
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);
  });
  const scaleX = VIEWPORT.width / ANALYSIS_SIZE.width;
  const scaleY = VIEWPORT.height / ANALYSIS_SIZE.height;
  return {
    significanceThreshold,
    significantPixelCount,
    centroidAnalysisPixels:
      significantPixelCount === 0 ? null : { x: sumX / significantPixelCount, y: sumY / significantPixelCount },
    centroidViewportPixels:
      significantPixelCount === 0
        ? null
        : { x: (sumX / significantPixelCount) * scaleX, y: (sumY / significantPixelCount) * scaleY },
    boundsAnalysisPixels: significantPixelCount === 0 ? null : { minimumX, minimumY, maximumX, maximumY },
    boundsViewportPixels:
      significantPixelCount === 0
        ? null
        : {
            minimumX: minimumX * scaleX,
            minimumY: minimumY * scaleY,
            maximumX: (maximumX + 1) * scaleX,
            maximumY: (maximumY + 1) * scaleY
          }
  };
}

function analyzePlanarClipSentinel(image, rect) {
  let pixelCount = 0;
  let magentaPixelCount = 0;
  forEachRoiPixel(image, [rect], (offset) => {
    const red = image.pixels[offset];
    const green = image.pixels[offset + 1];
    const blue = image.pixels[offset + 2];
    if (red >= 96 && blue >= 64 && red >= green + 32 && blue >= green + 24 && green * 2 <= red + blue) {
      magentaPixelCount++;
    }
    pixelCount++;
  });
  return {
    pixelCount,
    magentaPixelCount,
    coverage: pixelCount === 0 ? 0 : magentaPixelCount / pixelCount,
    classifier: "RGBA8 red>=96, blue>=64, red>=green+32, blue>=green+24, and 2*green<=red+blue inside frozen ROI"
  };
}

function findNonFinite(value, path = "metrics") {
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => findNonFinite(child, `${path}.${key}`));
}

async function configureRefractionState(page) {
  await invokeOpticsApi(page, "setPreset", "refraction-correctness");
  await invokeOpticsApi(page, "setCameraPreset", "depth-steps");
  await invokeOpticsApi(page, "setReflectionSource", "sky");
  await invokeOpticsApi(page, "setPlanarFilterEnabled", false);
  await invokeOpticsApi(page, "setCompositionMode", "precomposed");
  await invokeOpticsApi(page, "setRefractionEnabled", true);
  await invokeOpticsApi(page, "setDebugView", "final");
  await invokeOpticsApi(page, "freezeTime", true);
  await waitForRenderedFrames(page, 3);
}

async function verifyTier(browser, baseUrl, tier, committedBaselines) {
  const tierDirectory = resolve(outputDirectory, tier);
  await mkdir(tierDirectory, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  const page = await context.newPage();
  const diagnostics = collectBrowserDiagnostics(page);
  const failures = [];
  const captures = {};
  const result = {
    tier,
    url: createTargetUrl(baseUrl, tier).href,
    freshBrowserContext: true,
    failures,
    captures,
    diagnostics,
    cleanup: { aboutBlank: false, contextClosed: false }
  };

  try {
    await page.goto(result.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForWaterOpticsReady(page);
    await configureRefractionState(page);

    const initialMetrics = await readMetrics(page);
    result.initialMetrics = summarizeMetrics(initialMetrics);
    recordCheck(failures, initialMetrics?.ready === true, `${tier}: Lab is not ready.`);
    recordCheck(failures, initialMetrics?.requestedTier === tier, `${tier}: requested tier mismatch.`);
    recordCheck(failures, initialMetrics?.resolvedTier === tier, `${tier}: resolved tier mismatch.`);
    recordCheck(failures, initialMetrics?.fallbackReason === undefined, `${tier}: unexpected tier fallback.`);
    recordCheck(failures, initialMetrics?.frozen === true, `${tier}: fixed time is not frozen.`);
    recordCheck(failures, initialMetrics?.freeCameraEnabled === false, `${tier}: Free Camera must default off.`);
    recordCheck(
      failures,
      initialMetrics?.surfaceTime === FIXED_SURFACE_TIME,
      `${tier}: surface time is ${initialMetrics?.surfaceTime}, expected ${FIXED_SURFACE_TIME}.`
    );
    recordCheck(failures, initialMetrics?.statsEnabled === false, `${tier}: formal visual gate requires stats=0.`);
    recordCheck(failures, initialMetrics?.runtimeError === "", `${tier}: ${initialMetrics?.runtimeError}`);
    const observedFixtureVisualState = {
      markerLayout: BASELINE_FIXTURE_VISUAL_STATE.markerLayout,
      planarOrientationMarkersVisible: initialMetrics?.planarOrientationMarkersVisible,
      localFoamMaskEnabled: initialMetrics?.localFoamMaskEnabled,
      localFoamMaskCenterXZ: initialMetrics?.localFoamMaskCenterXZ,
      localFoamMaskHalfSizeXZ: initialMetrics?.localFoamMaskHalfSizeXZ,
      localFoamMaskFeatherMeters: initialMetrics?.localFoamMaskFeatherMeters,
      reflectorLayout: BASELINE_FIXTURE_VISUAL_STATE.reflectorLayout,
      reflectorVisible: initialMetrics?.reflectorVisible,
      reflectorTime: initialMetrics?.reflectorTime,
      featureFlags: initialMetrics?.calibrationFeatureFlags
    };
    result.fixtureVisualContract = {
      expected: BASELINE_FIXTURE_VISUAL_STATE,
      observed: observedFixtureVisualState,
      sha256: BASELINE_FIXTURE_VISUAL_HASH
    };
    recordCheck(
      failures,
      jsonValuesEqual(observedFixtureVisualState, BASELINE_FIXTURE_VISUAL_STATE),
      `${tier}: fixed fixture visual state does not match baseline contract ${BASELINE_FIXTURE_VISUAL_HASH}.`
    );
    recordCheck(
      failures,
      findNonFinite(initialMetrics).length === 0,
      `${tier}: metrics contain non-finite values at ${findNonFinite(initialMetrics).join(", ")}.`
    );

    const controlA = await captureState(page, tierDirectory, "refraction-control-a", "final");
    const controlB = await captureState(page, tierDirectory, "refraction-on-control-b", "final");
    captures.refractionControlA = controlA.summary;
    captures.refractionOnControlB = controlB.summary;
    const goldenBaselines = {
      refractionFinal: await verifyGoldenBaseline(page, tier, committedBaselines, "refraction-final.png", controlB)
    };
    recordCheck(
      failures,
      goldenBaselines.refractionFinal.passed,
      `${tier}: refraction-final Golden diff ratio ${goldenBaselines.refractionFinal.diffPixelRatio} exceeds ${THRESHOLDS.goldenMaximumDiffPixelRatio}.`
    );
    recordCheck(
      failures,
      controlA.image.sourceWidth === VIEWPORT.width && controlA.image.sourceHeight === VIEWPORT.height,
      `${tier}: canvas backing size is ${controlA.image.sourceWidth}x${controlA.image.sourceHeight}.`
    );
    const refractionControlNoise = compareImages(controlA.image, controlB.image, UNDERWATER_ROIS);
    const railControlNoise = compareImages(controlA.image, controlB.image, [ROIS.foregroundRail]);

    await invokeOpticsApi(page, "setRefractionEnabled", false);
    const refractionOff = await captureState(page, tierDirectory, "refraction-off", "final");
    captures.refractionOff = refractionOff.summary;
    const refractionDifference = compareImages(controlB.image, refractionOff.image, UNDERWATER_ROIS);
    const refractionThreshold = Math.max(
      THRESHOLDS.refractionMinimumMad,
      THRESHOLDS.refractionNoiseMultiplier * refractionControlNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const refractionPassed = refractionDifference.srgbDecodedLinear.meanAbsoluteChannel >= refractionThreshold;
    recordCheck(
      failures,
      refractionPassed,
      `${tier}: refraction ON/OFF underwater linear MAD ${refractionDifference.srgbDecodedLinear.meanAbsoluteChannel} is below ${refractionThreshold}.`
    );

    const foregroundRailDifference = compareImages(controlB.image, refractionOff.image, [ROIS.foregroundRail]);
    const foregroundRailThreshold = Math.max(
      THRESHOLDS.foregroundRailMaximumMad,
      THRESHOLDS.foregroundRailNoiseMultiplier * railControlNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const foregroundRailPassed =
      foregroundRailDifference.srgbDecodedLinear.meanAbsoluteChannel <= foregroundRailThreshold &&
      foregroundRailDifference.leakPixelRatio < THRESHOLDS.foregroundRailMaximumLeakRatio;
    recordCheck(
      failures,
      foregroundRailPassed,
      `${tier}: foreground rail leaked (MAD=${foregroundRailDifference.srgbDecodedLinear.meanAbsoluteChannel}, ratio=${foregroundRailDifference.leakPixelRatio}).`
    );

    const aboveWaterControlNoise = compareImages(controlA.image, controlB.image, ROIS.aboveWaterColumns);
    const aboveWaterDifference = compareImages(controlB.image, refractionOff.image, ROIS.aboveWaterColumns);
    const aboveWaterThreshold = Math.max(
      THRESHOLDS.aboveWaterMaximumMad,
      THRESHOLDS.aboveWaterNoiseMultiplier * aboveWaterControlNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const aboveWaterPassed = aboveWaterDifference.srgbDecodedLinear.meanAbsoluteChannel <= aboveWaterThreshold;
    recordCheck(
      failures,
      aboveWaterPassed,
      `${tier}: above-water column segments changed with refraction (MAD=${aboveWaterDifference.srgbDecodedLinear.meanAbsoluteChannel}, threshold=${aboveWaterThreshold}).`
    );

    await invokeOpticsApi(page, "setRefractionEnabled", true);
    await waitForRenderedFrames(page, 2);
    const border = await analyzeBorderSequence(page, controlB.image);
    recordCheck(
      failures,
      border.passed,
      `${tier}: 2px border sentinel spike ${border.maximumSentinelCount}/${border.waterRoiPixelCount} exceeds ${THRESHOLDS.borderMaximumSentinelToWaterRatio}.`
    );

    await invokeOpticsApi(page, "setPreset", "composite-ab");
    await invokeOpticsApi(page, "setCameraPreset", "depth-steps");
    await invokeOpticsApi(page, "setReflectionSource", "sky");
    await invokeOpticsApi(page, "setCompositionMode", "legacy");
    const debugCaptures = {};
    for (const [symbol, debugView, label] of [
      ["B", "centered-opaque-color", "debug-b-centered-opaque-color"],
      ["D", "displaced-opaque-color", "debug-d-displaced-opaque-color"],
      ["C", "shader-composited-color", "debug-c-shader-composited-color"],
      ["A", "surface-alpha", "debug-a-surface-alpha"],
      ["F", "final-framebuffer-color", "debug-f-final-framebuffer-color"]
    ]) {
      await invokeOpticsApi(page, "setDebugView", debugView);
      const capture = await captureState(page, tierDirectory, label, debugView);
      debugCaptures[symbol] = capture;
      captures[`debug${symbol}`] = capture.summary;
      recordCheck(
        failures,
        capture.metrics?.debugView === debugView,
        `${tier}: ${symbol} requested ${debugView} but metrics reported ${capture.metrics?.debugView}.`
      );
    }
    const alphaEvidence = analyzeAlphaImage(debugCaptures.A.image, UNDERWATER_ROIS);
    const debugSignals = {
      centeredToDisplaced: compareImages(debugCaptures.B.image, debugCaptures.D.image, UNDERWATER_ROIS),
      centeredToComposited: compareImages(debugCaptures.B.image, debugCaptures.C.image, UNDERWATER_ROIS),
      compositedToAlpha: compareImages(debugCaptures.C.image, debugCaptures.A.image, UNDERWATER_ROIS)
    };
    const strongestDebugSignal = Math.max(
      ...Object.values(debugSignals).map((signal) => signal.srgbDecodedLinear.meanAbsoluteChannel)
    );
    const debugSignalThreshold = Math.max(
      THRESHOLDS.compositionTargetMatchMaximumError,
      THRESHOLDS.refractionNoiseMultiplier * refractionControlNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const debugInstrumentationPassed =
      strongestDebugSignal > debugSignalThreshold &&
      alphaEvidence.srgbDecodedLinear.mean > 0.01 &&
      alphaEvidence.srgbDecodedLinear.mean < 0.99 &&
      alphaEvidence.srgbDecodedLinear.chromaP95 <= THRESHOLDS.compositionTargetMatchMaximumError;
    recordCheck(
      failures,
      debugInstrumentationPassed,
      `${tier}: B/D/C/A/F shader debug evidence is not independently observable (signal=${strongestDebugSignal}, alpha=${alphaEvidence.srgbDecodedLinear.mean}, chroma=${alphaEvidence.srgbDecodedLinear.chromaP95}).`
    );
    const compositionAnalysis = analyzeComposition(
      Object.fromEntries(Object.entries(debugCaptures).map(([key, capture]) => [key, capture.image])),
      UNDERWATER_ROIS
    );
    const compositionPixel = analyzeCompositionPixel(
      Object.fromEntries(Object.entries(debugCaptures).map(([key, capture]) => [key, capture.image])),
      COMPOSITION_CALIBRATION_POINT
    );
    const opticsDebugCaptures = {};
    const planarDebugViews = new Set(["planar-uv", "clip-side"]);
    for (const debugView of [
      "refraction-uv-delta",
      "optical-depth",
      "depth-continuity",
      "sample-validity",
      "fresnel",
      "reflection-source",
      "planar-uv",
      "clip-side",
      "refraction-amount",
      "refraction-gates"
    ]) {
      await invokeOpticsApi(page, "setReflectionSource", planarDebugViews.has(debugView) ? "planar" : "sky");
      await invokeOpticsApi(page, "setDebugView", debugView);
      const capture = await captureState(page, tierDirectory, `debug-${debugView}`, debugView);
      opticsDebugCaptures[debugView] = capture;
      captures[`debug-${debugView}`] = capture.summary;
      recordCheck(
        failures,
        capture.metrics?.debugView === debugView,
        `${tier}: requested ${debugView} but metrics reported ${capture.metrics?.debugView}.`
      );
    }
    await invokeOpticsApi(page, "setReflectionSource", "sky");
    await invokeOpticsApi(page, "setDebugView", "clip-side");
    const clipSideSkyControl = await captureState(page, tierDirectory, "debug-clip-side-sky-control", "clip-side");
    captures["debug-clip-side-sky-control"] = clipSideSkyControl.summary;
    const extendedDebugSignals = Object.fromEntries(
      ["reflection-source", "planar-uv", "clip-side"].map((debugView) => [
        debugView,
        analyzeDebugRoiSignal(opticsDebugCaptures[debugView].image, UNDERWATER_ROIS)
      ])
    );
    extendedDebugSignals["clip-side-sky-control"] = analyzeDebugRoiSignal(clipSideSkyControl.image, UNDERWATER_ROIS);
    recordCheck(
      failures,
      extendedDebugSignals["reflection-source"].nonBlackPixelRatio >= 0.5,
      `${tier}: reflection-source Debug is empty (${extendedDebugSignals["reflection-source"].nonBlackPixelRatio}).`
    );
    const planarUvDebugSignal = extendedDebugSignals["planar-uv"];
    recordCheck(
      failures,
      planarUvDebugSignal.nonBlackPixelRatio >= 0.05 && planarUvDebugSignal.luminanceRange >= 1 / 255,
      `${tier}: planar-uv Debug has no spatial signal (${JSON.stringify(planarUvDebugSignal)}).`
    );
    const planarClipSideDebugSignal = extendedDebugSignals["clip-side"];
    const skyClipSideDebugSignal = extendedDebugSignals["clip-side-sky-control"];
    const clipSideDebugPassed =
      planarClipSideDebugSignal.nonBlackPixelRatio >= 0.5 &&
      planarClipSideDebugSignal.meanLuminance >= 0.9 &&
      skyClipSideDebugSignal.nonBlackPixelRatio <= 0.005 &&
      opticsDebugCaptures["clip-side"].metrics?.resolvedReflectionSource === "planar" &&
      clipSideSkyControl.metrics?.resolvedReflectionSource === "sky";
    recordCheck(
      failures,
      clipSideDebugPassed,
      `${tier}: clip-side Debug did not distinguish valid Planar clip.w from the Sky control (${JSON.stringify({
        planar: planarClipSideDebugSignal,
        sky: skyClipSideDebugSignal
      })}).`
    );
    const transmittanceByDepth = analyzeChannelMeans(opticsDebugCaptures["refraction-gates"].image, UNDERWATER_ROIS, 2);
    const transmittanceOrderingPassed =
      transmittanceByDepth[0].srgbDecodedLinearMean - transmittanceByDepth[1].srgbDecodedLinearMean >=
        THRESHOLDS.transmittanceMinimumDepthStep &&
      transmittanceByDepth[1].srgbDecodedLinearMean - transmittanceByDepth[2].srgbDecodedLinearMean >=
        THRESHOLDS.transmittanceMinimumDepthStep;
    recordCheck(
      failures,
      transmittanceOrderingPassed,
      `${tier}: shallow/medium/deep transmittance ${transmittanceByDepth
        .map((entry) => entry.srgbDecodedLinearMean)
        .join("/")} does not decrease by ${THRESHOLDS.transmittanceMinimumDepthStep}.`
    );

    await invokeOpticsApi(page, "setDebugView", "refraction-amount");
    await invokeOpticsApi(page, "setLocalFoamMaskEnabled", false);
    const localFoamOffA = await captureState(page, tierDirectory, "local-foam-off-control-a", "refraction-amount");
    const localFoamOffB = await captureState(page, tierDirectory, "local-foam-off-control-b", "refraction-amount");
    await invokeOpticsApi(page, "setLocalFoamMaskEnabled", true);
    const localFoamOn = await captureState(page, tierDirectory, "local-foam-on", "refraction-amount");
    captures.localFoamOffControlA = localFoamOffA.summary;
    captures.localFoamOffControlB = localFoamOffB.summary;
    captures.localFoamOn = localFoamOn.summary;
    const localFoamInsideControlNoise = compareImages(localFoamOffA.image, localFoamOffB.image, [ROIS.shallowBed]);
    const localFoamOutsideControlNoise = compareImages(localFoamOffA.image, localFoamOffB.image, [
      ROIS.mediumBed,
      ROIS.deepBed
    ]);
    const localFoamInsideDifference = compareImages(localFoamOffB.image, localFoamOn.image, [ROIS.shallowBed]);
    const localFoamOutsideDifference = compareImages(localFoamOffB.image, localFoamOn.image, [
      ROIS.mediumBed,
      ROIS.deepBed
    ]);
    const localFoamOffInsideMean = analyzeChannelMeans(localFoamOffB.image, [ROIS.shallowBed], 0)[0];
    const localFoamOnInsideMean = analyzeChannelMeans(localFoamOn.image, [ROIS.shallowBed], 0)[0];
    const localFoamInsideThreshold = Math.max(
      THRESHOLDS.localFoamMinimumInsideMad,
      THRESHOLDS.localFoamNoiseMultiplier * localFoamInsideControlNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const localFoamOutsideThreshold = Math.max(
      THRESHOLDS.localFoamOutsideMaximumMad,
      THRESHOLDS.localFoamNoiseMultiplier * localFoamOutsideControlNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const localFoamMeanReduction =
      localFoamOffInsideMean.srgbDecodedLinearMean - localFoamOnInsideMean.srgbDecodedLinearMean;
    const localFoamPassed =
      localFoamInsideDifference.srgbDecodedLinear.meanAbsoluteChannel >= localFoamInsideThreshold &&
      localFoamMeanReduction >= THRESHOLDS.localFoamMinimumMeanReduction &&
      localFoamOutsideDifference.srgbDecodedLinear.meanAbsoluteChannel <= localFoamOutsideThreshold &&
      localFoamOffB.metrics?.localFoamMaskEnabled === false &&
      localFoamOn.metrics?.localFoamMaskEnabled === true &&
      localFoamOn.metrics?.localFoamMaskSuppressesRefraction === true;
    recordCheck(
      failures,
      localFoamPassed,
      `${tier}: Local Foam did not causally suppress only the authored refraction ROI (inside MAD=${localFoamInsideDifference.srgbDecodedLinear.meanAbsoluteChannel}/${localFoamInsideThreshold}, mean reduction=${localFoamMeanReduction}, outside MAD=${localFoamOutsideDifference.srgbDecodedLinear.meanAbsoluteChannel}/${localFoamOutsideThreshold}).`
    );

    await invokeOpticsApi(page, "setDebugView", "final-framebuffer-color");
    const localFoamFinalOn = await captureState(page, tierDirectory, "local-foam-final-on", "final-framebuffer-color");
    await invokeOpticsApi(page, "setLocalFoamMaskEnabled", false);
    const localFoamFinalOff = await captureState(
      page,
      tierDirectory,
      "local-foam-final-off",
      "final-framebuffer-color"
    );
    captures.localFoamFinalOn = localFoamFinalOn.summary;
    captures.localFoamFinalOff = localFoamFinalOff.summary;
    const localFoamFinalInsideDifference = compareImages(localFoamFinalOff.image, localFoamFinalOn.image, [
      ROIS.shallowBed
    ]);
    const localFoamFinalOutsideDifference = compareImages(localFoamFinalOff.image, localFoamFinalOn.image, [
      ROIS.mediumBed,
      ROIS.deepBed
    ]);
    const localFoamFinalVisiblePassed =
      localFoamFinalInsideDifference.srgbDecodedLinear.meanAbsoluteChannel >=
        THRESHOLDS.localFoamMinimumFinalInsideMad &&
      localFoamFinalInsideDifference.srgbDecodedLinear.meanAbsoluteChannel >=
        THRESHOLDS.localFoamMinimumInsideOutsideRatio *
          localFoamFinalOutsideDifference.srgbDecodedLinear.meanAbsoluteChannel;
    recordCheck(
      failures,
      localFoamFinalVisiblePassed,
      `${tier}: Local Foam was not visibly local in Final (inside/outside MAD=${localFoamFinalInsideDifference.srgbDecodedLinear.meanAbsoluteChannel}/${localFoamFinalOutsideDifference.srgbDecodedLinear.meanAbsoluteChannel}).`
    );

    await invokeOpticsApi(page, "setCalibrationFeatureFlags", {
      waves: true,
      microNormals: true,
      foam: false
    });
    await invokeOpticsApi(page, "setDebugView", "refraction-amount");
    const localFoamMasterOffMaskOff = await captureState(
      page,
      tierDirectory,
      "local-foam-master-off-mask-off",
      "refraction-amount"
    );
    await invokeOpticsApi(page, "setLocalFoamMaskEnabled", true);
    const localFoamMasterOffMaskOn = await captureState(
      page,
      tierDirectory,
      "local-foam-master-off-mask-on",
      "refraction-amount"
    );
    captures.localFoamMasterOffMaskOff = localFoamMasterOffMaskOff.summary;
    captures.localFoamMasterOffMaskOn = localFoamMasterOffMaskOn.summary;
    const localFoamMasterOffDifference = compareImages(
      localFoamMasterOffMaskOff.image,
      localFoamMasterOffMaskOn.image,
      [ROIS.shallowBed]
    );
    const localFoamMasterOffPassed =
      localFoamMasterOffDifference.srgbDecodedLinear.meanAbsoluteChannel <= THRESHOLDS.localFoamMasterOffMaximumMad &&
      localFoamMasterOffMaskOff.metrics?.calibrationFeatureFlags?.foam === false &&
      localFoamMasterOffMaskOff.metrics?.localFoamMaskEnabled === false &&
      localFoamMasterOffMaskOn.metrics?.localFoamMaskEnabled === true;
    recordCheck(
      failures,
      localFoamMasterOffPassed,
      `${tier}: disabling the master Foam feature did not neutralize Local Foam refraction suppression (MAD=${localFoamMasterOffDifference.srgbDecodedLinear.meanAbsoluteChannel}).`
    );
    await invokeOpticsApi(page, "setCalibrationFeatureFlags", {
      waves: true,
      microNormals: true,
      foam: true
    });

    await invokeOpticsApi(page, "setCompositionMode", "precomposed");
    await invokeOpticsApi(page, "setDepthWriteEnabled", false);
    await invokeOpticsApi(page, "setDebugView", "final-framebuffer-color");
    const precomposedDepthOff = await captureState(
      page,
      tierDirectory,
      "precomposed-final-depth-off",
      "final-framebuffer-color"
    );
    captures.precomposedFinalDepthOff = precomposedDepthOff.summary;
    await invokeOpticsApi(page, "setDepthWriteEnabled", true);
    const precomposedDepthOn = await captureState(
      page,
      tierDirectory,
      "precomposed-final-depth-on",
      "final-framebuffer-color"
    );
    captures.precomposedFinalDepthOn = precomposedDepthOn.summary;
    await invokeOpticsApi(page, "setDepthWriteEnabled", false);
    const precomposedDepthOffTarget = compareImages(debugCaptures.C.image, precomposedDepthOff.image, UNDERWATER_ROIS);
    const precomposedDepthOnTarget = compareImages(debugCaptures.C.image, precomposedDepthOn.image, UNDERWATER_ROIS);
    const compositionDecision = decideComposition(
      compositionAnalysis,
      compositionPixel,
      precomposedDepthOffTarget,
      precomposedDepthOnTarget,
      !foregroundRailPassed || !border.passed
    );
    const compositionDecisionReliable = debugInstrumentationPassed && compositionDecision.decision !== "inconclusive";
    recordCheck(
      failures,
      compositionDecisionReliable,
      `${tier}: composition decision is not reliable (${compositionDecision.decision}).`
    );

    const transparentOrderingHiddenA = precomposedDepthOff;
    const transparentOrderingHiddenB = await captureState(
      page,
      tierDirectory,
      "transparent-ordering-hidden-control",
      "final-framebuffer-color"
    );
    captures.transparentOrderingHiddenControl = transparentOrderingHiddenB.summary;
    const transparentOrderingControlNoise = compareImages(
      transparentOrderingHiddenA.image,
      transparentOrderingHiddenB.image,
      [ROIS.transparentOrderingSentinel]
    );

    await invokeOpticsApi(page, "setTransparentOrderingProbeMode", "after-water");
    const transparentOrderingAfterWater = await captureState(
      page,
      tierDirectory,
      "transparent-ordering-after-water",
      "final-framebuffer-color"
    );
    captures.transparentOrderingAfterWater = transparentOrderingAfterWater.summary;

    await invokeOpticsApi(page, "setTransparentOrderingProbeMode", "before-water");
    const transparentOrderingBeforeWater = await captureState(
      page,
      tierDirectory,
      "transparent-ordering-before-water-negative",
      "final-framebuffer-color"
    );
    captures.transparentOrderingBeforeWaterNegative = transparentOrderingBeforeWater.summary;

    const transparentOrderingAfterDifference = compareImages(
      transparentOrderingHiddenB.image,
      transparentOrderingAfterWater.image,
      [ROIS.transparentOrderingSentinel]
    );
    const transparentOrderingBeforeDifference = compareImages(
      transparentOrderingHiddenB.image,
      transparentOrderingBeforeWater.image,
      [ROIS.transparentOrderingSentinel]
    );
    const transparentOrderingPriorityDifference = compareImages(
      transparentOrderingAfterWater.image,
      transparentOrderingBeforeWater.image,
      [ROIS.transparentOrderingSentinel]
    );
    const transparentOrderingPositiveThreshold = Math.max(
      THRESHOLDS.transparentOrderingMinimumMad,
      THRESHOLDS.refractionNoiseMultiplier * transparentOrderingControlNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const transparentOrderingNegativeThreshold = Math.max(
      THRESHOLDS.transparentOrderingNegativeMaximumMad,
      THRESHOLDS.aboveWaterNoiseMultiplier * transparentOrderingControlNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const transparentOrderingMetricsPassed =
      transparentOrderingAfterWater.metrics?.compositionMode === "precomposed" &&
      transparentOrderingAfterWater.metrics?.depthWriteEnabled === false &&
      transparentOrderingAfterWater.metrics?.waterBlendEnabled === false &&
      transparentOrderingAfterWater.metrics?.waterRendererPriority === -100 &&
      transparentOrderingAfterWater.metrics?.activeWaterRendererPriority === -100 &&
      transparentOrderingAfterWater.metrics?.transparentSentinelNormalPriority === 0 &&
      transparentOrderingAfterWater.metrics?.transparentSentinelPriority === 0 &&
      transparentOrderingAfterWater.metrics?.transparentSentinelTransparent === true &&
      transparentOrderingAfterWater.metrics?.transparentOrderingContractSatisfied === true &&
      transparentOrderingAfterWater.metrics?.transparentOrderingProbeWaterFirst === true &&
      transparentOrderingAfterWater.domMetrics?.transparentOrderingContractSatisfied === "true" &&
      transparentOrderingAfterWater.domMetrics?.transparentOrderingProbeWaterFirst === "true" &&
      transparentOrderingBeforeWater.metrics?.transparentSentinelPriority === -200 &&
      transparentOrderingBeforeWater.metrics?.transparentOrderingProbeWaterFirst === false &&
      transparentOrderingBeforeWater.domMetrics?.transparentOrderingProbeWaterFirst === "false";
    const transparentOrderingVisualPassed =
      transparentOrderingAfterDifference.srgbDecodedLinear.meanAbsoluteChannel >=
        transparentOrderingPositiveThreshold &&
      transparentOrderingBeforeDifference.srgbDecodedLinear.meanAbsoluteChannel <=
        transparentOrderingNegativeThreshold &&
      transparentOrderingPriorityDifference.srgbDecodedLinear.meanAbsoluteChannel >=
        transparentOrderingPositiveThreshold;
    const transparentOrderingPassed = transparentOrderingMetricsPassed && transparentOrderingVisualPassed;
    recordCheck(
      failures,
      transparentOrderingPassed,
      `${tier}: transparent ordering A/B failed (after=${transparentOrderingAfterDifference.srgbDecodedLinear.meanAbsoluteChannel}, before=${transparentOrderingBeforeDifference.srgbDecodedLinear.meanAbsoluteChannel}, priority=${transparentOrderingPriorityDifference.srgbDecodedLinear.meanAbsoluteChannel}, thresholds=${transparentOrderingPositiveThreshold}/${transparentOrderingNegativeThreshold}, metrics=${transparentOrderingMetricsPassed}).`
    );
    await invokeOpticsApi(page, "setTransparentOrderingProbeMode", "hidden");

    // P0 calibration Gate 1: a true pure-transmission path must reproduce the
    // exact displaced opaque sample over an eroded, validity-proven interior.
    await invokeOpticsApi(page, "setCompositionMode", "precomposed");
    await invokeOpticsApi(page, "setDepthWriteEnabled", false);
    await invokeOpticsApi(page, "setReflectionSource", "sky");
    await invokeOpticsApi(page, "setCalibrationFeatureFlags", {
      waves: true,
      microNormals: true,
      foam: false
    });
    await invokeOpticsApi(page, "setCalibrationMode", "pure-transmission");
    const pureTransmissionCaptures = {};
    for (const [symbol, debugView] of [
      ["B", "centered-opaque-color"],
      ["D", "displaced-opaque-color"],
      ["validity", "sample-validity"],
      ["fresnel", "fresnel"],
      ["C", "shader-composited-color"],
      ["F", "final-framebuffer-color"]
    ]) {
      await invokeOpticsApi(page, "setDebugView", debugView);
      const capture = await captureState(page, tierDirectory, `pure-transmission-${debugView}`, debugView, VIEWPORT);
      pureTransmissionCaptures[symbol] = capture;
      captures[`pureTransmission${symbol}`] = capture.summary;
    }
    const pureValidity = createErodedValidityMask(
      pureTransmissionCaptures.validity.image,
      UNDERWATER_ROIS,
      THRESHOLDS.pureTransmissionMinimumValidity
    );
    const pureFinalToDisplaced = compareMaskedLinearImages(
      pureTransmissionCaptures.F.image,
      pureTransmissionCaptures.D.image,
      pureValidity.mask
    );
    const pureDisplacedToCentered = compareMaskedLinearImages(
      pureTransmissionCaptures.D.image,
      pureTransmissionCaptures.B.image,
      pureValidity.mask
    );
    const pureFresnel = analyzeMaskedScalar(pureTransmissionCaptures.fresnel.image, pureValidity.mask);
    const pureProfile = pureTransmissionCaptures.F.metrics?.calibrationOpticalProfile;
    const pureDisplacementThreshold = Math.max(
      0.005,
      THRESHOLDS.refractionNoiseMultiplier * refractionControlNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const pureProfilePassed =
      pureProfile?.absorptionCoefficient?.every((value) => value === 0) === true &&
      pureProfile?.scatteringColor?.every((value) => value === 0) === true &&
      pureProfile?.scatteringCoefficient === 0 &&
      pureProfile?.indexOfRefraction === 1 &&
      pureProfile?.reflectionIntensity === 0;
    const pureTransmissionPassed =
      pureValidity.validPixelCount >= THRESHOLDS.pureTransmissionMinimumValidPixelCount &&
      pureFinalToDisplaced.meanAbsoluteChannel <= THRESHOLDS.pureTransmissionMaximumMad &&
      pureFresnel.maximum <= THRESHOLDS.pureTransmissionMaximumFresnel &&
      pureDisplacedToCentered.meanAbsoluteChannel >= pureDisplacementThreshold &&
      pureProfilePassed &&
      pureTransmissionCaptures.F.metrics?.calibrationMode === "pure-transmission" &&
      pureTransmissionCaptures.F.metrics?.calibrationReferenceCompositionEnabled === true &&
      pureTransmissionCaptures.F.metrics?.calibrationEffectiveFresnelOverride === 0;
    recordCheck(
      failures,
      pureTransmissionPassed,
      `${tier}: pure transmission failed (valid=${pureValidity.validPixelCount}, F-D MAD=${pureFinalToDisplaced.meanAbsoluteChannel}, Fresnel max=${pureFresnel.maximum}, D-B MAD=${pureDisplacedToCentered.meanAbsoluteChannel}, profile=${pureProfilePassed}).`
    );

    // P0 calibration Gate 2: export the exact shader inputs and compare C with
    // the Lab API, which delegates to evaluateWaterSurfaceOptics().
    await invokeOpticsApi(page, "setCalibrationMode", "cpu-reference");
    const cpuReferenceCaptures = {};
    for (const [symbol, debugView] of [
      ["D", "displaced-opaque-color"],
      ["validity", "sample-validity"],
      ["opticalDepth", "optical-depth"],
      ["normalDotView", "normal-dot-view"],
      ["reflection", "reflection-color"],
      ["C", "shader-composited-color"],
      ["F", "final-framebuffer-color"]
    ]) {
      await invokeOpticsApi(page, "setDebugView", debugView);
      const capture = await captureState(page, tierDirectory, `cpu-reference-${debugView}`, debugView, VIEWPORT);
      cpuReferenceCaptures[symbol] = capture;
      captures[`cpuReference${symbol}`] = capture.summary;
    }
    const cpuValidity = createErodedValidityMask(
      cpuReferenceCaptures.validity.image,
      UNDERWATER_ROIS,
      THRESHOLDS.pureTransmissionMinimumValidity
    );
    const cpuPixel = findNearestValidPixel(
      cpuValidity.mask,
      VIEWPORT.width,
      VIEWPORT.height,
      COMPOSITION_CALIBRATION_POINT.normalized
    );
    assert(cpuPixel, `${tier}: no stable full-resolution CPU-reference pixel was found.`);
    const sourceColor = readLinearRgb(cpuReferenceCaptures.D.image, cpuPixel.x, cpuPixel.y);
    const reflectionColor = readLinearRgb(cpuReferenceCaptures.reflection.image, cpuPixel.x, cpuPixel.y);
    const shaderCompositedColor = readLinearRgb(cpuReferenceCaptures.C.image, cpuPixel.x, cpuPixel.y);
    const finalFramebufferColor = readLinearRgb(cpuReferenceCaptures.F.image, cpuPixel.x, cpuPixel.y);
    const opticalDepthNormalized = readLinearRgb(cpuReferenceCaptures.opticalDepth.image, cpuPixel.x, cpuPixel.y)[0];
    const normalDotView = readLinearRgb(cpuReferenceCaptures.normalDotView.image, cpuPixel.x, cpuPixel.y)[0];
    const opticalDepthNormalizationMeters =
      cpuReferenceCaptures.C.metrics?.opticalDepthNormalizationMeters ?? Number.NaN;
    const opticalDistance = opticalDepthNormalized * opticalDepthNormalizationMeters;
    const cpuReferenceAnalysis = await invokeOpticsApi(page, "analyzeReferencePixel", {
      opticalDistance,
      normalDotView,
      sourceColor,
      reflectionColor,
      shaderCompositedColor,
      stableInterior: true
    });
    const finalToShaderError = Math.max(
      ...finalFramebufferColor.map((channel, index) => Math.abs(channel - shaderCompositedColor[index]))
    );
    const cpuReferenceNotClamped =
      Number.isFinite(opticalDistance) &&
      opticalDistance > 0 &&
      opticalDistance < opticalDepthNormalizationMeters &&
      normalDotView > 0 &&
      normalDotView < 1 &&
      cpuReferenceAnalysis.cpuReferenceColor.every((channel) => channel > 0 && channel < 1);
    const cpuReferencePassed =
      cpuValidity.validPixelCount >= THRESHOLDS.pureTransmissionMinimumValidPixelCount &&
      cpuReferenceAnalysis.valid === true &&
      cpuReferenceAnalysis.passed === true &&
      cpuReferenceAnalysis.maximumChannelError <= THRESHOLDS.referenceMaximumChannelError &&
      finalToShaderError <= THRESHOLDS.referenceMaximumChannelError &&
      cpuReferenceNotClamped &&
      cpuReferenceCaptures.F.metrics?.calibrationMode === "cpu-reference" &&
      cpuReferenceCaptures.F.metrics?.calibrationReferenceCompositionEnabled === true;
    recordCheck(
      failures,
      cpuReferencePassed,
      `${tier}: CPU/GPU reference failed (pixel=${cpuPixel.x},${cpuPixel.y}, CPU-C=${cpuReferenceAnalysis.maximumChannelError}, F-C=${finalToShaderError}, depth=${opticalDistance}, NdotV=${normalDotView}).`
    );
    await invokeOpticsApi(page, "setCalibrationMode", "none");
    await invokeOpticsApi(page, "setCalibrationFeatureFlags", {
      waves: true,
      microNormals: true,
      foam: true
    });

    await invokeOpticsApi(page, "setPreset", "reflection-correctness");
    await invokeOpticsApi(page, "setCameraPreset", "reflection-front");
    await invokeOpticsApi(page, "setDebugView", "final-framebuffer-color");
    await invokeOpticsApi(page, "setReflectionSource", "sky");
    const reflectionSkyA = await captureState(
      page,
      tierDirectory,
      "reflection-sky-control-a",
      "final-framebuffer-color"
    );
    const reflectionSkyB = await captureState(
      page,
      tierDirectory,
      "reflection-sky-control-b",
      "final-framebuffer-color"
    );
    captures.reflectionSkyControlA = reflectionSkyA.summary;
    captures.reflectionSkyControlB = reflectionSkyB.summary;
    const reflectionControlNoise = compareImages(reflectionSkyA.image, reflectionSkyB.image, REFLECTION_ROIS);

    await invokeOpticsApi(page, "setReflectionSource", "probe");
    const probe = await captureState(page, tierDirectory, "reflection-probe", "final-framebuffer-color");
    captures.reflectionProbe = probe.summary;
    const probeDifference = compareImages(reflectionSkyB.image, probe.image, REFLECTION_ROIS);
    const probeThreshold = Math.max(
      THRESHOLDS.probeMinimumMad,
      THRESHOLDS.probeNoiseMultiplier * reflectionControlNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const probeMetricsPassed =
      probe.metrics?.reflectionSource === "probe" &&
      probe.metrics?.resolvedReflectionSource === "probe" &&
      probe.metrics?.probeTextureAvailable === true &&
      probe.metrics?.probeTextureBound === true &&
      probe.metrics?.probeResourceBytes > 0 &&
      probe.domMetrics.probeTextureBound === "true" &&
      probe.domMetrics.resolvedReflectionSource === "probe";
    const probeVisualPassed = probeDifference.srgbDecodedLinear.meanAbsoluteChannel >= probeThreshold;
    recordCheck(failures, probeMetricsPassed, `${tier}: Probe did not resolve to a non-empty bound Cube Texture.`);
    recordCheck(
      failures,
      probeVisualPassed,
      `${tier}: Probe/Sky linear MAD ${probeDifference.srgbDecodedLinear.meanAbsoluteChannel} is below ${probeThreshold}.`
    );

    await invokeOpticsApi(page, "setReflectionSource", "planar");
    const planar = await captureState(page, tierDirectory, "planar-anchor", "final-framebuffer-color");
    captures.planarAnchor = planar.summary;
    goldenBaselines.reflectionFinal = await verifyGoldenBaseline(
      page,
      tier,
      committedBaselines,
      "reflection-final.png",
      planar
    );
    recordCheck(
      failures,
      goldenBaselines.reflectionFinal.passed,
      `${tier}: reflection-final Golden diff ratio ${goldenBaselines.reflectionFinal.diffPixelRatio} exceeds ${THRESHOLDS.goldenMaximumDiffPixelRatio}.`
    );
    const planarDifference = compareImages(reflectionSkyB.image, planar.image, REFLECTION_ROIS);
    const anchorThreshold = Math.max(
      THRESHOLDS.probeMinimumMad,
      THRESHOLDS.probeNoiseMultiplier * reflectionControlNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const planarAnchor = analyzePlanarAnchor(reflectionSkyB.image, planar.image, REFLECTION_ROIS, anchorThreshold);
    const planarResourcePassed =
      planar.metrics?.reflectionSource === "planar" &&
      planar.metrics?.resolvedReflectionSource === "planar" &&
      planar.metrics?.planarCameraCount === 1 &&
      planar.metrics?.planarRenderTargetCount === 1 &&
      planar.metrics?.waterLayerMask !== 0 &&
      planar.metrics?.waterLayerExcludedFromPlanar === true &&
      (planar.metrics.planarCameraCullingMask & planar.metrics.waterLayerMask) === 0 &&
      planar.domMetrics.resolvedReflectionSource === "planar" &&
      planar.domMetrics.planarCameraCount === "1" &&
      planar.domMetrics.planarRenderTargetCount === "1" &&
      planar.domMetrics.waterLayerExcludedFromPlanar === "true";
    const planarAnchorPassed = planarAnchor.significantPixelCount > 0;
    recordCheck(
      failures,
      planarResourcePassed,
      `${tier}: Planar must resolve with exactly one Camera/RT and exclude the complete water layer mask.`
    );
    recordCheck(failures, planarAnchorPassed, `${tier}: Planar anchor image has no significant Sky-relative pixels.`);

    const planarFallbackCases = {};
    for (const [cameraPreset, expectedFallbackReason] of [
      ["planar-too-close", "planar-camera-too-close"],
      ["planar-underwater", "planar-camera-underwater"],
      ["planar-back-facing", "planar-plane-back-facing"]
    ]) {
      await invokeOpticsApi(page, "setCameraPreset", cameraPreset);
      await invokeOpticsApi(page, "setReflectionSource", "planar");
      const samples = await sampleRuntimeFrames(page, 30);
      const fallbackCapture = await captureState(
        page,
        tierDirectory,
        `planar-fallback-${cameraPreset}`,
        "final-framebuffer-color"
      );
      captures[`planarFallback-${cameraPreset}`] = fallbackCapture.summary;
      await invokeOpticsApi(page, "setReflectionSource", "probe");
      const explicitProbeCapture = await captureState(
        page,
        tierDirectory,
        `planar-fallback-${cameraPreset}-explicit-probe`,
        "final-framebuffer-color"
      );
      captures[`planarFallback-${cameraPreset}-explicitProbe`] = explicitProbeCapture.summary;
      const canvasSignal = analyzeDebugRoiSignal(fallbackCapture.image, [[0, 0, 1, 1]]);
      const explicitProbeDifference = compareImages(fallbackCapture.image, explicitProbeCapture.image, [[0, 0, 1, 1]]);
      const explicitProbeMatch =
        explicitProbeDifference.srgbDecodedLinear.meanAbsoluteChannel <= 0.002 &&
        explicitProbeCapture.metrics?.resolvedReflectionSource === "probe" &&
        explicitProbeCapture.metrics?.planarCameraCount === 0 &&
        explicitProbeCapture.metrics?.planarRenderTargetCount === 0;
      const stableFallback = samples.every(
        (sample) =>
          sample?.reflectionSource === "planar" &&
          sample.resolvedReflectionSource === "probe" &&
          sample.reflectionFallbackReason === expectedFallbackReason &&
          sample.planarCameraCount === 0 &&
          sample.planarRenderTargetCount === 0 &&
          sample.runtimeError === ""
      );
      const passed =
        stableFallback &&
        explicitProbeMatch &&
        canvasSignal.nonBlackPixelRatio >= 0.5 &&
        canvasSignal.luminanceRange > 0;
      planarFallbackCases[cameraPreset] = {
        passed,
        expectedFallbackReason,
        samples,
        canvasSignal,
        explicitProbeDifference,
        explicitProbeMatch,
        screenshotPath: fallbackCapture.summary.screenshotPath
      };
      recordCheck(
        failures,
        passed,
        `${tier}: ${cameraPreset} did not remain a nonblank ${expectedFallbackReason} -> Probe fallback matching an explicit Probe capture for 30 frames.`
      );
    }
    await invokeOpticsApi(page, "setCameraPreset", "reflection-front");
    await invokeOpticsApi(page, "setReflectionSource", "planar");
    await waitForRenderedFrames(page, 4);
    const restoredPlanarMetrics = await readMetrics(page);
    recordCheck(
      failures,
      restoredPlanarMetrics?.resolvedReflectionSource === "planar" &&
        restoredPlanarMetrics?.planarCameraCount === 1 &&
        restoredPlanarMetrics?.planarRenderTargetCount === 1,
      `${tier}: Planar did not recover after validation fallback cases.`
    );

    // P0 calibration Gate 3: the marker exists only in the Planar Camera. Flat
    // surface inputs isolate projection correctness from intentional distortion.
    await invokeOpticsApi(page, "setCalibrationFeatureFlags", {
      waves: false,
      microNormals: false,
      foam: false
    });
    await invokeOpticsApi(page, "setCalibrationMode", "cpu-reference");
    await invokeOpticsApi(page, "setPlanarFilterEnabled", false);
    await invokeOpticsApi(page, "setReflectionSource", "planar");
    await invokeOpticsApi(page, "setPlanarAnchorVisible", false);
    const planarAnchorReference = await invokeOpticsApi(page, "getPlanarAnchorExpectedPoint");
    const expectedAnchorPixel = {
      x: planarAnchorReference.expectedScreenX,
      y: planarAnchorReference.expectedScreenY
    };

    await invokeOpticsApi(page, "setDebugView", "reflection-color");
    const anchorReflectionHiddenA = await captureState(
      page,
      tierDirectory,
      "planar-anchor-reflection-hidden-a",
      "reflection-color",
      VIEWPORT
    );
    const anchorReflectionHiddenB = await captureState(
      page,
      tierDirectory,
      "planar-anchor-reflection-hidden-b",
      "reflection-color",
      VIEWPORT
    );
    const reflectionMarkerNegativeControl = analyzePlanarGreenAnchor(
      anchorReflectionHiddenA.image,
      anchorReflectionHiddenB.image,
      expectedAnchorPixel
    );
    await invokeOpticsApi(page, "setPlanarAnchorVisible", true);
    const anchorReflectionVisible = await captureState(
      page,
      tierDirectory,
      "planar-anchor-reflection-visible",
      "reflection-color",
      VIEWPORT
    );
    const geometricPlanarAnchor = analyzePlanarGreenAnchor(
      anchorReflectionHiddenB.image,
      anchorReflectionVisible.image,
      expectedAnchorPixel
    );

    await invokeOpticsApi(page, "setDebugView", "final-framebuffer-color");
    await invokeOpticsApi(page, "setPlanarAnchorVisible", false);
    const anchorFinalHiddenA = await captureState(
      page,
      tierDirectory,
      "planar-anchor-final-hidden-a",
      "final-framebuffer-color",
      VIEWPORT
    );
    const anchorFinalHiddenB = await captureState(
      page,
      tierDirectory,
      "planar-anchor-final-hidden-b",
      "final-framebuffer-color",
      VIEWPORT
    );
    const finalMarkerNegativeControl = analyzePlanarGreenAnchor(
      anchorFinalHiddenA.image,
      anchorFinalHiddenB.image,
      expectedAnchorPixel
    );
    await invokeOpticsApi(page, "setPlanarAnchorVisible", true);
    const anchorFinalVisible = await captureState(
      page,
      tierDirectory,
      "planar-anchor-final-visible",
      "final-framebuffer-color",
      VIEWPORT
    );
    const finalPlanarAnchor = analyzePlanarGreenAnchor(
      anchorFinalHiddenB.image,
      anchorFinalVisible.image,
      expectedAnchorPixel
    );
    const finalToReflectionAnchorError =
      geometricPlanarAnchor.observedPixel && finalPlanarAnchor.observedPixel
        ? Math.hypot(
            geometricPlanarAnchor.observedPixel.x - finalPlanarAnchor.observedPixel.x,
            geometricPlanarAnchor.observedPixel.y - finalPlanarAnchor.observedPixel.y
          )
        : Number.POSITIVE_INFINITY;
    const geometricPlanarAnchorPassed =
      geometricPlanarAnchor.passed &&
      finalPlanarAnchor.passed &&
      !reflectionMarkerNegativeControl.passed &&
      reflectionMarkerNegativeControl.significantPixelCount === 0 &&
      !finalMarkerNegativeControl.passed &&
      finalMarkerNegativeControl.significantPixelCount === 0 &&
      finalToReflectionAnchorError <= THRESHOLDS.planarAnchorMaximumErrorPixels &&
      anchorReflectionHiddenB.metrics?.planarAnchorVisible === false &&
      anchorReflectionVisible.metrics?.planarAnchorVisible === true &&
      anchorFinalHiddenB.metrics?.planarAnchorVisible === false &&
      anchorFinalVisible.metrics?.planarAnchorVisible === true &&
      anchorReflectionVisible.metrics?.calibrationMode === "cpu-reference" &&
      anchorReflectionVisible.metrics?.calibrationFeatureFlags?.waves === false &&
      anchorReflectionVisible.metrics?.calibrationFeatureFlags?.microNormals === false;
    recordCheck(
      failures,
      geometricPlanarAnchorPassed,
      `${tier}: causal flat Planar anchor failed (reflection error=${geometricPlanarAnchor.errorPixels}, final error=${finalPlanarAnchor.errorPixels}, Final/reflection overlap=${finalToReflectionAnchorError}, reflection pixels=${geometricPlanarAnchor.significantPixelCount}, final pixels=${finalPlanarAnchor.significantPixelCount}, hidden reflection pixels=${reflectionMarkerNegativeControl.significantPixelCount}, hidden final pixels=${finalMarkerNegativeControl.significantPixelCount}).`
    );
    captures.planarAnchorReflectionHiddenA = anchorReflectionHiddenA.summary;
    captures.planarAnchorReflectionHiddenB = anchorReflectionHiddenB.summary;
    captures.planarAnchorReflectionVisible = anchorReflectionVisible.summary;
    captures.planarAnchorFinalHiddenA = anchorFinalHiddenA.summary;
    captures.planarAnchorFinalHiddenB = anchorFinalHiddenB.summary;
    captures.planarAnchorFinalVisible = anchorFinalVisible.summary;
    await invokeOpticsApi(page, "setPlanarAnchorVisible", false);

    const planarOrientationReference = await invokeOpticsApi(page, "getPlanarOrientationExpectedPoints");
    const planarOrientationExpectedPixels = Object.fromEntries(
      Object.entries(planarOrientationReference).map(([orientation, reference]) => [
        orientation,
        { x: reference.expectedScreenX, y: reference.expectedScreenY }
      ])
    );
    const orientationKeys = ["left", "right", "up", "down"];
    await invokeOpticsApi(page, "setPlanarOrientationMarkersVisible", false);
    await invokeOpticsApi(page, "setDebugView", "reflection-color");
    const orientationReflectionHiddenA = await captureState(
      page,
      tierDirectory,
      "planar-orientation-reflection-hidden-a",
      "reflection-color",
      VIEWPORT
    );
    const orientationReflectionHiddenB = await captureState(
      page,
      tierDirectory,
      "planar-orientation-reflection-hidden-b",
      "reflection-color",
      VIEWPORT
    );
    await invokeOpticsApi(page, "setPlanarOrientationMarkersVisible", true);
    const orientationReflectionVisible = await captureState(
      page,
      tierDirectory,
      "planar-orientation-reflection-visible",
      "reflection-color",
      VIEWPORT
    );

    await invokeOpticsApi(page, "setDebugView", "final-framebuffer-color");
    await invokeOpticsApi(page, "setPlanarOrientationMarkersVisible", false);
    const orientationFinalHiddenA = await captureState(
      page,
      tierDirectory,
      "planar-orientation-final-hidden-a",
      "final-framebuffer-color",
      VIEWPORT
    );
    const orientationFinalHiddenB = await captureState(
      page,
      tierDirectory,
      "planar-orientation-final-hidden-b",
      "final-framebuffer-color",
      VIEWPORT
    );
    await invokeOpticsApi(page, "setPlanarOrientationMarkersVisible", true);
    const orientationFinalVisible = await captureState(
      page,
      tierDirectory,
      "planar-orientation-final-visible",
      "final-framebuffer-color",
      VIEWPORT
    );

    const analyzeOrientationSet = (reference, visible) =>
      Object.fromEntries(
        orientationKeys.map((orientation) => [
          orientation,
          analyzePlanarOrientationMarker(
            reference,
            visible,
            planarOrientationExpectedPixels[orientation],
            orientation,
            THRESHOLDS.planarOrientationMaximumExpectedPointErrorPixels
          )
        ])
      );
    const orientationReflectionNegative = analyzeOrientationSet(
      orientationReflectionHiddenA.image,
      orientationReflectionHiddenB.image
    );
    const orientationReflection = analyzeOrientationSet(
      orientationReflectionHiddenB.image,
      orientationReflectionVisible.image
    );
    const orientationFinalNegative = analyzeOrientationSet(
      orientationFinalHiddenA.image,
      orientationFinalHiddenB.image
    );
    const orientationFinal = analyzeOrientationSet(orientationFinalHiddenB.image, orientationFinalVisible.image);
    const orientationFinalToReflectionError = Object.fromEntries(
      orientationKeys.map((orientation) => {
        const reflectionPoint = orientationReflection[orientation].nearestExpectedPixel;
        const finalPoint = orientationFinal[orientation].nearestExpectedPixel;
        return [
          orientation,
          reflectionPoint && finalPoint
            ? Math.hypot(reflectionPoint.x - finalPoint.x, reflectionPoint.y - finalPoint.y)
            : Number.POSITIVE_INFINITY
        ];
      })
    );
    const orientationReflectionObserved = Object.fromEntries(
      orientationKeys.map((orientation) => [orientation, orientationReflection[orientation].observedPixel])
    );
    const orientationFinalObserved = Object.fromEntries(
      orientationKeys.map((orientation) => [orientation, orientationFinal[orientation].observedPixel])
    );
    const allOrientationPointsObserved = orientationKeys.every(
      (orientation) => orientationReflectionObserved[orientation] && orientationFinalObserved[orientation]
    );
    const minimumPairwiseDistance = (points) => {
      let minimum = Number.POSITIVE_INFINITY;
      for (let leftIndex = 0; leftIndex < orientationKeys.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < orientationKeys.length; rightIndex++) {
          const left = points[orientationKeys[leftIndex]];
          const right = points[orientationKeys[rightIndex]];
          if (!left || !right) return 0;
          minimum = Math.min(minimum, Math.hypot(left.x - right.x, left.y - right.y));
        }
      }
      return minimum;
    };
    const orientationReflectionMinimumSeparation = minimumPairwiseDistance(orientationReflectionObserved);
    const orientationFinalMinimumSeparation = minimumPairwiseDistance(orientationFinalObserved);
    const planarOrientationPassed =
      orientationKeys.every(
        (orientation) =>
          orientationReflection[orientation].passed &&
          orientationFinal[orientation].passed &&
          orientationReflectionNegative[orientation].significantPixelCount === 0 &&
          orientationFinalNegative[orientation].significantPixelCount === 0 &&
          orientationFinalToReflectionError[orientation] <=
            THRESHOLDS.planarOrientationMaximumFinalToReflectionErrorPixels
      ) &&
      allOrientationPointsObserved &&
      orientationReflectionMinimumSeparation >= 8 &&
      orientationFinalMinimumSeparation >= 8 &&
      hasMatchingOrientationOrder(planarOrientationExpectedPixels, orientationReflectionObserved) &&
      hasMatchingOrientationOrder(planarOrientationExpectedPixels, orientationFinalObserved) &&
      orientationReflectionHiddenB.metrics?.planarOrientationMarkersVisible === false &&
      orientationReflectionVisible.metrics?.planarOrientationMarkersVisible === true &&
      orientationFinalHiddenB.metrics?.planarOrientationMarkersVisible === false &&
      orientationFinalVisible.metrics?.planarOrientationMarkersVisible === true;
    recordCheck(
      failures,
      planarOrientationPassed,
      `${tier}: four-color Planar orientation markers did not match CPU mirror points in Reflection and Final (${JSON.stringify(
        { orientationReflection, orientationFinal, orientationFinalToReflectionError }
      )}).`
    );
    captures.planarOrientationReflectionHiddenA = orientationReflectionHiddenA.summary;
    captures.planarOrientationReflectionHiddenB = orientationReflectionHiddenB.summary;
    captures.planarOrientationReflectionVisible = orientationReflectionVisible.summary;
    captures.planarOrientationFinalHiddenA = orientationFinalHiddenA.summary;
    captures.planarOrientationFinalHiddenB = orientationFinalHiddenB.summary;
    captures.planarOrientationFinalVisible = orientationFinalVisible.summary;

    await invokeOpticsApi(page, "setCalibrationFeatureFlags", {
      waves: false,
      microNormals: true,
      foam: false
    });
    await invokeOpticsApi(page, "setDebugView", "reflection-color");
    const planarMicroNormalDistortion = await captureState(
      page,
      tierDirectory,
      "planar-micro-normal-distortion",
      "reflection-color",
      VIEWPORT
    );
    captures.planarMicroNormalDistortion = planarMicroNormalDistortion.summary;
    const planarMicroNormalDifference = compareImages(
      anchorReflectionHiddenB.image,
      planarMicroNormalDistortion.image,
      REFLECTION_ROIS
    );
    const planarMicroNormalBorder = countBorderSentinels(planarMicroNormalDistortion.image);
    const planarMicroNormalPassed =
      planarMicroNormalDifference.srgbDecodedLinear.meanAbsoluteChannel >= 0.001 &&
      planarMicroNormalBorder.total === 0 &&
      planarMicroNormalDistortion.metrics?.calibrationFeatureFlags?.waves === false &&
      planarMicroNormalDistortion.metrics?.calibrationFeatureFlags?.microNormals === true &&
      planarMicroNormalDistortion.metrics?.calibrationFeatureFlags?.foam === false;
    recordCheck(
      failures,
      planarMicroNormalPassed,
      `${tier}: Planar micro-normal distortion was not causal and border-safe (${planarMicroNormalDifference.srgbDecodedLinear.meanAbsoluteChannel}, sentinels=${planarMicroNormalBorder.total}).`
    );

    await invokeOpticsApi(page, "setCalibrationMode", "none");
    await invokeOpticsApi(page, "setCalibrationFeatureFlags", {
      waves: false,
      microNormals: false,
      foam: false
    });
    await invokeOpticsApi(page, "setPlanarOrientationMarkersVisible", false);
    await invokeOpticsApi(page, "setReflectorMovementEnabled", false);
    await invokeOpticsApi(page, "setRefractionEnabled", false);
    await invokeOpticsApi(page, "setDebugView", "reflection-color");

    await invokeOpticsApi(page, "setReflectionSource", "probe");
    await invokeOpticsApi(page, "setReflectorTime", REFLECTOR_RIGHT_TIME);
    const reflectorProbeRightA = await captureState(
      page,
      tierDirectory,
      "reflector-probe-right-control-a",
      "reflection-color"
    );
    const reflectorProbeRightB = await captureState(
      page,
      tierDirectory,
      "reflector-probe-right-control-b",
      "reflection-color"
    );
    await invokeOpticsApi(page, "setReflectorTime", REFLECTOR_LEFT_TIME);
    const reflectorProbeLeft = await captureState(page, tierDirectory, "reflector-probe-left", "reflection-color");

    await invokeOpticsApi(page, "setReflectionSource", "planar");
    await invokeOpticsApi(page, "setReflectorTime", REFLECTOR_RIGHT_TIME);
    const reflectorPlanarRightA = await captureState(
      page,
      tierDirectory,
      "reflector-planar-right-control-a",
      "reflection-color"
    );
    const reflectorPlanarRightB = await captureState(
      page,
      tierDirectory,
      "reflector-planar-right-control-b",
      "reflection-color"
    );
    await invokeOpticsApi(page, "setReflectorTime", REFLECTOR_LEFT_TIME);
    const reflectorPlanarLeft = await captureState(page, tierDirectory, "reflector-planar-left", "reflection-color");
    captures.reflectorProbeRightControlA = reflectorProbeRightA.summary;
    captures.reflectorProbeRightControlB = reflectorProbeRightB.summary;
    captures.reflectorProbeLeft = reflectorProbeLeft.summary;
    captures.reflectorPlanarRightControlA = reflectorPlanarRightA.summary;
    captures.reflectorPlanarRightControlB = reflectorPlanarRightB.summary;
    captures.reflectorPlanarLeft = reflectorPlanarLeft.summary;
    const reflectorProbeNoise = compareImages(reflectorProbeRightA.image, reflectorProbeRightB.image, [
      ROIS.planarReflector
    ]);
    const reflectorProbeMovement = compareImages(reflectorProbeRightB.image, reflectorProbeLeft.image, [
      ROIS.planarReflector
    ]);
    const reflectorPlanarNoise = compareImages(reflectorPlanarRightA.image, reflectorPlanarRightB.image, [
      ROIS.planarReflector
    ]);
    const reflectorPlanarMovement = compareImages(reflectorPlanarRightB.image, reflectorPlanarLeft.image, [
      ROIS.planarReflector
    ]);
    const reflectorProbeMaximum = Math.max(
      0.0008,
      THRESHOLDS.movingReflectorNoiseMultiplier * reflectorProbeNoise.srgbDecodedLinear.meanAbsoluteChannel
    );
    const reflectorPlanarMinimum = Math.max(
      THRESHOLDS.movingReflectorMinimumPlanarMad,
      THRESHOLDS.movingReflectorNoiseMultiplier * reflectorPlanarNoise.srgbDecodedLinear.meanAbsoluteChannel,
      THRESHOLDS.movingReflectorMinimumPlanarToProbeRatio * reflectorProbeMovement.srgbDecodedLinear.meanAbsoluteChannel
    );
    const reflectorPositionDelta = Math.abs(
      reflectorPlanarRightB.metrics.reflectorWorldPosition[0] - reflectorPlanarLeft.metrics.reflectorWorldPosition[0]
    );
    const movingReflectorPassed =
      reflectorPositionDelta >= 14 &&
      reflectorProbeMovement.srgbDecodedLinear.meanAbsoluteChannel <= reflectorProbeMaximum &&
      reflectorPlanarMovement.srgbDecodedLinear.meanAbsoluteChannel >= reflectorPlanarMinimum &&
      reflectorProbeRightB.metrics?.resolvedReflectionSource === "probe" &&
      reflectorProbeRightB.metrics?.planarCameraCount === 0 &&
      reflectorProbeRightB.metrics?.planarRenderTargetCount === 0 &&
      reflectorPlanarRightB.metrics?.resolvedReflectionSource === "planar" &&
      reflectorPlanarRightB.metrics?.planarCameraCount === 1 &&
      reflectorPlanarRightB.metrics?.planarRenderTargetCount === 1 &&
      reflectorPlanarLeft.metrics?.resolvedReflectionSource === "planar" &&
      reflectorPlanarLeft.metrics?.planarCameraCount === 1 &&
      reflectorPlanarLeft.metrics?.planarRenderTargetCount === 1 &&
      reflectorPlanarRightB.metrics?.reflectorTimeOverrideActive === true &&
      reflectorPlanarLeft.metrics?.reflectorTimeOverrideActive === true;
    recordCheck(
      failures,
      movingReflectorPassed,
      `${tier}: moving opaque reflector was not causally visible only through Planar reflection (position delta=${reflectorPositionDelta}, Probe MAD=${reflectorProbeMovement.srgbDecodedLinear.meanAbsoluteChannel}/${reflectorProbeMaximum}, Planar MAD=${reflectorPlanarMovement.srgbDecodedLinear.meanAbsoluteChannel}/${reflectorPlanarMinimum}).`
    );

    await invokeOpticsApi(page, "setReflectorMovementEnabled", true);
    await invokeOpticsApi(page, "setPlanarOrientationMarkersVisible", true);
    await invokeOpticsApi(page, "setLocalFoamMaskEnabled", true);
    await invokeOpticsApi(page, "setCalibrationFeatureFlags", {
      waves: true,
      microNormals: true,
      foam: true
    });
    await invokeOpticsApi(page, "setDebugView", "final-framebuffer-color");

    await invokeOpticsApi(page, "setRefractionEnabled", false);
    await invokeOpticsApi(page, "setPlanarClipEnabled", false);
    const planarClipOff = await captureState(page, tierDirectory, "planar-clip-off", "final-framebuffer-color");
    captures.planarClipOff = planarClipOff.summary;
    await invokeOpticsApi(page, "setPlanarClipEnabled", true);
    const planarClipMask = await captureState(page, tierDirectory, "planar-clip-mask", "final-framebuffer-color");
    captures.planarClipMask = planarClipMask.summary;
    goldenBaselines.planarClipMask = await verifyGoldenBaseline(
      page,
      tier,
      committedBaselines,
      "planar-clip-mask.png",
      planarClipMask
    );
    recordCheck(
      failures,
      goldenBaselines.planarClipMask.passed,
      `${tier}: planar-clip-mask Golden diff ratio ${goldenBaselines.planarClipMask.diffPixelRatio} exceeds ${THRESHOLDS.goldenMaximumDiffPixelRatio}.`
    );
    const planarClipOffSentinel = analyzePlanarClipSentinel(planarClipOff.image, ROIS.planarClip);
    const planarClipOnSentinel = analyzePlanarClipSentinel(planarClipMask.image, ROIS.planarClip);
    const planarClipPassed =
      planarClipOffSentinel.coverage >= THRESHOLDS.planarClipOffMinimumCoverage &&
      planarClipOnSentinel.coverage <= THRESHOLDS.planarClipOnMaximumCoverage &&
      planarClipOff.metrics?.planarClipEnabled === false &&
      planarClipMask.metrics?.planarClipEnabled === true;
    recordCheck(
      failures,
      planarClipPassed,
      `${tier}: Planar clip sentinel coverage off/on ${planarClipOffSentinel.coverage}/${planarClipOnSentinel.coverage} misses ${THRESHOLDS.planarClipOffMinimumCoverage}/${THRESHOLDS.planarClipOnMaximumCoverage}.`
    );
    const crossingColumnClip = Object.fromEntries(
      [
        ["red", 0],
        ["green", 1],
        ["blue", 2]
      ].map(([name, channel]) => {
        const off = analyzeDominantColorCoverage(planarClipOff.image, UNDERWATER_ROIS, channel);
        const on = analyzeDominantColorCoverage(planarClipMask.image, UNDERWATER_ROIS, channel);
        return [
          name,
          {
            off,
            on,
            revealedReflectionPixelDelta: on.dominantPixelCount - off.dominantPixelCount
          }
        ];
      })
    );
    const crossingColumnClipPassed = Object.values(crossingColumnClip).every(
      ({ on, revealedReflectionPixelDelta }) =>
        on.dominantPixelCount >= 4 &&
        revealedReflectionPixelDelta >= THRESHOLDS.crossingColumnMinimumRevealedReflectionPixels
    );
    recordCheck(
      failures,
      crossingColumnClipPassed,
      `${tier}: Planar clip did not remove the below-water occluder and reveal the reflected above-water RGB column segments (${JSON.stringify(
        crossingColumnClip
      )}).`
    );
    await invokeOpticsApi(page, "setRefractionEnabled", true);

    result.colorSpaceEvidence = {
      ...controlA.image.colorSpace,
      readback: "CanvasRenderingContext2D.getImageData RGBA8 after drawImage from the WebGL canvas",
      rawEvidence: "RGB bytes normalized to [0,1] and retained as sRGB-encoded evidence",
      linearEvidence: "RGB bytes decoded with the IEC 61966-2-1 sRGB transfer function before thresholding",
      alphaDebugEvidence: "Surface-alpha grayscale RGB is decoded with the same sRGB transfer function",
      thresholdsAppliedTo: "srgbDecodedLinear"
    };
    result.controlNoise = {
      refractionWater: refractionControlNoise,
      foregroundRail: railControlNoise,
      reflectionWater: reflectionControlNoise
    };
    result.gates = {
      goldenBaselines: {
        passed: Object.values(goldenBaselines).every((comparison) => comparison.passed),
        comparisons: goldenBaselines
      },
      refraction: {
        passed: refractionPassed,
        threshold: refractionThreshold,
        difference: refractionDifference
      },
      foregroundRail: {
        passed: foregroundRailPassed,
        threshold: foregroundRailThreshold,
        difference: foregroundRailDifference
      },
      aboveWaterColumns: {
        passed: aboveWaterPassed,
        threshold: aboveWaterThreshold,
        controlNoise: aboveWaterControlNoise,
        difference: aboveWaterDifference
      },
      borderSentinel: border,
      probe: {
        passed: probeMetricsPassed && probeVisualPassed,
        metricsPassed: probeMetricsPassed,
        visualPassed: probeVisualPassed,
        threshold: probeThreshold,
        difference: probeDifference,
        metrics: summarizeMetrics(probe.metrics),
        domMetrics: probe.domMetrics
      },
      localFoam: {
        passed: localFoamPassed && localFoamFinalVisiblePassed && localFoamMasterOffPassed,
        refractionSuppression: {
          passed: localFoamPassed,
          insideControlNoise: localFoamInsideControlNoise,
          outsideControlNoise: localFoamOutsideControlNoise,
          insideDifference: localFoamInsideDifference,
          outsideDifference: localFoamOutsideDifference,
          insideThreshold: localFoamInsideThreshold,
          outsideThreshold: localFoamOutsideThreshold,
          meanReduction: localFoamMeanReduction
        },
        finalVisibility: {
          passed: localFoamFinalVisiblePassed,
          insideDifference: localFoamFinalInsideDifference,
          outsideDifference: localFoamFinalOutsideDifference,
          minimumInsideMad: THRESHOLDS.localFoamMinimumFinalInsideMad,
          minimumInsideOutsideRatio: THRESHOLDS.localFoamMinimumInsideOutsideRatio
        },
        masterOffNegativeControl: {
          passed: localFoamMasterOffPassed,
          difference: localFoamMasterOffDifference,
          maximumMad: THRESHOLDS.localFoamMasterOffMaximumMad
        }
      },
      planar: {
        passed:
          planarResourcePassed &&
          planarAnchorPassed &&
          geometricPlanarAnchorPassed &&
          planarOrientationPassed &&
          movingReflectorPassed &&
          planarMicroNormalPassed &&
          planarClipPassed &&
          crossingColumnClipPassed &&
          Object.values(planarFallbackCases).every((entry) => entry.passed),
        resourcePassed: planarResourcePassed,
        anchorPassed: planarAnchorPassed,
        geometricAnchorPassed: geometricPlanarAnchorPassed,
        geometricAnchor: {
          reference: planarAnchorReference,
          reflectionColor: geometricPlanarAnchor,
          finalFramebuffer: finalPlanarAnchor,
          negativeControls: {
            reflectionColor: reflectionMarkerNegativeControl,
            finalFramebuffer: finalMarkerNegativeControl
          },
          finalToReflectionAnchorError,
          maximumErrorPixels: THRESHOLDS.planarAnchorMaximumErrorPixels,
          reflectionHiddenScreenshotPath: anchorReflectionHiddenB.summary.screenshotPath,
          reflectionVisibleScreenshotPath: anchorReflectionVisible.summary.screenshotPath,
          finalHiddenScreenshotPath: anchorFinalHiddenB.summary.screenshotPath,
          finalVisibleScreenshotPath: anchorFinalVisible.summary.screenshotPath
        },
        orientation: {
          passed: planarOrientationPassed,
          reference: planarOrientationReference,
          expectedPixels: planarOrientationExpectedPixels,
          reflectionColor: orientationReflection,
          finalFramebuffer: orientationFinal,
          negativeControls: {
            reflectionColor: orientationReflectionNegative,
            finalFramebuffer: orientationFinalNegative
          },
          finalToReflectionError: orientationFinalToReflectionError,
          minimumSeparationPixels: {
            reflectionColor: orientationReflectionMinimumSeparation,
            finalFramebuffer: orientationFinalMinimumSeparation
          },
          maximumExpectedPointErrorPixels: THRESHOLDS.planarOrientationMaximumExpectedPointErrorPixels,
          maximumFinalToReflectionErrorPixels: THRESHOLDS.planarOrientationMaximumFinalToReflectionErrorPixels
        },
        movingReflector: {
          passed: movingReflectorPassed,
          times: { right: REFLECTOR_RIGHT_TIME, left: REFLECTOR_LEFT_TIME },
          positionDelta: reflectorPositionDelta,
          roi: ROIS.planarReflector,
          probe: {
            controlNoise: reflectorProbeNoise,
            movement: reflectorProbeMovement,
            maximumMad: reflectorProbeMaximum
          },
          planar: {
            controlNoise: reflectorPlanarNoise,
            movement: reflectorPlanarMovement,
            minimumMad: reflectorPlanarMinimum
          }
        },
        microNormalDistortion: {
          passed: planarMicroNormalPassed,
          difference: planarMicroNormalDifference,
          border: planarMicroNormalBorder,
          screenshotPath: planarMicroNormalDistortion.summary.screenshotPath
        },
        clipPassed: planarClipPassed,
        clip: {
          roi: ROIS.planarClip,
          off: planarClipOffSentinel,
          on: planarClipOnSentinel,
          thresholds: {
            offMinimumCoverage: THRESHOLDS.planarClipOffMinimumCoverage,
            onMaximumCoverage: THRESHOLDS.planarClipOnMaximumCoverage
          },
          offScreenshotPath: planarClipOff.summary.screenshotPath,
          maskScreenshotPath: planarClipMask.summary.screenshotPath
        },
        crossingColumns: {
          passed: crossingColumnClipPassed,
          minimumRevealedReflectionPixels: THRESHOLDS.crossingColumnMinimumRevealedReflectionPixels,
          colors: crossingColumnClip
        },
        fallbackCases: planarFallbackCases,
        difference: planarDifference,
        anchor: planarAnchor,
        metrics: summarizeMetrics(planar.metrics),
        domMetrics: planar.domMetrics,
        anchorScreenshotPath: planar.summary.screenshotPath
      },
      composition: {
        passed: compositionDecisionReliable,
        instrumentationPassed: debugInstrumentationPassed,
        strongestDebugSignal,
        debugSignalThreshold,
        alphaEvidence,
        debugSignals,
        extendedDebugSignals,
        legacyAnalysis: compositionAnalysis,
        legacyCalibrationPixel: compositionPixel,
        precomposedTargetMatch: {
          depthWriteOff: precomposedDepthOffTarget,
          depthWriteOn: precomposedDepthOnTarget
        },
        ...compositionDecision,
        edgeHalo: !foregroundRailPassed || !border.passed,
        thresholds: {
          predictionMaximum: THRESHOLDS.compositionPredictionMaximumError,
          targetConfirmationMinimum: THRESHOLDS.compositionTargetConfirmationMinimumError,
          targetMatchMaximum: THRESHOLDS.compositionTargetMatchMaximumError
        }
      },
      transparentOrdering: {
        passed: transparentOrderingPassed,
        metricsPassed: transparentOrderingMetricsPassed,
        visualPassed: transparentOrderingVisualPassed,
        roi: ROIS.transparentOrderingSentinel,
        priorities: {
          water: transparentOrderingAfterWater.metrics?.waterRendererPriority,
          activeWater: transparentOrderingAfterWater.metrics?.activeWaterRendererPriority,
          normalTransparent: transparentOrderingAfterWater.metrics?.transparentSentinelNormalPriority,
          negativeControlTransparent: transparentOrderingBeforeWater.metrics?.transparentSentinelPriority
        },
        blendEnabled: transparentOrderingAfterWater.metrics?.waterBlendEnabled,
        controlNoise: transparentOrderingControlNoise,
        afterWaterDifference: transparentOrderingAfterDifference,
        beforeWaterNegativeDifference: transparentOrderingBeforeDifference,
        priorityFlipDifference: transparentOrderingPriorityDifference,
        thresholds: {
          positiveMinimum: transparentOrderingPositiveThreshold,
          negativeMaximum: transparentOrderingNegativeThreshold
        },
        hiddenScreenshotPath: transparentOrderingHiddenB.summary.screenshotPath,
        afterWaterScreenshotPath: transparentOrderingAfterWater.summary.screenshotPath,
        beforeWaterNegativeScreenshotPath: transparentOrderingBeforeWater.summary.screenshotPath
      },
      pureTransmission: {
        passed: pureTransmissionPassed,
        validity: {
          validPixelCount: pureValidity.validPixelCount,
          minimumValidPixelCount: THRESHOLDS.pureTransmissionMinimumValidPixelCount,
          minimumValidity: pureValidity.minimumValidity,
          erosionRadiusPixels: pureValidity.erosionRadiusPixels
        },
        finalToDisplaced: pureFinalToDisplaced,
        displacedToCentered: pureDisplacedToCentered,
        displacementMinimum: pureDisplacementThreshold,
        fresnel: pureFresnel,
        profile: pureProfile,
        profilePassed: pureProfilePassed,
        maximumFinalToDisplacedMad: THRESHOLDS.pureTransmissionMaximumMad,
        maximumFresnel: THRESHOLDS.pureTransmissionMaximumFresnel
      },
      cpuReference: {
        passed: cpuReferencePassed,
        validity: {
          validPixelCount: cpuValidity.validPixelCount,
          minimumValidPixelCount: THRESHOLDS.pureTransmissionMinimumValidPixelCount,
          minimumValidity: cpuValidity.minimumValidity,
          erosionRadiusPixels: cpuValidity.erosionRadiusPixels
        },
        selectedPixel: cpuPixel,
        inputs: {
          sourceColor,
          reflectionColor,
          opticalDepthNormalized,
          opticalDepthNormalizationMeters,
          opticalDistance,
          normalDotView
        },
        shaderCompositedColor,
        finalFramebufferColor,
        analysis: cpuReferenceAnalysis,
        finalToShaderError,
        notClamped: cpuReferenceNotClamped,
        maximumChannelError: THRESHOLDS.referenceMaximumChannelError
      },
      transmittanceDepthOrdering: {
        passed: transmittanceOrderingPassed,
        debugView: "refraction-gates",
        channel: "blue",
        order: ["shallow", "medium", "deep"],
        means: transmittanceByDepth,
        minimumStep: THRESHOLDS.transmittanceMinimumDepthStep
      }
    };
  } catch (error) {
    failures.push(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  } finally {
    try {
      await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
      await page.waitForTimeout(100);
      result.cleanup.aboutBlank = true;
    } catch (error) {
      failures.push(`[cleanup] ${error instanceof Error ? error.message : String(error)}`);
    }
    if (diagnostics.errors.length > 0) failures.push(...diagnostics.errors);
    try {
      await context.close();
      result.cleanup.contextClosed = true;
    } catch (error) {
      failures.push(`[context-close] ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  result.status = failures.length === 0 ? "passed" : "failed";
  return result;
}

assert(!isInsideDirectory(outputDirectory, BASELINE_ROOT), `Refusing to write visual output under ${BASELINE_ROOT}.`);
await mkdir(outputDirectory, { recursive: true });

const targetUrl = new URL(process.env.WATER_OPTICS_URL ?? DEFAULT_URL);
const report = {
  schemaVersion: 1,
  gate: "water-optics-p0-visual",
  status: "running",
  generatedAt: new Date().toISOString(),
  outputDirectory,
  baselineRoot: BASELINE_ROOT,
  baselineSource: "sha256-verified-local-files-only",
  baselineReviewReason: BASELINE_REVIEW_REASON || null,
  baselinePreflight: [],
  fixedEnvironment: {
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    analysisSize: ANALYSIS_SIZE,
    surfaceTime: FIXED_SURFACE_TIME,
    statsEnabled: false,
    browser: "chromium",
    headed
  },
  thresholds: THRESHOLDS,
  roiSource: "WaterOpticsLabFixture.WATER_OPTICS_LAB_ROIS",
  rois: ROIS,
  tiers: [],
  failures: []
};

let browser;
try {
  assert(
    BASELINE_REVIEW_REASON.length === 0 || BASELINE_REVIEW_REASON.length >= 12,
    "P0 baseline review requires WATER_OPTICS_P0_BASELINE_REVIEW_REASON with at least 12 characters."
  );
  const committedBaselines = {};
  for (const tier of TIERS) {
    const manifest = await loadCommittedBaselines(tier);
    committedBaselines[tier] = manifest;
    report.baselinePreflight.push({
      tier,
      schemaPath: manifest.schemaPath,
      schemaVersion: manifest.schemaVersion,
      captures: Object.fromEntries(
        Object.entries(manifest.baselines).map(([fileName, baseline]) => [
          fileName,
          { localPath: baseline.localPath, sha256: baseline.sha256 }
        ])
      )
    });
  }
  browser = await chromium.launch({ headless: !headed });
  report.browserVersion = browser.version();
  for (const tier of TIERS) {
    report.tiers.push(await verifyTier(browser, targetUrl, tier, committedBaselines[tier]));
  }
  report.failures = report.tiers.flatMap((tierResult) =>
    tierResult.failures.map((failure) => `${tierResult.tier}: ${failure}`)
  );
  report.status = report.failures.length === 0 ? "passed" : "failed";
} catch (error) {
  report.failures.push(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  report.status = "failed";
} finally {
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      report.failures.push(`[browser-close] ${error instanceof Error ? error.message : String(error)}`);
      report.status = "failed";
    }
  }
  report.completedAt = new Date().toISOString();
  const reportPath = resolve(outputDirectory, "result.json");
  report.reportPath = reportPath;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

if (report.status !== "passed") process.exitCode = 1;
