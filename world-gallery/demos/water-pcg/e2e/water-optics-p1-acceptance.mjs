import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const DEFAULT_URL = "http://127.0.0.1:4179/demos/water-pcg/#water-optics-lab";
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const DEVICE_SCALE_FACTOR = 1;
const FIXED_SURFACE_TIME = 12.5;
const OWNER_STABILITY_FRAMES = 300;
const HANDOFF_LIMIT_FRAMES = 6;
const STRESS_ITERATIONS = Math.max(
  1,
  Math.min(
    100,
    Number.parseInt(
      process.env.WATER_OPTICS_P1_STRESS_ITERATIONS ?? (process.env.WATER_OPTICS_P1_NIGHTLY === "1" ? "100" : "10"),
      10
    ) || 10
  )
);
const TIERS = Object.freeze(["medium", "high"]);
const LIFECYCLE_TIER_SEQUENCE = Object.freeze(["medium", "high", "experimental"]);
const EXPERIMENTAL_TIER_FALLBACK_REASON = "water-optics-experimental-resolved-high";
const UPDATE_BASELINES = process.env.WATER_OPTICS_P1_UPDATE_BASELINES === "1";
const BASELINE_UPDATE_REASON = (process.env.WATER_OPTICS_P1_BASELINE_UPDATE_REASON ?? "").trim();
const HEADED = process.env.WATER_OPTICS_HEADED === "1";
const RENDERER_LANES = Object.freeze(["canonical-golden", "native-hardware"]);
const RENDERER_LANE = process.env.WATER_OPTICS_P1_RENDERER_LANE ?? "canonical-golden";
const IS_CANONICAL_GOLDEN_LANE = RENDERER_LANE === "canonical-golden";
const CANONICAL_RENDERER_SUBSTRING = "SwiftShader";
const NATIVE_RENDERER_SUBSTRING = process.env.WATER_OPTICS_P1_NATIVE_RENDERER_SUBSTRING ?? "ANGLE Metal Renderer";
const SOFTWARE_RENDERER_PATTERN =
  /SwiftShader|llvmpipe|softpipe|software rasterizer|Microsoft Basic Render|\bWARP\b|lavapipe/i;
const BROWSER_LAUNCH_ARGUMENTS = Object.freeze(IS_CANONICAL_GOLDEN_LANE ? ["--use-angle=swiftshader"] : []);
const SCRIPT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const WORLD_GALLERY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const DEFAULT_BASELINE_ROOT = resolve(WORLD_GALLERY_ROOT, "demos/water-pcg/e2e/baselines/water-optics/p1");
const BASELINE_ROOT = resolve(process.env.WATER_OPTICS_P1_BASELINE_ROOT ?? DEFAULT_BASELINE_ROOT);
const BASELINE_UPDATE_FAILURE_INJECTION = process.env.WATER_OPTICS_P1_TEST_FAIL_BASELINE_STEP ?? "";
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const OUTPUT_DIRECTORY = resolve(
  process.env.WATER_OPTICS_P1_OUTPUT_DIR ?? resolve(WORLD_GALLERY_ROOT, "output/playwright/water-optics-p1-acceptance"),
  runId
);

const ROIS = Object.freeze({
  bodyMatrix: Object.freeze({
    river: Object.freeze([0.02, 0.31, 0.29, 0.46]),
    poolHeightfield: Object.freeze([0.31, 0.34, 0.38, 0.43]),
    ocean: Object.freeze([0.69, 0.31, 0.29, 0.46])
  }),
  dualPool: Object.freeze({
    primaryPool: Object.freeze([0.08, 0.31, 0.39, 0.46]),
    secondaryPool: Object.freeze([0.53, 0.31, 0.39, 0.46]),
    river: Object.freeze([0.4, 0.23, 0.2, 0.22])
  }),
  ownerHud: Object.freeze([0, 0, 0.43, 0.32])
});
const BASELINE_MAXIMUM_ROI_MAD = 0.035;
const BASELINE_MINIMUM_ROI_VARIANCE = 0.0005;
const BASELINE_MAXIMUM_DIFF_PIXEL_RATIO = 0.005;
const BASELINE_PER_CHANNEL_BYTE_TOLERANCE = 2;
const NATIVE_MINIMUM_FEATURE_DIFF_PIXELS = 16;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findNonFinite(value, path = "metrics") {
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => findNonFinite(child, `${path}.${key}`));
}

function targetUrl(baseUrl, tier, preset = "cross-body-optics") {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "water-optics-lab";
  url.searchParams.set("quality", tier);
  url.searchParams.set("waterOptics", tier);
  url.searchParams.set("opticsPreset", preset);
  url.searchParams.set("surfaceTime", String(FIXED_SURFACE_TIME));
  url.searchParams.set("stats", "0");
  url.searchParams.set("statsPanel", "hidden");
  url.searchParams.set("screenshot", "1");
  return url.href;
}

function collectDiagnostics(page) {
  const diagnostics = { errors: [], warnings: [], readbackWarnings: [] };
  page.on("pageerror", (error) => diagnostics.errors.push(`[pageerror] ${error.stack ?? error.message}`));
  page.on("crash", () => diagnostics.errors.push("[page-crash] Chromium page crashed."));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") diagnostics.errors.push(`[console-error] ${text}`);
    else if (message.type() === "warning") {
      if (/GPU stall due to ReadPixels/i.test(text)) {
        diagnostics.readbackWarnings.push(text);
        return;
      }
      diagnostics.warnings.push(text);
      if (
        /WebGL(?:[\s:.-]|$)|GL_INVALID_|INVALID_(?:ENUM|VALUE|OPERATION|FRAMEBUFFER_OPERATION)|shader\s+(?:compile|link)|Could not (?:compile|link)|CONTEXT_LOST_WEBGL/i.test(
          text
        )
      ) {
        diagnostics.errors.push(`[webgl-warning] ${text}`);
      }
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

async function invoke(page, method, ...args) {
  return page.evaluate(
    async ({ method, args }) => {
      const api = window.waterPcgOptics;
      if (!api) throw new Error("window.waterPcgOptics is unavailable.");
      const candidate = api[method];
      if (typeof candidate !== "function") throw new Error(`waterPcgOptics.${method} is unavailable.`);
      return candidate.apply(api, args);
    },
    { method, args }
  );
}

async function metrics(page) {
  return page.evaluate(() => structuredClone(window.waterPcgOptics?.metrics));
}

async function collectRuntimeEnvironment(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Water Optics canvas is unavailable.");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) throw new Error("Water Optics WebGL context is unavailable.");
    const debugRendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const readString = (parameter) => {
      const value = gl.getParameter(parameter);
      return typeof value === "string" ? value : String(value ?? "");
    };
    const contextAttributes = gl.getContextAttributes();
    const rect = canvas.getBoundingClientRect();
    const snapshot = window.waterPcgOptics?.metrics;
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      graphicsApi:
        typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext ? "webgl2" : "webgl1",
      webgl: {
        vendor: readString(gl.VENDOR),
        renderer: readString(gl.RENDERER),
        version: readString(gl.VERSION),
        shadingLanguageVersion: readString(gl.SHADING_LANGUAGE_VERSION),
        unmaskedVendor: debugRendererInfo
          ? readString(debugRendererInfo.UNMASKED_VENDOR_WEBGL)
          : "extension-unavailable",
        unmaskedRenderer: debugRendererInfo
          ? readString(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
          : "extension-unavailable",
        samples: gl.getParameter(gl.SAMPLES),
        maximumSamples: gl.getParameter(gl.MAX_SAMPLES),
        drawingBufferColorSpace: gl.drawingBufferColorSpace ?? "unavailable",
        contextAttributes: contextAttributes
          ? {
              alpha: contextAttributes.alpha,
              antialias: contextAttributes.antialias,
              depth: contextAttributes.depth,
              desynchronized: contextAttributes.desynchronized,
              failIfMajorPerformanceCaveat: contextAttributes.failIfMajorPerformanceCaveat,
              powerPreference: contextAttributes.powerPreference,
              premultipliedAlpha: contextAttributes.premultipliedAlpha,
              preserveDrawingBuffer: contextAttributes.preserveDrawingBuffer,
              stencil: contextAttributes.stencil,
              xrCompatible: contextAttributes.xrCompatible
            }
          : null
      },
      display: {
        devicePixelRatio: window.devicePixelRatio,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        screenColorDepth: window.screen.colorDepth,
        screenPixelDepth: window.screen.pixelDepth,
        colorGamut: matchMedia("(color-gamut: rec2020)").matches
          ? "rec2020"
          : matchMedia("(color-gamut: p3)").matches
            ? "p3"
            : "srgb"
      },
      canvas: {
        bufferWidth: canvas.width,
        bufferHeight: canvas.height,
        cssWidth: rect.width,
        cssHeight: rect.height
      },
      readback: snapshot
        ? {
            preset: snapshot.preset,
            cameraPreset: snapshot.cameraPreset,
            requestedTier: snapshot.requestedTier,
            resolvedTier: snapshot.resolvedTier,
            reflectionSource: snapshot.reflectionSource,
            resolvedReflectionSource: snapshot.resolvedReflectionSource,
            refractionEnabled: snapshot.refractionEnabled,
            frozen: snapshot.frozen,
            surfaceTime: snapshot.surfaceTime,
            statsEnabled: snapshot.statsEnabled,
            statsPanelVisible: snapshot.statsPanelVisible
          }
        : null
    };
  });
}

function assertRuntimeEnvironment(environment, tier) {
  assert(environment.graphicsApi === "webgl2", `${tier}: expected WebGL2, got ${environment.graphicsApi}.`);
  assert(
    environment.webgl.unmaskedRenderer.length > 0 && environment.webgl.unmaskedRenderer !== "extension-unavailable",
    `${tier}: WEBGL_debug_renderer_info renderer evidence is unavailable.`
  );
  if (IS_CANONICAL_GOLDEN_LANE) {
    assert(
      environment.webgl.unmaskedRenderer.includes(CANONICAL_RENDERER_SUBSTRING),
      `${tier}: canonical Golden requires ${CANONICAL_RENDERER_SUBSTRING}, got ${environment.webgl.unmaskedRenderer}.`
    );
  } else {
    assert(
      environment.webgl.unmaskedRenderer.includes(NATIVE_RENDERER_SUBSTRING),
      `${tier}: native-hardware requires renderer substring ${NATIVE_RENDERER_SUBSTRING}, got ${environment.webgl.unmaskedRenderer}.`
    );
    assert(
      !SOFTWARE_RENDERER_PATTERN.test(environment.webgl.unmaskedRenderer),
      `${tier}: native-hardware lane resolved to a software renderer: ${environment.webgl.unmaskedRenderer}.`
    );
  }
  assert(environment.webgl.contextAttributes?.antialias === false, `${tier}: WebGL antialias must be disabled.`);
  assert(
    environment.webgl.samples === 0,
    `${tier}: default framebuffer samples changed to ${environment.webgl.samples}.`
  );
  assert(environment.display.devicePixelRatio === DEVICE_SCALE_FACTOR, `${tier}: DPR changed.`);
  assert(
    environment.display.innerWidth === VIEWPORT.width && environment.display.innerHeight === VIEWPORT.height,
    `${tier}: viewport is ${environment.display.innerWidth}x${environment.display.innerHeight}.`
  );
  assert(
    environment.canvas.bufferWidth === VIEWPORT.width && environment.canvas.bufferHeight === VIEWPORT.height,
    `${tier}: canvas buffer is ${environment.canvas.bufferWidth}x${environment.canvas.bufferHeight}.`
  );
  assert(
    environment.canvas.cssWidth === VIEWPORT.width && environment.canvas.cssHeight === VIEWPORT.height,
    `${tier}: canvas CSS size is ${environment.canvas.cssWidth}x${environment.canvas.cssHeight}.`
  );
  const readback = environment.readback;
  assert(readback !== null, `${tier}: runtime readback is unavailable.`);
  assert(readback.preset === "cross-body-optics", `${tier}: preset is ${readback.preset}.`);
  assert(readback.cameraPreset === "multi-water", `${tier}: camera preset is ${readback.cameraPreset}.`);
  assert(readback.requestedTier === tier, `${tier}: readback requested tier is ${readback.requestedTier}.`);
  assert(readback.resolvedTier === tier, `${tier}: readback resolved tier is ${readback.resolvedTier}.`);
  assert(readback.reflectionSource === "planar", `${tier}: reflection source is ${readback.reflectionSource}.`);
  assert(
    readback.resolvedReflectionSource === "planar",
    `${tier}: resolved reflection source is ${readback.resolvedReflectionSource}.`
  );
  assert(readback.refractionEnabled === true, `${tier}: refraction is disabled.`);
  assert(readback.frozen === true, `${tier}: surface time is not frozen.`);
  assert(Math.abs(readback.surfaceTime - FIXED_SURFACE_TIME) <= Number.EPSILON, `${tier}: surface time drifted.`);
  assert(readback.statsEnabled === false, `${tier}: formal visual validation must disable Stats.`);
  assert(readback.statsPanelVisible === false, `${tier}: Stats panel is visible.`);
}

async function waitFrames(page, count) {
  return page.evaluate(
    (frameCount) =>
      new Promise((resolveFrames) => {
        let remaining = frameCount;
        const next = () => {
          remaining--;
          if (remaining <= 0) resolveFrames();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count
  );
}

async function sampleFrames(page, count) {
  return page.evaluate(
    (frameCount) =>
      new Promise((resolveFrames) => {
        const samples = [];
        const next = () => {
          samples.push(structuredClone(window.waterPcgOptics?.metrics.p1));
          if (samples.length >= frameCount) resolveFrames(samples);
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count
  );
}

function assertBoundedRuntime(snapshot, label) {
  assert(snapshot?.ready === true, `${label}: Lab is not ready.`);
  assert(snapshot.runtimeError === "", `${label}: runtime error ${snapshot.runtimeError}.`);
  const nonFinite = findNonFinite(snapshot);
  assert(nonFinite.length === 0, `${label}: non-finite metrics at ${nonFinite.join(", ")}.`);
  assert(snapshot.p1.active === true, `${label}: P1 matrix is inactive.`);
  assert(snapshot.p1.validationScope === "evidence-gated", `${label}: validation scope is not explicit.`);
  assert(snapshot.p1.materialConsumerCount === 3, `${label}: expected three material consumers.`);
  assert(
    snapshot.p1.cameraFeatureConsumerIds.length === snapshot.p1.simultaneousVisibleMaterialConsumerCount,
    `${label}: Camera feature requests do not match visible material consumers.`
  );
  assert(snapshot.p1.sharedOpticalProfileReference === true, `${label}: profile reference is not shared.`);
  assert(snapshot.p1.sharedBindingInstance === true, `${label}: binding instance is not shared.`);
  assert(snapshot.p1.cameraDepthCopyPassCount <= 1, `${label}: more than one depth copy pass.`);
  assert(snapshot.p1.cameraOpaqueCopyPassCount <= 1, `${label}: more than one opaque copy pass.`);
  assert(snapshot.p1.planarCameraCount <= 1, `${label}: more than one Planar camera.`);
  assert(snapshot.p1.liveRenderTargetCount <= 1, `${label}: more than one Planar RT.`);
  assert(
    snapshot.p1.planarCameraCount === 0 ||
      (snapshot.waterLayerMask !== 0 &&
        snapshot.waterLayerExcludedFromPlanar === true &&
        (snapshot.planarCameraCullingMask & snapshot.waterLayerMask) === 0),
    `${label}: Planar Camera includes a water layer and can recurse.`
  );
  assert(
    snapshot.p1.reflectionCameraCreateCount - snapshot.p1.reflectionCameraDestroyCount ===
      snapshot.p1.planarCameraCount,
    `${label}: reflection camera lifecycle is imbalanced.`
  );
  assert(
    snapshot.p1.renderTargetCreateCount - snapshot.p1.renderTargetDestroyCount === snapshot.p1.liveRenderTargetCount,
    `${label}: render target lifecycle is imbalanced.`
  );
}

function assertBodyBindings(snapshot, requestedTier, label) {
  const body = snapshot.p1.bodyReadbacks;
  const activeBodyNames =
    snapshot.p1.mode === "dual-pool" ? ["pool", "river", "secondaryPool"] : ["pool", "river", "ocean"];
  for (const name of activeBodyNames) {
    const readback = body[name];
    assert(readback.requestedTier === requestedTier, `${label}: ${name} requested ${readback.requestedTier}.`);
    assert(
      readback.resolvedTier === (requestedTier === "experimental" ? "high" : requestedTier),
      `${label}: ${name} resolved ${readback.resolvedTier}.`
    );
    assert(readback.refractionEnabled === true, `${label}: ${name} refraction is disabled.`);
    assert(readback.opticalProfile !== undefined, `${label}: ${name} profile readback is missing.`);
  }
  assert(body.pool.planarEligible === true, `${label}: Pool must be Planar eligible.`);
  assert(body.river.planarEligible === false, `${label}: River must be Planar ineligible.`);
  if (snapshot.reflectionSource === "planar") {
    assert(body.ocean.planarEligible === true, `${label}: Ocean must be Planar eligible.`);
    assert(body.river.requestedSource === "planar", `${label}: River did not request Planar.`);
    assert(body.river.effectiveSource !== "planar", `${label}: River illegally sampled Planar.`);
    assert(
      body.river.fallbackReason === "planar-ineligible",
      `${label}: River fallback was ${body.river.fallbackReason}.`
    );
  }
  if (snapshot.p1.mode === "dual-pool") {
    assert(body.secondaryPool.planarEligible === true, `${label}: Secondary Pool must be Planar eligible.`);
  }
}

function resolvedLifecycleTier(requestedTier) {
  return requestedTier === "experimental" ? "high" : requestedTier;
}

function nextLifecycleTier(currentTier) {
  const currentIndex = LIFECYCLE_TIER_SEQUENCE.indexOf(currentTier);
  assert(currentIndex >= 0, `Lifecycle tier ${currentTier} is unsupported.`);
  return LIFECYCLE_TIER_SEQUENCE[(currentIndex + 1) % LIFECYCLE_TIER_SEQUENCE.length];
}

function expectedOpaqueDownsampling(requestedTier) {
  return resolvedLifecycleTier(requestedTier) === "medium" ? "2x" : "full";
}

function assertTierResolution(snapshot, requestedTier, label) {
  const resolvedTier = resolvedLifecycleTier(requestedTier);
  const fallbackReason = requestedTier === "experimental" ? EXPERIMENTAL_TIER_FALLBACK_REASON : undefined;
  assert(snapshot.requestedTier === requestedTier, `${label}: requested tier is ${snapshot.requestedTier}.`);
  assert(snapshot.resolvedTier === resolvedTier, `${label}: resolved tier is ${snapshot.resolvedTier}.`);
  assert(
    snapshot.fallbackReason === fallbackReason,
    `${label}: tier fallback is ${snapshot.fallbackReason ?? "missing"}.`
  );
  const bodyNames = snapshot.p1.mode === "dual-pool" ? ["pool", "river", "secondaryPool"] : ["pool", "river", "ocean"];
  for (const name of bodyNames) {
    const readback = snapshot.p1.bodyReadbacks[name];
    assert(readback.requestedTier === requestedTier, `${label}: ${name} requested ${readback.requestedTier}.`);
    assert(readback.resolvedTier === resolvedTier, `${label}: ${name} resolved ${readback.resolvedTier}.`);
    assert(
      readback.tierFallbackReason === fallbackReason,
      `${label}: ${name} tier fallback is ${readback.tierFallbackReason ?? "missing"}.`
    );
  }
  assert(
    snapshot.p1.experimentalRequested === (requestedTier === "experimental"),
    `${label}: Experimental request flag is inconsistent.`
  );
  assert(
    snapshot.p1.experimentalResolvedHigh === (requestedTier === "experimental"),
    `${label}: Experimental High resolution flag is inconsistent.`
  );
  assert(
    snapshot.p1.experimentalFallbackReason === fallbackReason,
    `${label}: P1 fallback is ${snapshot.p1.experimentalFallbackReason ?? "missing"}.`
  );
}

async function canvasFingerprint(page) {
  const pixels = await page.locator("canvas#canvas").screenshot({ type: "png" });
  return createHash("sha256").update(pixels).digest("hex");
}

async function capture(page, tier, name) {
  const tierOutput = resolve(OUTPUT_DIRECTORY, tier);
  await mkdir(tierOutput, { recursive: true });
  const outputPath = resolve(tierOutput, `${name}.png`);
  const canvas = page.locator("canvas#canvas");
  await page.waitForFunction(
    ({ width, height }) => {
      const candidate = document.querySelector("canvas#canvas");
      return candidate instanceof HTMLCanvasElement && candidate.width === width && candidate.height === height;
    },
    VIEWPORT,
    { timeout: 30_000 }
  );
  const size = await canvas.evaluate((element) => ({ width: element.width, height: element.height }));
  assert(
    size.width === VIEWPORT.width && size.height === VIEWPORT.height,
    `${tier}: canvas is ${size.width}x${size.height}.`
  );
  await canvas.screenshot({ animations: "disabled", path: outputPath });
  return outputPath;
}

async function verifyCommittedBaseline(tier, name) {
  const tierDirectory = resolve(BASELINE_ROOT, tier);
  const schema = JSON.parse(await readFile(resolve(tierDirectory, "roi.json"), "utf8"));
  assert(schema.schemaVersion === 2, `${tier}: committed baseline schema must be version 2.`);
  assert(
    schema.fixedEnvironment?.rendererLane === "canonical-golden" &&
      schema.fixedEnvironment?.launchArgument === "--use-angle=swiftshader" &&
      schema.fixedEnvironment?.requiredRendererSubstring === CANONICAL_RENDERER_SUBSTRING,
    `${tier}: committed baseline renderer provenance is missing or changed.`
  );
  assert(
    schema.thresholds?.maximumDiffPixelRatio === BASELINE_MAXIMUM_DIFF_PIXEL_RATIO &&
      schema.thresholds?.perChannelByteTolerance === BASELINE_PER_CHANNEL_BYTE_TOLERANCE &&
      schema.thresholds?.maximumRoiMeanAbsoluteDifference === BASELINE_MAXIMUM_ROI_MAD &&
      schema.thresholds?.minimumRoiLuminanceVariance === BASELINE_MINIMUM_ROI_VARIANCE,
    `${tier}: committed baseline thresholds do not match the frozen P1 Gate.`
  );
  const entry = schema.captures?.[name];
  assert(entry?.file === `${name}.png`, `${tier}: ${name} baseline schema entry is missing.`);
  const bytes = await readFile(resolve(tierDirectory, entry.file));
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  assert(actualHash === entry.sha256, `${tier}: ${name} committed SHA-256 does not match roi.json.`);
  return {
    bytes,
    dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
    sha256: actualHash
  };
}

async function createBaselineReviewArtifact(page, tier, name, currentImagePath, committedBaseline) {
  const reviewDirectory = resolve(OUTPUT_DIRECTORY, "baseline-review", tier, name);
  await mkdir(reviewDirectory, { recursive: true });
  const oldPath = resolve(reviewDirectory, "old.png");
  const nextPath = resolve(reviewDirectory, "new.png");
  const diffPath = resolve(reviewDirectory, "diff.png");
  await writeFile(oldPath, committedBaseline.bytes);
  await copyFile(currentImagePath, nextPath);
  const currentImageUrl = `data:image/png;base64,${(await readFile(currentImagePath)).toString("base64")}`;
  const diffDataUrl = await page.evaluate(
    async ({ baselineUrl, currentImageUrl }) => {
      const oldImage = new Image();
      oldImage.src = baselineUrl;
      const nextImage = new Image();
      nextImage.src = currentImageUrl;
      await Promise.all([oldImage.decode(), nextImage.decode()]);
      if (oldImage.naturalWidth !== nextImage.naturalWidth || oldImage.naturalHeight !== nextImage.naturalHeight) {
        throw new Error(
          `Baseline review dimensions differ: ${oldImage.naturalWidth}x${oldImage.naturalHeight} vs ${nextImage.naturalWidth}x${nextImage.naturalHeight}.`
        );
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
      if (!oldContext || !nextContext || !diffContext) throw new Error("Baseline review canvas is unavailable.");
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
    { baselineUrl: committedBaseline.dataUrl, currentImageUrl }
  );
  const diffBytes = Buffer.from(diffDataUrl.slice(diffDataUrl.indexOf(",") + 1), "base64");
  await writeFile(diffPath, diffBytes);
  const nextBytes = await readFile(currentImagePath);
  return {
    reason: BASELINE_UPDATE_REASON,
    oldPath,
    newPath: nextPath,
    diffPath,
    oldSha256: committedBaseline.sha256,
    newSha256: createHash("sha256").update(nextBytes).digest("hex"),
    diffSha256: createHash("sha256").update(diffBytes).digest("hex"),
    comparison: await compareCanvasToBaseline(
      page,
      currentImagePath,
      committedBaseline.dataUrl,
      ROIS[name === "body-matrix-final" ? "bodyMatrix" : "dualPool"]
    )
  };
}

async function compareCanvasToBaseline(page, currentImagePath, baselineUrl, rois) {
  const currentImageUrl = `data:image/png;base64,${(await readFile(currentImagePath)).toString("base64")}`;
  return page.evaluate(
    async ({ baselineUrl, currentImageUrl, rois, perChannelByteTolerance, maximumDiffPixelRatio }) => {
      const currentImage = new Image();
      currentImage.src = currentImageUrl;
      const baseline = new Image();
      baseline.crossOrigin = "anonymous";
      baseline.src = baselineUrl;
      await Promise.all([currentImage.decode(), baseline.decode()]);
      const size = { width: 256, height: 144 };
      const makeCanvas = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        return canvas;
      };
      const currentCanvas = makeCanvas();
      const baselineCanvas = makeCanvas();
      const currentContext = currentCanvas.getContext("2d", { willReadFrequently: true });
      const baselineContext = baselineCanvas.getContext("2d", { willReadFrequently: true });
      if (!currentContext || !baselineContext) throw new Error("Baseline comparison canvas is unavailable.");
      currentContext.drawImage(currentImage, 0, 0, size.width, size.height);
      baselineContext.drawImage(baseline, 0, 0, size.width, size.height);
      const current = currentContext.getImageData(0, 0, size.width, size.height).data;
      const expected = baselineContext.getImageData(0, 0, size.width, size.height).data;
      const results = {};
      let fullFrameDiffPixelCount = 0;
      for (let offset = 0; offset < current.length; offset += 4) {
        let pixelDiffers = false;
        for (let channel = 0; channel < 3; channel++) {
          if (Math.abs(current[offset + channel] - expected[offset + channel]) > perChannelByteTolerance) {
            pixelDiffers = true;
          }
        }
        if (pixelDiffers) fullFrameDiffPixelCount++;
      }
      for (const [name, rect] of Object.entries(rois)) {
        const minX = Math.floor(rect[0] * size.width);
        const minY = Math.floor(rect[1] * size.height);
        const maxX = Math.ceil((rect[0] + rect[2]) * size.width);
        const maxY = Math.ceil((rect[1] + rect[3]) * size.height);
        let difference = 0;
        let luminance = 0;
        let luminanceSquared = 0;
        let channelCount = 0;
        let pixelCount = 0;
        for (let y = minY; y < maxY; y++) {
          for (let x = minX; x < maxX; x++) {
            const offset = (y * size.width + x) * 4;
            for (let channel = 0; channel < 3; channel++) {
              difference += Math.abs(current[offset + channel] - expected[offset + channel]) / 255;
              channelCount++;
            }
            const value =
              (current[offset] * 0.2126 + current[offset + 1] * 0.7152 + current[offset + 2] * 0.0722) / 255;
            luminance += value;
            luminanceSquared += value * value;
            pixelCount++;
          }
        }
        const mean = luminance / Math.max(1, pixelCount);
        results[name] = {
          meanAbsoluteDifference: difference / Math.max(1, channelCount),
          luminanceVariance: luminanceSquared / Math.max(1, pixelCount) - mean * mean,
          pixelCount
        };
      }
      const fullFramePixelCount = size.width * size.height;
      return {
        fullFrame: {
          pixelCount: fullFramePixelCount,
          diffPixelCount: fullFrameDiffPixelCount,
          diffPixelRatio: fullFrameDiffPixelCount / fullFramePixelCount,
          maximumDiffPixelRatio,
          perChannelByteTolerance
        },
        rois: results
      };
    },
    {
      baselineUrl,
      currentImageUrl,
      rois,
      perChannelByteTolerance: BASELINE_PER_CHANNEL_BYTE_TOLERANCE,
      maximumDiffPixelRatio: BASELINE_MAXIMUM_DIFF_PIXEL_RATIO
    }
  );
}

async function analyzeCapturedImage(page, imagePath, rois) {
  const imageUrl = `data:image/png;base64,${(await readFile(imagePath)).toString("base64")}`;
  return page.evaluate(
    async ({ imageUrl, rois }) => {
      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      const size = { width: 256, height: 144 };
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Native compatibility analysis canvas is unavailable.");
      context.drawImage(image, 0, 0, size.width, size.height);
      const pixels = context.getImageData(0, 0, size.width, size.height).data;
      const results = {};
      for (const [name, rect] of Object.entries(rois)) {
        const minX = Math.floor(rect[0] * size.width);
        const minY = Math.floor(rect[1] * size.height);
        const maxX = Math.ceil((rect[0] + rect[2]) * size.width);
        const maxY = Math.ceil((rect[1] + rect[3]) * size.height);
        let luminance = 0;
        let luminanceSquared = 0;
        let pixelCount = 0;
        for (let y = minY; y < maxY; y++) {
          for (let x = minX; x < maxX; x++) {
            const offset = (y * size.width + x) * 4;
            const value = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
            luminance += value;
            luminanceSquared += value * value;
            pixelCount++;
          }
        }
        const mean = luminance / Math.max(1, pixelCount);
        results[name] = {
          meanLuminance: mean,
          luminanceVariance: luminanceSquared / Math.max(1, pixelCount) - mean * mean,
          pixelCount
        };
      }
      return { analysisSize: size, rois: results };
    },
    { imageUrl, rois }
  );
}

async function compareCapturedImages(page, firstImagePath, secondImagePath, rois) {
  const firstImageUrl = `data:image/png;base64,${(await readFile(firstImagePath)).toString("base64")}`;
  const secondImageUrl = `data:image/png;base64,${(await readFile(secondImagePath)).toString("base64")}`;
  return page.evaluate(
    async ({ firstImageUrl, secondImageUrl, rois, perChannelByteTolerance }) => {
      const firstImage = new Image();
      firstImage.src = firstImageUrl;
      const secondImage = new Image();
      secondImage.src = secondImageUrl;
      await Promise.all([firstImage.decode(), secondImage.decode()]);
      const size = { width: 256, height: 144 };
      const readPixels = (image) => {
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Native feature-signal analysis canvas is unavailable.");
        context.drawImage(image, 0, 0, size.width, size.height);
        return context.getImageData(0, 0, size.width, size.height).data;
      };
      const first = readPixels(firstImage);
      const second = readPixels(secondImage);
      const analyzeRect = (rect) => {
        const minX = Math.floor(rect[0] * size.width);
        const minY = Math.floor(rect[1] * size.height);
        const maxX = Math.ceil((rect[0] + rect[2]) * size.width);
        const maxY = Math.ceil((rect[1] + rect[3]) * size.height);
        let absoluteDifference = 0;
        let channelCount = 0;
        let diffPixelCount = 0;
        let pixelCount = 0;
        for (let y = minY; y < maxY; y++) {
          for (let x = minX; x < maxX; x++) {
            const offset = (y * size.width + x) * 4;
            let pixelDiffers = false;
            for (let channel = 0; channel < 3; channel++) {
              const difference = Math.abs(first[offset + channel] - second[offset + channel]);
              absoluteDifference += difference / 255;
              channelCount++;
              if (difference > perChannelByteTolerance) pixelDiffers = true;
            }
            if (pixelDiffers) diffPixelCount++;
            pixelCount++;
          }
        }
        return {
          meanAbsoluteDifference: absoluteDifference / Math.max(1, channelCount),
          diffPixelCount,
          diffPixelRatio: diffPixelCount / Math.max(1, pixelCount),
          pixelCount
        };
      };
      const results = {};
      for (const [name, rect] of Object.entries(rois)) results[name] = analyzeRect(rect);
      return {
        analysisSize: size,
        perChannelByteTolerance,
        fullFrame: analyzeRect([0, 0, 1, 1]),
        rois: results
      };
    },
    { firstImageUrl, secondImageUrl, rois, perChannelByteTolerance: BASELINE_PER_CHANNEL_BYTE_TOLERANCE }
  );
}

function assertBaselineComparison(comparison, label) {
  assert(
    comparison.fullFrame.maximumDiffPixelRatio === BASELINE_MAXIMUM_DIFF_PIXEL_RATIO &&
      comparison.fullFrame.perChannelByteTolerance === BASELINE_PER_CHANNEL_BYTE_TOLERANCE,
    `${label}: browser comparison thresholds drifted.`
  );
  assert(
    comparison.fullFrame.diffPixelRatio <= BASELINE_MAXIMUM_DIFF_PIXEL_RATIO,
    `${label}: full-frame diff ratio ${comparison.fullFrame.diffPixelRatio} exceeds ${BASELINE_MAXIMUM_DIFF_PIXEL_RATIO}.`
  );
  for (const [roi, result] of Object.entries(comparison.rois)) {
    assert(
      result.meanAbsoluteDifference <= BASELINE_MAXIMUM_ROI_MAD,
      `${label}: ${roi} baseline MAD ${result.meanAbsoluteDifference} exceeds ${BASELINE_MAXIMUM_ROI_MAD}.`
    );
    assert(
      result.luminanceVariance >= BASELINE_MINIMUM_ROI_VARIANCE,
      `${label}: ${roi} luminance variance ${result.luminanceVariance} is blank or flat.`
    );
  }
}

function assertNativeSemanticImage(analysis, label) {
  for (const [roi, result] of Object.entries(analysis.rois)) {
    assert(
      result.luminanceVariance >= BASELINE_MINIMUM_ROI_VARIANCE,
      `${label}: ${roi} luminance variance ${result.luminanceVariance} is blank or flat.`
    );
  }
}

function assertNativeFeatureSignal(comparison, requiredRois, label) {
  assert(
    comparison.fullFrame.diffPixelCount >= NATIVE_MINIMUM_FEATURE_DIFF_PIXELS,
    `${label}: full-frame signal changed only ${comparison.fullFrame.diffPixelCount} pixels.`
  );
  for (const roi of requiredRois) {
    const result = comparison.rois[roi];
    assert(result !== undefined, `${label}: ${roi} signal ROI is missing.`);
    assert(
      result.diffPixelCount >= NATIVE_MINIMUM_FEATURE_DIFF_PIXELS,
      `${label}: ${roi} signal changed only ${result.diffPixelCount} pixels.`
    );
  }
}

async function runLifecycleMatrix(page, tier, iterations) {
  const transitions = [];
  const baselineRestoreTransitions = [];
  let currentTier = tier;

  const runTransition = async (requestedTier, index, phase) => {
    const fromTier = currentTier;
    const resolvedTier = resolvedLifecycleTier(requestedTier);
    const fallbackReason = requestedTier === "experimental" ? EXPERIMENTAL_TIER_FALLBACK_REASON : undefined;
    const downsampling = expectedOpaqueDownsampling(requestedTier);
    const label = `${tier}: ${phase} ${index + 1} ${fromTier} -> ${requestedTier}`;
    const beforeRelease = await metrics(page);
    assertBoundedRuntime(beforeRelease, `${label}: before release`);
    assertTierResolution(beforeRelease, fromTier, `${label}: before release`);
    assert(beforeRelease.p1.mode === "cross-body", `${label}: lifecycle mode is not cross-body.`);
    assert(beforeRelease.p1.selectedPlanarOwnerId === "water-optics-lab", `${label}: Pool is not selected.`);
    assert(beforeRelease.p1.renderedPlanarOwnerId === "water-optics-lab", `${label}: Pool is not rendered.`);
    assert(beforeRelease.p1.planarCameraCount === 1, `${label}: expected one Planar camera before release.`);
    assert(beforeRelease.p1.liveRenderTargetCount === 1, `${label}: expected one Planar RT before release.`);

    await invoke(page, "setReflectionSource", "sky");
    await invoke(page, "setP1PlanarConsumerVisible", "pool", false);
    await invoke(page, "setP1PlanarConsumerVisible", "ocean", false);
    await page.setViewportSize({ width: VIEWPORT.width - 2, height: VIEWPORT.height - 2 });
    await page.waitForFunction(
      () => {
        const p1 = window.waterPcgOptics?.metrics.p1;
        return (
          p1?.mode === "cross-body" &&
          p1.activeReflectionConsumerCount === 3 &&
          p1.eligiblePlanarRequestCount === 0 &&
          p1.selectedPlanarOwnerId === undefined &&
          p1.pendingPlanarOwnerId === undefined &&
          p1.renderedPlanarOwnerId === undefined &&
          p1.planarCameraCount === 0 &&
          p1.liveRenderTargetCount === 0
        );
      },
      null,
      { timeout: 30_000 }
    );
    await waitFrames(page, 2);
    const released = await metrics(page);
    assertBoundedRuntime(released, `${label}: released`);
    assertTierResolution(released, fromTier, `${label}: released`);
    assert(released.p1.activeReflectionConsumerCount === 3, `${label}: release changed request count.`);
    assert(released.p1.eligiblePlanarRequestCount === 0, `${label}: release retained an eligible owner.`);
    assert(released.p1.planarCameraCount === 0, `${label}: release retained a Planar camera.`);
    assert(released.p1.liveRenderTargetCount === 0, `${label}: release retained a Planar RT.`);
    assert(
      released.p1.renderTargetCreateCount === beforeRelease.p1.renderTargetCreateCount,
      `${label}: Sky release unexpectedly created a Planar RT.`
    );
    assert(
      released.p1.renderTargetDestroyCount === beforeRelease.p1.renderTargetDestroyCount + 1,
      `${label}: Sky release did not destroy exactly one Planar RT.`
    );
    assert(
      released.p1.reflectionCameraCreateCount === beforeRelease.p1.reflectionCameraCreateCount,
      `${label}: Sky release unexpectedly created a Planar camera.`
    );
    assert(
      released.p1.reflectionCameraDestroyCount === beforeRelease.p1.reflectionCameraDestroyCount + 1,
      `${label}: Sky release did not destroy exactly one Planar camera.`
    );

    await invoke(page, "setTier", requestedTier);
    await page.waitForFunction(
      ({ requestedTier, resolvedTier, fallbackReason }) => {
        const snapshot = window.waterPcgOptics?.metrics;
        const p1 = snapshot?.p1;
        const body = p1?.bodyReadbacks;
        const names = ["pool", "river", "ocean"];
        return (
          snapshot?.ready === true &&
          snapshot.requestedTier === requestedTier &&
          snapshot.resolvedTier === resolvedTier &&
          (snapshot.fallbackReason ?? null) === fallbackReason &&
          p1?.planarCameraCount === 0 &&
          p1.liveRenderTargetCount === 0 &&
          names.every(
            (name) =>
              body?.[name].requestedTier === requestedTier &&
              body[name].resolvedTier === resolvedTier &&
              (body[name].tierFallbackReason ?? null) === fallbackReason
          )
        );
      },
      { requestedTier, resolvedTier, fallbackReason: fallbackReason ?? null },
      { timeout: 30_000 }
    );
    await waitFrames(page, 2);
    const intermediate = await metrics(page);
    assertBoundedRuntime(intermediate, `${label}: tier changed while released`);
    assertTierResolution(intermediate, requestedTier, `${label}: tier changed while released`);
    assertBodyBindings(intermediate, requestedTier, `${label}: tier changed while released`);
    assert(intermediate.p1.eligiblePlanarRequestCount === 0, `${label}: tier change restored an eligible owner.`);
    assert(intermediate.p1.planarCameraCount === 0, `${label}: tier change created a Planar camera.`);
    assert(intermediate.p1.liveRenderTargetCount === 0, `${label}: tier change created a Planar RT.`);
    assert(intermediate.p1.cameraDepthCopyPassCount === 1, `${label}: expected one depth copy pass.`);
    assert(intermediate.p1.cameraOpaqueCopyPassCount === 1, `${label}: expected one opaque copy pass.`);
    assert(
      intermediate.opaqueDownsampling === downsampling,
      `${label}: downsampling is ${intermediate.opaqueDownsampling}.`
    );
    assert(
      intermediate.p1.renderTargetCreateCount === released.p1.renderTargetCreateCount &&
        intermediate.p1.renderTargetDestroyCount === released.p1.renderTargetDestroyCount,
      `${label}: tier change mutated released Planar RT lifecycle counts.`
    );
    assert(
      intermediate.p1.reflectionCameraCreateCount === released.p1.reflectionCameraCreateCount &&
        intermediate.p1.reflectionCameraDestroyCount === released.p1.reflectionCameraDestroyCount,
      `${label}: tier change mutated released Planar camera lifecycle counts.`
    );

    await page.setViewportSize(VIEWPORT);
    await invoke(page, "setReflectionSource", "planar");
    await invoke(page, "resetP1PlanarConsumers");
    await page.waitForFunction(
      ({ requestedTier, resolvedTier, fallbackReason, downsampling }) => {
        const snapshot = window.waterPcgOptics?.metrics;
        const p1 = snapshot?.p1;
        const body = p1?.bodyReadbacks;
        const names = ["pool", "river", "ocean"];
        return (
          snapshot?.ready === true &&
          snapshot.requestedTier === requestedTier &&
          snapshot.resolvedTier === resolvedTier &&
          (snapshot.fallbackReason ?? null) === fallbackReason &&
          snapshot.opaqueDownsampling === downsampling &&
          p1?.mode === "cross-body" &&
          p1.activeReflectionConsumerCount === 3 &&
          p1.eligiblePlanarRequestCount === 2 &&
          p1.selectedPlanarOwnerId === "water-optics-lab" &&
          p1.renderedPlanarOwnerId === "water-optics-lab" &&
          p1.planarCameraCount === 1 &&
          p1.liveRenderTargetCount === 1 &&
          p1.cameraDepthCopyPassCount === 1 &&
          p1.cameraOpaqueCopyPassCount === 1 &&
          names.every(
            (name) =>
              body?.[name].requestedTier === requestedTier &&
              body[name].resolvedTier === resolvedTier &&
              (body[name].tierFallbackReason ?? null) === fallbackReason
          )
        );
      },
      { requestedTier, resolvedTier, fallbackReason: fallbackReason ?? null, downsampling },
      { timeout: 30_000 }
    );
    await waitFrames(page, 2);
    const restored = await metrics(page);
    assertBoundedRuntime(restored, `${label}: restored`);
    assertTierResolution(restored, requestedTier, `${label}: restored`);
    assertBodyBindings(restored, requestedTier, `${label}: restored`);
    assert(restored.p1.activeReflectionConsumerCount === 3, `${label}: request count did not restore to 3.`);
    assert(restored.p1.eligiblePlanarRequestCount === 2, `${label}: eligible count did not restore to 2.`);
    assert(restored.p1.selectedPlanarOwnerId === "water-optics-lab", `${label}: Pool was not selected.`);
    assert(restored.p1.renderedPlanarOwnerId === "water-optics-lab", `${label}: Pool was not rendered.`);
    assert(restored.p1.planarCameraCount === 1, `${label}: Planar camera did not restore.`);
    assert(restored.p1.liveRenderTargetCount === 1, `${label}: Planar RT did not restore.`);
    assert(restored.p1.cameraDepthCopyPassCount === 1, `${label}: depth copy pass did not restore.`);
    assert(restored.p1.cameraOpaqueCopyPassCount === 1, `${label}: opaque copy pass did not restore.`);
    assert(
      restored.opaqueDownsampling === downsampling,
      `${label}: restored downsampling is ${restored.opaqueDownsampling}.`
    );
    assert(
      restored.p1.renderTargetCreateCount === intermediate.p1.renderTargetCreateCount + 1 &&
        restored.p1.renderTargetDestroyCount === intermediate.p1.renderTargetDestroyCount,
      `${label}: Planar RT restore did not create exactly one live target.`
    );
    assert(
      restored.p1.reflectionCameraCreateCount === intermediate.p1.reflectionCameraCreateCount + 1 &&
        restored.p1.reflectionCameraDestroyCount === intermediate.p1.reflectionCameraDestroyCount,
      `${label}: Planar camera restore did not create exactly one live camera.`
    );

    currentTier = requestedTier;
    return {
      phase,
      index,
      fromTier,
      requestedTier,
      resolvedTier,
      fallbackReason: fallbackReason ?? null,
      released: {
        selectedPlanarOwnerId: released.p1.selectedPlanarOwnerId ?? null,
        renderedPlanarOwnerId: released.p1.renderedPlanarOwnerId ?? null,
        planarCameraCount: released.p1.planarCameraCount,
        liveRenderTargetCount: released.p1.liveRenderTargetCount,
        renderTargetDestroyDelta: released.p1.renderTargetDestroyCount - beforeRelease.p1.renderTargetDestroyCount,
        reflectionCameraDestroyDelta:
          released.p1.reflectionCameraDestroyCount - beforeRelease.p1.reflectionCameraDestroyCount
      },
      tierChangedWhileReleased: {
        requestedTier: intermediate.requestedTier,
        resolvedTier: intermediate.resolvedTier,
        fallbackReason: intermediate.fallbackReason ?? null,
        planarCameraCount: intermediate.p1.planarCameraCount,
        liveRenderTargetCount: intermediate.p1.liveRenderTargetCount,
        renderTargetCreateDelta: intermediate.p1.renderTargetCreateCount - released.p1.renderTargetCreateCount,
        reflectionCameraCreateDelta:
          intermediate.p1.reflectionCameraCreateCount - released.p1.reflectionCameraCreateCount,
        cameraDepthCopyPassCount: intermediate.p1.cameraDepthCopyPassCount,
        cameraOpaqueCopyPassCount: intermediate.p1.cameraOpaqueCopyPassCount,
        opaqueDownsampling: intermediate.opaqueDownsampling
      },
      restoredPlanar: {
        selectedPlanarOwnerId: restored.p1.selectedPlanarOwnerId,
        renderedPlanarOwnerId: restored.p1.renderedPlanarOwnerId,
        planarCameraCount: restored.p1.planarCameraCount,
        liveRenderTargetCount: restored.p1.liveRenderTargetCount,
        renderTargetCreateDelta: restored.p1.renderTargetCreateCount - intermediate.p1.renderTargetCreateCount,
        reflectionCameraCreateDelta:
          restored.p1.reflectionCameraCreateCount - intermediate.p1.reflectionCameraCreateCount,
        cameraDepthCopyPassCount: restored.p1.cameraDepthCopyPassCount,
        cameraOpaqueCopyPassCount: restored.p1.cameraOpaqueCopyPassCount,
        opaqueDownsampling: restored.opaqueDownsampling
      }
    };
  };

  for (let index = 0; index < iterations; index++) {
    transitions.push(await runTransition(nextLifecycleTier(currentTier), index, "stress"));
  }
  while (currentTier !== tier) {
    baselineRestoreTransitions.push(
      await runTransition(nextLifecycleTier(currentTier), baselineRestoreTransitions.length, "baseline-restore")
    );
  }
  return {
    sequence: LIFECYCLE_TIER_SEQUENCE,
    requestedIterations: iterations,
    transitions,
    baselineRestoreTransitions,
    initialTier: tier,
    finalTier: currentTier
  };
}

async function verifyTier(browser, baseUrl, tier) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  const page = await context.newPage();
  const diagnostics = collectDiagnostics(page);
  const result = {
    tier,
    rendererLane: RENDERER_LANE,
    status: "running",
    diagnostics,
    failures: [],
    screenshots: {},
    baselineReview: UPDATE_BASELINES ? {} : undefined
  };
  try {
    const committedBodyMatrix = await verifyCommittedBaseline(tier, "body-matrix-final");
    const committedDualOwner = await verifyCommittedBaseline(tier, "dual-owner-debug");
    if (committedBodyMatrix && committedDualOwner) {
      result.committedBaselineHashes = {
        bodyMatrixFinal: committedBodyMatrix.sha256,
        dualOwnerDebug: committedDualOwner.sha256
      };
    }
    await page.goto(targetUrl(baseUrl, tier), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      (expectedTier) => {
        const metrics = window.waterPcgOptics?.metrics;
        return (
          metrics?.ready === true &&
          metrics.requestedTier === expectedTier &&
          metrics.p1.active === true &&
          metrics.p1.renderedPlanarOwnerId === "water-optics-lab"
        );
      },
      tier,
      { timeout: 30_000 }
    );
    await invoke(page, "setPlanarFilterEnabled", false);
    await waitFrames(page, 4);
    result.runtimeEnvironment = await collectRuntimeEnvironment(page);
    assertRuntimeEnvironment(result.runtimeEnvironment, tier);
    const initial = await metrics(page);
    assertBoundedRuntime(initial, `${tier}: initial`);
    assert(initial.p1.simultaneousVisibleMaterialConsumerCount === 3, `${tier}: three bodies are not visible.`);
    assert(
      initial.p1.secondaryPoolRuntimeCreated === false,
      `${tier}: cross-body preset leaked a secondary Pool runtime.`
    );
    assert(
      initial.p1.secondaryPoolRuntimeLiveCount === 0,
      `${tier}: cross-body preset retained secondary Pool resources.`
    );
    assert(initial.p1.activeReflectionConsumerCount === 3, `${tier}: expected three reflection requests.`);
    assert(initial.p1.eligiblePlanarRequestCount === 2, `${tier}: expected two Planar-eligible requests.`);
    assert(initial.p1.selectedPlanarOwnerId === "water-optics-lab", `${tier}: Pool was not selected.`);
    assert(initial.p1.renderedPlanarOwnerId === "water-optics-lab", `${tier}: Pool was not rendered.`);
    assertBodyBindings(initial, tier, `${tier}: initial`);
    result.initial = initial.p1;
    result.screenshots.bodyMatrixFinal = await capture(page, tier, "body-matrix-final");
    if (!UPDATE_BASELINES && IS_CANONICAL_GOLDEN_LANE) {
      assert(committedBodyMatrix !== null, `${tier}: local body-matrix baseline bytes are unavailable.`);
      result.bodyMatrixBaseline = await compareCanvasToBaseline(
        page,
        result.screenshots.bodyMatrixFinal,
        committedBodyMatrix.dataUrl,
        ROIS.bodyMatrix
      );
      assertBaselineComparison(result.bodyMatrixBaseline, `${tier}: body matrix`);
    } else {
      result.bodyMatrixSemantic = await analyzeCapturedImage(page, result.screenshots.bodyMatrixFinal, ROIS.bodyMatrix);
      assertNativeSemanticImage(result.bodyMatrixSemantic, `${tier}: native body matrix`);

      await invoke(page, "setRefractionEnabled", false);
      await waitFrames(page, 4);
      const refractionOff = await metrics(page);
      assert(refractionOff.refractionEnabled === false, `${tier}: native refraction OFF readback did not update.`);
      for (const bodyName of ["pool", "river", "ocean"]) {
        assert(
          refractionOff.p1.bodyReadbacks[bodyName].refractionEnabled === false,
          `${tier}: ${bodyName} retained refraction after the shared OFF transition.`
        );
      }
      result.refractionOffReadback = refractionOff.p1.bodyReadbacks;
      result.screenshots.bodyMatrixRefractionOff = await capture(page, tier, "body-matrix-refraction-off");
      result.refractionFeatureSignal = await compareCapturedImages(
        page,
        result.screenshots.bodyMatrixFinal,
        result.screenshots.bodyMatrixRefractionOff,
        ROIS.bodyMatrix
      );
      assertNativeFeatureSignal(
        result.refractionFeatureSignal,
        ["river", "poolHeightfield", "ocean"],
        `${tier}: native refraction ON/OFF`
      );
      await invoke(page, "setRefractionEnabled", true);
      await waitFrames(page, 4);

      if (UPDATE_BASELINES) {
        result.baselineReview.bodyMatrixFinal = await createBaselineReviewArtifact(
          page,
          tier,
          "body-matrix-final",
          result.screenshots.bodyMatrixFinal,
          committedBodyMatrix
        );
      }

      await invoke(page, "setReflectionSource", "sky");
      await page.waitForFunction(
        () => {
          const snapshot = window.waterPcgOptics?.metrics;
          const body = snapshot?.p1.bodyReadbacks;
          return (
            snapshot?.reflectionSource === "sky" &&
            snapshot.p1.selectedPlanarOwnerId === undefined &&
            snapshot.p1.renderedPlanarOwnerId === undefined &&
            snapshot.p1.planarCameraCount === 0 &&
            snapshot.p1.liveRenderTargetCount === 0 &&
            [body?.pool, body?.river, body?.ocean].every(
              (readback) => readback?.requestedSource === "sky" && readback.effectiveSource === "sky"
            )
          );
        },
        null,
        { timeout: 30_000 }
      );
      await waitFrames(page, 2);
      const sky = await metrics(page);
      assert(sky.reflectionSource === "sky", `${tier}: native Sky source readback did not update.`);
      for (const bodyName of ["pool", "river", "ocean"]) {
        assert(sky.p1.bodyReadbacks[bodyName].requestedSource === "sky", `${tier}: ${bodyName} did not request Sky.`);
        assert(sky.p1.bodyReadbacks[bodyName].effectiveSource === "sky", `${tier}: ${bodyName} did not resolve Sky.`);
      }
      result.reflectionSkyReadback = sky.p1.bodyReadbacks;
      result.screenshots.bodyMatrixReflectionSky = await capture(page, tier, "body-matrix-reflection-sky");
      result.reflectionFeatureSignal = await compareCapturedImages(
        page,
        result.screenshots.bodyMatrixFinal,
        result.screenshots.bodyMatrixReflectionSky,
        ROIS.bodyMatrix
      );
      // River is intentionally Planar-ineligible; its reflection gate is the explicit
      // Probe/Sky fallback readback, while the two eligible bodies carry the pixel signal.
      assertNativeFeatureSignal(
        result.reflectionFeatureSignal,
        ["river", "poolHeightfield", "ocean"],
        `${tier}: native Planar/Sky reflection`
      );

      await invoke(page, "setReflectionSource", "probe");
      await page.waitForFunction(
        () => {
          const snapshot = window.waterPcgOptics?.metrics;
          const body = snapshot?.p1.bodyReadbacks;
          return (
            snapshot?.reflectionSource === "probe" &&
            snapshot.p1.selectedPlanarOwnerId === undefined &&
            snapshot.p1.renderedPlanarOwnerId === undefined &&
            snapshot.p1.planarCameraCount === 0 &&
            snapshot.p1.liveRenderTargetCount === 0 &&
            [body?.pool, body?.river, body?.ocean].every(
              (readback) => readback?.requestedSource === "probe" && readback.effectiveSource === "probe"
            )
          );
        },
        null,
        { timeout: 30_000 }
      );
      await waitFrames(page, 2);
      const probe = await metrics(page);
      result.reflectionProbeReadback = probe.p1.bodyReadbacks;
      result.screenshots.bodyMatrixReflectionProbe = await capture(page, tier, "body-matrix-reflection-probe");
      result.probeFeatureSignal = await compareCapturedImages(
        page,
        result.screenshots.bodyMatrixReflectionSky,
        result.screenshots.bodyMatrixReflectionProbe,
        ROIS.bodyMatrix
      );
      assertNativeFeatureSignal(
        result.probeFeatureSignal,
        ["river", "poolHeightfield", "ocean"],
        `${tier}: native Sky/Probe reflection`
      );
      await invoke(page, "setReflectionSource", "planar");
      await page.waitForFunction(
        () => {
          const snapshot = window.waterPcgOptics?.metrics;
          return (
            snapshot?.reflectionSource === "planar" &&
            snapshot.resolvedReflectionSource === "planar" &&
            snapshot.p1.renderedPlanarOwnerId === "water-optics-lab"
          );
        },
        null,
        { timeout: 30_000 }
      );
      await waitFrames(page, 4);
      result.nativeRestoreFingerprint = {
        initial: createHash("sha256")
          .update(await readFile(result.screenshots.bodyMatrixFinal))
          .digest("hex"),
        restored: await canvasFingerprint(page)
      };
      assert(
        result.nativeRestoreFingerprint.initial === result.nativeRestoreFingerprint.restored,
        `${tier}: native feature toggles did not restore the frozen initial pixels.`
      );
    }

    result.stablePoolLifecycle = await invoke(page, "runP1LifecycleStress", STRESS_ITERATIONS);
    assert(result.stablePoolLifecycle.balanced === true, `${tier}: stable request-pool lifecycle grew resources.`);

    result.lifecycleMatrix = await runLifecycleMatrix(page, tier, STRESS_ITERATIONS);

    if (tier === "high") {
      const beforeExperimental = await metrics(page);
      await invoke(page, "setTier", "experimental");
      await page.waitForFunction(
        () => {
          const snapshot = window.waterPcgOptics?.metrics;
          const body = snapshot?.p1.bodyReadbacks;
          return (
            snapshot?.requestedTier === "experimental" &&
            snapshot.p1.selectedPlanarOwnerId === "water-optics-lab" &&
            snapshot.p1.renderedPlanarOwnerId === "water-optics-lab" &&
            body?.pool.requestedTier === "experimental" &&
            body.river.requestedTier === "experimental" &&
            body.ocean.requestedTier === "experimental" &&
            body.river.fallbackReason === "planar-ineligible"
          );
        },
        null,
        { timeout: 30_000 }
      );
      await waitFrames(page, 2);
      const experimental = await metrics(page);
      assertBoundedRuntime(experimental, "experimental");
      assertBodyBindings(experimental, "experimental", "experimental");
      assert(
        experimental.p1.experimentalResolvedHigh === true,
        "Experimental did not resolve all bodies through High."
      );
      assert(
        experimental.p1.experimentalFallbackReason === "water-optics-experimental-resolved-high",
        `Experimental fallback was ${experimental.p1.experimentalFallbackReason}.`
      );
      assert(
        experimental.p1.experimentalAdditionalRenderTargetCount === 0,
        "Experimental allocated an extra RT class."
      );
      assert(
        experimental.p1.renderTargetCreateCount === beforeExperimental.p1.renderTargetCreateCount,
        "High -> Experimental recreated the Planar RT."
      );
      result.experimental = experimental.p1;
      await invoke(page, "setTier", "high");
      await waitFrames(page, 4);
    }

    await invoke(page, "setPreset", "multi-water-arbitration");
    await page.waitForFunction(
      () => {
        const p1 = window.waterPcgOptics?.metrics.p1;
        return (
          p1?.mode === "dual-pool" &&
          p1.materialConsumerCount === 3 &&
          p1.simultaneousVisibleMaterialConsumerCount === 3 &&
          p1.activeReflectionConsumerCount === 3 &&
          p1.renderedPlanarOwnerId === "water-optics-lab"
        );
      },
      null,
      { timeout: 30_000 }
    );
    const dualPoolInitial = await metrics(page);
    assertBoundedRuntime(dualPoolInitial, `${tier}: dual-pool initial`);
    assertBodyBindings(dualPoolInitial, tier, `${tier}: dual-pool initial`);
    assert(dualPoolInitial.p1.secondaryPoolRuntimeCreated === true, `${tier}: secondary Pool runtime was not created.`);
    assert(dualPoolInitial.p1.secondaryPoolRuntimeLiveCount === 1, `${tier}: secondary Pool runtime is not live.`);
    assert(
      dualPoolInitial.p1.secondaryPoolRuntimeCreateCount - dualPoolInitial.p1.secondaryPoolRuntimeDestroyCount === 1,
      `${tier}: secondary Pool runtime lifecycle is imbalanced.`
    );
    assert(dualPoolInitial.p1.eligiblePlanarRequestCount === 2, `${tier}: dual-pool eligible count is not 2.`);
    assert(
      dualPoolInitial.p1.consumerPlaneYs.secondaryPool !== dualPoolInitial.p1.consumerPlaneYs.pool,
      `${tier}: secondary Pool did not use a distinct water level.`
    );
    assert(dualPoolInitial.p1.bodyReadbacks.river.refractionEnabled === true, `${tier}: dual-pool River is inactive.`);
    result.screenshots.dualOwnerDebug = await capture(page, tier, "dual-owner-debug");
    if (!UPDATE_BASELINES && IS_CANONICAL_GOLDEN_LANE) {
      assert(committedDualOwner !== null, `${tier}: local dual-owner baseline bytes are unavailable.`);
      result.dualPoolBaseline = await compareCanvasToBaseline(
        page,
        result.screenshots.dualOwnerDebug,
        committedDualOwner.dataUrl,
        ROIS.dualPool
      );
      assertBaselineComparison(result.dualPoolBaseline, `${tier}: dual pool`);
    } else {
      result.dualPoolSemantic = await analyzeCapturedImage(page, result.screenshots.dualOwnerDebug, ROIS.dualPool);
      assertNativeSemanticImage(result.dualPoolSemantic, `${tier}: native dual pool`);
      if (UPDATE_BASELINES) {
        result.baselineReview.dualOwnerDebug = await createBaselineReviewArtifact(
          page,
          tier,
          "dual-owner-debug",
          result.screenshots.dualOwnerDebug,
          committedDualOwner
        );
      }
    }

    const ownerSamples = await sampleFrames(page, OWNER_STABILITY_FRAMES);
    assert(
      ownerSamples.every(
        (sample) =>
          sample.mode === "dual-pool" &&
          sample.simultaneousVisibleMaterialConsumerCount === 3 &&
          sample.selectedPlanarOwnerId === "water-optics-lab" &&
          sample.renderedPlanarOwnerId === "water-optics-lab" &&
          sample.planarCameraCount <= 1 &&
          sample.liveRenderTargetCount <= 1
      ),
      `${tier}: dual-pool owner changed during the 300-frame stability window.`
    );
    result.ownerStability = {
      frames: ownerSamples.length,
      ownerId: "water-optics-lab",
      consumerIds: dualPoolInitial.p1.consumerIds,
      passed: true
    };

    const visibleFingerprint = await canvasFingerprint(page);
    await invoke(page, "setP1PlanarConsumerVisible", "pool", false);
    const handoffSamples = await sampleFrames(page, HANDOFF_LIMIT_FRAMES);
    const hiddenFingerprint = await canvasFingerprint(page);
    assert(hiddenFingerprint !== visibleFingerprint, `${tier}: hiding the real primary Pool did not change pixels.`);
    const handoffFrame = handoffSamples.findIndex(
      (sample) =>
        sample.selectedPlanarOwnerId === "water-optics-lab-secondary-pool" &&
        sample.renderedPlanarOwnerId === "water-optics-lab-secondary-pool"
    );
    assert(handoffFrame >= 0, `${tier}: secondary Pool did not take ownership within six frames.`);
    assert(
      handoffSamples
        .slice(0, handoffFrame)
        .some((sample) => sample.pendingPlanarOwnerId === "water-optics-lab-secondary-pool"),
      `${tier}: handoff did not expose the pending secondary Pool owner.`
    );
    result.ownerHandoff = {
      limitFrames: HANDOFF_LIMIT_FRAMES,
      completedAtFrame: handoffFrame + 1,
      pendingObserved: true,
      primaryPoolPixelFingerprint: visibleFingerprint,
      hiddenPrimaryPoolPixelFingerprint: hiddenFingerprint,
      selectedOwnerId: handoffSamples[handoffFrame].selectedPlanarOwnerId,
      renderedOwnerId: handoffSamples[handoffFrame].renderedPlanarOwnerId
    };

    await invoke(page, "setPreset", "cross-body-optics");
    await waitFrames(page, 4);
    const secondaryCleanup = await metrics(page);
    assert(secondaryCleanup.p1.mode === "cross-body", `${tier}: failed to restore cross-body mode.`);
    assert(secondaryCleanup.p1.secondaryPoolRuntimeCreated === false, `${tier}: secondary Pool runtime survived exit.`);
    assert(
      secondaryCleanup.p1.secondaryPoolRuntimeLiveCount === 0,
      `${tier}: secondary Pool GPU resources survived exit.`
    );
    assert(
      secondaryCleanup.p1.secondaryPoolRuntimeCreateCount === secondaryCleanup.p1.secondaryPoolRuntimeDestroyCount,
      `${tier}: secondary Pool create/destroy counts are imbalanced after exit.`
    );
    result.secondaryPoolCleanup = {
      createCount: secondaryCleanup.p1.secondaryPoolRuntimeCreateCount,
      destroyCount: secondaryCleanup.p1.secondaryPoolRuntimeDestroyCount,
      liveCount: secondaryCleanup.p1.secondaryPoolRuntimeLiveCount
    };

    if (diagnostics.errors.length > 0) throw new Error(diagnostics.errors.join("\n"));
    result.status = "passed";
  } catch (error) {
    result.failures.push(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
    result.status = "failed";
  } finally {
    await context.close().catch((error) => result.failures.push(`[context-close] ${String(error)}`));
    if (result.failures.length > 0) result.status = "failed";
  }
  return result;
}

async function commitBaselineUpdate(results, browserVersion) {
  if (!UPDATE_BASELINES) return;
  const baselineParent = resolve(BASELINE_ROOT, "..");
  const stagingRoot = resolve(baselineParent, `.p1-update-${runId}`);
  const backupRoot = resolve(baselineParent, `.p1-backup-${runId}`);
  const reviewManifestPath = resolve(OUTPUT_DIRECTORY, "baseline-review", "manifest.json");
  await mkdir(resolve(OUTPUT_DIRECTORY, "baseline-review"), { recursive: true });
  await writeFile(
    reviewManifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        gate: "water-optics-p1-baseline-review",
        generatedAt: new Date().toISOString(),
        reason: BASELINE_UPDATE_REASON,
        baselineRoot: BASELINE_ROOT,
        tiers: results.map((result) => ({ tier: result.tier, captures: result.baselineReview }))
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  try {
    for (const result of results) {
      assert(result.status === "passed", `${result.tier}: refusing to stage a failed baseline candidate.`);
      assert(result.bodyMatrixSemantic, `${result.tier}: baseline update lacks body semantic evidence.`);
      assert(result.refractionFeatureSignal, `${result.tier}: baseline update lacks refraction feature evidence.`);
      assert(result.reflectionFeatureSignal, `${result.tier}: baseline update lacks reflection feature evidence.`);
      assert(result.probeFeatureSignal, `${result.tier}: baseline update lacks Sky/Probe feature evidence.`);
      assert(result.nativeRestoreFingerprint, `${result.tier}: baseline update lacks deterministic restore evidence.`);
      assert(result.dualPoolSemantic, `${result.tier}: baseline update lacks dual-Pool semantic evidence.`);
      assert(
        result.baselineReview?.bodyMatrixFinal && result.baselineReview?.dualOwnerDebug,
        `${result.tier}: baseline update lacks old/new/diff review artifacts.`
      );
      const tierDirectory = resolve(stagingRoot, result.tier);
      await mkdir(tierDirectory, { recursive: true });
      const candidatePaths = {
        "body-matrix-final": result.screenshots.bodyMatrixFinal,
        "dual-owner-debug": result.screenshots.dualOwnerDebug
      };
      const captures = {};
      for (const [name, sourcePath] of Object.entries(candidatePaths)) {
        assert(
          typeof sourcePath === "string" && sourcePath.length > 0,
          `${result.tier}: ${name} candidate is missing.`
        );
        const bytes = await readFile(sourcePath);
        const fileName = `${name}.png`;
        await copyFile(sourcePath, resolve(tierDirectory, fileName));
        captures[name] = {
          file: fileName,
          sha256: createHash("sha256").update(bytes).digest("hex")
        };
      }
      await writeFile(
        resolve(tierDirectory, "roi.json"),
        `${JSON.stringify(
          {
            schemaVersion: 2,
            gate: "water-optics-p1-acceptance",
            tier: result.tier,
            fixedEnvironment: {
              viewport: VIEWPORT,
              deviceScaleFactor: DEVICE_SCALE_FACTOR,
              surfaceTime: FIXED_SURFACE_TIME,
              statsEnabled: false,
              browser: "local Chromium",
              browserVersion,
              rendererLane: "canonical-golden",
              launchArgument: "--use-angle=swiftshader",
              requiredRendererSubstring: CANONICAL_RENDERER_SUBSTRING,
              unsupportedClaims: ["Safari", "Android real device", "iOS real device"]
            },
            rois: ROIS,
            thresholds: {
              maximumDiffPixelRatio: BASELINE_MAXIMUM_DIFF_PIXEL_RATIO,
              perChannelByteTolerance: BASELINE_PER_CHANNEL_BYTE_TOLERANCE,
              maximumRoiMeanAbsoluteDifference: BASELINE_MAXIMUM_ROI_MAD,
              minimumRoiLuminanceVariance: BASELINE_MINIMUM_ROI_VARIANCE
            },
            captures,
            lastBaselineUpdate: {
              reason: BASELINE_UPDATE_REASON,
              previousCaptures: {
                "body-matrix-final": result.baselineReview.bodyMatrixFinal.oldSha256,
                "dual-owner-debug": result.baselineReview.dualOwnerDebug.oldSha256
              }
            }
          },
          null,
          2
        )}\n`,
        "utf8"
      );
    }
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  try {
    await rename(BASELINE_ROOT, backupRoot);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  try {
    if (BASELINE_UPDATE_FAILURE_INJECTION === "commit-rename") {
      throw new Error("Injected baseline commit rename failure.");
    }
    await rename(stagingRoot, BASELINE_ROOT);
  } catch (commitError) {
    try {
      await rename(backupRoot, BASELINE_ROOT);
    } catch (rollbackError) {
      throw new AggregateError(
        [commitError, rollbackError],
        `Baseline commit and rollback both failed. Recover ${BASELINE_ROOT} from ${backupRoot}; staged candidates remain at ${stagingRoot}.`
      );
    }
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    throw commitError;
  }

  try {
    if (BASELINE_UPDATE_FAILURE_INJECTION === "backup-cleanup") {
      throw new Error("Injected baseline backup cleanup failure.");
    }
    await rm(backupRoot, { recursive: true, force: true });
    return [];
  } catch (cleanupError) {
    return [
      `Baseline update committed, but backup cleanup failed. The valid previous baseline is recoverable at ${backupRoot}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
    ];
  }
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const baseUrl = process.env.WATER_OPTICS_URL ?? DEFAULT_URL;
const report = {
  schemaVersion: 2,
  gate: "water-optics-p1-acceptance",
  status: "running",
  generatedAt: new Date().toISOString(),
  outputDirectory: OUTPUT_DIRECTORY,
  environment: {
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    surfaceTime: FIXED_SURFACE_TIME,
    browser: "local Chromium only",
    headed: HEADED,
    rendererLane: RENDERER_LANE,
    browserLaunchArguments: BROWSER_LAUNCH_ARGUMENTS,
    canonicalRendererSubstring: IS_CANONICAL_GOLDEN_LANE ? CANONICAL_RENDERER_SUBSTRING : null,
    nativeRendererSubstring: IS_CANONICAL_GOLDEN_LANE ? null : NATIVE_RENDERER_SUBSTRING,
    visualGate: IS_CANONICAL_GOLDEN_LANE ? "canonical-full-frame-and-roi" : "native-semantic-and-feature-signal",
    ownerStabilityFrames: OWNER_STABILITY_FRAMES,
    handoffLimitFrames: HANDOFF_LIMIT_FRAMES,
    lifecycleIterations: STRESS_ITERATIONS,
    baselineUpdate: UPDATE_BASELINES,
    baselineUpdateReason: UPDATE_BASELINES ? BASELINE_UPDATE_REASON : null,
    baselineRoot: BASELINE_ROOT,
    unsupportedClaims: ["Safari", "Android real device", "iOS real device"]
  },
  rois: ROIS,
  tiers: [],
  failures: [],
  warnings: []
};

let browser;
try {
  assert(RENDERER_LANES.includes(RENDERER_LANE), `Unknown renderer lane ${RENDERER_LANE}.`);
  assert(
    IS_CANONICAL_GOLDEN_LANE || HEADED,
    "native-hardware validation requires WATER_OPTICS_HEADED=1 so it cannot silently become a software lane."
  );
  assert(
    IS_CANONICAL_GOLDEN_LANE || NATIVE_RENDERER_SUBSTRING.trim().length > 0,
    "native-hardware validation requires a non-empty expected renderer substring."
  );
  assert(
    IS_CANONICAL_GOLDEN_LANE || !UPDATE_BASELINES,
    "Only the canonical-golden renderer lane may update committed baselines."
  );
  assert(
    !UPDATE_BASELINES || BASELINE_UPDATE_REASON.length >= 12,
    "Baseline updates require WATER_OPTICS_P1_BASELINE_UPDATE_REASON with at least 12 characters."
  );
  assert(
    BASELINE_UPDATE_FAILURE_INJECTION.length === 0 ||
      (UPDATE_BASELINES &&
        typeof process.env.WATER_OPTICS_P1_BASELINE_ROOT === "string" &&
        BASELINE_ROOT !== DEFAULT_BASELINE_ROOT),
    "Baseline failure injection requires update mode and an explicit isolated baseline root."
  );
  assert(
    ["", "commit-rename", "backup-cleanup"].includes(BASELINE_UPDATE_FAILURE_INJECTION),
    `Unknown baseline failure injection step ${BASELINE_UPDATE_FAILURE_INJECTION}.`
  );
  browser = await chromium.launch({ headless: !HEADED, args: BROWSER_LAUNCH_ARGUMENTS });
  report.browserVersion = browser.version();
  for (const tier of TIERS) report.tiers.push(await verifyTier(browser, baseUrl, tier));
  report.failures.push(...report.tiers.flatMap((tier) => tier.failures.map((failure) => `${tier.tier}: ${failure}`)));
} catch (error) {
  report.failures.push(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  await browser?.close().catch((error) => report.failures.push(`[browser-close] ${String(error)}`));
  if (
    UPDATE_BASELINES &&
    report.failures.length === 0 &&
    report.tiers.length === TIERS.length &&
    report.tiers.every((tier) => tier.status === "passed")
  ) {
    try {
      report.warnings.push(...(await commitBaselineUpdate(report.tiers, report.browserVersion)));
    } catch (error) {
      report.failures.push(
        `[baseline-commit] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
      );
    }
  }
  report.status =
    report.failures.length === 0 &&
    report.tiers.length === TIERS.length &&
    report.tiers.every((tier) => tier.status === "passed")
      ? "passed"
      : "failed";
  report.completedAt = new Date().toISOString();
  report.reportPath = resolve(OUTPUT_DIRECTORY, "result.json");
  await writeFile(report.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

if (report.status !== "passed") process.exitCode = 1;
