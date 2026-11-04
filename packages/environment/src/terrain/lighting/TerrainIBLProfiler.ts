import type { RealtimeIBLBakerProfiler, RealtimeIBLBakerProfileStage } from "@galacean/engine";

export const TERRAIN_IBL_GPU_TIMER_SOURCE = "EXT_disjoint_timer_query_webgl2" as const;

export type TerrainIBLGpuTimerUnavailableReason =
  | "extension-unavailable"
  | "zero-query-counter-bits"
  | "context-lost"
  | "timer-destroyed"
  | "timer-query-busy"
  | "query-create-failed"
  | "query-error"
  | "query-result-invalid";

export type TerrainIBLGpuTimerCapability =
  | {
      readonly status: "available";
      readonly source: typeof TERRAIN_IBL_GPU_TIMER_SOURCE;
      readonly queryCounterBits: number;
    }
  | {
      readonly status: "unavailable";
      readonly reason: Extract<
        TerrainIBLGpuTimerUnavailableReason,
        "extension-unavailable" | "zero-query-counter-bits" | "context-lost" | "timer-destroyed"
      >;
    };

export type TerrainIBLStageGpuStatus =
  | "not-applicable"
  | "pending"
  | "available"
  | "unavailable"
  | "dropped"
  | "disjoint";

export interface TerrainIBLStageProfile {
  readonly stage: RealtimeIBLBakerProfileStage;
  readonly cpuTimeMs: number;
  readonly gpuStatus: TerrainIBLStageGpuStatus;
  readonly gpuTimeMs?: number;
  readonly gpuReason?: TerrainIBLGpuTimerUnavailableReason | "gpu-disjoint";
}

export interface TerrainIBLFrameProfile {
  readonly sequence: number;
  readonly revision: number;
  readonly frame: number;
  readonly phase: "capture" | "prefilter" | "publish";
  readonly bakerCpuTimeMs: number;
  readonly profiledCpuTimeMs: number;
  readonly unprofiledCpuTimeMs: number;
  readonly frameTimeMs: number | null;
  readonly stages: readonly TerrainIBLStageProfile[];
}

export interface TerrainIBLMetricSummary {
  readonly sampleCount: number;
  readonly totalMs: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly peakFrame: number;
}

export interface TerrainIBLStageSummary {
  readonly stage: RealtimeIBLBakerProfileStage;
  readonly cpu: TerrainIBLMetricSummary;
  readonly gpu: TerrainIBLMetricSummary | null;
}

export interface TerrainIBLStagePeak {
  readonly stage: RealtimeIBLBakerProfileStage;
  readonly frame: number;
  readonly timeMs: number;
}

export interface TerrainIBLRevisionProfileSummary {
  readonly revision: number;
  readonly updateCount: number;
  readonly complete: boolean;
  readonly bakerCpu: TerrainIBLMetricSummary;
  readonly frameTime: TerrainIBLMetricSummary | null;
  readonly peakStageCpu: TerrainIBLStagePeak | null;
  readonly peakStageGpu: TerrainIBLStagePeak | null;
  readonly stages: readonly TerrainIBLStageSummary[];
}

export interface TerrainIBLProfileSnapshot {
  readonly enabled: boolean;
  readonly capability: TerrainIBLGpuTimerCapability;
  readonly pendingGpuQueryCount: number;
  readonly droppedGpuSampleCount: number;
  readonly disjointGpuSampleCount: number;
  readonly frames: readonly TerrainIBLFrameProfile[];
  readonly revisions: readonly TerrainIBLRevisionProfileSummary[];
}

export interface TerrainIBLProfilerOptions {
  readonly enabled?: boolean;
  readonly maximumFrameCount?: number;
  readonly maximumPendingQueryCount?: number;
  readonly now?: () => number;
}

interface DisjointTimerQueryExtension {
  readonly QUERY_COUNTER_BITS_EXT: number;
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

interface MutableTerrainIBLStageProfile {
  stage: RealtimeIBLBakerProfileStage;
  cpuTimeMs: number;
  gpuStatus: TerrainIBLStageGpuStatus;
  gpuTimeMs?: number;
  gpuReason?: TerrainIBLGpuTimerUnavailableReason | "gpu-disjoint";
}

interface MutableTerrainIBLFrameProfile {
  sequence: number;
  revision: number;
  frame: number;
  phase: "capture" | "prefilter" | "publish";
  bakerCpuTimeMs: number;
  profiledCpuTimeMs: number;
  unprofiledCpuTimeMs: number;
  frameTimeMs: number | null;
  stages: MutableTerrainIBLStageProfile[];
}

interface ActiveStageSample {
  readonly profile: MutableTerrainIBLStageProfile;
  readonly cpuStartTimeMs: number;
  readonly gpuQuery?: WebGLQuery;
}

interface PendingGpuQuery {
  readonly query: WebGLQuery;
  readonly profile: MutableTerrainIBLStageProfile;
}

interface MetricValue {
  readonly frame: number;
  readonly value: number;
}

const GPU_STAGES = new Set<RealtimeIBLBakerProfileStage>([
  "sh-project",
  "source-capture",
  "source-mipmap",
  "ggx-prefilter"
]);
const DEFAULT_MAXIMUM_FRAME_COUNT = 512;
const DEFAULT_MAXIMUM_PENDING_QUERY_COUNT = 96;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;

/**
 * Terrain-only profiler for progressive realtime IBL.
 *
 * CPU samples use the Baker's exact synchronous stage boundaries. GPU work uses
 * disjoint timer queries and is only polled on later updates, so profiling never
 * waits for the GPU.
 */
export class TerrainIBLProfiler implements RealtimeIBLBakerProfiler {
  private readonly _now: () => number;
  private readonly _maximumFrameCount: number;
  private readonly _maximumPendingQueryCount: number;
  private readonly _frames: MutableTerrainIBLFrameProfile[] = [];
  private readonly _pendingGpuQueries: PendingGpuQuery[] = [];
  private readonly _availableGpuQueries: WebGLQuery[] = [];
  private _extension: DisjointTimerQueryExtension | null = null;
  private _queryCounterBits = 0;
  private _activeFrame?: MutableTerrainIBLFrameProfile;
  private _activeStage?: ActiveStageSample;
  private _pendingFrameInterval?: MutableTerrainIBLFrameProfile;
  private _sequence = 0;
  private _droppedGpuSampleCount = 0;
  private _disjointGpuSampleCount = 0;
  private _enabled: boolean;
  private _destroyed = false;

  constructor(
    private readonly _gl: WebGL2RenderingContext,
    options: TerrainIBLProfilerOptions = {}
  ) {
    this._now = options.now ?? (() => performance.now());
    this._maximumFrameCount = normalizeCapacity(options.maximumFrameCount, DEFAULT_MAXIMUM_FRAME_COUNT);
    this._maximumPendingQueryCount = normalizeCapacity(
      options.maximumPendingQueryCount,
      DEFAULT_MAXIMUM_PENDING_QUERY_COUNT
    );
    this._enabled = options.enabled ?? true;
    this._refreshExtension();
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get capability(): TerrainIBLGpuTimerCapability {
    if (this._destroyed) {
      return { status: "unavailable", reason: "timer-destroyed" };
    }
    if (this._gl.isContextLost()) {
      return { status: "unavailable", reason: "context-lost" };
    }
    if (!this._extension) {
      this._refreshExtension();
    }
    if (!this._extension) {
      return { status: "unavailable", reason: "extension-unavailable" };
    }
    if (this._queryCounterBits <= 0) {
      return { status: "unavailable", reason: "zero-query-counter-bits" };
    }
    return {
      status: "available",
      source: TERRAIN_IBL_GPU_TIMER_SOURCE,
      queryCounterBits: this._queryCounterBits
    };
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  beginUpdate(): void {
    if (this._destroyed) {
      return;
    }
    this.poll();
    if (this._activeStage) {
      this.endSample();
    }
    this._activeFrame = undefined;
  }

  beginSample(revision: number, frame: number, stage: RealtimeIBLBakerProfileStage): void {
    if (!this._enabled || this._destroyed) {
      return;
    }
    if (this._activeStage) {
      this.endSample();
    }
    let activeFrame = this._activeFrame;
    if (!activeFrame) {
      activeFrame = this._activeFrame = {
        sequence: ++this._sequence,
        revision,
        frame,
        phase: phaseForStage(stage),
        bakerCpuTimeMs: 0,
        profiledCpuTimeMs: 0,
        unprofiledCpuTimeMs: 0,
        frameTimeMs: null,
        stages: []
      };
    } else if (stage === "publish") {
      activeFrame.phase = "publish";
    }

    const profile: MutableTerrainIBLStageProfile = {
      stage,
      cpuTimeMs: 0,
      gpuStatus: GPU_STAGES.has(stage) ? "pending" : "not-applicable"
    };
    const gpuQuery = GPU_STAGES.has(stage) ? this._beginGpuSample(profile) : undefined;
    this._activeStage = { profile, cpuStartTimeMs: this._now(), gpuQuery };
    activeFrame.stages.push(profile);
  }

  endSample(): void {
    const activeStage = this._activeStage;
    if (!activeStage) {
      return;
    }
    activeStage.profile.cpuTimeMs = Math.max(0, this._now() - activeStage.cpuStartTimeMs);
    if (activeStage.gpuQuery) {
      this._endGpuSample(activeStage.gpuQuery, activeStage.profile);
    }
    this._activeStage = undefined;
  }

  endUpdate(bakerCpuTimeMs: number): void {
    if (this._activeStage) {
      this.endSample();
    }
    const frame = this._activeFrame;
    this._activeFrame = undefined;
    if (!frame || !Number.isFinite(bakerCpuTimeMs)) {
      return;
    }
    frame.bakerCpuTimeMs = Math.max(0, bakerCpuTimeMs);
    frame.profiledCpuTimeMs = frame.stages.reduce((total, stage) => total + stage.cpuTimeMs, 0);
    frame.unprofiledCpuTimeMs = Math.max(0, frame.bakerCpuTimeMs - frame.profiledCpuTimeMs);
    this._frames.push(frame);
    this._pendingFrameInterval = frame;
    if (this._frames.length > this._maximumFrameCount) {
      this._frames.splice(0, this._frames.length - this._maximumFrameCount);
    }
  }

  completeFrameInterval(frameTimeMs: number): void {
    const pendingFrame = this._pendingFrameInterval;
    this._pendingFrameInterval = undefined;
    if (pendingFrame && Number.isFinite(frameTimeMs) && frameTimeMs >= 0) {
      pendingFrame.frameTimeMs = frameTimeMs;
    }
  }

  poll(): void {
    if (!this._extension || this._destroyed || this._pendingGpuQueries.length === 0) {
      return;
    }
    if (this._gl.isContextLost()) {
      this._markContextLost();
      return;
    }
    if (Boolean(this._gl.getParameter(this._extension.GPU_DISJOINT_EXT))) {
      this._markDisjoint();
      return;
    }

    let unresolvedCount = 0;
    for (let index = 0; index < this._pendingGpuQueries.length; index++) {
      const pending = this._pendingGpuQueries[index];
      try {
        const available = Boolean(this._gl.getQueryParameter(pending.query, this._gl.QUERY_RESULT_AVAILABLE));
        if (!available) {
          this._pendingGpuQueries[unresolvedCount++] = pending;
          continue;
        }
        const nanoseconds: unknown = this._gl.getQueryParameter(pending.query, this._gl.QUERY_RESULT);
        if (typeof nanoseconds !== "number" || !Number.isFinite(nanoseconds) || nanoseconds < 0) {
          pending.profile.gpuStatus = "unavailable";
          pending.profile.gpuReason = "query-result-invalid";
          this._deleteQuery(pending.query);
          continue;
        }
        pending.profile.gpuStatus = "available";
        pending.profile.gpuTimeMs = nanoseconds / NANOSECONDS_PER_MILLISECOND;
        pending.profile.gpuReason = undefined;
        this._availableGpuQueries.push(pending.query);
      } catch {
        pending.profile.gpuStatus = "unavailable";
        pending.profile.gpuReason = "query-error";
        this._deleteQuery(pending.query);
      }
    }
    this._pendingGpuQueries.length = unresolvedCount;
  }

  reset(): void {
    this._endActiveGpuQueryForCleanup();
    if (this._gl.isContextLost()) {
      this._pendingGpuQueries.length = 0;
      this._availableGpuQueries.length = 0;
    } else {
      for (const pending of this._pendingGpuQueries) {
        this._deleteQuery(pending.query);
      }
    }
    this._pendingGpuQueries.length = 0;
    this._frames.length = 0;
    this._activeFrame = undefined;
    this._activeStage = undefined;
    this._pendingFrameInterval = undefined;
    this._sequence = 0;
    this._droppedGpuSampleCount = 0;
    this._disjointGpuSampleCount = 0;
  }

  getSnapshot(): TerrainIBLProfileSnapshot {
    this.poll();
    const frames = this._frames.map(cloneFrame);
    return {
      enabled: this._enabled,
      capability: this.capability,
      pendingGpuQueryCount: this._pendingGpuQueries.length,
      droppedGpuSampleCount: this._droppedGpuSampleCount,
      disjointGpuSampleCount: this._disjointGpuSampleCount,
      frames,
      revisions: summarizeRevisions(frames)
    };
  }

  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this.reset();
    if (!this._gl.isContextLost()) {
      for (const query of this._availableGpuQueries) {
        this._deleteQuery(query);
      }
    }
    this._availableGpuQueries.length = 0;
    this._destroyed = true;
  }

  private _beginGpuSample(profile: MutableTerrainIBLStageProfile): WebGLQuery | undefined {
    const capability = this.capability;
    if (capability.status === "unavailable") {
      profile.gpuStatus = "unavailable";
      profile.gpuReason = capability.reason;
      return undefined;
    }
    if (this._pendingGpuQueries.length >= this._maximumPendingQueryCount) {
      this._dropGpuSample(profile, "timer-query-busy");
      return undefined;
    }
    const extension = this._extension!;
    try {
      if (this._gl.getQuery(extension.TIME_ELAPSED_EXT, this._gl.CURRENT_QUERY) !== null) {
        this._dropGpuSample(profile, "timer-query-busy");
        return undefined;
      }
      const query = this._availableGpuQueries.pop() ?? this._gl.createQuery();
      if (!query) {
        profile.gpuStatus = "unavailable";
        profile.gpuReason = "query-create-failed";
        return undefined;
      }
      this._gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      return query;
    } catch {
      profile.gpuStatus = "unavailable";
      profile.gpuReason = "query-error";
      return undefined;
    }
  }

  private _endGpuSample(query: WebGLQuery, profile: MutableTerrainIBLStageProfile): void {
    const extension = this._extension;
    if (!extension || this._gl.isContextLost()) {
      profile.gpuStatus = "unavailable";
      profile.gpuReason = "context-lost";
      return;
    }
    try {
      this._gl.endQuery(extension.TIME_ELAPSED_EXT);
      this._pendingGpuQueries.push({ query, profile });
    } catch {
      profile.gpuStatus = "unavailable";
      profile.gpuReason = "query-error";
      this._deleteQuery(query);
    }
  }

  private _dropGpuSample(
    profile: MutableTerrainIBLStageProfile,
    reason: Extract<TerrainIBLGpuTimerUnavailableReason, "timer-query-busy">
  ): void {
    profile.gpuStatus = "dropped";
    profile.gpuReason = reason;
    this._droppedGpuSampleCount++;
  }

  private _markDisjoint(): void {
    this._disjointGpuSampleCount += this._pendingGpuQueries.length;
    for (const pending of this._pendingGpuQueries) {
      pending.profile.gpuStatus = "disjoint";
      pending.profile.gpuReason = "gpu-disjoint";
      this._deleteQuery(pending.query);
    }
    this._pendingGpuQueries.length = 0;
  }

  private _markContextLost(): void {
    for (const pending of this._pendingGpuQueries) {
      pending.profile.gpuStatus = "unavailable";
      pending.profile.gpuReason = "context-lost";
    }
    this._pendingGpuQueries.length = 0;
    this._availableGpuQueries.length = 0;
    this._extension = null;
    this._queryCounterBits = 0;
  }

  private _endActiveGpuQueryForCleanup(): void {
    const activeStage = this._activeStage;
    if (!activeStage?.gpuQuery) {
      return;
    }
    if (this._extension && !this._gl.isContextLost()) {
      try {
        this._gl.endQuery(this._extension.TIME_ELAPSED_EXT);
      } catch {
        // Cleanup must not affect the Terrain runtime
      }
      this._deleteQuery(activeStage.gpuQuery);
    }
  }

  private _deleteQuery(query: WebGLQuery): void {
    try {
      this._gl.deleteQuery(query);
    } catch {
      // Query cleanup is best effort during context transitions
    }
  }

  private _refreshExtension(): void {
    if (this._destroyed || this._gl.isContextLost()) {
      return;
    }
    const extension = this._gl.getExtension(TERRAIN_IBL_GPU_TIMER_SOURCE) as DisjointTimerQueryExtension | null;
    this._extension = extension;
    if (!extension) {
      this._queryCounterBits = 0;
      return;
    }
    try {
      const queryCounterBits: unknown = this._gl.getQuery(extension.TIME_ELAPSED_EXT, extension.QUERY_COUNTER_BITS_EXT);
      this._queryCounterBits =
        typeof queryCounterBits === "number" && Number.isFinite(queryCounterBits) ? Math.max(0, queryCounterBits) : 0;
    } catch {
      this._queryCounterBits = 0;
    }
  }
}

function cloneFrame(frame: MutableTerrainIBLFrameProfile): TerrainIBLFrameProfile {
  return {
    ...frame,
    stages: frame.stages.map((stage) => ({ ...stage }))
  };
}

function summarizeRevisions(frames: readonly TerrainIBLFrameProfile[]): TerrainIBLRevisionProfileSummary[] {
  const grouped = new Map<number, TerrainIBLFrameProfile[]>();
  for (const frame of frames) {
    const revisionFrames = grouped.get(frame.revision);
    if (revisionFrames) {
      revisionFrames.push(frame);
    } else {
      grouped.set(frame.revision, [frame]);
    }
  }
  return Array.from(grouped, ([revision, revisionFrames]) => summarizeRevision(revision, revisionFrames));
}

function summarizeRevision(
  revision: number,
  frames: readonly TerrainIBLFrameProfile[]
): TerrainIBLRevisionProfileSummary {
  const stageValues = new Map<RealtimeIBLBakerProfileStage, { cpu: MetricValue[]; gpu: MetricValue[] }>();
  let peakStageCpu: TerrainIBLStagePeak | null = null;
  let peakStageGpu: TerrainIBLStagePeak | null = null;
  for (const frame of frames) {
    for (const stage of frame.stages) {
      let values = stageValues.get(stage.stage);
      if (!values) {
        values = { cpu: [], gpu: [] };
        stageValues.set(stage.stage, values);
      }
      values.cpu.push({ frame: frame.frame, value: stage.cpuTimeMs });
      if (!peakStageCpu || stage.cpuTimeMs > peakStageCpu.timeMs) {
        peakStageCpu = { stage: stage.stage, frame: frame.frame, timeMs: stage.cpuTimeMs };
      }
      if (stage.gpuStatus === "available" && stage.gpuTimeMs !== undefined) {
        values.gpu.push({ frame: frame.frame, value: stage.gpuTimeMs });
        if (!peakStageGpu || stage.gpuTimeMs > peakStageGpu.timeMs) {
          peakStageGpu = { stage: stage.stage, frame: frame.frame, timeMs: stage.gpuTimeMs };
        }
      }
    }
  }

  const frameTimes = frames.flatMap((frame) =>
    frame.frameTimeMs === null ? [] : [{ frame: frame.frame, value: frame.frameTimeMs }]
  );
  return {
    revision,
    updateCount: frames.length,
    complete: frames.some((frame) => frame.stages.some((stage) => stage.stage === "publish")),
    bakerCpu: summarizeMetric(frames.map((frame) => ({ frame: frame.frame, value: frame.bakerCpuTimeMs }))),
    frameTime: frameTimes.length > 0 ? summarizeMetric(frameTimes) : null,
    peakStageCpu,
    peakStageGpu,
    stages: Array.from(stageValues, ([stage, values]) => ({
      stage,
      cpu: summarizeMetric(values.cpu),
      gpu: values.gpu.length > 0 ? summarizeMetric(values.gpu) : null
    }))
  };
}

function summarizeMetric(values: readonly MetricValue[]): TerrainIBLMetricSummary {
  const sorted = [...values].sort((left, right) => left.value - right.value);
  const totalMs = sorted.reduce((total, sample) => total + sample.value, 0);
  const peak = sorted[sorted.length - 1];
  return {
    sampleCount: sorted.length,
    totalMs,
    meanMs: totalMs / sorted.length,
    p50Ms: nearestRank(sorted, 0.5).value,
    p95Ms: nearestRank(sorted, 0.95).value,
    maxMs: peak.value,
    peakFrame: peak.frame
  };
}

function nearestRank(values: readonly MetricValue[], ratio: number): MetricValue {
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
}

function phaseForStage(stage: RealtimeIBLBakerProfileStage): TerrainIBLFrameProfile["phase"] {
  if (stage === "start" || stage === "source-capture") {
    return "capture";
  }
  return stage === "publish" ? "publish" : "prefilter";
}

function normalizeCapacity(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}
