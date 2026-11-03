import { reversibleTerrainSteps } from "@galacean/engine-terrain/terrain/clipmap/TerrainPreparedUpdate";
import type { preparePlanningWaterImpact } from "./PlanningWaterPublication";
import type { TerrainWindGpuExposureProvider } from "../../integrations/terrain/environment/TerrainWindGpuExposureProvider.ts";
import type { PlanningPlayerCameraPose, PreparedPlanningPlayerState } from "./PlanningPlayerState";
import type { Camera, Vector3 } from "@galacean/engine";
import type { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import type {
  PreparedSeedWorldAudioWorld,
  SeedWorldAudioRuntime,
  SeedWorldAudioSolid
} from "../../world/SeedWorldAudioRuntime";
import type { SeedWorldTerrainRuntime } from "../../runtime/SeedWorldTerrainRuntime.ts";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { PlanningSeedWorldData } from "./PlanningSeedWorldData";
import type { createPlanningSeedSolids } from "./PlanningSeedSolids";
import { PlanningNavigationSurface } from "./PlanningNavigationSurface";
import { PlanningWaterAudio, planningAudioSolids } from "./PlanningWaterAudio";
import { sampleSeedWorldHeight } from "../../runtime/SeedWorldFields.ts";
import type { PlanningWaterRuntime, PreparedPlanningWater } from "./PlanningWaterRuntime";

interface PlanningSeedSceneResources {
  readonly authoringRevision?: number;
  /** Validate author dependencies before any live scene or water mutation. */
  readonly assertCurrent?: () => void;
  readonly masonry?: import("../../masonry/NativeBuildingHost").NativeBuildingWorld;
  readonly heightTransition?: ReturnType<SeedWorldTerrainRuntime["prepareHeightTransition"]>;
  readonly vegetation?: import("./PlanningNaturalVegetationRuntime").PlanningNaturalVegetationRuntime;
  readonly data: PlanningSeedWorldData;
  readonly world: SeedWorldTerrainRuntime;
  readonly solids: Awaited<ReturnType<typeof createPlanningSeedSolids>>;
  readonly windExposure?: TerrainWindGpuExposureProvider;
}
export interface PlanningSeedSceneCandidate extends PlanningSeedSceneResources {
  /** Validate author dependencies before any live scene or water mutation. */
  readonly assertCurrent?: () => void;
  readonly preparedWater?: PreparedPlanningWater;
  readonly playerState?: PreparedPlanningPlayerState;
  readonly cameraPose?: PlanningPlayerCameraPose;
}
export interface PublishedPlanningSeedScene extends PlanningSeedSceneResources {
  readonly plan: IslandPlan;
  readonly revision: number;
  readonly navigation: PlanningNavigationSurface;
  readonly playerBookmark?: PreparedPlanningPlayerState["bookmark"];
}

/** Live readers must not close over a preparation scope: its rollback handles
 * own the previous scene and otherwise chain every accepted water revision.
 */
function prepareSceneReaders(
  plan: IslandPlan,
  fields: PlanningSeedWorldData["fields"],
  world: SeedWorldTerrainRuntime,
  water: PlanningWaterRuntime,
  audioRuntime: SeedWorldAudioRuntime,
  samplePlayerSupport?: (x: number, z: number) => number | undefined
) {
  const navigation = new PlanningNavigationSurface(
    plan,
    (x, z) => sampleSeedWorldHeight(fields, x, z) ?? 0,
    water,
    samplePlayerSupport
  );
  const audio = audioRuntime.prepareWorld({
    fields,
    population: () => world.population.getPopulationLayout(),
    navigation,
    waterAudio: new PlanningWaterAudio(plan, (kind) => water.isAudioBodyVisible(kind)),
    rocks: planningAudioSolids(plan)
  });
  return { navigation, audio };
}

/** Owns Seed's hidden candidates, published scene and asynchronously retiring resources. */
export class PlanningSeedScenePublication {
  private published?: PublishedPlanningSeedScene;
  private publishedAudio?: PreparedSeedWorldAudioWorld;
  get current(): PublishedPlanningSeedScene | undefined {
    return this.published;
  }
  private revision = 0;
  private controller?: AbortController;
  private readonly staged = new Set<() => Promise<void>>();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly retired = new Set<Promise<void>>();
  private readonly cleanupErrors: unknown[] = [];
  private readonly exposures = new Set<TerrainWindGpuExposureProvider>();
  private destroyed = false;
  private destroyTask?: Promise<void>;

  constructor(
    private readonly options: {
      water: PlanningWaterRuntime;
      navigation: TerrainNavigationRuntime;
      audio: SeedWorldAudioRuntime;
      camera: Camera;
      orbit?: { readonly target: Vector3 };
      canvas: HTMLCanvasElement;
      samplePlayerSupport?: (x: number, z: number) => number | undefined;
    }
  ) {}

  getDiagnostics() {
    return {
      requestedRevision: this.revision,
      publishedRevision: this.current?.revision ?? 0,
      pendingCount: this.pending.size,
      retiredCount: this.retired.size,
      cleanupErrors: this.cleanupErrors.map(String)
    };
  }

  async publish(
    plan: IslandPlan,
    prepare: (signal: AbortSignal) => Promise<PlanningSeedSceneCandidate>,
    acceptance?: { signal: AbortSignal; accept: () => void }
  ): Promise<PublishedPlanningSeedScene> {
    const candidate = await this.prepare(plan, prepare, acceptance?.signal);
    try {
      const published = candidate.commit();
      acceptance?.accept();
      return published;
    } catch (error) {
      await candidate.discard();
      throw error;
    }
  }

  /** Publish a rock surface edit while retaining every unrelated live resource.
   * The caller stages hidden mesh replacements; supersession/failure discards only those meshes. */
  prepareRocks(
    plan: IslandPlan,
    prepare: (signal: AbortSignal) => Promise<{ commit(): void; discard(): void }>,
    signal?: AbortSignal
  ): Promise<{ commit(): PublishedPlanningSeedScene; discard(): Promise<void> }> {
    return this.prepareContent(plan, prepare, signal);
  }

  /** Commit changed objects while retaining terrain, water, navigation and runtime resources.
   * The caller supplies a detached frame; queries and visible instances advance together.
   */
  prepareContent(
    plan: IslandPlan,
    prepare: (signal: AbortSignal) => Promise<{ commit(): void; discard(): void }>,
    signal?: AbortSignal
  ): Promise<{ commit(): PublishedPlanningSeedScene; discard(): Promise<void> }> {
    if (this.destroyed || !this.current) return Promise.reject(Error("Seed scene is not available for a content edit"));
    this.controller?.abort();
    const controller = (this.controller = new AbortController()),
      revision = ++this.revision,
      previous = this.current;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const detach = () => signal?.removeEventListener("abort", abort);
    const check = () => {
      controller.signal.throwIfAborted();
      if (this.destroyed || revision !== this.revision || this.current !== previous)
        throw Error("Content scene preparation is stale");
    };
    const task = (async () => {
      let frame: Awaited<ReturnType<typeof prepare>> | undefined;
      try {
        check();
        frame = await prepare(controller.signal);
        check();
        const previousAudio = this.publishedAudio!,
          rocks = planningAudioSolids(plan);
        // Content edits retain terrain and water. Tree visibility/transforms do
        // not change acoustic blockers, and must not reset the audible world.
        const audio = sameAudioSolids(rocks, previousAudio.world.rocks)
          ? undefined
          : this.options.audio.prepareWorld({ ...previousAudio.world, rocks });
        const next: PublishedPlanningSeedScene = { ...previous, plan, revision };
        const prepared = frame;
        let consumed = false;
        const discard = async () => {
          if (consumed) return;
          consumed = true;
          this.staged.delete(discard);
          detach();
          prepared.discard();
        };
        this.staged.add(discard);
        return {
          discard,
          commit: () => {
            if (consumed) throw Error("Content scene candidate already consumed");
            check();
            prepared.commit();
            this.published = next;
            if (audio) {
              this.options.audio.publishWorld(audio);
              this.publishedAudio = audio;
            }
            this.options.canvas.dataset.publicationRevision = String(revision);
            this.options.canvas.dataset.treeCount = String(next.vegetation?.getAuthoringSnapshot().trees.length ?? 0);
            consumed = true;
            this.staged.delete(discard);
            detach();
            return next;
          }
        };
      } catch (error) {
        detach();
        frame?.discard();
        throw error;
      } finally {
        if (this.controller === controller) this.controller = undefined;
      }
    })();
    this.pending.add(task);
    void task.then(
      () => this.pending.delete(task),
      () => this.pending.delete(task)
    );
    return task;
  }

  /** Water-only candidates retain terrain/population/ground providers and publish Host queries atomically. */
  prepareWater(
    plan: IslandPlan,
    update: import("../hydrology/PlanningWaterEdits").PlanningWaterUpdate,
    signal?: AbortSignal,
    authoringRevision?: number
  ): Promise<{ commit(): PublishedPlanningSeedScene; discard(): Promise<void> }> {
    if (this.destroyed || !this.current)
      return Promise.reject(new Error("Seed scene is not available for a water edit"));
    this.controller?.abort();
    const controller = (this.controller = new AbortController()),
      revision = ++this.revision,
      previous = this.current;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const detach = () => signal?.removeEventListener("abort", abort);
    const check = () => {
      controller.signal.throwIfAborted();
      if (this.destroyed || this.current !== previous || revision !== this.revision)
        throw new Error("Water scene preparation is stale");
    };
    const task = (async () => {
      let water: PreparedPlanningWater | undefined;
      try {
        check();
        water = await this.options.water.prepareWater(plan, update, controller.signal);
        check();
        const prepared = water,
          next: PublishedPlanningSeedScene = {
            ...previous,
            plan,
            revision,
            authoringRevision: authoringRevision ?? previous.authoringRevision
          };
        let consumed = false;
        const discard = async () => {
          if (consumed) return;
          consumed = true;
          this.staged.delete(discard);
          detach();
          await prepared.rollback();
        };
        this.staged.add(discard);
        return {
          discard,
          commit: () => {
            if (consumed) throw new Error("Water scene candidate already consumed");
            check();
            const oldRevision = this.options.canvas.dataset.publicationRevision;
            let publication: ReturnType<PreparedPlanningWater["commit"]>;
            try {
              this.options.canvas.dataset.publicationRevision = String(revision);
              publication = prepared.commit();
            } catch (error) {
              if (oldRevision === undefined) delete this.options.canvas.dataset.publicationRevision;
              else this.options.canvas.dataset.publicationRevision = oldRevision;
              throw error;
            }
            this.published = next;
            consumed = true;
            this.staged.delete(discard);
            detach();
            this.trackCleanup(publication.retiredCleanup);
            return next;
          }
        };
      } catch (error) {
        detach();
        await water?.rollback();
        throw error;
      } finally {
        if (this.controller === controller) this.controller = undefined;
      }
    })();
    this.pending.add(task);
    void task.then(
      () => this.pending.delete(task),
      () => this.pending.delete(task)
    );
    return task;
  }

  /** Publish a local terrain/water candidate while retaining all unrelated native owners. */
  prepareWaterImpact(
    plan: IslandPlan,
    prepare: (
      previous: PublishedPlanningSeedScene,
      signal: AbortSignal,
      revision: number
    ) => Promise<Omit<Awaited<ReturnType<typeof preparePlanningWaterImpact>>, "timings">>,
    signal?: AbortSignal,
    authoringRevision?: number
  ): Promise<{ commit(): PublishedPlanningSeedScene; discard(): Promise<void> }> {
    if (this.destroyed || !this.current) return Promise.reject(Error("No current native water scene"));
    this.controller?.abort();
    const controller = (this.controller = new AbortController()),
      revision = ++this.revision,
      previous = this.current;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const detach = () => signal?.removeEventListener("abort", abort);
    const check = () => {
      controller.signal.throwIfAborted();
      if (this.destroyed || this.current !== previous || this.revision !== revision)
        throw Error("Stale water-impact publication");
    };
    const task = (async () => {
      let frame: Awaited<ReturnType<typeof prepare>> | undefined, water: PreparedPlanningWater | undefined;
      try {
        check();
        frame = await prepare(previous, controller.signal, revision);
        check();
        water = await this.options.water.prepare(plan, controller.signal);
        check();
        const { navigation, audio } = prepareSceneReaders(
          plan,
          frame.data.fields,
          previous.world,
          this.options.water,
          this.options.audio,
          this.options.samplePlayerSupport
        );
        const next: PublishedPlanningSeedScene = {
          ...previous,
          plan,
          data: frame.data,
          navigation,
          revision,
          authoringRevision: authoringRevision ?? previous.authoringRevision,
          heightTransition: undefined
        };
        const prepared = frame,
          preparedWater = water,
          oldRevision = this.options.canvas.dataset.publicationRevision;
        const provider = this.options.navigation.prepareGroundProvider(navigation),
          acoustic = this.options.audio.prepareWorldPublication(audio);
        const transaction = reversibleTerrainSteps([
          ...prepared.updates,
          provider,
          acoustic,
          {
            commit: () => {
              this.options.canvas.dataset.publicationRevision = String(revision);
            },
            rollback: () => {
              if (oldRevision === undefined) delete this.options.canvas.dataset.publicationRevision;
              else this.options.canvas.dataset.publicationRevision = oldRevision;
            }
          }
        ]);
        let consumed = false;
        const discard = async () => {
          if (consumed) return;
          consumed = true;
          detach();
          this.staged.delete(discard);
          const errors: unknown[] = [];
          try {
            transaction.rollback();
          } catch (error) {
            errors.push(error);
          }
          try {
            await preparedWater.rollback();
          } catch (error) {
            errors.push(error);
          }
          for (const update of [...prepared.updates].reverse())
            try {
              update.discard();
            } catch (error) {
              errors.push(error);
            }
          if (errors.length) throw new AggregateError(errors, "Water-impact discard failed");
        };
        this.staged.add(discard);
        return {
          discard,
          commit: () => {
            if (consumed) throw Error("Water-impact candidate consumed");
            check();
            let publication: ReturnType<PreparedPlanningWater["commit"]>;
            try {
              transaction.commit();
              check();
              publication = preparedWater.commit();
            } catch (error) {
              try {
                transaction.rollback();
              } catch (rollback) {
                throw new AggregateError([error, rollback], "Water-impact rollback failed");
              }
              throw error;
            }
            this.published = next;
            this.publishedAudio = audio;
            consumed = true;
            detach();
            this.staged.delete(discard);
            this.trackCleanup(publication.retiredCleanup);
            this.trackCleanup(
              Promise.resolve().then(() => {
                const errors: unknown[] = [];
                for (const update of prepared.updates)
                  try {
                    update.finalize();
                  } catch (error) {
                    errors.push(error);
                  }
                previous.heightTransition?.dispose();
                if (errors.length) throw new AggregateError(errors, "Water-impact retirement failed");
              })
            );
            return next;
          }
        };
      } catch (error) {
        detach();
        const errors: unknown[] = [error];
        try {
          await water?.rollback();
        } catch (failure) {
          errors.push(failure);
        }
        for (const update of [...(frame?.updates ?? [])].reverse())
          try {
            update.discard();
          } catch (failure) {
            errors.push(failure);
          }
        if (errors.length > 1) throw new AggregateError(errors, "Water-impact preparation cleanup failed");
        throw error;
      } finally {
        if (this.controller === controller) this.controller = undefined;
      }
    })();
    this.pending.add(task);
    void task.then(
      () => this.pending.delete(task),
      () => this.pending.delete(task)
    );
    return task;
  }

  prepare(
    plan: IslandPlan,
    prepare: (signal: AbortSignal) => Promise<PlanningSeedSceneCandidate>,
    signal?: AbortSignal
  ): Promise<{ commit(): PublishedPlanningSeedScene; discard(): Promise<void> }> {
    if (this.destroyed) return Promise.reject(new Error("Seed scene publication has been destroyed"));
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    const revision = ++this.revision;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const detach = () => signal?.removeEventListener("abort", abort);
    const check = () => {
      controller.signal.throwIfAborted();
      if (this.destroyed || revision !== this.revision) throw new Error("Seed scene preparation is stale");
    };
    const task = (async () => {
      let candidate: PlanningSeedSceneCandidate | undefined;
      let preparedWater: PreparedPlanningWater | undefined;
      let committed = false;
      try {
        candidate = await prepare(controller.signal);
        check();
        const presentationFields = candidate.heightTransition?.fields ?? candidate.data.fields;
        const { navigation, audio } = prepareSceneReaders(
          plan,
          presentationFields,
          candidate.world,
          this.options.water,
          this.options.audio,
          this.options.samplePlayerSupport
        );
        // Copy only live owners. Spreading the candidate also publishes Water/player
        // rollback closures, retaining their retired hosts through selection/audio.
        const next: PublishedPlanningSeedScene = {
          plan,
          revision,
          navigation,
          authoringRevision: candidate.authoringRevision,
          data: candidate.data,
          world: candidate.world,
          solids: candidate.solids,
          masonry: candidate.masonry,
          vegetation: candidate.vegetation,
          heightTransition: candidate.heightTransition,
          windExposure: candidate.windExposure,
          playerBookmark: candidate.playerState?.bookmark
        };
        const metadata = {
          seed: String(plan.parameters.seed),
          worldSize: String(plan.parameters.width),
          heightResolution: String(candidate.data.fields.heightResolution),
          alphaResolution: String(candidate.data.fields.surfaceResolution),
          poiCount: String(plan.poiDistribution?.sites.length ?? 0),
          treeCount: String(
            candidate.vegetation?.getAuthoringSnapshot().trees.length ?? candidate.data.population.treeInstances.length
          ),
          spawn: JSON.stringify(plan.spawn),
          publicationRevision: String(revision)
        };
        preparedWater = candidate.preparedWater ?? (await this.options.water.prepare(plan, controller.signal));
        check();
        const preparedCandidate = candidate;
        const waterCandidate = preparedWater;
        let consumed = false;
        const discard = async () => {
          if (consumed) return;
          consumed = true;
          this.staged.delete(discard);
          detach();
          await this.discardCandidate(preparedCandidate, waterCandidate);
        };
        this.staged.add(discard);
        return {
          discard,
          commit: () => {
            if (consumed) throw new Error("Seed scene candidate already consumed");
            check();
            preparedCandidate.assertCurrent?.();
            const previous = this.current;
            const undo: Array<() => void> = [];
            const apply = (publish: () => void, rollback: () => void) => {
              // Register before invoking: a setter may mutate and then throw.
              undo.push(rollback);
              publish();
            };
            let water: ReturnType<PreparedPlanningWater["commit"]>;
            try {
              // Height upload touches only the hidden candidate. All other fallible
              // consumers retain their accepted state until Water's final boundary.
              preparedCandidate.heightTransition?.start(previous?.heightTransition?.fields ?? previous?.data.fields);
              apply(
                () => preparedCandidate.solids.commit(),
                () => preparedCandidate.solids.rollbackCommit()
              );
              if (preparedCandidate.masonry)
                apply(
                  () => preparedCandidate.masonry!.commitPublication(),
                  () => preparedCandidate.masonry!.rollbackPublication()
                );
              const ground = this.options.navigation.prepareGroundProvider(navigation);
              apply(ground.commit, ground.rollback);
              const acoustic = this.options.audio.prepareWorldPublication(audio);
              apply(acoustic.commit, acoustic.rollback);
              if (preparedCandidate.playerState)
                apply(
                  () => preparedCandidate.playerState!.commit(),
                  () => preparedCandidate.playerState!.rollback()
                );
              for (const [key, value] of Object.entries(metadata)) {
                const old = this.options.canvas.dataset[key];
                apply(
                  () => {
                    this.options.canvas.dataset[key] = value;
                  },
                  () => {
                    if (old === undefined) delete this.options.canvas.dataset[key];
                    else this.options.canvas.dataset[key] = old;
                  }
                );
              }
              if (preparedCandidate.cameraPose) {
                const { position, rotation, orbitTarget } = preparedCandidate.cameraPose;
                const transform = this.options.camera.entity.transform;
                const oldPosition = transform.worldPosition.clone();
                const oldRotation = transform.worldRotationQuaternion.clone();
                if (orbitTarget && this.options.orbit) {
                  const target = this.options.orbit.target,
                    oldTarget = target.clone();
                  apply(
                    () => target.copyFrom(orbitTarget),
                    () => target.copyFrom(oldTarget)
                  );
                }
                apply(
                  () => transform.setWorldPosition(position.x, position.y, position.z),
                  () => transform.setWorldPosition(oldPosition.x, oldPosition.y, oldPosition.z)
                );
                apply(
                  () => {
                    transform.worldRotationQuaternion = rotation;
                  },
                  () => {
                    transform.worldRotationQuaternion = oldRotation;
                  }
                );
              }
              check();
              // Water internally restores its own publication if this call fails.
              // No fallible external state setter follows this irreversible boundary.
              water = waterCandidate.commit();
            } catch (error) {
              const failures: unknown[] = [error];
              for (let index = undo.length - 1; index >= 0; index--) {
                try {
                  undo[index]();
                } catch (rollbackError) {
                  failures.push(rollbackError);
                }
              }
              if (failures.length > 1)
                throw new AggregateError(failures, "Seed scene publication failed and rollback reported errors");
              throw error;
            }
            this.published = next;
            this.publishedAudio = audio;
            committed = true;
            consumed = true;
            this.staged.delete(discard);
            detach();
            if (preparedCandidate.windExposure) this.exposures.add(preparedCandidate.windExposure);
            this.trackCleanup(water.retiredCleanup);
            // Publication has accepted. Lifecycle notifications and retirement may
            // report failures, but must not suppress later cleanup or revoke next.
            const notify = (action: () => void) => {
              try {
                action();
              } catch (error) {
                this.cleanupErrors.push(error);
              }
            };
            notify(() => preparedCandidate.masonry?.activate());
            notify(() => preparedCandidate.solids.finalizeCommit());
            notify(() => preparedCandidate.playerState?.finalize());
            if (previous)
              notify(() => {
                previous.world.root.isActive = false;
              });
            notify(() => {
              preparedCandidate.world.root.isActive = true;
            });
            if (previous) this.release(previous);
            return next;
          }
        };
      } catch (error) {
        detach();
        if (!committed) {
          // A rejected factory may still own work that it never handed back as a candidate.
          controller.abort();
          try {
            if (candidate) await this.discardCandidate(candidate, preparedWater ?? candidate.preparedWater);
            else await preparedWater?.rollback();
          } catch (cleanupError) {
            throw new AggregateError([error, cleanupError], "Seed scene preparation failed during candidate cleanup");
          }
          throw error;
        }
        throw error;
      } finally {
        if (this.controller === controller) this.controller = undefined;
      }
    })();
    this.pending.add(task);
    void task.then(
      () => this.pending.delete(task),
      () => this.pending.delete(task)
    );
    return task;
  }

  /** Cancel before any await; late preparations are joined before the engine is released. */
  destroy(): Promise<void> {
    if (this.destroyTask) return this.destroyTask;
    this.destroyed = true;
    this.controller?.abort();
    if (this.current) this.current.world.root.isActive = false;
    this.destroyTask = (async () => {
      await Promise.allSettled([...this.pending]);
      await Promise.allSettled([...this.staged].map((discard) => discard()));
      if (this.current) {
        await this.release(this.current);
        this.published = undefined;
        this.publishedAudio = undefined;
      }
      await Promise.allSettled([...this.retired]);
      for (const exposure of this.exposures) exposure.destroy();
      this.exposures.clear();
      await this.options.water.destroy();
    })();
    return this.destroyTask;
  }

  private async discardCandidate(candidate: PlanningSeedSceneCandidate, water?: PreparedPlanningWater): Promise<void> {
    const failures: unknown[] = [];
    for (const cleanup of [
      () => water?.rollback(),
      () => candidate.playerState?.rollback(),
      () => candidate.windExposure?.destroy(),
      () => this.release(candidate)
    ]) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Seed scene candidate cleanup failed");
  }

  private release(candidate: PlanningSeedSceneResources): Promise<void> {
    try {
      candidate.world.root.isActive = false;
    } catch (error) {
      this.cleanupErrors.push(error);
    }
    const cleanup = (async () => {
      try {
        try {
          candidate.heightTransition?.dispose();
        } finally {
          try {
            try {
              await candidate.masonry?.destroy();
            } finally {
              candidate.vegetation?.dispose();
            }
          } finally {
            candidate.solids.dispose();
          }
        }
      } finally {
        await candidate.world.destroy();
      }
    })();
    return this.trackCleanup(cleanup);
  }

  private trackCleanup(task: Promise<void>): Promise<void> {
    const settled = task.catch((error) => {
      this.cleanupErrors.push(error);
    });
    this.retired.add(settled);
    void settled.then(() => this.retired.delete(settled));
    return settled;
  }
}

/** Stable producer order lets geometry equality ignore labels and object identity. */
function sameAudioSolids(a: readonly SeedWorldAudioSolid[], b: readonly SeedWorldAudioSolid[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (solid, index) =>
        solid.obbCenter.every((value, axis) => value === b[index].obbCenter[axis]) &&
        solid.obbSizeMetres.every((value, axis) => value === b[index].obbSizeMetres[axis]) &&
        solid.obbRotationQuaternion.every((value, axis) => value === b[index].obbRotationQuaternion[axis])
    )
  );
}
