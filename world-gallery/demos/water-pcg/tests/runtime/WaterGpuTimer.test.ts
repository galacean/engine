import { describe, expect, it } from "vitest";
import { WATER_GPU_TIMER_SOURCE, WebGL2WaterGpuTimer } from "../../runtime/optics/WaterGpuTimer";

interface FakeQueryState {
  available: boolean;
  nanoseconds: number;
}

class FakeWebGL2TimerContext {
  readonly CURRENT_QUERY = 0x8865;
  readonly QUERY_RESULT = 0x8866;
  readonly QUERY_RESULT_AVAILABLE = 0x8867;
  readonly extension = {
    QUERY_COUNTER_BITS_EXT: 0x8864,
    TIME_ELAPSED_EXT: 0x88bf,
    GPU_DISJOINT_EXT: 0x8fbb
  };
  extensionAvailable = true;
  queryCounterBits = 64;
  contextLost = false;
  disjoint = false;
  externalCurrentQuery: WebGLQuery | null = null;
  resultReadCount = 0;
  readonly createdQueries: WebGLQuery[] = [];
  readonly deletedQueries: WebGLQuery[] = [];
  private readonly _states = new Map<WebGLQuery, FakeQueryState>();
  private _currentQuery: WebGLQuery | null = null;

  getExtension(name: string): object | null {
    return name === WATER_GPU_TIMER_SOURCE && this.extensionAvailable ? this.extension : null;
  }

  getQuery(_target: number, parameter: number): WebGLQuery | number | null {
    if (parameter === this.extension.QUERY_COUNTER_BITS_EXT) return this.queryCounterBits;
    return this.externalCurrentQuery ?? this._currentQuery;
  }

  createQuery(): WebGLQuery {
    const query = {} as WebGLQuery;
    this.createdQueries.push(query);
    this._states.set(query, { available: false, nanoseconds: 0 });
    return query;
  }

  beginQuery(_target: number, query: WebGLQuery): void {
    this._currentQuery = query;
  }

  endQuery(): void {
    this._currentQuery = null;
  }

  getQueryParameter(query: WebGLQuery, parameter: number): boolean | number {
    const state = this._states.get(query);
    if (!state) throw new Error("Unknown fake query.");
    if (parameter === this.QUERY_RESULT_AVAILABLE) return state.available;
    this.resultReadCount++;
    return state.nanoseconds;
  }

  getParameter(parameter: number): boolean {
    return parameter === this.extension.GPU_DISJOINT_EXT && this.disjoint;
  }

  deleteQuery(query: WebGLQuery): void {
    this.deletedQueries.push(query);
    this._states.delete(query);
  }

  isContextLost(): boolean {
    return this.contextLost;
  }

  resolve(query: WebGLQuery, nanoseconds: number): void {
    const state = this._states.get(query);
    if (!state) throw new Error("Unknown fake query.");
    state.available = true;
    state.nanoseconds = nanoseconds;
  }

  asWebGL2(): WebGL2RenderingContext {
    return this as unknown as WebGL2RenderingContext;
  }
}

function captureOneFrameEnvelopeSample(
  timer: WebGL2WaterGpuTimer,
  context: FakeWebGL2TimerContext,
  phase: "off-before" | "on" | "off-after",
  nanoseconds: number
): void {
  timer.beginPhaseSamples(phase);
  const query = timer.beginFrameEnvelopeSample();
  if (!query) throw new Error(`Expected a ${phase} frame-envelope query.`);
  timer.endFrameEnvelopeSample(query);
  context.resolve(query, nanoseconds);
  timer.poll();
  timer.endPhaseSamples(phase);
}

describe("WebGL2WaterGpuTimer", () => {
  it("reports a non-blocking frame-envelope incremental P95 estimate", () => {
    const context = new FakeWebGL2TimerContext();
    const timer = new WebGL2WaterGpuTimer(context.asWebGL2());

    expect(timer.capability).toEqual({
      status: "available",
      source: WATER_GPU_TIMER_SOURCE,
      queryCounterBits: 64
    });
    timer.beginCapture("frame-envelope");
    captureOneFrameEnvelopeSample(timer, context, "off-before", 1_000_000);
    captureOneFrameEnvelopeSample(timer, context, "on", 3_200_000);
    captureOneFrameEnvelopeSample(timer, context, "off-after", 1_200_000);

    expect(timer.finishCapture()).toEqual({
      status: "valid",
      source: WATER_GPU_TIMER_SOURCE,
      scope: "frame-envelope",
      sampleCount: 3,
      phases: {
        "off-before": { sampleCount: 1, p50Ms: 1, p95Ms: 1, maxMs: 1, totalMs: 1 },
        on: { sampleCount: 1, p50Ms: 3.2, p95Ms: 3.2, maxMs: 3.2, totalMs: 3.2 },
        "off-after": { sampleCount: 1, p50Ms: 1.2, p95Ms: 1.2, maxMs: 1.2, totalMs: 1.2 }
      },
      baselineGpuP95Ms: 1.2,
      incrementalGpuP95EstimateMs: 2,
      droppedSampleCount: 0,
      pendingQueryCount: 0
    });
  });

  it("keeps the Planar pass as a separate non-nested diagnostic", () => {
    const context = new FakeWebGL2TimerContext();
    const resolvedSamples: number[] = [];
    const timer = new WebGL2WaterGpuTimer(context.asWebGL2(), {
      onPlanarSampleResolved: (milliseconds) => resolvedSamples.push(milliseconds)
    });
    timer.beginCapture("planar-pass");
    timer.beginPhaseSamples("on");
    for (const nanoseconds of [400_000, 900_000]) {
      const query = timer.beginPlanarSample();
      if (!query) throw new Error("Expected a Planar query.");
      timer.endPlanarSample(query);
      context.resolve(query, nanoseconds);
      timer.poll();
    }
    timer.endPhaseSamples("on");

    expect(timer.finishCapture()).toEqual({
      status: "valid",
      source: WATER_GPU_TIMER_SOURCE,
      scope: "planar-pass",
      sampleCount: 2,
      planarP50Ms: 0.4,
      planarP95Ms: 0.9,
      planarMaxMs: 0.9,
      planarTotalMs: 1.3,
      droppedSampleCount: 0,
      pendingQueryCount: 0
    });
    expect(resolvedSamples).toEqual([0.4, 0.9]);
  });

  it("reports unsupported extensions and zero timer bits without fabricating zero milliseconds", () => {
    const missingContext = new FakeWebGL2TimerContext();
    missingContext.extensionAvailable = false;
    const missing = new WebGL2WaterGpuTimer(missingContext.asWebGL2());
    expect(missing.capability).toEqual({ status: "unavailable", reason: "extension-unavailable" });
    missing.beginCapture("frame-envelope");
    expect(missing.finishCapture()).toEqual({
      status: "unavailable",
      scope: "frame-envelope",
      reason: "extension-unavailable"
    });

    const zeroBitsContext = new FakeWebGL2TimerContext();
    zeroBitsContext.queryCounterBits = 0;
    const zeroBits = new WebGL2WaterGpuTimer(zeroBitsContext.asWebGL2());
    expect(zeroBits.capability).toEqual({ status: "unavailable", reason: "zero-query-counter-bits" });
  });

  it("never reads QUERY_RESULT while a query remains unavailable", () => {
    const context = new FakeWebGL2TimerContext();
    const timer = new WebGL2WaterGpuTimer(context.asWebGL2());
    timer.beginCapture("planar-pass");
    timer.beginPhaseSamples("on");
    const query = timer.beginPlanarSample();
    if (!query) throw new Error("Expected a Planar query.");
    timer.endPlanarSample(query);
    timer.poll();

    expect(context.resultReadCount).toBe(0);
    expect(timer.pendingQueryCount).toBe(1);
    expect(timer.finishCapture()).toMatchObject({
      status: "unavailable",
      reason: "query-results-pending",
      pendingQueryCount: 1
    });
  });

  it("invalidates all samples after GPU disjoint", () => {
    const context = new FakeWebGL2TimerContext();
    const timer = new WebGL2WaterGpuTimer(context.asWebGL2());
    timer.beginCapture("planar-pass");
    timer.beginPhaseSamples("on");
    const query = timer.beginPlanarSample();
    if (!query) throw new Error("Expected a Planar query.");
    timer.endPlanarSample(query);
    context.disjoint = true;
    timer.poll();

    expect(timer.finishCapture()).toMatchObject({
      status: "disjoint",
      scope: "planar-pass",
      reason: "gpu-disjoint",
      discardedSampleCount: 1
    });
    expect(context.deletedQueries).toContain(query);
  });

  it("fails closed when another TIME_ELAPSED query is active", () => {
    const context = new FakeWebGL2TimerContext();
    context.externalCurrentQuery = {} as WebGLQuery;
    const timer = new WebGL2WaterGpuTimer(context.asWebGL2());
    timer.beginCapture("planar-pass");
    timer.beginPhaseSamples("on");

    expect(timer.beginPlanarSample()).toBeUndefined();
    expect(timer.finishCapture()).toMatchObject({
      status: "unavailable",
      reason: "timer-query-busy",
      droppedSampleCount: 1
    });
  });

  it("does not delete invalidated WebGL objects after context loss", () => {
    const context = new FakeWebGL2TimerContext();
    const timer = new WebGL2WaterGpuTimer(context.asWebGL2());
    timer.beginCapture("planar-pass");
    timer.beginPhaseSamples("on");
    const query = timer.beginPlanarSample();
    if (!query) throw new Error("Expected a Planar query.");
    timer.endPlanarSample(query);
    context.contextLost = true;
    timer.poll();

    expect(timer.finishCapture()).toMatchObject({ status: "unavailable", reason: "context-lost" });
    expect(context.deletedQueries).not.toContain(query);
  });
});
