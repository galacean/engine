import { AssetPromise, Camera, Entity, PrefabResource, Script } from "@galacean/engine";
import { TerrainLodGroupRendererRuntime, type TerrainLodRendererTuning } from "../lod/TerrainLodGroupRendererRuntime";
import type { TerrainProjectAsset, TerrainProjectResolvedGeometry } from "./TerrainProjectAsset";
import type { TerrainProjectPlacedPrefabInstance, TerrainVec3, TerrainVec4 } from "./TerrainProjectContract";
import { TerrainProjectWorldRuntime, type TerrainProjectRegionLease } from "./TerrainProjectRuntime";

/** Standard Scene configuration for ordinary canonical Prefab placements. */
export interface TerrainProjectPlacedPrefabRuntimeConfig {
  /** Scene-owned world-index and progressive Region runtime. */
  worldRuntime: TerrainProjectWorldRuntime;
  /** Scene-owned camera used by authored LODGroups. */
  camera: Camera;
  /** Stable Region ids loaded and instantiated when the Scene first runs. */
  initialActiveRegionIds: string[];
}

/** Exact ordinary-Prefab residency currently instantiated from canonical refs. */
export interface TerrainProjectPlacedPrefabRuntimeDiagnostics {
  /** Stable active Region ids in caller order. */
  activeRegionIds: readonly string[];
  /** Number of ordinary canonical Prefab instances. */
  instances: number;
  /** Number of instances driven by authored LODGroup metadata. */
  lodGroups: number;
}

interface TerrainProjectPlacedPrefabInstanceRuntime {
  readonly id: string;
  readonly prototypeId: string;
  readonly prefab: PrefabResource;
  readonly localPosition: TerrainVec3;
  readonly localRotationQuaternion: TerrainVec4;
  readonly localScale: TerrainVec3;
  readonly entity: Entity;
  readonly lod: TerrainLodGroupRendererRuntime | null;
}

interface TerrainProjectPlacedPrefabRegionRuntime {
  readonly root: Entity;
  readonly worldPosition: TerrainVec3;
  readonly instances: ReadonlyMap<string, TerrainProjectPlacedPrefabInstanceRuntime>;
}

interface TerrainProjectPlacedPrefabRegionStage {
  readonly current: TerrainProjectPlacedPrefabRegionRuntime | null;
  readonly next: TerrainProjectPlacedPrefabRegionRuntime;
  readonly createdRoot: boolean;
  readonly stagedInstances: readonly TerrainProjectPlacedPrefabInstanceRuntime[];
  readonly retiredInstances: readonly TerrainProjectPlacedPrefabInstanceRuntime[];
}

/**
 * Instantiates ordinary canonical Prefabs and applies any authored LODGroup metadata from their exact refs.
 * Region and instance identities reconcile independently, and replacements commit only after complete staging.
 */
export class TerrainProjectPlacedPrefabRuntime extends Script {
  private _config: TerrainProjectPlacedPrefabRuntimeConfig | null = null;
  private _worldRuntime: TerrainProjectWorldRuntime | null = null;
  private _camera: Camera | null = null;
  private _initialLoad: TerrainProjectPlacedPrefabStartupLoad | null = null;
  private _activeLease: TerrainProjectRegionLease | null = null;
  private _residencyRevision = 0;
  private readonly _pendingResidencyUpdates = new Set<PendingTerrainProjectPlacedPrefabResidencyUpdate>();
  private _residencyRoot: Entity | null = null;
  private _regionResidencies = new Map<string, TerrainProjectPlacedPrefabRegionRuntime>();
  private _lodControllers: TerrainLodGroupRendererRuntime[] = [];
  private _lodTuning: TerrainLodRendererTuning = { enabled: true, distanceScale: 1 };
  private _diagnostics: TerrainProjectPlacedPrefabRuntimeDiagnostics = {
    activeRegionIds: [],
    instances: 0,
    lodGroups: 0
  };
  private _resolveReady!: (diagnostics: TerrainProjectPlacedPrefabRuntimeDiagnostics) => void;
  private _rejectReady!: (reason: unknown) => void;
  private readonly _readyTask = new AssetPromise<TerrainProjectPlacedPrefabRuntimeDiagnostics>((resolve, reject) => {
    this._resolveReady = resolve;
    this._rejectReady = reject!;
  });

  /**
   * Stores serialized Scene references without starting resource work during deserialization.
   * @param config World runtime, LOD camera, and initial active Region ids.
   * @returns Nothing.
   * @throws If the serialized references or Region ids are invalid.
   */
  initialize(config: TerrainProjectPlacedPrefabRuntimeConfig): void {
    if (!config || typeof config !== "object")
      throw new Error("Terrain placed-Prefab runtime configuration is required");
    if (!(config.worldRuntime instanceof TerrainProjectWorldRuntime) || !(config.camera instanceof Camera)) {
      throw new Error(
        "Terrain placed-Prefab runtime requires serialized world-runtime and camera component references"
      );
    }
    validateRegionIds(config.initialActiveRegionIds);
    this._config = {
      worldRuntime: config.worldRuntime,
      camera: config.camera,
      initialActiveRegionIds: [...config.initialActiveRegionIds]
    };
  }

  /**
   * Returns an independently cancellable observer of Scene-owned ordinary-Prefab startup.
   * @returns Task resolving to the exact instantiated residency count.
   */
  waitUntilReady(): AssetPromise<TerrainProjectPlacedPrefabRuntimeDiagnostics> {
    return this._readyTask.then((diagnostics) => diagnostics);
  }

  /**
   * Returns a detached snapshot of the currently instantiated ordinary-Prefab residency.
   * @returns Stable Region ids and exact instance count.
   */
  getDiagnostics(): TerrainProjectPlacedPrefabRuntimeDiagnostics {
    return {
      activeRegionIds: [...this._diagnostics.activeRegionIds],
      instances: this._diagnostics.instances,
      lodGroups: this._diagnostics.lodGroups
    };
  }

  /**
   * Applies runtime-only LOD controls to every current and future placed Prefab.
   * @param tuning Mesh-LOD enablement and projected-distance multiplier.
   * @returns Nothing.
   * @throws If the distance multiplier is not finite and positive.
   */
  setLodTuning(tuning: TerrainLodRendererTuning): void {
    validateLodTuning(tuning);
    this._lodTuning = { ...tuning };
    for (let index = 0; index < this._lodControllers.length; index++) {
      this._lodControllers[index]!.setTuning(this._lodTuning);
    }
  }

  /**
   * Returns the current runtime-only placed-Prefab LOD controls.
   * @returns Detached Mesh-LOD enablement and distance multiplier.
   */
  getLodTuning(): TerrainLodRendererTuning {
    return { ...this._lodTuning };
  }

  /**
   * Loads a Region set and atomically reconciles its ordinary canonical Prefab instances.
   * @param activeRegionIds Stable world Region ids selected by the caller's residency policy.
   * @returns Cancellable task resolving to the instantiated residency count.
   * @throws If Region ids are invalid or the runtime has not started.
   */
  loadAndSetActiveRegions(
    activeRegionIds: readonly string[]
  ): AssetPromise<TerrainProjectPlacedPrefabRuntimeDiagnostics> {
    validateRegionIds(activeRegionIds);
    const runtime = this._requireWorldRuntime();
    const regionIds = [...activeRegionIds];
    const revision = ++this._residencyRevision;
    this._cancelInitialLoad();
    this._supersedePendingResidencyUpdates(
      new Error("Terrain placed-Prefab residency update was superseded by a newer request")
    );
    return new AssetPromise((resolve, reject, setComplete, setDetail, onCancel) => {
      const load = runtime.acquireRegions(regionIds);
      const update: PendingTerrainProjectPlacedPrefabResidencyUpdate = { load, reject: reject!, active: true };
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
            reject!(new Error("Terrain placed-Prefab runtime was destroyed during a residency update"));
            return;
          }
          if (revision !== this._residencyRevision) {
            lease.release();
            reject!(new Error("Terrain placed-Prefab residency update was superseded by a newer request"));
            return;
          }
          try {
            const diagnostics = this._replaceActiveRegions(runtime, regionIds);
            this._replaceActiveLease(lease);
            resolve(diagnostics);
            this._resolveReady(diagnostics);
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
   * Atomically reconciles an already-loaded Region set.
   * @param activeRegionIds Stable loaded Region ids selected by the caller's residency policy.
   * @returns Exact instantiated residency count.
   * @throws If a Region is invalid, unloaded, or cannot stage every declared Prefab.
   */
  setActiveRegions(activeRegionIds: readonly string[]): TerrainProjectPlacedPrefabRuntimeDiagnostics {
    validateRegionIds(activeRegionIds);
    ++this._residencyRevision;
    const runtime = this._requireWorldRuntime();
    this._cancelInitialLoad();
    this._supersedePendingResidencyUpdates(
      new Error("Terrain placed-Prefab residency update was superseded by a synchronous request")
    );
    let lease: TerrainProjectRegionLease | null = null;
    try {
      lease = runtime.retainLoadedRegions(activeRegionIds);
      const diagnostics = this._replaceActiveRegions(runtime, activeRegionIds);
      this._replaceActiveLease(lease);
      this._resolveReady(diagnostics);
      return diagnostics;
    } catch (error) {
      lease?.release();
      this._rejectReady(error);
      throw error;
    }
  }

  /**
   * Replaces one active Region with an already assembled unpublished asset for interactive editor preview.
   * @param asset Working Region asset sharing standard loader-resolved Prefab and Material dependencies.
   * @returns Exact instantiated residency counts for the updated active set.
   * @throws If the Region is not active or another active Region is no longer loaded.
   */
  previewRegionAsset(asset: TerrainProjectAsset): TerrainProjectPlacedPrefabRuntimeDiagnostics {
    const regionId = asset.document.descriptor.id;
    if (!this._diagnostics.activeRegionIds.includes(regionId)) {
      throw new Error(`Terrain placed-Prefab preview Region "${regionId}" is not active`);
    }
    const loaded = new Map(
      this._requireWorldRuntime()
        .getAssets()
        .map((candidate) => [candidate.document.descriptor.id, candidate])
    );
    const assets = this._diagnostics.activeRegionIds.map((id) => {
      if (id === regionId) return asset;
      const candidate = loaded.get(id);
      if (!candidate) throw new Error(`Terrain placed-Prefab active Region "${id}" is not loaded`);
      return candidate;
    });
    return this._replaceActiveAssets(assets, this._diagnostics.activeRegionIds);
  }

  override onStart(): void {
    try {
      const config = this._config;
      if (!config) throw new Error("Terrain placed-Prefab runtime was not initialized by its Scene");
      if (config.worldRuntime.scene !== this.scene || config.camera.scene !== this.scene) {
        throw new Error("Terrain placed-Prefab runtime dependencies must belong to the same Scene");
      }
      this._worldRuntime = config.worldRuntime;
      this._camera = config.camera;
      const revision = ++this._residencyRevision;
      const load = config.worldRuntime.acquireRegions(config.initialActiveRegionIds);
      const startup: TerrainProjectPlacedPrefabStartupLoad = { load, revision };
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
              throw new Error("Terrain placed-Prefab runtime was destroyed during startup");
            }
            const diagnostics = this._replaceActiveRegions(config.worldRuntime, config.initialActiveRegionIds);
            this._replaceActiveLease(lease);
            this._resolveReady(diagnostics);
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

  override onUpdate(): void {
    const timeSeconds = this.engine.time.elapsedTime;
    for (let index = 0; index < this._lodControllers.length; index++) {
      this._lodControllers[index]!.updateRenderers(timeSeconds);
    }
  }

  override onDestroy(): void {
    const destroyedError = new Error("Terrain placed-Prefab runtime was destroyed before its work completed");
    ++this._residencyRevision;
    this._rejectReady(destroyedError);
    this._supersedePendingResidencyUpdates(destroyedError);
    this._cancelInitialLoad();
    this._residencyRoot?.destroy();
    this._residencyRoot = null;
    this._regionResidencies.clear();
    this._lodControllers = [];
    this._activeLease?.release();
    this._activeLease = null;
    this._worldRuntime = null;
    this._camera = null;
    this._config = null;
  }

  private _replaceActiveRegions(
    runtime: TerrainProjectWorldRuntime,
    activeRegionIds: readonly string[]
  ): TerrainProjectPlacedPrefabRuntimeDiagnostics {
    const assetsById = new Map(runtime.getAssets().map((asset) => [asset.document.descriptor.id, asset]));
    const assets = activeRegionIds.map((id) => {
      const asset = assetsById.get(id);
      if (!asset) throw new Error(`Terrain placed-Prefab active Region "${id}" is not loaded`);
      return asset;
    });
    return this._replaceActiveAssets(assets, activeRegionIds);
  }

  private _replaceActiveAssets(
    assets: readonly TerrainProjectAsset[],
    activeRegionIds: readonly string[]
  ): TerrainProjectPlacedPrefabRuntimeDiagnostics {
    const createdResidencyRoot = this._residencyRoot === null;
    const residencyRoot = this._residencyRoot ?? this.entity.createChild("Terrain Project placed-Prefab residency");
    const stages: TerrainProjectPlacedPrefabRegionStage[] = [];
    try {
      for (const asset of assets) {
        const current = this._regionResidencies.get(asset.document.descriptor.id) ?? null;
        stages.push(this._stageRegion(residencyRoot, current, asset));
      }
      const nextRegions = new Map(activeRegionIds.map((regionId, index) => [regionId, stages[index].next] as const));
      const instances = stages.flatMap((stage) => [...stage.next.instances.values()]);
      const lodControllers: TerrainLodGroupRendererRuntime[] = [];
      for (let index = 0; index < instances.length; index++) {
        const lod = instances[index]!.lod;
        if (lod) lodControllers.push(lod);
      }
      const diagnostics: TerrainProjectPlacedPrefabRuntimeDiagnostics = {
        activeRegionIds: [...activeRegionIds],
        instances: instances.length,
        lodGroups: lodControllers.length
      };
      const timeSeconds = this.engine.time.elapsedTime;
      for (const stage of stages) {
        for (const instance of stage.stagedInstances) instance.lod?.updateRenderers(timeSeconds);
      }
      const retiringRoots = [...this._regionResidencies].flatMap(([regionId, region]) =>
        nextRegions.get(regionId)?.root === region.root ? [] : [region.root]
      );
      for (const stage of stages) {
        for (const instance of stage.retiredInstances) instance.entity.isActive = false;
      }
      for (const root of retiringRoots) root.isActive = false;
      for (const stage of stages) {
        if (stage.createdRoot) stage.next.root.isActive = true;
        else for (const instance of stage.stagedInstances) instance.entity.isActive = true;
      }
      for (const stage of stages) {
        for (const instance of stage.retiredInstances) instance.entity.destroy();
      }
      for (const root of retiringRoots) root.destroy();
      this._residencyRoot = residencyRoot;
      this._regionResidencies = nextRegions;
      this._lodControllers = lodControllers;
      this._diagnostics = diagnostics;
      return diagnostics;
    } catch (error) {
      if (createdResidencyRoot) {
        residencyRoot.destroy();
      } else {
        for (const stage of stages) {
          if (stage.createdRoot) stage.next.root.destroy();
          else for (const instance of stage.stagedInstances) instance.entity.destroy();
        }
      }
      throw error;
    }
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

  private _settleInitialLoad(startup: TerrainProjectPlacedPrefabStartupLoad): boolean {
    if (this._initialLoad !== startup) return false;
    this._initialLoad = null;
    return true;
  }

  private _supersedePendingResidencyUpdates(error: Error): void {
    for (const update of [...this._pendingResidencyUpdates]) {
      if (!this._settleResidencyUpdate(update)) continue;
      update.reject(error);
      update.load.cancel();
    }
  }

  private _settleResidencyUpdate(update: PendingTerrainProjectPlacedPrefabResidencyUpdate): boolean {
    if (!update.active) return false;
    update.active = false;
    this._pendingResidencyUpdates.delete(update);
    return true;
  }

  private _stageRegion(
    parent: Entity,
    current: TerrainProjectPlacedPrefabRegionRuntime | null,
    asset: TerrainProjectAsset
  ): TerrainProjectPlacedPrefabRegionStage {
    const worldPosition = asset.document.descriptor.worldPosition;
    if (!current || !sameTuple(current.worldPosition, worldPosition)) {
      return this._stageNewRegion(parent, current, asset);
    }
    const stagedInstances: TerrainProjectPlacedPrefabInstanceRuntime[] = [];
    try {
      const nextInstances = new Map<string, TerrainProjectPlacedPrefabInstanceRuntime>();
      for (const placement of asset.document.manifest.placedPrefabInstances ?? []) {
        const { prefab, geometry } = requirePlacedPrefab(asset, placement);
        const retained = current.instances.get(placement.id);
        if (retained && matchesPlacement(retained, placement, prefab)) {
          nextInstances.set(placement.id, retained);
          continue;
        }
        const staged = this._instantiatePlacement(current.root, placement, prefab, geometry, false);
        stagedInstances.push(staged);
        nextInstances.set(placement.id, staged);
      }
      return {
        current,
        next: { root: current.root, worldPosition: [...worldPosition], instances: nextInstances },
        createdRoot: false,
        stagedInstances,
        retiredInstances: [...current.instances.values()].filter(
          (instance) => nextInstances.get(instance.id) !== instance
        )
      };
    } catch (error) {
      for (const instance of stagedInstances) instance.entity.destroy();
      throw error;
    }
  }

  private _stageNewRegion(
    parent: Entity,
    current: TerrainProjectPlacedPrefabRegionRuntime | null,
    asset: TerrainProjectAsset
  ): TerrainProjectPlacedPrefabRegionStage {
    const { descriptor, manifest } = asset.document;
    const root = parent.createChild(descriptor.id);
    root.isActive = false;
    root.transform.setPosition(...descriptor.worldPosition);
    try {
      const instances = new Map<string, TerrainProjectPlacedPrefabInstanceRuntime>();
      for (const placement of manifest.placedPrefabInstances ?? []) {
        const { prefab, geometry } = requirePlacedPrefab(asset, placement);
        instances.set(placement.id, this._instantiatePlacement(root, placement, prefab, geometry, true));
      }
      return {
        current,
        next: { root, worldPosition: [...descriptor.worldPosition], instances },
        createdRoot: true,
        stagedInstances: [...instances.values()],
        retiredInstances: []
      };
    } catch (error) {
      root.destroy();
      throw error;
    }
  }

  private _instantiatePlacement(
    parent: Entity,
    placement: TerrainProjectPlacedPrefabInstance,
    prefab: PrefabResource,
    geometry: TerrainProjectResolvedGeometry | null,
    active: boolean
  ): TerrainProjectPlacedPrefabInstanceRuntime {
    const entity = prefab.instantiate();
    if (!entity) throw new Error(`Placed Prefab "${placement.id}" could not be instantiated`);
    try {
      parent.addChild(entity);
      entity.isActive = active;
      entity.transform.setPosition(...placement.localPosition);
      entity.transform.setRotationQuaternion(...placement.localRotationQuaternion);
      entity.transform.setScale(...placement.localScale);
      const lod =
        geometry?.kind === "lod-group"
          ? new TerrainLodGroupRendererRuntime(
              entity,
              this._requireCamera(),
              geometry.lodGroup,
              this._requireWorldRuntime().getRendererConfig().surfaceLodCrossFadeDurationSeconds
            )
          : null;
      lod?.setTuning(this._lodTuning);
      return {
        id: placement.id,
        prototypeId: placement.prototypeId,
        prefab,
        localPosition: [...placement.localPosition],
        localRotationQuaternion: [...placement.localRotationQuaternion],
        localScale: [...placement.localScale],
        entity,
        lod
      };
    } catch (error) {
      entity.destroy();
      throw error;
    }
  }

  private _requireWorldRuntime(): TerrainProjectWorldRuntime {
    if (!this._worldRuntime) throw new Error("Terrain placed-Prefab runtime has not started");
    return this._worldRuntime;
  }

  private _requireCamera(): Camera {
    if (!this._camera) throw new Error("Terrain placed-Prefab runtime has not started");
    return this._camera;
  }
}

function validateLodTuning(tuning: TerrainLodRendererTuning): void {
  if (!Number.isFinite(tuning.distanceScale) || tuning.distanceScale <= 0) {
    throw new RangeError("Terrain placed-Prefab LOD distance scale must be finite and positive");
  }
}

interface TerrainProjectPlacedPrefabStartupLoad {
  readonly load: AssetPromise<TerrainProjectRegionLease>;
  readonly revision: number;
}

interface PendingTerrainProjectPlacedPrefabResidencyUpdate {
  readonly load: AssetPromise<TerrainProjectRegionLease>;
  readonly reject: (reason: unknown) => void;
  active: boolean;
}

function requirePlacedPrefab(
  asset: TerrainProjectAsset,
  placement: TerrainProjectPlacedPrefabInstance
): { prefab: PrefabResource; geometry: TerrainProjectResolvedGeometry | null } {
  const prefab = asset.placedPrefabs.get(placement.prototypeId);
  if (!prefab) throw new Error(`Placed Prefab "${placement.id}" did not resolve its exact canonical Prefab`);
  return { prefab, geometry: asset.placedPrefabGeometries.get(placement.prototypeId) ?? null };
}

function matchesPlacement(
  current: TerrainProjectPlacedPrefabInstanceRuntime,
  placement: TerrainProjectPlacedPrefabInstance,
  prefab: PrefabResource
): boolean {
  return (
    current.prototypeId === placement.prototypeId &&
    current.prefab === prefab &&
    sameTuple(current.localPosition, placement.localPosition) &&
    sameTuple(current.localRotationQuaternion, placement.localRotationQuaternion) &&
    sameTuple(current.localScale, placement.localScale)
  );
}

function sameTuple(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateRegionIds(ids: readonly string[]): void {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id.length)) {
    throw new Error("Terrain placed-Prefab active Region ids must be nonempty strings");
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("Terrain placed-Prefab active Region selection contains duplicate ids");
  }
}
