import { scopedLook } from "@galacean/engine-water/water/native/WaterResources";
import type { PlanningWaterUpdate } from "../hydrology/PlanningWaterEdits";
import {
  registerFarmlandsRiverLook,
  registerRiverWaterBodyPresets,
  riverQualityPlanIdForQuality,
  registerRiverValleyLook
} from "@galacean/engine-water/water/presets/river/index";
import { planningWaterDependency } from "../../semantic-study/PlanningWaterDependency";
import { hashStableValue } from "@galacean/engine-water/water/compiler/index";
import {
  WaterSystem,
  type PreparedNativeWaterBatch,
  WaterBodyComponent,
  type WaterBodyConfiguration,
  WaterBodyResource,
  WaterLookResource,
  WaterQualityResource
} from "@galacean/engine-water/water/native/index";
import { readSeedWorldWaterColor } from "@galacean/engine-water/world/SeedWorldWaterColor";
import { planningLakeRequests } from "../../semantic-study/PlanningLakeSource";
import { registerLakeWaterLook } from "@galacean/engine-water/water/presets/lake/index";
import { createLakeNormalResourceFactory } from "@galacean/engine-water/water/resources/lake/index";
import { Vector3, Layer, type Camera, type Engine, type Entity, type MeshRenderer } from "@galacean/engine";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import {
  createWaterBodyAsset,
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  createWaterBodyInstance,
  createRiverWaterBodyAsset,
  createRiverWaterBodyInstance
} from "@galacean/engine-water/water/index";
import { registerOceanAuthoring } from "@galacean/engine-water/water/presets/ocean/index";

import waterPresentation from "../../planning-data/water-rendering.json";
import {
  WaterSceneRuntimeHost,
  WaterSurfacePickingState,
  type WaterSceneBodyRequest,
  type PublishedWaterSceneBodySet,
  createWaterSurfaceSample,
  createWaterSpatialFieldSample,
  resetWaterSurfaceSample,
  type WaterSurfaceSample,
  type WaterEnvironmentReflectionSource
} from "@galacean/engine-water/water/runtime/index";
import { TERRAIN_WATER_SSR_CAMERA_SETTINGS } from "../../integrations/grasslands/GrasslandsWaterPcg";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { compilePlanningOcean, planningOceanRepresentation } from "../../semantic-study/PlanningOceanSource";
import { planningRiverDescriptors } from "../../semantic-study/PlanningRiverSource";
import { planningWaterRegions } from "./PlanningWaterQueries";
import { planningLakeAssets } from "../../semantic-study/PlanningLakeSource";
import { registerSeedWorldAuthoredBasinAuthoringV1 } from "../../runtime/hydrology-v1/SeedWorldWaterAuthoringPresetsV1.ts";

import type { SeedWorldRef } from "../../agent-adapter/ports/SeedWorldEnginePort";

/** Preserve cleanup order while attempting every resource owned by this layer. */
async function finishPlanningWaterCleanup(
  actions: readonly (() => unknown | Promise<unknown>)[],
  message: string,
  errors: unknown[] = []
): Promise<void> {
  for (const action of actions) {
    try {
      await action();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, message);
}

/** Production Water consumes only the current published planning snapshot and scene lighting. */
export interface PlanningWaterRuntimeOptions {
  engine: Engine;
  root: Entity;
  camera: Camera;
  environmentReflection?: WaterEnvironmentReflectionSource;
  /** Project hosts lend Source components; planning previews may own generated runtime components. */
  readBody?: (planningId: string) => WaterBodyComponent | undefined;
  pickId?: (planningId: string) => string | undefined;
}

/** A prepared body set owns hidden resources until exactly one commit or rollback. */
export interface PreparedPlanningWater {
  readonly revision: number;
  readonly shaderWarmupRoots: readonly Entity[];
  discard(): Promise<void>;
  commit(): PublishedWaterSceneBodySet;
  rollback(): Promise<void>;
}

/** Owns production river/ocean rendering. Geometry, water levels and river widths stay in IslandPlan. */
export class PlanningWaterRuntime {
  private get host(): WaterSceneRuntimeHost {
    return this.system.runtimeHost;
  }
  readonly system: WaterSystem;
  private readonly components = new Map<string, WaterBodyComponent>();
  private readonly componentRoot: Entity;
  private readonly queryPosition = new Vector3();
  private readonly contactSample = createWaterSurfaceSample();

  private pending?: AbortController;
  private readonly preparations = new Set<Promise<unknown>>();
  private readonly retirements = new Set<Promise<void>>();
  private visibilityRevision = 0;
  private activeIds = new Set<string>();
  private revision = 0;
  private publishedRevision = 0;
  private destroyed = false;
  private destroyPromise?: Promise<void>;
  private oceanVisible = true;
  private riversVisible = true;
  private plan?: IslandPlan;
  private latestPlan?: IslandPlan;
  private runtimePlan?: IslandPlan;
  private metadataRevision = 0;
  private readonly requestCache = new Map<
    string,
    { dependency: string; request: WaterSceneBodyRequest; baseLookId: string }
  >();
  private oceanRequest?: WaterSceneBodyRequest;
  private publishedRequests = new Map<
    string,
    { signature: string; asset: WaterBodyResource; quality: WaterQualityResource }
  >();

  /** Existing Water devtools observe the same published bodies; no second Water runtime is created. */
  get loader() {
    return this.system.developmentTargets;
  }

  constructor(private readonly options: PlanningWaterRuntimeOptions) {
    this.componentRoot = options.root.createChild("Planning native water");
    this.system = this.componentRoot.addComponent(WaterSystem);
    this.system.camera = options.camera;
    this.system.configureRuntime(
      {
        waterLayer: Layer.Layer30,
        cacheEntryLimit: 24,
        cacheBudgetBytes: 128 * 1024 * 1024,
        maximumConcurrentBodyPreparations: 1,
        yieldBetweenBodyPreparationBatches: true,
        reflection: {
          cullingMask: options.camera.cullingMask,
          waterLayerMask: Layer.Layer30,
          screenSpaceReflection: TERRAIN_WATER_SSR_CAMERA_SETTINGS
        }
      },
      options.environmentReflection,
      {
        initialize: (host) => {
          host.registerAuthoring(registerLakeWaterLook);
          host.ensureRuntimeResource(createLakeNormalResourceFactory(options.engine));
          host.registerAuthoring(registerRiverWaterBodyPresets);
          host.registerAuthoring(registerRiverValleyLook);
          host.registerAuthoring(registerFarmlandsRiverLook);
        },
        beforeUnload: async () => {
          this.pending?.abort();
          await Promise.allSettled([...this.preparations, ...this.retirements]);
        },
        afterUnload: () => this.releaseComponents(),
        isCurrent: () => this.runtimePlan === this.latestPlan,
        restore: async () => {
          let restored: IslandPlan | undefined;
          while (this.latestPlan && this.latestPlan !== restored) {
            const latest = this.latestPlan;
            await this.synchronize(latest, undefined, true);
            restored = latest;
          }
        }
      }
    );
  }

  /** Prepare hidden bodies without changing published queries, IDs or the current plan. */
  prepare(
    plan: IslandPlan,
    signal?: AbortSignal,
    visibility?: { ocean: boolean; rivers: boolean },
    onResourcesPrepared?: (completed: number, total: number) => Promise<void>,
    runtimeRestoration = false,
    waterUpdate?: PlanningWaterUpdate
  ): Promise<PreparedPlanningWater> {
    if (this.destroyed) return Promise.reject(new Error("Planning water runtime has been destroyed"));
    if (
      !this.system.runtimeState.requestedEnabled ||
      (this.system.runtimeState.phase === "enabling" && !runtimeRestoration)
    ) {
      const revision = ++this.metadataRevision;
      let consumed = false;
      const discard = async () => {
        consumed = true;
      };
      return Promise.resolve({
        revision,
        shaderWarmupRoots: [],
        discard,
        rollback: discard,
        commit: () => {
          signal?.throwIfAborted();
          if (
            consumed ||
            this.destroyed ||
            revision !== this.metadataRevision ||
            this.system.runtimeState.phase === "enabled"
          )
            throw new Error("Planning water preparation is stale");
          consumed = true;
          this.plan = plan;
          this.latestPlan = plan;
          if (visibility) {
            this.oceanVisible = visibility.ocean;
            this.riversVisible = visibility.rivers;
          }
          return { revision: this.publishedRevision, retiredCleanup: Promise.resolve() };
        }
      });
    }
    this.pending?.abort();
    const pending = new AbortController();
    this.pending = pending;
    const revision = ++this.revision;
    // Replacement leases remain owned until finalization or rollback completes.
    const previous = [...this.preparations, ...this.retirements];
    let prepared: PreparedNativeWaterBatch | undefined;
    const fresh: WaterBodyComponent[] = [];
    const allocated = new Set<WaterBodyResource | WaterLookResource | WaterQualityResource>();
    const own = <T extends WaterBodyResource | WaterLookResource | WaterQualityResource>(resource: T): T => {
      allocated.add(resource);
      return resource;
    };
    let restoreRequests: (() => void) | undefined;
    let finished = false;
    let rollbackTask: Promise<void> | undefined;
    const detach = () => {
      signal?.removeEventListener("abort", abort);
      pending.signal.removeEventListener("abort", discard);
      if (this.pending === pending) this.pending = undefined;
    };
    const rollback = (): Promise<void> => {
      if (rollbackTask) return rollbackTask;
      if (finished) return Promise.resolve();
      finished = true;
      restoreRequests?.();
      detach();
      rollbackTask = finishPlanningWaterCleanup(
        [
          () => prepared?.rollback(),
          ...fresh.flatMap((body) => [() => body.dispose(), () => body.entity.destroy()]),
          ...[...allocated].map((resource) => () => resource.destroy())
        ],
        "Planning Water candidate rollback cleanup failed"
      );
      this.trackRetirement(rollbackTask);
      return rollbackTask;
    };
    const discard = () => {
      if (prepared) void rollback().catch(() => {});
    };
    const abort = () => pending.abort();
    signal?.addEventListener("abort", abort, { once: true });
    pending.signal.addEventListener("abort", discard, { once: true });
    if (signal?.aborted) abort();
    const task = (async (): Promise<PreparedPlanningWater> => {
      try {
        await Promise.allSettled(previous);
        pending.signal.throwIfAborted();
        const visibilityRevision = this.visibilityRevision;
        const savedRequests = new Map(this.requestCache),
          savedOcean = this.oceanRequest;
        restoreRequests = () => {
          this.requestCache.clear();
          for (const [id, entry] of savedRequests) this.requestCache.set(id, entry);
          this.oceanRequest = savedOcean;
        };
        const requests = (waterUpdate ? this.requests(plan, waterUpdate) : this.requests(plan))
          .filter(
            (request) =>
              !this.options.readBody || request.bodyId !== "planning-ocean" || this.options.readBody(request.bodyId)
          )
          .map((request) => ({
            ...request,
            instance: { ...request.instance }
          }));
        const nextPublished = new Map<
          string,
          { signature: string; asset: WaterBodyResource; quality: WaterQualityResource }
        >();
        if (visibility)
          for (const request of requests)
            Object.assign(request, {
              instance: {
                ...request.instance,
                visible: request.asset.kind === "ocean" ? visibility.ocean : visibility.rivers
              }
            });
        const ids = new Set(requests.map((request) => request.bodyId));
        const updates: Array<{ body: WaterBodyComponent; configuration: WaterBodyConfiguration }> = [];
        for (const request of requests) {
          pending.signal.throwIfAborted();
          let body =
            this.options.readBody?.(request.bodyId) ??
            (this.options.readBody ? undefined : this.components.get(request.bodyId));
          if (this.options.readBody && !body)
            throw new Error(`MISSING_DEPENDENCY: Source Water '${request.bodyId}' is missing.`);
          const input = body?.authoring;
          const signature = hashStableValue({
            source: request.asset.sourceHash,
            representation: request.asset.representationDataHash,
            kind: request.asset.kind,
            instance: request.instance,
            authoring: input && body!._authoringKey()
          });
          const published = this.publishedRequests.get(request.bodyId);
          if (
            body?.configuration &&
            published?.signature === signature &&
            published.asset === body.configuration.asset &&
            published.quality === body.configuration.quality
          ) {
            nextPublished.set(request.bodyId, published);
            continue;
          }
          if (!body) {
            body = this.componentRoot.createChild(request.bodyId).addComponent(WaterBodyComponent);
            body.waterId = request.bodyId;
            fresh.push(body);
          }
          const configuration: WaterBodyConfiguration = {
            ...(this.options.readBody ? { sourceSpace: "world" as const } : {}),
            asset:
              waterUpdate?.bodyId === request.bodyId && !waterUpdate.surface && body.configuration
                ? body.configuration.asset
                : own(new WaterBodyResource(this.options.engine, request.asset)),
            look: input
              ? undefined
              : own(
                  new WaterLookResource(
                    this.options.engine,
                    this.host.assets.getLookAuthoringSnapshot(request.instance.lookPresetId)!
                  )
                ),
            quality: input
              ? body!._compileQuality()
              : waterUpdate?.bodyId === request.bodyId && !waterUpdate.surface && body.configuration
                ? body.configuration.quality
                : own(
                    new WaterQualityResource(
                      this.options.engine,
                      this.host.assets.getQualityPlan(request.instance.qualityPlanId)!
                    )
                  ),
            material: input?.material,
            visible: input?.visible ?? request.instance.visible,
            priority: input?.priority ?? request.instance.priority,
            interaction: input?.interaction ?? request.instance.interaction,
            representationState:
              input?.shape.kind === "ocean" ? input.shape.layout : request.instance.representationState
          };
          updates.push({ body, configuration });
          nextPublished.set(request.bodyId, { signature, asset: configuration.asset, quality: configuration.quality });
          await onResourcesPrepared?.(updates.length, requests.length);
          pending.signal.throwIfAborted();
        }
        const removed = [...this.components]
          .filter(([id, body]) => !ids.has(id) || (this.options.readBody && this.options.readBody(id) !== body))
          .map(([, body]) => body)
          .filter((body) => !updates.some((update) => update.body.waterId === body.waterId));
        const replaced = [...this.components.values()].filter((body) =>
          updates.some((update) => update.body !== body && update.body.waterId === body.waterId)
        );
        const previousConfigurations = [...new Set([...updates.map((update) => update.body), ...removed, ...replaced])]
          .map((body) => body.configuration!)
          .filter(Boolean);
        prepared =
          updates.length || removed.length
            ? await this.system.prepareBatch(updates, pending.signal, removed)
            : {
                shaderWarmupRoots: [],
                rollback: async () => {},
                commit: () => ({ revision: this.publishedRevision, retiredCleanup: Promise.resolve() })
              };
        pending.signal.throwIfAborted();
        const runtime = this;
        return {
          revision,
          get shaderWarmupRoots() {
            pending.signal.throwIfAborted();
            if (finished || runtime.destroyed || revision !== runtime.revision)
              throw new Error("Planning water candidate already consumed");
            return prepared!.shaderWarmupRoots;
          },
          discard: rollback,
          commit: () => {
            if (finished) throw new Error("Planning water preparation is no longer active");
            pending.signal.throwIfAborted();
            if (this.destroyed || revision !== this.revision || visibilityRevision !== this.visibilityRevision) {
              throw new Error("Planning water preparation is stale");
            }
            const publication = prepared!.commit();
            this.publishedRevision = publication.revision;
            // The Host has already installed these visibility flags and query routes synchronously.
            for (const [id, body] of this.components) if (removed.includes(body)) this.components.delete(id);
            this.publishedRequests = nextPublished;
            for (const request of requests) {
              const body =
                this.options.readBody?.(request.bodyId) ??
                updates.find((update) => update.body.waterId === request.bodyId)?.body;
              if (body) {
                this.components.set(request.bodyId, body);
                const published = nextPublished.get(request.bodyId);
                if (published && body.configuration) published.asset = body.configuration.asset;
              }
            }

            if (visibility) {
              this.oceanVisible = visibility.ocean;
              this.riversVisible = visibility.rivers;
            }
            this.activeIds = new Set(
              [...ids].filter((id) => {
                const body = this.components.get(id);
                return body?.enabled && body.entity.isActiveInHierarchy;
              })
            );
            this.plan = plan;
            this.runtimePlan = plan;
            if (!runtimeRestoration) this.latestPlan = plan;
            finished = true;
            detach();
            // Entity lifecycle callbacks and resource disposal belong to retirement,
            // never to the synchronous accepted-state publication boundary.
            const retiredCleanup = Promise.allSettled([
              publication.retiredCleanup,
              ...replaced.filter((body) => body.destroyed || body.pendingDestroy).map((body) => body.dispose()),
              ...removed.map(async (body) => {
                if (this.options.readBody) return;
                try {
                  await body.dispose();
                } finally {
                  body.entity.destroy();
                }
              })
            ]).then((results) => {
              const errors = results
                .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                .map((result) => result.reason);
              const retained = new Set(
                updates.flatMap(({ configuration }) => [configuration.asset, configuration.look, configuration.quality])
              );
              for (const resource of new Set(
                previousConfigurations.flatMap((config) => [config.asset, config.look, config.quality])
              )) {
                if (
                  !resource ||
                  retained.has(resource) ||
                  (this.options.readBody && !(resource instanceof WaterBodyResource))
                )
                  continue;
                try {
                  resource.destroy();
                } catch (error) {
                  errors.push(error);
                }
              }
              if (errors.length) throw new AggregateError(errors, "Planning Water retired-resource cleanup failed");
            });
            this.trackRetirement(retiredCleanup);
            return { ...publication, retiredCleanup };
          },
          rollback
        };
      } catch (error) {
        try {
          await rollback();
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Planning Water preparation failed during candidate cleanup");
        }
        throw error;
      }
    })();
    this.preparations.add(task);
    void task.then(
      () => this.preparations.delete(task),
      () => this.preparations.delete(task)
    );
    return task;
  }

  /** Single-body projection over the current accepted bed; disabled state retains latest metadata. */
  prepareWater(plan: IslandPlan, update: PlanningWaterUpdate, signal?: AbortSignal): Promise<PreparedPlanningWater> {
    return this.prepare(plan, signal, undefined, undefined, false, update);
  }

  /** Convenience path shares the prepared publication implementation. */
  async synchronize(plan: IslandPlan, signal?: AbortSignal, runtimeRestoration = false): Promise<void> {
    if (
      !this.options.readBody &&
      this.plan === plan &&
      !this.pending &&
      !this.destroyed &&
      this.system.runtimeState.phase === "enabled"
    )
      return;
    const prepared = await this.prepare(plan, signal, undefined, undefined, runtimeRestoration);
    try {
      await prepared.commit().retiredCleanup;
    } catch (error) {
      await prepared.rollback();
      throw error;
    }
  }

  private trackRetirement(task: Promise<void>): void {
    this.retirements.add(task);
    void task.then(
      () => this.retirements.delete(task),
      () => this.retirements.delete(task)
    );
  }

  /** Advance the same finite Ocean controller used by Seed; River animation uses the engine shader clock. */
  update(deltaSeconds: number): void {
    // WaterSystem.onUpdate owns animation for all native components.
  }

  /** Visibility does not change layout, river profiles or the canonical terrain. */
  setVisible(ocean: boolean, rivers: boolean): void {
    if (ocean !== this.oceanVisible || rivers !== this.riversVisible) this.visibilityRevision++;
    this.oceanVisible = ocean;
    this.riversVisible = rivers;
    if (this.destroyed) return;
    this.system.setPresentationVisible("ocean", ocean);
    this.system.setPresentationVisible("river", rivers);
    this.system.setPresentationVisible("lake", rivers);
  }

  /** Audio follows actually published, visible bodies, including OBB comparison visibility. */
  isAudioBodyVisible(kind: "river" | "ocean"): boolean {
    if (this.destroyed || !this.system.runtimeState.effectiveEnabled) return false;
    return kind === "ocean"
      ? this.oceanVisible && this.activeIds.has("planning-ocean")
      : this.riversVisible &&
          !!this.plan?.waters.some((water) => water.kind === "river" && this.activeIds.has(water.id));
  }

  readColor(id: string) {
    const body = this.components.get(id),
      config = body?.configuration;
    return body && !body.destroyed && !body.pendingDestroy && config
      ? readSeedWorldWaterColor(scopedLook(config.look, config.material))
      : undefined;
  }

  /** Inspect real active Water bodies and resource ownership for automated acceptance. */
  getDiagnostics() {
    const host = this.system.activeRuntimeHost?.getDiagnostics();
    return {
      ...host,
      host: host ?? null,
      runtimeState: this.system.runtimeState,
      environmentReflection: this.system.runtimeState.effectiveEnabled
        ? (this.system.activeEnvironment?.inspection ?? null)
        : null,
      ready: this.system.runtimeState.effectiveEnabled && (host?.activeBodyCount ?? 0) > 0,
      visible:
        this.system.runtimeState.effectiveEnabled &&
        [...this.activeIds].some((id) => (id === "planning-ocean" ? this.oceanVisible : this.riversVisible)),
      bodyCount: host?.activeBodyCount ?? 0,
      hostRevision: host?.activeSceneRevision ?? this.publishedRevision,
      chunkCount: host?.bodies.reduce((sum, body) => sum + body.activation.runtimeMetrics.drawCount, 0) ?? 0
    };
  }

  /** Allocation-free query of the Host's actually published active body set. */
  sampleSurface(x: number, z: number, out: WaterSurfaceSample): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError("Water query coordinates must be finite.");
    if (this.destroyed || !this.system.runtimeState.effectiveEnabled) {
      resetWaterSurfaceSample(out);
      return false;
    }
    this.queryPosition.set(x, 0, z);
    return this.host.world.sampleSurface(this.queryPosition, out);
  }

  /** Static agricultural facts use the actually accepted Water bodies, without following future publications. */
  captureGrounding() {
    const fields = (this.system.runtimeState.effectiveEnabled ? this.system.bodies : []).flatMap((component) => {
      const id = component.waterId,
        body = this.system.activeRuntimeHost?.getBodyHandle(id);
      if (!body?.active || !body.queryEnabled) return [];
      const field = body.runtimeInterfaces.spatialField;
      if (!field?.capture) throw new Error(`Published water ${id} cannot capture static grounding facts`);
      return [field.capture()];
    });
    const sample = createWaterSpatialFieldSample();
    return Object.freeze({
      revision: this.system.revision,
      spatialFields: Object.freeze(fields),
      underwater: (x: number, z: number, height: number) =>
        fields.some(
          (field) =>
            field.sampleSpatialField(x, z, sample) &&
            sample.wet &&
            sample.waterDepth > 0 &&
            height <= sample.surfaceHeight
        )
    });
  }

  querySurface(x: number, z: number) {
    const out = this.contactSample;
    const water = this.sampleSurface(x, z, out);
    return water
      ? {
          water,
          bodyId: out.waterBodyId,
          surfaceElevationMetres: out.surfacePosition.y,
          waterDepthMetres: out.waterDepth
        }
      : { water };
  }

  /** Legacy EnginePort name; reads the same published Host, never an authored shape registry. */
  queryAuthoredSurface(x: number, z: number) {
    return this.querySurface(x, z);
  }

  private readonly pickBatches = new WeakMap<MeshRenderer, PlanningWaterPickBatch>();
  private pickVisitor?: SeedWorldPickVisitor;
  private readonly visitPickRendererBound = this.visitPickRenderer.bind(this);
  private visitPickRenderer(bodyId: string, renderer: MeshRenderer): void {
    bodyId = [...this.components].find(([, body]) => body.waterId === bodyId)?.[0] ?? bodyId;
    let kind: string | undefined = bodyId === "planning-ocean" ? "ocean" : undefined;
    if (!kind && this.plan) {
      for (let i = 0; i < this.plan.waters.length; i++) {
        const body = this.plan.waters[i]!;
        if (body.id === bodyId) {
          kind = body.kind;
          break;
        }
      }
    }
    if (!kind) return;
    let batch = this.pickBatches.get(renderer);
    if (!batch || batch.bodyId !== bodyId || batch.kind !== kind) {
      batch = new PlanningWaterPickBatch(renderer, bodyId, kind, this.options.pickId?.(bodyId));
      this.pickBatches.set(renderer, batch);
    }
    this.pickVisitor!(batch);
  }
  /** Natural refs keep the published planner body IDs. Descriptors follow renderer lifetime. */
  visitPickBatches(visitor: SeedWorldPickVisitor): void {
    if (!this.system.runtimeState.effectiveEnabled) return;
    this.pickVisitor = visitor;
    try {
      this.host.visitBodyRenderers(this.visitPickRendererBound);
    } finally {
      this.pickVisitor = undefined;
    }
  }

  resolveColorBodyId(ref: Readonly<SeedWorldRef>): string | undefined {
    if (ref.domain !== "water") return undefined;
    const id = ref.source === "natural" ? ref.id.replace(/^natural:(river|lake|ocean):/, "") : ref.id;
    return this.activeIds.has(id) ? id : undefined;
  }

  queryRegions(kind: "river" | "lake" | "ocean", limit: number) {
    return this.plan && this.system.runtimeState.effectiveEnabled
      ? planningWaterRegions(this.plan, kind, limit, this.activeIds)
      : { kind, features: [] };
  }

  private async releaseComponents(): Promise<void> {
    const bodies = [...this.components.values()].map((body) => ({ body, config: body.configuration }));
    try {
      await finishPlanningWaterCleanup(
        bodies.flatMap(({ body, config }) =>
          this.options.readBody
            ? []
            : [
                () => body.dispose(),
                () => body.entity.destroy(),
                ...(config
                  ? [config.asset, config.quality, ...(config.look ? [config.look] : [])].map(
                      (resource) => () => resource.destroy()
                    )
                  : [])
              ]
        ),
        "Planning Water unloaded-resource cleanup failed"
      );
    } finally {
      this.components.clear();
      this.publishedRequests.clear();
      this.requestCache.clear();
      this.activeIds.clear();
      this.runtimePlan = undefined;
    }
  }

  /** Release only this view's Water services and material textures. */
  destroy(): Promise<void> {
    if (this.destroyPromise) return this.destroyPromise;
    this.destroyed = true;
    this.plan = undefined;
    this.latestPlan = undefined;
    this.pending?.abort();
    this.destroyPromise = (async () => {
      const retirements = new Set(this.retirements);
      await Promise.allSettled([...this.preparations]);
      for (const retirement of this.retirements) retirements.add(retirement);
      const settled = await Promise.allSettled([...retirements]);
      const errors = settled
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason);
      const bodies = [...this.components.values()].map((body) => ({ body, config: body.configuration }));
      await finishPlanningWaterCleanup(
        [
          () => this.system.dispose(),
          ...bodies.flatMap(({ body, config }) =>
            this.options.readBody
              ? []
              : [
                  () => body.dispose(),
                  ...(config
                    ? [config.asset, config.quality, ...(config.look ? [config.look] : [])].map(
                        (resource) => () => resource.destroy()
                      )
                    : [])
                ]
          ),
          () => this.componentRoot.destroy()
        ],
        "Planning Water shutdown cleanup failed",
        errors
      );
    })().finally(() => {
      this.components.clear();
      this.publishedRequests.clear();
      this.requestCache.clear();
      this.activeIds.clear();
    });
    return this.destroyPromise;
  }

  private requests(plan: IslandPlan, update?: PlanningWaterUpdate): WaterSceneBodyRequest[] {
    const { engine, camera } = this.options;
    const oceanRequest = (): WaterSceneBodyRequest => {
      const prepared = compilePlanningOcean(plan);
      const descriptor = { schemaVersion: 2 as const, id: prepared.data.sourceId, config: prepared.data.config };
      const authoring = this.host.registerAuthoring((assets) => registerOceanAuthoring(assets, descriptor.config));
      const asset = createWaterBodyAsset({
        id: "planning-ocean-asset:" + prepared.sourceHash,
        kind: "ocean",
        representation: { domain: "world-space-ocean", macroSurface: "gerstner" },
        representationData: prepared,
        representationDataHash: prepared.compileKey,
        sourceHash: prepared.sourceHash,
        source: {
          schemaVersion: WaterBodySourceSchemaVersion.V1,
          kind: WaterBodySourceKind.OceanNearshore,
          capabilities: { localBathymetry: true, shoreSdf: true, current: false },
          descriptor
        }
      });
      return {
        bodyId: "planning-ocean",
        asset,
        instance: createWaterBodyInstance({
          id: "planning-ocean",
          assetId: asset.id,
          ...authoring,
          lookPresetId: authoring.lookPresetId,
          transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] },
          priority: 0,
          visible: this.oceanVisible,
          interaction: { query: true, buoyancy: false, wake: false },
          representationState: planningOceanRepresentation(plan)
        }),
        bodyOrigin: [0, 0],
        canonicalDescriptorHash: asset.sourceHash,
        createRuntimeContext: (root) => ({
          engine,
          root,
          cameraPositionProvider: () => camera.entity.transform.worldPosition,
          sceneFogEnabled: false
        })
      };
    };
    const requests: WaterSceneBodyRequest[] = [];
    if (plan.parameters.landMode === "continuous") {
      this.oceanRequest = undefined;
    } else {
      const ocean = update ? this.oceanRequest : oceanRequest();
      if (!ocean) throw new Error("Water edit has no published ocean base");
      this.oceanRequest = ocean;
    }
    const dependencies = new Map(
      plan.waters.map((water) => [
        water.id,
        update && water.id !== update.bodyId
          ? (this.requestCache.get(water.id)?.dependency ?? "")
          : planningWaterDependency(plan, water)
      ])
    );
    const changed = new Set(
      [...dependencies]
        .filter(
          ([id, dependency]) =>
            (!update || (update.surface && id === update.bodyId)) &&
            this.requestCache.get(id)?.dependency !== dependency
        )
        .map(([id]) => id)
    );
    for (const id of changed) this.requestCache.delete(id);
    for (const river of changed.size ? planningRiverDescriptors(plan, changed) : []) {
      const asset = createRiverWaterBodyAsset(river, "planning-river-asset:" + river.id);
      const points = river.segments.flatMap((segment) => segment.curve.points);
      const reach = (point: (typeof points)[number]) => (point.width ?? river.defaults.shape.width) / 2;
      requests.push({
        bodyId: river.id,
        asset,
        instance: createRiverWaterBodyInstance({
          id: river.id,
          assetId: asset.id,
          lookPresetId: waterPresentation.riverLookId,
          qualityPlanId: riverQualityPlanIdForQuality(river.defaults.quality.material.level),
          visible: this.riversVisible,
          priority: 12
        }),
        bodyOrigin: [0, 0],
        logicalBounds: {
          minX: points.reduce((min, p) => Math.min(min, p.position[0] - reach(p)), Infinity),
          minZ: points.reduce((min, p) => Math.min(min, p.position[2] - reach(p)), Infinity),
          maxX: points.reduce((max, p) => Math.max(max, p.position[0] + reach(p)), -Infinity),
          maxZ: points.reduce((max, p) => Math.max(max, p.position[2] + reach(p)), -Infinity)
        },
        canonicalDescriptorHash: asset.sourceHash,
        createRuntimeContext: (root) => ({
          engine,
          root,
          logicalBodyOrigin: [0, 0]
        })
      });
    }
    if (changed.size) requests.push(...planningLakeRequests(plan, this.host, engine, this.riversVisible, changed));
    for (const { id, asset } of changed.size ? planningLakeAssets(plan, changed) : []) {
      const authoring = this.host.registerAuthoring(registerSeedWorldAuthoredBasinAuthoringV1);
      requests.push({
        bodyId: id,
        asset,
        instance: createWaterBodyInstance({
          id,
          assetId: asset.id,
          ...authoring,
          transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] },
          visible: this.riversVisible,
          priority: 14,
          interaction: { query: true, buoyancy: false, wake: false }
        }),
        canonicalDescriptorHash: asset.sourceHash,
        createRuntimeContext: (root) => ({ engine, root })
      });
    }
    for (const request of requests)
      if (dependencies.has(request.bodyId))
        this.requestCache.set(request.bodyId, {
          dependency: dependencies.get(request.bodyId)!,
          request,
          baseLookId: request.asset.kind === "river" ? waterPresentation.riverLookId : request.instance.lookPresetId
        });
    for (const id of this.requestCache.keys()) if (!dependencies.has(id)) this.requestCache.delete(id);
    // Presentation is per publication. Retain each physical request and its original preset,
    // including when undo removes a colour override or the basin is temporarily dry.
    return [
      ...(this.oceanRequest ? [this.oceanRequest] : []),
      ...plan.waters.flatMap((water) => {
        const cached = this.requestCache.get(water.id);
        if (!cached) return [];
        const request = {
          ...cached.request,
          instance: {
            ...cached.request.instance,
            visible: this.riversVisible,
            lookPresetId: cached.baseLookId
          }
        };
        this.requestCache.set(water.id, { ...cached, request });
        return [request];
      })
    ];
  }
}

class PlanningWaterPickBatch extends SeedWorldArrayPickBatch {
  private readonly state = new WaterSurfacePickingState();
  constructor(
    renderer: MeshRenderer,
    readonly bodyId: string,
    readonly kind: string,
    sourceId?: string
  ) {
    super(renderer);
    this.count = 1;
    this.id = sourceId ?? `natural:${kind}:${bodyId}`;
  }
  prepare(): void {
    this.state.prepare(this.renderer.getMaterials());
  }
  restore(): void {
    this.state.restore();
  }
}
