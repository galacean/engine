import type { TerrainRegionUpdate, PreparedTerrainUpdate } from "./TerrainPreparedUpdate";
import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Camera,
  Engine,
  Entity,
  IndexFormat,
  Material,
  MeshTopology,
  Script,
  Vector3,
  Texture2D,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import { TerrainRenderer } from "../TerrainRenderer";
import {
  createTerrainClipmapMaterialBinding,
  type TerrainAlphamapAtlasPatch,
  type TerrainFarMaterialOptions,
  type TerrainClipmapRenderBinding,
  type TerrainHeightAtlasPatch,
  type TerrainHeightAtlasFrame,
  type TerrainHeightGpuSamplingSource,
  type TerrainMacroVariationOptions
} from "./TerrainClipmapMaterial";
import type { TerrainLayerResidencyRegionSource } from "./TerrainLayerResidency";
import type { TerrainLayerDiffuseColorPatch } from "./TerrainClipmapMaterial";
import type { TerrainClipmapRegionSource } from "./TerrainClipmapSource";
import type { TerrainPuddleHydrologyField, TerrainPuddleHydrologyOptions } from "./TerrainPuddleHydrology";

const TILE = 0;
const EDGE_A = 1;
const EDGE_B = 2;
const FILL_A = 3;
const FILL_B = 4;

type Offset = readonly [x: number, z: number];

/** Height-grid capability required by Geometry Clipmap topology. */
export interface TerrainClipmapHeightGrid {
  /** Uniform world-space distance between adjacent height samples. */
  readonly vertexSpacing: number;
  /** Conservative minimum displaced world height. */
  readonly minHeight: number;
  /** Conservative maximum displaced world height. */
  readonly maxHeight: number;
}

/** Complete renderer residency descriptor consumed by Geometry Clipmap. */
export interface TerrainClipmapDescriptor extends TerrainClipmapHeightGrid {
  /** Explicit active lossless Region sources selected for this renderer instance. */
  readonly sources: readonly TerrainClipmapRegionSource[];
}

interface Segment {
  readonly entity: Entity;
  readonly wireEntity: Entity;
  readonly renderer: TerrainRenderer;
  readonly wireRenderer: TerrainRenderer;
  readonly mesh: BufferMesh;
  readonly wireMesh: BufferMesh;
  readonly lod: number;
  readonly group: number;
  readonly instance: number;
  readonly scale: number;
}

/** Read-only placement used by deterministic clipmap diagnostics. */
export interface TerrainClipmapSegmentSnapshot {
  readonly lod: number;
  readonly group: "tile" | "edge-a" | "edge-b" | "fill-a" | "fill-b";
  readonly instance: number;
  readonly position: readonly [x: number, z: number];
  readonly scale: number;
}

/** Exact forward-pass geometry submitted when every Clipmap segment is visible. */
export interface TerrainClipmapGeometrySnapshot {
  /** Quad count along one reusable square tile edge. */
  readonly meshSize: number;
  /** Number of simultaneously active Clipmap rings. */
  readonly lodCount: number;
  /** Number of independently culled forward renderers. */
  readonly segmentCount: number;
  /** Vertex shader invocations before GPU post-transform caching. */
  readonly fullTopologyVertices: number;
  /** Triangles across the complete active Clipmap topology. */
  readonly fullTopologyTriangles: number;
}

/** Exact terrain geometry-clipmap segment topology and camera snapping. */
export class TerrainClipmap {
  /** Total forward-rendered segment count across all active Clipmap rings. */
  readonly segmentCount: number;
  /** Exact complete-ring geometry used for renderer comparisons. */
  readonly geometry: TerrainClipmapGeometrySnapshot;

  /** Surface carriers only; diagnostic wire overlays are not editable terrain. */
  visitRenderers(visitor: (renderer: TerrainRenderer) => void): void {
    for (const segment of this._segments) {
      if (segment.renderer.enabled && segment.entity.isActiveInHierarchy) visitor(segment.renderer);
    }
  }

  private readonly _segments: Segment[] = [];
  private readonly _vertexSpacing: number;
  private readonly _gridOrigin: readonly [x: number, z: number];
  private readonly _offsets: ClipmapOffsets;
  private readonly _snapState: Float64Array;
  private readonly _snapChangedLods: Uint8Array;
  private _puddleHydrologyOptions: Readonly<TerrainPuddleHydrologyOptions>;
  private _macroVariationOptions: Readonly<TerrainMacroVariationOptions> | undefined;
  private _macroVariationEnabled: boolean;
  private readonly _farMaterialOptions: Readonly<TerrainFarMaterialOptions> | undefined;
  private _layerDetilingMask = 0;
  private _materialBinding: TerrainClipmapRenderBinding;
  private _resourceOwner: TerrainClipmapResourceOwner;
  private _follower: TerrainClipmapFollower;
  private _resourceEntity: Entity;
  private _snapStateValid = false;
  private _destroyed = false;
  private _heightFrameBounds?: ReadonlyMap<BufferMesh, readonly [number, number]>;
  private readonly _heightFrameRegions = new Set<string>();

  /** @returns Region count in this renderer instance's current residency set. */
  get activeRegionCount(): number {
    return this._materialBinding.activeRegionCount;
  }

  /** @returns Derived height-atlas dimensions for renderer diagnostics. */
  get heightAtlasSize(): readonly [width: number, height: number] {
    return this._materialBinding.heightAtlasSize;
  }

  /** @returns Current shared GPU height residency for terrain-aware environment passes. */
  get heightSamplingSource(): TerrainHeightGpuSamplingSource {
    const source = this._materialBinding.heightSamplingSource;
    if (!source) throw new Error("The active Terrain Clipmap binding does not expose GPU height sampling");
    return source;
  }

  /** @returns Derived holes-atlas dimensions for renderer diagnostics. */
  get holesAtlasSize(): readonly [width: number, height: number] {
    return this._materialBinding.holesAtlasSize;
  }

  /** @returns Resolved TerrainLayer count in this renderer instance's current residency set. */
  get activeLayerCount(): number {
    return this._materialBinding.activeLayerCount;
  }

  /** @returns Canonical alphamap count in this renderer instance's current residency set. */
  get activeAlphamapCount(): number {
    return this._materialBinding.activeAlphamapCount;
  }

  /** @returns Shared runtime Material used by every active Clipmap segment. */
  get material(): Material {
    return this._materialBinding.material;
  }

  /** @returns Near and optional far Materials sharing the current renderer residency. */
  get renderMaterials(): readonly Material[] {
    const farMaterial = this._materialBinding.farMaterial;
    return farMaterial ? [this._materialBinding.material, farMaterial] : [this._materialBinding.material];
  }

  /** @returns Current static cross-Region shallow-water drainage field. */
  get puddleHydrology(): TerrainPuddleHydrologyField | undefined {
    return this._materialBinding.puddleHydrology;
  }

  /**
   * Builds all terrain clipmap rings once and starts tracking a camera.
   * @param engine Engine used to allocate shared meshes.
   * @param root Identity-transform entity receiving the clipmap segments.
   * @param camera Camera whose world XZ position controls snapping.
   * @param heightGrid Renderer capability values derived from canonical height sources.
   * @param material Shared terrain material.
   * @param meshSize terrain mesh size in quads.
   * @param meshLods Number of simultaneously active clipmap rings.
   * @param layerSources Optional resolved canonical alphamaps and layer Textures for this active set.
   * @param puddleHydrologyOptions Optional shallow-water drainage and coverage tuning.
   * @param macroVariationOptions Optional renderer-only world-space colour variation.
   * @param farMaterialOptions Optional compile-time simplified Material for distant rings.
   * @throws If topology, Region sources, or GPU residency are invalid.
   */
  constructor(
    engine: Engine,
    root: Entity,
    camera: Camera,
    heightGrid: TerrainClipmapDescriptor,
    material: Material,
    meshSize: number,
    meshLods: number,
    layerSources?: readonly TerrainLayerResidencyRegionSource<Texture2D>[],
    puddleHydrologyOptions?: Readonly<TerrainPuddleHydrologyOptions>,
    macroVariationOptions?: Readonly<TerrainMacroVariationOptions>,
    farMaterialOptions?: Readonly<TerrainFarMaterialOptions>
  );

  /**
   * Builds Clipmap topology around a renderer-owned analytic or procedural binding.
   * @param engine Engine used to allocate shared meshes.
   * @param root Identity-transform entity receiving the Clipmap segments.
   * @param camera Camera whose world XZ position controls snapping.
   * @param heightGrid Uniform lattice spacing and conservative vertical bounds.
   * @param renderBinding Renderer-owned material, lattice origin, and diagnostics.
   * @param meshSize Even quad count used by each reusable segment.
   * @param meshLods Number of simultaneously submitted Clipmap rings.
   * @throws If topology, height bounds, or binding diagnostics are invalid.
   */
  constructor(
    engine: Engine,
    root: Entity,
    camera: Camera,
    heightGrid: TerrainClipmapHeightGrid,
    renderBinding: TerrainClipmapRenderBinding,
    meshSize: number,
    meshLods: number
  );

  constructor(
    engine: Engine,
    root: Entity,
    camera: Camera,
    heightGrid: TerrainClipmapHeightGrid | TerrainClipmapDescriptor,
    materialOrBinding: Material | TerrainClipmapRenderBinding,
    meshSize: number,
    meshLods: number,
    layerSources?: readonly TerrainLayerResidencyRegionSource<Texture2D>[],
    puddleHydrologyOptions: Readonly<TerrainPuddleHydrologyOptions> = {},
    macroVariationOptions?: Readonly<TerrainMacroVariationOptions>,
    farMaterialOptions?: Readonly<TerrainFarMaterialOptions>
  ) {
    const projectMaterial = materialOrBinding instanceof Material ? materialOrBinding : null;
    validateClipmapConstruction(meshSize, meshLods, heightGrid, projectMaterial !== null);
    if (farMaterialOptions && farMaterialOptions.firstLod >= meshLods) {
      throw new RangeError("Terrain far Material must begin at an existing Clipmap LOD");
    }
    this._vertexSpacing = heightGrid.vertexSpacing;
    this._offsets = createOffsets(meshSize);
    this._snapState = new Float64Array(meshLods * 4);
    this._snapChangedLods = new Uint8Array(meshLods);
    this._puddleHydrologyOptions = { ...puddleHydrologyOptions };
    this._macroVariationOptions = macroVariationOptions;
    this._macroVariationEnabled = macroVariationOptions !== undefined;
    this._farMaterialOptions = farMaterialOptions;

    const materialBinding: TerrainClipmapRenderBinding = projectMaterial
      ? createTerrainClipmapMaterialBinding(
          engine,
          projectMaterial,
          (heightGrid as TerrainClipmapDescriptor).sources,
          layerSources,
          undefined,
          this._puddleHydrologyOptions,
          this._macroVariationOptions,
          this._farMaterialOptions
        )
      : (materialOrBinding as TerrainClipmapRenderBinding);
    this._gridOrigin = materialBinding.gridOrigin;
    let follower: TerrainClipmapFollower | undefined;
    let resources: Entity | undefined;
    try {
      const meshes = createMeshTypes(engine, meshSize, heightGrid.minHeight, heightGrid.maxHeight);
      for (let lod = 0; lod < meshLods; lod++) {
        const lodMaterial = materialForClipmapLod(materialBinding, lod);
        this._createGroup(
          root,
          lodMaterial,
          lod,
          TILE,
          lod === 0 ? meshes.standardTile : meshes.tile,
          lod === 0 ? meshes.standardTileWire : meshes.tileWire,
          lod === 0 ? 16 : 12
        );
        this._createGroup(
          root,
          lodMaterial,
          lod,
          EDGE_A,
          lod === 0 ? meshes.standardEdgeA : meshes.edgeA,
          lod === 0 ? meshes.standardEdgeAWire : meshes.edgeAWire,
          2
        );
        this._createGroup(
          root,
          lodMaterial,
          lod,
          EDGE_B,
          lod === 0 ? meshes.standardEdgeB : meshes.edgeB,
          lod === 0 ? meshes.standardEdgeBWire : meshes.edgeBWire,
          2
        );
        this._createGroup(
          root,
          lodMaterial,
          lod,
          FILL_A,
          lod === 0 ? meshes.standardTrimA : meshes.fillA,
          lod === 0 ? meshes.standardTrimAWire : meshes.fillAWire,
          2
        );
        this._createGroup(
          root,
          lodMaterial,
          lod,
          FILL_B,
          lod === 0 ? meshes.standardTrimB : meshes.fillB,
          lod === 0 ? meshes.standardTrimBWire : meshes.fillBWire,
          2
        );
      }
      follower = root.addComponent(TerrainClipmapFollower);
      follower.initialize(this, camera);
      this.snap(camera.entity.transform.worldPosition);
      resources = root.createChild("terrain-render-resources");
      const resourceOwner = resources.addComponent(TerrainClipmapResourceOwner);
      resourceOwner.initialize(materialBinding);
      this._materialBinding = materialBinding;
      this._resourceOwner = resourceOwner;
      this._follower = follower;
      this._resourceEntity = resources;
    } catch (error) {
      resources?.destroy();
      follower?.destroy();
      for (const segment of this._segments) {
        segment.entity.destroy();
        segment.wireEntity.destroy();
      }
      this._segments.length = 0;
      materialBinding.destroy();
      throw error;
    }
    this.segmentCount = this._segments.length;
    this.geometry = createGeometrySnapshot(meshSize, meshLods, this.segmentCount);
  }

  /**
   * Atomically replaces active Region residency while retaining Clipmap topology and camera state.
   * @param heightGrid New loaded/active Region descriptor using the existing vertex spacing.
   * @param material Standard Project Material shared by the selected Region set.
   * @param layerSources Optional resolved canonical alphamaps and layer Textures for the selected Region set.
   * @param puddleHydrologyOptions Optional replacement shallow-water drainage and coverage tuning.
   * @param macroVariationOptions Optional replacement world-space colour variation.
   * @returns Nothing after every renderer references the new derived Material and atlases.
   * @throws If the descriptor is incompatible or new GPU residency creation fails; the old residency remains active.
   */
  updateResidency(
    heightGrid: TerrainClipmapDescriptor,
    material: Material,
    layerSources?: readonly TerrainLayerResidencyRegionSource<Texture2D>[],
    puddleHydrologyOptions: Readonly<TerrainPuddleHydrologyOptions> = this._puddleHydrologyOptions,
    macroVariationOptions: Readonly<TerrainMacroVariationOptions> | undefined = this._macroVariationOptions
  ): void {
    this._assertAlive();
    validateClipmapHeightGrid(heightGrid);
    if (!nearlyEqual(heightGrid.vertexSpacing, this._vertexSpacing)) {
      throw new Error("Geometry Clipmap residency update cannot change vertex spacing");
    }

    const nextBinding = createTerrainClipmapMaterialBinding(
      material.engine,
      material,
      heightGrid.sources,
      layerSources,
      this._gridOrigin,
      puddleHydrologyOptions,
      macroVariationOptions,
      this._farMaterialOptions
    );
    nextBinding.setMacroVariationEnabled?.(this._macroVariationEnabled);
    nextBinding.setLayerDetilingMask?.(this._layerDetilingMask);
    const previousBinding = this._materialBinding;
    const previousBounds = captureVerticalBounds(this._segments);
    const updatedRenderers: TerrainRenderer[] = [];
    try {
      for (const segment of this._segments) {
        segment.renderer.setMaterial(materialForClipmapLod(nextBinding, segment.lod));
        updatedRenderers.push(segment.renderer);
        segment.wireRenderer.setMaterial(materialForClipmapLod(nextBinding, segment.lod));
        updatedRenderers.push(segment.wireRenderer);
      }
      updateVerticalBounds(this._segments, heightGrid.minHeight, heightGrid.maxHeight);
    } catch (error) {
      for (let index = updatedRenderers.length - 1; index >= 0; index--) {
        const segment = this._segments[Math.floor(index / 2)];
        updatedRenderers[index].setMaterial(materialForClipmapLod(previousBinding, segment.lod));
      }
      restoreVerticalBounds(previousBounds);
      nextBinding.destroy();
      throw error;
    }

    this._materialBinding = nextBinding;
    this._heightFrameBounds = undefined;
    this._heightFrameRegions.clear();
    this._puddleHydrologyOptions = { ...puddleHydrologyOptions };
    this._macroVariationOptions = macroVariationOptions;
    this._resourceOwner.replace(nextBinding);
  }

  /** @returns Whether renderer-only macro variation currently participates in Terrain shading. */
  get macroVariationEnabled(): boolean {
    return this._macroVariationEnabled;
  }

  /**
   * Enables or disables renderer-only macro variation without rebuilding Terrain residency.
   * @param enabled Whether macro variation participates in Terrain shading.
   * @returns Nothing.
   */
  setMacroVariationEnabled(enabled: boolean): void {
    this._assertAlive();
    this._macroVariationEnabled = enabled && this._macroVariationOptions !== undefined;
    this._materialBinding.setMacroVariationEnabled?.(this._macroVariationEnabled);
  }

  /** @returns Logical Terrain-layer bit mask currently using one-sample detiling. */
  get layerDetilingMask(): number {
    return this._layerDetilingMask;
  }

  /**
   * Selects logical Terrain layers that use one randomized rotated sample instead of four-neighbour blending.
   * @param layerMask Bit `n` enables detiling for resolved logical layer `n`.
   * @returns Nothing.
   * @throws If the Clipmap is destroyed or the mask is outside the non-negative 31-bit range.
   */
  setLayerDetilingMask(layerMask: number): void {
    this._assertAlive();
    if (!Number.isInteger(layerMask) || layerMask < 0 || layerMask > 0x7fff_ffff) {
      throw new RangeError("Terrain detiling layer mask must be a non-negative 31-bit integer");
    }
    this._layerDetilingMask = layerMask;
    this._materialBinding.setLayerDetilingMask?.(layerMask);
  }

  /** Updates resident layer colours without replacing height, alpha, texture-array or material owners. */
  setLayerDiffuseColors(patches: readonly TerrainLayerDiffuseColorPatch[]): void {
    this._assertAlive();
    if (!this._materialBinding.setLayerDiffuseColors) throw Error("Terrain binding cannot edit layer colours");
    this._materialBinding.setLayerDiffuseColors(patches);
  }

  /**
   * Prepares canonical Region values without changing accepted GPU resources or bounds.
   * @param update Complete future sources on the existing sample lattices and optional alphamaps.
   * @returns A reversible update retained until the caller finalizes its publication.
   * @throws If the Clipmap is destroyed or the binding cannot preserve the existing residency.
   */
  prepareRegionUpdate(update: TerrainRegionUpdate): PreparedTerrainUpdate {
    this._assertAlive();
    if (!this._materialBinding.prepareRegionUpdate) throw Error("Terrain binding does not support prepared regions");
    const prepared = this._materialBinding.prepareRegionUpdate(update);
    const bounds = captureVerticalBounds(this._segments),
      oldFrameBounds = this._heightFrameBounds;
    const oldFrameRegions = new Set(this._heightFrameRegions);
    const restore = () => {
      this._heightFrameBounds = oldFrameBounds;
      this._heightFrameRegions.clear();
      for (const id of oldFrameRegions) this._heightFrameRegions.add(id);
      restoreVerticalBounds(bounds);
    };
    let state: "prepared" | "committed" | "finished" = "prepared";
    const rollback = () => {
      if (state !== "committed") return;
      try {
        prepared.rollback();
      } finally {
        restore();
        state = "prepared";
      }
    };
    return {
      commit: () => {
        this._assertAlive();
        if (state !== "prepared") throw Error("Terrain candidate is no longer prepared");
        try {
          prepared.commit();
          state = "committed";
          this._heightFrameBounds ??= bounds;
          for (const source of update.sources) this._heightFrameRegions.add(source.id);
          this._synchronizeHeightBounds();
          // This is the new canonical baseline, including subsequent animation bounds.
          this._heightFrameBounds = undefined;
          this._heightFrameRegions.clear();
        } catch (error) {
          try {
            prepared.rollback();
          } finally {
            restore();
            state = "prepared";
          }
          throw error;
        }
      },
      rollback,
      finalize: () => {
        if (state !== "committed") throw Error("Terrain candidate is not committed");
        state = "finished";
        prepared.finalize();
      },
      discard: () => {
        if (state === "finished") return;
        try {
          rollback();
        } finally {
          state = "finished";
          prepared.discard();
        }
      }
    };
  }

  updateHeightRegion(patch: TerrainHeightAtlasPatch): void {
    this._assertAlive();
    this._materialBinding.updateHeightRegion(patch);
    this._heightFrameRegions.delete(patch.regionId);
    this._synchronizeHeightBounds();
  }

  /**
   * Uploads one transient height-animation frame while deferring normal and hydrology recompilation.
   * @param patch Active Region id, local rectangle, and compact lossless R16 samples.
   * @returns Nothing after the current height atlas is updated in place.
   * @throws If the Clipmap is destroyed or the patch does not fit an active Region.
   */
  updateHeightRegionFrame(patch: TerrainHeightAtlasFrame): void {
    this._assertAlive();
    const updateHeightRegionFrame = this._materialBinding.updateHeightRegionFrame;
    if (patch.heightDecode && !updateHeightRegionFrame)
      throw new Error("Terrain binding does not support transient height encoding");
    if (updateHeightRegionFrame) updateHeightRegionFrame.call(this._materialBinding, patch);
    else this._materialBinding.updateHeightRegion(patch);
    if (patch.heightDecode) {
      this._heightFrameBounds ??= captureVerticalBounds(this._segments);
      this._heightFrameRegions.add(patch.regionId);
    } else this._heightFrameRegions.delete(patch.regionId);
    this._synchronizeHeightBounds();
  }

  private _synchronizeHeightBounds(): void {
    if (!this._heightFrameBounds) return;
    if (!this._heightFrameRegions.size) {
      restoreVerticalBounds(this._heightFrameBounds);
      this._heightFrameBounds = undefined;
      return;
    }
    const source = this._materialBinding.heightSamplingSource;
    if (!source) return;
    let minimum = Infinity,
      maximum = -Infinity;
    for (const [low, high] of this._heightFrameBounds.values()) {
      minimum = Math.min(minimum, low);
      maximum = Math.max(maximum, high);
    }
    for (let i = 0; i < source.regionCount; i++) {
      minimum = Math.min(minimum, source.regionHeightDecode[i * 2]);
      maximum = Math.max(maximum, source.regionHeightDecode[i * 2] + source.regionHeightDecode[i * 2 + 1]);
    }
    if (source.regionCount) updateVerticalBounds(this._segments, minimum, maximum);
  }

  /**
   * Uploads multiple local height rectangles and recompiles shallow-water drainage once.
   * @param patches Active Region-local R16 rectangles.
   * @returns Nothing after current height and drainage residency are synchronized.
   */
  updateHeightRegions(patches: readonly TerrainHeightAtlasPatch[]): void {
    this._assertAlive();
    const updateHeightRegions = this._materialBinding.updateHeightRegions;
    if (updateHeightRegions) {
      updateHeightRegions.call(this._materialBinding, patches);
    } else {
      for (const patch of patches) this._materialBinding.updateHeightRegion(patch);
    }
    for (const patch of patches) this._heightFrameRegions.delete(patch.regionId);
    this._synchronizeHeightBounds();
  }

  /**
   * Uploads one local Alphamap rectangle without rebuilding height, holes, metadata, or layer texture arrays.
   * @param patch Active Region id, Alphamap index, local rectangle, and compact RGBA8 pixels.
   * @returns Nothing after the current Alphamap atlas is updated in place.
   * @throws If the Clipmap is destroyed or the patch does not fit active Alphamap residency.
   */
  updateAlphamapRegion(patch: TerrainAlphamapAtlasPatch): void {
    this._assertAlive();
    this._materialBinding.updateAlphamapRegion(patch);
  }

  /**
   * Snaps every clipmap ring to the supplied world position using terrain's per-LOD grid.
   * @param trackedPosition World-space camera/tracker position.
   * @returns Nothing.
   * @throws If the Clipmap has been destroyed.
   */
  snap(trackedPosition: Vector3): void {
    this._assertAlive();
    const snapState = this._snapState;
    const changedLods = this._snapChangedLods;
    changedLods.fill(0);
    let changed = !this._snapStateValid;
    const snappedBaseX = floorToGrid(trackedPosition.x, this._gridOrigin[0], this._vertexSpacing);
    const snappedBaseZ = floorToGrid(trackedPosition.z, this._gridOrigin[1], this._vertexSpacing);
    let snapStep = this._vertexSpacing * 2;
    for (let lod = 0; lod < changedLods.length; lod++) {
      const nextSnapStep = snapStep * 2;
      const snapX = snapToGrid(snappedBaseX, this._gridOrigin[0], snapStep);
      const snapZ = snapToGrid(snappedBaseZ, this._gridOrigin[1], snapStep);
      const nextX = snapToGrid(snappedBaseX, this._gridOrigin[0], nextSnapStep);
      const nextZ = snapToGrid(snappedBaseZ, this._gridOrigin[1], nextSnapStep);
      const testX = clamp(roundHalfAwayFromZero((snapX - nextX) / snapStep) + 1, 0, 2);
      const testZ = clamp(roundHalfAwayFromZero((snapZ - nextZ) / snapStep) + 1, 0, 2);
      const stateOffset = lod * 4;
      if (
        !this._snapStateValid ||
        snapState[stateOffset] !== snapX ||
        snapState[stateOffset + 1] !== snapZ ||
        snapState[stateOffset + 2] !== testX ||
        snapState[stateOffset + 3] !== testZ
      ) {
        changedLods[lod] = 1;
        changed = true;
      }
      snapState[stateOffset] = snapX;
      snapState[stateOffset + 1] = snapZ;
      snapState[stateOffset + 2] = testX;
      snapState[stateOffset + 3] = testZ;
      snapStep = nextSnapStep;
    }
    this._snapStateValid = true;
    if (!changed) {
      return;
    }

    const offsets = this._offsets;
    const segments = this._segments;
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
      const segment = segments[segmentIndex]!;
      const lod = segment.lod;
      if (changedLods[lod] === 0) {
        continue;
      }
      const stateOffset = lod * 4;
      const snapX = snapState[stateOffset]!;
      const snapZ = snapState[stateOffset + 1]!;
      const testX = snapState[stateOffset + 2]!;
      const testZ = snapState[stateOffset + 3]!;
      let offsetX: number;
      let offsetZ: number;
      const instance = segment.instance;
      switch (segment.group) {
        case TILE: {
          const offset = lod === 0 ? offsets.lod0Tiles[instance]! : offsets.tiles[instance]!;
          offsetX = offset[0];
          offsetZ = offset[1];
          break;
        }
        case EDGE_A:
          offsetX = offsets.edges[instance]![testX]!;
          offsetZ = -(offsets.offsetA + testZ * 2);
          break;
        case EDGE_B:
          offsetX = -offsets.offsetA;
          offsetZ = offsets.edges[instance]![testZ]!;
          break;
        case FILL_A: {
          const offset = lod === 0 ? offsets.trimA[instance]! : offsets.fillA[instance]!;
          offsetX = offset[0];
          offsetZ = offset[1];
          break;
        }
        default: {
          const offset = lod === 0 ? offsets.trimB[instance]! : offsets.fillB[instance]!;
          offsetX = offset[0];
          offsetZ = offset[1];
          break;
        }
      }
      const scale = segment.scale;
      segment.entity.transform.setScale(scale, 1, scale);
      segment.entity.transform.setPosition(offsetX * scale + snapX, 0, offsetZ * scale + snapZ);
      segment.wireEntity.transform.setScale(scale, 1, scale);
      segment.wireEntity.transform.setPosition(offsetX * scale + snapX, 0, offsetZ * scale + snapZ);
    }
  }

  /**
   * Captures current segment placement without exposing engine objects.
   * @returns Stable diagnostic snapshot ordered by LOD, segment group, and instance.
   */
  inspectSegments(): readonly TerrainClipmapSegmentSnapshot[] {
    this._assertAlive();
    return this._segments.map((segment) => {
      const position = segment.entity.transform.position;
      return {
        lod: segment.lod,
        group: GROUP_NAMES[segment.group],
        instance: segment.instance,
        position: [position.x, position.z] as const,
        scale: segment.entity.transform.scale.x
      };
    });
  }

  /**
   * Shows or hides line-topology companions that share each segment's production vertex path.
   * @param enabled Whether to render the clipmap wire overlay.
   * @returns Nothing.
   * @throws If the Clipmap has been destroyed.
   */
  setWireframe(enabled: boolean): void {
    this._assertAlive();
    for (const segment of this._segments) segment.wireEntity.isActive = enabled;
  }

  /**
   * Applies one shadow switch to every visible Clipmap caster and receiver.
   * @param enabled Whether terrain casts into and samples the active directional shadow map.
   * @returns Nothing.
   */
  setShadowsEnabled(enabled: boolean): void {
    this._assertAlive();
    for (const segment of this._segments) {
      segment.renderer.castShadows = enabled;
      segment.renderer.receiveShadows = enabled;
    }
  }

  /**
   * Releases renderer entities, camera tracking, and renderer-owned GPU residency.
   * @returns Nothing.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._follower.destroy();
    for (const segment of this._segments) {
      segment.entity.destroy();
      segment.wireEntity.destroy();
    }
    this._segments.length = 0;
    this._resourceEntity.destroy();
  }

  private _createGroup(
    root: Entity,
    material: Material,
    lod: number,
    group: number,
    mesh: BufferMesh,
    wireMesh: BufferMesh,
    count: number
  ): void {
    for (let instance = 0; instance < count; instance++) {
      const entity = root.createChild(`lod-${lod}-${GROUP_NAMES[group]}-${instance}`);
      const renderer = entity.addComponent(TerrainRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(material);
      renderer.setLod(lod, this._offsets.meshSize);
      renderer.castShadows = false;
      renderer.receiveShadows = true;
      renderer.setDebugWire(false);

      const wireEntity = root.createChild(`lod-${lod}-${GROUP_NAMES[group]}-${instance}-wire`);
      const wireRenderer = wireEntity.addComponent(TerrainRenderer);
      wireRenderer.mesh = wireMesh;
      wireRenderer.setMaterial(material);
      wireRenderer.castShadows = false;
      wireRenderer.setLod(lod, this._offsets.meshSize);
      wireRenderer.setDebugWire(true);
      wireRenderer.priority = 1;
      wireEntity.isActive = false;
      this._segments.push({
        entity,
        wireEntity,
        renderer,
        wireRenderer,
        mesh,
        wireMesh,
        lod,
        group,
        instance,
        scale: 2 ** lod * this._vertexSpacing
      });
    }
  }

  private _assertAlive(): void {
    if (this._destroyed) throw new Error("Geometry Clipmap has been destroyed");
  }
}

class TerrainClipmapResourceOwner extends Script {
  private _binding: TerrainClipmapRenderBinding | null = null;

  initialize(binding: TerrainClipmapRenderBinding): void {
    this._binding = binding;
  }

  replace(binding: TerrainClipmapRenderBinding): void {
    const previous = this._binding;
    this._binding = binding;
    previous?.destroy();
  }

  override onDestroy(): void {
    this._binding?.destroy();
    this._binding = null;
  }
}

class TerrainClipmapFollower extends Script {
  private _clipmap!: TerrainClipmap;
  private _camera!: Camera;

  initialize(clipmap: TerrainClipmap, camera: Camera): void {
    this._clipmap = clipmap;
    this._camera = camera;
  }

  override onUpdate(): void {
    this._clipmap.snap(this._camera.entity.transform.worldPosition);
  }
}

function validateClipmapConstruction(
  meshSize: number,
  meshLods: number,
  heightGrid: TerrainClipmapHeightGrid | TerrainClipmapDescriptor,
  requireProjectSources: boolean
): void {
  if (!Number.isInteger(meshSize) || meshSize < 8 || meshSize % 2 !== 0) {
    throw new Error("Geometry Clipmap mesh size must be an even integer of at least eight");
  }
  if (!Number.isInteger(meshLods) || meshLods < 1) {
    throw new Error("Geometry Clipmap requires at least one integer LOD ring");
  }
  validateClipmapHeightGrid(heightGrid);
  if (requireProjectSources && !("sources" in heightGrid && heightGrid.sources.length > 0)) {
    throw new Error("Project-backed Geometry Clipmap requires at least one active Region");
  }
}

function materialForClipmapLod(binding: TerrainClipmapRenderBinding, lod: number): Material {
  const farMaterial = binding.farMaterial;
  const firstFarLod = binding.farMaterialFirstLod;
  return farMaterial !== undefined && firstFarLod !== undefined && lod >= firstFarLod ? farMaterial : binding.material;
}

function validateClipmapHeightGrid(heightGrid: TerrainClipmapHeightGrid): void {
  if (!Number.isFinite(heightGrid.vertexSpacing) || heightGrid.vertexSpacing <= 0) {
    throw new Error("Geometry Clipmap vertex spacing must be positive and finite");
  }
  if (
    !Number.isFinite(heightGrid.minHeight) ||
    !Number.isFinite(heightGrid.maxHeight) ||
    heightGrid.minHeight > heightGrid.maxHeight
  ) {
    throw new Error("Geometry Clipmap height bounds are invalid");
  }
}

function updateVerticalBounds(segments: readonly Segment[], minHeight: number, maxHeight: number): void {
  const meshes = new Set<BufferMesh>();
  for (const segment of segments) {
    meshes.add(segment.mesh);
    meshes.add(segment.wireMesh);
  }
  for (const mesh of meshes) {
    mesh.bounds.min.y = minHeight;
    mesh.bounds.max.y = maxHeight;
  }
}

function captureVerticalBounds(segments: readonly Segment[]): ReadonlyMap<BufferMesh, readonly [number, number]> {
  const bounds = new Map<BufferMesh, readonly [number, number]>();
  for (const segment of segments) {
    bounds.set(segment.mesh, [segment.mesh.bounds.min.y, segment.mesh.bounds.max.y]);
    bounds.set(segment.wireMesh, [segment.wireMesh.bounds.min.y, segment.wireMesh.bounds.max.y]);
  }
  return bounds;
}

function restoreVerticalBounds(bounds: ReadonlyMap<BufferMesh, readonly [number, number]>): void {
  for (const [mesh, [minHeight, maxHeight]] of bounds) {
    mesh.bounds.min.y = minHeight;
    mesh.bounds.max.y = maxHeight;
  }
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * 16 * Math.max(1, Math.abs(left), Math.abs(right));
}

interface MeshTypes {
  tile: BufferMesh;
  edgeA: BufferMesh;
  edgeB: BufferMesh;
  fillA: BufferMesh;
  fillB: BufferMesh;
  standardTrimA: BufferMesh;
  standardTrimB: BufferMesh;
  standardTile: BufferMesh;
  standardEdgeA: BufferMesh;
  standardEdgeB: BufferMesh;
  tileWire: BufferMesh;
  edgeAWire: BufferMesh;
  edgeBWire: BufferMesh;
  fillAWire: BufferMesh;
  fillBWire: BufferMesh;
  standardTrimAWire: BufferMesh;
  standardTrimBWire: BufferMesh;
  standardTileWire: BufferMesh;
  standardEdgeAWire: BufferMesh;
  standardEdgeBWire: BufferMesh;
}

function createMeshTypes(engine: Engine, size: number, minHeight: number, maxHeight: number): MeshTypes {
  return {
    tile: createGridMesh(engine, size, size, false, minHeight, maxHeight, "terrain-tile"),
    edgeA: createGridMesh(engine, 2, size * 4 + 8, false, minHeight, maxHeight, "terrain-edge-a"),
    edgeB: createGridMesh(engine, size * 4 + 4, 2, false, minHeight, maxHeight, "terrain-edge-b"),
    fillA: createGridMesh(engine, 4, size, false, minHeight, maxHeight, "terrain-fill-a"),
    fillB: createGridMesh(engine, size, 4, false, minHeight, maxHeight, "terrain-fill-b"),
    standardTrimA: createGridMesh(engine, 2, size * 4 + 2, true, minHeight, maxHeight, "terrain-trim-a"),
    standardTrimB: createGridMesh(engine, size * 4 + 2, 2, true, minHeight, maxHeight, "terrain-trim-b"),
    standardTile: createGridMesh(engine, size, size, true, minHeight, maxHeight, "terrain-standard-tile"),
    standardEdgeA: createGridMesh(engine, 2, size * 4 + 8, true, minHeight, maxHeight, "terrain-standard-edge-a"),
    standardEdgeB: createGridMesh(engine, size * 4 + 4, 2, true, minHeight, maxHeight, "terrain-standard-edge-b"),
    tileWire: createGridMesh(engine, size, size, false, minHeight, maxHeight, "terrain-tile-wire", true),
    edgeAWire: createGridMesh(engine, 2, size * 4 + 8, false, minHeight, maxHeight, "terrain-edge-a-wire", true),
    edgeBWire: createGridMesh(engine, size * 4 + 4, 2, false, minHeight, maxHeight, "terrain-edge-b-wire", true),
    fillAWire: createGridMesh(engine, 4, size, false, minHeight, maxHeight, "terrain-fill-a-wire", true),
    fillBWire: createGridMesh(engine, size, 4, false, minHeight, maxHeight, "terrain-fill-b-wire", true),
    standardTrimAWire: createGridMesh(engine, 2, size * 4 + 2, true, minHeight, maxHeight, "terrain-trim-a-wire", true),
    standardTrimBWire: createGridMesh(engine, size * 4 + 2, 2, true, minHeight, maxHeight, "terrain-trim-b-wire", true),
    standardTileWire: createGridMesh(
      engine,
      size,
      size,
      true,
      minHeight,
      maxHeight,
      "terrain-standard-tile-wire",
      true
    ),
    standardEdgeAWire: createGridMesh(
      engine,
      2,
      size * 4 + 8,
      true,
      minHeight,
      maxHeight,
      "terrain-standard-edge-a-wire",
      true
    ),
    standardEdgeBWire: createGridMesh(
      engine,
      size * 4 + 4,
      2,
      true,
      minHeight,
      maxHeight,
      "terrain-standard-edge-b-wire",
      true
    )
  };
}

function createGridMesh(
  engine: Engine,
  width: number,
  depth: number,
  standardGrid: boolean,
  minHeight: number,
  maxHeight: number,
  name: string,
  wireframe = false
): BufferMesh {
  const positions = new Float32Array((width + 1) * (depth + 1) * 3);
  let vertexOffset = 0;
  for (let z = 0; z <= depth; z++) {
    for (let x = 0; x <= width; x++) {
      positions[vertexOffset++] = x;
      positions[vertexOffset++] = 0;
      positions[vertexOffset++] = z;
    }
  }

  const triangleIndices = new Uint32Array(width * depth * 6);
  let indexOffset = 0;
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const bottomLeft = z * (width + 1) + x;
      const bottomRight = bottomLeft + 1;
      const topLeft = (z + 1) * (width + 1) + x;
      const topRight = topLeft + 1;
      // The imported mesh convention has the opposite front-face winding.
      if (((x + z) & 1) === 0 || standardGrid) {
        triangleIndices[indexOffset++] = bottomLeft;
        triangleIndices[indexOffset++] = topLeft;
        triangleIndices[indexOffset++] = topRight;
        triangleIndices[indexOffset++] = bottomLeft;
        triangleIndices[indexOffset++] = topRight;
        triangleIndices[indexOffset++] = bottomRight;
      } else {
        triangleIndices[indexOffset++] = bottomLeft;
        triangleIndices[indexOffset++] = topLeft;
        triangleIndices[indexOffset++] = bottomRight;
        triangleIndices[indexOffset++] = topLeft;
        triangleIndices[indexOffset++] = topRight;
        triangleIndices[indexOffset++] = bottomRight;
      }
    }
  }

  const indices = wireframe ? createWireIndices(triangleIndices) : triangleIndices;

  const mesh = new BufferMesh(engine, name);
  mesh.setVertexBufferBinding(new Buffer(engine, BufferBindFlag.VertexBuffer, positions, BufferUsage.Static), 12);
  mesh.setIndexBufferBinding(
    new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static),
    IndexFormat.UInt32
  );
  mesh.setVertexElements([new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0)]);
  mesh.addSubMesh(0, indices.length, wireframe ? MeshTopology.Lines : MeshTopology.Triangles);
  mesh.bounds.min.set(0, minHeight, 0);
  mesh.bounds.max.set(width, maxHeight, depth);
  return mesh;
}

function createWireIndices(triangleIndices: Uint32Array): Uint32Array {
  const lineIndices = new Uint32Array((triangleIndices.length / 3) * 6);
  let offset = 0;
  for (let triangle = 0; triangle < triangleIndices.length; triangle += 3) {
    const a = triangleIndices[triangle];
    const b = triangleIndices[triangle + 1];
    const c = triangleIndices[triangle + 2];
    lineIndices[offset++] = a;
    lineIndices[offset++] = b;
    lineIndices[offset++] = b;
    lineIndices[offset++] = c;
    lineIndices[offset++] = c;
    lineIndices[offset++] = a;
  }
  return lineIndices;
}

interface ClipmapOffsets {
  readonly lod0Tiles: readonly Offset[];
  readonly trimA: readonly Offset[];
  readonly trimB: readonly Offset[];
  readonly tiles: readonly Offset[];
  readonly edges: readonly (readonly [number, number, number])[];
  readonly fillA: readonly Offset[];
  readonly fillB: readonly Offset[];
  readonly offsetA: number;
  readonly meshSize: number;
}

function createOffsets(size: number): ClipmapOffsets {
  const offsetA = size * 2 + 2;
  const offsetB = size * 2 + 4;
  const offsetC = size * 2 + 6;
  return {
    lod0Tiles: [
      [0, size],
      [size, size],
      [size, 0],
      [size, -size],
      [size, -size * 2],
      [0, -size * 2],
      [-size, -size * 2],
      [-size * 2, -size * 2],
      [-size * 2, -size],
      [-size * 2, 0],
      [-size * 2, size],
      [-size, size],
      [0, 0],
      [-size, 0],
      [0, -size],
      [-size, -size]
    ],
    trimA: [
      [size * 2, -size * 2],
      [-size * 2 - 2, -size * 2 - 2]
    ],
    trimB: [
      [-size * 2, -size * 2 - 2],
      [-size * 2 - 2, size * 2]
    ],
    tiles: [
      [2, size + 2],
      [size + 2, size + 2],
      [size + 2, -2],
      [size + 2, -size - 2],
      [size + 2, -size * 2 - 2],
      [-2, -size * 2 - 2],
      [-size - 2, -size * 2 - 2],
      [-size * 2 - 2, -size * 2 - 2],
      [-size * 2 - 2, -size + 2],
      [-size * 2 - 2, 2],
      [-size * 2 - 2, size + 2],
      [-size + 2, size + 2]
    ],
    edges: [
      [offsetA, offsetA, -offsetB],
      [offsetB, -offsetB, -offsetC]
    ],
    fillA: [
      [size - 2, -size * 2 - 2],
      [-size - 2, size + 2]
    ],
    fillB: [
      [size + 2, size - 2],
      [-size * 2 - 2, -size - 2]
    ],
    offsetA,
    meshSize: size
  };
}

function createGeometrySnapshot(
  meshSize: number,
  lodCount: number,
  segmentCount: number
): TerrainClipmapGeometrySnapshot {
  const tile = gridGeometry(meshSize, meshSize);
  const edgeA = gridGeometry(2, meshSize * 4 + 8);
  const edgeB = gridGeometry(meshSize * 4 + 4, 2);
  const fillA = gridGeometry(4, meshSize);
  const fillB = gridGeometry(meshSize, 4);
  const trimA = gridGeometry(2, meshSize * 4 + 2);
  const trimB = gridGeometry(meshSize * 4 + 2, 2);
  const firstRing = sumGeometry([
    [tile, 16],
    [edgeA, 2],
    [edgeB, 2],
    [trimA, 2],
    [trimB, 2]
  ]);
  const outerRing = sumGeometry([
    [tile, 12],
    [edgeA, 2],
    [edgeB, 2],
    [fillA, 2],
    [fillB, 2]
  ]);
  return Object.freeze({
    meshSize,
    lodCount,
    segmentCount,
    fullTopologyVertices: firstRing.vertices + outerRing.vertices * (lodCount - 1),
    fullTopologyTriangles: firstRing.triangles + outerRing.triangles * (lodCount - 1)
  });
}

interface GridGeometry {
  readonly vertices: number;
  readonly triangles: number;
}

function gridGeometry(width: number, depth: number): GridGeometry {
  return Object.freeze({ vertices: (width + 1) * (depth + 1), triangles: width * depth * 2 });
}

function sumGeometry(entries: readonly (readonly [geometry: GridGeometry, count: number])[]): GridGeometry {
  let vertices = 0;
  let triangles = 0;
  for (const [geometry, count] of entries) {
    vertices += geometry.vertices * count;
    triangles += geometry.triangles * count;
  }
  return Object.freeze({ vertices, triangles });
}

function snapToGrid(value: number, origin: number, step: number): number {
  return origin + roundHalfAwayFromZero((value - origin) / step) * step;
}

function floorToGrid(value: number, origin: number, step: number): number {
  return origin + Math.floor((value - origin) / step) * step;
}

function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const GROUP_NAMES = ["tile", "edge-a", "edge-b", "fill-a", "fill-b"] as const;
