import { MeshRenderer, type Engine, type Entity, type Vector3 } from "@galacean/engine";
import type { PlantingCatalog } from "../content/PlantingCatalog";
import { maturePlantResourceDiagnostics } from "../procedural/runtime/MaturePlantResources";
import { createPlantInstance, type PlantInstance } from "../procedural/runtime/createPlantInstance";
import { CropVisualTimeline, growthProgressMatches } from "./CropGrowthMapping";
import {
  CropGrowthScheduler,
  DEFAULT_GROWTH_SCHEDULE,
  type CropGrowthScheduleOptions,
  type CropGrowthTask
} from "./CropGrowthScheduler";
import { PlantWorkQueue } from "./PlantWorkQueue";
import { validatePlantRenderState, type PlantRenderState } from "./PlantRenderState";
import { DEFAULT_HARVEST_SECONDS, PlantHarvestEffect } from "./PlantHarvestEffect";
/** Deferred creation waits for a visible frame and does not block the host's current presentation readiness. */
export type PlantVisualLoadState = "empty" | "seeded" | "loading" | "deferred" | "ready" | "error";
/** Unlike off-frustum (-1), distance culling also disables the resident render hierarchy. */
export const PLANT_DISTANCE_CULLED = -2;
interface Entry {
  state: PlantRenderState;
  timeline: CropVisualTimeline;
  controller: AbortController;
  instance?: PlantInstance;
  task?: CropGrowthTask;
  visibility: number;
  distanceHidden?: boolean;
  loadState?: PlantVisualLoadState;
  message?: string;
  preview?: PlantHarvestEffect;
  /** Animation intent survives asynchronous loading and emergence. */
  previewRequest?: { seconds: number; elapsed: number; failed: boolean };
}
export interface PlantPresenterOptions {
  /** Keeps detached harvest animations under the host's distance policy after the crop is removed. */
  readonly isWithinDrawDistance?: (position: Vector3, wasVisible: boolean) => boolean;
  readonly maximumShadowTrianglesPerInstance?: number;
  readonly schedule?: CropGrowthScheduleOptions;
  readonly interpolationMs?: number;
  readonly harvestSeconds?: number;
}
/** Reconciles externally confirmed plants. Instance identity never depends on stage or position. */
export class PlantPresenter {
  private readonly entries = new Map<string, Entry>();
  private readonly entryList: Entry[] = [];
  private readonly scheduler: CropGrowthScheduler;
  private readonly workQueue = new PlantWorkQueue();
  private readonly presentationJobs = new Set<string>();
  private nextPresentationJob = 0;
  private disposed = false;
  private schedulingFrames = 0;
  private schedulingMilliseconds = 0;
  private readonly harvesting = new Map<PlantHarvestEffect, string>();
  private readonly syncStates: PlantRenderState[] = [];
  private readonly syncIds = new Set<string>();
  private readonly staleIds: string[] = [];
  private readonly diagnosticMeshIds = new Set<number>();
  private readonly readQueuePriority = (id: string): number =>
    this.presentationJobs.has(id) ? 2 : (this.entries.get(id)?.visibility ?? -1);
  constructor(
    private readonly engine: Engine,
    private readonly catalog: PlantingCatalog,
    private readonly getParent: (state: PlantRenderState) => Entity | undefined,
    private readonly onLoadState: (
      instanceId: string,
      state: PlantVisualLoadState,
      message?: string
    ) => void = () => {},
    private readonly options: PlantPresenterOptions = {}
  ) {
    this.scheduler = new CropGrowthScheduler(options.schedule ?? DEFAULT_GROWTH_SCHEDULE);
  }
  sync(inputs: readonly PlantRenderState[], snap = false, now = performance.now()): void {
    if (this.disposed) return;
    const states = this.syncStates;
    const ids = this.syncIds;
    const staleIds = this.staleIds;
    states.length = 0;
    ids.clear();
    staleIds.length = 0;
    try {
      for (let i = 0; i < inputs.length; i++) {
        const state = validatePlantRenderState(this.catalog, inputs[i]);
        if (ids.has(state.instanceId)) throw new Error("重复植物实例 ID");
        ids.add(state.instanceId);
        states.push(state);
      }
      for (let i = 0; i < this.entryList.length; i++) {
        const id = this.entryList[i].state.instanceId;
        if (!ids.has(id)) staleIds.push(id);
      }
      for (let i = 0; i < staleIds.length; i++) this.remove(staleIds[i]);
      const interpolationMs = this.options.interpolationMs ?? 1000;
      for (let i = 0; i < states.length; i++) {
        const state = states[i];
        let entry = this.entries.get(state.instanceId);
        if (entry && entry.state.cropId !== state.cropId) {
          this.remove(state.instanceId);
          entry = undefined;
        }
        if (!entry) {
          entry = { state, timeline: new CropVisualTimeline(), controller: new AbortController(), visibility: -1 };
          entry.timeline.push(state.progress, now, 0, true);
          this.entries.set(state.instanceId, entry);
          this.entryList.push(entry);
          void this.load(entry);
        } else {
          const prevShape = entry.state.shape;
          const nextShape = state.shape;
          const changedShape =
            nextShape.leafSpread !== prevShape.leafSpread ||
            nextShape.stemBend !== prevShape.stemBend ||
            nextShape.fruitScale !== prevShape.fruitScale;
          const restartMatureLoad =
            !entry.instance && entry.state.progress === 1 && (state.progress !== 1 || changedShape);
          entry.state = state;
          entry.timeline.push(state.progress, now, interpolationMs, snap || state.progress === 1);
          if (entry.task && (snap || changedShape)) entry.task.lastProgress = NaN;
          if (restartMatureLoad) {
            entry.controller.abort();
            entry.controller = new AbortController();
            void this.load(entry);
          }
        }
      }
    } finally {
      states.length = 0;
      ids.clear();
      staleIds.length = 0;
    }
  }
  retry(id: string): void {
    const entry = this.entries.get(id);
    if (entry?.instance) {
      entry.instance.retrySharing?.();
    } else if (entry?.loadState === "error") void this.load(entry);
  }
  update(now: number, visibility: (instanceId: string) => number, hidden = false): void {
    if (this.disposed) return;
    const entryList = this.entryList;
    if (!hidden)
      for (let i = 0; i < entryList.length; i++) {
        const e = entryList[i];
        e.visibility = visibility(e.state.instanceId);
        if (e.visibility === PLANT_DISTANCE_CULLED) {
          e.distanceHidden = true;
          if (e.instance) e.instance.plant.root.isActive = false;
        }
        if (e.loadState === "loading" || e.loadState === "deferred")
          this.report(e, e.visibility < 0 ? "deferred" : "loading");
      }
    const creationMs = this.workQueue.tick(this.readQueuePriority, this.scheduler.options.budgetMs, hidden);
    this.scheduler.tick(now, this.readQueuePriority, hidden, Math.max(0, this.scheduler.options.budgetMs - creationMs));
    this.schedulingFrames++;
    this.schedulingMilliseconds += creationMs + this.scheduler.stats.frameMilliseconds;
    if (!hidden) for (let i = 0; i < entryList.length; i++) this.restoreDistanceVisibility(entryList[i]);
  }
  private restoreDistanceVisibility(entry: Entry): void {
    if (!entry.distanceHidden || !entry.instance) return;
    // Never reveal stale geometry when this frame's work budget deferred catch-up.
    if (entry.visibility < 0 || !entry.task || !growthProgressMatches(entry.task.lastProgress, entry.timeline.target)) {
      entry.instance.plant.root.isActive = false;
      return;
    }
    entry.distanceHidden = false;
    entry.instance.plant.root.isActive = entry.instance.query().emergence > 0;
    this.startHarvestPreview(entry);
  }
  query(id: string) {
    return this.entries.get(id)?.instance?.query();
  }
  private deleteEntry(entry: Entry): void {
    this.entries.delete(entry.state.instanceId);
    const index = this.entryList.indexOf(entry);
    if (index >= 0) {
      const last = this.entryList.pop()!;
      if (index < this.entryList.length) this.entryList[index] = last;
    }
  }
  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.cancelHarvestPreview(id);
    this.deleteEntry(entry);
    this.scheduler.remove(id);
    entry.controller.abort();
    entry.instance?.dispose();
    this.onLoadState(id, "empty");
  }
  /** Shared dissolve presentation for a confirmed harvest or hoe removal; does not grant inventory. */
  harvest(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.previewRequest = undefined;
    if (entry.preview) {
      entry.preview.commitPreview();
      entry.preview = undefined;
      this.deleteEntry(entry);
      this.scheduler.remove(id);
      this.onLoadState(id, "empty");
      return;
    }
    if (!entry.instance || !entry.instance.plant.root.isActive) {
      this.remove(id);
      return;
    }
    this.deleteEntry(entry);
    this.scheduler.remove(id);
    this.onLoadState(id, "empty");
    try {
      let effect: PlantHarvestEffect | undefined;
      effect = PlantHarvestEffect.create(
        entry.instance,
        this.options.harvestSeconds ?? DEFAULT_HARVEST_SECONDS,
        () => {
          if (effect) this.harvesting.delete(effect);
          entry.controller.abort();
        },
        false,
        this.harvestVisibility(entry)
      );
      this.harvesting.set(effect, id);
    } catch (error) {
      entry.controller.abort();
      entry.instance.dispose();
      console.warn("作物收获动画初始化失败：", error);
    }
  }
  beginHarvestPreview(id: string, seconds: number): void {
    const entry = this.entries.get(id);
    if (!entry || entry.previewRequest) return;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("消融预览时长必须大于 0");
    entry.previewRequest = { seconds, elapsed: 0, failed: false };
    this.startHarvestPreview(entry);
  }
  private startHarvestPreview(entry: Entry): void {
    const request = entry.previewRequest;
    if (!request || request.failed || !entry.instance || !entry.instance.plant.root.isActive || entry.preview) return;
    const id = entry.state.instanceId;
    let effect: PlantHarvestEffect | undefined;
    try {
      effect = PlantHarvestEffect.create(
        entry.instance,
        request.seconds,
        () => {
          if (effect) this.harvesting.delete(effect);
          if (this.entries.get(id) !== entry) entry.controller.abort();
        },
        true,
        this.harvestVisibility(entry)
      );
      entry.preview = effect;
      this.harvesting.set(effect, id);
      effect.seekPreview(request.elapsed);
    } catch (error) {
      request.failed = true;
      console.warn("作物锄除预览初始化失败：", error);
    }
  }
  private harvestVisibility(entry: Entry): () => boolean {
    let withinDistance = !entry.distanceHidden;
    return () => {
      if (!this.options.isWithinDrawDistance) return !entry.distanceHidden;
      if (this.options.isWithinDrawDistance && entry.instance)
        withinDistance = this.options.isWithinDrawDistance(
          entry.instance.plant.root.transform.worldPosition,
          withinDistance
        );
      // Live previews also wait for the presenter's catch-up; detached effects keep their own distance history.
      return withinDistance && (this.entries.get(entry.state.instanceId) !== entry || !entry.distanceHidden);
    };
  }
  seekHarvestPreview(id: string, seconds: number): void {
    const entry = this.entries.get(id);
    if (!entry?.previewRequest || !Number.isFinite(seconds)) return;
    entry.previewRequest.elapsed = Math.max(0, seconds);
    this.startHarvestPreview(entry);
    entry.preview?.seekPreview(entry.previewRequest.elapsed);
  }
  cancelHarvestPreview(id: string): void {
    const entry = this.entries.get(id);
    if (!entry?.previewRequest && !entry?.preview) return;
    entry.previewRequest = undefined;
    entry.preview?.cancelPreview();
    entry.preview = undefined;
    if (entry.instance) this.apply(entry, entry.timeline.sample(performance.now()));
  }
  get harvestDiagnostics() {
    return [...this.harvesting].map(([effect, instanceId]) => ({
      instanceId,
      progress: effect.progress,
      particlesAlive: effect.particlesAlive
    }));
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    while (this.entryList.length > 0) this.remove(this.entryList[this.entryList.length - 1].state.instanceId);
    this.scheduler.clear();
    if (this.harvesting.size > 0) {
      const effects: PlantHarvestEffect[] = [];
      this.harvesting.forEach((_id, effect) => effects.push(effect));
      for (let i = 0; i < effects.length; i++) effects[i].dispose();
      this.harvesting.clear();
    }
  }
  /** Item GPU preparation shares the existing crop work budget. */
  async preparePresentationWork<T>(work: () => T, phase: string, signal: AbortSignal): Promise<T> {
    if (this.disposed) throw new Error("Farming presentation disposed");
    const id = `presentation:${this.nextPresentationJob++}`;
    this.presentationJobs.add(id);
    try {
      return await this.workQueue.enqueue(id, signal, work, phase);
    } finally {
      this.presentationJobs.delete(id);
    }
  }
  private report(entry: Entry, state: PlantVisualLoadState, message?: string) {
    if (entry.loadState === state && entry.message === message) return;
    entry.loadState = state;
    entry.message = message;
    this.onLoadState(entry.state.instanceId, state, message);
  }
  private apply(entry: Entry, progress: number) {
    if (entry.preview) return;
    const instance = entry.instance!;
    let emergence: number;
    if (instance.updateValidated) {
      emergence = instance.updateValidated(entry.state, progress);
    } else {
      instance.update({ ...entry.state, progress });
      emergence = instance.query().emergence;
    }
    // Direct snap/shape updates must invalidate the same cache used by scheduled updates.
    if (entry.task) entry.task.lastProgress = progress;
    if (entry.distanceHidden) instance.plant.root.isActive = false;
    // Sharing is optional for an existing plant; failures remain in its resource diagnostics.
    this.report(entry, emergence > 0 ? "ready" : "seeded");
    this.startHarvestPreview(entry);
  }
  private async load(entry: Entry) {
    const id = entry.state.instanceId;
    const controller = entry.controller;
    this.report(entry, "loading");
    try {
      const parent = this.getParent(entry.state);
      if (!parent) throw new Error("找不到植物宿主挂点");
      const instance = await createPlantInstance(
        this.catalog,
        this.engine,
        parent,
        entry.state,
        controller.signal,
        (work, phase, signal) => this.workQueue.enqueue(id, signal ?? controller.signal, work, phase),
        this.options.maximumShadowTrianglesPerInstance ?? 0
      );
      if (this.disposed || this.entries.get(id) !== entry || entry.controller !== controller) {
        instance.dispose();
        return;
      }
      entry.instance = instance;
      if (entry.distanceHidden) instance.plant.root.isActive = false;
      const initial = instance.query().state;
      if (
        initial.progress !== entry.timeline.target ||
        initial.shape.leafSpread !== entry.state.shape.leafSpread ||
        initial.shape.stemBend !== entry.state.shape.stemBend ||
        initial.shape.fruitScale !== entry.state.shape.fruitScale
      )
        await this.workQueue.enqueue(id, controller.signal, () => this.apply(entry, entry.timeline.target));
      else {
        this.report(entry, instance.query().emergence > 0 ? "ready" : "seeded");
        this.startHarvestPreview(entry);
      }
      if (this.disposed || this.entries.get(id) !== entry || entry.controller !== controller) return;
      entry.task = {
        id,
        timeline: entry.timeline,
        apply: (progress) => this.apply(entry, progress),
        lastProgress: entry.timeline.target,
        lastUpdate: 0,
        visible: false
      };
      this.scheduler.add(entry.task);
    } catch (error) {
      if (entry.controller !== controller) return;
      entry.instance?.dispose();
      entry.instance = undefined;
      // A cancelled load may finish after another entry has registered this ID.
      if (this.disposed || this.entries.get(id) !== entry || entry.controller !== controller) return;
      this.scheduler.remove(id);
      this.report(entry, "error", error instanceof Error ? error.message : String(error));
    }
  }
  get loadedInstanceCount() {
    return [...this.entries.values()].filter((e) => e.instance?.plant.root.isActive).length;
  }
  get loadedTriangleCount() {
    return [...this.entries.values()].reduce((n, e) => n + (e.instance?.plant.geometry.indices.length ?? 0) / 3, 0);
  }
  private get renderers() {
    return [...this.entries.values()].flatMap(
      (e) => e.instance?.plant.root.getComponentsIncludeChildren(MeshRenderer, []) ?? []
    );
  }
  get loadedRendererCount() {
    return this.renderers.length;
  }
  get loadedShadowCasterCount() {
    return this.renderers.filter((r) => r.castShadows).length;
  }
  /** Aggregate counters only: no per-plant queries, renderer traversal or resource snapshots. */
  getPerformanceDiagnostics() {
    let mature = 0,
      shared = 0;
    const meshes = this.diagnosticMeshIds;
    meshes.clear();
    for (let i = 0; i < this.entryList.length; i++) {
      const entry = this.entryList[i];
      const plant = entry.instance?.plant;
      if (entry.state.progress >= 1) {
        mature++;
        if (plant?.shared) {
          shared++;
          meshes.add(plant.mesh.instanceId);
        }
      }
    }
    const sharedMeshes = meshes.size;
    meshes.clear();
    return {
      mature,
      shared,
      sharedMeshes,
      queued: this.workQueue.stats.queued,
      schedulingFrames: this.schedulingFrames,
      schedulingMilliseconds: this.schedulingMilliseconds
    };
  }
  get growthDiagnostics() {
    return {
      ...this.scheduler.stats,
      creation: { ...this.workQueue.stats },
      matureResources: maturePlantResourceDiagnostics(this.engine),
      plants: [...this.entries.values()]
        .filter((e) => e.instance)
        .map((e) => {
          const plant = e.instance!.plant,
            query = e.instance!.query();
          return {
            instanceId: e.state.instanceId,
            entityId: plant.root.instanceId,
            meshId: plant.mesh.instanceId,
            materialId: plant.renderer.getMaterial()!.instanceId,
            bufferId: plant.mesh.vertexBufferBindings[0]!.buffer.instanceId,
            age: query.age,
            progress: query.state.progress,
            target: e.timeline.target,
            visible: e.visibility >= 0,
            distanceHidden: Boolean(e.distanceHidden),
            renderingActive: plant.root.isActiveInHierarchy,
            emergence: query.emergence,
            resources: query.resources,
            updates: plant.updateCount,
            uploadedBytes: plant.uploadedBytes
          };
        })
    };
  }
}
