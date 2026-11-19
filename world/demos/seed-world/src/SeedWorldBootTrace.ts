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
  readonly initiatorType: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly transferSize: number;
  readonly decodedBodySize: number;
  readonly responseStatus?: number;
}

export interface BootTraceSnapshot {
  readonly timeOrigin: number;
  readonly elapsedMs: number;
  readonly url: string;
  readonly artifactId?: string;
  readonly artifactVersion?: string;
  readonly status: "loading" | "ready" | "error";
  readonly currentPhase: string;
  readonly progress: number;
  readonly error?: string;
  readonly active: readonly BootTraceActiveSpan[];
  readonly spans: readonly BootTraceCompletedSpan[];
  readonly phases: readonly BootTracePhaseEntry[];
  readonly events: readonly BootTraceEvent[];
  readonly resourceStats: {
    readonly count: number;
    readonly totalTransferBytes: number;
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

function readResourceStats(): BootTraceSnapshot["resourceStats"] {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return { count: 0, totalTransferBytes: 0, slowest: [] };
  }
  const entries = performance.getEntriesByType("resource") as (PerformanceResourceTiming & { responseStatus?: number })[];
  let totalTransferBytes = 0;
  const summaries: BootTraceResourceSummary[] = [];
  for (const entry of entries) {
    const transferSize = typeof entry.transferSize === "number" ? entry.transferSize : 0;
    totalTransferBytes += transferSize;
    summaries.push({
      name: shortResourceName(entry.name),
      initiatorType: entry.initiatorType || "unknown",
      startMs: Math.round(entry.startTime),
      durationMs: Math.round(entry.duration),
      transferSize,
      decodedBodySize: typeof entry.decodedBodySize === "number" ? entry.decodedBodySize : 0,
      ...(typeof entry.responseStatus === "number" ? { responseStatus: entry.responseStatus } : {})
    });
  }
  summaries.sort((a, b) => b.durationMs - a.durationMs);
  return {
    count: entries.length,
    totalTransferBytes,
    slowest: summaries.slice(0, 20)
  };
}

class SeedWorldBootTraceController {
  private nextSpanId = 1;
  private status: "loading" | "ready" | "error" = "loading";
  private currentPhase = "entry";
  private progressValue = 0;
  private errorMessage: string | undefined;
  private url = "";
  private verbose = false;
  private autoOpenOverlay = false;
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
  private overlayOpen = false;
  private resourceObserver: PerformanceObserver | undefined;

  configure(options: { url: string; verbose?: boolean; autoOpenOverlay?: boolean }): void {
    this.url = options.url;
    this.verbose = Boolean(options.verbose);
    this.autoOpenOverlay = Boolean(options.autoOpenOverlay);
    if (typeof performance !== "undefined" && typeof performance.setResourceTimingBufferSize === "function") {
      try {
        performance.setResourceTimingBufferSize(2000);
      } catch {
        /* Ignore unsupported environments. */
      }
    }
    this.ensureWatchdog();
    this.ensureResourceObserver();
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

  dispose(preserveOnError = false): void {
    this.stopTimers();
    this.resourceObserver?.disconnect();
    this.resourceObserver = undefined;
    if (preserveOnError && this.status === "error") return;
    this.overlayRoot?.remove();
    this.overlayRoot = undefined;
    this.overlayToggle = undefined;
    this.overlayPanel = undefined;
    this.overlayBody = undefined;
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
    return {
      timeOrigin: typeof performance !== "undefined" ? performance.timeOrigin : 0,
      elapsedMs: now,
      url: this.url || (typeof location !== "undefined" ? location.href : ""),
      ...(artifactId ? { artifactId } : {}),
      ...(artifactVersion ? { artifactVersion } : {}),
      status: this.status,
      currentPhase: this.currentPhase,
      progress: this.progressValue,
      ...(this.errorMessage ? { error: this.errorMessage } : {}),
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
      `Seed World Boot Trace | status=${snap.status} | phase="${snap.currentPhase}" (${Math.round(snap.progress * 100)}%) | elapsed=${(snap.elapsedMs / 1000).toFixed(2)}s`,
      ...(snap.artifactId ? [`artifact=${snap.artifactId} v${snap.artifactVersion ?? "?"}`] : []),
      ...(snap.error ? [`ERROR: ${snap.error}`] : [])
    ];
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
    if (snap.resourceStats.slowest.length > 0) {
      lines.push(
        "",
        `SLOWEST RESOURCES (total=${snap.resourceStats.count}, transfer=${(snap.resourceStats.totalTransferBytes / (1024 * 1024)).toFixed(2)} MiB):`
      );
      for (const res of snap.resourceStats.slowest.slice(0, 12)) {
        const kb = res.transferSize > 0 ? `${(res.transferSize / 1024).toFixed(0)}KB` : "cached/0B";
        const status = res.responseStatus !== undefined ? ` HTTP ${res.responseStatus}` : "";
        lines.push(`  ${String(res.durationMs).padStart(6, " ")}ms  ${kb.padStart(10, " ")}  [${res.initiatorType}${status}]  ${res.name}`);
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
    actions.style.cssText = "display:flex;gap:6px;";

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

    actions.append(copyBtn, closeBtn);
    header.append(title, actions);

    const body = document.createElement("pre");
    body.style.cssText = "margin:0;white-space:pre-wrap;word-break:break-word;font:11px/1.45 inherit;color:#d6ebe6;";
    panel.append(header, body);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "加载 Trace";
    toggle.hidden = !this.autoOpenOverlay && !this.verbose;
    toggle.style.cssText =
      "pointer-events:auto;cursor:pointer;background:rgba(10,18,24,0.82);color:#d9f3ec;border:1px solid rgba(255,255,255,0.22);border-radius:999px;padding:5px 12px;font:12px/1.2 -apple-system,BlinkMacSystemFont,sans-serif;backdrop-filter:blur(8px);";
    toggle.onclick = () => {
      this.overlayOpen = !this.overlayOpen;
      panel.hidden = !this.overlayOpen;
      this.renderOverlay();
    };

    root.append(panel, toggle);
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
