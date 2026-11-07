import { planningHeightmap } from "../../../semantic-study/PlanningHeightmap.ts";
import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import { rockFormationJobs } from "./Jobs.ts";
import { rockGeometrySettings, rockSettingsForJob, type RockFormationSettings } from "./Settings.ts";
import type { RockFormationJob, RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import { rockGrassBuffers } from "@galacean/engine-terrain/rock-formation/GrassSurface";

const CACHE_BYTES = 64 * 1024 * 1024;

/** One bounded worker and immutable CPU meshes shared by hidden publication candidates. */
export class RockFormationClient {
  private worker?: Worker;
  private workerReady?: Promise<void>;
  private readyResolve?: () => void;
  private id = 0;
  private disposed = false;
  private readonly pending = new Map<
    number,
    { resolve(result: RockFormationMesh): void; reject(error: unknown): void }
  >();
  private readonly cache = new Map<string, { result: RockFormationMesh; bytes: number }>();
  private readonly requestedKeys = new Map<string, number>();
  private bytes = 0;
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
    return this.runJobs(rockFormationJobs(plan, planningHeightmap(plan)), settings, signal, resident);
  }

  /** Local ground stones use the same generator and cache as published rocks. */
  async prepareJobs(
    jobs: readonly RockFormationJob[],
    settings: RockFormationSettings,
    signal: AbortSignal
  ): Promise<readonly RockFormationMesh[]> {
    return this.runJobs(jobs, settings, signal);
  }

  private async runJobs(
    jobs: readonly RockFormationJob[],
    settings: RockFormationSettings,
    signal: AbortSignal,
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
    const jobSettings = jobs.map((job) => rockSettingsForJob(settings, job.id));
    const keys = jobs.map((job, index) =>
        JSON.stringify([
          job.id,
          job.seed,
          job.origin,
          job.guides,
          job.surfaceGrass !== false,
          rockGeometrySettings(jobSettings[index])
        ])
      ),
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
            const send = () => {
              if (!this.pending.has(id) || this.worker !== worker) return;
              try {
                worker.postMessage({ id, job, settings: jobSettings[index] });
              } catch (error) {
                this.pending.get(id)?.reject(error);
                this.pending.delete(id);
              }
            };
            // Meshopt initializes through top-level await in the shared worker.
            // Its handler must be installed before the first request is sent.
            if (this.workerReady) void this.workerReady.then(send);
            else send();
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
    const worker = (this.worker = new Worker(new URL("./RockFormation.worker", import.meta.url), {
      type: "module"
    }));
    this.workerReady = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    worker.onmessage = ({ data }) => {
      if (this.worker !== worker) return;
      if (data.ready) {
        this.readyResolve?.();
        this.readyResolve = undefined;
        this.workerReady = undefined;
        return;
      }
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data.result);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (this.worker === worker) this.resetWorker(new Error(event.message));
    };
    return worker;
  }
  private resetWorker(error: unknown): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.readyResolve?.();
    this.readyResolve = undefined;
    this.workerReady = undefined;
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
  return (
    result.mesh.positions.byteLength +
    result.mesh.indices.byteLength +
    (result.mesh.normals?.byteLength ?? 0) +
    rockGrassBuffers(result.grass).reduce((sum, buffer) => sum + buffer.byteLength, 0) +
    result.owners.length * Float64Array.BYTES_PER_ELEMENT +
    2 * (key.length + JSON.stringify([result.id, result.origin, result.owners, result.stats]).length)
  );
}
