export const WATER_GPU_TIMER_SOURCE = "EXT_disjoint_timer_query_webgl2" as const;
export const WATER_GPU_TIMER_PHASES = ["off-before", "on", "off-after"] as const;

export type WaterGpuTimerScope = "frame-envelope" | "planar-pass";
export type WaterGpuTimerPhase = (typeof WATER_GPU_TIMER_PHASES)[number];

export type WaterGpuTimerUnavailableReason =
  | "gpu-timer-not-integrated"
  | "extension-unavailable"
  | "zero-query-counter-bits"
  | "context-lost"
  | "timer-destroyed"
  | "query-create-failed"
  | "query-result-invalid"
  | "query-results-pending"
  | "timer-query-busy"
  | "insufficient-phase-samples";

export interface WaterGpuTimerCapabilityAvailable {
  readonly status: "available";
  readonly source: typeof WATER_GPU_TIMER_SOURCE;
  readonly queryCounterBits: number;
}

export interface WaterGpuTimerCapabilityUnavailable {
  readonly status: "unavailable";
  readonly reason: Extract<
    WaterGpuTimerUnavailableReason,
    "extension-unavailable" | "zero-query-counter-bits" | "context-lost" | "timer-destroyed"
  >;
}

export type WaterGpuTimerCapability = WaterGpuTimerCapabilityAvailable | WaterGpuTimerCapabilityUnavailable;

export interface WaterGpuTimerPhaseMetrics {
  readonly sampleCount: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly totalMs: number;
}

interface WaterGpuTimerCaptureValidBase {
  readonly status: "valid";
  readonly source: typeof WATER_GPU_TIMER_SOURCE;
  readonly sampleCount: number;
  readonly droppedSampleCount: number;
  readonly pendingQueryCount: 0;
}

export interface WaterGpuTimerFrameEnvelopeCaptureValid extends WaterGpuTimerCaptureValidBase {
  readonly scope: "frame-envelope";
  readonly phases: Readonly<Record<WaterGpuTimerPhase, WaterGpuTimerPhaseMetrics>>;
  readonly baselineGpuP95Ms: number;
  /** Difference of P95 values; this is an estimate, not a percentile of per-frame deltas. */
  readonly incrementalGpuP95EstimateMs: number;
}

export interface WaterGpuTimerPlanarCaptureValid extends WaterGpuTimerCaptureValidBase {
  readonly scope: "planar-pass";
  readonly planarP50Ms: number;
  readonly planarP95Ms: number;
  readonly planarMaxMs: number;
  readonly planarTotalMs: number;
}

export type WaterGpuTimerCaptureValid = WaterGpuTimerFrameEnvelopeCaptureValid | WaterGpuTimerPlanarCaptureValid;

export interface WaterGpuTimerCaptureUnavailable {
  readonly status: "unavailable";
  readonly source?: typeof WATER_GPU_TIMER_SOURCE;
  readonly scope?: WaterGpuTimerScope;
  readonly reason: WaterGpuTimerUnavailableReason;
  readonly sampleCount?: number;
  readonly droppedSampleCount?: number;
  readonly pendingQueryCount?: number;
}

export interface WaterGpuTimerCaptureDisjoint {
  readonly status: "disjoint";
  readonly source: typeof WATER_GPU_TIMER_SOURCE;
  readonly scope: WaterGpuTimerScope;
  readonly reason: "gpu-disjoint";
  readonly discardedSampleCount: number;
  readonly droppedSampleCount: number;
}

export type WaterGpuTimerCaptureResult =
  | WaterGpuTimerCaptureValid
  | WaterGpuTimerCaptureUnavailable
  | WaterGpuTimerCaptureDisjoint;

export interface WaterGpuTimer {
  readonly capability: WaterGpuTimerCapability;
  readonly pendingQueryCount: number;
  beginCapture(scope: WaterGpuTimerScope): void;
  beginPhaseSamples(phase: WaterGpuTimerPhase): void;
  endPhaseSamples(phase: WaterGpuTimerPhase): void;
  beginFrameEnvelopeSample(): WebGLQuery | undefined;
  endFrameEnvelopeSample(query: WebGLQuery): void;
  beginPlanarSample(): WebGLQuery | undefined;
  endPlanarSample(query: WebGLQuery): void;
  poll(): void;
  finishCapture(): WaterGpuTimerCaptureResult;
  abortCapture(): void;
  destroy(): void;
}

interface DisjointTimerQueryExtension {
  readonly QUERY_COUNTER_BITS_EXT: number;
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

interface ActiveGpuQuery {
  readonly query: WebGLQuery;
  readonly phase: WaterGpuTimerPhase;
  readonly scope: WaterGpuTimerScope;
}

export interface WebGL2WaterGpuTimerOptions {
  readonly maximumPendingQueryCount?: number;
  readonly onPlanarSampleResolved?: (milliseconds: number) => void;
}

const DEFAULT_MAXIMUM_PENDING_QUERY_COUNT = 64;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;

function createEmptyPhaseSamples(): Record<WaterGpuTimerPhase, number[]> {
  return { "off-before": [], on: [], "off-after": [] };
}

function nearestRankPercentile(values: readonly number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function createPhaseMetrics(values: readonly number[]): WaterGpuTimerPhaseMetrics {
  return Object.freeze({
    sampleCount: values.length,
    p50Ms: nearestRankPercentile(values, 0.5),
    p95Ms: nearestRankPercentile(values, 0.95),
    maxMs: Math.max(...values),
    totalMs: values.reduce((total, value) => total + value, 0)
  });
}

/**
 * Non-blocking WebGL2 GPU timer used only by explicit performance captures.
 * Query results are polled on later animation frames; this adapter never waits
 * synchronously for GPU completion and never substitutes CPU submission time.
 */
export class WebGL2WaterGpuTimer implements WaterGpuTimer {
  private _extension: DisjointTimerQueryExtension | null = null;
  private _queryCounterBits = 0;
  private readonly _maximumPendingQueryCount: number;
  private readonly _onPlanarSampleResolved?: (milliseconds: number) => void;
  private readonly _pendingQueries: ActiveGpuQuery[] = [];
  private readonly _availableQueries: WebGLQuery[] = [];
  private readonly _phaseSamples = createEmptyPhaseSamples();
  private _activeQuery?: ActiveGpuQuery;
  private _captureScope?: WaterGpuTimerScope;
  private _samplingPhase?: WaterGpuTimerPhase;
  private _captureRequested = false;
  private _captureActive = false;
  private _disjoint = false;
  private _contextLostDuringCapture = false;
  private _discardedSampleCount = 0;
  private _droppedSampleCount = 0;
  private _failureReason?: Exclude<
    WaterGpuTimerUnavailableReason,
    | "gpu-timer-not-integrated"
    | "extension-unavailable"
    | "zero-query-counter-bits"
    | "context-lost"
    | "timer-destroyed"
  >;
  private _destroyed = false;

  constructor(
    private readonly _gl: WebGL2RenderingContext,
    options: WebGL2WaterGpuTimerOptions = {}
  ) {
    const requestedCapacity = options.maximumPendingQueryCount ?? DEFAULT_MAXIMUM_PENDING_QUERY_COUNT;
    this._maximumPendingQueryCount = Number.isFinite(requestedCapacity)
      ? Math.max(1, Math.floor(requestedCapacity))
      : DEFAULT_MAXIMUM_PENDING_QUERY_COUNT;
    this._onPlanarSampleResolved = options.onPlanarSampleResolved;
    this._refreshExtension();
  }

  get capability(): WaterGpuTimerCapability {
    if (this._destroyed) return Object.freeze({ status: "unavailable", reason: "timer-destroyed" });
    if (this._gl.isContextLost()) return Object.freeze({ status: "unavailable", reason: "context-lost" });
    if (!this._extension) this._refreshExtension();
    if (!this._extension) return Object.freeze({ status: "unavailable", reason: "extension-unavailable" });
    if (this._queryCounterBits <= 0) {
      return Object.freeze({ status: "unavailable", reason: "zero-query-counter-bits" });
    }
    return Object.freeze({
      status: "available",
      source: WATER_GPU_TIMER_SOURCE,
      queryCounterBits: this._queryCounterBits
    });
  }

  get pendingQueryCount(): number {
    return this._pendingQueries.length + (this._activeQuery === undefined ? 0 : 1);
  }

  beginCapture(scope: WaterGpuTimerScope): void {
    this.abortCapture();
    this._captureRequested = true;
    this._captureScope = scope;
    this._disjoint = false;
    this._contextLostDuringCapture = false;
    this._discardedSampleCount = 0;
    this._droppedSampleCount = 0;
    this._failureReason = undefined;
    this._resetPhaseSamples();
    this._captureActive = this.capability.status === "available";
  }

  beginPhaseSamples(phase: WaterGpuTimerPhase): void {
    if (!this._captureRequested) return;
    this._samplingPhase = phase;
  }

  endPhaseSamples(phase: WaterGpuTimerPhase): void {
    if (this._samplingPhase === phase) this._samplingPhase = undefined;
  }

  beginFrameEnvelopeSample(): WebGLQuery | undefined {
    return this._beginSample("frame-envelope");
  }

  endFrameEnvelopeSample(query: WebGLQuery): void {
    this._endSample(query, "frame-envelope");
  }

  beginPlanarSample(): WebGLQuery | undefined {
    return this._beginSample("planar-pass");
  }

  endPlanarSample(query: WebGLQuery): void {
    this._endSample(query, "planar-pass");
  }

  poll(): void {
    if (!this._captureRequested || !this._extension || this._destroyed) return;
    if (this._disjoint || this._contextLostDuringCapture) return;
    if (this._gl.isContextLost()) {
      this._markContextLost();
      return;
    }
    if (Boolean(this._gl.getParameter(this._extension.GPU_DISJOINT_EXT))) {
      this._markDisjoint();
      return;
    }

    let unresolvedCount = 0;
    for (let index = 0; index < this._pendingQueries.length; index++) {
      const pending = this._pendingQueries[index];
      const available = Boolean(this._gl.getQueryParameter(pending.query, this._gl.QUERY_RESULT_AVAILABLE));
      if (!available) {
        this._pendingQueries[unresolvedCount++] = pending;
        continue;
      }
      const nanoseconds: unknown = this._gl.getQueryParameter(pending.query, this._gl.QUERY_RESULT);
      if (typeof nanoseconds !== "number" || !Number.isFinite(nanoseconds) || nanoseconds < 0) {
        this._failureReason = "query-result-invalid";
        this._captureActive = false;
        this._deleteQuery(pending.query);
        continue;
      }
      const milliseconds = nanoseconds / NANOSECONDS_PER_MILLISECOND;
      this._phaseSamples[pending.phase].push(milliseconds);
      if (pending.scope === "planar-pass") this._onPlanarSampleResolved?.(milliseconds);
      this._availableQueries.push(pending.query);
    }
    this._pendingQueries.length = unresolvedCount;
  }

  finishCapture(): WaterGpuTimerCaptureResult {
    this.poll();
    this._captureRequested = false;
    this._captureActive = false;
    this._samplingPhase = undefined;

    const scope = this._captureScope;
    this._captureScope = undefined;
    if (this._activeQuery) this._endActiveQueryForCleanup();
    if (this._destroyed) return Object.freeze({ status: "unavailable", reason: "timer-destroyed" });
    if (this._contextLostDuringCapture || this._gl.isContextLost()) {
      this._clearQueriesWithoutDelete();
      return Object.freeze({
        status: "unavailable",
        source: WATER_GPU_TIMER_SOURCE,
        scope,
        reason: "context-lost",
        sampleCount: this._sampleCount(),
        droppedSampleCount: this._droppedSampleCount,
        pendingQueryCount: 0
      });
    }
    if (!this._extension) return Object.freeze({ status: "unavailable", scope, reason: "extension-unavailable" });
    if (this._queryCounterBits <= 0) {
      return Object.freeze({ status: "unavailable", scope, reason: "zero-query-counter-bits" });
    }
    if (!scope) return Object.freeze({ status: "unavailable", reason: "gpu-timer-not-integrated" });
    if (this._disjoint) {
      return Object.freeze({
        status: "disjoint",
        source: WATER_GPU_TIMER_SOURCE,
        scope,
        reason: "gpu-disjoint",
        discardedSampleCount: this._discardedSampleCount,
        droppedSampleCount: this._droppedSampleCount
      });
    }
    if (this._failureReason) {
      this._deletePendingQueries();
      return Object.freeze({
        status: "unavailable",
        source: WATER_GPU_TIMER_SOURCE,
        scope,
        reason: this._failureReason,
        sampleCount: this._sampleCount(),
        droppedSampleCount: this._droppedSampleCount,
        pendingQueryCount: 0
      });
    }
    if (this._pendingQueries.length > 0) {
      const pendingQueryCount = this._pendingQueries.length;
      this._deletePendingQueries();
      return Object.freeze({
        status: "unavailable",
        source: WATER_GPU_TIMER_SOURCE,
        scope,
        reason: "query-results-pending",
        sampleCount: this._sampleCount(),
        droppedSampleCount: this._droppedSampleCount,
        pendingQueryCount
      });
    }
    return scope === "frame-envelope" ? this._finishFrameEnvelopeCapture() : this._finishPlanarCapture();
  }

  abortCapture(): void {
    this._endActiveQueryForCleanup();
    if (this._gl.isContextLost()) this._clearQueriesWithoutDelete();
    else this._deletePendingQueries();
    this._captureRequested = false;
    this._captureActive = false;
    this._captureScope = undefined;
    this._samplingPhase = undefined;
    this._resetPhaseSamples();
    this._disjoint = false;
    this._contextLostDuringCapture = false;
    this._discardedSampleCount = 0;
    this._droppedSampleCount = 0;
    this._failureReason = undefined;
  }

  destroy(): void {
    if (this._destroyed) return;
    this.abortCapture();
    if (!this._gl.isContextLost()) {
      for (const query of this._availableQueries) this._deleteQuery(query);
    }
    this._availableQueries.length = 0;
    this._destroyed = true;
  }

  private _beginSample(scope: WaterGpuTimerScope): WebGLQuery | undefined {
    if (
      !this._captureRequested ||
      !this._captureActive ||
      this._captureScope !== scope ||
      !this._samplingPhase ||
      !this._extension ||
      this._destroyed
    ) {
      return undefined;
    }
    this.poll();
    if (!this._captureActive || this._failureReason || this._disjoint || this._contextLostDuringCapture) {
      return undefined;
    }
    if (this._activeQuery || this._pendingQueries.length >= this._maximumPendingQueryCount) {
      this._droppedSampleCount++;
      return undefined;
    }
    if (this._gl.getQuery(this._extension.TIME_ELAPSED_EXT, this._gl.CURRENT_QUERY) !== null) {
      this._droppedSampleCount++;
      return undefined;
    }
    const query = this._availableQueries.pop() ?? this._gl.createQuery();
    if (!query) {
      this._failureReason = "query-create-failed";
      this._captureActive = false;
      return undefined;
    }
    this._gl.beginQuery(this._extension.TIME_ELAPSED_EXT, query);
    this._activeQuery = { query, phase: this._samplingPhase, scope };
    return query;
  }

  private _endSample(query: WebGLQuery, scope: WaterGpuTimerScope): void {
    const active = this._activeQuery;
    if (!this._extension || !active || active.query !== query || active.scope !== scope) return;
    this._gl.endQuery(this._extension.TIME_ELAPSED_EXT);
    this._activeQuery = undefined;
    this._pendingQueries.push(active);
  }

  private _finishFrameEnvelopeCapture(): WaterGpuTimerCaptureResult {
    const offBefore = this._phaseSamples["off-before"];
    const on = this._phaseSamples.on;
    const offAfter = this._phaseSamples["off-after"];
    if (offBefore.length === 0 || on.length === 0 || offAfter.length === 0) {
      return this._createInsufficientSamplesResult("frame-envelope");
    }
    const phases = Object.freeze({
      "off-before": createPhaseMetrics(offBefore),
      on: createPhaseMetrics(on),
      "off-after": createPhaseMetrics(offAfter)
    });
    const baselineGpuP95Ms = Math.max(phases["off-before"].p95Ms, phases["off-after"].p95Ms);
    return Object.freeze({
      status: "valid",
      source: WATER_GPU_TIMER_SOURCE,
      scope: "frame-envelope",
      sampleCount: this._sampleCount(),
      phases,
      baselineGpuP95Ms,
      incrementalGpuP95EstimateMs: Math.max(0, phases.on.p95Ms - baselineGpuP95Ms),
      droppedSampleCount: this._droppedSampleCount,
      pendingQueryCount: 0
    });
  }

  private _finishPlanarCapture(): WaterGpuTimerCaptureResult {
    const on = this._phaseSamples.on;
    if (on.length === 0) return this._createInsufficientSamplesResult("planar-pass");
    const metrics = createPhaseMetrics(on);
    return Object.freeze({
      status: "valid",
      source: WATER_GPU_TIMER_SOURCE,
      scope: "planar-pass",
      sampleCount: on.length,
      planarP50Ms: metrics.p50Ms,
      planarP95Ms: metrics.p95Ms,
      planarMaxMs: metrics.maxMs,
      planarTotalMs: metrics.totalMs,
      droppedSampleCount: this._droppedSampleCount,
      pendingQueryCount: 0
    });
  }

  private _createInsufficientSamplesResult(scope: WaterGpuTimerScope): WaterGpuTimerCaptureUnavailable {
    return Object.freeze({
      status: "unavailable",
      source: WATER_GPU_TIMER_SOURCE,
      scope,
      reason: this._droppedSampleCount > 0 ? "timer-query-busy" : "insufficient-phase-samples",
      sampleCount: this._sampleCount(),
      droppedSampleCount: this._droppedSampleCount,
      pendingQueryCount: 0
    });
  }

  private _markDisjoint(): void {
    this._disjoint = true;
    this._captureActive = false;
    this._discardedSampleCount = this._sampleCount() + this.pendingQueryCount;
    this._resetPhaseSamples();
    this._endActiveQueryForCleanup();
    this._deletePendingQueries();
  }

  private _markContextLost(): void {
    this._contextLostDuringCapture = true;
    this._captureActive = false;
    this._clearQueriesWithoutDelete();
    this._extension = null;
    this._queryCounterBits = 0;
  }

  private _endActiveQueryForCleanup(): void {
    const active = this._activeQuery;
    if (!active) return;
    if (this._extension && !this._gl.isContextLost()) {
      this._gl.endQuery(this._extension.TIME_ELAPSED_EXT);
      this._deleteQuery(active.query);
    }
    this._activeQuery = undefined;
  }

  private _deletePendingQueries(): void {
    for (const pending of this._pendingQueries) this._deleteQuery(pending.query);
    this._pendingQueries.length = 0;
  }

  private _clearQueriesWithoutDelete(): void {
    this._activeQuery = undefined;
    this._pendingQueries.length = 0;
    this._availableQueries.length = 0;
  }

  private _deleteQuery(query: WebGLQuery): void {
    this._gl.deleteQuery(query);
  }

  private _sampleCount(): number {
    return WATER_GPU_TIMER_PHASES.reduce((total, phase) => total + this._phaseSamples[phase].length, 0);
  }

  private _resetPhaseSamples(): void {
    for (const phase of WATER_GPU_TIMER_PHASES) this._phaseSamples[phase].length = 0;
  }

  private _refreshExtension(): void {
    if (this._destroyed || this._gl.isContextLost()) return;
    const extension = this._gl.getExtension(WATER_GPU_TIMER_SOURCE) as DisjointTimerQueryExtension | null;
    this._extension = extension;
    if (!extension) {
      this._queryCounterBits = 0;
      return;
    }
    const queryCounterBits: unknown = this._gl.getQuery(extension.TIME_ELAPSED_EXT, extension.QUERY_COUNTER_BITS_EXT);
    this._queryCounterBits =
      typeof queryCounterBits === "number" && Number.isFinite(queryCounterBits) ? Math.max(0, queryCounterBits) : 0;
  }
}
