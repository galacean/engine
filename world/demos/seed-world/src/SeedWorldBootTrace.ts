import {
  summarizeSeedWorldShaderAudit,
  type SeedWorldShaderAuditSnapshot,
  type SeedWorldShaderAuditSummary
} from "./SeedWorldShaderAudit";

export interface BootTraceActiveSpan {
  readonly id: number;
  readonly name: string;
  readonly startMs: number;
  readonly elapsedMs: number;
  readonly detail?: string;
}

export interface BootTraceCompletedSpan {
  readonly id: number;
  readonly name: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly status: "ok" | "error";
  readonly detail?: string;
  readonly error?: string;
}

export interface BootTracePhaseEntry {
  readonly phase: string;
  readonly progress?: number;
  readonly atMs: number;
}

export interface BootTraceEvent {
  readonly atMs: number;
  readonly level: "info" | "warn" | "error";
  readonly tag: string;
  readonly message: string;
  readonly detail?: string;
}

export interface BootTraceResourceSummary {
  readonly name: string;
  readonly category: string;
  readonly initiatorType: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly transferSize: number;
  readonly decodedBodySize: number;
  readonly responseStatus?: number;
}

export interface BootTraceResourceCategoryStats {
  readonly count: number;
  readonly cachedCount: number;
  readonly transferBytes: number;
  readonly decodedBytes: number;
  readonly maxDurationMs: number;
  readonly sumDurationMs: number;
  readonly firstStartMs: number;
  readonly lastEndMs: number;
}

export interface BootTraceDeviceInfo {
  readonly userAgent?: string;
  readonly devicePixelRatio?: number;
  readonly hardwareConcurrency?: number;
  readonly deviceMemory?: number;
  readonly viewport?: readonly [number, number];
  readonly webglVersion?: string;
  readonly gpuVendor?: string;
  readonly gpuRenderer?: string;
  readonly parallelShaderCompile?: boolean;
}

export interface BootTraceNavigationInfo {
  readonly type?: string;
  readonly responseStartMs?: number;
  readonly responseEndMs?: number;
  readonly domInteractiveMs?: number;
  readonly domContentLoadedMs?: number;
  readonly loadEventEndMs?: number;
  readonly transferSize?: number;
  readonly decodedBodySize?: number;
}

export interface BootTraceMeta {
  readonly templateId?: string;
  readonly templateFamily?: string;
  readonly features?: Readonly<Record<string, boolean | number | string>>;
  readonly device?: BootTraceDeviceInfo;
  readonly navigation?: BootTraceNavigationInfo;
  readonly startupWarmup?: {
    readonly requested: number;
    readonly compiled: number;
    readonly deferred: number;
    readonly elapsedMs: number;
    readonly longestVariantMs: number;
    readonly parallelCompile: boolean;
  };
  readonly bgWarmup?: {
    readonly requested: number;
    readonly compiled: number;
    readonly elapsedMs: number;
    readonly longestVariantMs: number;
    readonly completedAtMs: number;
  };
}

export interface BootTraceSnapshot {
  readonly runId: string;
  readonly timeOrigin: number;
  readonly elapsedMs: number;
  readonly url: string;
  readonly artifactId?: string;
  readonly artifactVersion?: string;
  readonly status: "loading" | "ready" | "error";
  readonly currentPhase: string;
  readonly progress: number;
  readonly error?: string;
  readonly meta?: BootTraceMeta;
  readonly shaderSummary?: SeedWorldShaderAuditSummary;
  readonly active: readonly BootTraceActiveSpan[];
  readonly spans: readonly BootTraceCompletedSpan[];
  readonly phases: readonly BootTracePhaseEntry[];
  readonly events: readonly BootTraceEvent[];
  readonly resourceStats: {
    readonly count: number;
    readonly cachedCount: number;
    readonly networkCount: number;
    readonly totalTransferBytes: number;
    readonly totalDecodedBytes: number;
    readonly waterfallWindow?: {
      readonly firstStartMs: number;
      readonly lastEndMs: number;
      readonly spanMs: number;
    };
    readonly byCategory: Readonly<Record<string, BootTraceResourceCategoryStats>>;
    readonly slowest: readonly BootTraceResourceSummary[];
  };
}

export interface BootSpanHandle {
  end(detail?: string): void;
  fail(error: unknown, detail?: string): void;
}

interface InternalActiveSpan {
  id: number;
  name: string;
  startMs: number;
  detail?: string;
  lastWarnAtMs?: number;
}

const MAX_EVENTS = 250;
const STALL_WARN_MS = 8_000;
const STALL_REPEAT_MS = 10_000;
const OVERLAY_REVEAL_MS = 5_000;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.cause ? `${error.name}: ${error.message} (${formatError(error.cause)})` : `${error.name}: ${error.message}`;
  }
  return String(error);
}

function shortResourceName(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const tail = parts.slice(-3).join("/");
    return `${parsed.host}/${tail}${parsed.search ? parsed.search.slice(0, 40) : ""}`;
  } catch {
    return url.slice(-80);
  }
}

function makeRunId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `boot-${Date.now().toString(36)}-${rand}`;
}

function classifyResourceCategory(url: string, initiatorType: string): string {
  let pathname = url;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = url.toLowerCase().split(/[?#]/)[0] ?? "";
  }
  if (/(?:^|\/)seed-world-[a-z0-9-]+-bundle(?:-[a-f0-9]+)?\.(?:bin|json)$/i.test(pathname)) {
    return "bundle";
  }
  if (pathname.endsWith(".wasm") || pathname.endsWith(".wasm.br")) return "wasm";
  if (pathname.endsWith(".js") || pathname.endsWith(".mjs") || pathname.endsWith(".cjs")) return "js";
  if (pathname.endsWith(".css")) return "css";
  if (pathname.endsWith(".ktx2") || pathname.endsWith(".tex")) return "ktx2";
  if (/\.(png|jpe?g|webp|avif|gif|svg)$/.test(pathname)) return "image";
  if (pathname.endsWith(".glb") || pathname.endsWith(".gltf")) return "glb";
  if (pathname.endsWith(".mesh") || pathname.endsWith(".bin") || pathname.endsWith(".treewind")) return "mesh";
  if (pathname.endsWith(".shader") || pathname.endsWith(".shaderc") || pathname.endsWith(".glsl")) return "shader";
  if (/\.(prefab|mat|scene|json|animctrl|asset)$/.test(pathname)) return "manifest";
  if (/\.(mp3|wav|ogg|m4a|aac)$/.test(pathname)) return "audio";
  if (initiatorType === "script") return "js";
  return "other";
}

function readNavigationInfo(): BootTraceNavigationInfo | undefined {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return undefined;
  const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  const nav = entries[0];
  if (!nav) return undefined;
  return {
    type: nav.type,
    responseStartMs: Math.round(nav.responseStart),
    responseEndMs: Math.round(nav.responseEnd),
    domInteractiveMs: Math.round(nav.domInteractive),
    domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
    loadEventEndMs: Math.round(nav.loadEventEnd),
    transferSize: typeof nav.transferSize === "number" ? nav.transferSize : undefined,
    decodedBodySize: typeof nav.decodedBodySize === "number" ? nav.decodedBodySize : undefined
  };
}

function readBasicDeviceInfo(): BootTraceDeviceInfo {
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  const win = typeof window !== "undefined" ? window : undefined;
  return {
    ...(nav?.userAgent ? { userAgent: nav.userAgent } : {}),
    ...(typeof win?.devicePixelRatio === "number" ? { devicePixelRatio: win.devicePixelRatio } : {}),
    ...(typeof nav?.hardwareConcurrency === "number" ? { hardwareConcurrency: nav.hardwareConcurrency } : {}),
    ...(typeof nav?.deviceMemory === "number" ? { deviceMemory: nav.deviceMemory } : {}),
    ...(win ? { viewport: [win.innerWidth, win.innerHeight] as const } : {})
  };
}

function readResourceStats(): BootTraceSnapshot["resourceStats"] {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return {
      count: 0,
      cachedCount: 0,
      networkCount: 0,
      totalTransferBytes: 0,
      totalDecodedBytes: 0,
      byCategory: {},
      slowest: []
    };
  }
  const entries = performance.getEntriesByType("resource") as (PerformanceResourceTiming & { responseStatus?: number })[];
  let totalTransferBytes = 0;
  let totalDecodedBytes = 0;
  let cachedCount = 0;
  let networkCount = 0;
  let firstStartMs = Number.POSITIVE_INFINITY;
  let lastEndMs = 0;
  const categoryAcc: Record<
    string,
    {
      count: number;
      cachedCount: number;
      transferBytes: number;
      decodedBytes: number;
      maxDurationMs: number;
      sumDurationMs: number;
      firstStartMs: number;
      lastEndMs: number;
    }
  > = {};
  const summaries: BootTraceResourceSummary[] = [];
  for (const entry of entries) {
    if (entry.name.includes("/__mobile-diag")) continue;
    const transferSize = typeof entry.transferSize === "number" ? entry.transferSize : 0;
    const decodedBodySize = typeof entry.decodedBodySize === "number" ? entry.decodedBodySize : 0;
    const startMs = Math.round(entry.startTime);
    const durationMs = Math.round(entry.duration);
    const endMs = startMs + durationMs;
    const isCached = transferSize === 0 && decodedBodySize > 0;
    if (isCached) cachedCount++;
    else networkCount++;
    totalTransferBytes += transferSize;
    totalDecodedBytes += decodedBodySize;
    if (startMs < firstStartMs) firstStartMs = startMs;
    if (endMs > lastEndMs) lastEndMs = endMs;

    const category = classifyResourceCategory(entry.name, entry.initiatorType || "unknown");
    const cat = (categoryAcc[category] ??= {
      count: 0,
      cachedCount: 0,
      transferBytes: 0,
      decodedBytes: 0,
      maxDurationMs: 0,
      sumDurationMs: 0,
      firstStartMs: Number.POSITIVE_INFINITY,
      lastEndMs: 0
    });
    cat.count += 1;
    if (isCached) cat.cachedCount += 1;
    cat.transferBytes += transferSize;
    cat.decodedBytes += decodedBodySize;
    cat.sumDurationMs += durationMs;
    if (durationMs > cat.maxDurationMs) cat.maxDurationMs = durationMs;
    if (startMs < cat.firstStartMs) cat.firstStartMs = startMs;
    if (endMs > cat.lastEndMs) cat.lastEndMs = endMs;

    summaries.push({
      name: shortResourceName(entry.name),
      category,
      initiatorType: entry.initiatorType || "unknown",
      startMs,
      durationMs,
      transferSize,
      decodedBodySize,
      ...(typeof entry.responseStatus === "number" ? { responseStatus: entry.responseStatus } : {})
    });
  }
  summaries.sort((a, b) => b.durationMs - a.durationMs);
  const byCategory: Record<string, BootTraceResourceCategoryStats> = {};
  for (const [k, v] of Object.entries(categoryAcc).sort((a, b) => b[1].transferBytes - a[1].transferBytes || b[1].sumDurationMs - a[1].sumDurationMs)) {
    byCategory[k] = {
      ...v,
      firstStartMs: Number.isFinite(v.firstStartMs) ? v.firstStartMs : 0
    };
  }
  const counted = cachedCount + networkCount;
  return {
    count: counted,
    cachedCount,
    networkCount,
    totalTransferBytes,
    totalDecodedBytes,
    ...(counted > 0 && Number.isFinite(firstStartMs)
      ? { waterfallWindow: { firstStartMs, lastEndMs, spanMs: Math.max(0, lastEndMs - firstStartMs) } }
      : {}),
    byCategory,
    slowest: summaries.slice(0, 25)
  };
}

class SeedWorldBootTraceController {
  private runId = makeRunId();
  private nextSpanId = 1;
  private status: "loading" | "ready" | "error" = "loading";
  private currentPhase = "entry";
  private progressValue = 0;
  private errorMessage: string | undefined;
  private url = "";
  private verbose = false;
  private autoOpenOverlay = false;
  private meta: BootTraceMeta = {};
  private shaderAuditProvider: (() => SeedWorldShaderAuditSnapshot | undefined) | undefined;
  private diagStatusText = "";
  private readonly active = new Map<number, InternalActiveSpan>();
  private readonly spans: BootTraceCompletedSpan[] = [];
  private readonly phases: BootTracePhaseEntry[] = [];
  private readonly events: BootTraceEvent[] = [];
  private canvas: HTMLCanvasElement | undefined;
  private watchdogTimer: ReturnType<typeof setInterval> | undefined;
  private overlayRevealTimer: ReturnType<typeof setTimeout> | undefined;
  private overlayRefreshTimer: ReturnType<typeof setInterval> | undefined;
  private overlayRoot: HTMLElement | undefined;
  private overlayToggle: HTMLButtonElement | undefined;
  private overlayPanel: HTMLElement | undefined;
  private overlayBody: HTMLElement | undefined;
  private overlayReportBtn: HTMLButtonElement | undefined;
  private overlayOpen = false;
  private resourceObserver: PerformanceObserver | undefined;

  configure(options: { url: string; verbose?: boolean; autoOpenOverlay?: boolean }): void {
    if (this.status !== "loading") {
      this.reset();
    }
    this.url = options.url;
    this.verbose = Boolean(options.verbose);
    this.autoOpenOverlay = Boolean(options.autoOpenOverlay);
    if (typeof performance !== "undefined" && typeof performance.setResourceTimingBufferSize === "function") {
      try {
        performance.setResourceTimingBufferSize(4000);
      } catch {
        /* Ignore unsupported environments. */
      }
    }
    this.ensureWatchdog();
    this.ensureResourceObserver();
  }

  setMeta(partial: Partial<BootTraceMeta>): void {
    this.meta = {
      ...this.meta,
      ...partial,
      ...(partial.features || this.meta.features
        ? { features: { ...(this.meta.features ?? {}), ...(partial.features ?? {}) } }
        : {}),
      ...(partial.device || this.meta.device
        ? { device: { ...(this.meta.device ?? {}), ...(partial.device ?? {}) } }
        : {})
    };
    this.renderOverlay();
  }

  setShaderAuditProvider(provider: (() => SeedWorldShaderAuditSnapshot | undefined) | undefined): void {
    this.shaderAuditProvider = provider;
  }

  async reportToDiag(
    stage: "ready" | "post-ready" | "error" | "manual",
    endpointUrl = "/__mobile-diag"
  ): Promise<boolean> {
    if (typeof fetch !== "function") return false;
    this.diagStatusText = `上报中(${stage})...`;
    if (this.overlayReportBtn) this.overlayReportBtn.textContent = this.diagStatusText;
    try {
      const payload = {
        kind: "seed-world-boot-trace",
        stage,
        runId: this.runId,
        recordedAt: new Date().toISOString(),
        snapshot: this.snapshot()
      };
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        this.diagStatusText = `上报失败(${response.status})`;
        if (this.overlayReportBtn) this.overlayReportBtn.textContent = this.diagStatusText;
        return false;
      }
      this.diagStatusText = `已上报(${stage})`;
      if (this.overlayReportBtn) this.overlayReportBtn.textContent = this.diagStatusText;
      this.renderOverlay();
      return true;
    } catch {
      this.diagStatusText = "未连接上报端";
      if (this.overlayReportBtn) this.overlayReportBtn.textContent = "上报 Trace";
      return false;
    }
  }

  attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.syncCanvasActiveDataset();
  }

  phase(phase: string, progress?: number): void {
    const atMs = nowMs();
    this.currentPhase = phase;
    if (typeof progress === "number") this.progressValue = progress;
    this.phases.push({ phase, ...(typeof progress === "number" ? { progress } : {}), atMs });
    if (this.verbose) {
      const pct = typeof progress === "number" ? ` (${Math.round(progress * 100)}%)` : "";
      console.log(`[SeedWorldBoot +${Math.round(atMs)}ms] PHASE ${phase}${pct}`);
    }
    this.renderOverlay();
  }

  event(level: "info" | "warn" | "error", tag: string, message: string, detail?: string): void {
    const atMs = nowMs();
    this.events.push({ atMs, level, tag, message, ...(detail ? { detail } : {}) });
    if (this.events.length > MAX_EVENTS) this.events.shift();
    if (level === "error") {
      console.error(`[SeedWorldBoot +${Math.round(atMs)}ms] ${tag}: ${message}`, detail ?? "");
    } else if (level === "warn") {
      console.warn(`[SeedWorldBoot +${Math.round(atMs)}ms] ${tag}: ${message}`, detail ?? "");
    } else if (this.verbose) {
      console.log(`[SeedWorldBoot +${Math.round(atMs)}ms] ${tag}: ${message}`, detail ?? "");
    }
    this.renderOverlay();
  }

  recordSpan(name: string, startMs: number, endMs = nowMs(), detail?: string): void {
    const id = this.nextSpanId++;
    const durationMs = Math.max(0, endMs - startMs);
    this.spans.push({
      id,
      name,
      startMs,
      endMs,
      durationMs,
      status: "ok",
      ...(detail ? { detail } : {})
    });
    this.renderOverlay();
  }

  startSpan(name: string, detail?: string): BootSpanHandle {
    const id = this.nextSpanId++;
    const startMs = nowMs();
    const record: InternalActiveSpan = { id, name, startMs, ...(detail ? { detail } : {}) };
    this.active.set(id, record);
    this.syncCanvasActiveDataset();
    if (this.verbose) {
      console.log(`[SeedWorldBoot +${Math.round(startMs)}ms] START ${name}${detail ? ` (${detail})` : ""}`);
    }
    this.renderOverlay();
    let settled = false;
    const settle = (status: "ok" | "error", error?: unknown, endDetail?: string) => {
      if (settled) return;
      settled = true;
      this.active.delete(id);
      const endMs = nowMs();
      const durationMs = endMs - startMs;
      const entry: BootTraceCompletedSpan = {
        id,
        name,
        startMs,
        endMs,
        durationMs,
        status,
        ...(endDetail ?? detail ? { detail: endDetail ?? detail } : {}),
        ...(status === "error" ? { error: formatError(error) } : {})
      };
      this.spans.push(entry);
      try {
        if (typeof performance !== "undefined" && typeof performance.measure === "function") {
          performance.measure(`seed-boot:${name}`, { start: startMs, end: endMs });
        }
      } catch {
        /* Ignore invalid timing marks on synthetic clocks. */
      }
      this.syncCanvasActiveDataset();
      if (status === "error") {
        console.error(
          `[SeedWorldBoot +${Math.round(endMs)}ms] FAIL ${name} (${Math.round(durationMs)}ms): ${entry.error}`
        );
      } else if (this.verbose || durationMs >= STALL_WARN_MS) {
        console.log(
          `[SeedWorldBoot +${Math.round(endMs)}ms] END ${name} (${Math.round(durationMs)}ms)${entry.detail ? ` [${entry.detail}]` : ""}`
        );
      }
      this.renderOverlay();
    };
    return {
      end: (endDetail?: string) => settle("ok", undefined, endDetail),
      fail: (error: unknown, endDetail?: string) => settle("error", error, endDetail)
    };
  }

  span<T>(name: string, work: () => T, detail?: string): T {
    const handle = this.startSpan(name, detail);
    let result: T;
    try {
      result = work();
    } catch (error) {
      handle.fail(error);
      throw error;
    }
    const maybeThenable = result as unknown as PromiseLike<unknown> | null | undefined;
    if (
      maybeThenable !== null &&
      maybeThenable !== undefined &&
      (typeof maybeThenable === "object" || typeof maybeThenable === "function") &&
      typeof maybeThenable.then === "function"
    ) {
      return maybeThenable.then(
        (value) => {
          handle.end();
          return value;
        },
        (error) => {
          handle.fail(error);
          throw error;
        }
      ) as T;
    }
    handle.end();
    return result;
  }

  finish(): void {
    if (this.status === "ready") return;
    this.status = "ready";
    this.progressValue = 1;
    this.stopTimers();
    const totalMs = Math.round(nowMs());
    if (this.verbose || totalMs >= STALL_WARN_MS) {
      console.log(`[SeedWorldBoot +${totalMs}ms] READY\n${this.formatText()}`);
    }
    if (this.overlayRoot) {
      if (this.autoOpenOverlay || this.overlayOpen) {
        if (this.overlayToggle) {
          this.overlayToggle.hidden = false;
          this.overlayToggle.textContent = `Boot Trace (${(totalMs / 1000).toFixed(1)}s)`;
        }
        this.renderOverlay();
      } else {
        this.overlayRoot.remove();
        this.overlayRoot = undefined;
      }
    }
  }

  fail(error: unknown): void {
    this.status = "error";
    this.errorMessage = formatError(error);
    this.stopTimers();
    this.event("error", "boot", "Seed World startup failed", this.errorMessage);
    console.error(`[SeedWorldBoot] FAILED\n${this.formatText()}`);
    if (!this.overlayRoot && typeof document !== "undefined" && document.body) {
      this.mountOverlay(document.body);
    }
    this.overlayOpen = true;
    if (this.overlayPanel) this.overlayPanel.hidden = false;
    if (this.overlayToggle) {
      this.overlayToggle.hidden = false;
      this.overlayToggle.textContent = "加载失败 Trace";
    }
    this.renderOverlay();
  }

  reset(): void {
    this.dispose(false);
    this.runId = makeRunId();
    this.nextSpanId = 1;
    this.status = "loading";
    this.currentPhase = "entry";
    this.progressValue = 0;
    this.errorMessage = undefined;
    this.meta = {};
    this.shaderAuditProvider = undefined;
    this.diagStatusText = "";
    this.active.clear();
    this.spans.length = 0;
    this.phases.length = 0;
    this.events.length = 0;
    this.overlayOpen = false;
  }

  dispose(preserveOnError = false): void {
    this.stopTimers();
    this.resourceObserver?.disconnect();
    this.resourceObserver = undefined;
    if (preserveOnError && this.status === "error") return;
    this.canvas = undefined;
    this.overlayRoot?.remove();
    this.overlayRoot = undefined;
    this.overlayToggle = undefined;
    this.overlayPanel = undefined;
    this.overlayBody = undefined;
    this.overlayReportBtn = undefined;
  }

  snapshot(): BootTraceSnapshot {
    const now = nowMs();
    const hostWindow = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : undefined;
    const artifactId = typeof hostWindow?.artifactId === "string" ? hostWindow.artifactId : undefined;
    const artifactVersion =
      typeof hostWindow?.artifactVersion === "string" || typeof hostWindow?.artifactVersion === "number"
        ? String(hostWindow.artifactVersion)
        : undefined;
    const active: BootTraceActiveSpan[] = [...this.active.values()].map((item) => ({
      id: item.id,
      name: item.name,
      startMs: item.startMs,
      elapsedMs: now - item.startMs,
      ...(item.detail ? { detail: item.detail } : {})
    }));
    const navigation = readNavigationInfo();
    const mergedDevice: BootTraceDeviceInfo = {
      ...readBasicDeviceInfo(),
      ...(this.meta.device ?? {})
    };
    const meta: BootTraceMeta = {
      ...this.meta,
      ...(Object.keys(mergedDevice).length > 0 ? { device: mergedDevice } : {}),
      ...(navigation ? { navigation } : {})
    };
    const rawAudit = this.shaderAuditProvider?.();
    const shaderSummary = rawAudit ? summarizeSeedWorldShaderAudit(rawAudit) : undefined;
    return {
      runId: this.runId,
      timeOrigin: typeof performance !== "undefined" ? performance.timeOrigin : 0,
      elapsedMs: now,
      url: this.url || (typeof location !== "undefined" ? location.href : ""),
      ...(artifactId ? { artifactId } : {}),
      ...(artifactVersion ? { artifactVersion } : {}),
      status: this.status,
      currentPhase: this.currentPhase,
      progress: this.progressValue,
      ...(this.errorMessage ? { error: this.errorMessage } : {}),
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
      ...(shaderSummary ? { shaderSummary } : {}),
      active,
      spans: [...this.spans],
      phases: [...this.phases],
      events: [...this.events],
      resourceStats: readResourceStats()
    };
  }

  formatText(): string {
    const snap = this.snapshot();
    const lines: string[] = [
      `Seed World Boot Trace | status=${snap.status} | phase="${snap.currentPhase}" (${Math.round(snap.progress * 100)}%) | elapsed=${(snap.elapsedMs / 1000).toFixed(2)}s${this.diagStatusText ? ` | ${this.diagStatusText}` : ""}`,
      ...(snap.meta?.templateId
        ? [`template=${snap.meta.templateId}${snap.meta.templateFamily ? ` (${snap.meta.templateFamily})` : ""}`]
        : []),
      ...(snap.meta?.device?.gpuRenderer
        ? [
            `gpu=${snap.meta.device.gpuRenderer} | parallelCompile=${String(snap.meta.device.parallelShaderCompile ?? "?")} | dpr=${snap.meta.device.devicePixelRatio ?? "?"}`
          ]
        : []),
      ...(snap.artifactId ? [`artifact=${snap.artifactId} v${snap.artifactVersion ?? "?"}`] : []),
      ...(snap.error ? [`ERROR: ${snap.error}`] : [])
    ];
    if (snap.shaderSummary) {
      const s = snap.shaderSummary;
      lines.push(
        "",
        `SHADERS: total=${s.compiledTotal} (${s.totalCompileMs}ms) | startup=${s.compiledInStartupCount} (${s.compiledInStartupMs}ms) | boundReveal=${s.boundInRevealCount} | wastedInReveal=${s.startupWastedInRevealCount} | revealMiss=${s.revealCompileMissCount} | postMiss=${s.postReadyRenderCompileMissCount} | deferred=${s.warmupDeferred}`
      );
      for (const top of s.slowestCompiles.slice(0, 8)) {
        lines.push(
          `  ${top.elapsedMs.toFixed(1).padStart(7, " ")}ms  [${top.phase}/${top.caller}]${top.boundInReveal ? " [REVEAL]" : ""}  ${top.shader}(p${top.pi}:${top.stage})`
        );
      }
    }
    if (snap.active.length > 0) {
      lines.push("", "ACTIVE (in-flight):");
      for (const item of snap.active) {
        lines.push(
          `  * ${item.name}  running=${(item.elapsedMs / 1000).toFixed(2)}s (since +${Math.round(item.startMs)}ms)${item.detail ? `  [${item.detail}]` : ""}`
        );
      }
    }
    if (snap.spans.length > 0) {
      lines.push("", "COMPLETED SPANS:");
      for (const item of snap.spans) {
        const mark = item.status === "error" ? "FAIL" : "OK  ";
        lines.push(
          `  ${mark} ${item.durationMs.toFixed(0).padStart(6, " ")}ms  (+${Math.round(item.startMs)}..${Math.round(item.endMs)}ms)  ${item.name}${item.error ? `  ERROR=${item.error}` : ""}`
        );
      }
    }
    if (snap.events.length > 0) {
      lines.push("", "RECENT EVENTS:");
      for (const item of snap.events.slice(-20)) {
        lines.push(
          `  [${item.level.toUpperCase()} +${Math.round(item.atMs)}ms] ${item.tag}: ${item.message}${item.detail ? ` (${item.detail})` : ""}`
        );
      }
    }
    const cats = Object.entries(snap.resourceStats.byCategory);
    if (cats.length > 0) {
      lines.push(
        "",
        `RESOURCES BY TYPE (count=${snap.resourceStats.count}, net=${snap.resourceStats.networkCount}, cache=${snap.resourceStats.cachedCount}, xfer=${(snap.resourceStats.totalTransferBytes / (1024 * 1024)).toFixed(2)}MiB, decoded=${(snap.resourceStats.totalDecodedBytes / (1024 * 1024)).toFixed(2)}MiB):`
      );
      for (const [cat, stat] of cats) {
        lines.push(
          `  ${cat.padEnd(9, " ")} n=${String(stat.count).padStart(3, " ")}  xfer=${(stat.transferBytes / 1024).toFixed(0).padStart(6, " ")}KB  dec=${(stat.decodedBytes / 1024).toFixed(0).padStart(6, " ")}KB  max=${String(stat.maxDurationMs).padStart(5, " ")}ms`
        );
      }
    }
    if (snap.resourceStats.slowest.length > 0) {
      lines.push("", "SLOWEST RESOURCES:");
      for (const res of snap.resourceStats.slowest.slice(0, 12)) {
        const kb = res.transferSize > 0 ? `${(res.transferSize / 1024).toFixed(0)}KB` : "cached/0B";
        const status = res.responseStatus !== undefined ? ` HTTP ${res.responseStatus}` : "";
        lines.push(`  ${String(res.durationMs).padStart(6, " ")}ms  ${kb.padStart(10, " ")}  [${res.category}${status}]  ${res.name}`);
      }
    }
    return lines.join("\n");
  }

  dump(): BootTraceSnapshot {
    const snap = this.snapshot();
    console.log(this.formatText());
    return snap;
  }

  mountOverlay(host: HTMLElement): void {
    if (typeof document === "undefined" || this.overlayRoot) return;
    const root = document.createElement("div");
    root.id = "seed-world-boot-trace";
    root.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:2147483000;pointer-events:none;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#e6f4f1;max-width:min(94vw,640px);display:flex;flex-direction:column;align-items:flex-end;gap:8px;";

    const panel = document.createElement("div");
    panel.hidden = !this.autoOpenOverlay;
    panel.style.cssText =
      "pointer-events:auto;width:min(94vw,620px);max-height:min(72vh,520px);overflow:auto;background:rgba(8,14,18,0.9);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.16);border-radius:10px;padding:10px 12px;box-shadow:0 8px 28px rgba(0,0,0,0.45);";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.12);";
    const title = document.createElement("strong");
    title.textContent = "Seed World Boot Trace";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;";

    const reportBtn = document.createElement("button");
    reportBtn.type = "button";
    reportBtn.textContent = this.diagStatusText || "上报 Trace";
    reportBtn.style.cssText =
      "cursor:pointer;background:rgba(46,160,120,0.28);color:#d9fff2;border:1px solid rgba(82,216,170,0.4);border-radius:6px;padding:2px 8px;font:inherit;";
    reportBtn.onclick = () => {
      void this.reportToDiag("manual");
    };

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "复制 JSON";
    copyBtn.style.cssText =
      "cursor:pointer;background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:2px 8px;font:inherit;";
    copyBtn.onclick = () => {
      const text = JSON.stringify(this.snapshot(), null, 2);
      void copyText(text).then(
        () => {
          copyBtn.textContent = "已复制";
          setTimeout(() => {
            copyBtn.textContent = "复制 JSON";
          }, 1500);
        },
        () => {
          copyBtn.textContent = "复制失败(见Console)";
          this.dump();
        }
      );
    };

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "收起";
    closeBtn.style.cssText = copyBtn.style.cssText;
    closeBtn.onclick = () => {
      this.overlayOpen = false;
      panel.hidden = true;
    };

    actions.append(reportBtn, copyBtn, closeBtn);
    header.append(title, actions);

    const body = document.createElement("pre");
    body.style.cssText = "margin:0;white-space:pre-wrap;word-break:break-word;font:11px/1.45 inherit;color:#d6ebe6;";
    panel.append(header, body);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "加载 Trace";
    toggle.hidden = !this.autoOpenOverlay && !this.verbose;
    toggle.style.cssText =
      "pointer-events:auto;cursor:pointer;background:rgba(10,18,24,0.88);color:#d9f3ec;border:1px solid rgba(255,255,255,0.22);border-radius:999px;padding:5px 12px;font:12px/1.2 -apple-system,BlinkMacSystemFont,sans-serif;";
    toggle.onclick = () => {
      this.overlayOpen = !this.overlayOpen;
      panel.hidden = !this.overlayOpen;
      this.renderOverlay();
    };

    root.append(panel, toggle);
    this.overlayReportBtn = reportBtn;
    host.append(root);
    this.overlayRoot = root;
    this.overlayToggle = toggle;
    this.overlayPanel = panel;
    this.overlayBody = body;
    this.overlayOpen = this.autoOpenOverlay;

    if (!this.autoOpenOverlay && this.status === "loading") {
      this.overlayRevealTimer = setTimeout(() => {
        if (this.status === "loading" && this.overlayToggle) {
          this.overlayToggle.hidden = false;
        }
      }, OVERLAY_REVEAL_MS);
    }
    this.overlayRefreshTimer = setInterval(() => {
      if (this.status === "loading" && this.overlayOpen) this.renderOverlay();
    }, 500);
    this.renderOverlay();
  }

  private renderOverlay(): void {
    if (!this.overlayBody || !this.overlayOpen) return;
    this.overlayBody.textContent = this.formatText();
  }

  private syncCanvasActiveDataset(): void {
    if (!this.canvas) return;
    const now = nowMs();
    const list = [...this.active.values()].map((item) => ({
      name: item.name,
      startMs: Math.round(item.startMs),
      elapsedMs: Math.round(now - item.startMs),
      ...(item.detail ? { detail: item.detail } : {})
    }));
    this.canvas.dataset.bootActiveSpans = JSON.stringify(list);
  }

  private ensureWatchdog(): void {
    if (this.watchdogTimer !== undefined || typeof setInterval === "undefined") return;
    this.watchdogTimer = setInterval(() => {
      if (this.status !== "loading") {
        this.stopTimers();
        return;
      }
      const now = nowMs();
      this.syncCanvasActiveDataset();
      for (const item of this.active.values()) {
        const elapsed = now - item.startMs;
        if (elapsed >= STALL_WARN_MS && (item.lastWarnAtMs === undefined || now - item.lastWarnAtMs >= STALL_REPEAT_MS)) {
          item.lastWarnAtMs = now;
          const detail = `phase="${this.currentPhase}" (${Math.round(this.progressValue * 100)}%), running=${(elapsed / 1000).toFixed(1)}s`;
          this.event("warn", "stall", `Step still in-flight: ${item.name}`, detail);
        }
      }
    }, 2_000);
  }

  private ensureResourceObserver(): void {
    if (this.resourceObserver || typeof PerformanceObserver === "undefined") return;
    try {
      const observer = new PerformanceObserver((list) => {
        if (this.status !== "loading") return;
        for (const entry of list.getEntries() as (PerformanceResourceTiming & { responseStatus?: number })[]) {
          const status = entry.responseStatus;
          if ((typeof status === "number" && status >= 400) || entry.duration >= 5_000) {
            this.event(
              typeof status === "number" && status >= 400 ? "error" : "warn",
              "resource",
              `${shortResourceName(entry.name)} (${Math.round(entry.duration)}ms${status ? ` HTTP ${status}` : ""})`
            );
          }
        }
      });
      observer.observe({ type: "resource", buffered: true });
      this.resourceObserver = observer;
    } catch {
      /* Unsupported browser/runtime PerformanceObserver options. */
    }
  }

  private stopTimers(): void {
    if (this.watchdogTimer !== undefined) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = undefined;
    }
    if (this.overlayRevealTimer !== undefined) {
      clearTimeout(this.overlayRevealTimer);
      this.overlayRevealTimer = undefined;
    }
    if (this.overlayRefreshTimer !== undefined) {
      clearInterval(this.overlayRefreshTimer);
      this.overlayRefreshTimer = undefined;
    }
  }
}

async function copyText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* Sandboxed iframes often deny clipboard-write; fall through to execCommand. */
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Copy failed");
}

declare global {
  interface Window {
    __seedWorldBootTrace?: SeedWorldBootTraceController;
  }
}

const singleton =
  (typeof window !== "undefined" && window.__seedWorldBootTrace) || new SeedWorldBootTraceController();
if (typeof window !== "undefined") {
  window.__seedWorldBootTrace = singleton;
}

export const seedWorldBootTrace = singleton;
