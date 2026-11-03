import { AssetPromise, Camera, Material, Script } from "@galacean/engine";
import { TerrainClipmap } from "../clipmap/TerrainClipmap";
import type { TerrainPuddleHydrologyOptions } from "../clipmap/TerrainPuddleHydrology";
import { createTerrainProjectLayerSources } from "./TerrainProjectAdapter";
import type { TerrainProjectAsset } from "./TerrainProjectAsset";
import { TerrainProjectWorldRuntime, type TerrainProjectRegionLease } from "./TerrainProjectRuntime";

/** Standard Scene configuration for one self-starting Geometry Clipmap component. */
export interface TerrainProjectClipmapRuntimeConfig {
  /** Scene-owned world-index and progressive Region runtime. */
  worldRuntime: TerrainProjectWorldRuntime;
  /** Scene-owned camera tracked by Geometry Clipmap. */
  camera: Camera;
  /** Stable Region ids loaded and activated when the Scene first runs. */
  initialActiveRegionIds: string[];
  /** Even quad count used by each reusable Clipmap segment. */
  meshSize: number;
  /** Number of simultaneously submitted Clipmap rings. */
  meshLods: number;
  /** Optional shallow-water drainage and coverage tuning. */
  puddleHydrology?: Readonly<TerrainPuddleHydrologyOptions>;
}

/** Scene Script that loads its initial Region set and owns one updateable Geometry Clipmap. */
export class TerrainProjectClipmapRuntime extends Script {
  private _config: TerrainProjectClipmapRuntimeConfig | null = null;
  private _worldRuntime: TerrainProjectWorldRuntime | null = null;
  private _clipmap: TerrainClipmap | null = null;
  private _initialLoad: TerrainProjectClipmapStartupLoad | null = null;
  private _activeLease: TerrainProjectRegionLease | null = null;
  private _residencyRevision = 0;
  private readonly _pendingResidencyUpdates = new Set<PendingTerrainResidencyUpdate>();
  private _resolveReady!: (clipmap: TerrainClipmap | null) => void;
  private _rejectReady!: (reason: unknown) => void;
  private readonly _readyTask = new AssetPromise<TerrainClipmap | null>((resolve, reject) => {
    this._resolveReady = resolve;
    this._rejectReady = reject!;
  });

  /** @returns Current Clipmap after an authoritative residency request completes, or `null` before initialization. */
  get clipmap(): TerrainClipmap | null {
    return this._clipmap;
  }

  /**
   * Stores serialized Scene configuration without starting resource work during deserialization.
   * @param config Component references, initial active Region ids, and renderer topology settings.
   * @returns Nothing.
   */
  initialize(config: TerrainProjectClipmapRuntimeConfig): void {
    if (!config || typeof config !== "object") throw new Error("Terrain Clipmap runtime configuration is required");
    if (!(config.worldRuntime instanceof TerrainProjectWorldRuntime) || !(config.camera instanceof Camera)) {
      throw new Error("Terrain Clipmap runtime requires serialized world-runtime and camera component references");
    }
    if (!Array.isArray(config.initialActiveRegionIds)) {
      throw new Error("Terrain Clipmap runtime requires an initial active Region id array");
    }
    if (new Set(config.initialActiveRegionIds).size !== config.initialActiveRegionIds.length) {
      throw new Error("Terrain Clipmap runtime initial active Region ids must be unique");
    }
    this._config = {
      worldRuntime: config.worldRuntime,
      camera: config.camera,
      initialActiveRegionIds: [...config.initialActiveRegionIds],
      meshSize: config.meshSize,
      meshLods: config.meshLods,
      puddleHydrology: config.puddleHydrology ? { ...config.puddleHydrology } : undefined
    };
  }

  /**
   * Returns an independently cancellable observer of the first authoritative Clipmap residency outcome.
   * @returns Task resolving to the initialized Clipmap, or `null` for an empty authoritative residency.
   * @throws If Scene dependencies or the authoritative Region request cannot initialize the renderer.
   */
  waitUntilReady(): AssetPromise<TerrainClipmap | null> {
    return this._readyTask.then((clipmap) => clipmap);
  }

  /**
   * Loads a Region set and atomically makes it the active Clipmap residency, superseding unfinished earlier requests.
   * Before readiness settles, cancellation leaves it pending for a later residency request.
   * @param activeRegionIds Stable world Region ids selected by the caller's residency policy.
   * @returns Cancellable task resolving to the active Clipmap, or `null` after an empty swap.
   * @throws If loading fails or the selected set exceeds renderer capability.
   */
  loadAndSetActiveRegions(activeRegionIds: readonly string[]): AssetPromise<TerrainClipmap | null> {
    const runtime = this._requireWorldRuntime();
    const regionIds = [...activeRegionIds];
    const revision = ++this._residencyRevision;
    this._cancelInitialLoad();
    this._supersedePendingResidencyUpdates(
      new Error("Terrain Clipmap residency update was superseded by a newer request")
    );
    return new AssetPromise((resolve, reject, setComplete, setDetail, onCancel) => {
      const load = runtime.acquireRegions(regionIds);
      const update: PendingTerrainResidencyUpdate = { load, reject: reject!, active: true };
      this._pendingResidencyUpdates.add(update);
      onCancel!(() => {
        if (!this._settleResidencyUpdate(update)) return;
        load.cancel();
      });
      load.onProgress(setComplete!, setDetail!);
      load.then(
        (lease) => {
          if (!this._settleResidencyUpdate(update)) {
            lease.release();
            return;
          }
          if (this.destroyed || this.pendingDestroy) {
            lease.release();
            reject!(new Error("Terrain Clipmap runtime was destroyed during a residency update"));
            return;
          }
          if (revision !== this._residencyRevision) {
            lease.release();
            reject!(new Error("Terrain Clipmap residency update was superseded by a newer request"));
            return;
          }
          try {
            const clipmap = this._applyActiveRegions(runtime, regionIds);
            this._replaceActiveLease(lease);
            resolve(clipmap);
            this._resolveReady(clipmap);
          } catch (error) {
            lease.release();
            reject!(error);
            if (revision === this._residencyRevision) this._rejectReady(error);
          }
        },
        (error) => {
          if (!this._settleResidencyUpdate(update)) return;
          reject!(error);
          if (revision === this._residencyRevision) this._rejectReady(error);
        }
      );
    });
  }

  /**
   * Atomically activates an already-loaded Region set, including an empty residency, and supersedes unfinished requests.
   * @param activeRegionIds Stable loaded Region ids selected by the caller's residency policy.
   * @returns Nothing after the Clipmap swaps its derived Material and atlases.
   * @throws If an id is unloaded or the selected set exceeds renderer capability.
   */
  setActiveRegions(activeRegionIds: readonly string[]): void {
    const runtime = this._requireWorldRuntime();
    ++this._residencyRevision;
    this._cancelInitialLoad();
    this._supersedePendingResidencyUpdates(
      new Error("Terrain Clipmap residency update was superseded by a synchronous request")
    );
    let lease: TerrainProjectRegionLease | null = null;
    try {
      lease = runtime.retainLoadedRegions(activeRegionIds);
      const clipmap = this._applyActiveRegions(runtime, activeRegionIds);
      this._replaceActiveLease(lease);
      this._resolveReady(clipmap);
    } catch (error) {
      lease?.release();
      this._rejectReady(error);
      throw error;
    }
  }

  override onStart(): void {
    try {
      const config = this._config;
      if (!config) throw new Error("Terrain Clipmap runtime was not initialized by its Scene");
      const { worldRuntime: runtime, camera } = config;
      if (runtime.scene !== this.scene || camera.scene !== this.scene) {
        throw new Error("Terrain Clipmap runtime dependencies must belong to the same Scene");
      }
      this._worldRuntime = runtime;
      const revision = ++this._residencyRevision;
      const load = runtime.acquireRegions(config.initialActiveRegionIds);
      const startup: TerrainProjectClipmapStartupLoad = { load, revision };
      this._initialLoad = startup;
      load.then(
        (lease) => {
          if (!this._settleInitialLoad(startup)) {
            lease.release();
            return;
          }
          if (revision !== this._residencyRevision) {
            lease.release();
            return;
          }
          try {
            if (this.destroyed || this.pendingDestroy) {
              throw new Error("Terrain Clipmap runtime was destroyed during startup");
            }
            const clipmap = this._applyActiveRegions(runtime, config.initialActiveRegionIds);
            this._replaceActiveLease(lease);
            this._resolveReady(clipmap);
          } catch (error) {
            lease.release();
            this._rejectReady(error);
          }
        },
        (error) => {
          if (!this._settleInitialLoad(startup) || revision !== this._residencyRevision) return;
          this._rejectReady(error);
        }
      );
    } catch (error) {
      this._rejectReady(error);
    }
  }

  override onDestroy(): void {
    const destroyedError = new Error("Terrain Clipmap runtime was destroyed before its work completed");
    ++this._residencyRevision;
    this._rejectReady(destroyedError);
    this._supersedePendingResidencyUpdates(destroyedError);
    this._cancelInitialLoad();
    this._clipmap?.destroy();
    this._clipmap = null;
    this._activeLease?.release();
    this._activeLease = null;
    this._worldRuntime = null;
    this._config = null;
  }

  private _supersedePendingResidencyUpdates(error: Error): void {
    for (const update of [...this._pendingResidencyUpdates]) {
      if (!this._settleResidencyUpdate(update)) continue;
      update.reject(error);
      update.load.cancel();
    }
  }

  private _applyActiveRegions(
    runtime: TerrainProjectWorldRuntime,
    activeRegionIds: readonly string[]
  ): TerrainClipmap | null {
    const descriptor = runtime.createClipmapDescriptor(activeRegionIds);
    if (!descriptor) {
      this._clipmap?.destroy();
      this._clipmap = null;
      return null;
    }
    const assets = activeTerrainAssets(runtime, activeRegionIds);
    const material = compatibleTerrainMaterial(assets);
    const layerSources = createTerrainProjectLayerSources(assets);
    const puddleHydrology = this._config?.puddleHydrology;
    if (this._clipmap) {
      this._clipmap.updateResidency(descriptor, material, layerSources, puddleHydrology);
      return this._clipmap;
    }
    const config = this._config;
    if (!config) throw new Error("Terrain Clipmap runtime was not initialized by its Scene");
    const clipmap = new TerrainClipmap(
      this.engine,
      this.entity,
      config.camera,
      descriptor,
      material,
      config.meshSize,
      config.meshLods,
      layerSources,
      puddleHydrology
    );
    this._clipmap = clipmap;
    return clipmap;
  }

  private _replaceActiveLease(lease: TerrainProjectRegionLease): void {
    const previous = this._activeLease;
    this._activeLease = lease;
    previous?.release();
  }

  private _cancelInitialLoad(): void {
    const startup = this._initialLoad;
    if (!startup) return;
    this._initialLoad = null;
    startup.load.cancel();
  }

  private _settleInitialLoad(startup: TerrainProjectClipmapStartupLoad): boolean {
    if (this._initialLoad !== startup) return false;
    this._initialLoad = null;
    return true;
  }

  private _settleResidencyUpdate(update: PendingTerrainResidencyUpdate): boolean {
    if (!update.active) return false;
    update.active = false;
    this._pendingResidencyUpdates.delete(update);
    return true;
  }

  private _requireWorldRuntime(): TerrainProjectWorldRuntime {
    if (!this._worldRuntime) throw new Error("Terrain Clipmap runtime has not started");
    return this._worldRuntime;
  }
}

interface TerrainProjectClipmapStartupLoad {
  readonly load: AssetPromise<TerrainProjectRegionLease>;
  readonly revision: number;
}

interface PendingTerrainResidencyUpdate {
  readonly load: AssetPromise<TerrainProjectRegionLease>;
  readonly reject: (reason: unknown) => void;
  active: boolean;
}

function activeTerrainAssets(
  runtime: TerrainProjectWorldRuntime,
  activeRegionIds: readonly string[]
): TerrainProjectAsset[] {
  const assets = new Map(runtime.getAssets().map((asset) => [asset.document.descriptor.id, asset]));
  return activeRegionIds.map((id) => {
    const asset = assets.get(id);
    if (!asset) throw new Error(`Terrain Clipmap active Region "${id}" is not loaded`);
    return asset;
  });
}

function compatibleTerrainMaterial(assets: readonly TerrainProjectAsset[]): Material {
  const first = assets[0];
  if (!first) throw new Error("Terrain Clipmap active Region set cannot be empty");
  const material = first.terrainMaterial;
  for (const asset of assets.slice(1)) {
    if (asset.terrainMaterial.shader !== material.shader) {
      throw new Error("Geometry Clipmap requires one compatible Terrain Shader per active residency set");
    }
  }
  return material;
}
