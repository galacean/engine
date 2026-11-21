import type { Camera, Scene, WebGLEngine } from "@galacean/engine";

/** Global tick timing hook populated only during an active capture window. */
export interface MobileSeedTickHost {
  __mobileSeedTickMark?: (name: string, ms: number) => void;
  __seedWorldPerfCaptures?: MobileFrameCaptureRecord[];
}

export interface PerfCumulativeCounters {
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
  readonly fps: number;
  readonly dc: number;
  readonly tris: number;
  readonly fbo: number;
  readonly fboAll: number;
  readonly bufUploads: number;
  readonly bufUploadKB: number;
  readonly bufOrphans: number;
  readonly bufOrphanKB: number;
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
  readonly capturedFrames: number;
  readonly windowMs: number;
  readonly avgCpuMs: number;
  readonly p95CpuMs: number;
  readonly maxCpuMs: number;
  readonly frameCpuMs: readonly number[];
  readonly frameIntervalsMs: readonly number[];
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
  captureNow(trigger: string): void;
  exportJsonl(): void;
  dispose(): void;
}

export interface MobileFrameCaptureOptions {
  readonly engine: WebGLEngine;
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
  readonly captureTimeoutMs?: number;
  readonly autoBootDelayMs?: number | null;
  readonly endpointUrl?: string;
}

type AnyRec = Record<string, any>;
type HookedSlot = { readonly hadOwn: boolean; readonly orig: (...args: unknown[]) => unknown };

const DEFAULT_CAPTURE_FRAME_COUNT = 20;
const DEFAULT_CAPTURE_TIMEOUT_MS = 12_000;
const DEFAULT_AUTO_BOOT_DELAY_MS = 2500;
const MAX_RETAINED_CAPTURES = 50;

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
  const orphanPart = stats.bufOrphans > 0 ? ` orphan=${Math.round(stats.bufOrphans)}(${Math.round(stats.bufOrphanKB)}KB)` : "";
  return (
    `PERF | ${capturedFrames}f | ${width}x${height}\n` +
    `${stats.fps.toFixed(1)}fps | cpu=${avgCpuMs.toFixed(1)}ms(max ${maxCpuMs.toFixed(1)}) | ` +
    `dc=${Math.round(stats.dc)} fbo=${Math.round(stats.fbo)}(all ${Math.round(stats.fboAll)}) ` +
    `tris=${trisK.toFixed(0)}k buf=${Math.round(stats.bufUploads)}(${Math.round(stats.bufUploadKB)}KB)${orphanPart}`
  );
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
    captureTimeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
    autoBootDelayMs = DEFAULT_AUTO_BOOT_DELAY_MS,
    endpointUrl = "/__mobile-diag"
  } = options;

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
  button.textContent = `抓帧上报 (${targetFrames}f)`;
  button.title = `采样 ${targetFrames} 帧详细 CPU/管线拆解并上报到本地 tmp/seed-world-perf-diag.jsonl`;

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
        targetMap[label] = (targetMap[label] || 0) + (performance.now() - t0);
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

  const captureNow = (trigger: string): void => {
    if (disposed) return;
    if (capturing) {
      // Never silently drop a user/toggle capture while a previous capture is still running on slow devices.
      queuedTrigger = trigger;
      return;
    }
    capturing = true;
    const gen = ++captureGen;
    button.textContent = `采样中(${trigger})...`;

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
    const frameCpuMs: number[] = [];
    const frameIntervalsMs: number[] = [];
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
    const scriptLabelCache = new WeakMap<object, string>();

    const add = (map: Record<string, number>, key: string, dt: number) => {
      map[key] = (map[key] || 0) + dt;
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

      host.__mobileSeedTickMark = (name: string, dt: number) => add(seedTick, name, dt);
      restores.push(() => {
        delete host.__mobileSeedTickMark;
      });

      // 1. Engine top-level & Scene hooks (skip inputManager & GL hooks to avoid touch/FBO interference on iOS)
      wrapTimed(engAny, "_render", (dt) => add(engineStages, "engRenderTotal", dt), restores);
      wrapTimed(scnAny.physics, "_update", (dt) => add(engineStages, "physics", dt), restores);
      wrapTimed(scnAny, "_updateRendering", (dt) => add(engineStages, "updateRendering", dt), restores);

      if (cm) {
        wrapTimed(cm, "callScriptOnStart", (dt) => add(engineStages, "scriptStart", dt), restores);
        wrapTimed(cm, "callScriptOnUpdate", (dt) => add(engineStages, "scriptUpd", dt), restores);
        wrapTimed(cm, "callAnimationUpdate", (dt) => add(engineStages, "animUpdate", dt), restores);
        wrapTimed(cm, "callScriptOnLateUpdate", (dt) => add(engineStages, "scriptLate", dt), restores);
        wrapTimed(cm, "callRendererOnUpdate", (dt) => add(engineStages, "rendererUpdate", dt), restores);
        wrapTimed(cm, "callCameraOnBeginRender", (dt) => add(engineStages, "camBeginRender", dt), restores);
        wrapTimed(cm, "callCameraOnEndRender", (dt) => add(engineStages, "camEndRender", dt), restores);
        wrapTimed(cm, "sortOverlayUICanvases", (dt) => add(engineStages, "uiSort", dt), restores);
        // Instrument DisorderedArray iteration instead of mutating Script instances.
        wrapDisorderedScriptLoop(cm._onUpdateScripts, scriptUpd, scriptLabelCache, restores);
        wrapDisorderedScriptLoop(cm._onLateUpdateScripts, scriptLate, scriptLabelCache, restores);
      }

      // 2. BasicRenderPipeline top-level stages vs _drawRenderPass sub-stages
      if (pipe) {
        wrapTimed(pipe, "render", (dt) => add(pipelineStages, "pipelineTotal", dt), restores);
        wrapTimed(pipe._cascadedShadowCasterPass, "onRender", (dt) => add(pipelineStages, "shadowPass", dt), restores);
        wrapTimed(pipe, "_prepareRender", (dt) => add(pipelineStages, "prepareRender", dt), restores);
        wrapTimed(pipe, "_prepareCameraRenderViewCulling", (dt) => add(pipelineStages, "viewCulling", dt), restores);
        wrapTimed(batcherMgr, "uploadBuffer", (dt) => add(pipelineStages, "uploadBuffer", dt), restores);
        wrapTimed(pipe, "_renderRegisteredPasses", (dt) => add(pipelineStages, "registeredPasses", dt), restores);
        wrapTimed(pipe._depthOnlyPass, "onRender", (dt) => add(pipelineStages, "depthOnlyPass", dt), restores);
        wrapTimed(pipe._saoPass, "onRender", (dt) => add(pipelineStages, "saoPass", dt), restores);
        wrapTimed(pipe, "_drawRenderPass", (dt) => add(pipelineStages, "drawRenderPass", dt), restores);

        const ssrPass = pipe._ssrPass;
        if (ssrPass) {
          wrapTimed(ssrPass, "prepare", (dt) => add(pipelineStages, "ssrPrepare", dt), restores);
          wrapTimed(ssrPass, "renderPreForward", (dt) => add(pipelineStages, "ssrPreForward", dt), restores);
          wrapTimed(ssrPass, "captureHistory", (dt) => add(drawPassStages, "ssrCaptureHistory", dt), restores);
          wrapTimed(ssrPass, "releaseFrameTargets", (dt) => add(pipelineStages, "ssrRelease", dt), restores);
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
              add(pipelineStages, "sortBatch", dt);
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
                    add(queueByStage, stageKey, dt);
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

      if (disposed) return;
      if (capturedFrames === 0) {
        button.textContent = "引擎未渲染，点击重试";
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
        const ssrDiag = rawSsrDiag && typeof rawSsrDiag === "object" ? { ...rawSsrDiag } : null;

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
          capturedFrames,
          windowMs: round1(windowMs),
          avgCpuMs: round2(avgCpu),
          p95CpuMs: round2(p95Cpu),
          maxCpuMs: round2(maxCpu),
          frameCpuMs: frameCpuMs.map(round2),
          frameIntervalsMs: frameIntervalsMs.map(round1),
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
            if (disposed || capturing || gen !== captureGen) return;
            if (!res.ok || info?.ok !== true) {
              button.textContent = `已采样 #${seq} (${avgLabel}ms)`;
              return;
            }
            button.textContent = `已上报 #${seq} (${avgLabel}ms)`;
            if (!loggedServerFile && info.file) {
              loggedServerFile = true;
              console.info(`[seed-world-perf] captures saved to ${info.file} (GET ${endpointUrl} to inspect)`);
            }
          })
          .catch(() => {
            if (!disposed && !capturing && gen === captureGen) {
              button.textContent = `已采样 #${seq} (${avgLabel}ms)`;
            }
          });
      } catch (error) {
        console.warn("[seed-world-perf] frame capture failed", error);
        button.textContent = "抓帧失败，点击重试";
      }

      flushQueuedTrigger();
    };

    const observer: PerfFrameObserver = {
      onFrameBegin(startMs: number) {
        if (finalized || disposed) return;
        if (!started) {
          started = true;
          firstFrameStartMs = startMs;
          prevFrameStartMs = startMs;
          readCumulativeCounters?.(startCounters);
          installStageHooks();
        } else {
          frameIntervalsMs.push(startMs - prevFrameStartMs);
          prevFrameStartMs = startMs;
        }
      },
      onFrameEnd(cpuMs: number, endMs: number) {
        if (finalized || disposed || !started) return;
        frameCpuMs.push(cpuMs);
        add(engineStages, "engineUpdateTotal", cpuMs);
        lastFrameEndMs = endMs;
        // Snapshot at each completed frame boundary so even a pause-triggered partial timeout has exact end counters.
        readCumulativeCounters?.(endCounters);
        if (frameCpuMs.length >= targetFrames) {
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
    if (captureTimeoutMs > 0 && Number.isFinite(captureTimeoutMs)) {
      safetyTimer = setTimeout(() => {
        safetyTimer = null;
        if (!finalized && !disposed) {
          finalizeCapture(true);
        }
      }, captureTimeoutMs);
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

  button.onclick = () => captureNow("manual");
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
