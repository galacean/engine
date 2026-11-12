import { createWaterConnectionBinding, type WaterConnectionBinding } from "../connections/WaterConnectionBinding";
import { updateWaterSurfaceAppearanceV2Clock } from "../surface/WaterSurfaceAppearanceV2UniformBinding";
/** Heightfield-water GPU lifecycle: hidden build root, sliced upload, atomic swap, and deterministic cleanup. */
import { Engine, Entity, MeshRenderer, Script, Texture2D } from "@galacean/engine-core";
import {
  acquireSurfaceRainRippleNormalAtlas,
  type SurfaceRainRippleNormalAtlasLease
} from "@galacean/engine-environment/weather/SurfaceRainRippleNormalAtlas";
import { Vector4 } from "@galacean/engine-math";
import type { HeightfieldWaterVisualUniformConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import { WaterSurfaceDepthSource } from "../../authoring/surface/enums/WaterSurfaceDepthSource";
import { WaterSurfaceDepthResponseModelV2 } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type {
  HeightfieldWaterCompiledChunk,
  HeightfieldWaterCompiledData
} from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import type { WaterCameraVisibilityProvider, WaterTerrainOcclusionProvider } from "../body/WaterBackendRegistry";
import { compileWaterPlanarTransform, type CompiledWaterPlanarTransformV1 } from "../body/WaterPlanarTransform";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import type {
  WaterOpticsTier,
  WaterSurfaceOpticsBinding,
  WaterSurfaceOpticsBindingReadback
} from "../optics/WaterSurfaceOpticsTypes";
import type {
  WaterSurfaceAppearanceBindingReadback,
  WaterSurfaceAppearanceBindingV2
} from "../surface/WaterSurfaceAppearanceRuntimeTypes";
import { applyWaterSurfaceRendererContract } from "../surface/WaterSurfaceRendererContract";
import {
  DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS,
  HEIGHTFIELD_WATER_RESOURCE_SUBMISSION_BUDGET_MS,
  HEIGHTFIELD_WATER_SHADER_PROPERTY
} from "./constants";
import { createHeightfieldWaterLocalMapTexture } from "./HeightfieldWaterLocalMapTextureFactory";
import {
  bindHeightfieldWaterPlanarTransform,
  updateHeightfieldWaterWavePhases
} from "./HeightfieldWaterMaterialBinding";
import {
  createHeightfieldWaterMaterial,
  disableHeightfieldWaterScreenSpaceReflectionReceiver,
  setHeightfieldWaterCompositionMode,
  setHeightfieldWaterDepthWriteEnabled,
  setHeightfieldWaterFeatureFlags,
  setHeightfieldWaterPresentationReveal,
  setHeightfieldWaterScreenSpaceReflectionCompositeIntensity,
  setHeightfieldWaterSurfaceAppearanceBinding,
  setHeightfieldWaterSurfaceAppearanceFeatureFlags,
  setHeightfieldWaterSurfaceOpticsBinding,
  setHeightfieldWaterSurfaceTimeOverride,
  updateHeightfieldWaterMaterial,
  updateHeightfieldWaterTransientOpticalProfile
} from "./HeightfieldWaterMaterialFactory";
import { uploadHeightfieldWaterMesh } from "./HeightfieldWaterMeshUploader";
import { HeightfieldWaterBaseQueryService } from "./HeightfieldWaterQueryService";
import {
  DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
  writeHeightfieldWaterReflectionSamplingSettings,
  type HeightfieldWaterReflectionSamplingConfig,
  type HeightfieldWaterReflectionSamplingSettings
} from "./HeightfieldWaterReflectionSampling";
import { HeightfieldWaterResource } from "./HeightfieldWaterResource";
import { HeightfieldWaterCompositionMode } from "./HeightfieldWaterRuntimeEnums";
import { HeightfieldWaterSpatialFieldProvider } from "./HeightfieldWaterSpatialFieldProvider";
import { HeightfieldWaterSurfaceProvider } from "./HeightfieldWaterSurfaceProvider";
import {
  createHeightfieldWaterVisibilityBounds,
  updateHeightfieldWaterVisibilityWorldBounds,
  type HeightfieldWaterVisibilityBounds
} from "./HeightfieldWaterVisibilityBounds";
import type {
  HeightfieldWaterFeatureFlags,
  HeightfieldWaterMaterialState,
  HeightfieldWaterMeshBuildResult,
  HeightfieldWaterSurfaceAppearanceFeatureFlags,
  MutableHeightfieldWaterSurfaceOpticsBinding
} from "./types";

interface MutableHeightfieldWaterChunk {
  readonly root: Entity;
  readonly renderer: MeshRenderer;
  readonly compiled: HeightfieldWaterCompiledChunk;
  readonly meshes: HeightfieldWaterMeshBuildResult;
  readonly visibilityBounds: HeightfieldWaterVisibilityBounds[];
  readonly terrainOcclusionKeys: string[];
  terrainOccluded: boolean;
}

interface MutableHeightfieldWaterRuntimeSet {
  readonly root: Entity;
  readonly resource: HeightfieldWaterResource;
  readonly chunks: MutableHeightfieldWaterChunk[];
  readonly material: HeightfieldWaterMaterialState;
  readonly localMapTexture: Texture2D;
  readonly connectionBinding?: WaterConnectionBinding;
  readonly queryService: HeightfieldWaterBaseQueryService;
  readonly surfaceProvider: HeightfieldWaterSurfaceProvider;
  readonly spatialFieldProvider: HeightfieldWaterSpatialFieldProvider;
  readonly planarTransform: Readonly<CompiledWaterPlanarTransformV1>;
  readonly visibilityWorldMatrixElements: Float32Array;
  visibilityWorldMatrixInitialized: boolean;

  surfaceOpticsReadback: Readonly<WaterSurfaceOpticsBindingReadback>;
}

function createHeightfieldWaterMaterialSnapshot(
  config: HeightfieldWaterVisualUniformConfig
): Readonly<HeightfieldWaterVisualUniformConfig> {
  return Object.freeze({
    ...config,
    shallowColor: Object.freeze([...config.shallowColor] as [number, number, number, number]),
    deepColor: Object.freeze([...config.deepColor] as [number, number, number, number])
  });
}

function deriveHeightfieldVisualUniforms(
  binding: Readonly<WaterSurfaceAppearanceBindingV2>,
  waveStrength: number
): Readonly<HeightfieldWaterVisualUniformConfig> {
  const appearance = binding.appearance;
  const renderContract = binding.renderContract;
  if (!renderContract) throw new Error("Heightfield appearance binding requires its Effective RenderContract.");
  const depth = appearance.depthResponse;
  const fallback = renderContract.optics.profile.scatteringColor;
  let shallowColor: readonly [number, number, number, number] = Object.freeze([
    fallback[0],
    fallback[1],
    fallback[2],
    1
  ] as const);
  let deepColor = shallowColor;
  if (depth.model === WaterSurfaceDepthResponseModelV2.PowerRamp) {
    shallowColor = depth.color;
    deepColor = depth.color;
  } else if (depth.model === WaterSurfaceDepthResponseModelV2.ColorRamp) {
    shallowColor = depth.colors[0]?.color ?? shallowColor;
    deepColor = depth.colors.at(-1)?.color ?? shallowColor;
  } else if (depth.model === WaterSurfaceDepthResponseModelV2.CompositeExponential) {
    shallowColor = depth.shallowColor;
    deepColor = depth.deepColor;
  }
  const foam = appearance.boundaryEffects.find((effect) => effect.outputs.color !== undefined);
  return Object.freeze({
    shallowColor,
    deepColor,
    opacity: shallowColor[3],
    shoreDampingWidth: foam?.rangeMeters ?? 0,

    waveStrength
  });
}

export interface HeightfieldWaterRuntimeActivation {
  readonly created: true;
  readonly sourceId: string;
  readonly queryService: HeightfieldWaterBaseQueryService;
  readonly surfaceProvider: HeightfieldWaterSurfaceProvider;
  readonly spatialFieldProvider: HeightfieldWaterSpatialFieldProvider;
  readonly planarTransform: Readonly<CompiledWaterPlanarTransformV1>;
  readonly maxSliceMs: number;
}

export interface HeightfieldWaterRuntimeSubmissionOptions {
  readonly frameBudgetMs?: number;
  readonly now?: () => number;
  readonly yieldToMainThread?: () => Promise<void>;
  readonly shouldCancel?: () => boolean;
  readonly releaseMeshCpuData?: boolean;
  readonly planarTransform?: Readonly<CompiledWaterPlanarTransformV1>;
}

const IDENTITY_HEIGHTFIELD_WATER_PLANAR_TRANSFORM = compileWaterPlanarTransform({
  position: [0, 0, 0],
  yawDegrees: 0,
  scaleXZ: [1, 1]
});

export class HeightfieldWaterRuntimeSubmissionCancelledError extends Error {
  constructor() {
    super("Heightfield water runtime submission was superseded by a newer request.");
    this.name = "HeightfieldWaterRuntimeSubmissionCancelledError";
  }
}

/** Controller-root lifetime, shared by all passes/cameras; absolute time makes seek stateless. */
class HeightfieldWaterWaveClock extends Script {
  updatePhases?: () => void;

  override onLateUpdate(): void {
    this.updatePhases?.();
  }
}

function cleanupRuntime(actions: readonly (() => void)[], errors: unknown[] = []): void {
  for (const action of actions) {
    try {
      action();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Heightfield runtime cleanup reported multiple errors.");
}

export class HeightfieldWaterRuntimeController {
  private readonly _rainRippleNormalAtlasLease: SurfaceRainRippleNormalAtlasLease | undefined;
  private readonly _runtimeSets = new Map<string, MutableHeightfieldWaterRuntimeSet>();
  private _waveClock?: HeightfieldWaterWaveClock;
  private _lastWaveTime?: number;
  private _activeId?: string;
  private _activeSet?: MutableHeightfieldWaterRuntimeSet;
  private _submissionGeneration = 0;
  private _destroyed = false;
  private _refractionEnabled = true;
  private _compositionMode = HeightfieldWaterCompositionMode.AlphaBlend;
  private _depthWriteEnabled = false;
  private _depthSource = WaterSurfaceDepthSource.SceneDepth;
  private _renderPriority = 0;
  private _featureFlags: HeightfieldWaterFeatureFlags = Object.freeze({
    waves: true,
    microNormals: true
  });
  private _surfaceTimeOverride?: number;
  private _surfaceLevelOffsetMetres = 0;
  private _presentationRevealProgress = 1;
  private _presentationRevealBand = 0.035;
  private _presentationRevealRepeat: readonly [number, number] = Object.freeze([1, 1] as const);
  private _requestedOpticsTier?: WaterOpticsTier;
  private _opticalProfile: WaterOpticalProfile = DEFAULT_WATER_OPTICAL_PROFILE;
  private _screenSpaceReflectionCompositeIntensity = 1;
  private _reflectionBinding?: Readonly<WaterReflectionBinding>;
  private _reflectionBindingApplied = false;
  private _appliedReflectionBindingRevision?: number;
  private _surfaceAppearanceBinding?: Readonly<WaterSurfaceAppearanceBindingV2>;
  private _activeMaterialConfig?: Readonly<HeightfieldWaterVisualUniformConfig>;
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
    reflectionSampling: DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS
  };

  /** Authored native surface shader; runtime bindings remain owned by this controller. */
  surfaceShader?: import("@galacean/engine-core").Shader;

  constructor(
    private readonly _engine: Engine,
    private readonly _root: Entity,
    private readonly _materialQuality: WaterQualityTier
  ) {
    const scene = _root.scene;
    this._rainRippleNormalAtlasLease = scene ? acquireSurfaceRainRippleNormalAtlas(scene) : undefined;
  }

  private readonly _updateWaveClock = (force = false): void => {
    const active = this._activeSet;
    if (!active) return;
    const elapsedTime = this._surfaceTimeOverride ?? this._engine.time.elapsedTime;
    const time = Number.isFinite(elapsedTime) ? Math.max(0, elapsedTime) : 0;
    // S1 must advance even for None/zero amplitude. S2 FlowSurface and
    // local FlowAdvected still consume shader surfaceTime mod4096.
    updateWaterSurfaceAppearanceV2Clock(active.material.material, time, force);
    const data = active.resource.data;
    if (!this._featureFlags.waves || data.waveSet.maxVerticalDisplacement <= 0 || data.surfaceMotion.waveStrength <= 0)
      return;
    if (!force && time === this._lastWaveTime) return;
    updateHeightfieldWaterWavePhases(active.material.material, data.waveSet, time);
    this._lastWaveTime = time;
  };

  private _refreshWaveClock(): void {
    if (!this._waveClock) {
      this._waveClock = this._root.addComponent(HeightfieldWaterWaveClock);
      this._waveClock.updatePhases = this._updateWaveClock;
    }
    this._updateWaveClock(true);
  }

  get activeId(): string | undefined {
    return this._activeId;
  }

  get activeData(): HeightfieldWaterCompiledData | undefined {
    return this._activeSet?.resource.data;
  }

  get activeMaterialConfig(): Readonly<HeightfieldWaterVisualUniformConfig> | undefined {
    return this._activeMaterialConfig;
  }

  get activeQueryService(): HeightfieldWaterBaseQueryService | undefined {
    return this._activeSet?.queryService;
  }

  get activeSurfaceProvider(): HeightfieldWaterSurfaceProvider | undefined {
    return this._activeSet?.surfaceProvider;
  }

  get activeSpatialFieldProvider(): HeightfieldWaterSpatialFieldProvider | undefined {
    return this._activeSet?.spatialFieldProvider;
  }

  /** Applies one shared World Horizon to active finite chunks without changing authored visibility. */
  refreshTerrainOcclusion(provider?: WaterTerrainOcclusionProvider): void {
    const activeSet = this._activeSet;
    const chunks = activeSet?.chunks;
    if (!activeSet || !chunks) {
      return;
    }
    this._updateVisibilityWorldBounds(activeSet);
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex]!;
      const renderer = chunk.renderer;
      let occludedBoundsCount = 0;
      for (let index = 0; index < chunk.visibilityBounds.length; index++) {
        const visibilityBounds = chunk.visibilityBounds[index]!;
        visibilityBounds.terrainOccluded =
          provider !== undefined &&
          renderer.entity.isActiveInHierarchy &&
          provider.isOccluded(chunk.terrainOcclusionKeys[index]!, visibilityBounds.worldBounds);
        if (visibilityBounds.terrainOccluded) {
          occludedBoundsCount++;
        }
      }
      const occluded = chunk.visibilityBounds.length > 0 && occludedBoundsCount === chunk.visibilityBounds.length;
      chunk.terrainOccluded = occluded;
      if (renderer.enabled === occluded) {
        renderer.enabled = !occluded;
      }
    }
  }

  /** True when at least one non-occluded surface region intersects the current source-Camera frustum. */
  hasCameraVisibleSurfaceChunk(provider: WaterCameraVisibilityProvider): boolean {
    const activeSet = this._activeSet;
    if (!activeSet) {
      return false;
    }
    this._updateVisibilityWorldBounds(activeSet);
    const chunks = activeSet.chunks;
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex]!;
      const renderer = chunk.renderer;
      if (!renderer.enabled || !renderer.entity.isActiveInHierarchy) {
        continue;
      }
      const layer = renderer.entity.layer;
      const visibilityBounds = chunk.visibilityBounds;
      for (let boundsIndex = 0; boundsIndex < visibilityBounds.length; boundsIndex++) {
        const bounds = visibilityBounds[boundsIndex]!;
        if (!bounds.terrainOccluded && provider.isVisible(bounds.worldBounds, layer)) {
          return true;
        }
      }
    }
    return false;
  }

  /** Render-only vertical offset shared by active and future runtime sets. */
  get surfaceLevelOffsetMetres(): number {
    return this._surfaceLevelOffsetMetres;
  }

  /** Exact shared profile reference currently applied to every retained runtime set. */
  get opticalProfile(): WaterOpticalProfile {
    return this._opticalProfile;
  }

  get refractionEnabled(): boolean {
    return this._refractionEnabled;
  }

  /** Exact service binding reference most recently applied to every retained runtime set. */
  get reflectionBinding(): Readonly<WaterReflectionBinding> | undefined {
    return this._reflectionBinding;
  }

  /** Requested Water Forward composite weight; Camera SSR and its lease are intentionally independent. */
  get screenSpaceReflectionCompositeIntensity(): number {
    return this._screenSpaceReflectionCompositeIntensity;
  }

  get screenSpaceReflectionConsumptionEnabled(): boolean {
    return this._screenSpaceReflectionCompositeIntensity > 0;
  }

  /** Sanitized requested sampling settings, including the High-only filter request. */
  get reflectionSamplingSettings(): Readonly<HeightfieldWaterReflectionSamplingSettings> {
    return this._reflectionSamplingSettings;
  }

  /** Stable shared P1 readback owned by the active Heightfield material. */
  get activeSurfaceOpticsReadback(): Readonly<WaterSurfaceOpticsBindingReadback> | undefined {
    return this._activeSet?.surfaceOpticsReadback;
  }

  /** Exact caller-owned binding retained for both active and future runtime sets. */
  get surfaceAppearanceBinding(): Readonly<WaterSurfaceAppearanceBindingV2> | undefined {
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

  get featureFlags(): Readonly<HeightfieldWaterFeatureFlags> {
    return this._featureFlags;
  }

  get compositionMode(): HeightfieldWaterCompositionMode {
    return this._compositionMode;
  }

  get depthWriteEnabled(): boolean {
    return this._depthWriteEnabled;
  }

  get depthSource(): WaterSurfaceDepthSource {
    return this._depthSource;
  }

  /** Exact fixed material/query time applied to active and future runtime sets. */
  get surfaceTimeOverride(): number | undefined {
    return this._surfaceTimeOverride;
  }

  /** Configured renderer priority retained for both active and future chunks. */
  get renderPriority(): number {
    return this._renderPriority;
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
    const planarTransform = options.planarTransform ?? IDENTITY_HEIGHTFIELD_WATER_PLANAR_TRANSFORM;
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
    root.transform.setPosition(0, this._surfaceLevelOffsetMetres, 0);
    let localMapTexture: Texture2D | undefined;
    let material: HeightfieldWaterMaterialState | undefined;
    let connectionBinding: WaterConnectionBinding | undefined;
    const chunks: MutableHeightfieldWaterChunk[] = [];
    let maxSliceMs = 0;
    let activated = false;
    const isCancelled = (): boolean =>
      this._destroyed || generation !== this._submissionGeneration || options.shouldCancel?.() === true;

    try {
      localMapTexture = createHeightfieldWaterLocalMapTexture(this._engine, data.localMapAtlas);
      localMapTexture.isGCIgnored = true;
      const appliedSurfaceAppearanceBinding = this._surfaceAppearanceBinding;
      if (!appliedSurfaceAppearanceBinding) {
        throw new Error(
          "Heightfield water runtime requires a resolved Surface Appearance V2 binding before activation."
        );
      }
      material = createHeightfieldWaterMaterial(
        this._engine,
        this._materialQuality,
        data.waveSet,
        deriveHeightfieldVisualUniforms(appliedSurfaceAppearanceBinding, data.surfaceMotion.waveStrength),
        data.localMapAtlas,
        localMapTexture,
        this._depthSource,
        appliedSurfaceAppearanceBinding
      );
      if (this.surfaceShader) material.material.shader = this.surfaceShader;
      connectionBinding = createWaterConnectionBinding(this._engine, data.connections);
      connectionBinding?.bind(material.material);
      material.material.isGCIgnored = true;
      bindHeightfieldWaterPlanarTransform(material.material, planarTransform);
      const surfaceOpticsReadback = this._applySurfaceOpticsBinding(material);
      setHeightfieldWaterScreenSpaceReflectionCompositeIntensity(
        material,
        this._screenSpaceReflectionCompositeIntensity
      );
      setHeightfieldWaterSurfaceAppearanceFeatureFlags(material, this._surfaceAppearanceFeatureFlags);
      setHeightfieldWaterCompositionMode(material, this._compositionMode);
      setHeightfieldWaterDepthWriteEnabled(material, this._depthWriteEnabled);
      setHeightfieldWaterFeatureFlags(material, this._featureFlags);
      setHeightfieldWaterPresentationReveal(
        material,
        this._presentationRevealProgress,
        this._presentationRevealBand,
        this._presentationRevealRepeat
      );
      setHeightfieldWaterSurfaceTimeOverride(material, this._surfaceTimeOverride);
      let sliceStart = now();
      for (const chunk of data.chunks) {
        if (isCancelled()) throw new HeightfieldWaterRuntimeSubmissionCancelledError();
        chunks.push(
          this._createChunk(
            waterBodyId,
            chunk,
            root,
            material,
            options.releaseMeshCpuData ?? false,
            data.waveSet.maxVerticalDisplacement * data.surfaceMotion.waveStrength
          )
        );
        const sliceDuration = now() - sliceStart;
        maxSliceMs = Math.max(maxSliceMs, sliceDuration);
        if (sliceDuration >= frameBudgetMs && chunks.length < data.chunks.length) {
          await yieldToMainThread();
          if (isCancelled()) throw new HeightfieldWaterRuntimeSubmissionCancelledError();
          sliceStart = now();
        }
      }

      const queryService = new HeightfieldWaterBaseQueryService(data, planarTransform);
      const surfaceProvider = new HeightfieldWaterSurfaceProvider({
        waterBodyId,
        data,
        queryService,
        getElapsedTime: () => this._engine.time.elapsedTime,
        wavesEnabled: this._featureFlags.waves,
        planarTransform
      });
      surfaceProvider.setSurfaceTimeOverride(this._surfaceTimeOverride);
      const spatialFieldProvider = new HeightfieldWaterSpatialFieldProvider(data, localMapTexture, planarTransform);
      const runtimeSet: MutableHeightfieldWaterRuntimeSet = {
        root,
        resource,
        chunks,
        material,
        localMapTexture,
        connectionBinding,
        queryService,
        surfaceProvider,
        spatialFieldProvider,
        planarTransform,
        visibilityWorldMatrixElements: new Float32Array(16),
        visibilityWorldMatrixInitialized: false,

        surfaceOpticsReadback
      };
      this._updateVisibilityWorldBounds(runtimeSet);
      if (isCancelled()) throw new HeightfieldWaterRuntimeSubmissionCancelledError();
      if (this._surfaceAppearanceBinding !== appliedSurfaceAppearanceBinding) {
        this._applySurfaceAppearanceBinding(runtimeSet.material);
      }
      setHeightfieldWaterSurfaceAppearanceFeatureFlags(runtimeSet.material, this._surfaceAppearanceFeatureFlags);
      runtimeSet.surfaceOpticsReadback = this._applySurfaceOpticsBinding(runtimeSet.material);
      this._deactivateAll();
      runtimeSet.root.isActive = true;
      this._runtimeSets.set(waterBodyId, runtimeSet);
      this._activeId = waterBodyId;
      this._activeSet = runtimeSet;
      this._refreshWaveClock();
      this._activeMaterialConfig = createHeightfieldWaterMaterialSnapshot(
        deriveHeightfieldVisualUniforms(appliedSurfaceAppearanceBinding, data.surfaceMotion.waveStrength)
      );
      activated = true;
      if (previous) {
        this._destroyRuntimeSet(previous);
      }
      return {
        created: true,
        sourceId: data.sourceId,
        queryService: runtimeSet.queryService,
        surfaceProvider: runtimeSet.surfaceProvider,
        spatialFieldProvider: runtimeSet.spatialFieldProvider,
        planarTransform: runtimeSet.planarTransform,
        maxSliceMs
      };
    } catch (error) {
      if (activated) throw error;
      cleanupRuntime(
        [
          () => {
            if (material) disableHeightfieldWaterScreenSpaceReflectionReceiver(material);
          },
          () => {
            if (material) connectionBinding?.unbind(material.material);
          },
          () => {
            if (material) {
              material.material.destroy(true);
            }
          },
          () => connectionBinding?.destroy(),
          ...chunks.map((chunk) => () => this._destroyChunk(chunk)),
          () => {
            if (localMapTexture) {
              localMapTexture.destroy(true);
            }
          },
          () => root.destroy(),
          () => resource.release()
        ],
        [error]
      );
      throw error;
    }
  }

  setOpticalProfile(profile: WaterOpticalProfile): void {
    this._opticalProfile = profile;
    this._surfaceOpticsBinding.opticalProfile = profile;
    for (const runtimeSet of this._runtimeSets.values()) {
      runtimeSet.surfaceOpticsReadback = updateHeightfieldWaterTransientOpticalProfile(runtimeSet.material, profile);
    }
  }

  /** Applies a fresh service binding even when the service mutates and reuses the same object. */
  setReflectionBinding(binding?: Readonly<WaterReflectionBinding>): void {
    if (this._isReflectionBindingCurrent(binding)) return;
    this._reflectionBinding = binding;
    for (const runtimeSet of this._runtimeSets.values()) {
      runtimeSet.surfaceOpticsReadback = runtimeSet.material.bindingReadback;
    }
    this._recordAppliedReflectionBinding(binding);
  }

  /** Changes only Water Forward SSR consumption and keeps Camera SSR acquisition/Surface receiver state intact. */
  setScreenSpaceReflectionCompositeIntensity(intensity: number): void {
    const resolvedIntensity = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
    this._screenSpaceReflectionCompositeIntensity = resolvedIntensity;
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterScreenSpaceReflectionCompositeIntensity(runtimeSet.material, resolvedIntensity);
    }
  }

  setScreenSpaceReflectionConsumptionEnabled(enabled: boolean): void {
    this.setScreenSpaceReflectionCompositeIntensity(enabled ? 1 : 0);
  }

  setReflectionSamplingConfig(config: HeightfieldWaterReflectionSamplingConfig): void {
    writeHeightfieldWaterReflectionSamplingSettings(config, this._reflectionSamplingSettings);
    this._refreshSurfaceOpticsBindings();
  }

  setRefractionEnabled(enabled: boolean): void {
    this._refractionEnabled = enabled;
    this._refreshSurfaceOpticsBindings();
  }

  /**
   * Advances a temporary noise-dissolve reveal without rebuilding water geometry or data resources.
   * @param progress Normalized reveal completion, where `1` uses the unmodified material variant.
   * @param band Normalized width of the dissolve edge within one repeated tile.
   * @param repeat Number of repeated noise tiles across local X/Z UV space.
   * @returns Nothing.
   * @throws If values are not finite or the crest width is not positive.
   */
  setPresentationRevealProgress(
    progress: number,
    band = this._presentationRevealBand,
    repeat: readonly [number, number] = this._presentationRevealRepeat
  ): void {
    if (
      !Number.isFinite(progress) ||
      !Number.isFinite(band) ||
      band <= 0 ||
      !Number.isFinite(repeat[0]) ||
      !Number.isFinite(repeat[1]) ||
      repeat[0] < 1 ||
      repeat[1] < 1
    ) {
      throw new RangeError("Heightfield water presentation reveal values must be finite and positive.");
    }
    this._presentationRevealProgress = Math.min(1, Math.max(0, progress));
    this._presentationRevealBand = band;
    this._presentationRevealRepeat = Object.freeze([repeat[0], repeat[1]] as [number, number]);
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterPresentationReveal(
        runtimeSet.material,
        this._presentationRevealProgress,
        this._presentationRevealBand,
        this._presentationRevealRepeat
      );
    }
  }

  /** Replaces the complete shared Surface Optics contract. */
  setSurfaceOpticsBinding(binding: Readonly<WaterSurfaceOpticsBinding>): void {
    this._requestedOpticsTier = binding.tier;
    this._opticalProfile = binding.opticalProfile;
    this._refractionEnabled = binding.refractionEnabled;
    this._reflectionBinding = binding.reflection;
    writeHeightfieldWaterReflectionSamplingSettings(
      binding.reflectionSampling ?? DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
      this._reflectionSamplingSettings
    );
    this._refreshSurfaceOpticsBindings();
  }

  /**
   * Applies a caller-owned texture binding to all retained materials.
   * Detach replaces the shader reference and texture slot but never destroys the borrowed texture.
   */
  setSurfaceAppearanceBinding(binding: Readonly<WaterSurfaceAppearanceBindingV2>): void {
    if (this._destroyed) throw new Error("Heightfield water runtime controller has been destroyed.");
    if (!binding || !("textureBindings" in binding)) {
      throw new TypeError("Heightfield water runtime requires a Surface Appearance V2 binding; detach is unsupported.");
    }
    this._surfaceAppearanceBinding = binding;
    for (const runtimeSet of this._runtimeSets.values()) {
      this._applySurfaceAppearanceBinding(runtimeSet.material);
      const visual = deriveHeightfieldVisualUniforms(binding, runtimeSet.resource.data.surfaceMotion.waveStrength);
      updateHeightfieldWaterMaterial(runtimeSet.material, visual, runtimeSet.resource.data.localMapAtlas);
      runtimeSet.surfaceProvider.setSurfaceMotion(runtimeSet.resource.data.surfaceMotion);
      if (runtimeSet === this._activeSet) this._activeMaterialConfig = createHeightfieldWaterMaterialSnapshot(visual);
    }
    this._updateWaveClock(true);
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

  /**
   * Selects the immutable material shader family before the first runtime set
   * is built. Switching it later requires a fresh WaterBody activation.
   */
  setDepthSource(depthSource: WaterSurfaceDepthSource): void {
    if (this._destroyed) throw new Error("Heightfield water runtime controller has been destroyed.");
    if (this._runtimeSets.size > 0 && depthSource !== this._depthSource) {
      throw new Error("Heightfield water depth source must be selected before runtime activation.");
    }
    this._depthSource = depthSource;
  }

  setRenderPriority(priority: number): void {
    if (!Number.isFinite(priority)) throw new RangeError("Heightfield water render priority must be finite.");
    this._renderPriority = priority;
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const chunk of runtimeSet.chunks) chunk.renderer.priority = priority;
    }
  }

  setFeatureFlags(flags: HeightfieldWaterFeatureFlags): void {
    this._featureFlags = Object.freeze({ ...flags });
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterFeatureFlags(runtimeSet.material, flags);
      runtimeSet.surfaceProvider.setWavesEnabled(flags.waves);
    }
    this._updateWaveClock(true);
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    this._surfaceTimeOverride = elapsedTime;
    for (const runtimeSet of this._runtimeSets.values()) {
      setHeightfieldWaterSurfaceTimeOverride(runtimeSet.material, elapsedTime);
      runtimeSet.surfaceProvider.setSurfaceTimeOverride(elapsedTime);
    }
    this._updateWaveClock(true);
  }

  /**
   * Moves only Heightfield render roots relative to their immutable compiled bathymetry.
   * Seed World uses this hot path for runtime Lake-level preview without mesh uploads.
   */
  setSurfaceLevelOffsetMetres(offsetMetres: number): void {
    if (!Number.isFinite(offsetMetres)) {
      throw new RangeError("Heightfield water surface level offset must be finite.");
    }
    if (offsetMetres === this._surfaceLevelOffsetMetres) return;
    this._surfaceLevelOffsetMetres = offsetMetres;
    for (const runtimeSet of this._runtimeSets.values()) {
      runtimeSet.root.transform.setPosition(0, offsetMetres, 0);
      this._updateVisibilityWorldBounds(runtimeSet);
    }
  }

  /**
   * Compatibility seam for existing Demo controllers.
   * Heightfield meshes now destroy their owned buffers eagerly, so no global
   * ResourceManager GC pass is required or permitted at this boundary.
   */
  flushDeferredResources(): void {}

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    const clock = this._waveClock;
    if (clock) clock.updatePhases = undefined;
    this._waveClock = undefined;
    this._submissionGeneration++;
    const runtimeSets = [...this._runtimeSets.values()];
    this._runtimeSets.clear();
    this._activeId = undefined;
    this._activeSet = undefined;
    this._activeMaterialConfig = undefined;
    this._surfaceAppearanceBinding = undefined;
    cleanupRuntime([
      () => clock?.destroy(),
      ...runtimeSets.map((runtimeSet) => () => this._destroyRuntimeSet(runtimeSet)),
      () => this._rainRippleNormalAtlasLease?.release()
    ]);
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
    return setHeightfieldWaterSurfaceOpticsBinding(material, binding);
  }

  private _refreshSurfaceOpticsBindings(): void {
    for (const runtimeSet of this._runtimeSets.values()) {
      runtimeSet.surfaceOpticsReadback = this._applySurfaceOpticsBinding(runtimeSet.material);
    }
    this._recordAppliedReflectionBinding(this._reflectionBinding);
  }

  private _isReflectionBindingCurrent(binding: Readonly<WaterReflectionBinding> | undefined): boolean {
    if (!this._reflectionBindingApplied) return false;
    if (!binding) return this._reflectionBinding === undefined;
    return binding.bindingRevision !== undefined && binding.bindingRevision === this._appliedReflectionBindingRevision;
  }

  private _recordAppliedReflectionBinding(binding: Readonly<WaterReflectionBinding> | undefined): void {
    this._reflectionBindingApplied = true;
    this._appliedReflectionBindingRevision = binding?.bindingRevision;
  }

  private _applySurfaceAppearanceBinding(
    material: HeightfieldWaterMaterialState
  ): Readonly<WaterSurfaceAppearanceBindingReadback> {
    const binding = this._surfaceAppearanceBinding;
    if (!binding) {
      throw new Error("Heightfield water runtime requires a resolved Surface Appearance V2 binding.");
    }
    return setHeightfieldWaterSurfaceAppearanceBinding(material, binding);
  }

  private _createChunk(
    waterBodyId: string,
    chunk: HeightfieldWaterCompiledChunk,
    runtimeRoot: Entity,
    material: HeightfieldWaterMaterialState,
    releaseCpuData: boolean,
    boundsPadding: number
  ): MutableHeightfieldWaterChunk {
    const visibilityBounds = createHeightfieldWaterVisibilityBounds(chunk, boundsPadding);
    const terrainOcclusionKeys = new Array<string>(visibilityBounds.length);
    for (let index = 0; index < visibilityBounds.length; index++) {
      terrainOcclusionKeys[index] = `heightfield:${waterBodyId}:${chunk.id}:surface:${index}`;
    }
    const root = runtimeRoot.createChild(`heightfield-water-chunk-${chunk.id}`);
    root.layer = runtimeRoot.layer;
    root.transform.setPosition(chunk.localOrigin[0], chunk.localOrigin[1], chunk.localOrigin[2]);
    const renderer = root.addComponent(MeshRenderer);
    applyWaterSurfaceRendererContract(renderer);
    renderer.priority = this._renderPriority;
    const meshes = uploadHeightfieldWaterMesh(this._engine, chunk.geometry, { releaseCpuData, boundsPadding });
    meshes.surfaceMesh.isGCIgnored = true;
    renderer.mesh = meshes.surfaceMesh;
    renderer.setMaterial(material.material);
    renderer.shaderData.setVector4(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.atlasUvRect,
      new Vector4(chunk.atlasUvRect[0], chunk.atlasUvRect[1], chunk.atlasUvRect[2], chunk.atlasUvRect[3])
    );
    return {
      root,
      renderer,
      compiled: chunk,
      meshes,
      visibilityBounds,
      terrainOcclusionKeys,
      terrainOccluded: false
    };
  }

  private _updateVisibilityWorldBounds(runtimeSet: MutableHeightfieldWaterRuntimeSet): void {
    const worldMatrix = runtimeSet.root.transform.worldMatrix;
    const source = worldMatrix.elements;
    const cached = runtimeSet.visibilityWorldMatrixElements;
    let changed = !runtimeSet.visibilityWorldMatrixInitialized;
    for (let index = 0; index < source.length && !changed; index++) {
      changed = source[index] !== cached[index];
    }
    if (!changed) return;
    cached.set(source);
    runtimeSet.visibilityWorldMatrixInitialized = true;
    const chunks = runtimeSet.chunks;
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex]!;
      if (chunk.terrainOccluded) {
        chunk.terrainOccluded = false;
        chunk.renderer.enabled = true;
      }
      const visibilityBounds = chunk.visibilityBounds;
      for (let boundsIndex = 0; boundsIndex < visibilityBounds.length; boundsIndex++) {
        const bounds = visibilityBounds[boundsIndex]!;
        updateHeightfieldWaterVisibilityWorldBounds(bounds, worldMatrix);
        bounds.terrainOccluded = false;
      }
    }
  }

  private _deactivateAll(): void {
    for (const runtimeSet of this._runtimeSets.values()) runtimeSet.root.isActive = false;
  }

  private _destroyChunk(chunk: MutableHeightfieldWaterChunk): void {
    chunk.root.destroy();
    chunk.meshes.surfaceMesh.destroy(true);
    for (const buffer of chunk.meshes.ownedBuffers) {
      buffer.destroy(true);
    }
  }

  private _destroyRuntimeSet(runtimeSet: MutableHeightfieldWaterRuntimeSet): void {
    cleanupRuntime([
      () => disableHeightfieldWaterScreenSpaceReflectionReceiver(runtimeSet.material),
      () => runtimeSet.connectionBinding?.unbind(runtimeSet.material.material),
      () => {
        runtimeSet.material.material.destroy(true);
      },
      () => runtimeSet.connectionBinding?.destroy(),
      () => runtimeSet.spatialFieldProvider.destroy(),
      ...runtimeSet.chunks.map((chunk) => () => this._destroyChunk(chunk)),
      () => {
        runtimeSet.localMapTexture.destroy(true);
      },
      () => runtimeSet.root.destroy(),
      () => runtimeSet.resource.release()
    ]);
  }
}
