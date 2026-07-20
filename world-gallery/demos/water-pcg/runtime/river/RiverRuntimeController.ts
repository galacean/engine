/** Internal river runtime lifecycle: chunk renderer creation, GPU upload, cache, swap, and disposal. */
import { Engine, Entity, Material, MeshRenderer, Texture2D } from "@galacean/engine-core";
import { Vector4 } from "@galacean/engine-math";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import type { RiverAuthoringConfig } from "../../authoring/river/RiverAuthoringTypes";
import { RiverChunkSourceKind, RiverLocalMapRegionKind } from "../../compiler/river/RiverGeometryEnums";
import { cloneCompiledRiverConfig } from "../../compiler/river/RiverNetworkCompiler";
import type { RiverCompiledChunk, RiverCompiledData, RiverReachArtifact } from "../../compiler/river/types";
import {
  createLowRiverMaterial,
  createRiverFoamMaterial,
  createRiverLocalMapMaterial,
  createRiverMaterial,
  setRiverSurfaceDebugMode,
  setRiverSurfaceFeatureFlags,
  setRiverSurfaceTimeOverride,
  updateRiverFoamMaterial,
  updateRiverMaterial
} from "./RiverMaterialFactory";
import { createRiverLocalMapTexture } from "./RiverLocalMapTextureFactory";
import { RiverSurfaceDebugMode } from "./RiverRuntimeEnums";
import { uploadRiverMeshes } from "./RiverMeshUploader";
import { RiverNetworkQueryService } from "./RiverQueryService";
import { RiverResource } from "./RiverResource";
import { RIVER_RESOURCE_SUBMISSION_BUDGET_MS, RIVER_SHADER_PROPERTY } from "./constants";
import type { RiverMeshBuildResult } from "./types";

export interface RiverRuntimeReach {
  readonly root: Entity;
  readonly config: RiverAuthoringConfig;
  readonly artifact: RiverReachArtifact;
}

export interface RiverRuntimeReachSource {
  config: RiverAuthoringConfig;
  artifact: RiverReachArtifact;
}

export interface RiverRuntimePresentation {
  surfaceVisible: boolean;
  foamVisible: boolean;
  surfaceMaterial?: Material;
  junctionSurfaceMaterial?: Material;
  foamMaterial?: Material;
}

export interface RiverRuntimeDebugTarget {
  readonly kind: "network" | "reach" | "junction" | "junctions" | "chunk";
  readonly id?: string;
}

interface RiverRuntimeMaterialSet {
  readonly surface: Material;
  readonly surfaceLocalMap?: Material;
  readonly low: Material;
  readonly foam: Material;
}

interface MutableRiverRuntimeReach extends RiverRuntimeReach {
  config: RiverAuthoringConfig;
  artifact: RiverReachArtifact;
  readonly materials: RiverRuntimeMaterialSet;
}

interface MutableRiverRuntimeChunk {
  readonly root: Entity;
  readonly surfaceRenderer: MeshRenderer;
  readonly foamRenderer?: MeshRenderer;
  readonly compiled: RiverCompiledChunk;
  readonly sourceId: string;
  readonly meshes: RiverMeshBuildResult;
}

interface MutableRiverRuntimeSet {
  readonly root: Entity;
  readonly resource: RiverResource;
  readonly reaches: MutableRiverRuntimeReach[];
  readonly chunks: MutableRiverRuntimeChunk[];
  readonly queryService: RiverNetworkQueryService;
  readonly localMapTexture?: Texture2D;
}

export interface RiverRuntimeActivation {
  created: boolean;
  reaches: readonly RiverRuntimeReach[];
  queryService: RiverNetworkQueryService;
  submittedChunkCount: number;
  yieldCount: number;
  maxSliceMs: number;
}

export interface RiverRuntimeSubmissionOptions {
  frameBudgetMs?: number;
  now?: () => number;
  yieldToMainThread?: () => Promise<void>;
  shouldCancel?: () => boolean;
}

export class RiverRuntimeSubmissionCancelledError extends Error {
  constructor() {
    super("River runtime submission was superseded by a newer request.");
    this.name = "RiverRuntimeSubmissionCancelledError";
  }
}

function pinMaterialSet(materials: RiverRuntimeMaterialSet): void {
  materials.surface.isGCIgnored = true;
  materials.low.isGCIgnored = true;
  materials.foam.isGCIgnored = true;
  if (materials.surfaceLocalMap) materials.surfaceLocalMap.isGCIgnored = true;
}

export class RiverRuntimeController {
  private readonly _runtimeSets = new Map<string, MutableRiverRuntimeSet>();
  private _activeId?: string;
  private _activeReaches: MutableRiverRuntimeReach[] = [];
  private _activeChunks: MutableRiverRuntimeChunk[] = [];
  private _activeQueryService?: RiverNetworkQueryService;
  private _pendingResourceGc = false;
  private _surfaceDebugMode = RiverSurfaceDebugMode.Off;
  private _macroDisplacementEnabled = true;
  private _microSurfaceEnabled = true;
  private _surfaceTimeOverride?: number;
  private _debugTarget: RiverRuntimeDebugTarget = { kind: "network" };

  constructor(
    private readonly _engine: Engine,
    private readonly _root: Entity
  ) {}

  get activeReaches(): readonly RiverRuntimeReach[] {
    return this._activeReaches;
  }

  get activeQueryService(): RiverNetworkQueryService | undefined {
    return this._activeQueryService;
  }

  activate(
    networkId: string,
    resource: RiverResource,
    sources?: readonly RiverRuntimeReachSource[]
  ): RiverRuntimeActivation {
    this._deactivateAll();
    const cached = this._runtimeSets.get(networkId);
    if (cached) {
      if (cached.resource.metadata.compiledHash !== resource.metadata.compiledHash) {
        throw new Error("Cached river runtime hash differs; use replaceActive for changed resources.");
      }
      this._activeId = networkId;
      this._activeReaches = cached.reaches;
      this._activeChunks = cached.chunks;
      this._activeQueryService = cached.queryService;
      cached.root.isActive = true;
      this._applyDebugTarget(cached.chunks);
      return {
        created: false,
        reaches: cached.reaches,
        queryService: cached.queryService,
        submittedChunkCount: 0,
        yieldCount: 0,
        maxSliceMs: 0
      };
    }
    const runtimeSet = this._createRuntimeSet(resource, sources);
    this._runtimeSets.set(networkId, runtimeSet);
    this._activeId = networkId;
    this._activeReaches = runtimeSet.reaches;
    this._activeChunks = runtimeSet.chunks;
    this._activeQueryService = runtimeSet.queryService;
    return {
      created: true,
      reaches: runtimeSet.reaches,
      queryService: runtimeSet.queryService,
      submittedChunkCount: runtimeSet.chunks.length,
      yieldCount: 0,
      maxSliceMs: 0
    };
  }

  replaceActive(
    networkId: string,
    resource: RiverResource,
    sources?: readonly RiverRuntimeReachSource[]
  ): readonly RiverRuntimeReach[] {
    const previous = this._runtimeSets.get(networkId);
    const runtimeSet = this._createRuntimeSet(resource, sources);
    this._runtimeSets.set(networkId, runtimeSet);
    this._activeId = networkId;
    this._activeReaches = runtimeSet.reaches;
    this._activeChunks = runtimeSet.chunks;
    this._activeQueryService = runtimeSet.queryService;
    if (previous) {
      this._destroyRuntimeSet(previous);
      this._pendingResourceGc = true;
    }
    return runtimeSet.reaches;
  }

  async replaceActiveIncremental(
    networkId: string,
    resource: RiverResource,
    sources?: readonly RiverRuntimeReachSource[],
    options: RiverRuntimeSubmissionOptions = {}
  ): Promise<RiverRuntimeActivation> {
    const previous = this._runtimeSets.get(networkId);
    const now = options.now ?? (() => performance.now());
    const yieldToMainThread =
      options.yieldToMainThread ?? (() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const frameBudgetMs = options.frameBudgetMs ?? RIVER_RESOURCE_SUBMISSION_BUDGET_MS;
    const data = resource.data;
    const root = this._root.createChild(`river-runtime-${data.sourceId}`);
    root.isActive = false;
    resource.retain();
    const localMapTexture = data.terrainInteraction.localMapAtlas
      ? createRiverLocalMapTexture(this._engine, data.terrainInteraction.localMapAtlas)
      : undefined;
    if (localMapTexture) localMapTexture.isGCIgnored = true;
    let reaches: MutableRiverRuntimeReach[] = [];
    const chunks: MutableRiverRuntimeChunk[] = [];
    let yieldCount = 0;
    let maxSliceMs = 0;
    try {
      reaches = this._createReaches(data, root, sources, localMapTexture);
      let sliceStart = now();
      for (const chunk of data.chunks) {
        if (options.shouldCancel?.()) throw new RiverRuntimeSubmissionCancelledError();
        chunks.push(this._createChunk(chunk, reaches, root, data));
        const sliceDuration = now() - sliceStart;
        maxSliceMs = Math.max(maxSliceMs, sliceDuration);
        if (sliceDuration >= frameBudgetMs && chunks.length < data.chunks.length) {
          yieldCount++;
          await yieldToMainThread();
          if (options.shouldCancel?.()) throw new RiverRuntimeSubmissionCancelledError();
          sliceStart = now();
        }
      }
      const runtimeSet: MutableRiverRuntimeSet = {
        root,
        resource,
        reaches,
        chunks,
        queryService: new RiverNetworkQueryService(data),
        localMapTexture
      };
      if (options.shouldCancel?.()) throw new RiverRuntimeSubmissionCancelledError();
      this._deactivateAll();
      runtimeSet.root.isActive = true;
      this._runtimeSets.set(networkId, runtimeSet);
      this._activeId = networkId;
      this._activeReaches = runtimeSet.reaches;
      this._activeChunks = runtimeSet.chunks;
      this._activeQueryService = runtimeSet.queryService;
      if (previous) {
        this._destroyRuntimeSet(previous);
        this._pendingResourceGc = true;
      }
      return {
        created: true,
        reaches: runtimeSet.reaches,
        queryService: runtimeSet.queryService,
        submittedChunkCount: runtimeSet.chunks.length,
        yieldCount,
        maxSliceMs
      };
    } catch (error) {
      for (const chunk of chunks) this._destroyChunk(chunk);
      for (const reach of reaches) this._destroyReach(reach);
      root.destroy();
      localMapTexture?.destroy(true);
      resource.release();
      throw error;
    }
  }

  updateReach(
    reachIndex: number,
    config: RiverAuthoringConfig,
    artifact: RiverReachArtifact,
    materialDirty: boolean
  ): RiverRuntimeReach | undefined {
    const reach = this._activeReaches[reachIndex];
    if (!reach) return undefined;
    reach.config = config;
    reach.artifact = artifact;
    if (materialDirty) {
      updateRiverMaterial(reach.materials.surface, config.material, 1);
      if (reach.materials.surfaceLocalMap) updateRiverMaterial(reach.materials.surfaceLocalMap, config.material, 1);
      updateRiverMaterial(reach.materials.low, config.material, 1);
      updateRiverFoamMaterial(reach.materials.foam, config.material, 1);
    }
    return reach;
  }

  applyPresentation(reachIndex: number, presentation: RiverRuntimePresentation): void {
    const reach = this._activeReaches[reachIndex];
    if (!reach) return;
    for (const chunk of this._activeChunks) {
      if (chunk.compiled.materialSourceReachIndex !== reachIndex) continue;
      chunk.surfaceRenderer.entity.isActive = presentation.surfaceVisible;
      if (chunk.foamRenderer) {
        chunk.foamRenderer.entity.isActive = presentation.foamVisible;
      }
      chunk.surfaceRenderer.setMaterial(
        (chunk.compiled.sourceKind === RiverChunkSourceKind.Junction
          ? (presentation.junctionSurfaceMaterial ?? presentation.surfaceMaterial)
          : presentation.surfaceMaterial) ?? this._selectSurfaceMaterial(chunk.compiled, reach)
      );
      chunk.foamRenderer?.setMaterial(presentation.foamMaterial ?? reach.materials.foam);
    }
  }

  setDebugTarget(target: RiverRuntimeDebugTarget): void {
    this._debugTarget = target;
    this._applyDebugTarget(this._activeChunks);
  }

  setSurfaceDebugMode(mode: RiverSurfaceDebugMode): void {
    this._surfaceDebugMode = mode;
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) {
        setRiverSurfaceDebugMode(reach.materials.surface, mode);
        if (reach.materials.surfaceLocalMap) setRiverSurfaceDebugMode(reach.materials.surfaceLocalMap, mode);
      }
    }
  }

  setSurfaceFeatureFlags(macroDisplacementEnabled: boolean, microSurfaceEnabled: boolean): void {
    this._macroDisplacementEnabled = macroDisplacementEnabled;
    this._microSurfaceEnabled = microSurfaceEnabled;
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) {
        setRiverSurfaceFeatureFlags(reach.materials.surface, macroDisplacementEnabled, microSurfaceEnabled);
        if (reach.materials.surfaceLocalMap) {
          setRiverSurfaceFeatureFlags(reach.materials.surfaceLocalMap, macroDisplacementEnabled, microSurfaceEnabled);
        }
      }
    }
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    this._surfaceTimeOverride = elapsedTime;
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) {
        setRiverSurfaceTimeOverride(reach.materials.surface, elapsedTime);
        if (reach.materials.surfaceLocalMap) {
          setRiverSurfaceTimeOverride(reach.materials.surfaceLocalMap, elapsedTime);
        }
      }
    }
  }

  flushDeferredResources(): void {
    if (!this._pendingResourceGc) return;
    this._engine.resourceManager.gc();
    this._pendingResourceGc = false;
  }

  destroy(): void {
    for (const runtimeSet of this._runtimeSets.values()) this._destroyRuntimeSet(runtimeSet);
    this._runtimeSets.clear();
    this._activeReaches = [];
    this._activeChunks = [];
    this._activeQueryService = undefined;
    this._activeId = undefined;
    this._pendingResourceGc = true;
  }

  private _createRuntimeSet(
    resource: RiverResource,
    sources?: readonly RiverRuntimeReachSource[]
  ): MutableRiverRuntimeSet {
    const compiledData = resource.data;
    const root = this._root.createChild(`river-runtime-${compiledData.sourceId}`);
    resource.retain();
    const localMapTexture = compiledData.terrainInteraction.localMapAtlas
      ? createRiverLocalMapTexture(this._engine, compiledData.terrainInteraction.localMapAtlas)
      : undefined;
    if (localMapTexture) localMapTexture.isGCIgnored = true;
    let reaches: MutableRiverRuntimeReach[] = [];
    let chunks: MutableRiverRuntimeChunk[] = [];
    try {
      reaches = this._createReaches(compiledData, root, sources, localMapTexture);
      chunks = compiledData.chunks.map((chunk) => this._createChunk(chunk, reaches, root, compiledData));
      return {
        root,
        resource,
        reaches,
        chunks,
        queryService: new RiverNetworkQueryService(compiledData),
        localMapTexture
      };
    } catch (error) {
      for (const chunk of chunks) this._destroyChunk(chunk);
      for (const reach of reaches) this._destroyReach(reach);
      root.destroy();
      localMapTexture?.destroy(true);
      resource.release();
      throw error;
    }
  }

  private _createReaches(
    compiledData: RiverCompiledData,
    root: Entity,
    sources?: readonly RiverRuntimeReachSource[],
    localMapTexture?: Texture2D
  ): MutableRiverRuntimeReach[] {
    return compiledData.reaches.map((reach, reachIndex) => {
      const source = sources?.[reachIndex];
      const config = source?.config ?? cloneCompiledRiverConfig(reach.config);
      const materials = {
        surface: createRiverMaterial(this._engine, config.material, 1, compiledData.surfaceMotion),
        surfaceLocalMap: localMapTexture
          ? createRiverLocalMapMaterial(this._engine, config.material, 1, compiledData.surfaceMotion, localMapTexture)
          : undefined,
        low: createLowRiverMaterial(this._engine, config.material, 1),
        foam: createRiverFoamMaterial(this._engine, config.material, 1)
      };
      pinMaterialSet(materials);
      setRiverSurfaceDebugMode(materials.surface, this._surfaceDebugMode);
      setRiverSurfaceFeatureFlags(materials.surface, this._macroDisplacementEnabled, this._microSurfaceEnabled);
      setRiverSurfaceTimeOverride(materials.surface, this._surfaceTimeOverride);
      if (materials.surfaceLocalMap) {
        setRiverSurfaceDebugMode(materials.surfaceLocalMap, this._surfaceDebugMode);
        setRiverSurfaceFeatureFlags(
          materials.surfaceLocalMap,
          this._macroDisplacementEnabled,
          this._microSurfaceEnabled
        );
        setRiverSurfaceTimeOverride(materials.surfaceLocalMap, this._surfaceTimeOverride);
      }
      return {
        root: root.createChild(`river-reach-${reach.id}`),
        config,
        artifact: source?.artifact ?? reach.artifact,
        materials
      };
    });
  }

  private _createChunk(
    chunk: RiverCompiledChunk,
    reaches: readonly MutableRiverRuntimeReach[],
    runtimeRoot: Entity,
    compiledData: RiverCompiledData
  ): MutableRiverRuntimeChunk {
    const parent = chunk.sourceKind === RiverChunkSourceKind.Reach ? reaches[chunk.sourceIndex].root : runtimeRoot;
    const root = parent.createChild(`river-chunk-${chunk.id}`);
    const sourceId =
      chunk.sourceKind === RiverChunkSourceKind.Reach
        ? (compiledData.reaches[chunk.sourceIndex]?.id ?? chunk.id)
        : (compiledData.junctions[chunk.sourceIndex]?.id ?? chunk.id);
    root.transform.setPosition(chunk.localOrigin[0], chunk.localOrigin[1], chunk.localOrigin[2]);
    const surfaceRenderer = root.createChild(`${chunk.id}-water`).addComponent(MeshRenderer);
    const meshes = uploadRiverMeshes(this._engine, chunk);
    const materialReach = reaches[chunk.materialSourceReachIndex];
    meshes.surfaceMesh.isGCIgnored = true;
    if (meshes.bankFoamMesh) meshes.bankFoamMesh.isGCIgnored = true;
    surfaceRenderer.mesh = meshes.surfaceMesh;
    surfaceRenderer.setMaterial(this._selectSurfaceMaterial(chunk, materialReach));
    const localMapTile =
      chunk.localMapTileIndex === undefined
        ? undefined
        : compiledData.terrainInteraction.localMapAtlas?.tiles[chunk.localMapTileIndex];
    if (localMapTile) {
      surfaceRenderer.shaderData.setVector4(
        RIVER_SHADER_PROPERTY.localMapWorldToUv,
        new Vector4(...localMapTile.worldToUv)
      );
      surfaceRenderer.shaderData.setVector4(RIVER_SHADER_PROPERTY.localMapUvRect, new Vector4(...localMapTile.uvRect));
      surfaceRenderer.shaderData.setFloat(
        RIVER_SHADER_PROPERTY.localMapConfluence,
        localMapTile.kind === RiverLocalMapRegionKind.Confluence ? 1 : 0
      );
    }
    const foamRenderer = meshes.bankFoamMesh
      ? root.createChild(`${chunk.id}-bank`).addComponent(MeshRenderer)
      : undefined;
    if (foamRenderer && meshes.bankFoamMesh) {
      foamRenderer.mesh = meshes.bankFoamMesh;
      foamRenderer.setMaterial(materialReach.materials.foam);
    }
    const runtimeChunk = { root, surfaceRenderer, foamRenderer, compiled: chunk, sourceId, meshes };
    root.isActive = this._matchesDebugTarget(runtimeChunk);
    return runtimeChunk;
  }

  private _applyDebugTarget(chunks: readonly MutableRiverRuntimeChunk[]): void {
    for (const chunk of chunks) chunk.root.isActive = this._matchesDebugTarget(chunk);
  }

  private _matchesDebugTarget(chunk: MutableRiverRuntimeChunk): boolean {
    switch (this._debugTarget.kind) {
      case "reach":
        return chunk.compiled.sourceKind === RiverChunkSourceKind.Reach && chunk.sourceId === this._debugTarget.id;
      case "junction":
        return chunk.compiled.sourceKind === RiverChunkSourceKind.Junction && chunk.sourceId === this._debugTarget.id;
      case "junctions":
        return chunk.compiled.sourceKind === RiverChunkSourceKind.Junction;
      case "chunk":
        return chunk.compiled.id === this._debugTarget.id;
      default:
        return true;
    }
  }

  private _selectSurfaceMaterial(chunk: RiverCompiledChunk, reach: MutableRiverRuntimeReach): Material {
    if (reach.config.quality.material.level === RiverQualityLevel.Low) return reach.materials.low;
    return chunk.localMapTileIndex !== undefined && reach.materials.surfaceLocalMap
      ? reach.materials.surfaceLocalMap
      : reach.materials.surface;
  }

  private _deactivateAll(): void {
    for (const runtimeSet of this._runtimeSets.values()) {
      runtimeSet.root.isActive = false;
    }
  }

  private _destroyChunk(chunk: MutableRiverRuntimeChunk): void {
    chunk.root.destroy();
    chunk.meshes.surfaceMesh.destroy(true);
    chunk.meshes.bankFoamMesh?.destroy(true);
  }

  private _destroyReach(reach: MutableRiverRuntimeReach): void {
    reach.root.destroy();
    reach.materials.surface.destroy(true);
    reach.materials.surfaceLocalMap?.destroy(true);
    reach.materials.low.destroy(true);
    reach.materials.foam.destroy(true);
  }

  private _destroyRuntimeSet(runtimeSet: MutableRiverRuntimeSet): void {
    for (const chunk of runtimeSet.chunks) this._destroyChunk(chunk);
    for (const reach of runtimeSet.reaches) this._destroyReach(reach);
    runtimeSet.localMapTexture?.destroy(true);
    runtimeSet.root.destroy();
    runtimeSet.resource.release();
  }
}
