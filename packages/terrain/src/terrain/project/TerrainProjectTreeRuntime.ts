import {
  AssetPromise,
  BoundingBox,
  Camera,
  Entity,
  Matrix,
  MeshRenderer,
  Quaternion,
  Script,
  Vector3
} from "@galacean/engine";
import { TerrainLodGroupRendererRuntime, type TerrainLodRendererTuning } from "../lod/TerrainLodGroupRendererRuntime";
import {
  createTerrainBillboardInstancedMesh,
  type TerrainBillboardInstancedMesh
} from "./TerrainBillboardInstancedMesh";
import { TerrainHeroTreeWindMaterialLibrary } from "./TerrainHeroTreeWind";
import type {
  TerrainProjectAsset,
  TerrainProjectResolvedGeometry,
  TerrainProjectResolvedRenderer
} from "./TerrainProjectAsset";
import { TerrainProjectWorldRuntime, type TerrainProjectRegionLease } from "./TerrainProjectRuntime";
import type { TerrainWindRuntime } from "./TerrainWindRuntime";

const BILLBOARD_INSTANCE_MACRO = "RENDERER_BILLBOARD_INSTANCE";
const RESERVED_BILLBOARD_ATTRIBUTES = new Set(["BILLBOARD_ORIGIN_SCALE_X", "BILLBOARD_SCALE_YZ"]);

/** Standard Scene configuration for canonical Terrain tree instances. */
export interface TerrainProjectTreeRuntimeConfig {
  /** Scene-owned world-index and progressive Region runtime. */
  worldRuntime: TerrainProjectWorldRuntime;
  /** Scene-owned camera used by authored LODGroups. */
  camera: Camera;
  /** Stable Region ids loaded and instantiated when the Scene first runs. */
  initialActiveRegionIds: string[];
}

/** Exact tree residency currently instantiated from canonical Prefab references. */
export interface TerrainProjectTreeRuntimeDiagnostics {
  /** Stable active Region ids in caller order. */
  activeRegionIds: readonly string[];
  /** Number of canonical tree instances. */
  instances: number;
  /** Number of instances driven by authored LODGroup metadata. */
  lodGroups: number;
}

interface TerrainProjectTreeInstanceRuntime {
  readonly id: string;
  readonly entity: Entity | null;
  readonly lod: TerrainLodGroupRendererRuntime | null;
}

interface TerrainProjectTreeRegionRuntime {
  readonly asset: TerrainProjectAsset;
  readonly root: Entity;
  readonly instances: ReadonlyMap<string, TerrainProjectTreeInstanceRuntime>;
  readonly billboardBatches: readonly TerrainProjectTreeBillboardBatchRuntime[];
}

interface TerrainProjectTreeBillboardBatchRuntime {
  readonly renderer: MeshRenderer;
  readonly resources: TerrainBillboardInstancedMesh;
}

interface PendingTerrainProjectTreeBillboardBatch {
  readonly prototypeId: string;
  readonly rendererIndex: number;
  readonly binding: TerrainProjectResolvedRenderer;
  readonly transforms: number[];
  bounds: BoundingBox | null;
}

interface TerrainProjectTreeTransformScratch {
  readonly scale: Vector3;
  readonly rotation: Quaternion;
  readonly translation: Vector3;
  readonly instanceMatrix: Matrix;
  readonly rendererMatrix: Matrix;
}

/**
 * Renders canonical tree placements through exact Prefab bindings and advances authored LODGroups per instance.
 * Prefab renderer and Material bindings remain the exact references resolved by the stock Project pipeline.
 */
export class TerrainProjectTreeRuntime extends Script {
  private _config: TerrainProjectTreeRuntimeConfig | null = null;
  private _worldRuntime: TerrainProjectWorldRuntime | null = null;
  private _camera: Camera | null = null;
  private _heroTreeWindMaterials: TerrainHeroTreeWindMaterialLibrary | null = null;
  private _heroTreeWindPreparation: Promise<void> | null = null;
  private _initialLoad: TerrainProjectTreeStartupLoad | null = null;
  private _activeLease: TerrainProjectRegionLease | null = null;
  private _residencyRevision = 0;
  private readonly _pendingResidencyUpdates = new Set<PendingTerrainProjectTreeResidencyUpdate>();
  private _residencyRoot: Entity | null = null;
  private _regionResidencies = new Map<string, TerrainProjectTreeRegionRuntime>();
  private _instances: readonly TerrainProjectTreeInstanceRuntime[] = [];
  private _lodTuning: TerrainLodRendererTuning = { enabled: true, distanceScale: 1 };
  private _diagnostics: TerrainProjectTreeRuntimeDiagnostics = {
    activeRegionIds: [],
    instances: 0,
    lodGroups: 0
  };
  private _resolveReady!: (diagnostics: TerrainProjectTreeRuntimeDiagnostics) => void;
  private _rejectReady!: (reason: unknown) => void;
  private readonly _readyTask = new AssetPromise<TerrainProjectTreeRuntimeDiagnostics>((resolve, reject) => {
    this._resolveReady = resolve;
    this._rejectReady = reject!;
  });

  /**
   * Stores serialized Scene references without starting resource work during deserialization.
   * @param config World runtime, LOD camera, and initial active Region ids.
   * @returns Nothing.
   */
  initialize(config: TerrainProjectTreeRuntimeConfig): void {
    if (!config || typeof config !== "object") throw new Error("Terrain tree runtime configuration is required");
    if (!(config.worldRuntime instanceof TerrainProjectWorldRuntime) || !(config.camera instanceof Camera)) {
      throw new Error("Terrain tree runtime requires serialized world-runtime and camera component references");
    }
    validateRegionIds(config.initialActiveRegionIds);
    this._config = {
      worldRuntime: config.worldRuntime,
      camera: config.camera,
      initialActiveRegionIds: [...config.initialActiveRegionIds]
    };
  }

  /**
   * Returns an independently cancellable observer of Scene-owned tree startup.
   * @returns Task resolving to the exact instantiated residency counts.
   */
  waitUntilReady(): AssetPromise<TerrainProjectTreeRuntimeDiagnostics> {
    return this._readyTask.then((diagnostics) => diagnostics);
  }

  /**
   * Returns a detached snapshot of the currently instantiated tree residency.
   * @returns Stable Region ids and exact instance/LODGroup counts.
   */
  getDiagnostics(): TerrainProjectTreeRuntimeDiagnostics {
    return {
      activeRegionIds: [...this._diagnostics.activeRegionIds],
      instances: this._diagnostics.instances,
      lodGroups: this._diagnostics.lodGroups
    };
  }

  /**
   * Applies runtime-only LOD controls to every current and future tree instance.
   * @param tuning Mesh-LOD enablement and projected-distance multiplier.
   * @returns Nothing.
   * @throws If the distance multiplier is not finite and positive.
   */
  setLodTuning(tuning: TerrainLodRendererTuning): void {
    validateLodTuning(tuning);
    this._lodTuning = { ...tuning };
    for (const instance of this._instances) instance.lod?.setTuning(this._lodTuning);
  }

  /**
   * Returns the current runtime-only tree LOD controls.
   * @returns Detached Mesh-LOD enablement and distance multiplier.
   */
  getLodTuning(): TerrainLodRendererTuning {
    return { ...this._lodTuning };
  }

  /**
   * Confirms that the Scene-owned GPU wind bridge belongs to this tree Scene. Tree renderers read
   * the shared response basis directly, so connecting wind never allocates or updates per-tree CPU state.
   */
  setWindRuntime(wind: TerrainWindRuntime | null): void {
    if (wind && wind.scene !== this.scene) throw new Error("Terrain tree wind runtime must belong to the same Scene");
  }

  /**
   * Loads the accepted production-tree mechanical data and shared Material variants before Scene startup.
   * The main Scene calls this once before `engine.run()` so every subsequently instantiated Region uses
   * the same per-Prefab wind contract as the dedicated wind-tree acceptance Scene.
   */
  async prepareProductionWind(): Promise<void> {
    if (this._heroTreeWindMaterials) return;
    if (this._heroTreeWindPreparation) return this._heroTreeWindPreparation;
    if (this.destroyed || this.pendingDestroy) throw new Error("Terrain tree runtime was destroyed");
    const preparation = TerrainHeroTreeWindMaterialLibrary.load(this.engine).then((materials) => {
      if (this.destroyed || this.pendingDestroy) {
        materials.destroy();
        throw new Error("Terrain tree runtime was destroyed while loading production wind assets");
      }
      this._heroTreeWindMaterials = materials;
    });
    this._heroTreeWindPreparation = preparation;
    try {
      await preparation;
    } finally {
      if (this._heroTreeWindPreparation === preparation) this._heroTreeWindPreparation = null;
    }
  }

  /**
   * Loads a Region set and atomically replaces its canonical tree instances.
   * @param activeRegionIds Stable world Region ids selected by the caller's residency policy.
   * @returns Cancellable task resolving to the instantiated residency counts.
   */
  loadAndSetActiveRegions(activeRegionIds: readonly string[]): AssetPromise<TerrainProjectTreeRuntimeDiagnostics> {
    validateRegionIds(activeRegionIds);
    const runtime = this._requireWorldRuntime();
    const regionIds = [...activeRegionIds];
    const revision = ++this._residencyRevision;
    this._cancelInitialLoad();
    this._supersedePendingResidencyUpdates(
      new Error("Terrain tree residency update was superseded by a newer request")
    );
    return new AssetPromise((resolve, reject, setComplete, setDetail, onCancel) => {
      const load = runtime.acquireRegions(regionIds);
      const update: PendingTerrainProjectTreeResidencyUpdate = { load, reject: reject!, active: true };
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
            reject!(new Error("Terrain tree runtime was destroyed during a residency update"));
            return;
          }
          if (revision !== this._residencyRevision) {
            lease.release();
            reject!(new Error("Terrain tree residency update was superseded by a newer request"));
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
   * Atomically instantiates an already-loaded Region set.
   * @param activeRegionIds Stable loaded Region ids selected by the caller's residency policy.
   * @returns Exact instantiated residency counts.
   */
  setActiveRegions(activeRegionIds: readonly string[]): TerrainProjectTreeRuntimeDiagnostics {
    validateRegionIds(activeRegionIds);
    ++this._residencyRevision;
    const runtime = this._requireWorldRuntime();
    this._cancelInitialLoad();
    this._supersedePendingResidencyUpdates(
      new Error("Terrain tree residency update was superseded by a synchronous request")
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
   * @param asset Working Region asset sharing the standard loader-resolved Prefab and Material dependencies.
   * @returns Exact instantiated residency counts for the updated active set.
   * @throws If the Region is not active or another active Region is no longer loaded.
   */
  previewRegionAsset(asset: TerrainProjectAsset): TerrainProjectTreeRuntimeDiagnostics {
    const regionId = asset.document.descriptor.id;
    if (!this._diagnostics.activeRegionIds.includes(regionId)) {
      throw new Error(`Terrain tree preview Region "${regionId}" is not active`);
    }
    const loaded = new Map(
      this._requireWorldRuntime()
        .getAssets()
        .map((candidate) => [candidate.document.descriptor.id, candidate])
    );
    const assets = this._diagnostics.activeRegionIds.map((id) => {
      if (id === regionId) return asset;
      const candidate = loaded.get(id);
      if (!candidate) throw new Error(`Terrain tree active Region "${id}" is not loaded`);
      return candidate;
    });
    return this._replaceActiveAssets(assets, this._diagnostics.activeRegionIds);
  }

  override onStart(): void {
    try {
      const config = this._config;
      if (!config) throw new Error("Terrain tree runtime was not initialized by its Scene");
      if (config.worldRuntime.scene !== this.scene || config.camera.scene !== this.scene) {
        throw new Error("Terrain tree runtime dependencies must belong to the same Scene");
      }
      this._worldRuntime = config.worldRuntime;
      this._camera = config.camera;
      const revision = ++this._residencyRevision;
      const load = config.worldRuntime.acquireRegions(config.initialActiveRegionIds);
      const startup: TerrainProjectTreeStartupLoad = { load, revision };
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
              throw new Error("Terrain tree runtime was destroyed during startup");
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
    for (let index = 0; index < this._instances.length; index++) {
      this._instances[index]!.lod?.updateRenderers(timeSeconds);
    }
  }

  override onDestroy(): void {
    const destroyedError = new Error("Terrain tree runtime was destroyed before its work completed");
    ++this._residencyRevision;
    this._rejectReady(destroyedError);
    this._supersedePendingResidencyUpdates(destroyedError);
    this._cancelInitialLoad();
    for (const region of this._regionResidencies.values()) disposeRegion(region);
    this._residencyRoot?.destroy();
    this._residencyRoot = null;
    this._regionResidencies.clear();
    this._instances = [];
    this._activeLease?.release();
    this._activeLease = null;
    this._worldRuntime = null;
    this._camera = null;
    this._heroTreeWindMaterials?.destroy();
    this._heroTreeWindMaterials = null;
    this._heroTreeWindPreparation = null;
    this._config = null;
  }

  private _replaceActiveRegions(
    runtime: TerrainProjectWorldRuntime,
    activeRegionIds: readonly string[]
  ): TerrainProjectTreeRuntimeDiagnostics {
    const assetsById = new Map(runtime.getAssets().map((asset) => [asset.document.descriptor.id, asset]));
    const assets = activeRegionIds.map((id) => {
      const asset = assetsById.get(id);
      if (!asset) throw new Error(`Terrain tree active Region "${id}" is not loaded`);
      return asset;
    });
    return this._replaceActiveAssets(
      assets,
      activeRegionIds,
      runtime.getRendererConfig().surfaceLodCrossFadeDurationSeconds
    );
  }

  private _replaceActiveAssets(
    assets: readonly TerrainProjectAsset[],
    activeRegionIds: readonly string[],
    crossFadeDurationSeconds = this._requireWorldRuntime().getRendererConfig().surfaceLodCrossFadeDurationSeconds
  ): TerrainProjectTreeRuntimeDiagnostics {
    const createdResidencyRoot = this._residencyRoot === null;
    const residencyRoot = this._residencyRoot ?? this.entity.createChild("Terrain Project tree residency");
    const createdRegions = new Map<string, TerrainProjectTreeRegionRuntime>();
    try {
      for (const asset of assets) {
        const regionId = asset.document.descriptor.id;
        const current = this._regionResidencies.get(regionId);
        if (current?.asset !== asset) {
          createdRegions.set(regionId, this._instantiateRegion(residencyRoot, asset, crossFadeDurationSeconds));
        }
      }
      const nextRegions = new Map<string, TerrainProjectTreeRegionRuntime>();
      for (const asset of assets) {
        const regionId = asset.document.descriptor.id;
        const current = this._regionResidencies.get(regionId);
        nextRegions.set(regionId, current?.asset === asset ? current : createdRegions.get(regionId)!);
      }
      const instances = [...nextRegions.values()].flatMap((region) => [...region.instances.values()]);
      const diagnostics: TerrainProjectTreeRuntimeDiagnostics = {
        activeRegionIds: [...activeRegionIds],
        instances: instances.length,
        lodGroups: instances.reduce((sum, instance) => sum + (instance.lod ? 1 : 0), 0)
      };
      const timeSeconds = this.engine.time.elapsedTime;
      for (const region of createdRegions.values()) {
        for (const instance of region.instances.values()) instance.lod?.updateRenderers(timeSeconds);
      }
      const retiringRegions = [...this._regionResidencies].flatMap(([regionId, region]) =>
        nextRegions.get(regionId) === region ? [] : [region]
      );
      for (const region of retiringRegions) region.root.isActive = false;
      for (const region of createdRegions.values()) region.root.isActive = true;
      for (const region of retiringRegions) disposeRegion(region);
      this._residencyRoot = residencyRoot;
      this._regionResidencies = nextRegions;
      this._instances = instances;
      this._diagnostics = diagnostics;
      return diagnostics;
    } catch (error) {
      for (const region of createdRegions.values()) disposeRegion(region);
      if (createdResidencyRoot) residencyRoot.destroy();
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

  private _settleInitialLoad(startup: TerrainProjectTreeStartupLoad): boolean {
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

  private _settleResidencyUpdate(update: PendingTerrainProjectTreeResidencyUpdate): boolean {
    if (!update.active) return false;
    update.active = false;
    this._pendingResidencyUpdates.delete(update);
    return true;
  }

  private _instantiateRegion(
    parent: Entity,
    asset: TerrainProjectAsset,
    crossFadeDurationSeconds: number
  ): TerrainProjectTreeRegionRuntime {
    const { descriptor, manifest } = asset.document;
    const regionRoot = parent.createChild(descriptor.id);
    regionRoot.isActive = false;
    regionRoot.transform.setPosition(...descriptor.worldPosition);
    try {
      const instances = new Map<string, TerrainProjectTreeInstanceRuntime>();
      const treePrototypes = new Map(manifest.treePrototypes.map((prototype) => [prototype.id, prototype]));
      const pendingBillboardBatches = new Map<string, PendingTerrainProjectTreeBillboardBatch>();
      const transformScratch: TerrainProjectTreeTransformScratch = {
        scale: new Vector3(),
        rotation: new Quaternion(),
        translation: new Vector3(),
        instanceMatrix: new Matrix(),
        rendererMatrix: new Matrix()
      };
      for (const instance of manifest.treeInstances) {
        const prefab = asset.prototypePrefabs.get(instance.prototypeId);
        const geometry = asset.prototypeGeometries.get(instance.prototypeId);
        const prototype = treePrototypes.get(instance.prototypeId);
        if (!prefab || !geometry || !prototype) {
          throw new Error(`Tree "${instance.id}" did not resolve its exact canonical Prefab`);
        }
        if (geometry.kind === "renderers" && geometry.renderers.every((binding) => binding.billboardInstancing)) {
          geometry.renderers.forEach((binding, rendererIndex) => {
            const key = `${instance.prototypeId}:${rendererIndex}`;
            let pending = pendingBillboardBatches.get(key);
            if (!pending) {
              pending = {
                prototypeId: instance.prototypeId,
                rendererIndex,
                binding,
                transforms: [],
                bounds: null
              };
              pendingBillboardBatches.set(key, pending);
            }
            appendBillboardInstance(
              pending,
              instance.localPosition,
              instance.rotationYRadians,
              instance.scale,
              transformScratch
            );
          });
          instances.set(instance.id, {
            id: instance.id,
            entity: null,
            lod: null
          });
          continue;
        }

        const entity = prefab.instantiate();
        if (!entity) throw new Error(`Tree "${instance.id}" Prefab could not be instantiated`);
        regionRoot.addChild(entity);
        entity.transform.setPosition(...instance.localPosition);
        entity.transform.setRotation(0, (instance.rotationYRadians * 180) / Math.PI, 0);
        entity.transform.setScale(...instance.scale);
        const lod = createLodRuntime(
          entity,
          this._requireCamera(),
          geometry,
          crossFadeDurationSeconds,
          this._lodTuning
        );
        this._heroTreeWindMaterials?.bindProductionInstance(entity, geometry, prototype.prefab.url);
        instances.set(instance.id, {
          id: instance.id,
          entity,
          lod
        });
      }
      const billboardBatches: TerrainProjectTreeBillboardBatchRuntime[] = [];
      try {
        for (const pending of pendingBillboardBatches.values()) {
          billboardBatches.push(instantiateBillboardBatch(regionRoot, descriptor.id, pending));
        }
      } catch (error) {
        for (const batch of billboardBatches) disposeBillboardBatch(batch);
        throw error;
      }
      return { asset, root: regionRoot, instances, billboardBatches };
    } catch (error) {
      regionRoot.destroy();
      throw error;
    }
  }

  private _requireWorldRuntime(): TerrainProjectWorldRuntime {
    if (!this._worldRuntime) throw new Error("Terrain tree runtime has not started");
    return this._worldRuntime;
  }

  private _requireCamera(): Camera {
    if (!this._camera) throw new Error("Terrain tree runtime has not started");
    return this._camera;
  }
}

function createLodRuntime(
  entity: Entity,
  camera: Camera,
  geometry: TerrainProjectResolvedGeometry,
  crossFadeDurationSeconds: number,
  tuning: TerrainLodRendererTuning
): TerrainLodGroupRendererRuntime | null {
  if (geometry.kind !== "lod-group") return null;
  const lod = new TerrainLodGroupRendererRuntime(entity, camera, geometry.lodGroup, crossFadeDurationSeconds);
  lod.setTuning(tuning);
  return lod;
}

function appendBillboardInstance(
  pending: PendingTerrainProjectTreeBillboardBatch,
  localPosition: readonly [number, number, number],
  rotationYRadians: number,
  scale: readonly [number, number, number],
  scratch: TerrainProjectTreeTransformScratch
): void {
  scratch.scale.set(...scale);
  Quaternion.rotationYawPitchRoll(rotationYRadians, 0, 0, scratch.rotation);
  scratch.translation.set(...localPosition);
  Matrix.affineTransformation(scratch.scale, scratch.rotation, scratch.translation, scratch.instanceMatrix);
  Matrix.multiply(scratch.instanceMatrix, pending.binding.localMatrix, scratch.rendererMatrix);
  const elements = scratch.rendererMatrix.elements;
  const scaleX = Math.hypot(elements[0], elements[1], elements[2]);
  const scaleY = Math.hypot(elements[4], elements[5], elements[6]);
  const scaleZ = Math.hypot(elements[8], elements[9], elements[10]);
  const originX = elements[12];
  const originY = elements[13];
  const originZ = elements[14];
  if (![originX, originY, originZ, scaleX, scaleY, scaleZ].every(Number.isFinite)) {
    throw new Error("Terrain Billboard instance transform must be finite");
  }
  pending.transforms.push(originX, originY, originZ, scaleX, scaleY, scaleZ);

  const sourceBounds = pending.binding.mesh.bounds;
  const horizontalRadius = Math.hypot(
    Math.max(Math.abs(sourceBounds.min.x), Math.abs(sourceBounds.max.x)) * scaleX,
    Math.max(Math.abs(sourceBounds.min.z), Math.abs(sourceBounds.max.z)) * scaleZ
  );
  const instanceBounds = new BoundingBox();
  instanceBounds.min.set(originX - horizontalRadius, originY + sourceBounds.min.y * scaleY, originZ - horizontalRadius);
  instanceBounds.max.set(originX + horizontalRadius, originY + sourceBounds.max.y * scaleY, originZ + horizontalRadius);
  if (pending.bounds) BoundingBox.merge(pending.bounds, instanceBounds, pending.bounds);
  else pending.bounds = instanceBounds;
}

function instantiateBillboardBatch(
  parent: Entity,
  regionId: string,
  pending: PendingTerrainProjectTreeBillboardBatch
): TerrainProjectTreeBillboardBatchRuntime {
  const { binding, prototypeId, rendererIndex } = pending;
  if (!binding.billboardInstancing || binding.castShadows || binding.material.shader.name !== "Terrain/Billboard") {
    throw new Error(`Tree prototype "${prototypeId}" renderer does not support exact Billboard instancing`);
  }
  if (
    binding.mesh.blendShapeCount !== 0 ||
    binding.mesh.subMeshes.length !== 1 ||
    binding.mesh.subMeshes[0].count <= 0 ||
    binding.mesh.vertexElements.some((element) => RESERVED_BILLBOARD_ATTRIBUTES.has(element.attribute))
  ) {
    throw new Error(`Tree prototype "${prototypeId}" Billboard renderer must resolve exactly one static primitive`);
  }
  if (!pending.bounds || pending.transforms.length % 6 !== 0) {
    throw new Error(`Tree prototype "${prototypeId}" Billboard batch has inconsistent instance transforms`);
  }

  const entity = parent.createChild(`${prototypeId}:${rendererIndex}:Billboard instances`);
  const renderer = entity.addComponent(MeshRenderer);
  let resources: TerrainBillboardInstancedMesh | null = null;
  try {
    resources = createTerrainBillboardInstancedMesh(
      parent.engine,
      binding.mesh,
      new Float32Array(pending.transforms),
      pending.bounds,
      `${regionId}:${prototypeId}:${rendererIndex}`
    );
    renderer.mesh = resources.mesh;
    renderer.setMaterial(binding.material);
    renderer.castShadows = false;
    renderer.receiveShadows = binding.receiveShadows;
    renderer.enableVertexColor = binding.enableVertexColor;
    renderer.shaderData.enableMacro(BILLBOARD_INSTANCE_MACRO);
    return { renderer, resources };
  } catch (error) {
    renderer.mesh = null!;
    renderer.setMaterials([]);
    entity.destroy();
    resources?.mesh.destroy();
    resources?.instanceBuffer.destroy();
    resources?.indexBuffer?.destroy();
    throw error;
  }
}

function disposeRegion(region: TerrainProjectTreeRegionRuntime): void {
  for (const batch of region.billboardBatches) disposeBillboardBatch(batch);
  region.root.destroy();
}

function disposeBillboardBatch(batch: TerrainProjectTreeBillboardBatchRuntime): void {
  batch.renderer.mesh = null!;
  batch.renderer.setMaterials([]);
  batch.renderer.entity.destroy();
  batch.resources.mesh.destroy();
  batch.resources.instanceBuffer.destroy();
  batch.resources.indexBuffer?.destroy();
}

function validateLodTuning(tuning: TerrainLodRendererTuning): void {
  if (!Number.isFinite(tuning.distanceScale) || tuning.distanceScale <= 0) {
    throw new RangeError("Terrain tree LOD distance scale must be finite and positive");
  }
}

interface TerrainProjectTreeStartupLoad {
  readonly load: AssetPromise<TerrainProjectRegionLease>;
  readonly revision: number;
}

interface PendingTerrainProjectTreeResidencyUpdate {
  readonly load: AssetPromise<TerrainProjectRegionLease>;
  readonly reject: (reason: unknown) => void;
  active: boolean;
}

function validateRegionIds(ids: readonly string[]): void {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id.length)) {
    throw new Error("Terrain tree active Region ids must be nonempty strings");
  }
  if (new Set(ids).size !== ids.length) throw new Error("Terrain tree active Region ids must be unique");
}
