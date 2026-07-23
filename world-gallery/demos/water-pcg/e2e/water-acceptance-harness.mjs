import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXED_ACCEPTANCE_ENVIRONMENT } from "./water-acceptance-cases.mjs";

const SCRIPT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
export const WORLD_GALLERY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
export const DEFAULT_WATER_PCG_URL = "http://127.0.0.1:4179/demos/water-pcg/";
export const DEFAULT_ACCEPTANCE_OUTPUT_ROOT = "/tmp/water-pcg-acceptance";
export const SOFTWARE_RENDERER_PATTERN =
  /SwiftShader|llvmpipe|softpipe|software rasterizer|Microsoft Basic Render|\bWARP\b|lavapipe/i;

const WEBGL_FAILURE_PATTERN =
  /WebGL(?:[\s:.-]|$)|Could not compile WebGL shader|Could not link WebGL program|INVALID_(?:ENUM|VALUE|OPERATION|FRAMEBUFFER_OPERATION)/i;
const READBACK_WARNING_PATTERN = /GPU stall due to ReadPixels/i;

export class WaterAcceptanceError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "WaterAcceptanceError";
    this.details = details;
  }
}

export function assertAcceptance(condition, message, details) {
  if (!condition) throw new WaterAcceptanceError(message, details);
}

export function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? "",
      details: error.details
    };
  }
  return { name: "UnknownError", message: String(error), stack: "" };
}

export function createRunContext(gate, environment = process.env, now = new Date()) {
  const runId = now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const outputRoot = resolve(environment.WATER_PCG_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_ACCEPTANCE_OUTPUT_ROOT);
  const outputDirectory = resolve(outputRoot, gate, runId);
  return Object.freeze({
    gate,
    runId,
    outputRoot,
    outputDirectory,
    resultPath: resolve(outputDirectory, "result.json")
  });
}

export function readGitEvidence() {
  const run = (args) => execFileSync("git", args, { cwd: WORLD_GALLERY_ROOT, encoding: "utf8" }).trim();
  try {
    return {
      head: run(["rev-parse", "HEAD"]),
      branch: run(["branch", "--show-current"]) || "detached",
      waterPcgStatus: run(["status", "--porcelain=v1", "--untracked-files=all", "--", "demos/water-pcg"])
    };
  } catch (error) {
    return { status: "unavailable", error: serializeError(error) };
  }
}

export function collectPageDiagnostics(page) {
  const diagnostics = {
    errors: [],
    readbackWarnings: [],
    warnings: [],
    failedResponses: []
  };
  page.on("pageerror", (error) => {
    diagnostics.errors.push(`[pageerror] ${error.stack ?? error.message}`);
  });
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") {
      diagnostics.errors.push(`[console] ${text}`);
      return;
    }
    if (message.type() !== "warning") return;
    if (READBACK_WARNING_PATTERN.test(text)) {
      diagnostics.readbackWarnings.push(text);
      return;
    }
    diagnostics.warnings.push(text);
    if (WEBGL_FAILURE_PATTERN.test(text)) diagnostics.errors.push(`[console-warning] ${text}`);
  });
  page.on("requestfailed", (request) => {
    diagnostics.errors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? "unknown"}`);
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const entry = `${response.status()} ${response.url()}`;
    diagnostics.failedResponses.push(entry);
    diagnostics.errors.push(`[http] ${entry}`);
  });
  return diagnostics;
}

export function createCaseUrl(baseUrl, definition, overrides = {}) {
  const url = new URL(baseUrl || DEFAULT_WATER_PCG_URL);
  url.hash = definition.id;
  url.search = "";
  url.searchParams.set("quality", overrides.quality ?? FIXED_ACCEPTANCE_ENVIRONMENT.quality);
  url.searchParams.set("surfaceTime", String(overrides.surfaceTime ?? FIXED_ACCEPTANCE_ENVIRONMENT.surfaceTime));
  url.searchParams.set("seed", String(overrides.seed ?? FIXED_ACCEPTANCE_ENVIRONMENT.seed));
  url.searchParams.set("stats", "0");
  url.searchParams.set("tour", "0");
  url.searchParams.set("acceptance", "1");
  if (overrides.profile === true) url.searchParams.set("profile", "1");
  return url;
}

export async function waitForAnimationFrames(page, frameCount = 2) {
  await page.evaluate(
    (count) =>
      new Promise((resolveFrame) => {
        let remaining = count;
        const next = () => {
          if (--remaining <= 0) resolveFrame();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frameCount
  );
}

function collectCaseSnapshotInPage(definition) {
  const clone = (value) => {
    if (value === undefined) return undefined;
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  };
  const html = document.documentElement;
  const readDataset = (selector) => {
    const element = document.querySelector(selector);
    return element instanceof HTMLElement ? Object.fromEntries(Object.entries(element.dataset)) : undefined;
  };
  const acceptanceApi = window.waterPcgAcceptance;
  let acceptance;
  try {
    if (acceptanceApi) {
      const candidate =
        typeof acceptanceApi.snapshot === "function"
          ? acceptanceApi.snapshot()
          : (acceptanceApi.snapshot ?? acceptanceApi);
      if (candidate && typeof candidate.then !== "function") acceptance = clone(candidate);
    }
  } catch (error) {
    acceptance = { ready: false, runtimeError: error instanceof Error ? error.message : String(error) };
  }
  const featureApi = window.waterPcgFeature;
  let feature;
  try {
    if (featureApi) {
      const candidate = typeof featureApi.snapshot === "function" ? featureApi.snapshot() : undefined;
      if (candidate && typeof candidate.then !== "function") feature = clone(candidate);
    }
  } catch (error) {
    feature = {
      ready: false,
      finite: false,
      runtimeError: error instanceof Error ? error.message : String(error),
      signal: 0
    };
  }

  const riverDebug = window.waterPcgDebug?.snapshot;
  const river = riverDebug
    ? {
        status: riverDebug.status,
        statusMessage: riverDebug.statusMessage,
        quality: riverDebug.context?.quality,
        resourceHash: riverDebug.context?.resourceHash,
        stats: clone(riverDebug.context?.data?.stats),
        metrics: clone(riverDebug.context?.metrics)
      }
    : undefined;
  const p0 = window.waterPcgP0
    ? {
        worldMetrics: clone(window.waterPcgP0.worldMetrics),
        bodyMetrics: clone(window.waterPcgP0.bodyMetrics)
      }
    : undefined;
  const pool = window.waterPcgInteractivePoolMetrics ? clone(window.waterPcgInteractivePoolMetrics) : undefined;
  const poolP1 = window.waterPcgP1?.metrics ? clone(window.waterPcgP1.metrics) : undefined;
  const underwater = window.waterPcgUnderwater
    ? {
        isUnderwater: window.waterPcgUnderwater.isUnderwater,
        activeBodyId: window.waterPcgUnderwater.activeBodyId,
        transitionCount: window.waterPcgUnderwater.transitionCount,
        passExecutionCount: window.waterPcgUnderwater.passExecutionCount,
        passMaterialAllocated: window.waterPcgUnderwater.passMaterialAllocated,
        passMaterialCreateCount: window.waterPcgUnderwater.passMaterialCreateCount,
        passMaterialDestroyCount: window.waterPcgUnderwater.passMaterialDestroyCount,
        opticalContinuity: clone(window.waterPcgUnderwater.opticalContinuity)
      }
    : undefined;
  const ocean =
    typeof window.waterPcgGetOceanMetrics === "function" ? clone(window.waterPcgGetOceanMetrics()) : undefined;
  const reflection =
    typeof window.waterPcgGetReflectionMetrics === "function"
      ? clone(window.waterPcgGetReflectionMetrics())
      : undefined;
  const optics = window.waterPcgOptics?.metrics ? clone(window.waterPcgOptics.metrics) : undefined;
  const heightfield = window.heightfieldWaterDemo?.metrics ? clone(window.heightfieldWaterDemo.metrics) : undefined;
  const buoyancy = window.waterBuoyancyDemo?.metrics
    ? {
        ...clone(window.waterBuoyancyDemo.metrics),
        buoyancyEnabled: window.waterBuoyancyDemo.buoyancyEnabled,
        currentEnabled: window.waterBuoyancyDemo.currentEnabled
      }
    : undefined;
  const camera = window.waterPcgShowcaseCamera?.snapshot ? clone(window.waterPcgShowcaseCamera.snapshot) : undefined;

  let ready = acceptance ? acceptance.ready === true : false;
  if (!acceptance) {
    switch (definition.runtime) {
      case "river":
        ready = river?.status === "ready";
        break;
      case "pool":
        ready = pool?.ready === true;
        break;
      case "ocean":
        ready = Number.isFinite(ocean?.frameCount) && ocean.frameCount > 2;
        break;
      case "optics-lab":
        ready = optics?.ready === true;
        break;
      case "heightfield":
        ready = heightfield?.ready === true;
        break;
      case "buoyancy":
        ready = buoyancy?.ready === true;
        break;
    }
  }

  const runtimeError =
    acceptance?.runtimeError ??
    feature?.runtimeError ??
    pool?.runtimeError ??
    optics?.runtimeError ??
    heightfield?.runtimeError ??
    buoyancy?.runtimeError ??
    buoyancy?.driftRuntimeError ??
    (river?.status === "error" ? river.statusMessage : "");
  const finite =
    acceptance?.finite ??
    feature?.finite ??
    pool?.finite ??
    buoyancy?.finite ??
    buoyancy?.driftFinite ??
    (runtimeError === "" && ready);

  return {
    identity: {
      caseId: html.dataset.waterPcgCase ?? "",
      group: html.dataset.waterPcgGroup ?? "",
      runtime: html.dataset.waterPcgRuntime ?? html.dataset.waterPcgKind ?? "",
      preset: html.dataset.waterPcgPreset ?? ""
    },
    ready,
    finite,
    runtimeError: runtimeError ?? "",
    acceptance,
    river,
    p0,
    pool,
    poolP1,
    underwater,
    ocean,
    reflection,
    optics,
    heightfield,
    buoyancy,
    feature,
    camera,
    datasets: {
      shell: readDataset("#example-bar"),
      pool: readDataset("#interactive-pool-metrics"),
      heightfield: readDataset("#heightfield-metrics"),
      buoyancy: readDataset("#buoyancy-metrics"),
      optics: readDataset("#water-optics-metrics")
    }
  };
}

export async function readCaseSnapshot(page, definition) {
  return page.evaluate(collectCaseSnapshotInPage, definition);
}

export async function waitForCaseReady(page, definition, timeoutMs = 45_000) {
  const deadline = performance.now() + timeoutMs;
  let latest;
  while (performance.now() < deadline) {
    try {
      latest = await readCaseSnapshot(page, definition);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Execution context was destroyed|most likely because of a navigation/i.test(message)) throw error;
      await page.waitForLoadState("domcontentloaded", { timeout: Math.max(1, deadline - performance.now()) });
      continue;
    }
    if (latest.ready) return latest;
    await page.waitForTimeout(100);
  }
  throw new WaterAcceptanceError(`${definition.id} did not become ready within ${timeoutMs}ms.`, latest);
}

export function assertCaseIdentity(snapshot, definition) {
  assertAcceptance(
    snapshot.identity.caseId === definition.id,
    `${definition.id} resolved to case '${snapshot.identity.caseId || "missing"}'.`,
    snapshot.identity
  );
  assertAcceptance(
    snapshot.identity.group === definition.group,
    `${definition.id} resolved group '${snapshot.identity.group || "missing"}', expected '${definition.group}'.`,
    snapshot.identity
  );
  assertAcceptance(
    snapshot.identity.runtime === definition.runtime,
    `${definition.id} resolved runtime '${snapshot.identity.runtime || "missing"}', expected '${definition.runtime}'.`,
    snapshot.identity
  );
  assertAcceptance(
    snapshot.identity.preset === definition.preset,
    `${definition.id} resolved preset '${snapshot.identity.preset || "missing"}', expected '${definition.preset}'.`,
    snapshot.identity
  );
}

export function assertRuntimeHealthy(snapshot, definition) {
  assertAcceptance(snapshot.ready === true, `${definition.id} is not ready.`, snapshot);
  assertAcceptance(snapshot.runtimeError === "", `${definition.id} reported '${snapshot.runtimeError}'.`, snapshot);
  assertAcceptance(snapshot.finite === true, `${definition.id} did not prove a finite runtime state.`, snapshot);
}

export async function readCanvasProbe(page, size = { width: 64, height: 36 }) {
  return page.evaluate(
    ({ width, height }) =>
      new Promise((resolveProbe, rejectProbe) => {
        requestAnimationFrame(() => {
          try {
            const source = document.querySelector("canvas#canvas");
            if (!(source instanceof HTMLCanvasElement)) throw new Error("Water PCG canvas is unavailable.");
            const probe = document.createElement("canvas");
            probe.width = width;
            probe.height = height;
            const context = probe.getContext("2d", { alpha: false, willReadFrequently: true });
            if (!context) throw new Error("Canvas readback context is unavailable.");
            context.drawImage(source, 0, 0, width, height);
            const pixels = context.getImageData(0, 0, width, height).data;
            const luminance = new Array(width * height);
            let sum = 0;
            let sumSquares = 0;
            let fingerprint = 0x811c9dc5;
            let borderBlackCount = 0;
            let borderPixelCount = 0;
            for (let pixelIndex = 0; pixelIndex < luminance.length; pixelIndex++) {
              const offset = pixelIndex * 4;
              const value = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
              luminance[pixelIndex] = value;
              sum += value;
              sumSquares += value * value;
              for (let channel = 0; channel < 4; channel++) {
                fingerprint ^= pixels[offset + channel];
                fingerprint = Math.imul(fingerprint, 0x01000193);
              }
              const x = pixelIndex % width;
              const y = Math.floor(pixelIndex / width);
              if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) {
                borderPixelCount++;
                if (value < 1) borderBlackCount++;
              }
            }
            const mean = sum / luminance.length;
            resolveProbe({
              sourceWidth: source.width,
              sourceHeight: source.height,
              width,
              height,
              mean,
              variance: sumSquares / luminance.length - mean * mean,
              borderBlackRatio: borderPixelCount === 0 ? 1 : borderBlackCount / borderPixelCount,
              fingerprint: (fingerprint >>> 0).toString(16).padStart(8, "0"),
              luminance
            });
          } catch (error) {
            rejectProbe(error);
          }
        });
      }),
    size
  );
}

export function summarizeCanvasProbe(probe) {
  const { luminance: _luminance, ...summary } = probe;
  return summary;
}

export function meanAbsoluteDifference(left, right) {
  assertAcceptance(
    left.length === right.length && left.length > 0,
    "Canvas probes have incompatible or empty sample arrays."
  );
  let sum = 0;
  for (let index = 0; index < left.length; index++) sum += Math.abs(left[index] - right[index]);
  return sum / left.length;
}

export function assertCanvasHealthy(probe, label) {
  assertAcceptance(probe.sourceWidth > 0 && probe.sourceHeight > 0, `${label} canvas has invalid dimensions.`, probe);
  assertAcceptance(Number.isFinite(probe.mean), `${label} canvas mean is non-finite.`, probe);
  assertAcceptance(
    Number.isFinite(probe.variance) && probe.variance > 1,
    `${label} canvas is blank or uniform.`,
    probe
  );
  assertAcceptance(probe.borderBlackRatio < 0.98, `${label} canvas has an all-black border.`, probe);
}

export function collectNonFinite(value, path = "value", output = []) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) output.push(path);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) collectNonFinite(child, `${path}.${key}`, output);
  return output;
}

export function assertNoPageErrors(diagnostics, label) {
  assertAcceptance(
    diagnostics.errors.length === 0,
    `${label} produced browser, request, HTTP, or WebGL errors:\n${diagnostics.errors.join("\n")}`,
    diagnostics
  );
}

export async function writeAcceptanceReport(run, report) {
  await mkdir(run.outputDirectory, { recursive: true });
  await writeFile(run.resultPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function collectWebGlEnvironment(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return { graphicsApi: "unavailable" };
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { graphicsApi: "unavailable" };
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    const read = (parameter) => {
      try {
        return String(gl.getParameter(parameter) ?? "");
      } catch {
        return "";
      }
    };
    return {
      graphicsApi:
        typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext ? "webgl2" : "webgl1",
      renderer: read(gl.RENDERER),
      vendor: read(gl.VENDOR),
      unmaskedRenderer: extension ? read(extension.UNMASKED_RENDERER_WEBGL) : "",
      unmaskedVendor: extension ? read(extension.UNMASKED_VENDOR_WEBGL) : ""
    };
  });
}
