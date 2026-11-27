import { Shader, ShaderPass, type Camera, type Engine, type Scene } from "@galacean/engine";

/** Global tick timing hook populated only during an active capture window. */
export interface MobileSeedTickHost {
  __mobileSeedTickMark?: (name: string, ms: number) => void;
  __seedWorldPerfCaptures?: MobileFrameCaptureRecord[];
}

export interface PerfCumulativeCounters {
  /** Native direct RHI submissions. GL-only counters are unavailable (NaN) in this scope. */
  drawScope?: "webgpu-direct";
  indexedStrips?: number;
  frames: number;
  cpuMs: number;
  dc: number;
  tris: number;
  /** Draw-target FBO transitions (FRAMEBUFFER / DRAW_FRAMEBUFFER changes only). */
  fbo: number;
  /** Total raw gl.bindFramebuffer calls (including READ_FRAMEBUFFER and redundant binds). */
  fboAll: number;
  /** Actual CPU->GPU buffer uploads (gl.bufferSubData + gl.bufferData with BufferSource). */
  bufUploads: number;
  bufUploadBytes: number;
  /** Size-only gl.bufferData(target, byteLength, usage) reallocations / Discard orphans. */
  bufOrphans: number;
  bufOrphanBytes: number;
}

export interface PerfFrameObserver {
  onFrameBegin(startMs: number): void;
  onFrameEnd(cpuMs: number, endMs: number): void;
}

export interface MobileFrameRenderStats {
  readonly drawScope?: "webgpu-direct";
  /** Direct indexed triangle-strip draws omitted from the triangle count because indices are GPU-resident. */
  readonly unmeasuredIndexedStrips?: number;
  readonly fps: number;
  readonly dc: number;
  readonly tris: number;
  readonly fbo: number | null;
  readonly fboAll: number | null;
  readonly bufUploads: number | null;
  readonly bufUploadKB: number | null;
  readonly bufOrphans: number | null;
  readonly bufOrphanKB: number | null;
}

export interface MobileFrameCameraMotion {
  readonly startPos: readonly [number, number, number];
  readonly endPos: readonly [number, number, number];
  readonly totalDistanceM: number;
  readonly totalYawDeg: number;
  readonly totalPitchDeg: number;
  readonly maxFrameDistanceM: number;
  readonly maxFrameYawDeg: number;
}

export interface MobileFrameSpikeDetail {
  readonly frameIndex: number;
  readonly offsetMs: number;
  readonly cpuMs: number;
  readonly intervalMs: number;
  readonly moveM: number;
  readonly yawDeg: number;
  readonly dc: number;
  readonly tris: number;
  readonly fbo: number;
  readonly bufUploads: number;
  readonly bufUploadKB: number;
  readonly bufOrphans: number;
  readonly bufOrphanKB: number;
  readonly engineStagesMs: Readonly<Record<string, number>>;
  readonly pipelineStagesMs: Readonly<Record<string, number>>;
  readonly queueByStageMs: Readonly<Record<string, number>>;
  readonly scriptUpdMs: Readonly<Record<string, number>>;
  readonly scriptLateMs: Readonly<Record<string, number>>;
  readonly seedTickMs: Readonly<Record<string, number>>;
}

export interface MobileFrameBenchPhaseStats {
  readonly frames: number;
  readonly windowMs: number;
  readonly fps: number;
  readonly avgCpuMs: number;
  readonly p95CpuMs: number;
  readonly maxCpuMs: number;
  readonly intP50Ms: number;
  readonly intP95Ms: number;
  readonly intMaxMs: number;
  readonly dc: number;
  readonly tris: number;
  readonly bufOrphans: number;
  readonly bldgPumpMaxMs: number;
  readonly drawMaxMs: number;
  readonly shadowMaxMs: number;
  readonly shaderCompiles: number;
}

export interface MobileFrameShaderCompileSpike {
  readonly frameIndex: number;
  readonly offsetMs: number;
  readonly phase?: string;
  readonly shader: string;
  readonly stage: string;
  readonly dtMs: number;
  readonly defer: boolean;
}

export interface MobileFrameCaptureRunOptions {
  /** Called at the start of every captured frame; return an optional phase label for per-phase summary breakdown. */
  readonly onFrame?: (elapsedMs: number, frameIndex: number) => string | undefined;
  /** Called once the capture finishes and its upload attempt settles. */
  readonly onComplete?: (record: MobileFrameCaptureRecord | null, uploaded: boolean) => void;
}

export interface MobileFrameCaptureRecord {
  readonly schemaVersion: 2;
  readonly ts: number;
  readonly seq: number;
  readonly trigger: string;
  readonly partial: boolean;
  readonly url: string;
  readonly ua: string;
  readonly dpr: number;
  readonly canvas: readonly [number, number, number, number];
  readonly disabledModules: readonly string[];
  readonly perfText: string;
  readonly targetFrames: number;
  readonly targetDurationMs?: number;
  readonly capturedFrames: number;
  readonly windowMs: number;
  readonly avgCpuMs: number;
  readonly p95CpuMs: number;
  readonly maxCpuMs: number;
  readonly frameCpuMs: readonly number[];
  readonly frameIntervalsMs: readonly number[];
  readonly cameraMotion?: MobileFrameCameraMotion | null;
  readonly benchPhases?: Readonly<Record<string, MobileFrameBenchPhaseStats>>;
  readonly shaderCompileSpikes?: readonly MobileFrameShaderCompileSpike[];
  readonly spikeFrames?: readonly MobileFrameSpikeDetail[];
  readonly renderStats: MobileFrameRenderStats;
  readonly queueCounts: Readonly<{
    opaque: number;
    alphaTest: number;
    transparent: number;
    batchedOpaque: number;
    batchedAlphaTest: number;
    batchedTransparent: number;
  }>;
  readonly ssrDiag: unknown;
  readonly touchDiag: Readonly<{
    navEnabled: boolean | null;
    navInputEnabled: boolean | null;
    navInputMode: unknown;
    navMoveGesture: boolean | null;
    joystickHit: string | null;
    lookHit: string | null;
  }>;
  /** Per-frame mean ms across `capturedFrames`. */
  readonly engineStagesMs: Readonly<Record<string, number>>;
  /** Per-frame mean ms of top-level BasicRenderPipeline.render() stages (pipelineTotal + non-overlapping children). */
  readonly pipelineStagesMs: Readonly<Record<string, number>>;
  /** Per-frame mean ms of sequential sub-stages inside BasicRenderPipeline._drawRenderPass (Forward queues only). */
  readonly drawPassStagesMs: Readonly<Record<string, number>>;
  /** Per-frame mean ms of RenderQueue.render separated by PipelineStage (ShadowCaster / DepthOnly / SSR / Forward). */
  readonly queueByStageMs: Readonly<Record<string, number>>;
  readonly postPassesMs: Readonly<Record<string, number>>;
  readonly scriptUpdMs: Readonly<Record<string, number>>;
  readonly scriptLateMs: Readonly<Record<string, number>>;
  readonly seedTickMs: Readonly<Record<string, number>>;
}

export interface MobileFrameCaptureController {
  readonly button: HTMLButtonElement;
  readonly exportButton: HTMLButtonElement;
  schedule(trigger: string, delayMs?: number): void;
  captureNow(trigger: string, durationMs?: number, runOptions?: MobileFrameCaptureRunOptions): void;
  exportJsonl(): void;
  dispose(): void;
}

export interface MobileFrameCaptureOptions {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly canvas: HTMLCanvasElement;
  readonly readLiveState: () => Record<string, boolean>;
  /** Exact monotonic GL/engine counters snapshotted at frame 1 start and frame N end. */
  readonly readCumulativeCounters?: (out: PerfCumulativeCounters) => PerfCumulativeCounters;
  /** Engine-frame lifecycle hook owned by SeedWorldPerfPanel (avoids stacking duplicate engine.update wrappers). */
  readonly setFrameObserver?: (observer: PerfFrameObserver | null) => void;
  /** Fallback text reader used only if `readCumulativeCounters` is not provided. */
  readonly readPerfText?: () => string;
  readonly targetFrames?: number;
  /** Optional wall-clock duration (ms) for manual button captures (e.g. 6000 for 6s roam/turn profiling). */
  readonly manualDurationMs?: number;
  readonly captureTimeoutMs?: number;
  readonly autoBootDelayMs?: number | null;
  readonly endpointUrl?: string;
}

type AnyRec = Record<string, any>;
type HookedSlot = { readonly hadOwn: boolean; readonly orig: (...args: unknown[]) => unknown };
type CameraPoseSample = { x: number; y: number; z: number; yawDeg: number; pitchDeg: number };

const DEFAULT_CAPTURE_FRAME_COUNT = 20;
const DEFAULT_CAPTURE_TIMEOUT_MS = 12_000;
const DEFAULT_AUTO_BOOT_DELAY_MS = 2500;
const MAX_RETAINED_CAPTURES = 50;
const MAX_DURATION_CAPTURE_FRAMES = 2400;
const MAX_CPU_SPIKE_FRAMES = 6;
const MAX_INTERVAL_SPIKE_FRAMES = 5;
const MAX_REPORTED_SPIKE_FRAMES = 10;
const MAX_SHADER_COMPILE_SPIKES = 40;

const QUEUE_STAGE_KEYS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Forward: { opaque: "Forward.opaque", alphaTest: "Forward.alphaTest", transparent: "Forward.transparent" },
  ShadowCaster: {
    opaque: "ShadowCaster.opaque",
    alphaTest: "ShadowCaster.alphaTest",
    transparent: "ShadowCaster.transparent"
  },
  DepthOnly: { opaque: "DepthOnly.opaque", alphaTest: "DepthOnly.alphaTest", transparent: "DepthOnly.transparent" },
  SSRReceiver: {
    opaque: "SSRReceiver.opaque",
    alphaTest: "SSRReceiver.alphaTest",
    transparent: "SSRReceiver.transparent"
  },
  SSRContributionDepth: {
    opaque: "SSRContributionDepth.opaque",
    alphaTest: "SSRContributionDepth.alphaTest",
    transparent: "SSRContributionDepth.transparent"
  }
};

const FORWARD_QUEUE_DRAW_KEYS: Readonly<Record<string, string>> = {
  opaque: "opaqueQueue:Forward",
  alphaTest: "alphaTestQueue:Forward",
  transparent: "transparentQueue:Forward"
};

function createZeroCounters(): PerfCumulativeCounters {
  return {
    frames: 0,
    cpuMs: 0,
    dc: 0,
    tris: 0,
    fbo: 0,
    fboAll: 0,
    bufUploads: 0,
    bufUploadBytes: 0,
    bufOrphans: 0,
    bufOrphanBytes: 0
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx]!;
}

function clearMap(map: Record<string, number>): void {
  for (const key in map) {
    delete map[key];
  }
}

function cloneRoundedTop(map: Record<string, number>, limit = 16): Record<string, number> {
  const out: Record<string, number> = {};
  const entries = Object.entries(map)
    .filter(([, v]) => v > 0.005)
    .sort((a, b) => b[1] - a[1]);
  const count = Math.min(limit, entries.length);
  for (let i = 0; i < count; i++) {
    const [k, v] = entries[i]!;
    out[k] = round2(v);
  }
  return out;
}

function normalizeYawDeltaDeg(deltaDeg: number): number {
  let d = (deltaDeg + 180) % 360;
  if (d < 0) d += 360;
  return d - 180;
}

function readCameraPose(camera: Camera): CameraPoseSample | null {
  const transform = (camera as unknown as AnyRec)?.entity?.transform as AnyRec | undefined;
  const pos = transform?.worldPosition as { x?: number; y?: number; z?: number } | undefined;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
    return null;
  }
  const fwd = transform?.worldForward as { x?: number; y?: number; z?: number } | undefined;
  let yawDeg = 0;
  let pitchDeg = 0;
  if (fwd && Number.isFinite(fwd.x) && Number.isFinite(fwd.y) && Number.isFinite(fwd.z)) {
    yawDeg = (Math.atan2(fwd.x!, fwd.z!) * 180) / Math.PI;
    pitchDeg = (Math.asin(Math.max(-1, Math.min(1, fwd.y!))) * 180) / Math.PI;
  }
  return { x: pos.x!, y: pos.y!, z: pos.z!, yawDeg, pitchDeg };
}

function formatScriptLabel(script: AnyRec): string {
  const ctorName: string = script?.constructor?.name || "Script";
  const entityName: string | undefined = typeof script?.entity?.name === "string" ? script.entity.name : undefined;
  // Minified preview/production builds shorten class names to 1-3 chars; append entity name for readability.
  return ctorName.length <= 3 && entityName ? `${ctorName}(${entityName})` : ctorName;
}

function formatPostPassLabel(pass: AnyRec, index: number): string {
  const ctor = pass?.constructor as AnyRec | undefined;
  const ctorName: string = (typeof ctor?.name === "string" && ctor.name) || `PostPass#${index}`;
  if (ctorName.length > 3) return ctorName;
  const descriptor: string | undefined =
    (typeof ctor?.UBER_SHADER_NAME === "string" && ctor.UBER_SHADER_NAME) ||
    (typeof pass?._uberMaterial?.shader?.name === "string" && pass._uberMaterial.shader.name) ||
    (typeof pass?._material?.shader?.name === "string" && pass._material.shader.name) ||
    (typeof pass?.name === "string" && pass.name) ||
    undefined;
  return descriptor ? `${ctorName}(${descriptor})` : `${ctorName}#${index}`;
}

function formatElementHit(el: Element | null): string | null {
  if (!el) return null;
  // Use getAttribute("class") so SVG elements don't stringify SVGAnimatedString as "[object SVGAnimatedString]".
  const classAttr = el.getAttribute("class") || "";
  return `${el.tagName}#${el.id}.${classAttr}`;
}

function formatWindowPerfText(
  width: number,
  height: number,
  stats: MobileFrameRenderStats,
  avgCpuMs: number,
  maxCpuMs: number,
  capturedFrames: number
): string {
  const trisK = stats.tris / 1000;
  const header = `PERF | ${capturedFrames}f | ${width}x${height}\n` +
    `${stats.fps.toFixed(1)}fps | cpu=${avgCpuMs.toFixed(1)}ms(max ${maxCpuMs.toFixed(1)}) | `;
  if (stats.drawScope === "webgpu-direct") {
    return header + `RHI dc=${Math.round(stats.dc)} tris=${stats.unmeasuredIndexedStrips ? "≥" : ""}${trisK.toFixed(0)}k`;
  }
  const orphanPart = stats.bufOrphans ? ` orphan=${Math.round(stats.bufOrphans)}(${Math.round(stats.bufOrphanKB!)}KB)` : "";
  return header + `dc=${Math.round(stats.dc)} fbo=${Math.round(stats.fbo!)}(all ${Math.round(stats.fboAll!)}) ` +
    `tris=${trisK.toFixed(0)}k buf=${Math.round(stats.bufUploads!)}(${Math.round(stats.bufUploadKB!)}KB)${orphanPart}`;

}

/**
 * Opt-in engine-frame-driven CPU & pipeline breakdown profiler attached exclusively by
 * `SeedWorldPerfPanel` (`?debug=1&panel=1`).
 *
 * Design invariants:
 * - Captures start and end strictly on `engine.update()` boundaries so CPU timings, frame intervals,
 *   and WebGL draw/FBO/buffer deltas all correspond to the exact same `capturedFrames` window.
 * - Never mutates `Script` instances (instruments `DisorderedArray._forEachWithContext` directly)
 *   and restores singleton engine/pipeline hooks by value assignment between captures (`delete` only
 *   on `dispose()`) to avoid V8/JSC dictionary-mode hidden-class deoptimization during profiling.
 * - Separates `RenderQueue.render` time by `PipelineStage` (`ShadowCaster`, `DepthOnly`, `SSR*`,
 *   `Forward`) and separates top-level pipeline stages from `_drawRenderPass` sub-stages.
 */
export function attachMobileFrameCapture(options: MobileFrameCaptureOptions): MobileFrameCaptureController {
  const {
    engine,
    scene,
    camera,
    canvas,
    readLiveState,
    readCumulativeCounters,
    setFrameObserver,
    readPerfText,
    targetFrames = DEFAULT_CAPTURE_FRAME_COUNT,
    manualDurationMs,
    captureTimeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
    autoBootDelayMs = DEFAULT_AUTO_BOOT_DELAY_MS,
    endpointUrl = "/__mobile-diag"
  } = options;

  const hasManualDuration = typeof manualDurationMs === "number" && Number.isFinite(manualDurationMs) && manualDurationMs > 0;
  const manualSecLabel = hasManualDuration ? `${round1(manualDurationMs! / 1000)}s` : `${targetFrames}f`;

  let disposed = false;
  let capturing = false;
  let captureGen = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  let queuedTrigger: string | null = null;
  let activeRestores: (() => void)[] = [];
  let reportSeq = 0;
  let loggedServerFile = false;

  // Preserve original singleton slots across repeated captures without calling `delete` until `dispose()`.
  const sessionSlots = new Map<AnyRec, Map<string, HookedSlot>>();

  const host = globalThis as unknown as MobileSeedTickHost;
  const captures: MobileFrameCaptureRecord[] = [];
  host.__seedWorldPerfCaptures = captures;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `抓帧上报 (${manualSecLabel})`;
  button.title = hasManualDuration
    ? `连续采样 ${manualSecLabel} 详细 CPU/管线拆解与卡顿尖峰帧并上报到本地 tmp/seed-world-perf-diag.jsonl`
    : `采样 ${targetFrames} 帧详细 CPU/管线拆解并上报到本地 tmp/seed-world-perf-diag.jsonl`;

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "导出";
  exportButton.title = "将本次会话已抓帧记录导出为 .jsonl 文件（适合无本地服务时分享）";
  exportButton.disabled = true;

  const installSingletonHook = (
    obj: AnyRec | null | undefined,
    key: string,
    createWrapped: (orig: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown,
    restores: (() => void)[]
  ): void => {
    if (!obj || typeof obj[key] !== "function") return;
    let objSlots = sessionSlots.get(obj);
    if (!objSlots) {
      objSlots = new Map<string, HookedSlot>();
      sessionSlots.set(obj, objSlots);
    }
    let slot = objSlots.get(key);
    if (!slot) {
      slot = {
        hadOwn: Object.prototype.hasOwnProperty.call(obj, key),
        orig: obj[key] as (...args: unknown[]) => unknown
      };
      objSlots.set(key, slot);
    }
    const currentFn = obj[key] as (...args: unknown[]) => unknown;
    const wrapped = createWrapped(currentFn);
    obj[key] = wrapped;
    restores.push(() => {
      if (obj[key] === wrapped) {
        // Assign back to `currentFn` without `delete` during the active session to preserve hidden classes.
        obj[key] = currentFn;
      }
    });
  };

  const wrapTimed = (
    obj: AnyRec | null | undefined,
    key: string,
    onTiming: (dt: number) => void,
    restores: (() => void)[]
  ): void => {
    installSingletonHook(
      obj,
      key,
      (orig) =>
        function (this: unknown) {
          const t0 = performance.now();
          try {
            // eslint-disable-next-line prefer-rest-params
            return orig.apply(this, arguments as unknown as unknown[]);
          } finally {
            onTiming(performance.now() - t0);
          }
        },
      restores
    );
  };

  const wrapDisorderedScriptLoop = (
    disArr: AnyRec | null | undefined,
    targetMap: Record<string, number>,
    frameTargetMap: Record<string, number>,
    labelCache: WeakMap<object, string>,
    restores: (() => void)[]
  ): void => {
    if (!disArr || typeof disArr._forEachWithContext !== "function") return;
    let currentVisit: ((element: AnyRec, context: unknown) => void) | null = null;
    const timedVisit = (element: AnyRec, context: unknown): void => {
      let label = labelCache.get(element);
      if (label === undefined) {
        label = formatScriptLabel(element);
        labelCache.set(element, label);
      }
      const t0 = performance.now();
      try {
        currentVisit!(element, context);
      } finally {
        const dt = performance.now() - t0;
        targetMap[label] = (targetMap[label] || 0) + dt;
        frameTargetMap[label] = (frameTargetMap[label] || 0) + dt;
      }
    };
    installSingletonHook(
      disArr,
      "_forEachWithContext",
      (orig) =>
        function (
          this: unknown,
          context: unknown,
          visit: unknown,
          swap: unknown
        ) {
          if (typeof visit !== "function") {
            return orig.call(this, context, visit, swap);
          }
          const prevVisit = currentVisit;
          currentVisit = visit as (element: AnyRec, context: unknown) => void;
          try {
            return orig.call(this, context, timedVisit, swap);
          } finally {
            currentVisit = prevVisit;
          }
        },
      restores
    );
  };

  const clearSafetyTimer = (): void => {
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  };

  const restoreActiveHooks = (): void => {
    clearSafetyTimer();
    setFrameObserver?.(null);
    for (let i = activeRestores.length - 1; i >= 0; i--) {
      activeRestores[i]!();
    }
    activeRestores = [];
    capturing = false;
  };

  const exportJsonl = (): void => {
    if (captures.length === 0) return;
    const text = captures.map((record) => JSON.stringify(record)).join("\n") + "\n";
    const blob = new Blob([text], { type: "application/x-ndjson;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `seed-world-perf-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const captureNow = (trigger: string, durationMs?: number, runOptions?: MobileFrameCaptureRunOptions): void => {
    if (disposed) {
      runOptions?.onComplete?.(null, false);
      return;
    }
    if (capturing) {
      // Never silently drop a user/toggle capture while a previous capture is still running on slow devices.
      if (!runOptions) {
        queuedTrigger = trigger;
      } else {
        runOptions.onComplete?.(null, false);
      }
      return;
    }
    capturing = true;
    const gen = ++captureGen;
    const activeDurationMs =
      typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
    const activeSecLabel = activeDurationMs > 0 ? `${round1(activeDurationMs / 1000)}s` : "";
    button.textContent = activeDurationMs > 0 ? `采样中 0.0/${activeSecLabel}...` : `采样中(${trigger})...`;

    const restores: (() => void)[] = [];
    activeRestores = restores;

    const engineStages: Record<string, number> = {};
    const pipelineStages: Record<string, number> = {};
    const drawPassStages: Record<string, number> = {};
    const queueByStage: Record<string, number> = {};
    const postPasses: Record<string, number> = {};
    const scriptUpd: Record<string, number> = {};
    const scriptLate: Record<string, number> = {};
    const seedTick: Record<string, number> = {};

    const frameEngineStages: Record<string, number> = {};
    const framePipelineStages: Record<string, number> = {};
    const frameQueueByStage: Record<string, number> = {};
    const frameScriptUpd: Record<string, number> = {};
    const frameScriptLate: Record<string, number> = {};
    const frameSeedTick: Record<string, number> = {};

    const frameCpuMs: number[] = [];
    const frameIntervalsMs: number[] = [];
    const cpuSpikes: MobileFrameSpikeDetail[] = [];
    const intervalSpikes: MobileFrameSpikeDetail[] = [];
    const shaderCompileSpikes: MobileFrameShaderCompileSpike[] = [];
    const ssrOpaqueReceivers = new Set<string>();
    type PhaseAcc = {
      frames: number;
      firstMs: number;
      lastMs: number;
      cpus: number[];
      intervals: number[];
      dc: number;
      tris: number;
      bufOrphans: number;
      bldgPumpMaxMs: number;
      drawMaxMs: number;
      shadowMaxMs: number;
      shaderCompiles: number;
    };
    const phaseAccs = new Map<string, PhaseAcc>();
    let currentPhaseLabel: string | undefined;
    let frameShaderCompiles = 0;
    const passInfoCache = new WeakMap<object, { shader: string; stage: string }>();
    const resolvePassInfo = (pass: AnyRec): { shader: string; stage: string } => {
      const cached = passInfoCache.get(pass);
      if (cached) return cached;
      const registry = (Shader as unknown as { _shaderMap?: Record<string, AnyRec | AnyRec[]> })._shaderMap;
      if (registry && typeof registry === "object") {
        for (const entry of Object.values(registry)) {
          const list = Array.isArray(entry) ? entry : [entry];
          for (const sh of list) {
            const subs = sh?.subShaders;
            if (!Array.isArray(subs)) continue;
            for (const sub of subs) {
              const passes = sub?.passes;
              if (!Array.isArray(passes)) continue;
              for (const p of passes) {
                if (p && typeof p === "object") {
                  passInfoCache.set(p, {
                    shader: String(sh.name || "unknown"),
                    stage: String(p.getTagValue?.("pipelineStage") ?? "Forward")
                  });
                }
              }
            }
          }
        }
      }
      const found = passInfoCache.get(pass) ?? {
        shader: String(pass?.name || "unknown"),
        stage: String(pass?.getTagValue?.("pipelineStage") ?? "Forward")
      };
      passInfoCache.set(pass, found);
      return found;
    };
    const queueCounts = {
      opaque: 0,
      alphaTest: 0,
      transparent: 0,
      batchedOpaque: 0,
      batchedAlphaTest: 0,
      batchedTransparent: 0
    };
    const startCounters = createZeroCounters();
    const endCounters = createZeroCounters();
    const frameStartCounters = createZeroCounters();
    const scriptLabelCache = new WeakMap<object, string>();

    const add = (map: Record<string, number>, key: string, dt: number) => {
      map[key] = (map[key] || 0) + dt;
    };
    const addDual = (
      totalMap: Record<string, number>,
      frameMap: Record<string, number>,
      key: string,
      dt: number
    ) => {
      totalMap[key] = (totalMap[key] || 0) + dt;
      frameMap[key] = (frameMap[key] || 0) + dt;
    };

    const engAny = engine as unknown as AnyRec;
    const scnAny = scene as unknown as AnyRec;
    const cm = scnAny._componentsManager as AnyRec | undefined;
    const pipe = (camera as unknown as AnyRec)._renderPipeline as AnyRec | undefined;
    const batcherMgr = engAny._batcherManager as AnyRec | undefined;

    let stageHooksInstalled = false;
    const installStageHooks = (): void => {
      if (stageHooksInstalled) return;
      stageHooksInstalled = true;

      host.__mobileSeedTickMark = (name: string, dt: number) => addDual(seedTick, frameSeedTick, name, dt);
      restores.push(() => {
        delete host.__mobileSeedTickMark;
      });

      // Capture-scoped shader compilation spike hook (zero cost when 0 shaders compile).
      const shaderPassProto = (ShaderPass as unknown as { prototype?: AnyRec })?.prototype;
      if (shaderPassProto && typeof shaderPassProto._compileShaderProgram === "function") {
        const origCompile = shaderPassProto._compileShaderProgram as (...args: unknown[]) => unknown;
        const wrappedCompile = function (this: AnyRec) {
          const t0 = performance.now();
          try {
            // eslint-disable-next-line prefer-rest-params
            return origCompile.apply(this, arguments as unknown as unknown[]);
          } finally {
            const dt = performance.now() - t0;
            frameShaderCompiles++;
            const info = resolvePassInfo(this);
            // eslint-disable-next-line prefer-rest-params
            const defer = Boolean(arguments[2]);
            const entry: MobileFrameShaderCompileSpike = {
              frameIndex: frameCpuMs.length,
              offsetMs: round1(Math.max(0, t0 - firstFrameStartMs)),
              ...(currentPhaseLabel ? { phase: currentPhaseLabel } : {}),
              shader: info.shader,
              stage: info.stage,
              dtMs: round2(dt),
              defer
            };
            if (shaderCompileSpikes.length < MAX_SHADER_COMPILE_SPIKES) {
              shaderCompileSpikes.push(entry);
            } else {
              // Keep the slowest compiles if more than MAX_SHADER_COMPILE_SPIKES occur in one window.
              let minIdx = 0;
              for (let i = 1; i < shaderCompileSpikes.length; i++) {
                if (shaderCompileSpikes[i]!.dtMs < shaderCompileSpikes[minIdx]!.dtMs) minIdx = i;
              }
              if (entry.dtMs > shaderCompileSpikes[minIdx]!.dtMs) {
                shaderCompileSpikes[minIdx] = entry;
              }
            }
          }
        };
        shaderPassProto._compileShaderProgram = wrappedCompile;
        restores.push(() => {
          if (shaderPassProto._compileShaderProgram === wrappedCompile) {
            shaderPassProto._compileShaderProgram = origCompile;
          }
        });
      }

      // 1. Engine top-level & Scene hooks (skip inputManager & GL hooks to avoid touch/FBO interference on iOS)
      wrapTimed(engAny, "_render", (dt) => addDual(engineStages, frameEngineStages, "engRenderTotal", dt), restores);
      wrapTimed(scnAny.physics, "_update", (dt) => addDual(engineStages, frameEngineStages, "physics", dt), restores);
      wrapTimed(
        scnAny,
        "_updateRendering",
        (dt) => addDual(engineStages, frameEngineStages, "updateRendering", dt),
        restores
      );

      if (cm) {
        wrapTimed(cm, "callScriptOnStart", (dt) => addDual(engineStages, frameEngineStages, "scriptStart", dt), restores);
        wrapTimed(cm, "callScriptOnUpdate", (dt) => addDual(engineStages, frameEngineStages, "scriptUpd", dt), restores);
        wrapTimed(cm, "callAnimationUpdate", (dt) => addDual(engineStages, frameEngineStages, "animUpdate", dt), restores);
        wrapTimed(
          cm,
          "callScriptOnLateUpdate",
          (dt) => addDual(engineStages, frameEngineStages, "scriptLate", dt),
          restores
        );
        wrapTimed(
          cm,
          "callRendererOnUpdate",
          (dt) => addDual(engineStages, frameEngineStages, "rendererUpdate", dt),
          restores
        );
        wrapTimed(
          cm,
          "callCameraOnBeginRender",
          (dt) => addDual(engineStages, frameEngineStages, "camBeginRender", dt),
          restores
        );
        wrapTimed(
          cm,
          "callCameraOnEndRender",
          (dt) => addDual(engineStages, frameEngineStages, "camEndRender", dt),
          restores
        );
        wrapTimed(cm, "sortOverlayUICanvases", (dt) => addDual(engineStages, frameEngineStages, "uiSort", dt), restores);
        // Instrument DisorderedArray iteration instead of mutating Script instances.
        wrapDisorderedScriptLoop(cm._onUpdateScripts, scriptUpd, frameScriptUpd, scriptLabelCache, restores);
        wrapDisorderedScriptLoop(cm._onLateUpdateScripts, scriptLate, frameScriptLate, scriptLabelCache, restores);
      }

      // 2. BasicRenderPipeline top-level stages vs _drawRenderPass sub-stages
      if (pipe) {
        wrapTimed(pipe, "render", (dt) => addDual(pipelineStages, framePipelineStages, "pipelineTotal", dt), restores);
        wrapTimed(
          pipe._cascadedShadowCasterPass,
          "onRender",
          (dt) => addDual(pipelineStages, framePipelineStages, "shadowPass", dt),
          restores
        );
        wrapTimed(
          pipe,
          "_prepareRender",
          (dt) => addDual(pipelineStages, framePipelineStages, "prepareRender", dt),
          restores
        );
        wrapTimed(
          pipe,
          "_prepareCameraRenderViewCulling",
          (dt) => addDual(pipelineStages, framePipelineStages, "viewCulling", dt),
          restores
        );
        wrapTimed(
          batcherMgr,
          "uploadBuffer",
          (dt) => addDual(pipelineStages, framePipelineStages, "uploadBuffer", dt),
          restores
        );
        wrapTimed(
          pipe,
          "_renderRegisteredPasses",
          (dt) => addDual(pipelineStages, framePipelineStages, "registeredPasses", dt),
          restores
        );
        wrapTimed(
          pipe._depthOnlyPass,
          "onRender",
          (dt) => addDual(pipelineStages, framePipelineStages, "depthOnlyPass", dt),
          restores
        );
        wrapTimed(
          pipe._saoPass,
          "onRender",
          (dt) => addDual(pipelineStages, framePipelineStages, "saoPass", dt),
          restores
        );
        wrapTimed(
          pipe,
          "_drawRenderPass",
          (dt) => addDual(pipelineStages, framePipelineStages, "drawRenderPass", dt),
          restores
        );

        const ssrPass = pipe._ssrPass;
        if (ssrPass) {
          wrapTimed(
            ssrPass,
            "prepare",
            (dt) => {
              addDual(pipelineStages, framePipelineStages, "ssrPrepare", dt);
              if (
                ssrOpaqueReceivers.size < 16 &&
                ssrPass._opaqueReceiverCount > 0 &&
                typeof ssrPass._isReceiverElement === "function" &&
                pipe._cullingResults
              ) {
                const isRecv = ssrPass._isReceiverElement as (el: AnyRec) => boolean;
                for (const q of [pipe._cullingResults.opaqueQueue, pipe._cullingResults.alphaTestQueue]) {
                  const elems = q?.elements as AnyRec[] | undefined;
                  if (!Array.isArray(elems)) continue;
                  for (let i = 0; i < elems.length && ssrOpaqueReceivers.size < 16; i++) {
                    const el = elems[i];
                    if (!el || !isRecv(el)) continue;
                    const entName = el.component?.entity?.name || "?";
                    const parentName = el.component?.entity?.parent?.name || "";
                    const matName = el.material?.name || "?";
                    const shaderName = el.material?.shader?.name || "?";
                    const rough = el.material?.roughness;
                    ssrOpaqueReceivers.add(
                      `${parentName}/${entName}|mat=${matName}|sh=${shaderName}|r=${typeof rough === "number" ? round2(rough) : "?"}`
                    );
                  }
                }
              }
            },
            restores
          );
          wrapTimed(
            ssrPass,
            "renderPreForward",
            (dt) => addDual(pipelineStages, framePipelineStages, "ssrPreForward", dt),
            restores
          );
          wrapTimed(ssrPass, "captureHistory", (dt) => add(drawPassStages, "ssrCaptureHistory", dt), restores);
          wrapTimed(
            ssrPass,
            "releaseFrameTargets",
            (dt) => addDual(pipelineStages, framePipelineStages, "ssrRelease", dt),
            restores
          );
        }

        // Sub-stages strictly inside _drawRenderPass
        wrapTimed(
          pipe._depthOnlyPass,
          "onResolveForwardDepth",
          (dt) => add(drawPassStages, "forwardDepthResolve", dt),
          restores
        );
        wrapTimed(pipe._opaqueTexturePass, "onRender", (dt) => add(drawPassStages, "opaqueTexPass", dt), restores);
        wrapTimed(pipe._finalPass, "onRender", (dt) => add(drawPassStages, "finalPass", dt), restores);
        wrapTimed(scnAny.background?.sky, "_render", (dt) => add(drawPassStages, "skyRender", dt), restores);
        const skyMat = scnAny.background?.sky?.material as AnyRec | undefined;
        if (skyMat) {
          wrapTimed(skyMat, "_prepareSkyRender", (dt) => add(drawPassStages, "skyPrepare", dt), restores);
        }
        wrapTimed(scnAny._maskManager, "clearMask", (dt) => add(drawPassStages, "clearMask", dt), restores);

        const cr = pipe._cullingResults;
        if (cr) {
          wrapTimed(
            cr,
            "sortBatch",
            (dt) => {
              addDual(pipelineStages, framePipelineStages, "sortBatch", dt);
              const opaqueN = cr.opaqueQueue?.elements?.length ?? 0;
              const alphaN = cr.alphaTestQueue?.elements?.length ?? 0;
              const transN = cr.transparentQueue?.elements?.length ?? 0;
              const batchedOpaqueN = cr.opaqueQueue?.batchedElements?.length ?? 0;
              const batchedAlphaN = cr.alphaTestQueue?.batchedElements?.length ?? 0;
              const batchedTransN = cr.transparentQueue?.batchedElements?.length ?? 0;
              if (opaqueN > queueCounts.opaque) queueCounts.opaque = opaqueN;
              if (alphaN > queueCounts.alphaTest) queueCounts.alphaTest = alphaN;
              if (transN > queueCounts.transparent) queueCounts.transparent = transN;
              if (batchedOpaqueN > queueCounts.batchedOpaque) queueCounts.batchedOpaque = batchedOpaqueN;
              if (batchedAlphaN > queueCounts.batchedAlphaTest) queueCounts.batchedAlphaTest = batchedAlphaN;
              if (batchedTransN > queueCounts.batchedTransparent) queueCounts.batchedTransparent = batchedTransN;
            },
            restores
          );

          const wrapQueue = (queueObj: AnyRec | undefined, queueName: "opaque" | "alphaTest" | "transparent") => {
            installSingletonHook(
              queueObj,
              "render",
              (orig) =>
                function (this: unknown) {
                  const stageArg = arguments[1];
                  const stage = typeof stageArg === "string" && stageArg ? stageArg : "Unknown";
                  const t0 = performance.now();
                  try {
                    // eslint-disable-next-line prefer-rest-params
                    return orig.apply(this, arguments as unknown as unknown[]);
                  } finally {
                    const dt = performance.now() - t0;
                    const stageKey = QUEUE_STAGE_KEYS[stage]?.[queueName] ?? `${stage}.${queueName}`;
                    addDual(queueByStage, frameQueueByStage, stageKey, dt);
                    if (stage === "Forward") {
                      add(drawPassStages, FORWARD_QUEUE_DRAW_KEYS[queueName]!, dt);
                    }
                  }
                },
              restores
            );
          };

          wrapQueue(cr.opaqueQueue, "opaque");
          wrapQueue(cr.alphaTestQueue, "alphaTest");
          wrapQueue(cr.transparentQueue, "transparent");
        }
      }

      const ppm = scnAny.postProcessManager as AnyRec | undefined;
      if (ppm) {
        wrapTimed(ppm, "_render", (dt) => add(drawPassStages, "postProcessTotal", dt), restores);
        // Refresh active post-process passes before wrapping so newly toggled passes are never missed.
        const activePasses =
          (typeof engAny._getActivePostProcessPasses === "function"
            ? (engAny._getActivePostProcessPasses() as AnyRec[] | undefined)
            : undefined) ??
          (engAny._postProcessPasses as AnyRec[] | undefined) ??
          (engAny._activePostProcessPasses as AnyRec[] | undefined);
        if (Array.isArray(activePasses)) {
          for (let i = 0; i < activePasses.length; i++) {
            const p = activePasses[i];
            if (!p) continue;
            const pname = formatPostPassLabel(p, i);
            wrapTimed(p, "onRender", (dt) => add(postPasses, pname, dt), restores);
          }
        }
      }
    };

    const readTouchDiag = () => {
      const lateDisArr = cm?._onLateUpdateScripts as { length?: number; _elements?: AnyRec[] } | undefined;
      const lateArr = lateDisArr?._elements;
      const lateLen = typeof lateDisArr?.length === "number" ? lateDisArr.length : Array.isArray(lateArr) ? lateArr.length : 0;
      let nav: AnyRec | null = null;
      if (Array.isArray(lateArr)) {
        for (let i = 0; i < lateLen; i++) {
          const s = lateArr[i];
          if (s && (s.constructor?.name === "TerrainNavigationRuntime" || s.inputMode !== undefined)) {
            nav = s;
            break;
          }
        }
      }
      const r = canvas.getBoundingClientRect();
      const jx = r.left + r.width * (r.width > r.height ? 0.25 : 0.5);
      const jy = r.top + r.height * (r.width > r.height ? 0.5 : 0.75);
      const rx = r.left + r.width * (r.width > r.height ? 0.75 : 0.5);
      const ry = r.top + r.height * (r.width > r.height ? 0.5 : 0.25);
      const elJ = typeof document.elementFromPoint === "function" ? document.elementFromPoint(jx, jy) : null;
      const elR = typeof document.elementFromPoint === "function" ? document.elementFromPoint(rx, ry) : null;
      return {
        navEnabled: nav?.enabled ?? null,
        navInputEnabled: nav?.inputEnabled ?? null,
        navInputMode: nav?.inputMode ?? null,
        navMoveGesture: nav?.movementGestureEnabled ?? null,
        joystickHit: formatElementHit(elJ),
        lookHit: formatElementHit(elR)
      };
    };

    let started = false;
    let finalized = false;
    let firstFrameStartMs = 0;
    let prevFrameStartMs = 0;
    let lastFrameEndMs = 0;
    let lastProgressUpdateMs = 0;
    let currentFrameStartMs = 0;
    let currentFrameIntervalMs = 0;

    let startPose: CameraPoseSample | null = null;
    let prevPose: CameraPoseSample | null = null;
    let totalDistanceM = 0;
    let totalYawDeg = 0;
    let totalPitchDeg = 0;
    let maxFrameDistanceM = 0;
    let maxFrameYawDeg = 0;

    const recordSpikeCandidate = (
      list: MobileFrameSpikeDetail[],
      limit: number,
      metric: (entry: MobileFrameSpikeDetail) => number,
      buildEntry: () => MobileFrameSpikeDetail,
      candidateValue: number
    ): void => {
      if (list.length >= limit && candidateValue <= metric(list[list.length - 1]!)) {
        return;
      }
      const entry = buildEntry();
      list.push(entry);
      list.sort((a, b) => metric(b) - metric(a));
      if (list.length > limit) list.length = limit;
    };

    const flushQueuedTrigger = (): void => {
      if (disposed || queuedTrigger === null) return;
      const next = queuedTrigger;
      queuedTrigger = null;
      schedule(next, 250);
    };

    const finalizeCapture = (partial: boolean): void => {
      if (finalized) return;
      finalized = true;
      const capturedFrames = frameCpuMs.length;
      restoreActiveHooks();

      if (disposed) {
        runOptions?.onComplete?.(null, false);
        return;
      }
      if (capturedFrames === 0) {
        button.textContent = "引擎未渲染，点击重试";
        runOptions?.onComplete?.(null, false);
        flushQueuedTrigger();
        return;
      }

      try {
        const meanMap = (m: Record<string, number>): Record<string, number> => {
          const out: Record<string, number> = {};
          for (const [k, v] of Object.entries(m).sort((a, b) => b[1] - a[1])) {
            out[k] = round2(v / capturedFrames);
          }
          return out;
        };

        const cpuTotal = frameCpuMs.reduce((a, b) => a + b, 0);
        const avgCpu = cpuTotal / capturedFrames;
        const p95Cpu = percentile(frameCpuMs, 0.95);
        const maxCpu = Math.max(...frameCpuMs);

        // Exact average FPS over the (N - 1) complete inter-frame periods spanned by [t_0 .. t_{N-1}].
        const interFrameSpanMs = capturedFrames >= 2 ? prevFrameStartMs - firstFrameStartMs : 0;
        const fps = interFrameSpanMs > 0 ? ((capturedFrames - 1) * 1000) / interFrameSpanMs : 0;
        const windowMs = Math.max(0, lastFrameEndMs - firstFrameStartMs);

        const renderStats: MobileFrameRenderStats = readCumulativeCounters
          ? {
              fps: round1(fps),
              dc: round1(Math.max(0, endCounters.dc - startCounters.dc) / capturedFrames),
              tris: Math.round(Math.max(0, endCounters.tris - startCounters.tris) / capturedFrames),
              ...(endCounters.drawScope === "webgpu-direct" ? {
                drawScope: endCounters.drawScope,
                unmeasuredIndexedStrips: (endCounters.indexedStrips ?? 0) - (startCounters.indexedStrips ?? 0),
                fbo: null, fboAll: null, bufUploads: null, bufUploadKB: null, bufOrphans: null, bufOrphanKB: null
              } : {
              fbo: round1(Math.max(0, endCounters.fbo - startCounters.fbo) / capturedFrames),
              fboAll: round1(Math.max(0, endCounters.fboAll - startCounters.fboAll) / capturedFrames),
              bufUploads: round1(Math.max(0, endCounters.bufUploads - startCounters.bufUploads) / capturedFrames),
              bufUploadKB: round1(
                Math.max(0, endCounters.bufUploadBytes - startCounters.bufUploadBytes) / capturedFrames / 1024
              ),
              bufOrphans: round1(Math.max(0, endCounters.bufOrphans - startCounters.bufOrphans) / capturedFrames),
              bufOrphanKB: round1(
                Math.max(0, endCounters.bufOrphanBytes - startCounters.bufOrphanBytes) / capturedFrames / 1024
              )
              })

            }
          : {
              fps: round1(fps),
              dc: 0,
              tris: 0,
              fbo: 0,
              fboAll: 0,
              bufUploads: 0,
              bufUploadKB: 0,
              bufOrphans: 0,
              bufOrphanKB: 0
            };

        const perfText = readCumulativeCounters
          ? formatWindowPerfText(
              canvas.width,
              canvas.height,
              renderStats,
              avgCpu,
              maxCpu,
              capturedFrames
            )
          : readPerfText?.() ?? "";

        const liveState = readLiveState();
        const disabledModules = Object.entries(liveState)
          .filter(([, on]) => !on)
          .map(([k]) => k);

        // Snapshot SSR diagnostics by value so later SSR toggles never mutate historical captures or JSONL exports.
        const rawSsrDiag = (camera as unknown as AnyRec).screenSpaceReflectionDiagnostics;
        const ssrDiag =
          rawSsrDiag && typeof rawSsrDiag === "object"
            ? {
                ...rawSsrDiag,
                ...(ssrOpaqueReceivers.size > 0 ? { opaqueReceivers: [...ssrOpaqueReceivers] } : {})
              }
            : null;

        const cameraMotion: MobileFrameCameraMotion | null =
          startPose && prevPose
            ? {
                startPos: [round2(startPose.x), round2(startPose.y), round2(startPose.z)],
                endPos: [round2(prevPose.x), round2(prevPose.y), round2(prevPose.z)],
                totalDistanceM: round2(totalDistanceM),
                totalYawDeg: round1(totalYawDeg),
                totalPitchDeg: round1(totalPitchDeg),
                maxFrameDistanceM: round2(maxFrameDistanceM),
                maxFrameYawDeg: round1(maxFrameYawDeg)
              }
            : null;

        const seenSpikeFrames = new Set<number>();
        const spikeFrames: MobileFrameSpikeDetail[] = [];
        for (const entry of [...cpuSpikes, ...intervalSpikes]) {
          if (seenSpikeFrames.has(entry.frameIndex)) continue;
          seenSpikeFrames.add(entry.frameIndex);
          spikeFrames.push(entry);
          if (spikeFrames.length >= MAX_REPORTED_SPIKE_FRAMES) break;
        }
        spikeFrames.sort((a, b) => Math.max(b.cpuMs, b.intervalMs) - Math.max(a.cpuMs, a.intervalMs));

        let benchPhases: Record<string, MobileFrameBenchPhaseStats> | undefined;
        if (phaseAccs.size > 0) {
          benchPhases = {};
          for (const [label, acc] of phaseAccs) {
            if (acc.frames <= 0) continue;
            const spanMs = Math.max(0, acc.lastMs - acc.firstMs);
            const pFps = acc.frames >= 2 && spanMs > 0 ? ((acc.frames - 1) * 1000) / spanMs : 0;
            const pCpuSum = acc.cpus.reduce((a, b) => a + b, 0);
            benchPhases[label] = {
              frames: acc.frames,
              windowMs: round1(spanMs),
              fps: round1(pFps),
              avgCpuMs: round2(pCpuSum / acc.frames),
              p95CpuMs: round2(percentile(acc.cpus, 0.95)),
              maxCpuMs: round2(Math.max(...acc.cpus)),
              intP50Ms: round1(percentile(acc.intervals, 0.5)),
              intP95Ms: round1(percentile(acc.intervals, 0.95)),
              intMaxMs: round1(acc.intervals.length > 0 ? Math.max(...acc.intervals) : 0),
              dc: round1(acc.dc / acc.frames),
              tris: Math.round(acc.tris / acc.frames),
              bufOrphans: round1(acc.bufOrphans / acc.frames),
              bldgPumpMaxMs: round2(acc.bldgPumpMaxMs),
              drawMaxMs: round2(acc.drawMaxMs),
              shadowMaxMs: round2(acc.shadowMaxMs),
              shaderCompiles: acc.shaderCompiles
            };
          }
        }

        const payload: MobileFrameCaptureRecord = {
          schemaVersion: 2,
          ts: Date.now(),
          seq: ++reportSeq,
          trigger,
          partial,
          url: typeof location !== "undefined" ? location.href : "",
          ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
          dpr: typeof window !== "undefined" ? window.devicePixelRatio : 1,
          canvas: [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight],
          disabledModules,
          perfText,
          targetFrames,
          ...(activeDurationMs > 0 ? { targetDurationMs: activeDurationMs } : {}),
          capturedFrames,
          windowMs: round1(windowMs),
          avgCpuMs: round2(avgCpu),
          p95CpuMs: round2(p95Cpu),
          maxCpuMs: round2(maxCpu),
          frameCpuMs: frameCpuMs.map(round2),
          frameIntervalsMs: frameIntervalsMs.map(round1),
          cameraMotion,
          ...(benchPhases ? { benchPhases } : {}),
          ...(shaderCompileSpikes.length > 0 ? { shaderCompileSpikes } : {}),
          spikeFrames,
          renderStats,
          queueCounts,
          ssrDiag,
          touchDiag: readTouchDiag(),
          engineStagesMs: meanMap(engineStages),
          pipelineStagesMs: meanMap(pipelineStages),
          drawPassStagesMs: meanMap(drawPassStages),
          queueByStageMs: meanMap(queueByStage),
          postPassesMs: meanMap(postPasses),
          scriptUpdMs: meanMap(scriptUpd),
          scriptLateMs: meanMap(scriptLate),
          seedTickMs: meanMap(seedTick)
        };

        captures.push(payload);
        if (captures.length > MAX_RETAINED_CAPTURES) captures.shift();
        exportButton.disabled = false;
        exportButton.textContent = `导出(${captures.length})`;

        const seq = reportSeq;
        const avgLabel = round1(payload.avgCpuMs);
        button.textContent = `上报中 #${seq} (${avgLabel}ms)...`;
        fetch(endpointUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        })
          .then(async (res) => {
            const info = (await res.json().catch(() => null)) as { ok?: boolean; file?: string } | null;
            const uploaded = Boolean(res.ok && info?.ok === true);
            runOptions?.onComplete?.(payload, uploaded);
            if (disposed || capturing || gen !== captureGen) return;
            if (!uploaded) {
              button.textContent = `已采样 #${seq} (${avgLabel}ms)`;
              return;
            }
            button.textContent = `已上报 #${seq} (${avgLabel}ms)`;
            if (!loggedServerFile && info?.file) {
              loggedServerFile = true;
              console.info(`[seed-world-perf] captures saved to ${info.file} (GET ${endpointUrl} to inspect)`);
            }
          })
          .catch(() => {
            runOptions?.onComplete?.(payload, false);
            if (!disposed && !capturing && gen === captureGen) {
              button.textContent = `已采样 #${seq} (${avgLabel}ms)`;
            }
          });
      } catch (error) {
        console.warn("[seed-world-perf] frame capture failed", error);
        button.textContent = "抓帧失败，点击重试";
        runOptions?.onComplete?.(null, false);
      }

      flushQueuedTrigger();
    };

    const observer: PerfFrameObserver = {
      onFrameBegin(startMs: number) {
        if (finalized || disposed) return;
        clearMap(frameEngineStages);
        clearMap(framePipelineStages);
        clearMap(frameQueueByStage);
        clearMap(frameScriptUpd);
        clearMap(frameScriptLate);
        clearMap(frameSeedTick);
        frameShaderCompiles = 0;
        currentFrameStartMs = startMs;
        if (!started) {
          started = true;
          firstFrameStartMs = startMs;
          prevFrameStartMs = startMs;
          lastProgressUpdateMs = startMs;
          currentFrameIntervalMs = 0;
          currentPhaseLabel = runOptions?.onFrame?.(0, 0);
          readCumulativeCounters?.(startCounters);
          Object.assign(frameStartCounters, startCounters);
          startPose = readCameraPose(camera);
          prevPose = startPose;
          installStageHooks();
        } else {
          currentFrameIntervalMs = startMs - prevFrameStartMs;
          frameIntervalsMs.push(currentFrameIntervalMs);
          prevFrameStartMs = startMs;
          currentPhaseLabel = runOptions?.onFrame?.(Math.max(0, startMs - firstFrameStartMs), frameCpuMs.length);
          readCumulativeCounters?.(frameStartCounters);
        }
      },
      onFrameEnd(cpuMs: number, endMs: number) {
        if (finalized || disposed || !started) return;
        const frameIndex = frameCpuMs.length;
        frameCpuMs.push(cpuMs);
        addDual(engineStages, frameEngineStages, "engineUpdateTotal", cpuMs);
        lastFrameEndMs = endMs;
        // Snapshot at each completed frame boundary so even a pause-triggered partial timeout has exact end counters.
        readCumulativeCounters?.(endCounters);

        let frameMoveM = 0;
        let frameYawDeg = 0;
        const curPose = readCameraPose(camera);
        if (curPose) {
          if (!startPose) startPose = curPose;
          if (prevPose) {
            const dx = curPose.x - prevPose.x;
            const dy = curPose.y - prevPose.y;
            const dz = curPose.z - prevPose.z;
            frameMoveM = Math.hypot(dx, dy, dz);
            frameYawDeg = Math.abs(normalizeYawDeltaDeg(curPose.yawDeg - prevPose.yawDeg));
            const framePitchDeg = Math.abs(curPose.pitchDeg - prevPose.pitchDeg);
            totalDistanceM += frameMoveM;
            totalYawDeg += frameYawDeg;
            totalPitchDeg += framePitchDeg;
            if (frameMoveM > maxFrameDistanceM) maxFrameDistanceM = frameMoveM;
            if (frameYawDeg > maxFrameYawDeg) maxFrameYawDeg = frameYawDeg;
          }
          prevPose = curPose;
        }

        if (currentPhaseLabel) {
          let acc = phaseAccs.get(currentPhaseLabel);
          if (!acc) {
            acc = {
              frames: 0,
              firstMs: currentFrameStartMs,
              lastMs: currentFrameStartMs,
              cpus: [],
              intervals: [],
              dc: 0,
              tris: 0,
              bufOrphans: 0,
              bldgPumpMaxMs: 0,
              drawMaxMs: 0,
              shadowMaxMs: 0,
              shaderCompiles: 0
            };
            phaseAccs.set(currentPhaseLabel, acc);
          }
          acc.frames++;
          acc.lastMs = currentFrameStartMs;
          acc.cpus.push(cpuMs);
          if (currentFrameIntervalMs > 0) acc.intervals.push(currentFrameIntervalMs);
          acc.dc += Math.max(0, endCounters.dc - frameStartCounters.dc);
          acc.tris += Math.max(0, endCounters.tris - frameStartCounters.tris);
          acc.bufOrphans += Math.max(0, endCounters.bufOrphans - frameStartCounters.bufOrphans);
          const pumpMs = frameSeedTick["bldg.pumpSync"] || 0;
          if (pumpMs > acc.bldgPumpMaxMs) acc.bldgPumpMaxMs = pumpMs;
          const drawMs = framePipelineStages.drawRenderPass || 0;
          if (drawMs > acc.drawMaxMs) acc.drawMaxMs = drawMs;
          const shdMs = framePipelineStages.shadowPass || 0;
          if (shdMs > acc.shadowMaxMs) acc.shadowMaxMs = shdMs;
          acc.shaderCompiles += frameShaderCompiles;
        }

        let builtSpike: MobileFrameSpikeDetail | null = null;
        const buildSpike = (): MobileFrameSpikeDetail => {
          if (builtSpike) return builtSpike;
          builtSpike = {
            frameIndex,
            offsetMs: round1(Math.max(0, currentFrameStartMs - firstFrameStartMs)),
            cpuMs: round2(cpuMs),
            intervalMs: round1(currentFrameIntervalMs),
            moveM: round2(frameMoveM),
            yawDeg: round1(frameYawDeg),
            dc: Math.max(0, endCounters.dc - frameStartCounters.dc),
            tris: Math.max(0, endCounters.tris - frameStartCounters.tris),
            fbo: Math.max(0, endCounters.fbo - frameStartCounters.fbo),
            bufUploads: Math.max(0, endCounters.bufUploads - frameStartCounters.bufUploads),
            bufUploadKB: round1(Math.max(0, endCounters.bufUploadBytes - frameStartCounters.bufUploadBytes) / 1024),
            bufOrphans: Math.max(0, endCounters.bufOrphans - frameStartCounters.bufOrphans),
            bufOrphanKB: round1(Math.max(0, endCounters.bufOrphanBytes - frameStartCounters.bufOrphanBytes) / 1024),
            engineStagesMs: cloneRoundedTop(frameEngineStages),
            pipelineStagesMs: cloneRoundedTop(framePipelineStages),
            queueByStageMs: cloneRoundedTop(frameQueueByStage),
            scriptUpdMs: cloneRoundedTop(frameScriptUpd),
            scriptLateMs: cloneRoundedTop(frameScriptLate),
            seedTickMs: cloneRoundedTop(frameSeedTick)
          };
          return builtSpike;
        };

        recordSpikeCandidate(cpuSpikes, MAX_CPU_SPIKE_FRAMES, (e) => e.cpuMs, buildSpike, cpuMs);
        if (currentFrameIntervalMs > 0) {
          recordSpikeCandidate(
            intervalSpikes,
            MAX_INTERVAL_SPIKE_FRAMES,
            (e) => e.intervalMs,
            buildSpike,
            currentFrameIntervalMs
          );
        }

        if (activeDurationMs > 0) {
          const elapsedMs = Math.max(0, endMs - firstFrameStartMs);
          if (elapsedMs >= activeDurationMs || frameCpuMs.length >= MAX_DURATION_CAPTURE_FRAMES) {
            finalizeCapture(false);
            return;
          }
          if (endMs - lastProgressUpdateMs >= 200) {
            lastProgressUpdateMs = endMs;
            button.textContent = `采样中 ${(elapsedMs / 1000).toFixed(1)}/${activeSecLabel} (${frameCpuMs.length}f)`;
          }
        } else if (frameCpuMs.length >= targetFrames) {
          finalizeCapture(false);
        }
      }
    };

    if (setFrameObserver) {
      setFrameObserver(observer);
    } else {
      // Standalone fallback when used outside SeedWorldPerfPanel.
      installSingletonHook(
        engAny,
        "update",
        (orig) =>
          function (this: unknown) {
            const t0 = performance.now();
            observer.onFrameBegin(t0);
            try {
              // eslint-disable-next-line prefer-rest-params
              return orig.apply(this, arguments as unknown as unknown[]);
            } finally {
              const t1 = performance.now();
              observer.onFrameEnd(t1 - t0, t1);
            }
          },
        restores
      );
    }

    // Safety timeout guarantees hooks never leak if the engine is paused or the tab is backgrounded.
    const effectiveTimeoutMs =
      captureTimeoutMs > 0 && Number.isFinite(captureTimeoutMs)
        ? Math.max(captureTimeoutMs, activeDurationMs > 0 ? activeDurationMs + 10_000 : 0)
        : 0;
    if (effectiveTimeoutMs > 0) {
      safetyTimer = setTimeout(() => {
        safetyTimer = null;
        if (!finalized && !disposed) {
          finalizeCapture(true);
        }
      }, effectiveTimeoutMs);
    }
  };

  const schedule = (trigger: string, delayMs = 1500): void => {
    if (disposed) return;
    if (pendingTimer !== null) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      captureNow(trigger);
    }, delayMs);
  };

  button.onclick = () => captureNow("manual", manualDurationMs);
  exportButton.onclick = () => exportJsonl();
  if (autoBootDelayMs !== null && autoBootDelayMs >= 0) {
    schedule("auto_boot", autoBootDelayMs);
  }

  return {
    button,
    exportButton,
    schedule,
    captureNow,
    exportJsonl,
    dispose: () => {
      disposed = true;
      queuedTrigger = null;
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      restoreActiveHooks();
      // Full cleanup on teardown: delete prototype-shadowing own properties back to pristine state.
      for (const [obj, objSlots] of sessionSlots) {
        for (const [key, slot] of objSlots) {
          if (obj[key] === slot.orig) {
            if (!slot.hadOwn) delete obj[key];
          }
        }
      }
      sessionSlots.clear();
      if (host.__seedWorldPerfCaptures === captures) {
        delete host.__seedWorldPerfCaptures;
      }
    }
  };
}
