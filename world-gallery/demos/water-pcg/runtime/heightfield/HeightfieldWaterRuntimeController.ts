/** Heightfield-water GPU lifecycle: hidden build root, sliced upload, atomic swap, and deterministic cleanup. */
import { Engine, Entity, MeshRenderer, Texture2D } from "@galacean/engine-core";
import { Vector4 } from "@galacean/engine-math";
import type { HeightfieldWaterMaterialConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import type {
  HeightfieldWaterCompiledChunk,
  HeightfieldWaterCompiledData
} from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import {
  createHeightfieldWaterMaterial,
  setHeightfieldWaterDebugMode,
  setHeightfieldWaterFeatureFlags,
  setHeightfieldWaterSurfaceTimeOverride,
  updateHeightfieldWaterMaterial
} from "./HeightfieldWaterMaterialFactory";
import { HeightfieldWaterDebugMode } from "./HeightfieldWaterRuntimeEnums";
import { createHeightfieldWaterLocalMapTexture } from "./HeightfieldWaterLocalMapTextureFactory";
import { uploadHeightfieldWaterMesh } from "./HeightfieldWaterMeshUploader";
import { HeightfieldWaterBaseQueryService } from "./HeightfieldWaterQueryService";
import { HeightfieldWaterSurfaceProvider } from "./HeightfieldWaterSurfaceProvider";
import { HeightfieldWaterResource } from "./HeightfieldWaterResource";
import { HEIGHTFIELD_WATER_RESOURCE_SUBMISSION_BUDGET_MS, HEIGHTFIELD_WATER_SHADER_PROPERTY } from "./constants";
import type {
  HeightfieldWaterFeatureFlags,
  HeightfieldWaterMaterialState,
  HeightfieldWaterMeshBuildResult
} from "./types";

interface MutableHeightfieldWaterChunk {
  readonly root: Entity;
  readonly renderer: MeshRenderer;
  readonly compiled: HeightfieldWaterCompiledChunk;
  readonly meshes: HeightfieldWaterMeshBuildResult;
}

interface MutableHeightfieldWaterRuntimeSet {
  readonly root: Entity;
  readonly resource: HeightfieldWaterResource;
  readonly chunks: MutableHeightfieldWaterChunk[];
  readonly material: HeightfieldWaterMaterialState;
  readonly localMapTexture: Texture2D;
  readonly queryService: HeightfieldWaterBaseQueryService;
  readonly surfaceProvider: HeightfieldWaterSurfaceProvider;
}

export interface HeightfieldWaterRuntimeActivation {
  readonly created: true;
  readonly sourceId: string;
  readonly queryService: HeightfieldWaterBaseQueryService;
  readonly surfaceProvider: HeightfieldWaterSurfaceProvider;
  readonly submittedChunkCount: number;
  readonly meshUploadCount: number;
  readonly yieldCount: number;
  readonly maxSliceMs: number;
}

export interface HeightfieldWaterRuntimeSubmissionOptions {
  readonly frameBudgetMs?: number;
  readonly now?: () => number;
  readonly yieldToMainThread?: () => Promise<void>;
  readonly shouldCancel?: () => boolean;
  readonly releaseMeshCpuData?: boolean;
}

export class HeightfieldWaterRuntimeSubmissionCancelledError extends Error {
  constructor() {
    super("Heightfield water runtime submission was superseded by a newer request.");
    this.name = "HeightfieldWaterRuntimeSubmissionCancelledError";
  }
}

export class HeightfieldWaterRuntimeController {
  private readonly _runtimeSets = new Map<string, MutableHeightfieldWaterRuntimeSet>();
  private _activeId?: string;
  private _activeSet?: MutableHeightfieldWaterRuntimeSet;
  private _submissionGeneration = 0;
  private _pendingResourceGc = false;
  private _destroyed = false;
  private _meshUploadCount = 0;
  private _debugMode = HeightfieldWaterDebugMode.Final;
  private _featureFlags: HeightfieldWaterFeatureFlags = Object.freeze({
    waves: true,
    microNormals: true,
    foam: true
  });
  private _surfaceTimeOverride?: number;

  constructor(
    private readonly _engine: Engine,
    private readonly _root: Entity
  ) {}

  get activeId(): string | undefined {
    return this._activeId;
  }

  get activeData(): HeightfieldWaterCompiledData | undefined {
    return this._activeSet?.resource.data;
  }

  get activeQueryService(): HeightfieldWaterBaseQueryService | undefined {
    return this._activeSet?.queryService;
  }

  get activeSurfaceProvider(): HeightfieldWaterSurfaceProvider | undefined {
    return this._activeSet?.surfaceProvider;
  }

  get activeChunkCount(): number {
    return this._activeSet?.chunks.length ?? 0;
  }

  /** Monotonic upload count; it changes only when a new chunk mesh is submitted. */
  get meshUploadCount(): number {
    return this._meshUploadCount;
  }

  async replaceActiveIncremental(
    waterBodyId: string,
    resource: HeightfieldWaterResource,
    options: HeightfieldWaterRuntimeSubmissionOptions = {}
  ): Promise<HeightfieldWaterRuntimeActivation> {
    if (this._destroyed) throw new Error("Heightfield water runtime controller has been destroyed.");
    const generation = ++this._submissionGeneration;
    const previous = this._runtimeSets.get(waterBodyId);
    const now = options.now ?? (() => performance.now());
    const yieldToMainThread =
      options.yieldToMainThread ?? (() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const frameBudgetMs = options.frameBudgetMs ?? HEIGHTFIELD_WATER_RESOURCE_SUBMISSION_BUDGET_MS;
    const data = resource.data;
    resource.retain();
    let root: Entity;
    try {
      root = this._root.createChild(`heightfield-water-runtime-${data.sourceId}`);
    } catch (error) {
      resource.release();
      throw error;
    }
    root.isActive = false;
    let localMapTexture: Texture2D | undefined;
    let material: HeightfieldWaterMaterialState | undefined;
    const chunks: MutableHeightfieldWaterChunk[] = [];
    let yieldCount = 0;
    let maxSliceMs = 0;
    const isCancelled = (): boolean =>
      this._destroyed || generation !== this._submissionGeneration || options.shouldCancel?.() === true;

    try {
      localMapTexture = createHeightfieldWaterLocalMapTexture(this._engine, data.localMapAtlas);
      localMapTexture.isGCIgnored = true;
      material = createHeightfieldWaterMaterial(
        this._engine,
        data.quality,
        data.waveSet,
        data.material,
        data.localMapAtlas,
        localMapTexture
      );
      material.material.isGCIgnored = true;
      setHeightfieldWaterDebugMode(material, this._debugMode);
      setHeightfieldWaterFeatureFlags(material, this._featureFlags);
      setHeightfieldWaterSurfaceTimeOverride(material, this._surfaceTimeOverride);
      let sliceStart = now();
      for (const chunk of data.chunks) {
        if (isCancelled()) throw new HeightfieldWaterRuntimeSubmissionCancelledError();
        chunks.push(
          this._createChunk(
            chunk,
            root,
            material,
            options.releaseMeshCpuData ?? false,
            data.waveSet.maxVerticalDisplacement * data.material.waveStrength
          )
        );
        this._meshUploadCount++;
        const sliceDuration = now() - sliceStart;
        maxSliceMs = Math.max(maxSliceMs, sliceDuration);
        if (sliceDuration >= frameBudgetMs && chunks.length < data.chunks.length) {
          yieldCount++;
          await yieldToMainThread();
          if (isCancelled()) throw new HeightfieldWaterRuntimeSubmissionCancelledError();
          sliceStart = now();
        }
      }

      const queryService = new HeightfieldWaterBaseQueryService(data);
      const surfaceProvider = new HeightfieldWaterSurfaceProvider({
        waterBodyId,
        data,
        queryService,
        getElapsedTime: () => this._engine.time.elapsedTime,
        wavesEnabled: this._featureFlags.waves
      });
      surfaceProvider.setSurfaceTimeOverride(this._surfaceTimeOverride);
      const runtimeSet: MutableHeightfieldWaterRuntimeSet = {
        root,
        resource,
        chunks,
        material,
        localMapTexture,
        queryService,
        surfaceProvider
      };
      if (isCancelled()) throw new HeightfieldWaterRuntimeSubmissionCancelledError();
      this._deactivateAll();
      runtimeSet.root.isActive = true;
      this._runtimeSets.set(waterBodyId, runtimeSet);
      this._activeId = waterBodyId;
      this._activeSet = runtimeSet;
      if (previous) {
        this._destroyRuntimeSet(previous);
        this._pendingResourceGc = true;
      }
      return {
        created: true,
        sourceId: data.sourceId,
        queryService: runtimeSet.queryService,
        surfaceProvider: runtimeSet.surfaceProvider,
        submittedChunkCount: chunks.length,
        meshUploadCount: chunks.length,
        yieldCount,
        maxSliceMs
      };
    } catch (error) {
      for (const chunk of chunks) this._destroyChunk(chunk);
      material?.material.destroy(true);
      localMapTexture?.destroy(true);
      root.destroy();
      resource.release();
      throw error;
    }
  }

  updateMaterial(config: HeightfieldWaterMaterialConfig): void {
    if (!this._activeSet) return;
    updateHeightfieldWaterMaterial(this._activeSet.material, config, this._activeSet.resource.data.localMapAtlas);
    this._activeSet.surfaceProvider.setMaterial(config);
  }

  setDebugMode(mode: HeightfieldWaterDebugMode): void {
    this._debugMode = mode;
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterDebugMode(runtimeSet.material, mode);
    }
  }

  setFeatureFlags(flags: HeightfieldWaterFeatureFlags): void {
    this._featureFlags = Object.freeze({ ...flags });
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterFeatureFlags(runtimeSet.material, flags);
      runtimeSet.surfaceProvider.setWavesEnabled(flags.waves);
    }
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    this._surfaceTimeOverride = elapsedTime;
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterSurfaceTimeOverride(runtimeSet.material, elapsedTime);
      runtimeSet.surfaceProvider.setSurfaceTimeOverride(elapsedTime);
    }
  }

  flushDeferredResources(): void {
    if (!this._pendingResourceGc) return;
    this._engine.resourceManager.gc();
    this._pendingResourceGc = false;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._submissionGeneration++;
    for (const runtimeSet of this._runtimeSets.values()) this._destroyRuntimeSet(runtimeSet);
    this._runtimeSets.clear();
    this._activeId = undefined;
    this._activeSet = undefined;
    this._pendingResourceGc = true;
  }

  private _createChunk(
    chunk: HeightfieldWaterCompiledChunk,
    runtimeRoot: Entity,
    material: HeightfieldWaterMaterialState,
    releaseCpuData: boolean,
    boundsPadding: number
  ): MutableHeightfieldWaterChunk {
    const root = runtimeRoot.createChild(`heightfield-water-chunk-${chunk.id}`);
    root.transform.setPosition(chunk.localOrigin[0], chunk.localOrigin[1], chunk.localOrigin[2]);
    const renderer = root.addComponent(MeshRenderer);
    const meshes = uploadHeightfieldWaterMesh(this._engine, chunk.geometry, { releaseCpuData, boundsPadding });
    meshes.surfaceMesh.isGCIgnored = true;
    renderer.mesh = meshes.surfaceMesh;
    renderer.setMaterial(material.material);
    renderer.shaderData.setVector4(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.atlasUvRect,
      new Vector4(chunk.atlasUvRect[0], chunk.atlasUvRect[1], chunk.atlasUvRect[2], chunk.atlasUvRect[3])
    );
    return { root, renderer, compiled: chunk, meshes };
  }

  private _deactivateAll(): void {
    for (const runtimeSet of this._runtimeSets.values()) runtimeSet.root.isActive = false;
  }

  private _destroyChunk(chunk: MutableHeightfieldWaterChunk): void {
    chunk.root.destroy();
    chunk.meshes.surfaceMesh.destroy(true);
  }

  private _destroyRuntimeSet(runtimeSet: MutableHeightfieldWaterRuntimeSet): void {
    for (const chunk of runtimeSet.chunks) this._destroyChunk(chunk);
    runtimeSet.material.material.destroy(true);
    runtimeSet.localMapTexture.destroy(true);
    runtimeSet.root.destroy();
    runtimeSet.resource.release();
  }
}
