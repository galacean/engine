import type { Engine } from "@galacean/engine";
import {
  TerrainRenderSubmissionMonitor,
  type TerrainRenderSubmissionSnapshot
} from "@galacean/engine-terrain/terrain/performance/TerrainRenderSubmissionMonitor";

const FRAME_SAMPLE_LIMIT = 360;
const FIELD_CPU_SAMPLE_LIMIT = 360;
const GPU_SAMPLE_LIMIT = 360;

interface WebGLEngineInternals {
  readonly _hardwareRenderer: {
    readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  };
}

interface DisjointTimerQueryExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

interface PendingGpuQuery {
  readonly query: WebGLQuery;
  readonly generation: number;
}

export interface WindAssetPerformanceSnapshot {
  readonly frameSampleCount: number;
  readonly frameP50Milliseconds: number;
  readonly frameP95Milliseconds: number;
  readonly fieldCpuSampleCount: number;
  readonly fieldCpuP50Milliseconds: number;
  readonly fieldCpuP95Milliseconds: number;
  readonly gpuTimerSource: "EXT_disjoint_timer_query_webgl2" | "unavailable";
  readonly gpuSampleCount: number;
  readonly gpuP50Milliseconds: number | null;
  readonly gpuP95Milliseconds: number | null;
  readonly gpuDisjointSampleCount: number;
  readonly gpuMemoryBytes: number;
  readonly submissions: TerrainRenderSubmissionSnapshot;
}

/** Equal-load frame, CPU adapter and whole-frame GPU sampler for the Hero-tree asset gate. */
export class WindAssetPerformanceSampler {
  private readonly _gl: WebGLRenderingContext | WebGL2RenderingContext;
  private readonly _gl2: WebGL2RenderingContext | null;
  private readonly _timerExtension: DisjointTimerQueryExtension | null;
  private readonly _submissionMonitor: TerrainRenderSubmissionMonitor;
  private readonly _frameTimes: number[] = [];
  private readonly _fieldCpuTimes: number[] = [];
  private readonly _gpuTimes: number[] = [];
  private readonly _pendingGpuQueries: PendingGpuQuery[] = [];
  private _activeGpuQuery: PendingGpuQuery | null = null;
  private _animationFrame = 0;
  private _lastFrameTime = performance.now();
  private _generation = 0;
  private _gpuDisjointSampleCount = 0;
  private _sampling = false;
  private _destroyed = false;

  constructor(private readonly _engine: Engine) {
    this._gl = (_engine as unknown as WebGLEngineInternals)._hardwareRenderer.gl;
    this._gl2 =
      typeof WebGL2RenderingContext !== "undefined" && this._gl instanceof WebGL2RenderingContext ? this._gl : null;
    this._timerExtension = this._gl2
      ? (this._gl2.getExtension("EXT_disjoint_timer_query_webgl2") as DisjointTimerQueryExtension | null)
      : null;
    this._submissionMonitor = new TerrainRenderSubmissionMonitor(this._gl);
    this._animationFrame = requestAnimationFrame(this._onAnimationFrame);
  }

  resetSamplingWindow(): void {
    this._assertAlive();
    this._sampling = false;
    this._finishActiveGpuQuery();
    this._generation++;
    this._frameTimes.length = 0;
    this._fieldCpuTimes.length = 0;
    this._gpuTimes.length = 0;
    this._gpuDisjointSampleCount = 0;
    this._lastFrameTime = performance.now();
    this._submissionMonitor.stop();
    this._submissionMonitor.start();
    this._sampling = true;
    this._beginGpuQuery();
  }

  recordFieldCpuTime(milliseconds: number): void {
    if (!this._sampling || !Number.isFinite(milliseconds) || milliseconds < 0) return;
    pushBounded(this._fieldCpuTimes, milliseconds, FIELD_CPU_SAMPLE_LIMIT);
  }

  takeSnapshot(shadowCascadeCount: number): WindAssetPerformanceSnapshot {
    this._assertAlive();
    this._sampling = false;
    this._finishActiveGpuQuery();
    this._pollGpuQueries();
    const frameTimes = [...this._frameTimes].sort(numberAscending);
    const fieldCpuTimes = [...this._fieldCpuTimes].sort(numberAscending);
    const gpuTimes = [...this._gpuTimes].sort(numberAscending);
    const submissions = this._submissionMonitor.takeSnapshot(shadowCascadeCount);
    this._submissionMonitor.stop();
    return Object.freeze({
      frameSampleCount: frameTimes.length,
      frameP50Milliseconds: percentile(frameTimes, 0.5),
      frameP95Milliseconds: percentile(frameTimes, 0.95),
      fieldCpuSampleCount: fieldCpuTimes.length,
      fieldCpuP50Milliseconds: percentile(fieldCpuTimes, 0.5),
      fieldCpuP95Milliseconds: percentile(fieldCpuTimes, 0.95),
      gpuTimerSource: this._timerExtension ? "EXT_disjoint_timer_query_webgl2" : "unavailable",
      gpuSampleCount: gpuTimes.length,
      gpuP50Milliseconds: gpuTimes.length > 0 ? percentile(gpuTimes, 0.5) : null,
      gpuP95Milliseconds: gpuTimes.length > 0 ? percentile(gpuTimes, 0.95) : null,
      gpuDisjointSampleCount: this._gpuDisjointSampleCount,
      gpuMemoryBytes: this._engine.renderingStatistics.totalMemory,
      submissions
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._sampling = false;
    cancelAnimationFrame(this._animationFrame);
    this._animationFrame = 0;
    this._submissionMonitor.stop();
    this._finishActiveGpuQuery();
    const gl2 = this._gl2;
    if (gl2) {
      for (const entry of this._pendingGpuQueries) gl2.deleteQuery(entry.query);
    }
    this._pendingGpuQueries.length = 0;
  }

  private readonly _onAnimationFrame = (time: number): void => {
    if (this._destroyed) return;
    this._finishActiveGpuQuery();
    this._pollGpuQueries();
    this._submissionMonitor.endFrame();
    if (this._sampling) {
      const frameTime = time - this._lastFrameTime;
      if (frameTime > 0 && frameTime < 5000) pushBounded(this._frameTimes, frameTime, FRAME_SAMPLE_LIMIT);
      this._beginGpuQuery();
    }
    this._lastFrameTime = time;
    this._animationFrame = requestAnimationFrame(this._onAnimationFrame);
  };

  private _beginGpuQuery(): void {
    const gl2 = this._gl2;
    const extension = this._timerExtension;
    if (!this._sampling || !gl2 || !extension || this._activeGpuQuery) return;
    const query = gl2.createQuery();
    if (!query) return;
    gl2.beginQuery(extension.TIME_ELAPSED_EXT, query);
    this._activeGpuQuery = { query, generation: this._generation };
  }

  private _finishActiveGpuQuery(): void {
    const gl2 = this._gl2;
    const extension = this._timerExtension;
    const active = this._activeGpuQuery;
    if (!gl2 || !extension || !active) return;
    gl2.endQuery(extension.TIME_ELAPSED_EXT);
    this._pendingGpuQueries.push(active);
    this._activeGpuQuery = null;
  }

  private _pollGpuQueries(): void {
    const gl2 = this._gl2;
    const extension = this._timerExtension;
    if (!gl2 || !extension || this._pendingGpuQueries.length === 0) return;
    const disjoint = Boolean(gl2.getParameter(extension.GPU_DISJOINT_EXT));
    for (let index = this._pendingGpuQueries.length - 1; index >= 0; index--) {
      const entry = this._pendingGpuQueries[index];
      if (!gl2.getQueryParameter(entry.query, gl2.QUERY_RESULT_AVAILABLE)) continue;
      this._pendingGpuQueries.splice(index, 1);
      if (disjoint) {
        this._gpuDisjointSampleCount++;
      } else if (entry.generation === this._generation) {
        const nanoseconds = Number(gl2.getQueryParameter(entry.query, gl2.QUERY_RESULT));
        const milliseconds = nanoseconds / 1_000_000;
        if (Number.isFinite(milliseconds) && milliseconds > 0.001) {
          pushBounded(this._gpuTimes, milliseconds, GPU_SAMPLE_LIMIT);
        }
      }
      gl2.deleteQuery(entry.query);
    }
  }

  private _assertAlive(): void {
    if (this._destroyed) throw new Error("Wind asset performance sampler has been destroyed");
  }
}

function pushBounded(values: number[], value: number, limit: number): void {
  values.push(value);
  if (values.length > limit) values.shift();
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function numberAscending(a: number, b: number): number {
  return a - b;
}
