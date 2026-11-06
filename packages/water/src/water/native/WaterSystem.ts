import { createFarmlandsWaterResourceFactories } from "../resources/river/FarmlandsWaterRuntimeResources";
import { sampleRiverDrop, type RiverDrop } from "../authoring/river/RiverDrop";
import {
  compileWaterPlanarTransform,
  waterWorldPointToLocal,
  waterLocalPointToWorld
} from "../runtime/body/WaterPlanarTransform";
import type { WaterEnvironmentReflectionSource, WaterEnvironmentReflectionProviderHandle } from "../runtime/index";
import { Vector3 } from "@galacean/engine-math";
import { Camera, Layer, Script, ignoreClone, type Scene, type Entity } from "@galacean/engine-core";
import { createWaterBodyInstance } from "../authoring/body/WaterBodyInstance";
import { createWaterBodyAsset } from "../authoring/body/WaterBodyAsset";
import type {
  PreparedWaterSceneBodySetTransaction,
  PublishedWaterSceneBodySet,
  WaterSceneBodySetTransaction,
  WaterSceneRuntimeHostOptions
} from "../runtime/scene/WaterSceneRuntimeHost";
import { WaterSceneRuntimeHost } from "../runtime/scene/WaterSceneRuntimeHost";
import { HeightfieldWaterBackend } from "../runtime/heightfield/HeightfieldWaterBackend";
import { RiverWaterBackend } from "../runtime/river/RiverWaterBackend";
import { OceanWaterBackend } from "../runtime/ocean/OceanWaterBackend";
import { OceanTextureLibrary } from "../runtime/ocean/OceanTextureLibrary";
import { createLakeNormalResourceFactory } from "../resources/lake/LakeNormalRuntimeResource";
import { createWaterSurfaceSample } from "../runtime/query/WaterSurfaceProvider";
import { createWaterSpatialFieldSample, WaterSpatialFieldChannel } from "../runtime/spatial/WaterSpatialFieldProvider";
import { installLook, scopedLook } from "./WaterResources";
import {
  WaterDevelopmentRelay,
  WaterRuntimeDrafts,
  type WaterRuntimeControl,
  type WaterRuntimeState
} from "./WaterRuntimeControl";
import {
  nativeWaterOwners,
  WaterBodyComponent,
  freezeConfiguration,
  type PreparedWaterBodyConfiguration,
  type WaterBodyConfiguration
} from "./WaterBodyComponent";

export interface WaterBatchUpdate {
  readonly body: WaterBodyComponent;
  readonly configuration: Readonly<WaterBodyConfiguration>;
}
export interface PreparedNativeWaterBatch {
  readonly shaderWarmupRoots: readonly Entity[];
  commit(): PublishedWaterSceneBodySet;
  rollback(): Promise<void>;
}

/** Host-specific initialization and latest accepted publication; neither callback owns the global gate. */
export interface WaterRuntimeIntegration {
  initialize?(host: WaterSceneRuntimeHost): void;
  beforeUnload?(): Promise<void>;
  afterUnload?(): Promise<void>;
  restore?(): Promise<void>;
  isCurrent?(): boolean;
}

function runtimeErrorMessage(error: unknown): string {
  return error instanceof AggregateError
    ? `${error.message}: ${error.errors.map(runtimeErrorMessage).join("; ")}`
    : error instanceof Error
      ? error.message
      : String(error);
}

interface WaterBatchRenderRoots {
  roots?: Entity[];
}

// Published body requests can outlive their preparation. Construct this callback
// outside stageBody/prepareBatch so it cannot retain their transaction scopes.
function nativeWaterRuntimeContext(
  system: WaterSystem,
  textures: OceanTextureLibrary | undefined,
  capture?: WaterBatchRenderRoots
) {
  return (root: Entity) => {
    capture?.roots?.push(root);
    return {
      engine: system.engine,
      root,
      textures: textures?.textures,
      cameraPositionProvider: () => system.camera!.entity.transform.worldPosition,
      sceneFogEnabled: false
    };
  };
}

/** One Scene owner, reusing the existing transactional host and three backends. */
export class WaterSystem extends Script implements WaterRuntimeControl {
  readonly developmentTargets = new WaterDevelopmentRelay();
  private readonly _runtimeDrafts = new WaterRuntimeDrafts();
  private readonly _runtimeObservers = new Set<(state: Readonly<WaterRuntimeState>) => void>();
  private _runtimeState: Readonly<WaterRuntimeState> = Object.freeze({
    requestedEnabled: true,
    effectiveEnabled: true,
    phase: "enabled"
  });
  private _runtimeIntegration?: WaterRuntimeIntegration;
  private _runtimeTail: Promise<unknown> = Promise.resolve();
  private _runtimeGeneration = 0;
  private _runtimeInitialized = false;
  get runtimeState(): Readonly<WaterRuntimeState> {
    return this._runtimeState;
  }
  /** Non-allocating access for disabled queries and diagnostics. */
  get activeRuntimeHost(): WaterSceneRuntimeHost | undefined {
    return this._host;
  }
  get activeEnvironment(): WaterEnvironmentReflectionProviderHandle | undefined {
    return this._environment;
  }
  observeRuntimeState(observer: (state: Readonly<WaterRuntimeState>) => void): () => void {
    this._runtimeObservers.add(observer);
    observer(this._runtimeState);
    return () => {
      this._runtimeObservers.delete(observer);
    };
  }
  private setRuntimeState(state: WaterRuntimeState): void {
    this._runtimeState = Object.freeze(state);
    for (const observer of this._runtimeObservers) {
      try {
        observer(this._runtimeState);
      } catch (error) {
        console.error("[water] Runtime observer failed", error);
      }
    }
  }

  /** Unloads all Water-owned runtime resources; authoring and the Scene itself remain intact. */
  setRuntimeEnabled(enabled: boolean): Promise<void> {
    this.assertLive();
    if (typeof enabled !== "boolean") return Promise.reject(new TypeError("Water runtime enablement must be boolean."));
    if (this._runtimeState.requestedEnabled === enabled && this._runtimeState.phase !== "error") {
      return this._runtimeTail.then(() => {});
    }
    const generation = ++this._runtimeGeneration;
    const withdrawalErrors: unknown[] = [];
    if (!enabled) {
      try {
        if (this._runtimeState.effectiveEnabled)
          this._runtimeDrafts.capture(
            this._host?.loader,
            (id) => {
              const look = this._bodies.get(id)?.configuration?.look;
              return look ? scopedLook(look) : undefined;
            },
            (target) =>
              this._presentationVisibility.get(target.bodyKind) === false
                ? (this._bodyPresentationVisibility.get(target.bodyId) ??
                  this._bodies.get(target.bodyId)?.configuration?.visible ??
                  true)
                : target.handle.visible
          );
      } catch (error) {
        withdrawalErrors.push(error);
      }
      this.developmentTargets.bind();
      this._activation.abort();
      if (this._runtimeRoot) this._runtimeRoot.isActive = false;
    }
    this.setRuntimeState({
      requestedEnabled: enabled,
      effectiveEnabled: false,
      phase: enabled ? "enabling" : "disabling"
    });
    if (!enabled) {
      try {
        this._host?.withdrawRuntime();
      } catch (error) {
        withdrawalErrors.push(error);
      }
    }
    const task = this._runtimeTail
      .catch(() => {})
      .then(async () => {
        try {
          if (this._disposed) return;
          if (!enabled) {
            await this.unloadRuntime(withdrawalErrors);
          } else {
            if (generation !== this._runtimeGeneration) return;
            // A failed unload retains owners for retry. Never reuse its withdrawn Host.
            if (this._host || this._textures || this._runtimeRoot) {
              await this._runtimeIntegration?.beforeUnload?.();
              await this._tail;
              await this.releaseRuntime();
              await this._runtimeIntegration?.afterUnload?.();
            }
            this._activation = new AbortController();
            const host = this.host();
            if (this._runtimeRoot) this._runtimeRoot.isActive = false;
            if (!this._runtimeIntegration?.restore) {
              const updates = this.bodies
                .filter((body) => body.configuration)
                .map((body) => ({ body, configuration: body.configuration! }));
              if (updates.length) {
                const prepared = await this.prepareBatch(updates, this._activation.signal);
                await prepared.commit().retiredCleanup;
              }
            }
            do {
              this._activation.signal.throwIfAborted();
              await this._runtimeIntegration?.restore?.();
              await this._runtimeDrafts.restore(host.loader, this._activation.signal);
            } while (this._runtimeIntegration?.isCurrent?.() === false);
            this._activation.signal.throwIfAborted();
            if (generation !== this._runtimeGeneration || this._disposed) return;
            for (const [kind, visible] of this._presentationVisibility)
              if (!visible) host.setVisible(false, kind as "river" | "lake" | "ocean");
            if (this._runtimeRoot) this._runtimeRoot.isActive = true;
          }
          if (generation !== this._runtimeGeneration || this._disposed) return;
          this.setRuntimeState({
            requestedEnabled: enabled,
            effectiveEnabled: enabled,
            phase: enabled ? "enabled" : "disabled"
          });
          if (enabled) this.developmentTargets.bind(this._host?.loader);
        } catch (error) {
          if (enabled) {
            this._activation.abort();
            try {
              await this.releaseRuntime();
              await this._runtimeIntegration?.afterUnload?.();
            } catch (cleanupError) {
              error = new AggregateError([error, cleanupError], "Water enablement cleanup failed.");
            }
          }
          if (generation === this._runtimeGeneration && !this._disposed)
            this.setRuntimeState({
              requestedEnabled: enabled,
              effectiveEnabled: false,
              phase: "error",
              error: runtimeErrorMessage(error),
              residualResources: this.describeRuntimeResidue()
            });
          throw error;
        }
      });
    this._runtimeTail = task;
    return task;
  }
  private _presentationVisibility = new Map<string, boolean>();
  private describeRuntimeResidue(): string {
    const facts: string[] = [];
    if (this._host) {
      facts.push("Host retained / Host 保留待清理");
      try {
        const diagnostic = this._host.getDiagnostics();
        facts.push(
          `bodies ${diagnostic.activeBodyCount} · cache ${diagnostic.loader.cachedResourceCount} · leases ${diagnostic.runtimeResources.activeLeaseCount} · camera ${diagnostic.cameraFeatures.activeConsumerCount}`
        );
      } catch {
        facts.push("Host diagnostics unavailable / Host 诊断不可用");
      }
    }
    if (this._textures) facts.push("Ocean texture owner retained / Ocean 纹理所有者引用保留");
    if (this._runtimeRoot && !this._runtimeRoot.destroyed) facts.push("Runtime root retained / 运行实体保留");
    return facts.join("; ") || "Native runtime released; host cleanup incomplete / 原生运行资源已释放，宿主清理未完成";
  }
  private _bodyPresentationVisibility = new Map<string, boolean>();
  /** View-layer visibility is distinct from authored per-body visibility and query participation. */
  setPresentationVisible(kind: "river" | "lake" | "ocean", visible: boolean): void {
    this.assertLive();
    if (!this._runtimeState.effectiveEnabled) {
      this._presentationVisibility.set(kind, visible);
      return;
    }
    const changed: Array<{
      handle: NonNullable<ReturnType<WaterSceneRuntimeHost["getBodyHandle"]>>;
      visible: boolean;
    }> = [];
    try {
      for (const body of this.bodies) {
        const config = body.configuration,
          handle = this._host?.getBodyHandle(body.waterId);
        if (config?.asset.kind !== kind || !handle?.active) continue;
        changed.push({ handle, visible: handle.instance?.visible ?? true });
        if (this._presentationVisibility.get(kind) !== false)
          this._bodyPresentationVisibility.set(body.waterId, handle.visible);
        handle.setVisible(visible && (this._bodyPresentationVisibility.get(body.waterId) ?? config.visible ?? true));
      }
      this._presentationVisibility.set(kind, visible);
    } catch (error) {
      for (const previous of changed.reverse()) previous.handle.setVisible(previous.visible);
      throw error;
    }
  }
  private _camera?: Camera;
  private _runtimeOptions: Omit<WaterSceneRuntimeHostOptions, "engine" | "scene" | "camera" | "root"> = {};
  /** Host integration tuning must be supplied before the first publication. */
  private _environmentSource?: WaterEnvironmentReflectionSource;
  private _environment?: WaterEnvironmentReflectionProviderHandle;
  get environment(): WaterEnvironmentReflectionProviderHandle {
    this.host();
    return this._environment!;
  }
  configureRuntime(
    options: typeof this._runtimeOptions,
    environment?: WaterEnvironmentReflectionSource,
    integration?: WaterRuntimeIntegration
  ): void {
    if (this._host || this._runtimeInitialized) throw new Error("CONFLICT: Water runtime is already initialized.");
    this._runtimeOptions = { ...options };
    this._environmentSource = environment;
    this._runtimeIntegration = integration;
  }
  /** @internal Host adapters use this owner; never create a parallel scene runtime. */
  get runtimeHost(): WaterSceneRuntimeHost {
    return this.host();
  }

  get camera(): Camera | undefined {
    return this._camera;
  }
  set camera(camera: Camera | undefined) {
    if ((this._host || this._runtimeInitialized) && camera !== this._camera)
      throw new Error("NOT_SUPPORTED: Recreate WaterSystem to change its bound Camera.");
    this._camera = camera;
  }
  private _ocean = new OceanWaterBackend();
  private _host?: WaterSceneRuntimeHost;
  private _runtimeRoot?: Entity;
  private _bodies = new Map<string, WaterBodyComponent>();
  private _tail: Promise<void> = Promise.resolve();
  private _textures?: Promise<OceanTextureLibrary>;
  private _disposed = false;
  private _scene?: Scene;
  private _revision = 0;
  private _disposeTask?: Promise<void>;
  private _lifetime = new AbortController();
  private _activation = new AbortController();

  get revision(): number {
    return this._revision;
  }
  get bodies(): readonly WaterBodyComponent[] {
    this.reconcileMembership();
    return [...this._bodies.values()].filter(
      (b) => !b.destroyed && !b.pendingDestroy && b.entity.scene === this.entity.scene
    );
  }
  get ready(): Promise<void> {
    return this._tail.then(() => {});
  }

  override onEnable(): void {
    const scene = this.entity.scene!;
    if (this._scene && this._scene !== scene)
      throw new Error("NOT_SUPPORTED: Recreate WaterSystem when moving to another Scene.");
    if (nativeWaterOwners.has(scene) && nativeWaterOwners.get(scene) !== this)
      throw new Error("CONFLICT: A Scene can have only one WaterSystem.");
    this._scene = scene;
    nativeWaterOwners.set(scene, this);
    this._activation = new AbortController();
    for (const body of this.bodies)
      if (body.enabled && body.entity.isActiveInHierarchy) void body.refresh().catch(() => {});
  }
  override onDisable(): void {
    this._activation.abort();
    for (const body of this.bodies) void this.detach(body).catch(() => {});
  }
  override onUpdate(deltaSeconds: number): void {
    if (!this._runtimeState.effectiveEnabled) return;
    // Discovery is an authoring operation; never traverse the Scene in the frame loop.
    for (const body of this._bodies.values())
      if (this._host?.getBodyHandle(body.waterId)?.active) this._ocean.updateRuntime(body.waterId, deltaSeconds);
  }
  override onDestroy(): void {
    void this.dispose().catch(() => {});
  }

  /** Membership persists while disabled; runtime publication remains transactional. */
  register(body: WaterBodyComponent): void {
    this.assertLive();
    if (body.entity.scene !== this.entity.scene)
      throw new Error("INVALID_ARGUMENT: Water component belongs to another Scene.");
    const existing = this._bodies.get(body.waterId);
    if (existing && existing !== body) throw new Error("CONFLICT: Duplicate Water identity.");
    this._bodies.set(body.waterId, body);
  }

  async publish(
    body: WaterBodyComponent,
    config: Readonly<WaterBodyConfiguration>,
    requestSignal: AbortSignal
  ): Promise<number> {
    const signal = AbortSignal.any([
      requestSignal,
      this._lifetime.signal,
      ...(this._runtimeState.requestedEnabled && this.enabled && this.entity.isActiveInHierarchy
        ? [this._activation.signal]
        : [])
    ]);
    return this.enqueue(async () => {
      this.assertLive();
      signal.throwIfAborted();
      if (body.entity.scene !== this.entity.scene)
        throw new Error("INVALID_ARGUMENT: Water component belongs to another Scene.");
      const existing = this._bodies.get(body.waterId);
      if (existing && existing !== body) throw new Error("CONFLICT: Duplicate Water identity.");
      if (!body.waterId) throw new Error("INVALID_ARGUMENT: Water identity is required.");
      this.validateOceanSet([{ body, configuration: config }]);
      if (!this._runtimeState.requestedEnabled) {
        this._bodies.set(body.waterId, body);
        return ++this._revision;
      }
      const transaction = this.host().beginBodySetTransaction();
      let prepared: PreparedWaterSceneBodySetTransaction | undefined;
      try {
        await this.stageBody(body, config, transaction, signal);
        prepared = await transaction.prepare(signal);
        signal.throwIfAborted();
        this.assertLive();
        const published = prepared.commit();
        this._bodies.set(body.waterId, body);
        this._runtimeDrafts.acceptBaseline(this._host?.loader, new Set([body.waterId]), () => config.visible ?? true);
        this._revision++;
        // Retirement is owned and joined by Host.destroy, not part of mutation success.
        void published.retiredCleanup.catch(() => {});
        return this._revision;
      } catch (error) {
        await (prepared ?? transaction).rollback();
        throw error;
      }
    });
  }

  private async stageBody(
    body: WaterBodyComponent,
    config: Readonly<WaterBodyConfiguration>,
    transaction: WaterSceneBodySetTransaction,
    signal: AbortSignal,
    renderRoots?: WaterBatchRenderRoots
  ): Promise<void> {
    const t = body.entity.transform,
      p = t.worldPosition,
      q = t.worldRotationQuaternion,
      scale = t.lossyWorldScale;
    if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w, scale.x, scale.y, scale.z].every(Number.isFinite))
      throw new Error("INVALID_ARGUMENT: Water Entity transform must contain finite values.");
    if ([scale.x - 1, scale.y - 1, scale.z - 1, q.x, q.z].some((v) => Math.abs(v) > 1e-6))
      throw new Error("NOT_SUPPORTED: Water supports translation and yaw, with unit world scale.");
    const host = this.host();
    const source = config.asset.runtimeData();
    const asset = createWaterBodyAsset({ ...source, id: `native-body:${config.asset.contentHash}` });
    const look = scopedLook(config.look);
    const quality = { ...config.quality.data, id: `native-quality:${config.quality.contentHash}` };
    host.registerAuthoringOnce(look.look.id, config.look.contentHash, (registry) => installLook(registry, look));
    host.registerAuthoringOnce(quality.id, config.quality.contentHash, (registry) =>
      registry.registerQualityPlan(quality)
    );
    const instance = createWaterBodyInstance({
      id: body.waterId,
      assetId: asset.id,
      lookPresetId: look.look.id,
      qualityPlanId: quality.id,
      transform: {
        position: [p.x, p.y, p.z],
        yawDegrees: (Math.atan2(2 * q.w * q.y, 1 - 2 * q.y * q.y) * 180) / Math.PI,
        scaleXZ: [1, 1]
      },
      visible: (config.visible ?? true) && (this._presentationVisibility.get(source.kind) ?? true),
      priority: config.priority ?? (source.kind === "ocean" ? 0 : 10),
      interaction: config.interaction ?? { query: true, buoyancy: false, wake: false },
      representationState: config.representationState
    });
    if (!this._runtimeState.requestedEnabled) {
      transaction.remove(body.waterId);
      return;
    }
    if (source.kind === "ocean" && !this._textures) {
      this._textures = OceanTextureLibrary.create(this.engine).catch((error) => {
        this._textures = undefined;
        throw error;
      });
    }
    const textures = source.kind === "ocean" ? await this._textures : undefined;
    signal.throwIfAborted();
    if (body.enabled && body.entity.isActiveInHierarchy && this.enabled && this.entity.isActiveInHierarchy) {
      transaction.stage({
        bodyId: body.waterId,
        asset,
        instance,
        createRuntimeContext: nativeWaterRuntimeContext(this, textures, renderRoots)
      });
    } else transaction.remove(body.waterId);
  }

  private validateOceanSet(updates: readonly WaterBatchUpdate[], removals: readonly WaterBodyComponent[] = []): void {
    const replacements = new Map(updates.map((update) => [update.body, update.configuration]));
    const bodies = new Set([...this.bodies, ...replacements.keys()]);
    let oceans = 0;
    for (const body of bodies) {
      if (removals.includes(body)) continue;
      const config = replacements.get(body) ?? body.configuration;
      if (config?.asset.kind === "ocean" && body.enabled && body.entity.isActiveInHierarchy) oceans++;
    }
    if (oceans > 1) throw new Error("NOT_SUPPORTED: The current Ocean backend supports one active Ocean per Scene.");
  }

  /** Prepare native components together. Nothing becomes effective until the caller commits once. */
  prepareBatch(
    updates: readonly WaterBatchUpdate[],
    requestSignal?: AbortSignal,
    removals: readonly WaterBodyComponent[] = []
  ): Promise<PreparedNativeWaterBatch> {
    const removed = [...removals];
    const batch = updates.map(({ body, configuration }) => ({
      body,
      configuration: freezeConfiguration(configuration)
    }));
    return this.enqueue(async () => {
      this.assertLive();
      const runtimeGeneration = this._runtimeGeneration;
      const publishRuntime = this._runtimeState.requestedEnabled;
      const signal = AbortSignal.any([
        this._lifetime.signal,
        ...(publishRuntime ? [this._activation.signal] : []),
        ...(requestSignal ? [requestSignal] : [])
      ]);
      signal.throwIfAborted();
      const members = new Set<WaterBodyComponent>();
      const ids = new Set<string>();
      for (const { body } of batch) {
        if (body.destroyed || body.entity.scene !== this.entity.scene || members.has(body) || ids.has(body.waterId))
          throw new Error("INVALID_ARGUMENT: Batch requires unique live components in this Scene.");
        const existing = this._bodies.get(body.waterId);
        if (existing && existing !== body) throw new Error("CONFLICT: Duplicate Water identity.");
        members.add(body);
        ids.add(body.waterId);
      }
      for (const body of removed) {
        if (
          members.has(body) ||
          ids.has(body.waterId) ||
          body.destroyed ||
          !body.configuration ||
          this._bodies.get(body.waterId) !== body
        )
          throw new Error("INVALID_ARGUMENT: Removal requires a unique published component.");
        members.add(body);
        ids.add(body.waterId);
      }
      this.validateOceanSet(batch, removed);
      const candidates: Array<{ body: WaterBodyComponent; candidate: PreparedWaterBodyConfiguration }> = [];
      let prepared: PreparedWaterSceneBodySetTransaction | undefined;
      let transaction: WaterSceneBodySetTransaction | undefined;
      let finalized = false;
      let rollbackTask: Promise<void> | undefined;
      let combined = signal;
      const renderRoots: WaterBatchRenderRoots = { roots: [] };
      const releaseReferences = () => {
        // Clear the shared capture as well as its current contents: requests
        // reused by later activations must never repopulate a retired batch.
        if (renderRoots.roots) renderRoots.roots.length = 0;
        renderRoots.roots = undefined;
        candidates.length = 0;
        batch.length = 0;
        removed.length = 0;
        prepared = undefined;
        transaction = undefined;
      };
      const rollback = (error?: unknown): Promise<void> => {
        if (rollbackTask) return rollbackTask;
        if (finalized) return Promise.resolve();
        finalized = true;
        combined.removeEventListener("abort", aborted);
        for (const { candidate } of candidates) candidate.rollback(error);
        rollbackTask = ((prepared ?? transaction)?.rollback() ?? Promise.resolve()).finally(releaseReferences);
        return rollbackTask;
      };
      const aborted = () => {
        void rollback(combined.reason).catch(() => {});
      };
      try {
        for (const { body, configuration } of batch)
          candidates.push({ body, candidate: body._prepareConfiguration(this, configuration, signal) });
        for (const body of removed)
          candidates.push({ body, candidate: body._prepareConfiguration(this, body.configuration!, signal) });
        combined = AbortSignal.any([signal, ...candidates.map(({ candidate }) => candidate.signal)]);
        combined.addEventListener("abort", aborted, { once: true });
        combined.throwIfAborted();
        transaction = publishRuntime ? this.host().beginBodySetTransaction() : undefined;
        for (const { body, candidate } of candidates)
          if (transaction) {
            if (removed.includes(body)) transaction.remove(body.waterId);
            else await this.stageBody(body, candidate.configuration, transaction, combined, renderRoots);
          }
        prepared = await transaction?.prepare(combined);
        // Aborting while prepare awaited must also retire the newly returned candidate.
        if (finalized || combined.aborted) {
          try {
            await prepared?.rollback();
          } finally {
            releaseReferences();
          }
          combined.throwIfAborted();
          throw new Error("CANCELLED: Water batch discarded.");
        }
        return {
          get shaderWarmupRoots() {
            return finalized ? [] : Object.freeze([...new Set(renderRoots.roots ?? [])]);
          },
          commit: () => {
            try {
              this.assertLive();
              if (finalized) throw new Error("CONFLICT: Water batch is no longer active.");
              combined.throwIfAborted();
              if (
                runtimeGeneration !== this._runtimeGeneration ||
                publishRuntime !== this._runtimeState.requestedEnabled
              )
                throw new Error("CONFLICT: Water batch crossed a runtime enablement change.");
              for (const { body, candidate } of candidates) {
                candidate.check();
                const existing = this._bodies.get(body.waterId);
                if (existing && existing !== body) throw new Error("CONFLICT: Duplicate Water identity.");
              }
              const publication = prepared?.commit() ?? {
                revision: this._revision + 1,
                retiredCleanup: Promise.resolve()
              };
              this._revision++;
              for (const { body, candidate } of candidates) {
                candidate.commit(this._revision);
                if (removed.includes(body)) {
                  this._bodies.delete(body.waterId);
                } else this._bodies.set(body.waterId, body);
              }
              if (prepared)
                this._runtimeDrafts.acceptBaseline(
                  this._host?.loader,
                  new Set(batch.map(({ body }) => body.waterId)),
                  (target) => this._bodies.get(target.bodyId)?.configuration?.visible ?? true
                );
              finalized = true;
              combined.removeEventListener("abort", aborted);
              for (const body of removed) void body.dispose().catch(() => {});
              void publication.retiredCleanup.catch(() => {});
              releaseReferences();
              return publication;
            } catch (error) {
              void rollback(error).catch(() => {});
              throw error;
            }
          },
          rollback: () => rollback()
        };
      } catch (error) {
        await rollback(error);
        throw error;
      }
    });
  }

  detach(body: WaterBodyComponent, forget = false): Promise<void> {
    return this.enqueue(async () => {
      if (this._bodies.get(body.waterId) !== body) return;
      let cleanup: Promise<void> | undefined;
      if (this._host?.getBodyHandle(body.waterId)?.active) {
        const transaction = this._host.beginBodySetTransaction();
        transaction.remove(body.waterId);
        const prepared = await transaction.prepare();
        try {
          const published = prepared.commit();
          // Query withdrawal and its version are published in the same synchronous turn.
          this._revision++;
          cleanup = published.retiredCleanup;
        } catch (error) {
          await prepared.rollback();
          throw error;
        }
      }
      if (forget || body.destroyed || body.pendingDestroy || body.entity.scene !== this.entity.scene)
        this._bodies.delete(body.waterId);
      // Cleanup cannot undo publication. Host records retirement failures separately.
      await cleanup;
    });
  }

  inspect(id: string) {
    if (!this._bodies.has(id)) this.reconcileMembership();
    const body = this._bodies.get(id);
    if (!body || body.destroyed) throw new Error("NOT_FOUND: Water body does not exist in this Scene.");
    const handle = this._runtimeState.effectiveEnabled ? this._host?.getBodyHandle(id) : undefined;
    return {
      id,
      kind: body.configuration!.asset.kind,
      enabled: body.enabled && body.entity.isActiveInHierarchy,
      visible:
        this._runtimeState.effectiveEnabled && (handle?.instance?.visible ?? body.configuration!.visible ?? true),
      active: this._runtimeState.effectiveEnabled && (handle?.active ?? false),
      revision: this._revision,
      instance: handle?.active ? handle.instance : undefined,
      inspection: handle?.active ? handle.inspect() : undefined,
      lastError: body.lastError
    };
  }

  sampleDrops(x: number, y: number, z: number, id?: string) {
    if (![x, y, z].every(Number.isFinite)) throw new Error("INVALID_ARGUMENT: Query coordinates must be finite.");
    if (id !== undefined) this.inspect(id);
    if (!this._runtimeState.effectiveEnabled) return { revision: this._revision, drops: [] };
    const hits = [];
    for (const body of this.bodies) {
      if (id !== undefined && body.waterId !== id) continue;
      const handle = this._host?.getBodyHandle(body.waterId);
      if (!handle?.active || !handle.instance || !handle.queryEnabled || body.configuration?.asset.kind !== "river")
        continue;
      const drops = body.configuration.asset.riverDrops;
      const transform = compileWaterPlanarTransform(handle.instance.transform);
      const local = waterWorldPointToLocal(transform, { x, y, z });
      for (const drop of drops) {
        const hit = sampleRiverDrop(drop, [local.x, local.y, local.z]);
        const world = waterLocalPointToWorld(transform, { x: hit.closest[0], y: hit.closest[1], z: hit.closest[2] });
        hits.push({ ...hit, bodyId: body.waterId, closest: [world.x, world.y, world.z] });
      }
    }
    return { revision: this._revision, drops: hits.sort((a, b) => a.distance - b.distance) };
  }

  sample(x: number, z: number, id?: string) {
    if (!Number.isFinite(x) || !Number.isFinite(z))
      throw new Error("INVALID_ARGUMENT: Query coordinates must be finite.");
    if (id !== undefined && !this._bodies.has(id)) this.reconcileMembership();
    if (id !== undefined && !this._bodies.has(id))
      throw new Error("NOT_FOUND: Water body does not exist in this Scene.");
    if (!this._runtimeState.effectiveEnabled)
      return { water: false, revision: this._revision, status: "unresolved" } as const;
    const surface = createWaterSurfaceSample();
    const requested = id === undefined ? undefined : this._host?.getBodyHandle(id);
    const hit =
      id === undefined
        ? this._host?.world.sampleSurface(new Vector3(x, 0, z), surface)
        : requested?.active &&
          requested.queryEnabled &&
          requested.runtimeInterfaces.surface?.sampleSurface(new Vector3(x, 0, z), surface);
    const handle = requested ?? (hit ? this._host?.getBodyHandle(surface.waterBodyId) : undefined);
    const field = createWaterSpatialFieldSample();
    const resolved = !!(
      handle?.active &&
      handle.queryEnabled &&
      handle.runtimeInterfaces.spatialField?.sampleSpatialField(x, z, field)
    );
    if (!hit && !resolved) return { water: false, revision: this._revision, status: "unresolved" } as const;
    const body = this._bodies.get(id ?? surface.waterBodyId)!;
    const ocean = body.configuration!.asset.kind === "ocean";
    const bathymetry = resolved && !!(field.validChannels & WaterSpatialFieldChannel.Bathymetry);
    const shore = resolved && !!(field.validChannels & WaterSpatialFieldChannel.ShoreSignedDistance);
    return {
      water: !!hit,
      id: body.waterId,
      revision: this._revision,
      status: "resolved",
      surfaceElevationMetres: hit ? surface.surfacePosition.y : field.surfaceHeight,
      surfaceModel: ocean ? "ocean-datum-excludes-gerstner" : "published-surface",
      depth: { value: hit ? surface.waterDepth : field.waterDepth, quality: bathymetry ? "actual" : "proxy" },
      bed: bathymetry ? { value: field.bedHeight, quality: "actual" } : { quality: "unsupported" },
      velocity:
        hit && handle!.runtimeInterfaces.surfaceFeatures.velocity
          ? { value: [surface.waterVelocity.x, surface.waterVelocity.y, surface.waterVelocity.z], quality: "actual" }
          : { quality: "unsupported" },
      shoreDistance: shore
        ? { value: field.shoreSignedDistance, quality: field.insideField ? "actual" : "proxy" }
        : { quality: "unsupported" }
    };
  }

  dispose(): Promise<void> {
    if (this._disposeTask) return this._disposeTask;
    this._disposed = true;
    ++this._runtimeGeneration;
    this._activation.abort();
    if (this._runtimeRoot) this._runtimeRoot.isActive = false;
    this.setRuntimeState({ requestedEnabled: false, effectiveEnabled: false, phase: "disabling" });
    const withdrawalErrors: unknown[] = [];
    try {
      this._host?.withdrawRuntime();
    } catch (error) {
      withdrawalErrors.push(error);
    }
    this.developmentTargets.destroy();
    this._runtimeObservers.clear();
    this._lifetime.abort();
    for (const body of this.bodies) body.cancel();
    if (this._scene && nativeWaterOwners.get(this._scene) === this) nativeWaterOwners.delete(this._scene);
    this._disposeTask = Promise.allSettled([this._tail, this._runtimeTail])
      .catch(() => {})
      .then(async () => {
        try {
          await this.unloadRuntime(withdrawalErrors);
          this.setRuntimeState({ requestedEnabled: false, effectiveEnabled: false, phase: "disabled" });
        } catch (error) {
          this.setRuntimeState({
            requestedEnabled: false,
            effectiveEnabled: false,
            phase: "error",
            error: runtimeErrorMessage(error),
            residualResources: this.describeRuntimeResidue()
          });
          throw error;
        } finally {
          this._bodies.clear();
          this._runtimeDrafts.clear();
        }
      });
    return this._disposeTask;
  }
  private async unloadRuntime(errors: unknown[] = []): Promise<void> {
    for (const release of [
      () => this._runtimeIntegration?.beforeUnload?.(),
      () => this._tail,
      () => this.releaseRuntime(),
      () => this._runtimeIntegration?.afterUnload?.()
    ]) {
      try {
        await release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Water runtime cleanup failed.");
  }
  private async releaseRuntime(): Promise<void> {
    this.developmentTargets.bind();
    const errors: unknown[] = [];
    for (const action of [
      () => this._host?.destroy(),
      async () => {
        (await this._textures?.catch(() => undefined))?.destroy();
      },
      () => this._runtimeRoot?.destroy()
    ]) {
      try {
        await action();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "WaterSystem runtime cleanup failed.");
    this._host = undefined;
    this._environment = undefined;
    this._textures = undefined;
    this._runtimeRoot = undefined;
    this._ocean = new OceanWaterBackend();
    this._revision++;
  }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const task = this._tail.then(work, work);
    this._tail = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }
  private assertLive(): void {
    if (this._disposed) throw new Error("DESTROYED: WaterSystem was destroyed.");
  }
  private reconcileMembership(): void {
    if (this._disposed) return;
    // Inactive Entity/Prefab instances do not receive Awake when added to a Scene.
    // Reconcile discovery from the native hierarchy, without activating or compiling them.
    const components: WaterBodyComponent[] = [];
    for (const root of this.entity.scene!.rootEntities) {
      root.getComponentsIncludeChildren(WaterBodyComponent, components);
      for (const body of components) body._registerWith(this);
    }
    for (const body of this._bodies.values()) {
      if (body.entity.scene !== this.entity.scene) void this.detach(body, true).catch(() => {});
    }
  }
  private host(): WaterSceneRuntimeHost {
    this.assertLive();
    if (!this._runtimeState.requestedEnabled)
      throw new Error("DISABLED: Water runtime is unloaded; enable it before requesting a Host.");
    if (this._host) return this._host;
    if (!this.camera || this.camera.entity.scene !== this.entity.scene)
      throw new Error("MISSING_DEPENDENCY: WaterSystem requires a Camera in its Scene.");
    // Published instance transforms are world-space. Do not inherit the owner's transform a second time.
    const root = (this._runtimeRoot = this.entity.scene!.createRootEntity("WaterSystem runtime"));
    const host = new WaterSceneRuntimeHost({
      engine: this.engine,
      root,
      scene: this.entity.scene!,
      camera: this.camera,
      waterLayer: Layer.Layer30,
      reflection: { cullingMask: this.camera.cullingMask, waterLayerMask: Layer.Layer30 },
      ...this._runtimeOptions
    });
    this._environment = host.createEnvironmentReflectionProvider({
      id: "native-water-environment",
      source: this._environmentSource ?? {
        ambientLight: this.entity.scene!.ambientLight,
        rotationDegrees: 0,
        exposure: 1,
        hdr: true
      }
    });
    host.registerBackend(new HeightfieldWaterBackend());
    host.registerBackend(new RiverWaterBackend());
    host.registerBackend(this._ocean);
    host.ensureRuntimeResource(createLakeNormalResourceFactory(this.engine));
    for (const factory of createFarmlandsWaterResourceFactories(this.engine)) host.ensureRuntimeResource(factory);
    this._host = host;
    this._runtimeInitialized = true;
    this._runtimeIntegration?.initialize?.(host);
    if (this._runtimeState.effectiveEnabled) this.developmentTargets.bind(host.loader);
    return host;
  }
}

for (const key of [
  "_presentationVisibility",
  "_bodyPresentationVisibility",
  "_runtimeOptions",
  "_environmentSource",
  "_environment",
  "_ocean",
  "_host",
  "_runtimeRoot",
  "_bodies",
  "_tail",
  "_textures",
  "_disposed",
  "_scene",
  "_revision",
  "_disposeTask",
  "_lifetime",
  "_activation",
  "developmentTargets",
  "_runtimeDrafts",
  "_runtimeObservers",
  "_runtimeState",
  "_runtimeIntegration",
  "_runtimeTail",
  "_runtimeGeneration",
  "_runtimeInitialized"
])
  ignoreClone(WaterSystem.prototype, key);
