import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_APP_URL = "http://127.0.0.1:4179/demos/water-pcg/#water-optics-lab";
const DEFAULT_DRIVER_URL = "http://127.0.0.1:4444";
const DEFAULT_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const FIXED_SURFACE_TIME = 12.5;
const TIERS = Object.freeze(["medium", "high"]);
const TARGET_KINDS = Object.freeze(["macos", "ios-simulator", "ios-device"]);
const EXPERIMENTAL_FALLBACK_REASON = "water-optics-experimental-resolved-high";
const WEBGL_FAILURE_PATTERN =
  /WebGL(?:[\s:.-]|$)|GL_INVALID_|INVALID_(?:ENUM|VALUE|OPERATION|FRAMEBUFFER_OPERATION)|shader\s+(?:compile|link)|Could not (?:compile|link)|CONTEXT_LOST_WEBGL/i;
const ENVIRONMENT_BLOCK_PATTERN =
  /remote automation|allow remote automation|session not created|could not create a session|unable to connect|connection refused|no (?:matching )?device|device.+(?:unavailable|locked|not paired)|simulator.+(?:unavailable|not found)|developer mode|automation session/i;
const SCRIPT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const WORLD_GALLERY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");

export class WebDriverProtocolError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "WebDriverProtocolError";
    this.operation = options.operation;
    this.errorCode = options.errorCode;
    this.httpStatus = options.httpStatus;
    this.remoteStacktrace = options.remoteStacktrace;
  }
}

export class AcceptanceError extends Error {
  constructor(message) {
    super(message);
    this.name = "AcceptanceError";
  }
}

export class EnvironmentBlockedError extends Error {
  constructor(message, reason = "environment-unavailable") {
    super(message);
    this.name = "EnvironmentBlockedError";
    this.reason = reason;
  }
}

function assert(condition, message) {
  if (!condition) throw new AcceptanceError(message);
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function isLoopbackHost(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
}

function publicUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  return url.href;
}

export function createRequestedCapabilities(target) {
  const alwaysMatch = {
    browserName: "safari",
    platformName: target.kind === "macos" ? "macOS" : "iOS",
    pageLoadStrategy: "normal",
    acceptInsecureCerts: false,
    "safari:automaticInspection": false,
    "safari:automaticProfiling": false
  };
  if (target.platformVersion) alwaysMatch["safari:platformVersion"] = target.platformVersion;
  if (target.kind !== "macos") {
    alwaysMatch["safari:deviceType"] = target.deviceType;
    alwaysMatch["safari:deviceName"] = target.deviceName;
    alwaysMatch["safari:useSimulator"] = target.kind === "ios-simulator";
    if (target.udid) alwaysMatch["safari:deviceUDID"] = target.udid;
  }
  return { alwaysMatch, firstMatch: [{}] };
}

export function createPublicTarget(target) {
  return Object.freeze({
    kind: target.kind,
    platformVersion: target.platformVersion || undefined,
    deviceType: target.kind === "macos" ? undefined : target.deviceType,
    deviceName: target.kind === "macos" ? undefined : target.deviceName,
    udidSha256: target.udid ? sha256(target.udid) : undefined
  });
}

export function createConfiguration(environment = process.env, now = new Date()) {
  const kind = environment.WATER_OPTICS_SAFARI_TARGET ?? "macos";
  if (!TARGET_KINDS.includes(kind)) {
    throw new EnvironmentBlockedError(
      `WATER_OPTICS_SAFARI_TARGET must be one of ${TARGET_KINDS.join(", ")}; received ${kind}.`,
      "invalid-target"
    );
  }
  const appUrl = new URL(environment.WATER_OPTICS_URL ?? DEFAULT_APP_URL);
  const driverUrl = new URL(environment.WATER_OPTICS_WEBDRIVER_URL ?? DEFAULT_DRIVER_URL);
  const target = {
    kind,
    platformVersion: environment.WATER_OPTICS_SAFARI_PLATFORM_VERSION ?? "",
    deviceType: environment.WATER_OPTICS_SAFARI_DEVICE_TYPE ?? "iPhone",
    deviceName: environment.WATER_OPTICS_SAFARI_DEVICE_NAME ?? "iPhone",
    udid: environment.WATER_OPTICS_SAFARI_DEVICE_UDID ?? ""
  };
  if (kind === "ios-device" && !target.udid) {
    throw new EnvironmentBlockedError(
      "WATER_OPTICS_SAFARI_DEVICE_UDID is required for ios-device runs.",
      "missing-device-udid"
    );
  }
  if (kind === "ios-device" && isLoopbackHost(appUrl.hostname)) {
    throw new EnvironmentBlockedError(
      "ios-device requires WATER_OPTICS_URL to use a host reachable from the physical device, not loopback.",
      "device-unreachable-app-url"
    );
  }
  const runId = now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const outputRoot = resolve(
    environment.WATER_OPTICS_SAFARI_OUTPUT_DIR ??
      resolve(WORLD_GALLERY_ROOT, "output/webdriver/water-optics-p1-safari-device-acceptance")
  );
  const canAutostart = isLoopbackHost(driverUrl.hostname) && (driverUrl.pathname === "/" || driverUrl.pathname === "");
  return Object.freeze({
    appUrl,
    driverUrl,
    driverExecutable: environment.WATER_OPTICS_SAFARI_DRIVER ?? "/usr/bin/safaridriver",
    autostartDriver:
      environment.WATER_OPTICS_SAFARI_AUTOSTART === "1" ||
      (environment.WATER_OPTICS_SAFARI_AUTOSTART !== "0" && canAutostart),
    target: Object.freeze(target),
    viewport: Object.freeze({
      width: parseInteger(environment.WATER_OPTICS_SAFARI_VIEWPORT_WIDTH, DEFAULT_VIEWPORT.width, 320, 8192),
      height: parseInteger(environment.WATER_OPTICS_SAFARI_VIEWPORT_HEIGHT, DEFAULT_VIEWPORT.height, 240, 8192)
    }),
    lifecycleIterations: parseInteger(environment.WATER_OPTICS_SAFARI_STRESS_ITERATIONS, 10, 1, 100),
    commandTimeoutMs: parseInteger(environment.WATER_OPTICS_SAFARI_COMMAND_TIMEOUT_MS, 45_000, 5_000, 180_000),
    startupTimeoutMs: parseInteger(environment.WATER_OPTICS_SAFARI_STARTUP_TIMEOUT_MS, 8_000, 1_000, 60_000),
    runId,
    outputDirectory: resolve(outputRoot, runId),
    reportPath: resolve(outputRoot, runId, "result.json")
  });
}

function endpointUrl(baseUrl, path) {
  const url = new URL(baseUrl.href);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}${path.startsWith("/") ? path : `/${path}`}` || "/";
  url.search = "";
  url.hash = "";
  return url;
}

export class W3CWebDriverClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl instanceof URL ? new URL(baseUrl.href) : new URL(baseUrl);
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sessionId = undefined;
    if (typeof this.fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  }

  async request(method, path, body, operation = `${method} ${path}`, timeoutMs = this.timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(endpointUrl(this.baseUrl, path), {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json; charset=utf-8" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new WebDriverProtocolError(`${operation} transport failed: ${detail}`, { operation });
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new WebDriverProtocolError(`${operation} returned non-JSON HTTP ${response.status}.`, {
          operation,
          httpStatus: response.status
        });
      }
    }
    const value = payload?.value;
    const remoteError = value && typeof value === "object" ? value.error : undefined;
    if (!response.ok || remoteError) {
      const message =
        (value && typeof value === "object" && typeof value.message === "string" && value.message) ||
        `HTTP ${response.status}`;
      throw new WebDriverProtocolError(`${operation} failed: ${message}`, {
        operation,
        errorCode: typeof remoteError === "string" ? remoteError : undefined,
        httpStatus: response.status,
        remoteStacktrace:
          value && typeof value === "object" && typeof value.stacktrace === "string" ? value.stacktrace : undefined
      });
    }
    return payload;
  }

  async status(timeoutMs = 1_000) {
    const payload = await this.request("GET", "/status", undefined, "WebDriver status", timeoutMs);
    return payload.value ?? payload;
  }

  async createSession(capabilities) {
    const payload = await this.request("POST", "/session", { capabilities }, "Create Safari session");
    const sessionId = payload?.value?.sessionId ?? payload?.sessionId;
    if (typeof sessionId !== "string" || !sessionId) {
      throw new WebDriverProtocolError("Create Safari session returned no session id.", {
        operation: "Create Safari session"
      });
    }
    this.sessionId = sessionId;
    return { sessionId, capabilities: payload?.value?.capabilities ?? payload?.value ?? {} };
  }

  sessionPath(suffix) {
    if (!this.sessionId) throw new WebDriverProtocolError("No active WebDriver session.");
    return `/session/${encodeURIComponent(this.sessionId)}${suffix}`;
  }

  async setTimeouts(timeouts) {
    await this.request("POST", this.sessionPath("/timeouts"), timeouts, "Set session timeouts");
  }

  async setWindowRect(rect) {
    const payload = await this.request("POST", this.sessionPath("/window/rect"), rect, "Set window rect");
    return payload.value;
  }

  async getWindowRect() {
    const payload = await this.request("GET", this.sessionPath("/window/rect"), undefined, "Get window rect");
    return payload.value;
  }

  async navigate(url) {
    await this.request("POST", this.sessionPath("/url"), { url }, "Navigate to Water Optics Lab");
  }

  async execute(script, args = []) {
    const payload = await this.request(
      "POST",
      this.sessionPath("/execute/sync"),
      { script, args },
      "Execute page script"
    );
    return payload.value;
  }

  async executeAsync(script, args = []) {
    const payload = await this.request(
      "POST",
      this.sessionPath("/execute/async"),
      { script, args },
      "Execute async page script"
    );
    return payload.value;
  }

  async screenshot() {
    const payload = await this.request("GET", this.sessionPath("/screenshot"), undefined, "Capture screenshot");
    if (typeof payload.value !== "string" || !payload.value) {
      throw new WebDriverProtocolError("Capture screenshot returned no PNG bytes.");
    }
    return payload.value;
  }

  async deleteSession() {
    if (!this.sessionId) return;
    const path = this.sessionPath("");
    this.sessionId = undefined;
    await this.request("DELETE", path, undefined, "Delete Safari session", 10_000);
  }
}

function appendLimited(chunks, chunk) {
  const currentLength = chunks.reduce((total, value) => total + value.length, 0);
  if (currentLength >= 16_384) return;
  chunks.push(String(chunk).slice(0, 16_384 - currentLength));
}

async function waitForDriver(client, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await client.status(750);
      return;
    } catch (error) {
      lastError = error;
      if (child?.exitCode !== null) break;
      await sleep(150);
    }
  }
  throw lastError ?? new WebDriverProtocolError("WebDriver did not become ready.");
}

async function stopManagedDriver(handle) {
  if (!handle?.child || handle.child.exitCode !== null) return;
  handle.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => handle.child.once("exit", resolveExit)),
    sleep(2_000).then(() => {
      if (handle.child.exitCode === null) handle.child.kill("SIGKILL");
    })
  ]);
}

async function ensureDriver(config, report) {
  const client = new W3CWebDriverClient(config.driverUrl, { timeoutMs: config.commandTimeoutMs });
  try {
    await client.status(750);
    report.driver = { endpoint: publicUrl(config.driverUrl.href), managed: false, status: "existing" };
    return { client, child: undefined, stdout: [], stderr: [] };
  } catch (initialError) {
    if (!config.autostartDriver) {
      throw new EnvironmentBlockedError(
        `WebDriver endpoint ${publicUrl(config.driverUrl.href)} is unavailable and autostart is disabled.`,
        "webdriver-unavailable"
      );
    }
    await access(config.driverExecutable, fsConstants.X_OK).catch(() => {
      throw new EnvironmentBlockedError(
        `Safari WebDriver executable is unavailable: ${config.driverExecutable}.`,
        "safaridriver-missing"
      );
    });
    const port = Number.parseInt(config.driverUrl.port || (config.driverUrl.protocol === "https:" ? "443" : "80"), 10);
    const args = ["--port", String(port)];
    assert(!args.includes("--enable"), "The device runner must never mutate Safari Remote Automation settings.");
    const child = spawn(config.driverExecutable, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => appendLimited(stdout, chunk));
    child.stderr.on("data", (chunk) => appendLimited(stderr, chunk));
    const handle = { client, child, stdout, stderr };
    try {
      await waitForDriver(client, config.startupTimeoutMs, child);
    } catch (error) {
      await stopManagedDriver(handle);
      const detail = [...stderr, ...stdout].join("").trim();
      throw new EnvironmentBlockedError(
        `safaridriver did not become ready${detail ? `: ${detail}` : `: ${error.message}`}`,
        "safaridriver-startup-failed"
      );
    }
    report.driver = {
      endpoint: publicUrl(config.driverUrl.href),
      executable: config.driverExecutable,
      arguments: args,
      managed: true,
      status: "started"
    };
    return handle;
  }
}

function targetUrl(baseUrl, tier, preset = "cross-body-optics") {
  const url = new URL(baseUrl.href);
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

const READ_METRICS_SCRIPT = "return window.waterPcgOptics ? structuredClone(window.waterPcgOptics.metrics) : null;";
const INVOKE_SCRIPT = `
  const api = window.waterPcgOptics;
  if (!api) throw new Error("window.waterPcgOptics is unavailable.");
  const method = arguments[0];
  const values = arguments[1];
  const candidate = api[method];
  if (typeof candidate !== "function") throw new Error("waterPcgOptics." + method + " is unavailable.");
  return candidate.apply(api, values);
`;
const INVOKE_ASYNC_SCRIPT = `
  const done = arguments[arguments.length - 1];
  const api = window.waterPcgOptics;
  if (!api) { done({ ok: false, error: "window.waterPcgOptics is unavailable." }); return; }
  const method = arguments[0];
  const values = arguments[1];
  const candidate = api[method];
  if (typeof candidate !== "function") { done({ ok: false, error: "waterPcgOptics." + method + " is unavailable." }); return; }
  Promise.resolve(candidate.apply(api, values)).then(
    (value) => done({ ok: true, value }),
    (error) => done({ ok: false, error: error && (error.stack || error.message) ? (error.stack || error.message) : String(error) })
  );
`;
const WAIT_FRAMES_SCRIPT = `
  const done = arguments[arguments.length - 1];
  let remaining = Math.max(1, Number(arguments[0]) || 1);
  const next = () => {
    remaining--;
    if (remaining <= 0) done(true);
    else requestAnimationFrame(next);
  };
  requestAnimationFrame(next);
`;

async function readMetrics(client) {
  return client.execute(READ_METRICS_SCRIPT);
}

async function waitForMetrics(client, predicate, label, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await readMetrics(client);
    if (latest && predicate(latest)) return latest;
    await sleep(150);
  }
  throw new AcceptanceError(`${label} timed out. Last metrics: ${JSON.stringify(latest)}`);
}

async function invoke(client, method, ...args) {
  return client.execute(INVOKE_SCRIPT, [method, args]);
}

async function invokeAsync(client, method, ...args) {
  const result = await client.executeAsync(INVOKE_ASYNC_SCRIPT, [method, args]);
  if (!result?.ok) throw new AcceptanceError(result?.error ?? `${method} failed without an error.`);
  return result.value;
}

async function waitFrames(client, count) {
  await client.executeAsync(WAIT_FRAMES_SCRIPT, [count]);
}

async function captureScreenshot(client, outputDirectory, tier, name) {
  const tierDirectory = resolve(outputDirectory, tier);
  await mkdir(tierDirectory, { recursive: true });
  const outputPath = resolve(tierDirectory, `${name}.png`);
  const png = Buffer.from(await client.screenshot(), "base64");
  assert(png.length > 8 && png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")), `${name}: invalid PNG.`);
  await writeFile(outputPath, png);
  return Object.freeze({ path: outputPath, sha256: sha256(png), byteLength: png.length });
}

function collectNonFinite(value, path = "metrics") {
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => collectNonFinite(child, `${path}.${key}`));
}

function assertSharedP1Invariants(snapshot, tier, label) {
  assert(snapshot?.ready === true, `${label}: Lab is not ready.`);
  assert(snapshot.runtimeError === "", `${label}: runtime error ${snapshot.runtimeError}.`);
  assert(collectNonFinite(snapshot).length === 0, `${label}: metrics contain non-finite values.`);
  assert(snapshot.requestedTier === tier, `${label}: requested tier is ${snapshot.requestedTier}.`);
  assert(snapshot.resolvedTier === tier, `${label}: resolved tier is ${snapshot.resolvedTier}.`);
  assert(snapshot.p1.validationScope === "evidence-gated", `${label}: validation scope is not evidence-gated.`);
  assert(snapshot.p1.active === true, `${label}: P1 matrix is inactive.`);
  assert(snapshot.p1.materialConsumerCount === 3, `${label}: expected three material consumers.`);
  assert(snapshot.p1.sharedOpticalProfileReference === true, `${label}: profile reference is not shared.`);
  assert(snapshot.p1.sharedBindingInstance === true, `${label}: binding instance is not shared.`);
  assert(snapshot.p1.cameraDepthCopyPassCount <= 1, `${label}: more than one depth copy pass.`);
  assert(snapshot.p1.cameraOpaqueCopyPassCount <= 1, `${label}: more than one opaque copy pass.`);
  assert(snapshot.p1.planarCameraCount <= 1, `${label}: more than one Planar camera.`);
  assert(snapshot.p1.liveRenderTargetCount <= 1, `${label}: more than one Planar RT.`);
  assert(
    snapshot.p1.cameraFeatureConsumerIds.length === snapshot.p1.simultaneousVisibleMaterialConsumerCount,
    `${label}: Camera feature requests do not match visible materials.`
  );
  assert(
    snapshot.p1.reflectionCameraCreateCount - snapshot.p1.reflectionCameraDestroyCount ===
      snapshot.p1.planarCameraCount,
    `${label}: Planar camera lifecycle is imbalanced.`
  );
  assert(
    snapshot.p1.renderTargetCreateCount - snapshot.p1.renderTargetDestroyCount === snapshot.p1.liveRenderTargetCount,
    `${label}: Planar RT lifecycle is imbalanced.`
  );
}

function assertCrossBody(snapshot, tier, label) {
  assertSharedP1Invariants(snapshot, tier, label);
  assert(snapshot.p1.mode === "cross-body", `${label}: mode is ${snapshot.p1.mode}.`);
  assert(snapshot.p1.simultaneousVisibleMaterialConsumerCount === 3, `${label}: three bodies are not visible.`);
  assert(snapshot.p1.activeReflectionConsumerCount === 3, `${label}: expected three reflection requests.`);
  assert(snapshot.p1.eligiblePlanarRequestCount === 2, `${label}: expected two eligible Planar requests.`);
  assert(snapshot.p1.selectedPlanarOwnerId === "water-optics-lab", `${label}: Pool is not selected.`);
  assert(snapshot.p1.renderedPlanarOwnerId === "water-optics-lab", `${label}: Pool is not rendered.`);
  for (const name of ["pool", "river", "ocean"]) {
    const body = snapshot.p1.bodyReadbacks[name];
    assert(body.requestedTier === tier && body.resolvedTier === tier, `${label}: ${name} tier mismatch.`);
    assert(body.refractionEnabled === true, `${label}: ${name} refraction is disabled.`);
  }
  const river = snapshot.p1.bodyReadbacks.river;
  assert(river.requestedSource === "planar", `${label}: River did not request Planar.`);
  assert(river.effectiveSource !== "planar", `${label}: River illegally resolved Planar.`);
  assert(river.fallbackReason === "planar-ineligible", `${label}: River fallback is ${river.fallbackReason}.`);
}

async function collectRuntimeEnvironment(client) {
  return client.execute(`
    const canvas = document.querySelector("canvas#canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Water Optics canvas is unavailable.");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) throw new Error("Water Optics WebGL context is unavailable.");
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const read = (parameter) => String(gl.getParameter(parameter) ?? "");
    const rect = canvas.getBoundingClientRect();
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      graphicsApi: typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext ? "webgl2" : "webgl1",
      webgl: {
        vendor: read(gl.VENDOR),
        renderer: read(gl.RENDERER),
        version: read(gl.VERSION),
        unmaskedVendor: debugInfo ? read(debugInfo.UNMASKED_VENDOR_WEBGL) : "extension-unavailable",
        unmaskedRenderer: debugInfo ? read(debugInfo.UNMASKED_RENDERER_WEBGL) : "extension-unavailable",
        samples: gl.getParameter(gl.SAMPLES)
      },
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height
      },
      canvas: { bufferWidth: canvas.width, bufferHeight: canvas.height, cssWidth: rect.width, cssHeight: rect.height }
    };
  `);
}

function assertRuntimeEnvironment(environment, target, label) {
  assert(environment.graphicsApi === "webgl2", `${label}: WebGL2 is required, got ${environment.graphicsApi}.`);
  assert(environment.viewport.innerWidth > 0 && environment.viewport.innerHeight > 0, `${label}: invalid viewport.`);
  assert(environment.viewport.devicePixelRatio > 0, `${label}: invalid DPR.`);
  assert(environment.canvas.bufferWidth > 0 && environment.canvas.bufferHeight > 0, `${label}: invalid canvas size.`);
  assert(/Safari\//.test(environment.userAgent), `${label}: user agent is not Safari.`);
  if (target.kind === "macos")
    assert(!/(?:iPhone|iPad|iPod)/.test(environment.userAgent), `${label}: expected macOS Safari.`);
  else assert(/(?:iPhone|iPad|iPod)/.test(environment.userAgent), `${label}: expected iOS Safari.`);
}

async function collectPageDiagnostics(client) {
  return client.execute(`
    const diagnostics = Array.isArray(window.waterPcgOpticsDiagnostics)
      ? window.waterPcgOpticsDiagnostics.map((entry) => ({ ...entry }))
      : [];
    const failedResources = performance.getEntriesByType("resource")
      .filter((entry) => typeof entry.responseStatus === "number" && entry.responseStatus >= 400)
      .map((entry) => ({ name: entry.name, responseStatus: entry.responseStatus }));
    return {
      diagnostics,
      failedResources,
      runtimeError: window.waterPcgOptics?.metrics.runtimeError ?? "",
      documentReadyState: document.readyState
    };
  `);
}

function assertPageDiagnostics(diagnostics, label, warnings) {
  assert(diagnostics.runtimeError === "", `${label}: runtime error ${diagnostics.runtimeError}.`);
  assert(diagnostics.failedResources.length === 0, `${label}: failed HTTP resources detected.`);
  const fatal = [];
  for (const entry of diagnostics.diagnostics) {
    if (entry.kind === "console-warning") {
      if (/GPU stall due to ReadPixels/i.test(entry.message)) continue;
      warnings.push(`${label}: ${entry.message}`);
      if (WEBGL_FAILURE_PATTERN.test(entry.message)) fatal.push(entry);
    } else {
      fatal.push(entry);
    }
  }
  assert(fatal.length === 0, `${label}: page diagnostics contain ${fatal.length} fatal entries.`);
}

async function verifyReflectionTransitions(client, tierResult, tier) {
  await invoke(client, "setRefractionEnabled", false);
  await waitFrames(client, 4);
  const refractionOff = await readMetrics(client);
  assert(refractionOff.refractionEnabled === false, `${tier}: refraction OFF did not apply.`);
  for (const name of ["pool", "river", "ocean"]) {
    assert(refractionOff.p1.bodyReadbacks[name].refractionEnabled === false, `${tier}: ${name} retained refraction.`);
  }
  tierResult.screenshots.refractionOff = await captureScreenshot(
    client,
    tierResult.outputDirectory,
    tier,
    "cross-body-refraction-off"
  );
  await invoke(client, "setRefractionEnabled", true);
  await waitFrames(client, 4);

  for (const source of ["sky", "probe", "planar"]) {
    await invoke(client, "setReflectionSource", source);
    const transitioned = await waitForMetrics(
      client,
      (snapshot) => {
        const bodies = [
          snapshot.p1.bodyReadbacks.pool,
          snapshot.p1.bodyReadbacks.river,
          snapshot.p1.bodyReadbacks.ocean
        ];
        if (snapshot.reflectionSource !== source) return false;
        if (source === "planar") {
          return (
            snapshot.p1.renderedPlanarOwnerId === "water-optics-lab" &&
            bodies[0].effectiveSource === "planar" &&
            bodies[1].fallbackReason === "planar-ineligible" &&
            bodies[2].effectiveSource === "planar"
          );
        }
        return (
          snapshot.p1.planarCameraCount === 0 &&
          snapshot.p1.liveRenderTargetCount === 0 &&
          bodies.every((body) => body.requestedSource === source && body.effectiveSource === source)
        );
      },
      `${tier}: ${source} transition`
    );
    tierResult.reflectionTransitions[source] = {
      selectedPlanarOwnerId: transitioned.p1.selectedPlanarOwnerId ?? null,
      renderedPlanarOwnerId: transitioned.p1.renderedPlanarOwnerId ?? null,
      planarCameraCount: transitioned.p1.planarCameraCount,
      liveRenderTargetCount: transitioned.p1.liveRenderTargetCount,
      bodyReadbacks: transitioned.p1.bodyReadbacks
    };
    tierResult.screenshots[`reflection-${source}`] = await captureScreenshot(
      client,
      tierResult.outputDirectory,
      tier,
      `cross-body-reflection-${source}`
    );
  }
}

async function verifyExperimentalFallback(client, tier) {
  await invokeAsync(client, "setTier", "experimental");
  const experimental = await waitForMetrics(
    client,
    (snapshot) => snapshot.ready && snapshot.requestedTier === "experimental" && snapshot.resolvedTier === "high",
    `${tier}: Experimental fallback`
  );
  assert(experimental.fallbackReason === EXPERIMENTAL_FALLBACK_REASON, `${tier}: unexpected fallback reason.`);
  assert(experimental.p1.experimentalRequested === true, `${tier}: Experimental request flag is false.`);
  assert(experimental.p1.experimentalResolvedHigh === true, `${tier}: Experimental did not resolve High.`);
  assert(
    experimental.p1.experimentalAdditionalRenderTargetCount === 0,
    `${tier}: Experimental created an additional target class.`
  );
  await invokeAsync(client, "setTier", tier);
  await waitForMetrics(
    client,
    (snapshot) => snapshot.ready && snapshot.requestedTier === tier && snapshot.resolvedTier === tier,
    `${tier}: restore tier`
  );
  return {
    requestedTier: experimental.requestedTier,
    resolvedTier: experimental.resolvedTier,
    fallbackReason: experimental.fallbackReason,
    additionalRenderTargetCount: experimental.p1.experimentalAdditionalRenderTargetCount
  };
}

async function verifyArbitration(client, tierResult, tier) {
  await invokeAsync(client, "setPreset", "multi-water-arbitration");
  const initial = await waitForMetrics(
    client,
    (snapshot) =>
      snapshot.ready &&
      snapshot.p1.mode === "dual-pool" &&
      snapshot.p1.secondaryPoolRuntimeLiveCount === 1 &&
      snapshot.p1.renderedPlanarOwnerId === "water-optics-lab",
    `${tier}: dual-pool activation`
  );
  assertSharedP1Invariants(initial, tier, `${tier}: dual initial`);
  assert(initial.p1.riverVisible === true, `${tier}: River is not visible in dual mode.`);
  assert(initial.p1.secondaryPoolVisible === true, `${tier}: secondary Pool is not visible.`);
  assert(
    initial.p1.consumerPlaneYs.pool !== initial.p1.consumerPlaneYs.secondaryPool,
    `${tier}: Pools share one plane.`
  );
  tierResult.screenshots.dualOwnerInitial = await captureScreenshot(
    client,
    tierResult.outputDirectory,
    tier,
    "dual-owner-initial"
  );

  const stable = await client.executeAsync(`
    const done = arguments[arguments.length - 1];
    let frames = 0;
    let mismatchFrames = 0;
    let maximumPlanarCameraCount = 0;
    let maximumLiveRenderTargetCount = 0;
    const next = () => {
      const p1 = window.waterPcgOptics?.metrics.p1;
      frames++;
      if (!p1 || p1.selectedPlanarOwnerId !== "water-optics-lab" || p1.renderedPlanarOwnerId !== "water-optics-lab") mismatchFrames++;
      maximumPlanarCameraCount = Math.max(maximumPlanarCameraCount, p1?.planarCameraCount ?? 99);
      maximumLiveRenderTargetCount = Math.max(maximumLiveRenderTargetCount, p1?.liveRenderTargetCount ?? 99);
      if (frames >= 300) done({ frames, mismatchFrames, maximumPlanarCameraCount, maximumLiveRenderTargetCount });
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  `);
  assert(stable.frames === 300 && stable.mismatchFrames === 0, `${tier}: stable owner changed.`);
  assert(stable.maximumPlanarCameraCount <= 1, `${tier}: stable owner created multiple Planar cameras.`);
  assert(stable.maximumLiveRenderTargetCount <= 1, `${tier}: stable owner created multiple Planar RTs.`);

  await invoke(client, "setP1PlanarConsumerVisible", "pool", false);
  const handoff = await client.executeAsync(`
    const done = arguments[arguments.length - 1];
    const expected = "water-optics-p1-dual-pool";
    const samples = [];
    const next = () => {
      const p1 = structuredClone(window.waterPcgOptics?.metrics.p1);
      samples.push(p1);
      if (p1?.renderedPlanarOwnerId === expected || samples.length >= 6) done({ samples, handoffFrame: p1?.renderedPlanarOwnerId === expected ? samples.length : null });
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  `);
  assert(handoff.handoffFrame !== null && handoff.handoffFrame <= 6, `${tier}: handoff exceeded six frames.`);
  const final = handoff.samples.at(-1);
  assert(final.selectedPlanarOwnerId === "water-optics-p1-dual-pool", `${tier}: secondary Pool was not selected.`);
  assert(final.renderedPlanarOwnerId === "water-optics-p1-dual-pool", `${tier}: secondary Pool was not rendered.`);
  assert(
    final.planarCameraCount === 1 && final.liveRenderTargetCount === 1,
    `${tier}: handoff resource counts changed.`
  );
  tierResult.screenshots.dualOwnerHandoff = await captureScreenshot(
    client,
    tierResult.outputDirectory,
    tier,
    "dual-owner-handoff"
  );
  await invoke(client, "resetP1PlanarConsumers");
  await invokeAsync(client, "setPreset", "cross-body-optics");
  await waitForMetrics(
    client,
    (snapshot) =>
      snapshot.ready &&
      snapshot.p1.mode === "cross-body" &&
      snapshot.p1.secondaryPoolRuntimeLiveCount === 0 &&
      snapshot.p1.renderedPlanarOwnerId === "water-optics-lab",
    `${tier}: arbitration cleanup`
  );
  return {
    stable,
    handoffFrame: handoff.handoffFrame,
    handoffSamples: handoff.samples,
    secondaryPoolRuntimeBefore: {
      createCount: initial.p1.secondaryPoolRuntimeCreateCount,
      destroyCount: initial.p1.secondaryPoolRuntimeDestroyCount,
      liveCount: initial.p1.secondaryPoolRuntimeLiveCount
    }
  };
}

async function runTier(driverHandle, config, tier) {
  const client = driverHandle.client;
  const tierResult = {
    tier,
    status: "running",
    outputDirectory: config.outputDirectory,
    blockers: [],
    incompleteReasons: [],
    failures: [],
    warnings: [],
    screenshots: {},
    reflectionTransitions: {}
  };
  let sessionCreated = false;
  try {
    const session = await client.createSession(createRequestedCapabilities(config.target));
    sessionCreated = true;
    tierResult.session = { idSha256: sha256(session.sessionId), capabilities: session.capabilities };
    await client.setTimeouts({ implicit: 0, pageLoad: config.commandTimeoutMs, script: config.commandTimeoutMs });
    try {
      await client.setWindowRect({ width: config.viewport.width, height: config.viewport.height });
    } catch (error) {
      tierResult.warnings.push(`Requested window rect was not applied: ${error.message}`);
    }
    tierResult.windowRect = await client.getWindowRect().catch((error) => ({ unavailable: error.message }));
    await client.navigate(targetUrl(config.appUrl, tier));
    await waitForMetrics(
      client,
      (snapshot) => snapshot.ready && snapshot.p1.active && snapshot.p1.renderedPlanarOwnerId === "water-optics-lab",
      `${tier}: initial readiness`,
      config.commandTimeoutMs
    );
    await invoke(client, "setPlanarFilterEnabled", false);
    await waitFrames(client, 4);
    const initial = await readMetrics(client);
    tierResult.runtimeEnvironment = await collectRuntimeEnvironment(client);
    assertRuntimeEnvironment(tierResult.runtimeEnvironment, config.target, `${tier}: environment`);
    assertCrossBody(initial, tier, `${tier}: initial`);
    assert(initial.statsEnabled === false && initial.statsPanelVisible === false, `${tier}: Stats must be disabled.`);
    assert(Math.abs(initial.surfaceTime - FIXED_SURFACE_TIME) < 1e-9, `${tier}: surface time is not frozen.`);
    tierResult.actualViewport = Object.freeze({
      width: tierResult.runtimeEnvironment.viewport.innerWidth,
      height: tierResult.runtimeEnvironment.viewport.innerHeight,
      devicePixelRatio: tierResult.runtimeEnvironment.viewport.devicePixelRatio,
      canvasBufferWidth: tierResult.runtimeEnvironment.canvas.bufferWidth,
      canvasBufferHeight: tierResult.runtimeEnvironment.canvas.bufferHeight
    });
    tierResult.initial = initial.p1;
    tierResult.screenshots.crossBody = await captureScreenshot(
      client,
      config.outputDirectory,
      tier,
      "cross-body-final"
    );
    await verifyReflectionTransitions(client, tierResult, tier);
    const restored = await readMetrics(client);
    assertCrossBody(restored, tier, `${tier}: reflection restored`);
    tierResult.lifecycle = await invokeAsync(client, "runP1LifecycleStress", config.lifecycleIterations);
    assert(tierResult.lifecycle.balanced === true, `${tier}: lifecycle stress grew resources.`);
    assert(tierResult.lifecycle.runtimeError === "", `${tier}: lifecycle stress reported a runtime error.`);
    tierResult.experimentalFallback = await verifyExperimentalFallback(client, tier);
    tierResult.arbitration = await verifyArbitration(client, tierResult, tier);
    const final = await readMetrics(client);
    assertCrossBody(final, tier, `${tier}: final restored`);
    assert(
      final.p1.secondaryPoolRuntimeCreateCount === final.p1.secondaryPoolRuntimeDestroyCount &&
        final.p1.secondaryPoolRuntimeLiveCount === 0,
      `${tier}: secondary Pool runtime leaked.`
    );
    tierResult.final = final.p1;
    tierResult.pageDiagnostics = await collectPageDiagnostics(client);
    assertPageDiagnostics(tierResult.pageDiagnostics, tier, tierResult.warnings);
    tierResult.status = "passed";
  } catch (error) {
    const classification = classifyRunError(error, {
      sessionCreated,
      evidenceProduced: Object.keys(tierResult.screenshots).length > 0
    });
    tierResult.status = classification.status;
    const target =
      classification.status === "blocked"
        ? tierResult.blockers
        : classification.status === "incomplete"
          ? tierResult.incompleteReasons
          : tierResult.failures;
    target.push({
      reason: classification.reason,
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    if (sessionCreated) {
      try {
        await client.deleteSession();
      } catch (error) {
        tierResult.warnings.push(`Safari session cleanup failed: ${error.message}`);
        if (tierResult.status === "passed") {
          tierResult.status = "incomplete";
          tierResult.incompleteReasons.push({ reason: "session-cleanup-failed", message: error.message });
        }
      }
    }
  }
  delete tierResult.outputDirectory;
  return tierResult;
}

export function classifyRunError(error, context = {}) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof EnvironmentBlockedError) return { status: "blocked", reason: error.reason };
  if (!context.sessionCreated || ENVIRONMENT_BLOCK_PATTERN.test(message)) {
    return { status: context.evidenceProduced ? "incomplete" : "blocked", reason: "platform-environment-blocked" };
  }
  if (error instanceof AcceptanceError) return { status: "failed", reason: "acceptance-failed" };
  if (error instanceof WebDriverProtocolError && context.evidenceProduced) {
    return { status: "incomplete", reason: "webdriver-disconnected-after-evidence" };
  }
  return { status: "failed", reason: "runner-failed" };
}

export function deriveOverallStatus(tierResults, blockers = []) {
  if (tierResults.some((tier) => tier.status === "failed")) return "failed";
  if (tierResults.length === TIERS.length && tierResults.every((tier) => tier.status === "passed")) return "passed";
  if (tierResults.some((tier) => tier.status === "passed" || tier.status === "incomplete")) return "incomplete";
  if (blockers.length > 0 || tierResults.some((tier) => tier.status === "blocked")) return "blocked";
  return "incomplete";
}

export function exitCodeForStatus(status) {
  return status === "passed" ? 0 : status === "failed" ? 1 : 2;
}

export function redactForReport(value, secrets) {
  if (typeof value === "string") {
    return secrets.reduce(
      (text, secret) => (secret ? text.replaceAll(secret, `[sha256:${sha256(secret)}]`) : text),
      value
    );
  }
  if (Array.isArray(value)) return value.map((child) => redactForReport(child, secrets));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (!/sha256$/i.test(key) && /udid|serial/i.test(key) && typeof child === "string" && child)
        return [`${key}Sha256`, sha256(child)];
      return [key, redactForReport(child, secrets)];
    })
  );
}

async function writeReport(report, config, secrets = []) {
  await mkdir(config.outputDirectory, { recursive: true });
  const sanitized = redactForReport(report, secrets);
  const temporaryPath = `${config.reportPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(sanitized, null, 2)}\n`);
  await rename(temporaryPath, config.reportPath);
}

export async function runAcceptance(environment = process.env) {
  const startedAt = new Date();
  let config;
  try {
    config = createConfiguration(environment, startedAt);
  } catch (error) {
    const fallbackEnvironment = {
      WATER_OPTICS_SAFARI_TARGET: "macos",
      WATER_OPTICS_SAFARI_OUTPUT_DIR: environment.WATER_OPTICS_SAFARI_OUTPUT_DIR
    };
    config = createConfiguration(fallbackEnvironment, startedAt);
    const classification = classifyRunError(error);
    const report = {
      schemaVersion: 1,
      gate: "water-optics-p1-safari-device-acceptance",
      status: classification.status,
      exitCode: exitCodeForStatus(classification.status),
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      outputDirectory: config.outputDirectory,
      target: { requestedKind: environment.WATER_OPTICS_SAFARI_TARGET ?? "macos" },
      tiers: [],
      blockers: [{ reason: classification.reason, message: error.message }],
      failures: [],
      warnings: [],
      reportPath: config.reportPath
    };
    await writeReport(report, config, [environment.WATER_OPTICS_SAFARI_DEVICE_UDID ?? ""]);
    return report;
  }

  const report = {
    schemaVersion: 1,
    gate: "water-optics-p1-safari-device-acceptance",
    status: "running",
    exitCode: 2,
    startedAt: startedAt.toISOString(),
    completedAt: undefined,
    outputDirectory: config.outputDirectory,
    app: { url: publicUrl(config.appUrl.href), fixedSurfaceTime: FIXED_SURFACE_TIME, statsEnabled: false },
    target: createPublicTarget(config.target),
    requestedViewport: config.viewport,
    lifecycleIterations: config.lifecycleIterations,
    driver: { endpoint: publicUrl(config.driverUrl.href), managed: false, status: "unresolved" },
    tiers: [],
    blockers: [],
    failures: [],
    warnings: [],
    claimBoundary: {
      gpuPerformance: "incomplete-unless-separately-timer-gated",
      canonicalGolden: "not-applicable-device-semantic-lane",
      stats: "display-only-disabled-for-capture"
    },
    reportPath: config.reportPath
  };
  let driverHandle;
  try {
    driverHandle = await ensureDriver(config, report);
    for (const tier of TIERS) {
      const tierResult = await runTier(driverHandle, config, tier);
      report.tiers.push(tierResult);
      if (tierResult.status === "blocked") {
        report.blockers.push(...tierResult.blockers.map((entry) => ({ tier, ...entry })));
      } else if (tierResult.status === "failed") {
        report.failures.push(...tierResult.failures.map((entry) => ({ tier, ...entry })));
      }
      if (tierResult.status === "blocked") break;
    }
  } catch (error) {
    const classification = classifyRunError(error);
    const target = classification.status === "blocked" ? report.blockers : report.failures;
    target.push({ reason: classification.reason, message: error instanceof Error ? error.message : String(error) });
  } finally {
    if (driverHandle?.child) {
      report.driver.stdout = driverHandle.stdout.join("").trim();
      report.driver.stderr = driverHandle.stderr.join("").trim();
      await stopManagedDriver(driverHandle);
    }
    report.status = deriveOverallStatus(report.tiers, report.blockers);
    report.exitCode = exitCodeForStatus(report.status);
    report.completedAt = new Date().toISOString();
    await writeReport(report, config, [config.target.udid]);
  }
  return report;
}

async function main() {
  const report = await runAcceptance(process.env);
  process.stdout.write(
    `${JSON.stringify({ status: report.status, exitCode: report.exitCode, reportPath: report.reportPath }, null, 2)}\n`
  );
  process.exitCode = report.exitCode;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  });
}
