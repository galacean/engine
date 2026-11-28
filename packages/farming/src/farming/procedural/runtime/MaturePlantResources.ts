import { Entity, type Engine } from "@galacean/engine";
import type { PlantGrowthDefinition } from "../core/PlantGrowthDefinition";
import { freezePlantContent } from "../core/immutable";
import type { PlantShape } from "../core/PlantGrowthRecipe";
import {
  createProceduralPlant,
  type PlantCreationScheduler,
  type PlantCreationPhase,
  type PlantGrowthInstance
} from "./createProceduralPlant";
import type { ProceduralPlant } from "./ProceduralPlant";

interface Waiter {
  schedule: PlantCreationScheduler;
  signal: AbortSignal;
}
interface Entry {
  label: string;
  waiters: Set<Waiter>;
  promise: Promise<PlantGrowthInstance>;
  instance?: PlantGrowthInstance;
  host: Entity;
  released: boolean;
  admit?: (waiter: Waiter) => void;
  cancelAdmission?: () => void;
  recheckAdmission?: () => void;
}
interface Pool {
  entries: Map<string, Entry>;
  uploads: number;
  uploadedBytes: number;
  sequence: number;
}
const pools = new WeakMap<Engine, Pool>();
// One key per immutable definition, not a growing cache of authoring shapes or GPU resources.
const signatures = new WeakMap<PlantGrowthDefinition, { signature: string; shapeKey?: string; key?: string }>();
function poolFor(engine: Engine): Pool {
  let pool = pools.get(engine);
  if (!pool) pools.set(engine, (pool = { entries: new Map(), uploads: 0, uploadedBytes: 0, sequence: 0 }));
  return pool;
}
/** Exact serialized content is the lookup key; no lossy hash can alias authoring variants. */
export function maturePlantResourceKey(definition: PlantGrowthDefinition, shape: PlantShape): string {
  let cached = signatures.get(definition);
  if (!cached) {
    const signature = JSON.stringify([
      definition.id,
      definition.revision,
      definition.recipe,
      definition.atlasUrl,
      definition.material
    ]);
    // Catalog definitions are immutable. Mutable preview inputs are deliberately not cached.
    if (Object.isFrozen(definition) && Object.isFrozen(definition.recipe) && Object.isFrozen(definition.material))
      signatures.set(definition, (cached = { signature }));
    else return JSON.stringify([signature, shape.leafSpread, shape.stemBend, shape.fruitScale]);
  }
  const shapeKey = JSON.stringify([shape.leafSpread, shape.stemBend, shape.fruitScale]);
  if (cached.shapeKey !== shapeKey) {
    cached.shapeKey = shapeKey;
    cached.key = JSON.stringify([cached.signature, shape.leafSpread, shape.stemBend, shape.fruitScale]);
  }
  return cached.key!;
}
export interface MaturePlantLease {
  readonly key: string;
  readonly ready: Promise<ProceduralPlant>;
  readonly references: number;
  release(): void;
}

/** Engine-local resource owner. A build step can be admitted by ANY live consumer's frame queue. */
export function acquireMaturePlant(
  engine: Engine,
  definition: PlantGrowthDefinition,
  shape: PlantShape,
  schedule: PlantCreationScheduler,
  signal: AbortSignal
): MaturePlantLease {
  signal.throwIfAborted();
  const pool = poolFor(engine),
    key = maturePlantResourceKey(definition, shape);
  let entry = pool.entries.get(key);
  const waiter = { schedule, signal };
  if (!entry) {
    const host = new Entity(engine, `mature-resource-${definition.id}`);
    host.isActive = false;
    entry = {
      label: `${definition.id}@${definition.revision}:${++pool.sequence}`,
      host,
      waiters: new Set(),
      promise: undefined!,
      released: false
    };
    pool.entries.set(key, entry);
    const owner = entry;
    const sharedSchedule: PlantCreationScheduler = <T>(work: () => T, phase: PlantCreationPhase) =>
      new Promise<T>((resolve, reject) => {
        const phaseController = new AbortController();
        let started = false;
        const failures = new Map<Waiter, unknown>();
        const finish = () => {
          owner.admit = undefined;
          owner.cancelAdmission = undefined;
          owner.recheckAdmission = undefined;
          phaseController.abort();
        };
        owner.cancelAdmission = () => {
          finish();
          reject(new Error("成熟资源构建已取消"));
        };
        owner.recheckAdmission = () => {
          if (!started && owner.waiters.size && [...owner.waiters].every((w) => w.signal.aborted || failures.has(w))) {
            finish();
            reject(failures.values().next().value ?? new Error("成熟资源没有有效的调度宿主"));
          }
        };
        owner.admit = (consumer) => {
          if (consumer.signal.aborted || started) return;
          // Every live waiter offers admission; the first visible host runs the phase once.
          // The phase signal removes losing admissions from the existing frame queue.
          void consumer
            .schedule(
              () => {
                if (started) return;
                consumer.signal.throwIfAborted();
                if (owner.released || engine.destroyed) throw new Error("成熟资源已释放");
                started = true;
                try {
                  resolve(work());
                } catch (error) {
                  reject(error);
                } finally {
                  finish();
                }
              },
              phase,
              phaseController.signal
            )
            .catch((error) => {
              if (!started && !phaseController.signal.aborted && !consumer.signal.aborted) {
                failures.set(consumer, error);
                owner.recheckAdmission?.();
              }
            });
        };
        for (const consumer of owner.waiters) owner.admit?.(consumer);
        if (!owner.waiters.size || owner.released) owner.cancelAdmission?.();
      });
    // Start after the first lease has joined; all synchronous phases are queue admitted.
    owner.promise = Promise.resolve()
      .then(() =>
        createProceduralPlant(definition, engine, host, 1, sharedSchedule, { ...shape }, (plant) => {
          freezePlantContent(plant.geometry);
        })
      )
      .then((instance) => {
        if (owner.released) {
          instance.dispose();
          throw new Error("成熟资源已释放");
        }
        owner.instance = instance;
        pool.uploads++;
        const mesh = instance.plant.mesh;
        pool.uploadedBytes +=
          mesh.vertexBufferBindings.reduce((n, b) => n + (b?.buffer.byteLength ?? 0), 0) +
          instance.plant.geometry.indices.length * (instance.plant.geometry.positions.length > 65535 ? 4 : 2);
        return instance;
      })
      .catch((error) => {
        if (pool.entries.get(key) === owner) pool.entries.delete(key);
        throw error;
      });
  }
  const owner = entry;
  owner.waiters.add(waiter);
  let released = false;
  let rejectReady: ((reason: unknown) => void) | undefined;
  const release = () => {
    if (released) return;
    released = true;
    rejectReady?.(signal.reason ?? new Error("成熟资源引用已释放"));
    signal.removeEventListener("abort", release);
    owner.waiters.delete(waiter);
    owner.recheckAdmission?.();
    if (owner.waiters.size) return;
    owner.released = true;
    owner.cancelAdmission?.();
    if (pool.entries.get(key) === owner) pool.entries.delete(key);
    owner.instance?.dispose();
    owner.host.destroy();
  };
  signal.addEventListener("abort", release, { once: true });
  // Observe the build even when every consumer cancels before awaiting it.
  const ready = new Promise<ProceduralPlant>((resolve, reject) => {
    rejectReady = reject;
    owner.promise.then((instance) => {
      if (released || signal.aborted) reject(signal.reason ?? new Error("成熟资源引用已释放"));
      else resolve(instance.plant);
    }, reject);
  });
  if (signal.aborted) release();
  else owner.admit?.(waiter);
  void ready.catch(() => {});
  return {
    key: owner.label,
    ready,
    get references() {
      return owner.waiters.size;
    },
    release
  };
}
export function maturePlantResourceDiagnostics(engine: Engine) {
  const pool = poolFor(engine);
  return Object.freeze({
    entries: pool.entries.size,
    references: [...pool.entries.values()].reduce((n, e) => n + e.waiters.size, 0),
    uploads: pool.uploads,
    uploadedBytes: pool.uploadedBytes,
    resources: [...pool.entries.values()].map((e) =>
      Object.freeze({
        key: e.label,
        references: e.waiters.size,
        ready: Boolean(e.instance),
        meshId: e.instance?.plant.mesh.instanceId,
        materialId: e.instance?.plant.renderer.getMaterial()?.instanceId
      })
    )
  });
}
