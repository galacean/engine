import { Script, Color, Vector4, type PBRMaterial, MeshRenderer, type Engine, type Entity } from "@galacean/engine";
import type { PlantingCatalog } from "../../content/PlantingCatalog";
import { validatePlantRenderState, type PlantRenderState } from "../../presentation/PlantRenderState";
import {
  createProceduralPlant,
  defaultPlantCreationScheduler,
  type PlantCreationScheduler
} from "./createProceduralPlant";
import { shapeSeedForId } from "../../domain/FarmingGround";
import { sampleColorCurve } from "../core/curves";
import { acquireMaturePlant, type MaturePlantLease } from "./MaturePlantResources";
import { preparePlantShaderPrograms } from "./preparePlantShaderPrograms";
import { ProceduralPlant } from "./ProceduralPlant";

/** Scene/host destruction is also a resource release boundary, including deferred frame teardown. */
class PlantInstanceLifetime extends Script {
  release?: () => void;
  override onDestroy(): void {
    this.release?.();
    this.release = undefined;
  }
}

export interface PlantResourceState {
  readonly mode: "dynamic" | "pending" | "shared" | "error";
  readonly key?: string;
  readonly references: number;
  readonly message?: string;
  readonly meshId?: number;
  readonly materialId?: number;
}
export interface PlantInstance {
  readonly plant: ProceduralPlant;
  update(state: PlantRenderState): void;
  query(): Readonly<{
    state: PlantRenderState;
    stageId: string;
    stageName: string;
    age: number;
    emergence: number;
    resources: PlantResourceState;
  }>;
  retrySharing(): void;
  dispose(): void;
}

/** The only planting renderer factory. No stage models, gameplay clocks or host layout. */
export async function createPlantInstance(
  catalog: PlantingCatalog,
  engine: Engine,
  parent: Entity,
  input: PlantRenderState,
  signal?: AbortSignal,
  schedule: PlantCreationScheduler = defaultPlantCreationScheduler,
  maximumShadowTriangles = Infinity
): Promise<PlantInstance> {
  let state = validatePlantRenderState(catalog, input);
  if (signal?.aborted || engine.destroyed || parent.destroyed) throw new Error("植物宿主已释放");
  const definition = catalog.getPlant(state.plantId);
  const mapping = catalog.getMapping(state.cropId);
  const applyEmergence = (plant: ProceduralPlant, progress: number) => {
    const emergence = mapping.emergence(progress);
    plant.root.transform.setScale(emergence, emergence, emergence);
    plant.root.isActive = emergence > 0;
  };
  const admitted: PlantCreationScheduler = (work, phase, phaseSignal) => {
    const signals = [signal, phaseSignal].filter((s): s is AbortSignal => Boolean(s));
    const guarded = () => {
      for (const current of signals) current.throwIfAborted();
      if (engine.destroyed || parent.destroyed) throw new Error("植物宿主已释放");
      return work();
    };
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        for (const current of signals) current.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        reject(signals.find((s) => s.aborted)?.reason);
      };
      if (signals.some((s) => s.aborted)) {
        abort();
        return;
      }
      for (const current of signals) current.addEventListener("abort", abort, { once: true });
      try {
        schedule(guarded, phase, phaseSignal).then(
          (value) => {
            cleanup();
            resolve(value);
          },
          (error) => {
            cleanup();
            reject(error);
          }
        );
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  };
  const lifetime = new AbortController();
  const abortLifetime = () => lifetime.abort();
  signal?.addEventListener("abort", abortLifetime, { once: true });
  let pending: MaturePlantLease | undefined;
  let shared: MaturePlantLease | undefined;
  let attempt: AbortController | undefined;
  let resourceError: string | undefined;
  let disposed = false;
  let generation = 0;
  let preparingPlant: ProceduralPlant | undefined;
  let growth: Awaited<ReturnType<typeof createProceduralPlant>> | undefined;
  let plant: ProceduralPlant;
  const configure = (current: ProceduralPlant) => {
    const castShadows = current.geometry.indices.length / 3 <= maximumShadowTriangles;
    for (const renderer of current.root.getComponentsIncludeChildren(MeshRenderer, []))
      renderer.castShadows = castShadows;
    current.root.transform.setRotation(0, (shapeSeedForId("crop-yaw:" + state.instanceId) / 2 ** 32) * 360, 0);
    applyEmergence(current, state.progress);
  };
  const cancelPending = () => {
    generation++;
    preparingPlant?.dispose();
    preparingPlant = undefined;
    attempt?.abort();
    attempt = undefined;
    pending?.release();
    pending = undefined;
  };
  const newLease = () => {
    attempt = new AbortController();
    // The lease follows this attempt, not whichever crop first queued the build.
    return acquireMaturePlant(engine, definition, state.shape, admitted, attempt.signal);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    // Unbind the visible borrower before cancelling its last resource lease.
    plant?.dispose();
    growth?.dispose();
    cancelPending();
    signal?.removeEventListener("abort", abortLifetime);
    lifetime.abort();
    shared?.release();
    shared = undefined;
  };
  lifetime.signal.addEventListener("abort", dispose, { once: true });
  try {
    if (state.progress === 1) {
      const lease = (pending = newLease());
      const source = await lease.ready;
      await admitted(() => {
        plant = new ProceduralPlant(
          source.recipe,
          engine,
          parent,
          source.renderer.getMaterial()! as PBRMaterial,
          undefined,
          { plant: source, release: lease.release }
        );
        plant.root.isActive = false;
        configure(plant);
        plant.root.isActive = false;
      }, "gpu");
      await preparePlantShaderPrograms(engine, plant!.root, admitted, true);
      await admitted(() => {
        shared = lease;
        pending = undefined;
        attempt = undefined;
        configure(plant);
      }, "publish");
    } else {
      const created = await createProceduralPlant(
        definition,
        engine,
        parent,
        mapping.age(state.progress),
        admitted,
        state.shape,
        configure
      );
      // Cancellation may have run while the factory was publishing its result.
      // That cleanup could not see this instance yet, so release the late owner here.
      if (disposed) {
        created.dispose();
        throw new Error("植物创建已取消");
      }
      growth = created;
      plant = growth.plant;
    }
    if (lifetime.signal.aborted || engine.destroyed || parent.destroyed) throw new Error("植物创建已取消");
  } catch (error) {
    dispose();
    throw error;
  }

  const prepareShared = () => {
    if (
      disposed ||
      state.progress !== 1 ||
      plant.shared ||
      plant.hasAnchorOffsets ||
      pending ||
      resourceError ||
      plant.bindingHeld
    )
      return;
    const version = ++generation;
    const lease = (pending = newLease());
    const attemptSignal = attempt!.signal;
    const step: PlantCreationScheduler = (work, phase) =>
      admitted(
        () => {
          attemptSignal.throwIfAborted();
          if (version !== generation || disposed) throw new Error("成熟绑定已过期");
          return work();
        },
        phase,
        attemptSignal
      );
    void (async () => {
      let candidate: ProceduralPlant | undefined;
      try {
        const source = await lease.ready;
        await step(() => {
          if (disposed || version !== generation) throw new Error("成熟绑定已过期");
          preparingPlant = candidate = new ProceduralPlant(
            source.recipe,
            engine,
            parent,
            source.renderer.getMaterial()! as PBRMaterial,
            undefined,
            { plant: source, release: () => {} }
          );
          candidate.root.isActive = false;
          for (const renderer of candidate.root.getComponentsIncludeChildren(MeshRenderer, []))
            renderer.castShadows = plant.renderer.castShadows;
        }, "gpu");
        await preparePlantShaderPrograms(engine, candidate!.root, step, true);
        await step(() => {
          if (disposed || version !== generation || plant.bindingHeld) throw new Error("成熟绑定已过期");
          if (plant.hasAnchorOffsets) {
            candidate?.dispose();
            lease.release();
            pending = undefined;
            attempt = undefined;
            return;
          }
          plant.borrow(source, lease.release);
          shared = lease;
          pending = undefined;
          attempt = undefined;
        }, "publish");
      } catch (error) {
        candidate?.dispose();
        if (preparingPlant === candidate) preparingPlant = undefined;
        lease.release();
        if (!disposed && version === generation) {
          pending = undefined;
          if (!plant.bindingHeld) resourceError = error instanceof Error ? error.message : String(error);
        }
      } finally {
        candidate?.dispose();
        if (preparingPlant === candidate) preparingPlant = undefined;
      }
    })();
  };
  const instance: PlantInstance = {
    plant: plant!,
    update(input) {
      if (disposed) throw new Error("植物实例已释放");
      const next = validatePlantRenderState(catalog, input);
      if (next.instanceId !== state.instanceId || next.cropId !== state.cropId) throw new Error("不能改变植物实例身份");
      const changed =
        next.progress !== state.progress ||
        Object.keys(next.shape).some(
          (key) => next.shape[key as keyof typeof next.shape] !== state.shape[key as keyof typeof state.shape]
        );
      if (changed) {
        cancelPending();
        resourceError = undefined;
      }
      if (growth) growth.setGrowth(mapping.age(next.progress), next.shape);
      else plant.setGrowth(mapping.age(next.progress), next.shape);
      if (!plant.shared && definition.material.tintColors) {
        const color = sampleColorCurve(definition.material.tintColors, plant.geometry.maturity);
        for (const renderer of plant.root.getComponentsIncludeChildren(MeshRenderer, []))
          renderer.shaderData.setVector4(
            "renderer_OrganTint",
            new Vector4(...(color.map(Color.gammaToLinearSpace) as [number, number, number]), 1)
          );
      }
      if (!plant.shared) shared = undefined;
      applyEmergence(plant, next.progress);
      state = next;
      prepareShared();
    },
    query() {
      const stages = catalog.getCrop(state.cropId).cycle.stages;
      const stage = [...stages].reverse().find((s) => s.minimumProgress <= state.progress)!;
      return Object.freeze({
        state,
        stageId: stage.id,
        stageName: stage.name,
        age: mapping.age(state.progress),
        emergence: mapping.emergence(state.progress),
        resources: Object.freeze({
          mode: plant.shared
            ? ("shared" as const)
            : resourceError
              ? ("error" as const)
              : pending
                ? ("pending" as const)
                : ("dynamic" as const),
          key: (plant.shared ? shared : pending)?.key,
          references: (plant.shared ? shared : pending)?.references ?? 0,
          message: resourceError,
          meshId: plant.mesh.instanceId,
          materialId: plant.renderer.getMaterial()?.instanceId
        })
      });
    },
    retrySharing() {
      resourceError = undefined;
      prepareShared();
    },
    dispose
  };
  plant!.root.addComponent(PlantInstanceLifetime).release = dispose;
  plant!.onBindingChange?.((held) => {
    if (held) cancelPending();
    else prepareShared();
  });
  return instance;
}
