import { planningHeightmap } from "../../../semantic-study/PlanningHeightmap.ts";
import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import { rockFormationJobs } from "./Jobs.ts";
import { rockGeometrySettings, type RockFormationSettings } from "./Settings.ts";
import type { RockFormationJob, RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import { rockGrassBuffers } from "@galacean/engine-terrain/rock-formation/GrassSurface";

const CACHE_BYTES = 64 * 1024 * 1024;

/** One bounded worker and immutable CPU meshes shared by hidden publication candidates. */
export class RockFormationClient {
  private worker?: Worker;
  private id = 0;
  private disposed = false;
  private readonly pending = new Map<
    number,
    { resolve(result: RockFormationMesh): void; reject(error: unknown): void }
  >();
  private readonly cache = new Map<string, { result: RockFormationMesh; bytes: number }>();
  private readonly requestedKeys = new Map<string, number>();
  private bytes = 0;
  private readonly sourceIds = new WeakMap<object, number>();
  private sourceSequence = 0;
  private readonly resultKeys = new WeakMap<RockFormationMesh, string>();
  preparationMetrics = { totalMs: 0, generated: 0, cached: 0, generationMs: 0 };

  async prepare(
    plan: IslandPlan,
    settings: RockFormationSettings,
    signal: AbortSignal,
    resident: readonly RockFormationMesh[] = []
  ): Promise<readonly RockFormationMesh[]> {
    signal.throwIfAborted();
    if (this.disposed) throw new Error("Rock formation client disposed");
    const terrain = planningHeightmap(plan);
    const terrainId = this.sourceIdentity(terrain.heights);
    // Canonical terrain snapshots are immutable. Key their residency plus the
    // crop inputs instead of stringifying every sample in all ground crops.
    return this.runJobs(
      rockFormationJobs(plan, terrain),
      settings,
      signal,
      (job) =>
        JSON.stringify([
          "plan",
          job.id,
          job.seed,
          job.origin,
          job.guides,
          job.domain,
          job.surfaceGrass !== false,
          terrainId,
          terrain.resolution,
          terrain.spacingX,
          terrain.spacingZ,
          rockGeometrySettings(settings)
        ]),
      resident
    );
  }

  /** Generate local rock sources through the same worker; ground arrays must be immutable snapshots. */
  async prepareJobs(
    jobs: readonly RockFormationJob[],
    settings: RockFormationSettings,
    signal: AbortSignal
  ): Promise<readonly RockFormationMesh[]> {
    return this.runJobs(jobs, settings, signal, (job) => {
      const ground = job.ground;
      return JSON.stringify([
        "job",
        job.id,
        job.seed,
        job.origin,
        job.guides,
        job.domain,
        job.surfaceGrass !== false,
        this.sourceIdentity(ground.heights),
        ground.minX,
        ground.minZ,
        ground.spacingX,
        ground.spacingZ,
        ground.columns,
        ground.rows,
        rockGeometrySettings(settings)
      ]);
    });
  }

  private sourceIdentity(source: object | undefined): number {
    if (!source) return 0;
    let id = this.sourceIds.get(source);
    if (id === undefined) {
      id = ++this.sourceSequence;
      this.sourceIds.set(source, id);
    }
    return id;
  }

  private async runJobs(
    jobs: readonly RockFormationJob[],
    settings: RockFormationSettings,
    signal: AbortSignal,
    cacheKey: (job: RockFormationJob) => string,
    resident: readonly RockFormationMesh[] = []
  ): Promise<readonly RockFormationMesh[]> {
    signal.throwIfAborted();
    if (this.disposed) throw new Error("Rock formation client disposed");
    const started = performance.now();
    let generated = 0,
      cached = 0,
      generationMs = 0;
    const results: RockFormationMesh[] = [];
    // Live scene ownership already retains these meshes. Reuse them even when the
    // optional history cache is full, without extending that cache's byte budget.
    const live = new Map(resident.map((result) => [this.resultKeys.get(result), result]));
    const keys = jobs.map(cacheKey),
      requested = new Set(keys);
    for (const key of requested) this.requestedKeys.set(key, (this.requestedKeys.get(key) ?? 0) + 1);
    try {
      for (const [index, job] of jobs.entries()) {
        signal.throwIfAborted();
        if (this.disposed) throw new Error("Rock formation client disposed");
        const key = keys[index],
          entry = this.cache.get(key);
        let result: RockFormationMesh;
        const retained = live.get(key) ?? entry?.result;
        if (retained) {
          result = retained;
          cached++;
          if (entry) {
            this.cache.delete(key);
            this.cache.set(key, entry);
          }
        } else {
          const id = ++this.id,
            worker = this.getWorker();
          result = await new Promise<RockFormationMesh>((resolve, reject) => {
            const abort = () => {
              this.pending.delete(id);
              reject(signal.reason);
              // Terminate synchronous CPU generation as soon as its publication is superseded.
              // A newer publication may already have queued work on this worker.
              // Preserve that request; the old reply will be ignored by its ID.
              if (!this.pending.size) this.resetWorker(new Error("Rock generation superseded"));
            };
            this.pending.set(id, {
              resolve: (value) => {
                signal.removeEventListener("abort", abort);
                resolve(value);
              },
              reject: (error) => {
                signal.removeEventListener("abort", abort);
                reject(error);
              }
            });
            signal.addEventListener("abort", abort, { once: true });
            try {
              worker.postMessage({ id, job, settings });
            } catch (error) {
              this.pending.get(id)?.reject(error);
              this.pending.delete(id);
            }
          });
          signal.throwIfAborted();
          generated++;
          generationMs += result.stats.generationMs;
          this.retain(key, result);
        }
        this.resultKeys.set(result, key);
        results.push(result);
      }
      this.preparationMetrics = { totalMs: performance.now() - started, generated, cached, generationMs };
      return results;
    } finally {
      for (const key of requested) {
        const remaining = this.requestedKeys.get(key)! - 1;
        if (remaining) this.requestedKeys.set(key, remaining);
        else this.requestedKeys.delete(key);
      }
    }
  }
  private retain(key: string, result: RockFormationMesh): void {
    const bytes = cacheEntryBytes(key, result);
    if (bytes > CACHE_BYTES) return;
    const previous = this.cache.get(key),
      needed = bytes - (previous?.bytes ?? 0);
    let available = CACHE_BYTES - this.bytes;
    const evicted: string[] = [];
    // Do not evict meshes that another iteration of this publication still needs.
    // If the working set exceeds the byte budget, retain a stable subset instead
    // of regenerating every entry on each sequential replay.
    if (needed > available)
      for (const [candidate, entry] of this.cache) {
        if (this.requestedKeys.has(candidate)) continue;
        evicted.push(candidate);
        available += entry.bytes;
        if (needed <= available) break;
      }
    if (needed > available) return;
    for (const candidate of evicted) {
      this.bytes -= this.cache.get(candidate)!.bytes;
      this.cache.delete(candidate);
    }
    if (previous) this.bytes -= previous.bytes;
    this.cache.delete(key);
    this.cache.set(key, { result, bytes });
    this.bytes += bytes;
  }
  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = (this.worker = new Worker(new URL("./RockFormation.worker.ts", import.meta.url), {
      type: "module"
    }));
    worker.onmessage = ({ data }) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data.result);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.resetWorker(new Error(event.message));
    };
    return worker;
  }
  private resetWorker(error: unknown): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
  dispose(): void {
    this.disposed = true;
    this.resetWorker(new Error("Rock formation client disposed"));
    this.cache.clear();
    this.bytes = 0;
  }
}
/** Budget binary payload, 64-bit owner slots and UTF-16 metadata; not a VM-specific heap measurement. */
function cacheEntryBytes(key: string, result: RockFormationMesh): number {
  const paintedBytes = result.painted
    ? Object.values(result.painted).reduce(
        (sum, value) => sum + (value instanceof Float32Array ? value.byteLength : 0),
        0
      )
    : 0;
  return (
    result.mesh.positions.byteLength +
    result.mesh.indices.byteLength +
    (result.mesh.normals?.byteLength ?? 0) +
    (result.mesh.restPositions?.byteLength ?? 0) +
    paintedBytes +
    (result.triangleSurfaces?.byteLength ?? 0) +
    rockGrassBuffers(result.grass).reduce((sum, buffer) => sum + buffer.byteLength, 0) +
    result.owners.length * Float64Array.BYTES_PER_ELEMENT +
    2 * (key.length + JSON.stringify([result.id, result.origin, result.owners, result.stats]).length)
  );
}
