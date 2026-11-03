import {
  Camera,
  Layer,
  ScreenSpaceReflectionQuality,
  type AmbientLight,
  type Engine,
  type Entity
} from "@galacean/engine";
import type { WaterRegionMaskV1 } from "@galacean/engine-water/water/index";
import {
  WaterSurfaceDepthSource,
  createWaterReflectionPresentationPolicy,
  type WaterReflectionPolicyMode,
  type WaterReflectionPresentationMode
} from "@galacean/engine-water/water/index";
import {
  createLakeSpatialFieldBudget,
  LAKE_WATER_LOOK_PRESET_ID
} from "@galacean/engine-water/water/presets/lake/index";
import {
  LAKE_NORMAL_RESOURCE,
  createLakeNormalResourceFactory
} from "@galacean/engine-water/water/resources/lake/index";
import {
  GRASSLANDS_TERRAIN_WATER_ASSET_ID,
  GRASSLANDS_TERRAIN_WATER_PROVIDER_ID,
  registerGrasslandsTerrainWaterBodyAuthoring
} from "./GrasslandsWaterBodyAuthoring";
import { GRASSLANDS_TERRAIN_WATER_INSTANCE_ID } from "./GrasslandsWaterBodyIdentity";

import {
  applyLakeWaterPresentation,
  createLakeWaterPresentationState,
  HeightfieldWaterBackend,
  HeightfieldWaterCompileWorkerClient
} from "@galacean/engine-water/water/runtime/heightfield/index";
import {
  type WaterBodyActivationInspection,
  type WaterBodyLoaderMetrics,
  type WaterDevelopmentTargetSource,
  type WaterEnvironmentReflectionProviderInspection,
  type WaterEnvironmentReflectionSource,
  readWaterSpatialFieldEngineTextureCalibration,
  type WaterSpatialFieldEngineTextureCalibrationReadback,
  createWaterSurfaceSample,
  type WaterSurfaceProvider,
  type WaterSurfaceSample,
  WaterSceneRuntimeHost,
  type WaterEnvironmentReflectionProviderHandle,
  type WaterSceneBackendLease,
  type WaterSceneBodyHandle
} from "@galacean/engine-water/water/runtime/index";

import { hashStableValue } from "@galacean/engine-water/water/compiler/index";
import type {
  HeightfieldWaterReflectionSamplingSettings,
  HeightfieldWaterRuntimeController
} from "@galacean/engine-water/water/runtime/heightfield/index";

import {
  HeightfieldWaterCompositionMode,
  HeightfieldWaterDebugMode
} from "@galacean/engine-water/water/runtime/heightfield/config";
import type {
  HeightfieldWaterScreenSpaceReflectionConsumptionReadback,
  HeightfieldWaterSurfaceAppearanceFeatureFlags
} from "@galacean/engine-water/water/runtime/heightfield/config";
import type {
  CameraWaterFeatureMetrics,
  WaterReflectionServiceMetrics,
  WaterReflectionSource,
  WaterSceneReflectionProbeProviderInspection
} from "@galacean/engine-water/water/runtime/index";

import type { WaterRuntimeResourceRegistryMetrics } from "@galacean/engine-water/water/runtime/resources/index";

import {
  createGrasslandsTerrainWaterDescriptor,
  resolveGrasslandsTerrainWaterBounds,
  type GrasslandsTerrainWaterBounds,
  type GrasslandsTerrainWaterLayoutSpec
} from "./GrasslandsWaterDescriptor";
import {
  TERRAIN_SCREEN_SPACE_REFLECTION_MAX_RAY_DISTANCE_METRES,
  TERRAIN_SCREEN_SPACE_REFLECTION_MIN_THICKNESS_METRES,
  TERRAIN_SCREEN_SPACE_REFLECTION_RESOLUTION_SCALE
} from "@galacean/engine-environment/terrain/lighting/TerrainScreenSpaceReflectionTuning";
import {
  createGrasslandsTerrainWaterProvider,
  createGrasslandsTerrainWaterProviderContext
} from "./GrasslandsWaterSourceProvider";

const TERRAIN_GRASSLANDS_ENVIRONMENT_PROVIDER_ID = "terrain-grasslands-scene-environment";

const PRESENTATION_REVEAL_TILE_SIZE_METRES = 180;
export const TERRAIN_WATER_SSR_CAMERA_SETTINGS = Object.freeze({
  quality: ScreenSpaceReflectionQuality.High,
  resolutionScale: TERRAIN_SCREEN_SPACE_REFLECTION_RESOLUTION_SCALE,
  maxRayDistance: TERRAIN_SCREEN_SPACE_REFLECTION_MAX_RAY_DISTANCE_METRES,
  thickness: TERRAIN_SCREEN_SPACE_REFLECTION_MIN_THICKNESS_METRES,
  maxRoughness: 0.7,
  edgeFade: 0.06
});

export interface GrasslandsTerrainWaterPcgSnapshot {
  readonly ready: true;
  readonly visible: boolean;
  readonly waterBodyType: "lake";
  readonly waterLevel: number;
  readonly bounds: GrasslandsTerrainWaterBounds;
  readonly occupiedBounds: GrasslandsTerrainWaterBounds;
  readonly grid: readonly [width: number, height: number];
  readonly regionContentHash: string;
  readonly regionMetrics: WaterRegionMaskV1["metrics"];
  readonly depthSource: WaterSurfaceDepthSource.HybridOptionalSceneDepth;
  readonly minimumDepth: number;
  readonly maximumDepth: number;
  readonly wetTexelCount: number;
  readonly chunkCount: number;
  readonly triangleCount: number;
  readonly meshUploadCount: number;
  readonly activeDrawCount: number;
  readonly compiledHash: string;
  readonly retainedBytes: number;
  readonly strictMaterial: boolean;
  readonly appearanceAssetId: string;
  readonly appearanceHash: string;
  readonly normalContentHash: string;
  readonly compositionMode: HeightfieldWaterCompositionMode;
  readonly depthWriteEnabled: boolean;
  readonly refractionEnabled: boolean;
  readonly fresnelF0: number;
  readonly reflectionRoughness: number;
  readonly reflectionIntensity: number;
  readonly requestedReflectionSource: WaterReflectionSource;
  readonly effectiveReflectionSource: WaterReflectionSource;
  readonly reflectionMode: WaterReflectionPresentationMode;
  readonly requestedReflectionMode: WaterReflectionPolicyMode;
  readonly effectiveReflectionMode: WaterReflectionPolicyMode;
  readonly reflectionFallbackReason?: string;
  readonly reflectionTextureSize: readonly [width: number, height: number];
  readonly reflection: Readonly<WaterReflectionServiceMetrics>;
  readonly environmentReflection: Readonly<WaterEnvironmentReflectionProviderInspection>;
  readonly environmentFallbackIntensity: number;
  readonly reflectionSampling: Readonly<HeightfieldWaterReflectionSamplingSettings>;
  readonly localReflectionProbe: Readonly<WaterSceneReflectionProbeProviderInspection>;
  readonly appearanceFeatures: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags>;
  readonly debugMode: HeightfieldWaterDebugMode;
  readonly surfaceTimeOverride?: number;
  readonly screenSpaceReflectionConsumption: Readonly<HeightfieldWaterScreenSpaceReflectionConsumptionReadback>;
  readonly cameraFeatures: Readonly<CameraWaterFeatureMetrics>;
  readonly activationPath: "load-instance";
  readonly assetId: typeof GRASSLANDS_TERRAIN_WATER_ASSET_ID;
  readonly instanceId: typeof GRASSLANDS_TERRAIN_WATER_INSTANCE_ID;
  readonly providerId: typeof GRASSLANDS_TERRAIN_WATER_PROVIDER_ID;
  readonly activation: Readonly<WaterBodyActivationInspection>;
  readonly loader: Readonly<WaterBodyLoaderMetrics>;
  readonly runtimeResources: Readonly<WaterRuntimeResourceRegistryMetrics>;
  readonly backendActiveRuntimeCount: number;
  readonly worldRegisteredBodyCount: number;
  readonly gameplayQueryRegistered: boolean;
}

export interface GrasslandsTerrainWaterPcgDisposedSnapshot {
  readonly disposed: true;
  readonly handleActive: false;
  readonly resourceReferenceCount: number;
  readonly resourceDisposed: boolean;
  readonly loader: Readonly<WaterBodyLoaderMetrics>;
  readonly runtimeResources: Readonly<WaterRuntimeResourceRegistryMetrics>;
  readonly backendActiveRuntimeCount: number;
  readonly worldRegisteredBodyCount: number;
  readonly cameraFeatures: Readonly<CameraWaterFeatureMetrics>;
  readonly reflection: Readonly<WaterReflectionServiceMetrics>;
  readonly environmentReflection: Readonly<WaterEnvironmentReflectionProviderInspection>;
  readonly localReflectionProbe: Readonly<WaterSceneReflectionProbeProviderInspection>;
}

export interface GrasslandsTerrainWaterEnvironmentReflectionSource extends WaterEnvironmentReflectionSource {
  readonly ambientLight: Pick<AmbientLight, "specularTexture" | "specularIntensity"> &
    Partial<Pick<AmbientLight, "secondarySpecularTexture" | "specularTextureBlend">>;
}

const DISABLED_LOCAL_REFLECTION_PROJECTION = Object.freeze({
  mode: "box" as const,
  probePosition: Object.freeze([0, 0, 0] as const),
  boxMinimum: Object.freeze([-1, -1, -1] as const),
  boxMaximum: Object.freeze([1, 1, 1] as const)
});

function createDisabledLocalReflectionProbeInspection(
  destroyed: boolean
): Readonly<WaterSceneReflectionProbeProviderInspection> {
  return Object.freeze({
    id: "terrain-grasslands-local-scene-probe-disabled",
    captured: false,
    captureCount: 0,
    publishCount: 0,
    refreshCount: 0,
    published: false,
    destroyed,
    resolution: 0,
    requestedHDR: false,
    effectiveHDR: false,
    colorFormat: "r8g8b8a8-unorm",
    cullingMask: 0,
    excludedLayerMask: Layer.Layer30,
    excludedLayersAbsent: true,
    maximumMipLevel: 0,
    estimatedTextureBytes: 0,
    intensity: 0,
    projection: DISABLED_LOCAL_REFLECTION_PROJECTION
  });
}

interface GrasslandsRuntimePresentationState {
  debugMode: HeightfieldWaterDebugMode;
  surfaceTimeOverride: number | undefined;
}

function resolveOccupiedWaterBounds(region: WaterRegionMaskV1): GrasslandsTerrainWaterBounds {
  const [width, height] = region.resolution;
  let minimumCellX = width;
  let minimumCellZ = height;
  let maximumCellX = -1;
  let maximumCellZ = -1;
  for (let index = 0; index < region.wetMask.length; index++) {
    if (region.wetMask[index] === 0) continue;
    const x = index % width;
    const z = Math.floor(index / width);
    minimumCellX = Math.min(minimumCellX, x);
    minimumCellZ = Math.min(minimumCellZ, z);
    maximumCellX = Math.max(maximumCellX, x);
    maximumCellZ = Math.max(maximumCellZ, z);
  }
  if (maximumCellX < 0 || maximumCellZ < 0) {
    throw new Error("Grasslands water region contains no occupied cells.");
  }
  const cellSizeX = (region.bounds.maximumXZ[0] - region.bounds.minimumXZ[0]) / width;
  const cellSizeZ = (region.bounds.maximumXZ[1] - region.bounds.minimumXZ[1]) / height;
  return Object.freeze({
    minimum: Object.freeze([
      region.bounds.minimumXZ[0] + minimumCellX * cellSizeX,
      region.waterLevel,
      region.bounds.minimumXZ[1] + minimumCellZ * cellSizeZ
    ] as const),
    maximum: Object.freeze([
      region.bounds.minimumXZ[0] + (maximumCellX + 1) * cellSizeX,
      region.waterLevel,
      region.bounds.minimumXZ[1] + (maximumCellZ + 1) * cellSizeZ
    ] as const)
  });
}

function resolvePresentationRevealRepeat(bounds: GrasslandsTerrainWaterBounds): readonly [number, number] {
  return Object.freeze([
    Math.max(1, Math.ceil((bounds.maximum[0] - bounds.minimum[0]) / PRESENTATION_REVEAL_TILE_SIZE_METRES)),
    Math.max(1, Math.ceil((bounds.maximum[2] - bounds.minimum[2]) / PRESENTATION_REVEAL_TILE_SIZE_METRES))
  ] as const);
}

function resolveMinimumWaterDepth(surfaceHeights: Float32Array, bedHeights: Float32Array | undefined): number {
  if (!bedHeights || bedHeights.length !== surfaceHeights.length || surfaceHeights.length === 0) {
    throw new Error("Grasslands water descriptor did not produce matching Water-owned bed heights.");
  }
  let minimumDepth = Number.POSITIVE_INFINITY;
  for (let index = 0; index < surfaceHeights.length; index++) {
    minimumDepth = Math.min(minimumDepth, Math.max(0, surfaceHeights[index] - bedHeights[index]));
  }
  return minimumDepth;
}

/**
 * Terrain owns only detached region extraction. The common WaterBody chain
 * resolves that source, compiles Heightfield data, derives Camera features,
 * activates the runtime, and owns reverse-order teardown.
 */
export class GrasslandsTerrainWaterPcg {
  private _destroyed = false;
  private _destroyPromise?: Promise<GrasslandsTerrainWaterPcgDisposedSnapshot>;
  private _rainImpactBounds?: GrasslandsTerrainWaterBounds;
  private readonly _sceneSurfaceSample = createWaterSurfaceSample();
  private readonly _rainImpactSurfaceProvider: WaterSurfaceProvider = Object.freeze({
    sampleSurface: (
      worldPosition: Parameters<WaterSurfaceProvider["sampleSurface"]>[0],
      outSample: WaterSurfaceSample
    ) => this._sampleRainImpactSurface(worldPosition, outSample)
  });

  private constructor(
    private readonly _handle: WaterSceneBodyHandle,
    private readonly _loader: WaterDevelopmentTargetSource,
    private readonly _backend: HeightfieldWaterBackend,
    private readonly _environmentReflection: WaterEnvironmentReflectionProviderHandle,
    private readonly _runtimeRoot: Entity,
    private readonly _backendLease: WaterSceneBackendLease<HeightfieldWaterBackend>,
    private readonly _presentation: GrasslandsRuntimePresentationState,
    private readonly _spec: GrasslandsTerrainWaterLayoutSpec,
    private readonly _bounds: GrasslandsTerrainWaterBounds,
    private readonly _region: WaterRegionMaskV1,
    private readonly _minimumDepth: number,
    private readonly _sceneHost: WaterSceneRuntimeHost
  ) {}

  /** Registers the canonical Grasslands lake as one Body in an existing Scene Host. */
  static async createWithHost(
    host: WaterSceneRuntimeHost,
    engine: Engine,
    camera: Camera,
    environmentReflection: GrasslandsTerrainWaterEnvironmentReflectionSource,
    spec: GrasslandsTerrainWaterLayoutSpec,
    region: WaterRegionMaskV1
  ): Promise<GrasslandsTerrainWaterPcg> {
    if (!host.getReflectionMetrics()) {
      throw new Error("Terrain Grasslands lake requires a reflection-enabled Water Scene Host.");
    }
    const descriptor = createGrasslandsTerrainWaterDescriptor(spec, region);
    const minimumDepth = resolveMinimumWaterDepth(descriptor.surfaceHeights, descriptor.bedHeights);
    const bounds = resolveGrasslandsTerrainWaterBounds(spec);
    const spatialFieldBudget = createLakeSpatialFieldBudget(descriptor);
    const candidateProviderContext = createGrasslandsTerrainWaterProviderContext(
      descriptor,
      region.contentHash,
      spec.spatialFields
    );
    const installationContentHash = hashStableValue({
      regionContentHash: region.contentHash,
      spatialFields: spec.spatialFields,
      spatialFieldBudget,
      gameplayQuery: false
    });
    const backendLease = host.acquireBackend(
      "terrain-grasslands-heightfield-backend-v1",
      "terrain-grasslands-heightfield-worker-compile-v1",
      () => {
        const compileWorker = new HeightfieldWaterCompileWorkerClient();
        const backend = new HeightfieldWaterBackend({
          compile: (source, context) => compileWorker.compile(source, context.signal)
        });
        return Object.freeze({ backend, dispose: () => compileWorker.dispose() });
      }
    );
    const backend = backendLease.backend;
    const presentation: GrasslandsRuntimePresentationState = {
      ...createLakeWaterPresentationState()
    };
    let runtimeRoot: Entity | undefined;
    let environmentReflectionProvider: WaterEnvironmentReflectionProviderHandle | undefined;
    let handle: WaterSceneBodyHandle | undefined;
    try {
      const installation = host.registerAuthoringOnce(
        "terrain-grasslands-water-v1",
        installationContentHash,
        (assets) =>
          Object.freeze({
            authoring: registerGrasslandsTerrainWaterBodyAuthoring(assets, {
              regionContentHash: region.contentHash,
              spatialFields: spec.spatialFields,
              spatialFieldBudget,
              gameplayQuery: false
            }),
            providerContext: candidateProviderContext
          })
      );
      const { authoring, providerContext } = installation;
      const asset = host.assets.getAsset(GRASSLANDS_TERRAIN_WATER_ASSET_ID);
      if (!asset) throw new Error("Grasslands Water authoring did not register its canonical asset.");
      host.registerProviderOnce(
        "terrain-grasslands-water-provider-v1",
        installationContentHash,
        createGrasslandsTerrainWaterProvider(providerContext)
      );
      host.ensureRuntimeResource(createLakeNormalResourceFactory(engine));
      environmentReflectionProvider = host.ensureEnvironmentReflectionProvider({
        id: TERRAIN_GRASSLANDS_ENVIRONMENT_PROVIDER_ID,
        source: environmentReflection
      });
      handle = await host.loadBody({
        bodyId: GRASSLANDS_TERRAIN_WATER_INSTANCE_ID,
        asset,
        instance: authoring.instance,
        providerContext,
        bodyOrigin: [0, 0],
        createRuntimeContext: (bodyRoot) => {
          runtimeRoot = bodyRoot;
          return {
            engine,
            root: bodyRoot,
            submission: {
              frameBudgetMs: 4,
              releaseMeshCpuData: true
            },
            compiledDiagnostics: true,
            debugMode: presentation.debugMode,
            surfaceTimeOverride: presentation.surfaceTimeOverride
          };
        },
        setSurfaceTimeOverride: (timeSeconds) =>
          backend.setRuntimeSurfaceTimeOverride(GRASSLANDS_TERRAIN_WATER_INSTANCE_ID, timeSeconds)
      });
      const runtime = backend.getRuntimeDiagnostics(authoring.instance.id);
      if (!runtime || runtime.activation.submittedChunkCount !== runtime.compiledDiagnostics?.chunkCount) {
        throw new Error("Terrain Grasslands WaterBody activation did not publish a complete Heightfield runtime.");
      }
      const appearance = runtime.controller.activeSurfaceAppearanceReadback;
      if (!appearance?.active || appearance.fallbackReason) {
        throw new Error(
          `Terrain Grasslands strict water material failed to bind${
            appearance?.fallbackReason ? `: ${appearance.fallbackReason}` : "."
          }`
        );
      }
      if (!runtimeRoot) throw new Error("Terrain Grasslands Host did not provide a Body root.");
      return new GrasslandsTerrainWaterPcg(
        handle,
        host.loader,
        backend,
        environmentReflectionProvider,
        runtimeRoot,
        backendLease,
        presentation,
        spec,
        bounds,
        region,
        minimumDepth,
        host
      );
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      if (handle) {
        try {
          await handle.destroy();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      try {
        backendLease.release();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "Terrain Grasslands Host activation failed and cleanup reported additional errors."
        );
      }
      throw error;
    }
  }

  get loader(): WaterDevelopmentTargetSource {
    this._requireActive();
    return this._loader;
  }

  /** Samples the visible lake plus any query-enabled River staged into the same Scene Host. */
  get rainImpactSurfaceProvider(): WaterSurfaceProvider {
    this._requireActive();
    return this._rainImpactSurfaceProvider;
  }

  /** Returns cached occupied lake bounds expanded by any River staged in the same Scene Host. */
  get rainImpactBounds(): GrasslandsTerrainWaterBounds {
    this._requireActive();
    if (this._rainImpactBounds) return this._rainImpactBounds;
    const occupied = resolveOccupiedWaterBounds(this._region);
    let minimumX = occupied.minimum[0];
    let minimumY = occupied.minimum[1];
    let minimumZ = occupied.minimum[2];
    let maximumX = occupied.maximum[0];
    let maximumY = occupied.maximum[1];
    let maximumZ = occupied.maximum[2];
    for (const body of this._sceneHost?.getDiagnostics().bodies ?? []) {
      const bounds = body.logicalBounds;
      if (!bounds) continue;
      minimumX = Math.min(minimumX, bounds.minX);
      minimumY = Math.min(minimumY, this._spec.position[1] - 5);
      minimumZ = Math.min(minimumZ, bounds.minZ);
      maximumX = Math.max(maximumX, bounds.maxX);
      maximumY = Math.max(maximumY, this._spec.position[1] + 5);
      maximumZ = Math.max(maximumZ, bounds.maxZ);
    }
    return (this._rainImpactBounds = Object.freeze({
      minimum: Object.freeze([minimumX, minimumY, minimumZ] as const),
      maximum: Object.freeze([maximumX, maximumY, maximumZ] as const)
    }));
  }

  setViewportSize(width: number, height: number): void {
    this._requireActive();
    this._sceneHost.setViewportSize(width, height);
  }

  setVisible(visible: boolean): void {
    this._requireActive();
    this._handle.setVisible(visible);
  }

  /** Publishes depth-write through the shared WaterLook Render State. */
  async setDepthWriteEnabled(enabled: boolean): Promise<void> {
    this._requireActive();
    const host = this._sceneHost;
    if (!host) throw new Error("Terrain Water render-state authoring requires a Water Scene Host.");
    await host.updateLookAuthoring(LAKE_WATER_LOOK_PRESET_ID, (current) =>
      Object.freeze({
        ...current,
        renderState: Object.freeze({ ...current.renderState, depthWriteEnabled: enabled })
      })
    );
  }

  /** Switches the canonical V2 reflection policy without rebuilding Water geometry. */
  async setReflectionMode(mode: WaterReflectionPresentationMode): Promise<void> {
    this._requireActive();
    if (mode !== "environment" && mode !== "ssr") {
      throw new RangeError(`Unsupported Terrain water reflection mode: ${String(mode)}.`);
    }
    const host = this._sceneHost;
    if (!host) throw new Error("Terrain Water reflection authoring requires a Water Scene Host.");
    await host.updateLookAuthoring(LAKE_WATER_LOOK_PRESET_ID, (current) =>
      Object.freeze({
        ...current,
        reflectionPolicy: Object.freeze({
          ...current.reflectionPolicy,
          policy: createWaterReflectionPresentationPolicy(mode)
        })
      })
    );
  }

  /**
   * Advances the prepared water material through a presentation-only noise dissolve.
   * @param progress Normalized dissolve progress.
   * @returns Nothing.
   * @throws If progress is not finite.
   */
  setHorizontalRevealProgress(progress: number): void {
    this._requireActive();
    if (!Number.isFinite(progress)) throw new RangeError("Water reveal progress must be finite");
    const clamped = Math.min(1, Math.max(0, progress));
    this._runtimeRoot.transform.setPosition(0, 0, 0);
    this._runtimeRoot.transform.setScale(1, 1, 1);
    this._requireRuntime().controller.setPresentationRevealProgress(
      clamped,
      0.025,
      resolvePresentationRevealRepeat(this._bounds)
    );
  }

  setDebugMode(mode: HeightfieldWaterDebugMode): void {
    this._requireActive();
    this._presentation.debugMode = mode;
    this._requireRuntime().controller.setDebugMode(mode);
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    this._requireActive();
    this._presentation.surfaceTimeOverride = elapsedTime;
    this._requireRuntime().controller.setSurfaceTimeOverride(elapsedTime);
  }

  inspect(): GrasslandsTerrainWaterPcgSnapshot {
    this._requireActive();
    const runtime = this._requireRuntime();
    const compiled = runtime.compiledDiagnostics;
    if (!compiled) throw new Error("Terrain Grasslands compiled diagnostics are unavailable.");
    const data = compiled;
    const controller = runtime.controller;
    const appearance = controller.activeSurfaceAppearanceReadback;
    const optics = controller.activeSurfaceOpticsReadback;
    const metrics = controller.resourceMetrics;
    const activation = this._handle.inspect();
    const hostDiagnostics = this._sceneHost.getDiagnostics();
    const worldRegisteredBodyCount = hostDiagnostics.world.registeredBodyCount;
    return Object.freeze({
      ready: true,
      visible: this._handle.visible,
      waterBodyType: "lake" as const,
      waterLevel: this._spec.position[1],
      bounds: this._bounds,
      occupiedBounds: resolveOccupiedWaterBounds(this._region),
      grid: Object.freeze([...this._region.resolution] as [number, number]),
      regionContentHash: this._region.contentHash,
      regionMetrics: this._region.metrics,
      depthSource: WaterSurfaceDepthSource.HybridOptionalSceneDepth,
      minimumDepth: this._minimumDepth,
      maximumDepth: data.stats.maxDepth,
      wetTexelCount: data.stats.sourceWetTexelCount,
      chunkCount: data.stats.chunkCount,
      triangleCount: data.stats.triangleCount,
      meshUploadCount: controller.meshUploadCount,
      activeDrawCount: metrics.activeDrawCount,
      compiledHash: compiled.compiledHash,
      retainedBytes: compiled.totalBytes,
      strictMaterial: appearance?.active === true && appearance.fallbackReason === undefined,
      appearanceAssetId: appearance?.appearanceAssetId ?? "",
      appearanceHash: appearance?.appearanceHash ?? "",
      normalContentHash: appearance?.normalContentHash ?? "",
      compositionMode: controller.compositionMode,
      depthWriteEnabled: controller.depthWriteEnabled,
      refractionEnabled: optics?.refractionEnabled ?? false,
      fresnelF0: optics?.opticalProfile.fresnelF0 ?? 0,
      reflectionRoughness: optics?.opticalProfile.roughness ?? 0,
      reflectionIntensity: optics?.opticalProfile.reflectionIntensity ?? 0,
      requestedReflectionSource: optics?.requestedSource ?? "sky",
      effectiveReflectionSource: optics?.effectiveSource ?? "sky",
      reflectionMode: activation.reflection?.reflectionMode ?? "environment",
      requestedReflectionMode: optics?.requestedMode ?? "analytic",
      effectiveReflectionMode: optics?.effectiveMode ?? "analytic",
      reflectionFallbackReason: optics?.fallbackReason,
      reflectionTextureSize: Object.freeze([optics?.textureWidth ?? 0, optics?.textureHeight ?? 0] as [number, number]),
      reflection: this._sceneHost.getReflectionMetrics()!,
      environmentReflection: this._environmentReflection.inspection,
      environmentFallbackIntensity: optics?.environmentFallbackIntensity ?? 1,
      reflectionSampling: Object.freeze({ ...controller.reflectionSamplingSettings }),
      localReflectionProbe: createDisabledLocalReflectionProbeInspection(false),
      appearanceFeatures: controller.surfaceAppearanceFeatureFlags,
      debugMode: (optics?.debugView as HeightfieldWaterDebugMode | undefined) ?? HeightfieldWaterDebugMode.Final,
      surfaceTimeOverride: controller.surfaceTimeOverride,
      screenSpaceReflectionConsumption:
        controller.activeScreenSpaceReflectionConsumption ??
        Object.freeze({
          requested: false,
          effective: false,
          requestedIntensity: 0,
          effectiveIntensity: 0
        }),
      cameraFeatures: hostDiagnostics.cameraFeatures,
      activationPath: "load-instance",
      assetId: GRASSLANDS_TERRAIN_WATER_ASSET_ID,
      instanceId: GRASSLANDS_TERRAIN_WATER_INSTANCE_ID,
      providerId: GRASSLANDS_TERRAIN_WATER_PROVIDER_ID,
      activation,
      loader: this._loader.metrics,
      runtimeResources: hostDiagnostics.runtimeResources,
      backendActiveRuntimeCount: this._backend.activeRuntimeCount,
      worldRegisteredBodyCount,
      gameplayQueryRegistered: activation.queryEnabled && worldRegisteredBodyCount > 0
    });
  }

  readSpatialFieldGpuCalibration(): Promise<WaterSpatialFieldEngineTextureCalibrationReadback> {
    this._requireActive();
    const runtime = this._requireRuntime();
    const compiled = runtime.compiledDiagnostics;
    if (!compiled) throw new Error("Terrain Grasslands compiled diagnostics are unavailable.");
    const atlas = compiled.localMapAtlas;
    const binding = runtime.activation.spatialFieldProvider.gpuBinding;
    if (!binding) {
      throw new Error("Terrain Grasslands Heightfield Spatial Field did not publish its GPU binding.");
    }
    return readWaterSpatialFieldEngineTextureCalibration({
      encoding: "heightfield-local-map-v1",
      binding,
      width: atlas.width,
      height: atlas.height,
      expectedRgbaBytes: atlas.pixels.slice(),
      maximumDepth: atlas.maxDepth,
      shoreDistanceRange: atlas.signedDistanceRange,
      maximumDepthDecodeError: binding.maximumDepthDecodeError,
      maximumShoreDecodeError: binding.maximumShoreDecodeError
    });
  }

  destroy(): Promise<GrasslandsTerrainWaterPcgDisposedSnapshot> {
    if (this._destroyPromise) return this._destroyPromise;
    this._destroyed = true;
    this._destroyPromise = this._destroyOwned();
    return this._destroyPromise;
  }

  private async _destroyOwned(): Promise<GrasslandsTerrainWaterPcgDisposedSnapshot> {
    let resourceReferenceCount = 0;
    try {
      resourceReferenceCount = this._handle.inspect().resourceReferenceCount;
    } catch {
      // The existing Host may already have retired this Body or been destroyed.
    }
    const errors: unknown[] = [];
    try {
      await this._sceneHost.removeBody(GRASSLANDS_TERRAIN_WATER_INSTANCE_ID);
    } catch (error) {
      if (this._sceneHost.getDiagnostics().lifecycle === "active") errors.push(error);
    }
    let backendDetached = false;
    try {
      backendDetached = this._backendLease.release();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "Terrain Grasslands Host Body cleanup reported multiple errors.");
    }
    return Object.freeze({
      disposed: true,
      handleActive: false,
      resourceReferenceCount: Math.max(0, resourceReferenceCount - 1),
      resourceDisposed: backendDetached,
      loader: this._loader.metrics,
      runtimeResources: this._sceneHost.getDiagnostics().runtimeResources,
      backendActiveRuntimeCount: this._backend.activeRuntimeCount,
      worldRegisteredBodyCount: this._sceneHost.getDiagnostics().world.registeredBodyCount,
      cameraFeatures: this._sceneHost.getDiagnostics().cameraFeatures,
      reflection: this._sceneHost.getReflectionMetrics()!,
      environmentReflection: this._environmentReflection.inspection,
      localReflectionProbe: createDisabledLocalReflectionProbeInspection(true)
    });
  }

  private _requireRuntime() {
    const runtime = this._backend.getRuntimeDiagnostics(GRASSLANDS_TERRAIN_WATER_INSTANCE_ID);
    if (!runtime) {
      throw new Error("Terrain Grasslands WaterBody runtime is unavailable.");
    }
    return runtime;
  }

  private _sampleRainImpactSurface(
    worldPosition: Parameters<WaterSurfaceProvider["sampleSurface"]>[0],
    outSample: WaterSurfaceSample
  ): boolean {
    this._requireActive();
    if (!this._handle.runtimeInterfaces.surface) {
      throw new Error("Terrain Grasslands lake runtime must publish a surface provider.");
    }
    const lakeHit = this._handle.runtimeInterfaces.surface.sampleSurface(worldPosition, outSample);
    const sceneHit = this._sceneHost.world.sampleSurface(worldPosition, this._sceneSurfaceSample);
    if (!sceneHit) return lakeHit;
    if (lakeHit && outSample.surfacePosition.y >= this._sceneSurfaceSample.surfacePosition.y) return true;
    copyWaterSurfaceSample(this._sceneSurfaceSample, outSample);
    return true;
  }

  private _requireActive(): void {
    if (this._destroyed) {
      throw new Error("Terrain Grasslands water integration has been destroyed.");
    }
  }
}

function copyWaterSurfaceSample(source: WaterSurfaceSample, target: WaterSurfaceSample): void {
  target.waterBodyId = source.waterBodyId;
  target.surfacePosition.copyFrom(source.surfacePosition);
  target.surfaceNormal.copyFrom(source.surfaceNormal);
  target.waterVelocity.copyFrom(source.waterVelocity);
  target.waterDepth = source.waterDepth;
}
