/** Internal river runtime lifecycle: chunk renderer creation, GPU upload, cache, swap, and disposal. */
import { Engine, Entity, Material, MeshRenderer } from "@galacean/engine-core";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import type { RiverAuthoringConfig } from "../../authoring/river/RiverAuthoringTypes";
import { RiverChunkSourceKind } from "../../compiler/river/RiverGeometryEnums";
import { cloneCompiledRiverConfig } from "../../compiler/river/RiverNetworkCompiler";
import type { RiverCompiledChunk, RiverCompiledData, RiverReachArtifact } from "../../compiler/river/types";
import {
  createLowRiverMaterial,
  createRiverFoamMaterial,
  createRiverMaterial,
  updateRiverFoamMaterial,
  updateRiverMaterial
} from "./RiverMaterialFactory";
import { uploadRiverMeshes } from "./RiverMeshUploader";
import { RiverNetworkQueryService } from "./RiverQueryService";
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
  foamMaterial?: Material;
}

interface RiverRuntimeMaterialSet {
  readonly surface: Material;
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
  readonly foamRenderer: MeshRenderer;
  readonly compiled: RiverCompiledChunk;
  readonly meshes: RiverMeshBuildResult;
}

interface MutableRiverRuntimeSet {
  readonly reaches: MutableRiverRuntimeReach[];
  readonly chunks: MutableRiverRuntimeChunk[];
  readonly queryService: RiverNetworkQueryService;
}

export interface RiverRuntimeActivation {
  created: boolean;
  reaches: readonly RiverRuntimeReach[];
  queryService: RiverNetworkQueryService;
}

function pinMaterialSet(materials: RiverRuntimeMaterialSet): void {
  materials.surface.isGCIgnored = true;
  materials.low.isGCIgnored = true;
  materials.foam.isGCIgnored = true;
}

export class RiverRuntimeController {
  private readonly _runtimeSets = new Map<string, MutableRiverRuntimeSet>();
  private _activeId?: string;
  private _activeReaches: MutableRiverRuntimeReach[] = [];
  private _activeChunks: MutableRiverRuntimeChunk[] = [];
  private _activeQueryService?: RiverNetworkQueryService;
  private _pendingResourceGc = false;

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
    compiledData: RiverCompiledData,
    sources?: readonly RiverRuntimeReachSource[]
  ): RiverRuntimeActivation {
    this._deactivateAll();
    const cached = this._runtimeSets.get(networkId);
    if (cached) {
      this._activeId = networkId;
      this._activeReaches = cached.reaches;
      this._activeChunks = cached.chunks;
      this._activeQueryService = cached.queryService;
      for (const reach of cached.reaches) reach.root.isActive = true;
      for (const chunk of cached.chunks) chunk.root.isActive = true;
      return { created: false, reaches: cached.reaches, queryService: cached.queryService };
    }
    const runtimeSet = this._createRuntimeSet(compiledData, sources);
    this._runtimeSets.set(networkId, runtimeSet);
    this._activeId = networkId;
    this._activeReaches = runtimeSet.reaches;
    this._activeChunks = runtimeSet.chunks;
    this._activeQueryService = runtimeSet.queryService;
    return { created: true, reaches: runtimeSet.reaches, queryService: runtimeSet.queryService };
  }

  replaceActive(
    networkId: string,
    compiledData: RiverCompiledData,
    sources?: readonly RiverRuntimeReachSource[]
  ): readonly RiverRuntimeReach[] {
    const previous = this._runtimeSets.get(networkId);
    const runtimeSet = this._createRuntimeSet(compiledData, sources);
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
      chunk.foamRenderer.entity.isActive = presentation.foamVisible && Boolean(chunk.meshes.bankFoamMesh);
      chunk.surfaceRenderer.setMaterial(
        presentation.surfaceMaterial ??
          (reach.config.quality.material.level === RiverQualityLevel.Low
            ? reach.materials.low
            : reach.materials.surface)
      );
      chunk.foamRenderer.setMaterial(presentation.foamMaterial ?? reach.materials.foam);
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
    compiledData: RiverCompiledData,
    sources?: readonly RiverRuntimeReachSource[]
  ): MutableRiverRuntimeSet {
    const reaches = compiledData.reaches.map((reach, reachIndex) => {
      const source = sources?.[reachIndex];
      const config = source?.config ?? cloneCompiledRiverConfig(reach.config);
      const materials = {
        surface: createRiverMaterial(this._engine, config.material, 1),
        low: createLowRiverMaterial(this._engine, config.material, 1),
        foam: createRiverFoamMaterial(this._engine, config.material, 1)
      };
      pinMaterialSet(materials);
      return {
        root: this._root.createChild(`river-reach-${reach.id}`),
        config,
        artifact: source?.artifact ?? reach.artifact,
        materials
      };
    });
    const chunks = compiledData.chunks.map((chunk) => this._createChunk(chunk, reaches));
    return { reaches, chunks, queryService: new RiverNetworkQueryService(compiledData) };
  }

  private _createChunk(
    chunk: RiverCompiledChunk,
    reaches: readonly MutableRiverRuntimeReach[]
  ): MutableRiverRuntimeChunk {
    const parent = chunk.sourceKind === RiverChunkSourceKind.Reach ? reaches[chunk.sourceIndex].root : this._root;
    const root = parent.createChild(`river-chunk-${chunk.id}`);
    root.transform.setPosition(chunk.localOrigin[0], chunk.localOrigin[1], chunk.localOrigin[2]);
    const foamRenderer = root.createChild(`${chunk.id}-bank`).addComponent(MeshRenderer);
    const surfaceRenderer = root.createChild(`${chunk.id}-water`).addComponent(MeshRenderer);
    const meshes = uploadRiverMeshes(this._engine, chunk);
    const materialReach = reaches[chunk.materialSourceReachIndex];
    meshes.surfaceMesh.isGCIgnored = true;
    if (meshes.bankFoamMesh) meshes.bankFoamMesh.isGCIgnored = true;
    surfaceRenderer.mesh = meshes.surfaceMesh;
    foamRenderer.mesh = meshes.bankFoamMesh ?? meshes.surfaceMesh;
    surfaceRenderer.setMaterial(
      materialReach.config.quality.material.level === RiverQualityLevel.Low
        ? materialReach.materials.low
        : materialReach.materials.surface
    );
    foamRenderer.setMaterial(materialReach.materials.foam);
    foamRenderer.entity.isActive = Boolean(meshes.bankFoamMesh);
    return { root, surfaceRenderer, foamRenderer, compiled: chunk, meshes };
  }

  private _deactivateAll(): void {
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) reach.root.isActive = false;
      for (const chunk of runtimeSet.chunks) chunk.root.isActive = false;
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
    reach.materials.low.destroy(true);
    reach.materials.foam.destroy(true);
  }

  private _destroyRuntimeSet(runtimeSet: MutableRiverRuntimeSet): void {
    for (const chunk of runtimeSet.chunks) this._destroyChunk(chunk);
    for (const reach of runtimeSet.reaches) this._destroyReach(reach);
  }
}
