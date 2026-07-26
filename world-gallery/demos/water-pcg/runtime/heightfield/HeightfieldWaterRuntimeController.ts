/** Heightfield-water GPU lifecycle: hidden build root, sliced upload, atomic swap, and deterministic cleanup. */
import { Engine, Entity, MeshRenderer, Texture2D } from "@galacean/engine-core";
import { Vector4 } from "@galacean/engine-math";
import type { HeightfieldWaterMaterialConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type {
  HeightfieldWaterCompiledChunk,
  HeightfieldWaterCompiledData
} from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import type {
  WaterOpticsTier,
  WaterSurfaceOpticsBinding,
  WaterSurfaceOpticsBindingReadback
} from "../optics/WaterSurfaceOpticsTypes";
import {
  createHeightfieldWaterMaterial,
  setHeightfieldWaterCompositionMode,
  setHeightfieldWaterDepthWriteEnabled,
  setHeightfieldWaterFeatureFlags,
  setHeightfieldWaterLocalFoamMask,
  setHeightfieldWaterOpticsCalibrationMode,
  setHeightfieldWaterSurfaceAppearanceBinding,
  setHeightfieldWaterSurfaceAppearanceFeatureFlags,
  setHeightfieldWaterSurfaceOpticsBinding,
  setHeightfieldWaterSurfaceTimeOverride,
  updateHeightfieldWaterMaterial
} from "./HeightfieldWaterMaterialFactory";
import {
  HeightfieldWaterCompositionMode,
  HeightfieldWaterDebugMode,
  HeightfieldWaterOpticsCalibrationMode
} from "./HeightfieldWaterRuntimeEnums";
import { createHeightfieldWaterLocalMapTexture } from "./HeightfieldWaterLocalMapTextureFactory";
import { uploadHeightfieldWaterMesh } from "./HeightfieldWaterMeshUploader";
import { HeightfieldWaterBaseQueryService } from "./HeightfieldWaterQueryService";
import { HeightfieldWaterSurfaceProvider } from "./HeightfieldWaterSurfaceProvider";
import { HeightfieldWaterResource } from "./HeightfieldWaterResource";
import type {
  WaterSurfaceAppearanceBinding,
  WaterSurfaceAppearanceBindingReadback
} from "../surface/WaterSurfaceAppearanceRuntimeTypes";
import {
  DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
  writeHeightfieldWaterReflectionSamplingSettings,
  type HeightfieldWaterReflectionSamplingConfig,
  type HeightfieldWaterReflectionSamplingReadback,
  type HeightfieldWaterReflectionSamplingSettings
} from "./HeightfieldWaterReflectionSampling";
import {
  DEFAULT_HEIGHTFIELD_WATER_LOCAL_FOAM_MASK,
  DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS,
  HEIGHTFIELD_WATER_RESOURCE_SUBMISSION_BUDGET_MS,
  HEIGHTFIELD_WATER_SHADER_PROPERTY
} from "./constants";
import type {
  HeightfieldWaterFeatureFlags,
  HeightfieldWaterLocalFoamMask,
  HeightfieldWaterMaterialState,
  HeightfieldWaterMeshBuildResult,
  HeightfieldWaterOpticsCalibrationReadback,
  HeightfieldWaterSurfaceAppearanceFeatureFlags,
  MutableHeightfieldWaterSurfaceOpticsBinding
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
  reflectionSampling: Readonly<HeightfieldWaterReflectionSamplingReadback>;
  surfaceOpticsReadback: Readonly<WaterSurfaceOpticsBindingReadback>;
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

export interface HeightfieldWaterRuntimeResourceMetrics {
  readonly retainedRuntimeSetCount: number;
  readonly activeRuntimeSetCount: 0 | 1;
  readonly activeDrawCount: number;
  readonly retainedMaterialCount: number;
  readonly retainedLocalMapTextureCount: number;
  readonly runtimeSetCreateCount: number;
  readonly runtimeSetDestroyCount: number;
  readonly materialCreateCount: number;
  readonly materialDestroyCount: number;
  readonly localMapTextureCreateCount: number;
  readonly localMapTextureDestroyCount: number;
  readonly meshCreateCount: number;
  readonly meshDestroyCount: number;
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
  private _runtimeSetCreateCount = 0;
  private _runtimeSetDestroyCount = 0;
  private _materialCreateCount = 0;
  private _materialDestroyCount = 0;
  private _localMapTextureCreateCount = 0;
  private _localMapTextureDestroyCount = 0;
  private _meshCreateCount = 0;
  private _meshDestroyCount = 0;
  private _debugMode = HeightfieldWaterDebugMode.Final;
  private _refractionEnabled = true;
  private _compositionMode = HeightfieldWaterCompositionMode.LegacyAlpha;
  private _depthWriteEnabled = false;
  private _renderPriority = 0;
  private _opticsCalibrationMode = HeightfieldWaterOpticsCalibrationMode.None;
  private _featureFlags: HeightfieldWaterFeatureFlags = Object.freeze({
    waves: true,
    microNormals: true,
    foam: true
  });
  private _localFoamMask: Readonly<HeightfieldWaterLocalFoamMask> = DEFAULT_HEIGHTFIELD_WATER_LOCAL_FOAM_MASK;
  private _surfaceTimeOverride?: number;
  private _requestedOpticsTier?: WaterOpticsTier;
  private _opticalProfile: WaterOpticalProfile = DEFAULT_WATER_OPTICAL_PROFILE;
  private _reflectionBinding?: Readonly<WaterReflectionBinding>;
  private _surfaceAppearanceBinding?: Readonly<WaterSurfaceAppearanceBinding>;
  private _surfaceAppearanceFeatureFlags: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags> =
    DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS;
  private readonly _reflectionSamplingSettings: HeightfieldWaterReflectionSamplingSettings = {
    ...DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS
  };
  private readonly _surfaceOpticsBinding: MutableHeightfieldWaterSurfaceOpticsBinding = {
    tier: "medium",
    opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
    refractionEnabled: true,
    reflection: undefined,
    reflectionSampling: DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
    debugView: HeightfieldWaterDebugMode.Final
  };

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

  /** Exact shared profile reference currently applied to every retained runtime set. */
  get opticalProfile(): WaterOpticalProfile {
    return this._opticalProfile;
  }

  get refractionEnabled(): boolean {
    return this._refractionEnabled;
  }

  get localFoamMask(): Readonly<HeightfieldWaterLocalFoamMask> {
    return this._localFoamMask;
  }

  /** Exact service binding reference most recently applied to every retained runtime set. */
  get reflectionBinding(): Readonly<WaterReflectionBinding> | undefined {
    return this._reflectionBinding;
  }

  /** Sanitized requested sampling settings, including the High-only filter request. */
  get reflectionSamplingSettings(): Readonly<HeightfieldWaterReflectionSamplingSettings> {
    return this._reflectionSamplingSettings;
  }

  /** Exact effective source, texture size, fades, distortion, and sample count of the active material. */
  get activeReflectionSampling(): Readonly<HeightfieldWaterReflectionSamplingReadback> | undefined {
    return this._activeSet?.reflectionSampling;
  }

  /** Stable shared P1 readback owned by the active Heightfield material. */
  get activeSurfaceOpticsReadback(): Readonly<WaterSurfaceOpticsBindingReadback> | undefined {
    return this._activeSet?.surfaceOpticsReadback;
  }

  /** Exact caller-owned binding retained for both active and future runtime sets. */
  get surfaceAppearanceBinding(): Readonly<WaterSurfaceAppearanceBinding> | undefined {
    return this._surfaceAppearanceBinding;
  }

  /** Stable fail-closed readback owned by the active Heightfield material. */
  get activeSurfaceAppearanceReadback(): Readonly<WaterSurfaceAppearanceBindingReadback> | undefined {
    return this._activeSet?.material.surfaceAppearanceReadback;
  }

  /** Frozen caller request reported separately from binding capability readback. */
  get surfaceAppearanceFeatureFlags(): Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags> {
    return this._surfaceAppearanceFeatureFlags;
  }

  get compositionMode(): HeightfieldWaterCompositionMode {
    return this._compositionMode;
  }

  get depthWriteEnabled(): boolean {
    return this._depthWriteEnabled;
  }

  /** Exact fixed material/query time applied to active and future runtime sets. */
  get surfaceTimeOverride(): number | undefined {
    return this._surfaceTimeOverride;
  }

  /** Configured renderer priority retained for both active and future chunks. */
  get renderPriority(): number {
    return this._renderPriority;
  }

  /** Actual active priority when every submitted chunk agrees; absent before activation or on drift. */
  get activeRenderPriority(): number | undefined {
    const chunks = this._activeSet?.chunks;
    if (!chunks || chunks.length === 0) return undefined;
    const priority = chunks[0].renderer.priority;
    return chunks.every((chunk) => chunk.renderer.priority === priority) ? priority : undefined;
  }

  /** Actual active material Blend state, used by the deterministic composition/order Gate. */
  get activeBlendEnabled(): boolean | undefined {
    const material = this._activeSet?.material.material;
    return material ? material.shaderData.getInt(HEIGHTFIELD_WATER_SHADER_PROPERTY.blendEnabled) !== 0 : undefined;
  }

  /** Stable calibration readback of the active material; absent before first activation. */
  get activeOpticsCalibrationReadback(): Readonly<HeightfieldWaterOpticsCalibrationReadback> | undefined {
    return this._activeSet?.material.opticsCalibrationReadback;
  }

  /** Monotonic upload count; it changes only when a new chunk mesh is submitted. */
  get meshUploadCount(): number {
    return this._meshUploadCount;
  }

  get resourceMetrics(): Readonly<HeightfieldWaterRuntimeResourceMetrics> {
    const retainedRuntimeSetCount = this._runtimeSets.size;
    return Object.freeze({
      retainedRuntimeSetCount,
      activeRuntimeSetCount: this._activeSet ? 1 : 0,
      activeDrawCount: this._activeSet?.chunks.length ?? 0,
      retainedMaterialCount: retainedRuntimeSetCount,
      retainedLocalMapTextureCount: retainedRuntimeSetCount,
      runtimeSetCreateCount: this._runtimeSetCreateCount,
      runtimeSetDestroyCount: this._runtimeSetDestroyCount,
      materialCreateCount: this._materialCreateCount,
      materialDestroyCount: this._materialDestroyCount,
      localMapTextureCreateCount: this._localMapTextureCreateCount,
      localMapTextureDestroyCount: this._localMapTextureDestroyCount,
      meshCreateCount: this._meshCreateCount,
      meshDestroyCount: this._meshDestroyCount
    });
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
    root.layer = this._root.layer;
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
      this._localMapTextureCreateCount++;
      localMapTexture.isGCIgnored = true;
      material = createHeightfieldWaterMaterial(
        this._engine,
        data.quality,
        data.waveSet,
        data.material,
        data.localMapAtlas,
        localMapTexture
      );
      this._materialCreateCount++;
      material.material.isGCIgnored = true;
      const surfaceOpticsReadback = this._applySurfaceOpticsBinding(material);
      const appliedSurfaceAppearanceBinding = this._surfaceAppearanceBinding;
      setHeightfieldWaterSurfaceAppearanceBinding(material, appliedSurfaceAppearanceBinding);
      setHeightfieldWaterSurfaceAppearanceFeatureFlags(material, this._surfaceAppearanceFeatureFlags);
      setHeightfieldWaterCompositionMode(material, this._compositionMode);
      setHeightfieldWaterDepthWriteEnabled(material, this._depthWriteEnabled);
      setHeightfieldWaterOpticsCalibrationMode(material, this._opticsCalibrationMode);
      setHeightfieldWaterFeatureFlags(material, this._featureFlags);
      setHeightfieldWaterLocalFoamMask(material, this._localFoamMask);
      setHeightfieldWaterSurfaceTimeOverride(material, this._surfaceTimeOverride);
      const reflectionSampling = material.heightfieldReflectionReadback;
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
        surfaceProvider,
        reflectionSampling,
        surfaceOpticsReadback
      };
      if (isCancelled()) throw new HeightfieldWaterRuntimeSubmissionCancelledError();
      if (this._surfaceAppearanceBinding !== appliedSurfaceAppearanceBinding) {
        this._applySurfaceAppearanceBinding(runtimeSet.material);
      }
      setHeightfieldWaterSurfaceAppearanceFeatureFlags(runtimeSet.material, this._surfaceAppearanceFeatureFlags);
      runtimeSet.surfaceOpticsReadback = this._applySurfaceOpticsBinding(runtimeSet.material);
      runtimeSet.reflectionSampling = runtimeSet.material.heightfieldReflectionReadback;
      this._deactivateAll();
      runtimeSet.root.isActive = true;
      this._runtimeSets.set(waterBodyId, runtimeSet);
      this._runtimeSetCreateCount++;
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
      if (material) {
        material.material.destroy(true);
        this._materialDestroyCount++;
      }
      if (localMapTexture) {
        localMapTexture.destroy(true);
        this._localMapTextureDestroyCount++;
      }
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

  setOpticalProfile(profile: WaterOpticalProfile): void {
    this._opticalProfile = profile;
    this._refreshSurfaceOpticsBindings();
  }

  /** Applies a fresh service binding even when the service mutates and reuses the same object. */
  setReflectionBinding(binding?: Readonly<WaterReflectionBinding>): void {
    this._reflectionBinding = binding;
    this._refreshSurfaceOpticsBindings();
  }

  setReflectionSamplingConfig(config: HeightfieldWaterReflectionSamplingConfig): void {
    writeHeightfieldWaterReflectionSamplingSettings(config, this._reflectionSamplingSettings);
    this._refreshSurfaceOpticsBindings();
  }

  setDebugMode(mode: HeightfieldWaterDebugMode): void {
    this._debugMode = mode;
    this._refreshSurfaceOpticsBindings();
  }

  setRefractionEnabled(enabled: boolean): void {
    this._refractionEnabled = enabled;
    this._refreshSurfaceOpticsBindings();
  }

  /** Replaces the complete shared P1 contract; legacy setters update the same cached binding. */
  setSurfaceOpticsBinding(binding: Readonly<WaterSurfaceOpticsBinding>): void {
    this._requestedOpticsTier = binding.tier;
    this._opticalProfile = binding.opticalProfile;
    this._refractionEnabled = binding.refractionEnabled;
    this._reflectionBinding = binding.reflection;
    writeHeightfieldWaterReflectionSamplingSettings(
      binding.reflectionSampling ?? DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
      this._reflectionSamplingSettings
    );
    this._debugMode = binding.debugView as HeightfieldWaterDebugMode;
    this._refreshSurfaceOpticsBindings();
  }

  /**
   * Applies a caller-owned texture binding to all retained materials.
   * Detach replaces the shader reference and texture slot but never destroys the borrowed texture.
   */
  setSurfaceAppearanceBinding(binding?: Readonly<WaterSurfaceAppearanceBinding>): void {
    if (this._destroyed) throw new Error("Heightfield water runtime controller has been destroyed.");
    this._surfaceAppearanceBinding = binding;
    for (const runtimeSet of this._runtimeSets.values()) {
      this._applySurfaceAppearanceBinding(runtimeSet.material);
    }
  }

  setSurfaceAppearanceFeatureFlags(flags: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags>): void {
    if (this._destroyed) throw new Error("Heightfield water runtime controller has been destroyed.");
    const snapshot = Object.freeze({
      externalNormal: flags.externalNormal === true,
      depthTint: flags.depthTint === true,
      coastalAlpha: flags.coastalAlpha === true,
      contactFoam: flags.contactFoam === true,
      directSpecular: flags.directSpecular === true
    });
    this._surfaceAppearanceFeatureFlags = snapshot;
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterSurfaceAppearanceFeatureFlags(runtimeSet.material, snapshot);
    }
  }

  setCompositionMode(mode: HeightfieldWaterCompositionMode): void {
    this._compositionMode = mode;
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterCompositionMode(runtimeSet.material, mode);
    }
  }

  setDepthWriteEnabled(enabled: boolean): void {
    this._depthWriteEnabled = enabled;
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterDepthWriteEnabled(runtimeSet.material, enabled);
    }
  }

  setRenderPriority(priority: number): void {
    if (!Number.isFinite(priority)) throw new RangeError("Heightfield water render priority must be finite.");
    this._renderPriority = priority;
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const chunk of runtimeSet.chunks) chunk.renderer.priority = priority;
    }
  }

  setOpticsCalibrationMode(mode: HeightfieldWaterOpticsCalibrationMode): void {
    this._opticsCalibrationMode =
      mode === HeightfieldWaterOpticsCalibrationMode.CpuReference ||
      mode === HeightfieldWaterOpticsCalibrationMode.PureTransmission
        ? mode
        : HeightfieldWaterOpticsCalibrationMode.None;
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterOpticsCalibrationMode(runtimeSet.material, this._opticsCalibrationMode);
    }
  }

  setFeatureFlags(flags: HeightfieldWaterFeatureFlags): void {
    this._featureFlags = Object.freeze({ ...flags });
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterFeatureFlags(runtimeSet.material, flags);
      runtimeSet.surfaceProvider.setWavesEnabled(flags.waves);
    }
  }

  setLocalFoamMask(mask: Readonly<HeightfieldWaterLocalFoamMask>): void {
    const snapshot = Object.freeze({
      enabled: mask.enabled === true,
      centerXZ: Object.freeze([mask.centerXZ[0], mask.centerXZ[1]] as const),
      halfSizeXZ: Object.freeze([mask.halfSizeXZ[0], mask.halfSizeXZ[1]] as const),
      featherMeters: mask.featherMeters
    });
    const values = [...snapshot.centerXZ, ...snapshot.halfSizeXZ, snapshot.featherMeters];
    if (
      values.some((value) => !Number.isFinite(value)) ||
      snapshot.halfSizeXZ[0] < 0 ||
      snapshot.halfSizeXZ[1] < 0 ||
      snapshot.featherMeters < 0
    ) {
      throw new RangeError("Heightfield local foam mask values must be finite and non-negative.");
    }
    for (const runtimeSet of this._runtimeSets.values())
      setHeightfieldWaterLocalFoamMask(runtimeSet.material, snapshot);
    this._localFoamMask = snapshot;
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
    this._surfaceAppearanceBinding = undefined;
    this._pendingResourceGc = true;
  }

  private _applySurfaceOpticsBinding(
    material: HeightfieldWaterMaterialState
  ): Readonly<WaterSurfaceOpticsBindingReadback> {
    const binding = this._surfaceOpticsBinding;
    binding.tier = this._requestedOpticsTier ?? (material.quality === WaterQualityTier.High ? "high" : "medium");
    binding.opticalProfile = this._opticalProfile;
    binding.refractionEnabled = this._refractionEnabled;
    binding.reflection = this._reflectionBinding;
    binding.reflectionSampling = this._reflectionSamplingSettings;
    binding.debugView = this._debugMode;
    return setHeightfieldWaterSurfaceOpticsBinding(material, binding);
  }

  private _refreshSurfaceOpticsBindings(): void {
    for (const runtimeSet of this._runtimeSets.values()) {
      runtimeSet.surfaceOpticsReadback = this._applySurfaceOpticsBinding(runtimeSet.material);
      runtimeSet.reflectionSampling = runtimeSet.material.heightfieldReflectionReadback;
    }
  }

  private _applySurfaceAppearanceBinding(
    material: HeightfieldWaterMaterialState
  ): Readonly<WaterSurfaceAppearanceBindingReadback> {
    return setHeightfieldWaterSurfaceAppearanceBinding(material, this._surfaceAppearanceBinding);
  }

  private _createChunk(
    chunk: HeightfieldWaterCompiledChunk,
    runtimeRoot: Entity,
    material: HeightfieldWaterMaterialState,
    releaseCpuData: boolean,
    boundsPadding: number
  ): MutableHeightfieldWaterChunk {
    const root = runtimeRoot.createChild(`heightfield-water-chunk-${chunk.id}`);
    root.layer = runtimeRoot.layer;
    root.transform.setPosition(chunk.localOrigin[0], chunk.localOrigin[1], chunk.localOrigin[2]);
    const renderer = root.addComponent(MeshRenderer);
    renderer.priority = this._renderPriority;
    const meshes = uploadHeightfieldWaterMesh(this._engine, chunk.geometry, { releaseCpuData, boundsPadding });
    this._meshCreateCount++;
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
    this._meshDestroyCount++;
  }

  private _destroyRuntimeSet(runtimeSet: MutableHeightfieldWaterRuntimeSet): void {
    for (const chunk of runtimeSet.chunks) this._destroyChunk(chunk);
    runtimeSet.material.material.destroy(true);
    this._materialDestroyCount++;
    runtimeSet.localMapTexture.destroy(true);
    this._localMapTextureDestroyCount++;
    runtimeSet.root.destroy();
    runtimeSet.resource.release();
    this._runtimeSetDestroyCount++;
  }
}
