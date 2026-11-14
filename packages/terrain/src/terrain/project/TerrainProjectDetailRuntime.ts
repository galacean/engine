import {
  AssetPromise,
  BoundingBox,
  Camera,
  Entity,
  MeshRenderer,
  Script,
  ShaderProperty,
  Vector3
} from "@galacean/engine";
import type { TerrainProjectAsset, TerrainProjectResolvedRenderer } from "./TerrainProjectAsset";
import { createTerrainDetailInstancedMesh, type TerrainDetailInstancedMesh } from "./TerrainDetailInstancedMesh";
import { TerrainProjectWorldRuntime, type TerrainProjectRegionLease } from "./TerrainProjectRuntime";

const DETAIL_INSTANCE_MACRO = "RENDERER_DETAIL_INSTANCE";
const DETAIL_LOCAL_MATRIX = ShaderProperty.getByName("renderer_DetailLocalMatrix");
const DETAIL_LOCAL_NORMAL_MATRIX = ShaderProperty.getByName("renderer_DetailLocalNormalMat");
const DETAIL_TRANSFORM_FLOATS = 6;
const RESERVED_DETAIL_ATTRIBUTES = new Set([
  "DETAIL_POSITION_ROTATION",
  "DETAIL_SCALE",
  "DETAIL_SURFACE_WEIGHTS",
  "DETAIL_TERRAIN_NORMAL"
]);

/** Standard Scene configuration for canonical exact Detail placements. */
export interface TerrainProjectDetailRuntimeConfig {
  /** Scene-owned world-index and progressive Region runtime. */
  worldRuntime: TerrainProjectWorldRuntime;
  /** Scene-owned camera used for frame-accurate Detail submission diagnostics. */
  camera: Camera;
  /** Stable Region ids loaded and instantiated when the Scene first runs. */
  initialActiveRegionIds: string[];
  /** Renderer-owned world-space cell size used to make exact Detail placements independently cullable. */
  cellSize: number;
  /** Renderer-owned maximum Detail viewing distance before the runtime LOD distance multiplier. */
  maximumDistance: number;
}

/** One renderer batch produced from an exact canonical Detail prototype. */
export interface TerrainProjectDetailBatchDiagnostics {
  /** Stable Region id that owns the batch. */
  regionId: string;
  /** Stable Detail prototype id that owns the transforms. */
  prototypeId: string;
  /** Exact renderer selector index inside the referenced Prefab metadata. */
  rendererIndex: number;
  /** Material name resolved from the referenced Prefab renderer. */
  materialName: string;
  /** Shader name resolved through the referenced Material. */
  shaderName: string;
  /** Exact number of resident canonical instances. */
  residentInstances: number;
  /** Primitive render elements planned by the active batch before camera culling. */
  plannedDraws: number;
  /** Most recent completed main-camera frame, or `null` before that camera renders the batch residency. */
  frameIndex: number | null;
  /** Resident instances actually accepted by main-camera culling in `frameIndex`. */
  visibleInstances: number | null;
  /** Resident instances rejected by main-camera culling in `frameIndex`. */
  frustumCulledInstances: number | null;
  /** Instanced primitive render elements submitted for the main camera in `frameIndex`. */
  submittedDraws: number | null;
  /** Stable identity boundary that prevents unrelated prototypes or renderers from merging. */
  batchBreakReason: "prototype-renderer-material";
}

/** Exact Detail residency currently instantiated from canonical Prefab references. */
export interface TerrainProjectDetailRuntimeDiagnostics {
  /** Stable active Region ids in caller order. */
  activeRegionIds: readonly string[];
  /** Number of canonical exact Detail instances. */
  instances: number;
  /** Number of independently cullable renderer batches. */
  batches: readonly TerrainProjectDetailBatchDiagnostics[];
}

interface TerrainProjectDetailBatchRuntime {
  readonly regionId: string;
  readonly prototypeId: string;
  readonly rendererIndex: number;
  readonly renderer: TerrainDetailMeshRenderer;
  readonly resources: TerrainDetailInstancedMesh;
  readonly residentInstances: number;
  readonly worldCenter: Vector3;
  readonly cullingRadius: number;
  frameIndex: number | null;
  visibleInstances: number | null;
  frustumCulledInstances: number | null;
  submittedDraws: number | null;
}

interface PendingTerrainDetailResidencyUpdate {
  readonly load: AssetPromise<TerrainProjectRegionLease>;
  readonly reject: (reason: unknown) => void;
  active: boolean;
}

interface TerrainProjectDetailRegionRuntime {
  readonly asset: TerrainProjectAsset;
  readonly root: Entity;
  readonly batches: readonly TerrainProjectDetailBatchRuntime[];
}

type TerrainDetailRenderContext = Parameters<MeshRenderer["_render"]>[0];

/**
 * Renders exact canonical Detail transforms as Prefab-bound GPU instance batches.
 * Canonical density remains renderer-agnostic; this adapter requires exact placements and an explicitly capable
 * Prefab renderer instead of reconstructing source-specific placement rules at runtime.
 */
export class TerrainProjectDetailRuntime extends Script {
  private _config: TerrainProjectDetailRuntimeConfig | null = null;
  private _worldRuntime: TerrainProjectWorldRuntime | null = null;
  private _camera: Camera | null = null;
  private _cameraProbe: TerrainDetailCameraProbe | null = null;
  private _initialLoad: AssetPromise<TerrainProjectRegionLease> | null = null;
  private _activeLease: TerrainProjectRegionLease | null = null;
  private _residencyRevision = 0;
  private readonly _pendingResidencyUpdates = new Set<PendingTerrainDetailResidencyUpdate>();
  private _residencyRoot: Entity | null = null;
  private _regionResidencies = new Map<string, TerrainProjectDetailRegionRuntime>();
  private _activeRegionIds: readonly string[] = [];
  private _distanceScale = 1;
  private _resolveReady!: (diagnostics: TerrainProjectDetailRuntimeDiagnostics) => void;
  private _rejectReady!: (reason: unknown) => void;
  private readonly _readyTask = new AssetPromise<TerrainProjectDetailRuntimeDiagnostics>((resolve, reject) => {
    this._resolveReady = resolve;
    this._rejectReady = reject!;
  });

  /**
   * Stores serialized Scene references without starting resource work during deserialization.
   * @param config World runtime and initial active Region ids.
   * @returns Nothing.
   * @throws If the serialized references or Region ids are invalid.
   */
  initialize(config: TerrainProjectDetailRuntimeConfig): void {
    if (!config || typeof config !== "object") throw new Error("Terrain Detail runtime configuration is required");
    if (!(config.worldRuntime instanceof TerrainProjectWorldRuntime) || !(config.camera instanceof Camera)) {
      throw new Error("Terrain Detail runtime requires serialized world-runtime and camera component references");
    }
    validateRegionIds(config.initialActiveRegionIds);
    requirePositiveFinite(config.cellSize, "Terrain Detail cell size");
    requirePositiveFinite(config.maximumDistance, "Terrain Detail maximum distance");
    this._config = {
      worldRuntime: config.worldRuntime,
      camera: config.camera,
      initialActiveRegionIds: [...config.initialActiveRegionIds],
      cellSize: config.cellSize,
      maximumDistance: config.maximumDistance
    };
  }

  /**
   * Applies the demo's shared runtime distance multiplier to Detail culling.
   * @param distanceScale Positive distance multiplier.
   * @returns Nothing.
   * @throws If the multiplier is not finite and positive.
   */
  setDistanceScale(distanceScale: number): void {
    requirePositiveFinite(distanceScale, "Terrain Detail distance scale");
    this._distanceScale = distanceScale;
    this._updateBatchVisibility();
  }

  /**
   * Returns an independently cancellable observer of Scene-owned Detail startup.
   * @returns Task resolving to the exact instance and batch diagnostics.
   */
  waitUntilReady(): AssetPromise<TerrainProjectDetailRuntimeDiagnostics> {
    return this._readyTask.then((diagnostics) => diagnostics);
  }

  /**
   * Returns a detached snapshot of current Detail residency and current-frame batch culling.
   * @returns Stable Region ids plus exact instance, draw, and culling counts.
   */
  getDiagnostics(): TerrainProjectDetailRuntimeDiagnostics {
    const batches = [...this._regionResidencies.values()].flatMap((region) =>
      region.batches.map((batch) => batchDiagnostics(batch))
    );
    return {
      activeRegionIds: [...this._activeRegionIds],
      instances: batches.reduce((sum, batch) => sum + batch.residentInstances, 0),
      batches
    };
  }

  /**
   * Loads a Region set and atomically replaces its exact Detail batches, superseding unfinished earlier requests.
   * Before readiness settles, cancellation leaves it pending for a later residency request.
   * @param activeRegionIds Stable world Region ids selected by the caller's residency policy.
   * @returns Cancellable task resolving to exact instance and batch diagnostics.
   * @throws If Region ids are invalid or the runtime has not started.
   */
  loadAndSetActiveRegions(activeRegionIds: readonly string[]): AssetPromise<TerrainProjectDetailRuntimeDiagnostics> {
    validateRegionIds(activeRegionIds);
    const runtime = this._requireWorldRuntime();
    const regionIds = [...activeRegionIds];
    const revision = ++this._residencyRevision;
    this._cancelInitialLoad();
    this._supersedePendingResidencyUpdates(
      new Error("Terrain Detail residency update was superseded by a newer request")
    );
    return new AssetPromise((resolve, reject, setComplete, setDetail, onCancel) => {
      const load = runtime.acquireRegions(regionIds);
      const update: PendingTerrainDetailResidencyUpdate = { load, reject: reject!, active: true };
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
            const error = new Error("Terrain Detail runtime was destroyed during a residency update");
            this._rejectReady(error);
            reject!(error);
            return;
          }
          if (revision !== this._residencyRevision) {
            lease.release();
            reject!(new Error("Terrain Detail residency update was superseded by a newer request"));
            return;
          }
          try {
            const diagnostics = this._replaceActiveRegions(runtime, regionIds);
            this._replaceActiveLease(lease);
            this._resolveReady(diagnostics);
            resolve(diagnostics);
          } catch (error) {
            lease.release();
            this._rejectReady(error);
            reject!(error);
          }
        },
        (error) => {
          if (!this._settleResidencyUpdate(update)) return;
          this._rejectReady(error);
          reject!(error);
        }
      );
    });
  }

  /**
   * Atomically instantiates an already-loaded Region set.
   * @param activeRegionIds Stable loaded Region ids selected by the caller's residency policy.
   * @returns Exact instance and batch diagnostics.
   * @throws If a Region is unloaded or its Detail representation exceeds this adapter's capabilities.
   */
  setActiveRegions(activeRegionIds: readonly string[]): TerrainProjectDetailRuntimeDiagnostics {
    validateRegionIds(activeRegionIds);
    ++this._residencyRevision;
    this._cancelInitialLoad();
    this._supersedePendingResidencyUpdates(
      new Error("Terrain Detail residency update was superseded by a synchronous request")
    );
    const runtime = this._requireWorldRuntime();
    const lease = runtime.retainLoadedRegions(activeRegionIds);
    try {
      const diagnostics = this._replaceActiveRegions(runtime, activeRegionIds);
      this._replaceActiveLease(lease);
      this._resolveReady(diagnostics);
      return diagnostics;
    } catch (error) {
      lease.release();
      this._rejectReady(error);
      throw error;
    }
  }

  /**
   * Replaces one active Region with an already assembled unpublished asset for interactive editor preview.
   * @param asset Working Region asset sharing the standard loader-resolved Prefab and Material dependencies.
   * @returns Exact instance and batch diagnostics for the updated active set.
   * @throws If the Region is not active or another active Region is no longer loaded.
   */
  previewRegionAsset(asset: TerrainProjectAsset): TerrainProjectDetailRuntimeDiagnostics {
    const regionId = asset.document.descriptor.id;
    if (!this._activeRegionIds.includes(regionId)) {
      throw new Error(`Terrain Detail preview Region "${regionId}" is not active`);
    }
    const loaded = new Map(
      this._requireWorldRuntime()
        .getAssets()
        .map((candidate) => [candidate.document.descriptor.id, candidate])
    );
    const assets = this._activeRegionIds.map((id) => {
      if (id === regionId) return asset;
      const candidate = loaded.get(id);
      if (!candidate) throw new Error(`Terrain Detail active Region "${id}" is not loaded`);
      return candidate;
    });
    return this._replaceActiveAssets(assets, this._activeRegionIds);
  }

  override onStart(): void {
    try {
      const config = this._config;
      if (!config) throw new Error("Terrain Detail runtime was not initialized by its Scene");
      if (config.worldRuntime.scene !== this.scene || config.camera.scene !== this.scene) {
        throw new Error("Terrain Detail runtime dependencies must belong to the same Scene");
      }
      this._worldRuntime = config.worldRuntime;
      this._camera = config.camera;
      const cameraProbe = config.camera.entity.addComponent(TerrainDetailCameraProbe);
      cameraProbe.completeFrame = (camera) => this._completeCameraFrame(camera);
      this._cameraProbe = cameraProbe;
      const revision = ++this._residencyRevision;
      const load = config.worldRuntime.acquireRegions(config.initialActiveRegionIds);
      this._initialLoad = load;
      load.then(
        (lease) => {
          if (this._initialLoad !== load) {
            lease.release();
            return;
          }
          this._initialLoad = null;
          try {
            if (this.destroyed || this.pendingDestroy) {
              throw new Error("Terrain Detail runtime was destroyed during startup");
            }
            if (revision !== this._residencyRevision) {
              lease.release();
              return;
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
          if (this._initialLoad !== load) return;
          this._initialLoad = null;
          this._rejectReady(error);
        }
      );
    } catch (error) {
      this._rejectReady(error);
    }
  }

  override onUpdate(): void {
    this._updateBatchVisibility();
  }

  override onDestroy(): void {
    const destroyedError = new Error("Terrain Detail runtime was destroyed before its work completed");
    ++this._residencyRevision;
    this._rejectReady(destroyedError);
    this._cancelInitialLoad();
    this._supersedePendingResidencyUpdates(destroyedError);
    if (this._cameraProbe) {
      this._cameraProbe.completeFrame = null;
      this._cameraProbe.destroy();
      this._cameraProbe = null;
    }
    for (const region of this._regionResidencies.values()) disposeRegion(region);
    this._regionResidencies.clear();
    this._residencyRoot?.destroy();
    this._residencyRoot = null;
    this._activeRegionIds = [];
    this._activeLease?.release();
    this._activeLease = null;
    this._worldRuntime = null;
    this._camera = null;
    this._config = null;
  }

  private _replaceActiveRegions(
    runtime: TerrainProjectWorldRuntime,
    activeRegionIds: readonly string[]
  ): TerrainProjectDetailRuntimeDiagnostics {
    const assetsById = new Map(runtime.getAssets().map((asset) => [asset.document.descriptor.id, asset]));
    const assets = activeRegionIds.map((id) => {
      const asset = assetsById.get(id);
      if (!asset) throw new Error(`Terrain Detail active Region "${id}" is not loaded`);
      return asset;
    });
    return this._replaceActiveAssets(assets, activeRegionIds);
  }

  private _replaceActiveAssets(
    assets: readonly TerrainProjectAsset[],
    activeRegionIds: readonly string[]
  ): TerrainProjectDetailRuntimeDiagnostics {
    const createdResidencyRoot = this._residencyRoot === null;
    const residencyRoot = this._residencyRoot ?? this.entity.createChild("Terrain Project Detail residency");
    const createdRegions = new Map<string, TerrainProjectDetailRegionRuntime>();
    try {
      for (const asset of assets) {
        const regionId = asset.document.descriptor.id;
        const current = this._regionResidencies.get(regionId);
        if (current?.asset !== asset) {
          const config = this._config;
          if (!config) throw new Error("Terrain Detail runtime was not initialized by its Scene");
          createdRegions.set(regionId, instantiateRegion(residencyRoot, asset, this._requireCamera(), config.cellSize));
        }
      }
      const nextRegions = new Map<string, TerrainProjectDetailRegionRuntime>();
      for (const asset of assets) {
        const regionId = asset.document.descriptor.id;
        const current = this._regionResidencies.get(regionId);
        nextRegions.set(regionId, current?.asset === asset ? current : createdRegions.get(regionId)!);
      }
      const retiredRegions = [...this._regionResidencies].flatMap(([regionId, region]) =>
        nextRegions.get(regionId) !== region ? [region] : []
      );
      for (const region of retiredRegions) region.root.isActive = false;
      for (const region of createdRegions.values()) region.root.isActive = true;
      this._residencyRoot = residencyRoot;
      this._regionResidencies = nextRegions;
      this._activeRegionIds = [...activeRegionIds];
      this._updateBatchVisibility();
      const diagnostics = this.getDiagnostics();
      for (const region of retiredRegions) disposeRegion(region);
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

  private _completeCameraFrame(camera: Camera): void {
    if (camera !== this._camera) return;
    const frameIndex = this.engine.time.frameCount;
    for (const region of this._regionResidencies.values()) {
      for (const batch of region.batches) {
        const submitted = batch.renderer.mainCameraRenderFrame === frameIndex;
        batch.frameIndex = frameIndex;
        batch.visibleInstances = submitted ? batch.residentInstances : 0;
        batch.frustumCulledInstances = submitted ? 0 : batch.residentInstances;
        batch.submittedDraws = submitted ? batch.renderer.mainCameraSubmittedDraws : 0;
      }
    }
  }

  private _updateBatchVisibility(): void {
    const camera = this._camera;
    const maximumDistance = this._config?.maximumDistance;
    if (!camera || maximumDistance === undefined) return;
    const cameraPosition = camera.entity.transform.worldPosition;
    const scaledDistance = maximumDistance * this._distanceScale;
    for (const region of this._regionResidencies.values()) {
      for (const batch of region.batches) {
        const visibleDistance = scaledDistance + batch.cullingRadius;
        batch.renderer.entity.isActive =
          Vector3.distanceSquared(cameraPosition, batch.worldCenter) <= visibleDistance * visibleDistance;
      }
    }
  }

  private _cancelInitialLoad(): void {
    const initialLoad = this._initialLoad;
    this._initialLoad = null;
    initialLoad?.cancel();
  }

  private _supersedePendingResidencyUpdates(error: Error): void {
    for (const update of [...this._pendingResidencyUpdates]) {
      if (!this._settleResidencyUpdate(update)) continue;
      update.reject(error);
      update.load.cancel();
    }
  }

  private _settleResidencyUpdate(update: PendingTerrainDetailResidencyUpdate): boolean {
    if (!update.active) return false;
    update.active = false;
    this._pendingResidencyUpdates.delete(update);
    return true;
  }

  private _requireWorldRuntime(): TerrainProjectWorldRuntime {
    if (!this._worldRuntime) throw new Error("Terrain Detail runtime has not started");
    return this._worldRuntime;
  }

  private _requireCamera(): Camera {
    if (!this._camera) throw new Error("Terrain Detail runtime has not started");
    return this._camera;
  }
}

function instantiateRegion(
  parent: Entity,
  asset: TerrainProjectAsset,
  camera: Camera,
  cellSize: number
): TerrainProjectDetailRegionRuntime {
  const { descriptor, manifest, detailTransforms } = asset.document;
  const root = parent.createChild(descriptor.id);
  root.isActive = false;
  root.transform.setPosition(...descriptor.worldPosition);
  const batches: TerrainProjectDetailBatchRuntime[] = [];
  try {
    for (const prototype of manifest.detailPrototypes) {
      if (prototype.maximumSourceCount === 0) continue;
      if (!prototype.useInstancing || !prototype.usePrototypeMesh || !prototype.prefab) {
        throw new Error(
          `Detail prototype "${prototype.id}" requires an unsupported non-instanced or texture representation`
        );
      }
      const transforms = detailTransforms.get(prototype.id);
      if (!transforms || transforms.count !== prototype.maximumSourceCount) {
        throw new Error(`Detail prototype "${prototype.id}" requires exact transforms for every source instance`);
      }
      const geometry = asset.prototypeGeometries.get(prototype.id);
      if (!geometry) throw new Error(`Detail prototype "${prototype.id}" did not resolve its exact canonical Prefab`);
      const renderers =
        geometry.kind === "renderers"
          ? geometry.renderers
          : geometry.lodGroup.lods[0]?.renderers.map((binding) => ({ ...binding, detailInstancing: true }));
      if (!renderers?.length) throw new Error(`Detail prototype "${prototype.id}" resolved no renderable geometry`);
      const cells = partitionDetailTransforms(transforms.values, cellSize);
      renderers.forEach((binding, rendererIndex) => {
        for (const cell of cells) {
          batches.push(
            instantiateBatch(
              root,
              descriptor.id,
              prototype.id,
              rendererIndex,
              cell.id,
              binding,
              cell.transforms,
              descriptor.worldPosition,
              camera
            )
          );
        }
      });
    }
    return { asset, root, batches };
  } catch (error) {
    for (const batch of batches) disposeBatch(batch);
    root.destroy();
    throw error;
  }
}

function instantiateBatch(
  parent: Entity,
  regionId: string,
  prototypeId: string,
  rendererIndex: number,
  cellId: string,
  binding: TerrainProjectResolvedRenderer,
  transforms: Float32Array,
  regionWorldPosition: readonly [number, number, number],
  camera: Camera
): TerrainProjectDetailBatchRuntime {
  if (!binding.detailInstancing) {
    throw new Error(`Detail prototype "${prototypeId}" renderer does not declare exact Detail instancing`);
  }
  if (binding.mesh.blendShapeCount !== 0) {
    throw new Error(`Detail prototype "${prototypeId}" renderer cannot use blend shapes`);
  }
  if (
    binding.mesh.subMeshes.length !== 1 ||
    binding.mesh.subMeshes[0].count <= 0 ||
    binding.mesh.vertexElements.some((element) => RESERVED_DETAIL_ATTRIBUTES.has(element.attribute))
  ) {
    throw new Error(`Detail prototype "${prototypeId}" renderer must resolve exactly one mesh primitive`);
  }
  const entity = parent.createChild(`${prototypeId}:${rendererIndex}:${cellId}`);
  const renderer = entity.addComponent(TerrainDetailMeshRenderer);
  renderer.diagnosticsCamera = camera;
  let resources: TerrainDetailInstancedMesh | null = null;
  try {
    const bounds = detailBatchBounds(binding, transforms);
    resources = createTerrainDetailInstancedMesh(
      parent.engine,
      binding.mesh,
      transforms,
      bounds,
      `${regionId}:${prototypeId}:${rendererIndex}:${cellId}`
    );
    renderer.mesh = resources.mesh;
    renderer.setMaterial(binding.material);
    renderer.castShadows = binding.castShadows;
    renderer.receiveShadows = binding.receiveShadows;
    renderer.enableVertexColor = binding.enableVertexColor;
    renderer.shaderData.enableMacro(DETAIL_INSTANCE_MACRO);
    renderer.shaderData.setMatrix(DETAIL_LOCAL_MATRIX, binding.localMatrix);
    renderer.shaderData.setMatrix(DETAIL_LOCAL_NORMAL_MATRIX, binding.localNormalMatrix);
    const worldCenter = bounds.getCenter(new Vector3());
    worldCenter.x += regionWorldPosition[0];
    worldCenter.y += regionWorldPosition[1];
    worldCenter.z += regionWorldPosition[2];
    const extent = bounds.getExtent(new Vector3());
    return {
      regionId,
      prototypeId,
      rendererIndex,
      renderer,
      resources,
      residentInstances: transforms.length / DETAIL_TRANSFORM_FLOATS,
      worldCenter,
      cullingRadius: extent.length(),
      frameIndex: null,
      visibleInstances: null,
      frustumCulledInstances: null,
      submittedDraws: null
    };
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

interface TerrainDetailTransformCell {
  readonly id: string;
  readonly transforms: Float32Array;
}

function partitionDetailTransforms(transforms: Float32Array, cellSize: number): TerrainDetailTransformCell[] {
  const cells = new Map<string, { x: number; z: number; values: number[] }>();
  for (let offset = 0; offset < transforms.length; offset += DETAIL_TRANSFORM_FLOATS) {
    const cellX = Math.floor(transforms[offset] / cellSize);
    const cellZ = Math.floor(transforms[offset + 2] / cellSize);
    const id = `${cellX}:${cellZ}`;
    let cell = cells.get(id);
    if (!cell) {
      cell = { x: cellX, z: cellZ, values: [] };
      cells.set(id, cell);
    }
    for (let index = 0; index < DETAIL_TRANSFORM_FLOATS; index++) cell.values.push(transforms[offset + index]);
  }
  return [...cells.entries()]
    .sort(([, first], [, second]) => first.x - second.x || first.z - second.z)
    .map(([id, cell]) => ({ id, transforms: new Float32Array(cell.values) }));
}

function detailBatchBounds(binding: TerrainProjectResolvedRenderer, transforms: Float32Array): BoundingBox {
  const prefabBounds = binding.mesh.bounds.clone().transform(binding.localMatrix);
  const corners = prefabBounds.getCorners();
  let sourceRadius = 0;
  for (const corner of corners) sourceRadius = Math.max(sourceRadius, corner.length());
  const bounds = new BoundingBox(
    new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
  );
  for (let offset = 0; offset < transforms.length; offset += DETAIL_TRANSFORM_FLOATS) {
    const x = transforms[offset];
    const y = transforms[offset + 1];
    const z = transforms[offset + 2];
    const radius = sourceRadius * Math.max(transforms[offset + 4], transforms[offset + 5]);
    bounds.min.x = Math.min(bounds.min.x, x - radius);
    bounds.min.y = Math.min(bounds.min.y, y - radius);
    bounds.min.z = Math.min(bounds.min.z, z - radius);
    bounds.max.x = Math.max(bounds.max.x, x + radius);
    bounds.max.y = Math.max(bounds.max.y, y + radius);
    bounds.max.z = Math.max(bounds.max.z, z + radius);
  }
  return bounds;
}

class TerrainDetailMeshRenderer extends MeshRenderer {
  diagnosticsCamera: Camera | null = null;
  mainCameraRenderFrame = -1;
  mainCameraSubmittedDraws = 0;

  protected override _render(context: TerrainDetailRenderContext): void {
    super._render(context);
    const camera = this.diagnosticsCamera;
    // Shadow cascades retain the source Camera but replace its virtual camera.
    if (!camera || context.camera !== camera || context.virtualCamera.viewMatrix !== camera.viewMatrix) return;
    this.mainCameraRenderFrame = this.engine.time.frameCount;
    // instantiateBatch rejects every shape except one non-empty primitive with one bound material.
    this.mainCameraSubmittedDraws = 1;
  }
}

class TerrainDetailCameraProbe extends Script {
  completeFrame: ((camera: Camera) => void) | null = null;

  override onEndRender(camera: Camera): void {
    this.completeFrame?.(camera);
  }
}

function batchDiagnostics(batch: TerrainProjectDetailBatchRuntime): TerrainProjectDetailBatchDiagnostics {
  return {
    regionId: batch.regionId,
    prototypeId: batch.prototypeId,
    rendererIndex: batch.rendererIndex,
    materialName: batch.renderer.getMaterials()[0]?.name ?? "",
    shaderName: batch.renderer.getMaterials()[0]?.shader.name ?? "",
    residentInstances: batch.residentInstances,
    plannedDraws: batch.resources.mesh.subMeshes.length,
    frameIndex: batch.frameIndex,
    visibleInstances: batch.visibleInstances,
    frustumCulledInstances: batch.frustumCulledInstances,
    submittedDraws: batch.submittedDraws,
    batchBreakReason: "prototype-renderer-material"
  };
}

function disposeRegion(region: TerrainProjectDetailRegionRuntime): void {
  for (const batch of region.batches) disposeBatch(batch);
  region.root.destroy();
}

function disposeBatch(batch: TerrainProjectDetailBatchRuntime): void {
  batch.renderer.enabled = false;
  batch.renderer.mesh = null!;
  batch.renderer.setMaterials([]);
  batch.renderer.entity.destroy();
  batch.resources.mesh.destroy();
  batch.resources.instanceBuffer.destroy();
  batch.resources.indexBuffer?.destroy();
}

function validateRegionIds(ids: readonly string[]): void {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id.length)) {
    throw new Error("Terrain Detail active Region ids must be nonempty strings");
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("Terrain Detail active Region selection contains duplicate ids");
  }
}

function requirePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive`);
}
