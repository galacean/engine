import { Script, Color, Vector4, type PBRMaterial, MeshRenderer, type Engine, type Entity } from "@galacean/engine";
import type { PlantingCatalog } from "../../content/PlantingCatalog";
import {
  isValidatedPlantRenderState,
  validatePlantRenderState,
  type PlantRenderState
} from "../../presentation/PlantRenderState";
import {
  createProceduralPlant,
  defaultPlantCreationScheduler,
  type PlantCreationScheduler
} from "./createProceduralPlant";
import { shapeSeedForId } from "../../domain/FarmingGround";
import { sampleColorCurveInto } from "../core/curves";
import { acquireMaturePlant, type MaturePlantLease } from "./MaturePlantResources";
import { ORGAN_TINT_PROPERTY } from "./PlantOrganMaterials";
import { plantDefinitionKey } from "./PlantResourcePool";
import { preparePlantShaderPrograms } from "./preparePlantShaderPrograms";
import { ProceduralPlant } from "./ProceduralPlant";
import type { PlantGrowthDefinition } from "../core/PlantGrowthDefinition";
import { loadPlantGrowthDefinition } from "./loadPlantGrowthDefinition";

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
  readonly definition: PlantGrowthDefinition;
  readonly plant: ProceduralPlant;
  update(state: PlantRenderState): void;
  /** Zero-allocation fast path for presenters holding an already-validated base state. Returns emergence. */
  updateValidated?(baseState: PlantRenderState, progress: number): number;
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
  const initialState = validatePlantRenderState(catalog, input);
  let baseState: PlantRenderState = initialState;
  let currentProgress = initialState.progress;
  let currentShape = initialState.shape;
  let materializedState: PlantRenderState | undefined = initialState;
  if (signal?.aborted || engine.destroyed || parent.destroyed) throw new Error("植物宿主已释放");
  const mapping = catalog.getMapping(initialState.cropId);
  const applyEmergence = (plant: ProceduralPlant, progress: number): number => {
    const emergence = mapping.emergence(progress);
    plant.root.transform.setScale(emergence, emergence, emergence);
    plant.root.isActive = emergence > 0;
    return emergence;
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
  const entry = catalog.getPlant(baseState.plantId);
  const definition = "recipe" in entry ? entry : await admitted(() => loadPlantGrowthDefinition(entry), "recipe");
  const definitionKey = plantDefinitionKey(definition);
  const tintColorScratch: [number, number, number] = [1, 1, 1];
  const tintRenderersScratch: MeshRenderer[] = [];
  signal?.throwIfAborted();
  if (engine.destroyed || parent.destroyed) throw new Error("植物宿主已释放");
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
    current.root.transform.setRotation(0, (shapeSeedForId("crop-yaw:" + baseState.instanceId) / 2 ** 32) * 360, 0);
    applyEmergence(current, currentProgress);
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
    return acquireMaturePlant(engine, definition, currentShape, admitted, attempt.signal);
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
    if (currentProgress === 1) {
      const lease = (pending = newLease());
      const source = await lease.ready;
      await admitted(() => {
        plant = new ProceduralPlant(
          source.recipe,
          engine,
          parent,
          source.renderer.getMaterial()! as PBRMaterial,
          undefined,
          { plant: source, release: lease.release },
          currentShape,
          { definitionKey, poolGrowth: true }
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
        mapping.age(currentProgress),
        admitted,
        currentShape,
        configure,
        { poolGrowth: true }
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
      currentProgress !== 1 ||
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
  const applyStateUpdate = (
    nextBase: PlantRenderState,
    nextProgress: number,
    nextMaterialized: PlantRenderState | undefined
  ): number => {
    if (nextBase.instanceId !== baseState.instanceId || nextBase.cropId !== baseState.cropId) {
      throw new Error("不能改变植物实例身份");
    }
    const nextShape = nextBase.shape;
    const changed =
      nextProgress !== currentProgress ||
      nextShape.leafSpread !== currentShape.leafSpread ||
      nextShape.stemBend !== currentShape.stemBend ||
      nextShape.fruitScale !== currentShape.fruitScale;
    if (changed) {
      cancelPending();
      resourceError = undefined;
    }
    const age = mapping.age(nextProgress);
    if (growth) growth.setGrowth(age, nextShape);
    else plant.setGrowth(age, nextShape);
    if (!plant.shared && definition.material.tintColors) {
      sampleColorCurveInto(definition.material.tintColors, plant.geometry.maturity, tintColorScratch);
      const r = Color.gammaToLinearSpace(tintColorScratch[0]);
      const g = Color.gammaToLinearSpace(tintColorScratch[1]);
      const b = Color.gammaToLinearSpace(tintColorScratch[2]);
      tintRenderersScratch.length = 0;
      plant.root.getComponentsIncludeChildren(MeshRenderer, tintRenderersScratch);
      for (let i = 0; i < tintRenderersScratch.length; i++) {
        const shaderData = tintRenderersScratch[i].shaderData;
        const existing = shaderData.getVector4(ORGAN_TINT_PROPERTY);
        if (existing) existing.set(r, g, b, 1);
        else shaderData.setVector4(ORGAN_TINT_PROPERTY, new Vector4(r, g, b, 1));
      }
      tintRenderersScratch.length = 0;
    }
    if (!plant.shared) shared = undefined;
    const emergence = applyEmergence(plant, nextProgress);
    baseState = nextBase;
    currentProgress = nextProgress;
    currentShape = nextShape;
    materializedState = nextMaterialized;
    prepareShared();
    return emergence;
  };
  const instance: PlantInstance = {
    definition,
    plant: plant!,
    update(input) {
      if (disposed) throw new Error("植物实例已释放");
      const next = validatePlantRenderState(catalog, input);
      applyStateUpdate(next, next.progress, next);
    },
    updateValidated(inputBase, progress) {
      if (disposed) throw new Error("植物实例已释放");
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new RangeError("生长进度必须在 [0, 1] 范围内");
      }
      const verifiedBase = isValidatedPlantRenderState(catalog, inputBase)
        ? inputBase
        : validatePlantRenderState(catalog, inputBase);
      return applyStateUpdate(verifiedBase, progress, verifiedBase.progress === progress ? verifiedBase : undefined);
    },
    query() {
      const stages = catalog.getCrop(baseState.cropId).cycle.stages;
      let stage = stages[0];
      for (let i = stages.length - 1; i >= 0; i--) {
        if (stages[i].minimumProgress <= currentProgress) {
          stage = stages[i];
          break;
        }
      }
      if (!materializedState) {
        materializedState = Object.freeze({ ...baseState, progress: currentProgress });
      }
      return Object.freeze({
        state: materializedState,
        stageId: stage.id,
        stageName: stage.name,
        age: mapping.age(currentProgress),
        emergence: mapping.emergence(currentProgress),
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
