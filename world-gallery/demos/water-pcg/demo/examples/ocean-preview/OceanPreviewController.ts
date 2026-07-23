/** Camera-relative Ocean rings displaced by a fixed-count Gerstner vertex shader. */
import { Downsampling, Engine, Entity, Layer } from "@galacean/engine-core";
import { WaterWaveModel } from "../../../authoring/wave/enums/WaterWaveModel";
import { WaterQualityTier } from "../../../authoring/wave/enums/WaterQualityTier";
import type { WaterWaveAssetV1 } from "../../../authoring/wave/WaterWaveTypes";
import { compileWaterWaveAsset } from "../../../compiler/wave/WaterWaveCompiler";
import type { CompiledWaterWaveSet } from "../../../compiler/wave/CompiledWaterWaveTypes";
import {
  createWaterWaveMaterial,
  setWaterWaveSurfaceOpticsBinding,
  setWaterWaveSurfaceTimeOverride,
  updateWaterWaveMaterial
} from "../../../runtime/wave/WaterWaveMaterialFactory";
import type { WaterWaveMaterialConfig, WaterWaveMaterialState } from "../../../runtime/wave/WaterWaveRuntimeTypes";
import { OceanWaterSurfaceProvider } from "../../../runtime/ocean/OceanWaterSurfaceProvider";
import { OceanRingGeometry } from "../../../runtime/ocean/OceanRingGeometry";
import type { WaterReflectionBinding, WaterReflectionService } from "../../../runtime/optics/WaterReflectionService";
import type { WaterReflectionSource } from "../../../runtime/optics/WaterReflectionPolicy";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../../../runtime/optics/WaterOpticalProfile";
import type { CameraWaterFeatureBroker } from "../../../runtime/optics/CameraWaterFeatureBroker";
import {
  WaterOpticsDebugView,
  type WaterOpticsTier,
  type WaterSurfaceOpticsBindingReadback
} from "../../../runtime/optics/WaterSurfaceOpticsTypes";
import {
  OCEAN_PREVIEW_DEFAULT_STRESS_ITERATIONS,
  OCEAN_PREVIEW_MAX_PATCH_SEGMENTS,
  OCEAN_PREVIEW_MIN_AMPLITUDE_SCALE,
  OCEAN_PREVIEW_MIN_PATCH_SEGMENTS,
  OCEAN_PREVIEW_PATCH_SEGMENT_DIVISOR,
  OCEAN_PREVIEW_RING_SKIRT_DEPTH,
  OCEAN_PREVIEW_STRESS_QUALITY_SEQUENCE
} from "./constants";
import type { OceanPreviewConfig, OceanPreviewMetrics, OceanPreviewStressResult } from "./types";

export interface OceanCameraPositionXZ {
  readonly x: number;
  readonly z: number;
}

function createScaledWaveAsset(config: OceanPreviewConfig): WaterWaveAssetV1 {
  const asset = config.waveAsset;
  if (asset.model === WaterWaveModel.None) return asset;
  const amplitudeScale = Math.max(OCEAN_PREVIEW_MIN_AMPLITUDE_SCALE, config.amplitudeScale);
  return {
    ...asset,
    generator: {
      ...asset.generator,
      minAmplitude: asset.generator.minAmplitude * amplitudeScale,
      maxAmplitude: asset.generator.maxAmplitude * amplitudeScale
    }
  };
}

export class OceanPreviewController {
  readonly root: Entity;
  readonly surfaceProvider: OceanWaterSurfaceProvider;
  readonly reflectionConsumerId = "ocean-preview";
  readonly opticsConsumerId = "ocean-preview-optics";
  private _ringGeometry: OceanRingGeometry;
  private _materialState: WaterWaveMaterialState;
  private _waveSet: CompiledWaterWaveSet;
  private _topologyKey: string;
  private _surfaceTimeOverride?: number;
  private _meshUploadCount = 0;
  private _meshCreateCount = 0;
  private _meshDestroyCount = 0;
  private _materialCreateCount = 0;
  private _materialDestroyCount = 0;
  private _frameCount = 0;
  private _destroyed = false;
  private _reflectionService?: WaterReflectionService;
  private _reflectionBinding?: Readonly<WaterReflectionBinding>;
  private _reflectionSource: WaterReflectionSource;
  private _reflectionVisible = true;
  private _cameraFeatureBroker?: CameraWaterFeatureBroker;
  private _cameraFeatureRequested = false;
  private _opticalProfile: WaterOpticalProfile = DEFAULT_WATER_OPTICAL_PROFILE;
  private _refractionEnabled = true;
  private _opticsReadback?: Readonly<WaterSurfaceOpticsBindingReadback>;

  constructor(
    private readonly _engine: Engine,
    parent: Entity,
    private _config: OceanPreviewConfig
  ) {
    this.root = parent.createChild("ocean-preview");
    this._waveSet = this._compileWaveSet();
    this._reflectionSource = _config.reflectionSource ?? "sky";
    this._opticalProfile = _config.opticalProfile ?? DEFAULT_WATER_OPTICAL_PROFILE;
    this._refractionEnabled = _config.refractionEnabled ?? true;
    this.surfaceProvider = new OceanWaterSurfaceProvider({
      waterBodyId: "ocean-preview",
      waveSet: this._waveSet,
      size: _config.size,
      waterLevel: _config.waterLevel,
      timeScale: _config.timeScale,
      unbounded: true,
      getElapsedTime: () => this._surfaceTimeOverride ?? this._engine.time.elapsedTime
    });
    this._materialState = this._createMaterialState();
    this._ringGeometry = this._createRingGeometry();
    this._topologyKey = this._getTopologyKey();
    const geometryMetrics = this._ringGeometry.metrics;
    this._meshCreateCount += geometryMetrics.meshCreateCount;
    this._meshUploadCount += geometryMetrics.meshUploadCount;
    this._applySurfaceOpticsBinding();
  }

  get metrics(): OceanPreviewMetrics {
    const geometry = this._ringGeometry.metrics;
    return Object.freeze({
      waveModel: this._waveSet.model,
      quality: this._waveSet.quality,
      shaderWaveCount: Number(this._materialState.variant),
      activeWaveCount: this._waveSet.activeWaveCount,
      sourceHash: this._waveSet.sourceHash,
      meshUploadCount: this._meshUploadCount,
      meshCreateCount: this._meshCreateCount,
      meshDestroyCount: this._meshDestroyCount,
      materialCreateCount: this._materialCreateCount,
      materialDestroyCount: this._materialDestroyCount,
      activeMeshCount: geometry.patchCount,
      activeMaterialCount: this._materialCreateCount - this._materialDestroyCount,
      vertexCount: geometry.vertexCount,
      ringCount: geometry.ringCount,
      patchCount: geometry.patchCount,
      visiblePatchCount: geometry.visiblePatchCount,
      drawCount: geometry.drawCount,
      triangleCount: geometry.triangleCount,
      visibleTriangleCount: geometry.visibleTriangleCount,
      originSnapCount: geometry.originSnapCount,
      originX: geometry.originX,
      originZ: geometry.originZ,
      baseCellSize: geometry.baseCellSize,
      coverageHalfExtent: geometry.coverageHalfExtent,
      reflectionSource: this._opticsReadback?.effectiveSource ?? "sky",
      reflectionFilterSampleCount: this._opticsReadback?.filterSampleCount ?? 1,
      requestedOpticsTier: this._resolveOpticsTier(),
      resolvedOpticsTier: this._resolveOpticsTier() ? this._opticsReadback?.resolvedTier : undefined,
      compiledOpticsTier: this._materialState.opticsTier,
      refractionEnabled: this._opticsReadback?.refractionEnabled ?? false,
      cameraFeatureRequested: this._cameraFeatureRequested,
      frameCount: this._frameCount,
      perFrameMeshUpload: false
    });
  }

  setConfig(config: OceanPreviewConfig): void {
    this._config = config;
    this._reflectionSource = config.reflectionSource ?? this._reflectionSource;
    this._opticalProfile = config.opticalProfile ?? this._opticalProfile;
    this._refractionEnabled = config.refractionEnabled ?? this._refractionEnabled;
    this._waveSet = this._compileWaveSet();
    this._updateSurfaceProvider();
    this.rebuildMesh();
    this._updateCameraFeatureRequest();
    this._applyMaterialState();
  }

  rebuildMesh(): void {
    const nextTopologyKey = this._getTopologyKey();
    const topologyChanged = this._topologyKey !== nextTopologyKey;
    if (!topologyChanged) {
      this._ringGeometry.setWaveBounds(
        this._config.waterLevel,
        this._waveSet.maxHorizontalDisplacement,
        this._waveSet.maxVerticalDisplacement
      );
      return;
    }
    const previousGeometry = this._ringGeometry;
    const previousPatchCount = previousGeometry.metrics.patchCount;
    this._ringGeometry = this._createRingGeometry();
    this._topologyKey = nextTopologyKey;
    const nextMetrics = this._ringGeometry.metrics;
    this._meshCreateCount += nextMetrics.meshCreateCount;
    this._meshUploadCount += nextMetrics.meshUploadCount;
    this._meshDestroyCount += previousPatchCount;
    previousGeometry.destroy();
    this._updateReflectionRequest();
  }

  updateMaterial(): void {
    this._waveSet = this._compileWaveSet();
    this._updateSurfaceProvider();
    this._ringGeometry.setWaveBounds(
      this._config.waterLevel,
      this._waveSet.maxHorizontalDisplacement,
      this._waveSet.maxVerticalDisplacement
    );
    this._applyMaterialState();
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    this._surfaceTimeOverride = elapsedTime;
    setWaterWaveSurfaceTimeOverride(this._materialState, elapsedTime);
  }

  update(_deltaTime: number, cameraWorldPosition?: Readonly<OceanCameraPositionXZ>): void {
    if (!this.root.isActive || this._destroyed) return;
    if (cameraWorldPosition) this._ringGeometry.updateCameraPosition(cameraWorldPosition.x, cameraWorldPosition.z);
    this._frameCount++;
  }

  setCameraPosition(worldX: number, worldZ: number): boolean {
    return this._ringGeometry.updateCameraPosition(worldX, worldZ);
  }

  setLodDebug(enabled: boolean): void {
    this._ringGeometry.setLodDebug(enabled);
  }

  setCameraFeatureBroker(broker?: CameraWaterFeatureBroker): void {
    if (broker === this._cameraFeatureBroker) return;
    this._cameraFeatureBroker?.removeRequest(this.opticsConsumerId);
    this._cameraFeatureBroker = broker;
    this._updateCameraFeatureRequest();
    this._applySurfaceOpticsBinding();
  }

  setOpticsTier(tier?: WaterOpticsTier): void {
    if (tier === this._config.opticsTier) return;
    this._config = { ...this._config, opticsTier: tier };
    this._updateCameraFeatureRequest();
    this._applyMaterialState();
  }

  setOpticalProfile(profile: WaterOpticalProfile): void {
    this._opticalProfile = profile;
    this._config = { ...this._config, opticalProfile: profile };
    this._applySurfaceOpticsBinding();
  }

  setRefractionEnabled(enabled: boolean): void {
    this._refractionEnabled = enabled;
    this._config = { ...this._config, refractionEnabled: enabled };
    this._applySurfaceOpticsBinding();
  }

  setReflectionService(service?: WaterReflectionService): void {
    if (service === this._reflectionService) return;
    this._reflectionService?.removeRequest(this.reflectionConsumerId);
    this._reflectionService = service;
    this._updateReflectionRequest();
    this.refreshReflectionBinding();
  }

  setReflectionSource(source: WaterReflectionSource): void {
    if (source === this._reflectionSource) return;
    this._reflectionSource = source;
    this._updateReflectionRequest();
    this._updateCameraFeatureRequest();
    this.refreshReflectionBinding();
  }

  setReflectionVisible(visible: boolean): void {
    if (visible === this._reflectionVisible) return;
    this._reflectionVisible = visible;
    this._updateReflectionRequest();
    this._updateCameraFeatureRequest();
    this.refreshReflectionBinding();
  }

  refreshReflectionBinding(): void {
    if (this._destroyed) return;
    if (!this._reflectionVisible || !this.root.isActive) {
      this._reflectionBinding = undefined;
      this._applySurfaceOpticsBinding();
      return;
    }
    const binding = this._reflectionService?.getBinding(this.reflectionConsumerId);
    this._reflectionBinding = binding;
    this._applySurfaceOpticsBinding();
  }

  stressReconfigure(iterations = OCEAN_PREVIEW_DEFAULT_STRESS_ITERATIONS): OceanPreviewStressResult {
    const requestedIterations = Math.max(0, Math.floor(iterations));
    const originalConfig = this._config;
    const initialMeshUploadCount = this._meshUploadCount;
    for (let index = 0; index < requestedIterations; index++) {
      const quality = OCEAN_PREVIEW_STRESS_QUALITY_SEQUENCE[index % OCEAN_PREVIEW_STRESS_QUALITY_SEQUENCE.length];
      this.setConfig({ ...originalConfig, quality });
    }
    this.setConfig(originalConfig);
    return Object.freeze({
      requestedIterations,
      completedIterations: requestedIterations,
      initialMeshUploadCount,
      finalMeshUploadCount: this._meshUploadCount,
      activeMeshCount: this._meshCreateCount - this._meshDestroyCount,
      activeMaterialCount: this._materialCreateCount - this._materialDestroyCount,
      materialCreateCount: this._materialCreateCount,
      materialDestroyCount: this._materialDestroyCount,
      sourceHash: this._waveSet.sourceHash
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._reflectionService?.removeRequest(this.reflectionConsumerId);
    this._cameraFeatureBroker?.removeRequest(this.opticsConsumerId);
    this._cameraFeatureRequested = false;
    this.root.destroy();
    this._meshDestroyCount += this._ringGeometry.metrics.patchCount;
    this._ringGeometry.destroy();
    this._materialState.material.destroy(true);
    this._materialDestroyCount++;
  }

  private _compileWaveSet(): CompiledWaterWaveSet {
    return compileWaterWaveAsset(createScaledWaveAsset(this._config), this._config.quality);
  }

  private _updateSurfaceProvider(): void {
    this.surfaceProvider.setConfig({
      waterBodyId: "ocean-preview",
      waveSet: this._waveSet,
      size: this._config.size,
      waterLevel: this._config.waterLevel,
      timeScale: this._config.timeScale,
      unbounded: true
    });
    this._updateReflectionRequest();
  }

  private _createMaterialConfig(): WaterWaveMaterialConfig {
    return {
      baseColor: this._config.oceanColor,
      alpha: this._config.alpha,
      waterLevel: this._config.waterLevel,
      timeScale: this._config.timeScale,
      crestIntensity: this._config.foamIntensity,
      reflectionIntensity: 0.46,
      opticsTier: this._resolveOpticsTier(),
      surfaceTimeOverride: this._surfaceTimeOverride
    };
  }

  private _createMaterialState(): WaterWaveMaterialState {
    const state = createWaterWaveMaterial(this._engine, this._waveSet, this._createMaterialConfig());
    this._materialCreateCount++;
    return state;
  }

  private _applyMaterialState(): void {
    const requestedOpticsTier = this._resolveOpticsTier();
    const resolvedOpticsTier =
      requestedOpticsTier === undefined ? undefined : requestedOpticsTier === "medium" ? "medium" : "high";
    if (
      Number(this._materialState.variant) === this._waveSet.shaderWaveCount &&
      this._materialState.opticsTier === resolvedOpticsTier
    ) {
      this._materialState = updateWaterWaveMaterial(this._materialState, this._waveSet, this._createMaterialConfig());
      this._applySurfaceOpticsBinding();
      return;
    }
    const previousMaterial = this._materialState.material;
    this._materialState = this._createMaterialState();
    this._ringGeometry.setMaterial(this._materialState.material);
    this._applySurfaceOpticsBinding();
    previousMaterial.destroy(true);
    this._materialDestroyCount++;
  }

  private _resolveRingCount(): 2 | 3 {
    return this._config.quality === WaterQualityTier.Low ? 2 : 3;
  }

  private _resolvePatchSegments(): number {
    return Math.min(
      OCEAN_PREVIEW_MAX_PATCH_SEGMENTS,
      Math.max(
        OCEAN_PREVIEW_MIN_PATCH_SEGMENTS,
        Math.round(this._config.resolution / OCEAN_PREVIEW_PATCH_SEGMENT_DIVISOR)
      )
    );
  }

  private _getTopologyKey(): string {
    return `${this._config.size}:${this._resolveRingCount()}:${this._resolvePatchSegments()}`;
  }

  private _createRingGeometry(): OceanRingGeometry {
    return new OceanRingGeometry(this._engine, this.root, this._materialState.material, {
      size: this._config.size,
      ringCount: this._resolveRingCount(),
      patchSegments: this._resolvePatchSegments(),
      waterLevel: this._config.waterLevel,
      maxHorizontalDisplacement: this._waveSet.maxHorizontalDisplacement,
      maxVerticalDisplacement: this._waveSet.maxVerticalDisplacement,
      skirtDepth: OCEAN_PREVIEW_RING_SKIRT_DEPTH
    });
  }

  private _updateReflectionRequest(): void {
    const service = this._reflectionService;
    if (!service) return;
    service.setRequest({
      id: this.reflectionConsumerId,
      preferredSource: this._reflectionSource,
      quality: this._config.quality,
      visible: this._reflectionVisible && this.root.isActive,
      priority: 0,
      planeY: this._config.waterLevel,
      cullingMask: Layer.Everything,
      waterLayerMask: this._ringGeometry.layer
    });
  }

  private _resolveOpticsTier(): WaterOpticsTier | undefined {
    if (this._config.opticsTier) return this._config.opticsTier;
    if (this._config.quality === WaterQualityTier.Medium) return "medium";
    if (this._config.quality === WaterQualityTier.High) return "high";
    return undefined;
  }

  private _updateCameraFeatureRequest(): void {
    const broker = this._cameraFeatureBroker;
    if (!broker) {
      this._cameraFeatureRequested = false;
      return;
    }
    const tier = this._resolveOpticsTier();
    const visible = this._reflectionVisible && this.root.isActive && !this._destroyed;
    if (!tier || !visible) {
      broker.removeRequest(this.opticsConsumerId);
      this._cameraFeatureRequested = false;
      return;
    }
    const quality = tier === "medium" ? "medium" : "high";
    broker.setRequest(this.opticsConsumerId, {
      depthTexture: true,
      opaqueTexture: true,
      reflection: this._reflectionSource === "sky" ? "none" : this._reflectionSource,
      caustics: false,
      underwater: false,
      quality,
      opaqueDownsampling: quality === "medium" ? Downsampling.TwoX : Downsampling.None
    });
    this._cameraFeatureRequested = true;
  }

  private _applySurfaceOpticsBinding(): void {
    const tier = this._resolveOpticsTier();
    this._opticsReadback = setWaterWaveSurfaceOpticsBinding(this._materialState, {
      tier: tier ?? "medium",
      opticalProfile: this._opticalProfile,
      refractionEnabled:
        tier !== undefined &&
        this._refractionEnabled &&
        this._cameraFeatureRequested &&
        this._reflectionVisible &&
        this.root.isActive,
      reflection: this._reflectionBinding,
      reflectionSampling: this._config.reflectionSampling,
      debugView: WaterOpticsDebugView.Final
    });
  }
}
