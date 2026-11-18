import {
  compileRockGrassPatch,
  ROCK_GRASS_PATCH_METRES,
  type RockGrassCompilationMetrics,
  type RockGrassPatch,
  type RockGrassSampling
} from "./GrassSurface";
import type { RockFormationMesh, V3 } from "./types";

export interface RockGrassPlacement {
  formation: RockFormationMesh;
  origin: V3;
}
interface PatchState<B> {
  source: RockGrassPatch;
  batches: B[];
  task?: ReturnType<typeof compileRockGrassPatch>;
  complete: boolean;
  metrics: RockGrassCompilationMetrics;
}
interface Entry<B> extends RockGrassPlacement {
  patches: PatchState<B>[];
}
interface Work<B> {
  entry: Entry<B>;
  patch: PatchState<B>;
  distance: number;
}

/** Surface adapter for Seed World's existing grass batches, materials and wind.
 * CPU sampling is resumable; publication neither compiles candidates nor uploads buffers. */
export class RockGrassPatches<B> {
  private entries = new Map<string, Entry<B>>();
  private queue: Work<B>[] = [];
  private residents: Work<B>[] = [];
  private retired: B[] = [];
  // Scalar residency/sampling keys keep the per-frame update allocation-free
  private cameraCellX = NaN;
  private cameraCellY = NaN;
  private cameraCellZ = NaN;
  private cameraDistance = NaN;
  private cameraEnabled = false;
  private hasSampling = false;
  private samplingDensity?: number;
  private samplingMinimumScale?: number;
  private samplingMaximumScale?: number;
  private samplingRootRadius?: number;
  private allowed: RockGrassSampling["allowed"] = () => true;
  private disposed = false;
  private lastEnabled = false;
  private dirty = true;
  private maxSliceMs = 0;
  private maxQuantumMs = 0;
  private uploads = 0;
  private error?: string;
  private lastEdit = { changed: 0, retained: 0, removed: 0 };

  constructor(
    private readonly render: {
      create(transforms: Float32Array, key: string, origin: V3, patch: RockGrassPatch): B;
      visible(batch: B, visible: boolean): void;
      destroy(batch: B): void;
      now?: () => number;
    }
  ) {}

  prepare(placements: readonly RockGrassPlacement[], allowed: RockGrassSampling["allowed"]) {
    const frame = this.prepareReversible(placements, allowed);
    return {
      ...frame,
      commit: () => {
        frame.commit();
        frame.finalize();
      }
    };
  }

  /** Keep retired buffers alive until every owner in the publication has committed. */
  prepareReversible(placements: readonly RockGrassPlacement[], allowed: RockGrassSampling["allowed"], refresh = false) {
    if (this.disposed) throw Error("Rock grass disposed");
    const base = this.entries,
      next = new Map<string, Entry<B>>();
    const oldAllowed = this.allowed,
      oldEdit = this.lastEdit,
      oldError = this.error;
    let changed = 0,
      retained = 0;
    for (const placement of placements) {
      const current = base.get(placement.formation.id);
      if (
        !refresh &&
        current?.formation === placement.formation &&
        current.origin.every((v, i) => v === placement.origin[i])
      ) {
        next.set(placement.formation.id, current);
        retained++;
      } else {
        next.set(placement.formation.id, {
          ...placement,
          patches: (placement.formation.grass?.patches ?? []).map((source) => ({
            source,
            batches: [],
            complete: false,
            metrics: emptyMetrics()
          }))
        });
        changed++;
      }
    }
    const removed = [...base.keys()].filter((id) => !next.has(id)).length;
    let state: "prepared" | "committed" | "finished" = "prepared";
    const retire = (from: Map<string, Entry<B>>, to: Map<string, Entry<B>>) => {
      for (const [id, entry] of from) if (to.get(id) !== entry) for (const patch of entry.patches) this.release(patch);
    };
    const rollback = () => {
      if (state !== "committed") return;
      retire(next, base);
      this.entries = base;
      this.allowed = oldAllowed;
      this.lastEdit = oldEdit;
      this.error = oldError;
      this.dirty = true;
      for (const { patch } of this.residents)
        for (const batch of patch.batches) this.render.visible(batch, this.lastEnabled);
      state = "prepared";
    };
    return {
      metrics: { grassFormationsChanged: changed, grassFormationsRetained: retained, grassFormationsRemoved: removed },
      commit: () => {
        if (state !== "prepared" || this.disposed || this.entries !== base) throw Error("Stale rock grass publication");
        state = "committed";
        this.entries = next;
        this.allowed = allowed;
        this.dirty = true;
        this.error = undefined;
        this.lastEdit = { changed, retained, removed };
        try {
          for (const [id, entry] of base)
            if (next.get(id) !== entry)
              for (const patch of entry.patches) for (const batch of patch.batches) this.render.visible(batch, false);
        } catch (error) {
          rollback();
          throw error;
        }
      },
      rollback,
      finalize: () => {
        if (state !== "committed") throw Error("Rock grass publication not committed");
        retire(base, next);
        state = "finished";
      },
      discard: () => {
        if (state !== "finished") {
          rollback();
          state = "finished";
        }
      }
    };
  }

  /** Called by the population owner each frame. At most 1 upload and 2 retirements;
   * candidate loops yield every eight attempts, including rejection-heavy surfaces. */
  update(
    camera: V3,
    distance: number,
    enabled: boolean,
    sampling: Omit<RockGrassSampling, "allowed">,
    budgetMs = 2
  ): void {
    if (this.disposed) return;
    this.lastEnabled = enabled;
    const now = this.render.now ?? performanceNow,
      started = now();
    for (let i = 0; i < 2 && this.retired.length; i++) this.render.destroy(this.retired.pop()!);
    if (
      !this.hasSampling ||
      !sameKey(sampling.density, this.samplingDensity) ||
      !sameKey(sampling.minimumScale, this.samplingMinimumScale) ||
      !sameKey(sampling.maximumScale, this.samplingMaximumScale) ||
      !sameKey(sampling.rootRadius, this.samplingRootRadius)
    ) {
      // The first sampling configuration has no compiled patches to release
      if (this.hasSampling)
        for (const entry of this.entries.values()) for (const patch of entry.patches) this.release(patch);
      this.hasSampling = true;
      this.samplingDensity = sampling.density;
      this.samplingMinimumScale = sampling.minimumScale;
      this.samplingMaximumScale = sampling.maximumScale;
      this.samplingRootRadius = sampling.rootRadius;
      this.dirty = true;
    }
    const cellX = Math.floor(camera[0] / ROCK_GRASS_PATCH_METRES),
      cellY = Math.floor(camera[1] / ROCK_GRASS_PATCH_METRES),
      cellZ = Math.floor(camera[2] / ROCK_GRASS_PATCH_METRES);
    if (
      this.dirty ||
      !sameKey(cellX, this.cameraCellX) ||
      !sameKey(cellY, this.cameraCellY) ||
      !sameKey(cellZ, this.cameraCellZ) ||
      distance !== this.cameraDistance ||
      enabled !== this.cameraEnabled
    ) {
      this.cameraCellX = cellX;
      this.cameraCellY = cellY;
      this.cameraCellZ = cellZ;
      this.cameraDistance = distance;
      this.cameraEnabled = enabled;
      this.dirty = false;
      this.queue = [];
      this.residents = [];
      for (const entry of this.entries.values())
        for (const patch of entry.patches) {
          const d = patchDistanceSquared(entry, patch.source, camera);
          // One patch of hysteresis prevents camera jitter at the draw boundary from rebuilding grass.
          const resident = d <= (distance + ROCK_GRASS_PATCH_METRES) ** 2;
          if (!resident) {
            if (patch.task || patch.complete || patch.batches.length) this.release(patch);
            continue;
          }
          const work = { entry, patch, distance: d };
          this.residents.push(work);
          if (!patch.complete) this.queue.push(work);
        }
      this.queue.sort((a, b) => b.distance - a.distance);
    }
    for (const { patch } of this.residents) for (const batch of patch.batches) this.render.visible(batch, enabled);
    let uploaded = false,
      quanta = 0;
    while (
      enabled &&
      sampling.density > 0 &&
      this.queue.length &&
      !uploaded &&
      now() - started < budgetMs &&
      quanta++ < 128
    ) {
      const { entry, patch } = this.queue[this.queue.length - 1];
      patch.task ??= compileRockGrassPatch(
        entry.formation,
        patch.source,
        entry.origin,
        { ...sampling, allowed: this.allowed },
        patch.metrics
      );
      const stepStarted = now(),
        step = patch.task.next();
      this.maxQuantumMs = Math.max(this.maxQuantumMs, now() - stepStarted);
      if (step.done) {
        patch.complete = true;
        patch.task = undefined;
        this.queue.pop();
      } else if (step.value) {
        try {
          const batch = this.render.create(
            step.value,
            `${entry.formation.id}/${patch.source.x}/${patch.source.z}/${patch.batches.length}`,
            entry.origin,
            patch.source
          );
          patch.batches.push(batch);
          this.render.visible(batch, true);
          this.uploads++;
          uploaded = true;
        } catch (error) {
          this.error = `${entry.formation.id}/${patch.source.x}/${patch.source.z}: ${String(error)}`;
          this.release(patch);
          patch.complete = true;
          this.queue.pop();
        }
      }
    }
    this.maxSliceMs = Math.max(this.maxSliceMs, now() - started);
  }

  visitBatches(visit: (batch: B) => void): void {
    for (const { patch } of this.residents) for (const batch of patch.batches) visit(batch);
  }

  get candidateCount(): number {
    return this.residents.reduce((count, { patch }) => count + patch.metrics.candidates, 0);
  }

  get diagnostics() {
    const formations = [...this.entries].map(([id, entry]) => ({
      id,
      patches: entry.patches.length,
      completed: entry.patches.filter((p) => p.complete).length,
      batches: entry.patches.reduce((n, p) => n + p.batches.length, 0),
      ...entry.patches.reduce((sum, p) => {
        for (const key of ["candidates", "accepted", "unsupported", "excluded"] as const) sum[key] += p.metrics[key];
        return sum;
      }, emptyMetrics())
    }));
    return {
      lastEdit: this.lastEdit,
      pendingPatches: this.queue.length,
      uploads: this.uploads,
      error: this.error,
      maxSliceMs: this.maxSliceMs,
      maxQuantumMs: this.maxQuantumMs,
      formations
    };
  }

  private release(patch: PatchState<B>): void {
    patch.task?.return();
    patch.task = undefined;
    patch.complete = false;
    patch.metrics = emptyMetrics();
    for (const batch of patch.batches) {
      this.render.visible(batch, false);
      this.retired.push(batch);
    }
    patch.batches = [];
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) for (const patch of entry.patches) this.release(patch);
    for (const batch of this.retired) this.render.destroy(batch);
    this.retired = [];
    this.queue = [];
    this.residents = [];
    this.entries.clear();
  }
}

function performanceNow(): number {
  return performance.now();
}
function emptyMetrics(): RockGrassCompilationMetrics {
  return { candidates: 0, accepted: 0, unsupported: 0, excluded: 0 };
}
function patchDistanceSquared(placement: RockGrassPlacement, patch: RockGrassPatch, camera: V3): number {
  const minX = placement.origin[0] + patch.x * ROCK_GRASS_PATCH_METRES,
    minY = placement.origin[1] + patch.minimumY,
    minZ = placement.origin[2] + patch.z * ROCK_GRASS_PATCH_METRES;
  return (
    axisDistance(camera[0], minX, minX + ROCK_GRASS_PATCH_METRES) ** 2 +
    axisDistance(camera[1], minY, placement.origin[1] + patch.maximumY) ** 2 +
    axisDistance(camera[2], minZ, minZ + ROCK_GRASS_PATCH_METRES) ** 2
  );
}
function axisDistance(value: number, min: number, max: number): number {
  return Math.max(min - value, value - max, 0);
}
/** Key equality matching the previous string keys: NaN equals NaN and signed zeros are equal. */
function sameKey(a: number | undefined, b: number | undefined): boolean {
  return a === b || (a !== a && b !== b);
}
