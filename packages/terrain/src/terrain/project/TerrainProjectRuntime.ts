import {
  AssetType,
  AssetPromise,
  BufferAsset,
  EngineObject,
  JSONAsset,
  KTX2TargetFormat,
  Material,
  PrefabResource,
  Script,
  Texture2D,
  type ReferResource
} from "@galacean/engine";
import {
  resolveTerrainProjectRegion,
  TerrainProjectAsset,
  type TerrainProjectLayerResources,
  type TerrainProjectResolvedGeometry,
  type TerrainProjectRegionResources
} from "./TerrainProjectAsset";
import {
  validateTerrainProjectLoadedReplacements,
  validateTerrainProjectRuntimeLoadedReplacements,
  validateTerrainProjectRuntimeLoadedSet,
  validateTerrainProjectWorldIndex
} from "./TerrainProjectCodec";
import {
  createTerrainProjectRuntimeClipmapDescriptor,
  type TerrainProjectClipmapDescriptor
} from "./TerrainProjectAdapter";
import type {
  TerrainProjectDocument,
  TerrainProjectRef,
  TerrainProjectRegion,
  TerrainProjectWorldIndex,
  TerrainProjectWorldRegion
} from "./TerrainProjectContract";
import type { TerrainProjectRegionDependencyType } from "./TerrainProjectRegionDependencies";
import { collectTerrainProjectRenderableRefs } from "./TerrainProjectResidency";

/** Canonical source and loaded Prefab counts for the currently loaded subset. */
export interface TerrainProjectRuntimeDiagnostics {
  availableRegions: number;
  loadedRegions: number;
  alphamaps: number;
  loadedHeightSeams: number;
  sourceHeightSamples: number;
  treeInstances: number;
  declaredDetailMaps: number;
  nonEmptyDetailMaps: number;
  detailInstances: number;
  prototypes: number;
  lodLevels: number;
  lodRenderers: number;
  surfaceLodCrossFadeDurationSeconds: number;
  maxConcurrentRegionLoads: number;
  maxConcurrentResourceLoadsPerRegion: number;
}

/** Scene-owned renderer configuration kept outside canonical Terrain data. */
export interface TerrainProjectRendererConfig {
  surfaceLodCrossFadeDurationSeconds: number;
}

/** Scene-owned limits for progressive Region and leaf-resource loading. */
export interface TerrainProjectLoadingConfig {
  /** Maximum Region aggregates started by one multi-Region request. */
  maxConcurrentRegions: number;
  /** Maximum leaf resources started concurrently within one Region aggregate. */
  maxConcurrentResourcesPerRegion: number;
  /** Whether declared tree and Detail prototype resources load before they have authored instances. */
  loadAllPrototypeResources?: boolean;
}

const DEFAULT_TERRAIN_PROJECT_LOADING_CONFIG: TerrainProjectLoadingConfig = {
  maxConcurrentRegions: 2,
  maxConcurrentResourcesPerRegion: 8
};

/** Explicit ownership of one progressively resident Region set. */
export interface TerrainProjectRegionLease {
  /** Stable Region ids in acquisition order. */
  readonly regionIds: readonly string[];
  /** Loaded Region aggregates in the same order as `regionIds`. */
  readonly assets: readonly TerrainProjectAsset[];
  /** Whether this ownership has already been released. */
  readonly released: boolean;
  /**
   * Releases this consumer's ownership. Repeated calls have no effect.
   * @returns Nothing.
   */
  release(): void;
}

/** Standard Scene Script that owns a lightweight world index and progressively loaded Regions. */
export class TerrainProjectWorldRuntime extends Script {
  private _world: TerrainProjectWorldIndex | null = null;
  private readonly _assets = new Map<string, TerrainProjectAsset>();
  private _assetRevision = 0;
  private _heightRevision = 0;
  private _cachedAssetsRevision = -1;
  private _cachedAssets: readonly TerrainProjectAsset[] = [];
  private readonly _inFlight = new Map<string, TerrainRegionLoadEntry>();
  private readonly _manualPinCounts = new Map<string, number>();
  private readonly _leaseCounts = new Map<string, number>();
  private _ownershipGeneration = 0;
  private _rendererConfig: TerrainProjectRendererConfig = {
    surfaceLodCrossFadeDurationSeconds: 0
  };
  private _loadingConfig: TerrainProjectLoadingConfig = { ...DEFAULT_TERRAIN_PROJECT_LOADING_CONFIG };
  private _loadAllPrototypeResources = false;

  /**
   * Initializes the runtime from the sole Terrain resource strongly referenced by the Scene.
   * @param worldIndexAsset Canonical world index loaded by the stock JSON loader.
   * @param rendererConfig Renderer-owned options that are not authoring data.
   * @param loadingConfig Scene-owned concurrency limits for progressive loading.
   * @returns Nothing.
   * @throws If the world index or renderer configuration is invalid.
   */
  initialize(
    worldIndexAsset: JSONAsset,
    rendererConfig?: Partial<TerrainProjectRendererConfig>,
    loadingConfig?: Partial<TerrainProjectLoadingConfig>
  ): void {
    if (!(worldIndexAsset instanceof JSONAsset)) {
      throw new Error("TerrainProjectWorldRuntime requires a standard JSON world index");
    }
    const world = worldIndexAsset.data as TerrainProjectWorldIndex;
    validateTerrainProjectWorldIndex(world);
    const duration = rendererConfig?.surfaceLodCrossFadeDurationSeconds ?? 0;
    if (!Number.isFinite(duration) || duration < 0) {
      throw new Error("surfaceLodCrossFadeDurationSeconds must be finite and non-negative");
    }
    const maxConcurrentRegions =
      loadingConfig?.maxConcurrentRegions ?? DEFAULT_TERRAIN_PROJECT_LOADING_CONFIG.maxConcurrentRegions;
    const maxConcurrentResourcesPerRegion =
      loadingConfig?.maxConcurrentResourcesPerRegion ??
      DEFAULT_TERRAIN_PROJECT_LOADING_CONFIG.maxConcurrentResourcesPerRegion;
    const loadAllPrototypeResources = loadingConfig?.loadAllPrototypeResources ?? false;
    requirePositiveInteger(maxConcurrentRegions, "maxConcurrentRegions");
    requirePositiveInteger(maxConcurrentResourcesPerRegion, "maxConcurrentResourcesPerRegion");
    if (typeof loadAllPrototypeResources !== "boolean") {
      throw new Error("loadAllPrototypeResources must be boolean");
    }
    this._cancelAndRelease();
    this._world = world;
    this._rendererConfig = {
      surfaceLodCrossFadeDurationSeconds: duration
    };
    this._loadingConfig = {
      maxConcurrentRegions,
      maxConcurrentResourcesPerRegion
    };
    this._loadAllPrototypeResources = loadAllPrototypeResources;
  }

  /**
   * Loads one Region through Project resource loaders, restoring configured Brotli Buffer replacements before assembly.
   * @param id Stable Region id from the world index.
   * @returns Cancellable loading task with standard resource progress.
   * @throws If the id is unknown or any canonical resource is invalid.
   */
  loadRegion(id: string): AssetPromise<TerrainProjectAsset> {
    let load: AssetPromise<TerrainProjectAsset>;
    try {
      load = this._loadRegionShared(id);
    } catch (error) {
      return rejectedAssetPromise(error instanceof Error ? error : new Error(String(error)));
    }
    const generation = this._ownershipGeneration;
    this._incrementOwner(this._manualPinCounts, id);
    return new AssetPromise((resolve, reject, setComplete, setDetail, onCancel) => {
      let active = true;
      const abandon = (): void => {
        if (!active) return;
        active = false;
        if (generation !== this._ownershipGeneration) return;
        this._decrementOwner(this._manualPinCounts, id);
        this._releaseIfUnowned(id);
      };
      onCancel!(() => {
        if (!active) return;
        abandon();
        load.cancel();
      });
      load.onProgress(setComplete!, setDetail!);
      load.then(
        (asset) => {
          if (!active) return;
          active = false;
          if (generation !== this._ownershipGeneration) {
            reject!(new Error("Terrain Region ownership was invalidated during loading"));
            return;
          }
          resolve(asset);
        },
        (error) => {
          if (!active) return;
          abandon();
          reject!(error);
        }
      );
    });
  }

  /**
   * Loads and owns an arbitrary Region set until the returned lease is released.
   * @param ids Stable unique Region ids.
   * @returns Cancellable task resolving to one explicit ownership handle.
   * @throws If an id is unknown or any canonical resource is invalid.
   */
  acquireRegions(ids: readonly string[]): AssetPromise<TerrainProjectRegionLease> {
    let regionIds: string[];
    try {
      regionIds = validateRequestedRegionIds(ids);
    } catch (error) {
      return rejectedAssetPromise(error instanceof Error ? error : new Error(String(error)));
    }
    let load: AssetPromise<readonly TerrainProjectAsset[]>;
    try {
      load = this._loadRegionsShared(regionIds);
    } catch (error) {
      return rejectedAssetPromise(error instanceof Error ? error : new Error(String(error)));
    }
    const generation = this._ownershipGeneration;
    for (const id of regionIds) this._incrementOwner(this._leaseCounts, id);
    return new AssetPromise((resolve, reject, setComplete, setDetail, onCancel) => {
      let active = true;
      const abandon = (): void => {
        if (!active) return;
        active = false;
        this._releaseLeaseIds(regionIds, generation);
      };
      onCancel!(() => {
        if (!active) return;
        abandon();
        load.cancel();
      });
      load.onProgress(setComplete!, setDetail!);
      load.then(
        (assets) => {
          if (!active) return;
          active = false;
          if (generation !== this._ownershipGeneration) {
            reject!(new Error("Terrain Region ownership was invalidated during loading"));
            return;
          }
          resolve(this._createRegionLease(regionIds, assets, generation));
        },
        (error) => {
          if (!active) return;
          abandon();
          reject!(error);
        }
      );
    });
  }

  /**
   * Owns an already-loaded Region set without starting resource work.
   * @param ids Stable unique loaded Region ids.
   * @returns Explicit ownership handle.
   * @throws If an id is duplicated or not loaded.
   */
  retainLoadedRegions(ids: readonly string[]): TerrainProjectRegionLease {
    const regionIds = validateRequestedRegionIds(ids);
    const assets = regionIds.map((id) => {
      const asset = this._assets.get(id);
      if (!asset) throw new Error(`Terrain Region "${id}" is not loaded`);
      return asset;
    });
    for (const id of regionIds) this._incrementOwner(this._leaseCounts, id);
    return this._createRegionLease(regionIds, assets, this._ownershipGeneration);
  }

  private _loadRegionShared(id: string): AssetPromise<TerrainProjectAsset> {
    const loaded = this._assets.get(id);
    if (loaded) return AssetPromise.resolve(loaded);
    const pending = this._inFlight.get(id);
    if (pending) return this._subscribeRegionLoad(id, pending);
    const world = this._requireWorld();
    const descriptor = world.regions.find((region) => region.id === id);
    if (!descriptor) {
      return rejectedAssetPromise(new Error(`Terrain Region "${id}" is absent from the world index`));
    }
    const resourceTask = this._loadRegionResources(descriptor);
    const task = new AssetPromise<TerrainProjectAsset>((resolve, reject, setComplete, setDetail, onCancel) => {
      let active = true;
      const fail = (error: unknown): void => {
        if (active) reject!(error);
      };
      onCancel!(() => {
        active = false;
        resourceTask.cancel();
      });
      resourceTask.onProgress(setComplete!, setDetail!);
      resourceTask.then((asset) => {
        if (!active) return;
        try {
          if (this.destroyed) throw new Error("TerrainProjectWorldRuntime was destroyed during Region loading");
          const documents = [...this._assets.values()].map((entry) => entry.document);
          validateTerrainProjectRuntimeLoadedSet(world, [...documents, asset.document]);
          this._retainAsset(asset);
          this._assets.set(id, asset);
          this._markAssetsChanged(true);
          resolve(asset);
        } catch (error) {
          fail(error);
        }
      }, fail);
    });
    const entry: TerrainRegionLoadEntry = { task, subscribers: 0 };
    this._inFlight.set(id, entry);
    task.then(
      () => {
        if (this._inFlight.get(id) === entry) this._inFlight.delete(id);
      },
      () => {
        if (this._inFlight.get(id) === entry) this._inFlight.delete(id);
      }
    );
    return this._subscribeRegionLoad(id, entry);
  }

  /**
   * Loads multiple Regions with per-Region detail progress and aggregate completion.
   * @param ids Stable Region ids.
   * @returns Cancellable aggregate task preserving caller order. Successful Region loads remain committed if a sibling fails.
   */
  loadRegions(ids: readonly string[]): AssetPromise<readonly TerrainProjectAsset[]> {
    let regionIds: string[];
    try {
      regionIds = validateRequestedRegionIds(ids);
    } catch (error) {
      return rejectedAssetPromise(error instanceof Error ? error : new Error(String(error)));
    }
    return this._loadRegionSet(regionIds, (id) => this.loadRegion(id));
  }

  private _loadRegionsShared(ids: readonly string[]): AssetPromise<readonly TerrainProjectAsset[]> {
    return this._loadRegionSet(ids, (id) => this._loadRegionShared(id));
  }

  private _loadRegionSet(
    ids: readonly string[],
    loadOne: (id: string) => AssetPromise<TerrainProjectAsset>
  ): AssetPromise<readonly TerrainProjectAsset[]> {
    return new AssetPromise((resolve, reject, setComplete, setDetail, onCancel) => {
      const activeTasks = new Set<AssetPromise<TerrainProjectAsset>>();
      const results = new Array<TerrainProjectAsset>(ids.length);
      let nextIndex = 0;
      let completed = 0;
      let settled = false;
      let canceled = false;
      const cancelActive = (): void => activeTasks.forEach((task) => task.cancel());
      const fail = (error: unknown): void => {
        if (settled || canceled) return;
        settled = true;
        cancelActive();
        reject!(error);
      };
      onCancel!(() => {
        if (settled || canceled) return;
        canceled = true;
        cancelActive();
      });
      if (!ids.length) {
        setComplete!(0, 0);
        resolve([]);
        return;
      }
      setComplete!(0, ids.length);
      const launch = (): void => {
        while (
          !settled &&
          !canceled &&
          activeTasks.size < this._loadingConfig.maxConcurrentRegions &&
          nextIndex < ids.length
        ) {
          const index = nextIndex++;
          let task: AssetPromise<TerrainProjectAsset>;
          try {
            task = loadOne(ids[index]);
          } catch (error) {
            fail(error);
            return;
          }
          activeTasks.add(task);
          task.onProgress(
            (loaded, total) => setDetail!(ids[index], loaded, total),
            (resource, loaded, total) => setDetail!(`${ids[index]}:${resource}`, loaded, total)
          );
          task.then((asset) => {
            if (settled || canceled) return;
            activeTasks.delete(task);
            results[index] = asset;
            completed++;
            setComplete!(completed, ids.length);
            if (completed === ids.length) {
              settled = true;
              resolve(results);
            } else {
              launch();
            }
          }, fail);
        }
      };
      launch();
    });
  }

  /**
   * Releases the Scene owner's reference to one progressively loaded Region.
   * @param id Stable Region id.
   * @returns Whether a loaded Region was released.
   */
  unloadRegion(id: string): boolean {
    if (!this._manualPinCounts.has(id)) return false;
    this._decrementOwner(this._manualPinCounts, id);
    this._releaseIfUnowned(id);
    return true;
  }

  /**
   * Returns loaded assets in deterministic world-index order.
   * @returns Read-only Region assets for renderer adapters.
   */
  getAssets(): readonly TerrainProjectAsset[] {
    const revision = this._assetRevision ?? 0;
    if (this._cachedAssetsRevision === revision && this._cachedAssets) return this._cachedAssets;
    const world = this._requireWorld();
    const assets: TerrainProjectAsset[] = [];
    for (const descriptor of world.regions) {
      const asset = this._assets.get(descriptor.id);
      if (asset) assets.push(asset);
    }
    this._cachedAssets = assets;
    this._cachedAssetsRevision = revision;
    return assets;
  }

  /** Monotonic loaded-asset invalidation token for allocation-sensitive consumers. */
  getAssetRevision(): number {
    return this._assetRevision ?? 0;
  }

  /** Monotonic height-residency token; unrelated material changes do not invalidate height consumers. */
  getHeightRevision(): number {
    return this._heightRevision ?? 0;
  }

  /**
   * Returns every Region id in deterministic world-index order.
   * @returns Detached Region ids suitable for an explicit residency request.
   * @throws If the runtime has not been initialized from a Project world index.
   */
  getAvailableRegionIds(): readonly string[] {
    return this._requireWorld().regions.map((descriptor) => descriptor.id);
  }

  /**
   * Replaces one loaded Region's decoded canonical document while retaining its standard loaded resources.
   * @param document Complete canonical document with the same stable Region identity.
   * @returns The replacement Region asset now exposed to renderer adapters.
   * @throws If the Region is not loaded or the replacement breaks the currently loaded world set.
   */
  replaceLoadedRegionDocument(document: TerrainProjectDocument): TerrainProjectAsset {
    return this.replaceLoadedRegionDocuments([document])[0];
  }

  /**
   * Replaces several loaded canonical documents atomically while retaining their standard loaded resources.
   * @param documents Complete documents with unique stable Region identities.
   * @returns Replacement assets in input order after one loaded-set validation.
   * @throws If an id is duplicated, a Region is not loaded, or the replacement set is invalid.
   */
  replaceLoadedRegionDocuments(documents: readonly TerrainProjectDocument[]): readonly TerrainProjectAsset[] {
    return this._replaceLoadedRegionDocuments(documents, false);
  }

  /**
   * Replaces render-only Region documents without loading or retaining authoring density payloads.
   * @param documents Complete runtime documents with unique stable Region identities.
   * @returns Replacement assets in input order after one runtime loaded-set validation.
   * @throws If an id is duplicated, a Region is not loaded, or the replacement set is invalid.
   */
  replaceLoadedRuntimeRegionDocuments(documents: readonly TerrainProjectDocument[]): readonly TerrainProjectAsset[] {
    return this._replaceLoadedRegionDocuments(documents, true);
  }

  private _replaceLoadedRegionDocuments(
    documents: readonly TerrainProjectDocument[],
    runtimeOnly: boolean
  ): readonly TerrainProjectAsset[] {
    const currentAssets = this.getAssets();
    const validate = runtimeOnly
      ? validateTerrainProjectRuntimeLoadedReplacements
      : validateTerrainProjectLoadedReplacements;
    validate(
      this._requireWorld(),
      currentAssets.map((asset) => asset.document),
      documents
    );
    const resourceCatalog = createLoadedRegionResourceCatalog(currentAssets);
    const replacements = new Map<string, TerrainProjectAsset>();
    for (const document of documents) {
      const id = document.descriptor.id;
      if (replacements.has(id)) throw new Error(`Terrain Region replacement contains duplicate id "${id}"`);
      const current = this._assets.get(id);
      if (!current) throw new Error(`Terrain Region "${id}" is not loaded`);
      replacements.set(id, rebindLoadedRegionResources(document, current, resourceCatalog));
    }
    let heightChanged = false;
    for (const [id, replacement] of replacements) {
      const current = this._assets.get(id)!;
      heightChanged ||= !hasSameHeightSource(current.document, replacement.document);
      this._assets.set(id, replacement);
    }
    this._markAssetsChanged(heightChanged);
    return documents.map((document) => replacements.get(document.descriptor.id)!);
  }

  /**
   * Adapts an explicit active subset without coupling renderer residency to every loaded Region.
   * @param activeRegionIds Loaded stable ids selected by the renderer's residency policy.
   * @returns Pure-data Clipmap descriptor, or `null` for an empty active set.
   * @throws If an id is duplicated, not loaded, or the selected subset exceeds the Clipmap sampling capability.
   */
  createClipmapDescriptor(activeRegionIds: readonly string[]): TerrainProjectClipmapDescriptor | null {
    if (new Set(activeRegionIds).size !== activeRegionIds.length) {
      throw new Error("Geometry Clipmap active Region selection contains duplicate ids");
    }
    if (!activeRegionIds.length) return null;
    const world = this._requireWorld();
    const documents = activeRegionIds.map((id) => {
      const asset = this._assets.get(id);
      if (!asset) throw new Error(`Geometry Clipmap active Region "${id}" is not loaded`);
      return asset.document;
    });
    return createTerrainProjectRuntimeClipmapDescriptor(world, documents);
  }

  /**
   * Returns a detached renderer configuration snapshot.
   * @returns Renderer-owned configuration.
   */
  getRendererConfig(): TerrainProjectRendererConfig {
    return { ...this._rendererConfig };
  }

  /**
   * Returns a detached progressive-loading configuration snapshot.
   * @returns Scene-owned Region and resource concurrency limits.
   */
  getLoadingConfig(): TerrainProjectLoadingConfig {
    return { ...this._loadingConfig };
  }

  /**
   * Returns a detached terrain runtime diagnostics snapshot.
   * @returns Counts for the currently loaded Region subset.
   */
  getDiagnostics(): TerrainProjectRuntimeDiagnostics {
    return createDiagnostics(this._world, this.getAssets(), this._rendererConfig, this._loadingConfig);
  }

  /**
   * Cancels pending loads and releases all Scene-owned Region aggregates.
   * @returns Nothing.
   */
  override onDestroy(): void {
    this._cancelAndRelease();
    this._world = null;
  }

  private _loadRegionResources(descriptor: TerrainProjectWorldRegion): AssetPromise<TerrainProjectAsset> {
    return new AssetPromise((resolve, reject, setComplete, setDetail, onCancel) => {
      const active = new Set<AssetPromise<unknown>>();
      let completed = 0;
      let total = 1;
      let canceled = false;
      let settled = false;
      const fail = (error: unknown): void => {
        if (canceled || settled) return;
        settled = true;
        active.forEach((task) => task.cancel());
        reject!(error);
      };
      onCancel!(() => {
        if (canceled || settled) return;
        canceled = true;
        active.forEach((task) => task.cancel());
      });
      const track = <T extends EngineObject>(
        request: { ref: TerrainProjectRef; type: string; role?: RegionResourceRole },
        publishCompletion = true
      ): AssetPromise<T> => {
        const { ref, type, role } = request;
        const task = this.engine.resourceManager.load<T>({
          type,
          url: resolveTerrainProjectResourceUrl(ref),
          // Keep PNG requests parameterless so ResourceManager applies the Project-declared
          // color-space and sampler metadata; only KTX2 needs the array target override.
          ...(type === AssetType.KTX2 && role && isTerrainLayerTextureRole(role)
            ? { params: { priorityFormats: [KTX2TargetFormat.R8G8B8A8] } }
            : {})
        });
        active.add(task);
        task.onProgress(
          (loaded, count) => setDetail!(ref.url, loaded, count),
          (resource, loaded, count) => setDetail!(resource, loaded, count)
        );
        task.then(() => {
          active.delete(task);
          completed++;
          if (publishCompletion) setComplete!(completed, total);
        }, fail);
        return task;
      };

      const manifestTask = track<JSONAsset>({ ref: descriptor.manifest, type: AssetType.JSON }, false);
      manifestTask
        .then(async (manifestAsset) => {
          if (canceled) return;
          if (!(manifestAsset instanceof JSONAsset)) {
            throw new Error(`Region "${descriptor.id}" manifest did not resolve through the stock JSON loader`);
          }
          const manifest = manifestAsset.data as TerrainProjectRegion;
          const refs = collectRegionRefs(manifest, this._loadAllPrototypeResources);
          total += refs.length;
          setComplete!(completed, total);
          const resources = new Array<EngineObject>(refs.length);
          let nextIndex = 0;
          let resolvedCount = 0;
          let runningCount = 0;
          const finish = async (): Promise<void> => {
            const bundle = createRegionResourceBundle(descriptor, manifestAsset, manifest, refs, resources);
            const asset = resolveTerrainProjectRegion(bundle);
            if (canceled || settled) return;
            settled = true;
            resolve(asset);
          };
          const launch = (): void => {
            while (
              !canceled &&
              !settled &&
              runningCount < this._loadingConfig.maxConcurrentResourcesPerRegion &&
              nextIndex < refs.length
            ) {
              const index = nextIndex++;
              const task = track(refs[index]);
              runningCount++;
              task.then((resource) => {
                if (canceled || settled) return;
                resources[index] = resource;
                runningCount--;
                resolvedCount++;
                if (resolvedCount === refs.length) void finish().catch(fail);
                else launch();
              }, fail);
            }
          };
          if (refs.length) launch();
          else void finish().catch(fail);
        }, fail)
        .catch(fail);
    });
  }

  private _requireWorld(): TerrainProjectWorldIndex {
    if (!this._world) throw new Error("TerrainProjectWorldRuntime is not initialized");
    return this._world;
  }

  private _cancelAndRelease(): void {
    this._ownershipGeneration++;
    for (const entry of this._inFlight.values()) entry.task.cancel();
    this._inFlight.clear();
    this._manualPinCounts.clear();
    this._leaseCounts.clear();
    const hadAssets = this._assets.size > 0;
    for (const asset of this._assets.values()) this._releaseAsset(asset);
    this._assets.clear();
    if (hadAssets) this._markAssetsChanged(true);
  }

  private _createRegionLease(
    regionIds: readonly string[],
    assets: readonly TerrainProjectAsset[],
    generation: number
  ): TerrainProjectRegionLease {
    return new TerrainProjectRegionLeaseHandle(regionIds, assets, () => this._releaseLeaseIds(regionIds, generation));
  }

  private _releaseLeaseIds(regionIds: readonly string[], generation: number): void {
    if (generation !== this._ownershipGeneration) return;
    for (const id of regionIds) {
      this._decrementOwner(this._leaseCounts, id);
      this._releaseIfUnowned(id);
    }
  }

  private _releaseIfUnowned(id: string): void {
    if (this._manualPinCounts.has(id) || this._leaseCounts.has(id)) return;
    const asset = this._assets.get(id);
    if (!asset) return;
    this._assets.delete(id);
    this._markAssetsChanged(true);
    this._releaseAsset(asset);
  }

  private _markAssetsChanged(heightChanged: boolean): void {
    this._assetRevision = (this._assetRevision ?? 0) + 1;
    if (heightChanged) this._heightRevision = (this._heightRevision ?? 0) + 1;
  }

  private _incrementOwner(owners: Map<string, number>, id: string): void {
    owners.set(id, (owners.get(id) ?? 0) + 1);
  }

  private _decrementOwner(owners: Map<string, number>, id: string): void {
    const count = owners.get(id);
    if (count === undefined) throw new Error(`Terrain Region "${id}" ownership is already released`);
    if (count === 1) owners.delete(id);
    else owners.set(id, count - 1);
  }

  private _retainAsset(asset: TerrainProjectAsset): void {
    for (const dependency of asset.dependencies) this._addResourceReferCount(dependency, 1);
  }

  private _releaseAsset(asset: TerrainProjectAsset): void {
    for (const dependency of asset.dependencies) this._addResourceReferCount(dependency, -1);
  }

  private _subscribeRegionLoad(id: string, entry: TerrainRegionLoadEntry): AssetPromise<TerrainProjectAsset> {
    entry.subscribers++;
    return new AssetPromise((resolve, reject, setComplete, setDetail, onCancel) => {
      const fail = reject!;
      let active = true;
      const release = (cancelUnderlying: boolean): void => {
        if (!active) return;
        active = false;
        entry.subscribers--;
        if (cancelUnderlying && entry.subscribers === 0 && this._inFlight.get(id) === entry) {
          this._inFlight.delete(id);
          entry.task.cancel();
        }
      };
      onCancel!(() => release(true));
      entry.task.onProgress(setComplete!, setDetail!);
      entry.task.then(
        (asset) => {
          if (!active) return;
          release(false);
          resolve(asset);
        },
        (error) => {
          if (!active) return;
          release(false);
          fail(error);
        }
      );
    });
  }
}

interface LoadedResourceEntry<T> {
  readonly value: T;
  readonly dependencies: readonly ReferResource[];
}

interface LoadedPrefabResourceEntry {
  readonly prefab: PrefabResource;
  readonly geometry: TerrainProjectResolvedGeometry | null;
  readonly dependencies: readonly ReferResource[];
}

interface LoadedRegionResourceCatalog {
  readonly materials: ReadonlyMap<string, LoadedResourceEntry<Material>>;
  readonly layers: ReadonlyMap<string, LoadedResourceEntry<TerrainProjectLayerResources>>;
  readonly surfacePrefabs: ReadonlyMap<string, LoadedPrefabResourceEntry>;
  readonly placedPrefabs: ReadonlyMap<string, LoadedPrefabResourceEntry>;
}

function createLoadedRegionResourceCatalog(assets: readonly TerrainProjectAsset[]): LoadedRegionResourceCatalog {
  const materials = new Map<string, LoadedResourceEntry<Material>>();
  const layers = new Map<string, LoadedResourceEntry<TerrainProjectLayerResources>>();
  const surfacePrefabs = new Map<string, LoadedPrefabResourceEntry>();
  const placedPrefabs = new Map<string, LoadedPrefabResourceEntry>();
  for (const asset of assets) {
    const manifest = asset.document.manifest;
    setLoadedResource(materials, terrainRefKey(manifest.material), {
      value: asset.terrainMaterial,
      dependencies: [asset.terrainMaterial]
    });
    for (const layer of manifest.layers) {
      const resources = asset.layerTextures.get(layer.id);
      if (!resources) continue;
      setLoadedResource(layers, terrainLayerResourceKey(layer), {
        value: resources,
        dependencies: [resources.diffuse, resources.normal, ...(resources.mask ? [resources.mask] : [])]
      });
    }
    for (const prototype of [
      ...manifest.treePrototypes,
      ...manifest.detailPrototypes.filter((entry) => entry.prefab)
    ]) {
      const prefabRef = "prefab" in prototype ? prototype.prefab : undefined;
      if (!prefabRef) continue;
      const prefab = asset.prototypePrefabs.get(prototype.id);
      if (!prefab) continue;
      const geometry = asset.prototypeGeometries.get(prototype.id) ?? null;
      setLoadedPrefab(surfacePrefabs, terrainRefKey(prefabRef), prefab, geometry);
    }
    for (const prototype of manifest.placedPrefabPrototypes ?? []) {
      const prefab = asset.placedPrefabs.get(prototype.id);
      if (!prefab) continue;
      const geometry = asset.placedPrefabGeometries.get(prototype.id) ?? null;
      setLoadedPrefab(placedPrefabs, terrainRefKey(prototype.prefab), prefab, geometry);
    }
  }
  return { materials, layers, surfacePrefabs, placedPrefabs };
}

function rebindLoadedRegionResources(
  document: TerrainProjectDocument,
  current: TerrainProjectAsset,
  catalog: LoadedRegionResourceCatalog
): TerrainProjectAsset {
  const material = requireLoadedResource(
    catalog.materials,
    terrainRefKey(document.manifest.material),
    `Terrain Region "${document.descriptor.id}" Material`
  );
  const dependencies = new Set<ReferResource>(current.dependencies);
  addDependencies(dependencies, material.dependencies);

  const layerTextures = new Map<string, TerrainProjectLayerResources>();
  for (const layer of document.manifest.layers) {
    const resources = requireLoadedResource(
      catalog.layers,
      terrainLayerResourceKey(layer),
      `Terrain Region "${document.descriptor.id}" layer "${layer.id}"`
    );
    layerTextures.set(layer.id, { ...resources.value, id: layer.id });
    addDependencies(dependencies, resources.dependencies);
  }

  const renderableRefs = collectTerrainProjectRenderableRefs(document.manifest);
  const prototypePrefabs = new Map<string, PrefabResource>();
  const prototypeGeometries = new Map<string, TerrainProjectResolvedGeometry>();
  for (const prototype of [
    ...document.manifest.treePrototypes,
    ...document.manifest.detailPrototypes.filter((entry) => entry.prefab)
  ]) {
    const prefabRef = "prefab" in prototype ? prototype.prefab : undefined;
    if (!prefabRef) continue;
    const entry = catalog.surfacePrefabs.get(terrainRefKey(prefabRef));
    if (!entry) {
      if (renderableRefs.prefabPrototypeIds.has(prototype.id)) {
        throw new Error(
          `Terrain Region "${document.descriptor.id}" prototype "${prototype.id}" has no loaded Prefab resource`
        );
      }
      continue;
    }
    prototypePrefabs.set(prototype.id, entry.prefab);
    if (entry.geometry) prototypeGeometries.set(prototype.id, entry.geometry);
    addDependencies(dependencies, entry.dependencies);
  }

  const placedPrefabs = new Map<string, PrefabResource>();
  const placedPrefabGeometries = new Map<string, TerrainProjectResolvedGeometry>();
  for (const prototype of document.manifest.placedPrefabPrototypes ?? []) {
    const entry = catalog.placedPrefabs.get(terrainRefKey(prototype.prefab));
    if (!entry) {
      if (renderableRefs.placedPrefabPrototypeIds.has(prototype.id)) {
        throw new Error(
          `Terrain Region "${document.descriptor.id}" placed prototype "${prototype.id}" has no loaded Prefab resource`
        );
      }
      continue;
    }
    placedPrefabs.set(prototype.id, entry.prefab);
    if (entry.geometry) placedPrefabGeometries.set(prototype.id, entry.geometry);
    addDependencies(dependencies, entry.dependencies);
  }

  return new TerrainProjectAsset(
    document,
    material.value,
    layerTextures,
    prototypePrefabs,
    prototypeGeometries,
    placedPrefabs,
    placedPrefabGeometries,
    [...dependencies]
  );
}

function setLoadedResource<T>(
  resources: Map<string, LoadedResourceEntry<T>>,
  key: string,
  entry: LoadedResourceEntry<T>
): void {
  if (!resources.has(key)) resources.set(key, entry);
}

function setLoadedPrefab(
  resources: Map<string, LoadedPrefabResourceEntry>,
  key: string,
  prefab: PrefabResource,
  geometry: TerrainProjectResolvedGeometry | null
): void {
  if (resources.has(key)) return;
  resources.set(key, {
    prefab,
    geometry,
    dependencies: [prefab, ...(geometry ? collectGeometryDependencies(geometry) : [])]
  });
}

function requireLoadedResource<T>(
  resources: ReadonlyMap<string, LoadedResourceEntry<T>>,
  key: string,
  label: string
): LoadedResourceEntry<T> {
  const entry = resources.get(key);
  if (!entry) throw new Error(`${label} has no loaded standard Project resource`);
  return entry;
}

function collectGeometryDependencies(geometry: TerrainProjectResolvedGeometry): ReferResource[] {
  const renderers =
    geometry.kind === "lod-group" ? geometry.lodGroup.lods.flatMap((lod) => lod.renderers) : geometry.renderers;
  return renderers.flatMap((renderer) => [renderer.mesh, renderer.material]);
}

function addDependencies(target: Set<ReferResource>, dependencies: readonly ReferResource[]): void {
  for (const dependency of dependencies) target.add(dependency);
}

function terrainLayerResourceKey(layer: TerrainProjectRegion["layers"][number]): string {
  return JSON.stringify([
    terrainRefKey(layer.diffuse),
    terrainRefKey(layer.normal),
    layer.mask ? terrainRefKey(layer.mask) : null
  ]);
}

function terrainRefKey(ref: TerrainProjectRef): string {
  return JSON.stringify([ref.url, ref.key ?? null]);
}

interface TerrainRegionLoadEntry {
  readonly task: AssetPromise<TerrainProjectAsset>;
  subscribers: number;
}

class TerrainProjectRegionLeaseHandle implements TerrainProjectRegionLease {
  readonly regionIds: readonly string[];
  readonly assets: readonly TerrainProjectAsset[];
  private _released = false;

  constructor(
    regionIds: readonly string[],
    assets: readonly TerrainProjectAsset[],
    private readonly _release: () => void
  ) {
    this.regionIds = [...regionIds];
    this.assets = [...assets];
  }

  get released(): boolean {
    return this._released;
  }

  release(): void {
    if (this._released) return;
    this._released = true;
    this._release();
  }
}

type RegionResourceRole =
  | "heightmap"
  | "holes"
  | "alphamap"
  | "detail-transforms"
  | "material"
  | "layer-diffuse"
  | "layer-normal"
  | "layer-mask"
  | "detail-texture"
  | "prototype"
  | "placed-prefab";

function isTerrainLayerTextureRole(role: RegionResourceRole): boolean {
  return role === "layer-diffuse" || role === "layer-normal" || role === "layer-mask";
}

interface RegionResourceRequest {
  role: RegionResourceRole;
  ref: TerrainProjectRef;
  type: TerrainProjectRegionDependencyType;
  id?: string;
}

function textureAssetType(ref: TerrainProjectRef): AssetType.Texture | AssetType.KTX2 {
  return /\.ktx2(?:$|[?#])/i.test(ref.url) ? AssetType.KTX2 : AssetType.Texture;
}

function collectRegionRefs(
  manifest: TerrainProjectRegion,
  loadAllPrototypeResources: boolean
): RegionResourceRequest[] {
  const activeRefs = collectTerrainProjectRenderableRefs(manifest);
  const renderableRefs = {
    prefabPrototypeIds: new Set(activeRefs.prefabPrototypeIds),
    placedPrefabPrototypeIds: new Set(activeRefs.placedPrefabPrototypeIds),
    textureDetailPrototypeIds: new Set(activeRefs.textureDetailPrototypeIds)
  };
  if (loadAllPrototypeResources) {
    for (const prototype of manifest.treePrototypes) renderableRefs.prefabPrototypeIds.add(prototype.id);
    for (const prototype of manifest.detailPrototypes) {
      if (prototype.prefab) renderableRefs.prefabPrototypeIds.add(prototype.id);
      if (prototype.texture) renderableRefs.textureDetailPrototypeIds.add(prototype.id);
    }
  }
  return [
    { role: "heightmap", ref: manifest.heightmap.data, type: AssetType.Buffer },
    ...(manifest.holes ? [{ role: "holes" as const, ref: manifest.holes.data, type: AssetType.Buffer as const }] : []),
    ...manifest.alphamaps.map((alphamap) => ({
      role: "alphamap" as const,
      ref: alphamap.data,
      type: AssetType.Buffer as const
    })),
    ...manifest.detailPrototypes.flatMap((prototype) =>
      prototype.exactTransforms
        ? [
            {
              role: "detail-transforms" as const,
              ref: prototype.exactTransforms.data,
              type: AssetType.Buffer as const,
              id: prototype.id
            }
          ]
        : []
    ),
    { role: "material", ref: manifest.material, type: AssetType.Material },
    ...manifest.layers.flatMap((layer) => [
      { role: "layer-diffuse" as const, ref: layer.diffuse, type: textureAssetType(layer.diffuse), id: layer.id },
      { role: "layer-normal" as const, ref: layer.normal, type: textureAssetType(layer.normal), id: layer.id },
      ...(layer.mask
        ? [{ role: "layer-mask" as const, ref: layer.mask, type: textureAssetType(layer.mask), id: layer.id }]
        : [])
    ]),
    ...manifest.detailPrototypes.flatMap((prototype) =>
      prototype.texture && renderableRefs.textureDetailPrototypeIds.has(prototype.id)
        ? [
            {
              role: "detail-texture" as const,
              ref: prototype.texture,
              type: textureAssetType(prototype.texture),
              id: prototype.id
            }
          ]
        : []
    ),
    ...manifest.treePrototypes.flatMap((prototype) =>
      renderableRefs.prefabPrototypeIds.has(prototype.id)
        ? [
            {
              role: "prototype" as const,
              ref: prototype.prefab,
              type: AssetType.Prefab as const,
              id: prototype.id
            }
          ]
        : []
    ),
    ...manifest.detailPrototypes.flatMap((prototype) =>
      prototype.prefab && renderableRefs.prefabPrototypeIds.has(prototype.id)
        ? [
            {
              role: "prototype" as const,
              ref: prototype.prefab,
              type: AssetType.Prefab as const,
              id: prototype.id
            }
          ]
        : []
    ),
    ...(manifest.placedPrefabPrototypes ?? []).flatMap((prototype) =>
      renderableRefs.placedPrefabPrototypeIds.has(prototype.id)
        ? [
            {
              role: "placed-prefab" as const,
              ref: prototype.prefab,
              type: AssetType.Prefab as const,
              id: prototype.id
            }
          ]
        : []
    )
  ];
}

function resolveTerrainProjectResourceUrl(ref: TerrainProjectRef): string {
  if (!ref.key) return ref.url;
  const separator = ref.url.includes("?") ? "&" : "?";
  return `${ref.url}${separator}q=${encodeURIComponent(ref.key)}`;
}

function createRegionResourceBundle(
  descriptor: TerrainProjectWorldRegion,
  manifestAsset: JSONAsset,
  manifest: TerrainProjectRegion,
  requests: readonly RegionResourceRequest[],
  resources: readonly EngineObject[]
): TerrainProjectRegionResources {
  const entries = requests.map((request, index) => ({ ...request, resource: resources[index] }));
  const one = <T extends EngineObject>(role: RegionResourceRole): T => {
    const matches = entries.filter((entry) => entry.role === role);
    if (matches.length !== 1) throw new Error(`Region "${descriptor.id}" requires one ${role} resource`);
    return matches[0].resource as T;
  };
  const many = (role: RegionResourceRole) => entries.filter((entry) => entry.role === role);
  return {
    descriptor,
    manifest: manifestAsset,
    heightmap: one<BufferAsset>("heightmap"),
    holes: many("holes").length ? (many("holes")[0].resource as BufferAsset) : undefined,
    alphamaps: many("alphamap").map((entry) => entry.resource as BufferAsset),
    detailTransforms: many("detail-transforms").map((entry) => ({
      prototypeId: entry.id!,
      transforms: entry.resource as BufferAsset
    })),
    detailTextures: many("detail-texture").map((entry) => ({
      prototypeId: entry.id!,
      texture: entry.resource as Texture2D
    })),
    material: one<Material>("material"),
    layers: manifest.layers.map((layer) => ({
      id: layer.id,
      diffuse: findByRoleAndId<Texture2D>(entries, "layer-diffuse", layer.id),
      normal: findByRoleAndId<Texture2D>(entries, "layer-normal", layer.id),
      mask: layer.mask ? findByRoleAndId<Texture2D>(entries, "layer-mask", layer.id) : undefined
    })),
    prototypes: many("prototype").map((entry) => ({
      prototypeId: entry.id!,
      prefab: entry.resource as PrefabResource
    })),
    placedPrefabs: many("placed-prefab").map((entry) => ({
      prototypeId: entry.id!,
      prefab: entry.resource as PrefabResource
    }))
  };
}

function findByRoleAndId<T extends ReferResource>(
  entries: readonly (RegionResourceRequest & { resource: EngineObject })[],
  role: RegionResourceRole,
  id: string
): T {
  const matches = entries.filter((entry) => entry.role === role && entry.id === id);
  if (matches.length !== 1) throw new Error(`Region resource "${role}:${id}" must resolve exactly once`);
  return matches[0].resource as T;
}

function createDiagnostics(
  world: TerrainProjectWorldIndex | null,
  assets: readonly TerrainProjectAsset[],
  rendererConfig: TerrainProjectRendererConfig,
  loadingConfig: TerrainProjectLoadingConfig
): TerrainProjectRuntimeDiagnostics {
  let treeInstances = 0;
  let declaredDetailMaps = 0;
  let nonEmptyDetailMaps = 0;
  let detailInstances = 0;
  let prototypes = 0;
  let lodLevels = 0;
  let lodRenderers = 0;
  for (const asset of assets) {
    const { manifest } = asset.document;
    treeInstances += manifest.treeInstances.length;
    declaredDetailMaps += manifest.detailPrototypes.length;
    for (const detail of manifest.detailPrototypes) {
      if (detail.density.kind === "r8-count") {
        nonEmptyDetailMaps++;
        detailInstances += detail.maximumSourceCount;
      }
    }
    prototypes += asset.prototypeGeometries.size + asset.placedPrefabs.size;
    for (const geometry of asset.prototypeGeometries.values()) {
      if (geometry.kind === "lod-group") {
        lodLevels += geometry.lodGroup.lods.length;
        lodRenderers += geometry.lodGroup.lods.reduce((sum, lod) => sum + lod.renderers.length, 0);
      } else {
        lodRenderers += geometry.renderers.length;
      }
    }
  }
  const loadedIds = new Set(assets.map((asset) => asset.document.descriptor.id));
  const loadedHeightSeams =
    world?.heightSeams.filter((seam) => loadedIds.has(seam.first.regionId) && loadedIds.has(seam.second.regionId))
      .length ?? 0;
  return {
    availableRegions: world?.regions.length ?? 0,
    loadedRegions: assets.length,
    alphamaps: assets.reduce((sum, asset) => sum + asset.document.alphamaps.length, 0),
    loadedHeightSeams,
    sourceHeightSamples: assets.reduce(
      (sum, asset) =>
        sum + asset.document.manifest.heightmap.sampleSize[0] * asset.document.manifest.heightmap.sampleSize[1],
      0
    ),
    treeInstances,
    declaredDetailMaps,
    nonEmptyDetailMaps,
    detailInstances,
    prototypes,
    lodLevels,
    lodRenderers,
    surfaceLodCrossFadeDurationSeconds: rendererConfig.surfaceLodCrossFadeDurationSeconds,
    maxConcurrentRegionLoads: loadingConfig.maxConcurrentRegions,
    maxConcurrentResourceLoadsPerRegion: loadingConfig.maxConcurrentResourcesPerRegion
  };
}

function rejectedAssetPromise<T>(error: Error): AssetPromise<T> {
  return new AssetPromise((_resolve, reject) => reject!(error));
}

function validateRequestedRegionIds(ids: readonly string[]): string[] {
  if (!Array.isArray(ids)) throw new Error("Terrain Region load request requires an id array");
  const regionIds = [...ids];
  if (regionIds.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new Error("Terrain Region load request contains an invalid id");
  }
  if (new Set(regionIds).size !== regionIds.length) {
    throw new Error("Terrain Region load request contains duplicate ids");
  }
  return regionIds;
}

function hasSameHeightSource(left: TerrainProjectDocument, right: TerrainProjectDocument): boolean {
  const leftHeight = left.manifest.heightmap;
  const rightHeight = right.manifest.heightmap;
  return (
    left.heightmap === right.heightmap &&
    tuplesEqual(left.descriptor.worldPosition, right.descriptor.worldPosition) &&
    tuplesEqual(left.descriptor.worldSize, right.descriptor.worldSize) &&
    tuplesEqual(leftHeight.sampleSize, rightHeight.sampleSize) &&
    leftHeight.minMetres === rightHeight.minMetres &&
    leftHeight.maxMetres === rightHeight.maxMetres &&
    leftHeight.sha256 === rightHeight.sha256
  );
}

function tuplesEqual(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
}
