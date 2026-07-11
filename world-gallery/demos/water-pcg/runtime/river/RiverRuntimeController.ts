/** Internal river runtime lifecycle: renderer creation, GPU upload, cache, swap, and disposal. */
import { Engine, Entity, Material, MeshRenderer } from "@galacean/engine-core";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import type { RiverAuthoringConfig } from "../../authoring/river/RiverAuthoringTypes";
import type { RiverCompiledData, RiverReachArtifact } from "../../compiler/river/types";
import { cloneCompiledRiverConfig } from "../../compiler/river/RiverNetworkCompiler";
import {
  createLowRiverMaterial,
  createRiverFoamMaterial,
  createRiverMaterial,
  updateRiverFoamMaterial,
  updateRiverMaterial
} from "./RiverMaterialFactory";
import { uploadRiverMeshes } from "./RiverMeshUploader";
import type { RiverMeshBuildResult } from "./types";

export interface RiverRuntimeReach {
  readonly root: Entity;
  readonly surfaceRenderer: MeshRenderer;
  readonly foamRenderer: MeshRenderer;
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

interface MutableRiverRuntimeReach extends RiverRuntimeReach {
  config: RiverAuthoringConfig;
  artifact: RiverReachArtifact;
  meshes: RiverMeshBuildResult;
  surfaceMaterial: Material;
  lowMaterial: Material;
  foamMaterial: Material;
}

export interface RiverRuntimeActivation {
  created: boolean;
  reaches: readonly RiverRuntimeReach[];
}

export class RiverRuntimeController {
  private readonly _runtimeSets = new Map<string, MutableRiverRuntimeReach[]>();
  private _activeId?: string;
  private _activeReaches: MutableRiverRuntimeReach[] = [];
  private _pendingResourceGc = false;

  constructor(
    private readonly _engine: Engine,
    private readonly _root: Entity
  ) {}

  get activeReaches(): readonly RiverRuntimeReach[] {
    return this._activeReaches;
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
      this._activeReaches = cached;
      for (const reach of cached) reach.root.isActive = true;
      return { created: false, reaches: cached };
    }
    const reaches = this._createReachSet(compiledData, sources);
    this._runtimeSets.set(networkId, reaches);
    this._activeId = networkId;
    this._activeReaches = reaches;
    return { created: true, reaches };
  }

  replaceActive(
    networkId: string,
    compiledData: RiverCompiledData,
    sources?: readonly RiverRuntimeReachSource[]
  ): readonly RiverRuntimeReach[] {
    const previous = this._runtimeSets.get(networkId);
    const reaches = this._createReachSet(compiledData, sources);
    this._runtimeSets.set(networkId, reaches);
    this._activeId = networkId;
    this._activeReaches = reaches;
    if (previous) {
      for (const reach of previous) this._destroyReach(reach);
      this._pendingResourceGc = true;
    }
    return reaches;
  }

  updateReach(
    reachIndex: number,
    config: RiverAuthoringConfig,
    artifact: RiverReachArtifact,
    geometryDirty: boolean,
    materialDirty: boolean
  ): RiverRuntimeReach | undefined {
    const reach = this._activeReaches[reachIndex];
    if (!reach) return undefined;
    reach.config = config;
    reach.artifact = artifact;
    if (geometryDirty) {
      const previousBankFoamMesh = reach.meshes.bankFoamMesh;
      reach.meshes = uploadRiverMeshes(this._engine, artifact, { existing: reach.meshes });
      reach.meshes.surfaceMesh.isGCIgnored = true;
      if (reach.meshes.bankFoamMesh) reach.meshes.bankFoamMesh.isGCIgnored = true;
      reach.surfaceRenderer.mesh = reach.meshes.surfaceMesh;
      reach.foamRenderer.mesh = reach.meshes.bankFoamMesh ?? reach.meshes.surfaceMesh;
      if (previousBankFoamMesh && previousBankFoamMesh !== reach.meshes.bankFoamMesh) {
        previousBankFoamMesh.destroy(true);
        this._pendingResourceGc = true;
      }
    }
    if (materialDirty) {
      updateRiverMaterial(reach.surfaceMaterial, config.material, 1);
      updateRiverMaterial(reach.lowMaterial, config.material, 1);
      updateRiverFoamMaterial(reach.foamMaterial, config.material, 1);
    }
    return reach;
  }

  applyPresentation(reachIndex: number, presentation: RiverRuntimePresentation): void {
    const reach = this._activeReaches[reachIndex];
    if (!reach) return;
    reach.surfaceRenderer.entity.isActive = presentation.surfaceVisible;
    reach.foamRenderer.entity.isActive = presentation.foamVisible;
    reach.surfaceRenderer.setMaterial(
      presentation.surfaceMaterial ??
        (reach.config.quality.material.level === RiverQualityLevel.Low ? reach.lowMaterial : reach.surfaceMaterial)
    );
    reach.foamRenderer.setMaterial(presentation.foamMaterial ?? reach.foamMaterial);
  }

  flushDeferredResources(): void {
    if (!this._pendingResourceGc) return;
    this._engine.resourceManager.gc();
    this._pendingResourceGc = false;
  }

  destroy(): void {
    for (const reaches of this._runtimeSets.values()) {
      for (const reach of reaches) this._destroyReach(reach);
    }
    this._runtimeSets.clear();
    this._activeReaches = [];
    this._activeId = undefined;
    this._pendingResourceGc = true;
  }

  private _createReachSet(
    compiledData: RiverCompiledData,
    sources?: readonly RiverRuntimeReachSource[]
  ): MutableRiverRuntimeReach[] {
    return compiledData.reaches.map((reach, reachIndex) => {
      const root = this._root.createChild(`river-segment-${reach.id}`);
      const foamRenderer = root.createChild(`${reach.id}-bank`).addComponent(MeshRenderer);
      const surfaceRenderer = root.createChild(`${reach.id}-water`).addComponent(MeshRenderer);
      const source = sources?.[reachIndex];
      const config = source?.config ?? cloneCompiledRiverConfig(reach.config);
      const artifact = source?.artifact ?? reach.artifact;
      const meshes = uploadRiverMeshes(this._engine, artifact);
      const surfaceMaterial = createRiverMaterial(this._engine, config.material, 1);
      const lowMaterial = createLowRiverMaterial(this._engine, config.material, 1);
      const foamMaterial = createRiverFoamMaterial(this._engine, config.material, 1);
      meshes.surfaceMesh.isGCIgnored = true;
      if (meshes.bankFoamMesh) meshes.bankFoamMesh.isGCIgnored = true;
      surfaceMaterial.isGCIgnored = true;
      lowMaterial.isGCIgnored = true;
      foamMaterial.isGCIgnored = true;
      surfaceRenderer.mesh = meshes.surfaceMesh;
      foamRenderer.mesh = meshes.bankFoamMesh ?? meshes.surfaceMesh;
      surfaceRenderer.setMaterial(
        config.quality.material.level === RiverQualityLevel.Low ? lowMaterial : surfaceMaterial
      );
      foamRenderer.setMaterial(foamMaterial);
      return {
        root,
        surfaceRenderer,
        foamRenderer,
        config,
        artifact,
        meshes,
        surfaceMaterial,
        lowMaterial,
        foamMaterial
      };
    });
  }

  private _deactivateAll(): void {
    for (const reaches of this._runtimeSets.values()) {
      for (const reach of reaches) reach.root.isActive = false;
    }
  }

  private _destroyReach(reach: MutableRiverRuntimeReach): void {
    reach.root.destroy();
    reach.meshes.surfaceMesh.destroy(true);
    reach.meshes.bankFoamMesh?.destroy(true);
    reach.surfaceMaterial.destroy(true);
    reach.lowMaterial.destroy(true);
    reach.foamMaterial.destroy(true);
  }
}
