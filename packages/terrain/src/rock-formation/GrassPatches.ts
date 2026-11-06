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
  private cameraKey = "";
  private samplingKey = "";
  private allowed: RockGrassSampling["allowed"] = () => true;
  private disposed = false;
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
    if (this.disposed) throw Error("Rock grass disposed");
    const base = this.entries,
      next = new Map<string, Entry<B>>();
    let changed = 0,
      retained = 0;
    for (const placement of placements) {
      const current = base.get(placement.formation.id);
      if (current?.formation === placement.formation && current.origin.every((v, i) => v === placement.origin[i])) {
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
    let consumed = false;
    return {
      metrics: { grassFormationsChanged: changed, grassFormationsRetained: retained, grassFormationsRemoved: removed },
      commit: () => {
        if (consumed || this.disposed || this.entries !== base) throw Error("Stale rock grass publication");
        consumed = true;
        for (const [id, entry] of base)
          if (next.get(id) !== entry) for (const patch of entry.patches) this.release(patch);
        this.entries = next;
        this.allowed = allowed;
        this.dirty = true;
        this.error = undefined;
        this.lastEdit = { changed, retained, removed };
      },
      discard: () => {
        consumed = true;
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
    const now = this.render.now ?? (() => performance.now()),
      started = now();
    for (let i = 0; i < 2 && this.retired.length; i++) this.render.destroy(this.retired.pop()!);
    const samplingKey = `${sampling.density}/${sampling.minimumScale}/${sampling.maximumScale}/${sampling.rootRadius}`;
    if (samplingKey !== this.samplingKey) {
      if (this.samplingKey)
        for (const entry of this.entries.values()) for (const patch of entry.patches) this.release(patch);
      this.samplingKey = samplingKey;
      this.dirty = true;
    }
    const key = `${camera.map((v) => Math.floor(v / ROCK_GRASS_PATCH_METRES)).join("/")}/${distance}/${enabled}`;
    if (this.dirty || key !== this.cameraKey) {
      this.cameraKey = key;
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

function emptyMetrics(): RockGrassCompilationMetrics {
  return { candidates: 0, accepted: 0, unsupported: 0, excluded: 0 };
}
function patchDistanceSquared(placement: RockGrassPlacement, patch: RockGrassPatch, camera: V3): number {
  const min = [
    placement.origin[0] + patch.x * ROCK_GRASS_PATCH_METRES,
    placement.origin[1] + patch.minimumY,
    placement.origin[2] + patch.z * ROCK_GRASS_PATCH_METRES
  ];
  const max = [
    min[0] + ROCK_GRASS_PATCH_METRES,
    placement.origin[1] + patch.maximumY,
    min[2] + ROCK_GRASS_PATCH_METRES
  ];
  let squared = 0;
  for (let axis = 0; axis < 3; axis++) squared += Math.max(min[axis] - camera[axis], camera[axis] - max[axis], 0) ** 2;
  return squared;
}
