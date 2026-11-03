import type { FarmSnapshot, FarmingGroundView } from "@galacean/engine-farming/farming/api/index";
import type {
  FarmNearWaterEntry,
  FarmWaterSupplyInput,
  FarmWaterSupplyDiagnostics
} from "@galacean/engine-farming/farming/domain/FarmWaterSupply";
import {
  WaterSpatialFieldChannel,
  createWaterSpatialFieldSample,
  resetWaterSpatialFieldSample,
  type WaterSpatialFieldSnapshot
} from "@galacean/engine-water/water/runtime/index";
import {
  createWaterNearShoreSample,
  resetWaterNearShoreSample,
  type WaterNearShoreTask
} from "@galacean/engine-water/water/runtime/index";

/** Gameplay parameters, deliberately outside the signed farming simulation configuration. */
export const PLANNING_FARM_WATER_SUPPLY = Object.freeze({
  distanceM: 20,
  maximumHeightDifferenceM: 4,
  maximumPerMinute: 6,
  equilibriumMoistureUnits: 31,
  sampleEpsilonM: 0.05,
  maximumCallsPerSlice: 1024,
  sliceBudgetMs: 2
});
export type PlanningFarmWaterSupplyOptions = Readonly<{ [K in keyof typeof PLANNING_FARM_WATER_SUPPLY]: number }>;

/** These are the exact immutable Water captures already owned by this published ground view. */
export interface PlanningFarmWaterGroundView extends FarmingGroundView {
  readonly waterFields: readonly WaterSpatialFieldSnapshot[];
}
export interface PlanningFarmWaterScheduler {
  nowMs(): number;
  schedule(callback: () => void): number;
  cancel(handle: number): void;
}
const browserScheduler: PlanningFarmWaterScheduler = {
  nowMs: () => performance.now(),
  schedule: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle)
};
interface PlotPoint {
  readonly plotId: string;
  readonly groundId: string;
  readonly cellX: number;
  readonly cellZ: number;
  readonly x: number;
  readonly z: number;
  readonly height: number | null;
}
interface RefreshTask {
  readonly view: PlanningFarmWaterGroundView;
  readonly snapshot: FarmSnapshot;
  readonly layoutRevision: number;
  readonly points: PlotPoint[];
  readonly candidates: WaterSpatialFieldSnapshot[];
  readonly entries: Map<string, FarmNearWaterEntry>;
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
  prepareIndex: number;
  fieldIndex: number;
  nearPrepareIndex: number;
  plotIndex: number;
  candidateIndex: number;
  secondSample: boolean;
  distance: number;
  secondX: number;
  secondZ: number;
  bestSource: string | null;
  bestCompiled: string | null;
  bestDistance: number | null;
  bestHeight: number | null;
  bestCoefficient: number;
  sampleCalls: number;
  nearTask?: WaterNearShoreTask;
}

/** One coalesced frame task. Sampling is confined to runSlice, never a tick or query. */
export class PlanningFarmWaterSupply {
  private readonly scheduler: PlanningFarmWaterScheduler;
  private readonly options: PlanningFarmWaterSupplyOptions;
  private readonly sample = createWaterSpatialFieldSample();
  private readonly nearShoreSample = createWaterNearShoreSample();
  private entries = new Map<string, FarmNearWaterEntry>();
  private task?: RefreshTask;
  private frame?: number;
  private farmId?: string;
  private requestedGroundRevision: number | null = null;
  private layoutRevision = 0;
  private completedGroundRevision: number | null = null;
  private completedLayoutRevision: number | null = null;
  private disposed = false;
  private pendingRefresh = false;
  private plotCount = 0;
  private candidateCount = 0;
  private totalSampleCalls = 0;
  private taskSampleCalls = 0;
  private completedTasks = 0;
  private discardedTasks = 0;
  private sliceCount = 0;
  private lastSliceCalls = 0;
  private maximumSliceCalls = 0;
  private lastSliceMs = 0;
  private maximumSliceMs = 0;
  private overBudgetSlices = 0;
  private overBudgetCalls = 0;
  private maximumCallMs = 0;

  constructor(
    options: {
      readonly parameters?: Partial<PlanningFarmWaterSupplyOptions>;
      readonly fieldCapacityUnits?: number;
      readonly scheduler?: PlanningFarmWaterScheduler;
      readonly isCurrent?: (view: PlanningFarmWaterGroundView) => boolean;
    } = {}
  ) {
    this.options = Object.freeze({ ...PLANNING_FARM_WATER_SUPPLY, ...options.parameters });
    const p = this.options;
    if (
      Object.values(p).some((v) => !Number.isFinite(v) || v < 0) ||
      p.distanceM > 20 ||
      p.maximumHeightDifferenceM <= 0 ||
      p.sampleEpsilonM <= 0 ||
      p.sliceBudgetMs <= 0 ||
      p.sliceBudgetMs > 2 ||
      !Number.isInteger(p.maximumCallsPerSlice) ||
      p.maximumCallsPerSlice < 1 ||
      p.maximumCallsPerSlice > 1024 ||
      p.equilibriumMoistureUnits > (options.fieldCapacityUnits ?? 31)
    )
      throw new Error("Invalid farming near-water host parameters");
    this.scheduler = options.scheduler ?? browserScheduler;
    this.isCurrent = options.isCurrent ?? (() => true);
  }
  private readonly isCurrent: (view: PlanningFarmWaterGroundView) => boolean;

  request(view: PlanningFarmWaterGroundView, snapshot: FarmSnapshot, layoutChanged = false): void {
    if (this.disposed || !this.isCurrent(view)) return;
    if (this.farmId !== snapshot.farmId) {
      this.entries.clear();
      this.completedGroundRevision = this.completedLayoutRevision = null;
      this.farmId = snapshot.farmId;
      layoutChanged = true;
    }
    if (layoutChanged) this.layoutRevision++;
    if (this.requestedGroundRevision === view.revision && !layoutChanged) return;
    if (this.task) this.discardedTasks++;
    this.pendingRefresh = false;
    this.requestedGroundRevision = view.revision;
    this.plotCount = snapshot.plots.length;
    this.candidateCount = this.taskSampleCalls = 0;
    this.task = {
      view,
      snapshot,
      layoutRevision: this.layoutRevision,
      points: [],
      candidates: [],
      entries: new Map(),
      minimumX: Infinity,
      maximumX: -Infinity,
      minimumZ: Infinity,
      maximumZ: -Infinity,
      prepareIndex: 0,
      fieldIndex: 0,
      nearPrepareIndex: 0,
      plotIndex: 0,
      candidateIndex: 0,
      secondSample: false,
      distance: 0,
      secondX: 0,
      secondZ: 0,
      bestSource: null,
      bestCompiled: null,
      bestDistance: null,
      bestHeight: null,
      bestCoefficient: 0,
      sampleCalls: 0
    };
    this.schedule();
  }
  /** Deletions invalidate just their old entry immediately; additions have no entry until completion. */
  removePlot(plotId: string): void {
    this.entries.delete(plotId);
  }
  cancel(): void {
    if (this.task) this.discardedTasks++;
    this.task = undefined;
    this.requestedGroundRevision = null;
    // Cached facts remain readable, but no longer certify the currently published ground.
    this.pendingRefresh = this.entries.size > 0;
    if (this.frame !== undefined) this.scheduler.cancel(this.frame);
    this.frame = undefined;
  }
  capture(farmId: string): FarmWaterSupplyInput | undefined {
    if (this.farmId !== farmId || this.disposed) return undefined;
    return {
      farmId,
      maximumPerMinute: this.options.maximumPerMinute,
      equilibriumMoistureUnits: this.options.equilibriumMoistureUnits,
      plots: this.entries,
      diagnostics: this.diagnostics()
    };
  }
  diagnostics(): FarmWaterSupplyDiagnostics {
    return Object.freeze({
      refreshing: !!this.task || this.pendingRefresh,
      requestedGroundRevision: this.requestedGroundRevision,
      requestedLayoutRevision: this.layoutRevision,
      completedGroundRevision: this.completedGroundRevision,
      completedLayoutRevision: this.completedLayoutRevision,
      plotCount: this.plotCount,
      candidateCount: this.candidateCount,
      totalSampleCalls: this.totalSampleCalls,
      taskSampleCalls: this.taskSampleCalls,
      completedTasks: this.completedTasks,
      discardedTasks: this.discardedTasks,
      sliceCount: this.sliceCount,
      lastSliceCalls: this.lastSliceCalls,
      maximumSliceCalls: this.maximumSliceCalls,
      lastSliceMs: this.lastSliceMs,
      maximumSliceMs: this.maximumSliceMs,
      overBudgetSlices: this.overBudgetSlices,
      overBudgetCalls: this.overBudgetCalls,
      maximumCallMs: this.maximumCallMs
    });
  }
  dispose(): void {
    this.cancel();
    this.disposed = true;
    this.pendingRefresh = false;
    this.entries.clear();
  }
  private schedule(): void {
    if (this.frame === undefined && this.task && !this.disposed)
      this.frame = this.scheduler.schedule(() => this.runSlice());
  }
  private current(task: RefreshTask): boolean {
    return (
      !this.disposed &&
      this.task === task &&
      this.requestedGroundRevision === task.view.revision &&
      this.layoutRevision === task.layoutRevision &&
      this.isCurrent(task.view)
    );
  }
  private runSlice(): void {
    this.frame = undefined;
    const task = this.task;
    if (!task || this.disposed) return;
    const start = this.scheduler.nowMs(),
      callsBefore = task.sampleCalls;
    const p = this.options;
    const continuationBudgetMs = Math.min(0.2, p.sliceBudgetMs / 3);
    // A continuation can only check its deadline after an indivisible step (or
    // a GC pause). Keep batching bounded with headroom, rather than filling the
    // frame up to its deadline before starting another cold continuation.
    const continuationWorkBudgetMs = p.sliceBudgetMs / 4;
    const continuationLimit = Math.max(1, Math.floor(continuationWorkBudgetMs / continuationBudgetMs));
    let continuations = 0;
    while (this.current(task)) {
      if (this.scheduler.nowMs() - start >= p.sliceBudgetMs || task.sampleCalls - callsBefore >= p.maximumCallsPerSlice)
        break;
      if (task.prepareIndex < task.snapshot.plots.length) {
        const plot = task.snapshot.plots[task.prepareIndex++],
          grid = task.snapshot.grid;
        const x = grid.originX + (plot.cellX + 0.5) * grid.cellSize;
        const z = grid.originZ + (plot.cellZ + 0.5) * grid.cellSize;
        const height = task.view.sample(plot.groundId, x, z)?.position[1];
        task.points.push({
          plotId: plot.plotId,
          groundId: plot.groundId,
          cellX: plot.cellX,
          cellZ: plot.cellZ,
          x,
          z,
          height: height !== undefined && Number.isFinite(height) ? height : null
        });
        task.minimumX = Math.min(task.minimumX, x - grid.cellSize / 2);
        task.maximumX = Math.max(task.maximumX, x + grid.cellSize / 2);
        task.minimumZ = Math.min(task.minimumZ, z - grid.cellSize / 2);
        task.maximumZ = Math.max(task.maximumZ, z + grid.cellSize / 2);
        continue;
      }
      if (task.fieldIndex < task.view.waterFields.length) {
        const field = task.view.waterFields[task.fieldIndex++],
          b = field.metadata.bounds;
        if (
          p.distanceM > 0 &&
          task.points.length &&
          b.minX - p.distanceM <= task.maximumX &&
          b.maxX + p.distanceM >= task.minimumX &&
          b.minZ - p.distanceM <= task.maximumZ &&
          b.maxZ + p.distanceM >= task.minimumZ
        )
          task.candidates.push(field);
        this.candidateCount = task.candidates.length;
        continue;
      }
      if (task.nearPrepareIndex < task.candidates.length) {
        if (
          continuations >= continuationLimit ||
          (continuations > 0 && this.scheduler.nowMs() - start >= continuationWorkBudgetMs)
        )
          break;
        const query = task.candidates[task.nearPrepareIndex].nearShore;
        if (!query?.prepare || query.prepare(() => this.scheduler.nowMs(), continuationBudgetMs))
          task.nearPrepareIndex++;
        else continuations++;
        // Keep the completed cache visible through the preparation frame,
        // including a hot index, before beginning plot queries.
        if (query?.prepare && task.nearPrepareIndex === task.candidates.length) break;
        continue;
      }
      if (task.plotIndex >= task.points.length) {
        // Both versions are checked immediately before the single atomic cache replacement.
        if (this.current(task)) {
          this.entries = task.entries;
          this.completedGroundRevision = task.view.revision;
          this.completedLayoutRevision = task.layoutRevision;
          this.completedTasks++;
          this.task = undefined;
        }
        break;
      }
      const point = task.points[task.plotIndex];
      if (task.candidateIndex >= task.candidates.length) {
        task.entries.set(
          point.plotId,
          Object.freeze({
            plotId: point.plotId,
            groundId: point.groundId,
            cellX: point.cellX,
            cellZ: point.cellZ,
            sourceHash: task.bestSource,
            compiledHash: task.bestCompiled,
            shoreDistanceM: task.bestDistance,
            heightDifferenceM: task.bestHeight,
            coefficient: task.bestCoefficient,
            groundRevision: task.view.revision,
            layoutRevision: task.layoutRevision
          })
        );
        task.plotIndex++;
        task.candidateIndex = 0;
        task.bestSource = task.bestCompiled = null;
        task.bestDistance = task.bestHeight = null;
        task.bestCoefficient = 0;
        continue;
      }
      const field = task.candidates[task.candidateIndex],
        b = field.metadata.bounds;
      const nearShore = task.secondSample ? undefined : field.nearShore;
      const padding = nearShore ? Math.min(p.distanceM, nearShore.radiusM) : 0;
      const x = task.secondSample ? task.secondX : point.x,
        z = task.secondSample ? task.secondZ : point.z;
      if (
        point.height === null ||
        x < b.minX - padding ||
        x > b.maxX + padding ||
        z < b.minZ - padding ||
        z > b.maxZ + padding
      ) {
        task.secondSample = false;
        task.candidateIndex++;
        continue;
      }
      resetWaterSpatialFieldSample(this.sample);
      if (!task.nearTask) resetWaterNearShoreSample(this.nearShoreSample);
      if (
        nearShore?.createTask &&
        (continuations >= continuationLimit ||
          (continuations > 0 && this.scheduler.nowMs() - start >= continuationWorkBudgetMs))
      )
        break;
      const callStart = this.scheduler.nowMs();
      let hit: boolean,
        pending = false;
      const starting = !task.nearTask;
      if (nearShore?.createTask) {
        task.nearTask ??= nearShore.createTask(x, z, this.nearShoreSample);
        pending = !task.nearTask.advance(() => this.scheduler.nowMs(), continuationBudgetMs);
        if (pending) continuations++;
        hit = task.nearTask.hit;
        if (!pending) task.nearTask = undefined;
      } else
        hit = nearShore ? nearShore.sample(x, z, this.nearShoreSample) : field.sampleSpatialField(x, z, this.sample);
      const callMs = this.scheduler.nowMs() - callStart;
      if (starting) {
        task.sampleCalls++;
        this.totalSampleCalls++;
      }
      this.taskSampleCalls = this.task === task ? task.sampleCalls : (this.task?.sampleCalls ?? 0);
      this.maximumCallMs = Math.max(this.maximumCallMs, callMs);
      if (callMs > p.sliceBudgetMs) this.overBudgetCalls++;
      if (!this.current(task)) break;
      if (pending) {
        // Publish no partial result and retain an inter-frame cancellation point
        // when a query first becomes pending.
        if (starting || callMs > p.sliceBudgetMs) break;
        continue;
      }
      const s = this.sample;
      if (nearShore) {
        const n = this.nearShoreSample;
        if (hit && Number.isFinite(n.distanceM) && n.distanceM >= 0 && Number.isFinite(n.surfaceHeight))
          this.consider(task, field, n.distanceM, Math.abs(point.height - n.surfaceHeight));
        task.candidateIndex++;
      } else if (task.secondSample) {
        task.secondSample = false;
        if (hit && s.resolved && s.insideField && s.wet && Number.isFinite(s.surfaceHeight))
          this.consider(task, field, task.distance, Math.abs(point.height - s.surfaceHeight));
        task.candidateIndex++;
      } else if (
        hit &&
        s.resolved &&
        s.insideField &&
        (s.validChannels & WaterSpatialFieldChannel.ShoreSignedDistance) !== 0 &&
        Number.isFinite(s.shoreSignedDistance)
      ) {
        const distance = Math.max(0, -s.shoreSignedDistance);
        if (distance > p.distanceM) {
          this.consider(task, field, distance, null);
          task.candidateIndex++;
        } else if (Number.isFinite(s.surfaceHeight)) {
          this.consider(task, field, distance, Math.abs(point.height - s.surfaceHeight));
          task.candidateIndex++;
        } else if (
          s.shoreSignedDistance < 0 &&
          (s.validChannels & WaterSpatialFieldChannel.ShoreNormal) !== 0 &&
          Number.isFinite(s.shoreNormalX) &&
          Number.isFinite(s.shoreNormalZ) &&
          Math.hypot(s.shoreNormalX, s.shoreNormalZ) > 0
        ) {
          const travel = distance + Math.max(p.sampleEpsilonM, field.metadata.maximumHorizontalError);
          const length = Math.hypot(s.shoreNormalX, s.shoreNormalZ);
          task.distance = distance;
          task.secondX = point.x - (s.shoreNormalX / length) * travel;
          task.secondZ = point.z - (s.shoreNormalZ / length) * travel;
          task.secondSample = true;
          this.consider(task, field, distance, null);
        } else {
          this.consider(task, field, distance, null);
          task.candidateIndex++;
        }
      } else task.candidateIndex++;
      // A synchronous call cannot be preempted. A slow call yields before any next pair or second sample.
      if (callMs > p.sliceBudgetMs) break;
    }
    this.lastSliceMs = this.scheduler.nowMs() - start;
    this.maximumSliceMs = Math.max(this.maximumSliceMs, this.lastSliceMs);
    this.lastSliceCalls = task.sampleCalls - callsBefore;
    this.maximumSliceCalls = Math.max(this.maximumSliceCalls, this.lastSliceCalls);
    this.sliceCount++;
    if (this.lastSliceMs > p.sliceBudgetMs) this.overBudgetSlices++;
    if (this.task === task && !this.current(task)) {
      this.task = undefined;
      this.discardedTasks++;
    }
    this.schedule();
  }
  private consider(task: RefreshTask, field: WaterSpatialFieldSnapshot, distance: number, height: number | null): void {
    const p = this.options;
    const coefficient =
      height === null ||
      distance >= p.distanceM ||
      // Subtracting two static datums can round an exact threshold down by one ULP.
      height >= p.maximumHeightDifferenceM * (1 - Number.EPSILON) ||
      p.distanceM === 0
        ? 0
        : (1 - distance / p.distanceM) * (1 - height / p.maximumHeightDifferenceM);
    if (
      coefficient > task.bestCoefficient ||
      (coefficient === task.bestCoefficient && (task.bestDistance === null || distance < task.bestDistance))
    ) {
      task.bestCoefficient = coefficient;
      task.bestDistance = distance;
      task.bestHeight = height;
      task.bestSource = field.metadata.sourceHash;
      task.bestCompiled = field.metadata.compiledHash;
    }
  }
}
