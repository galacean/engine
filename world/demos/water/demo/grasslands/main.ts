import { createLakeEditRevision, LakeEditSession, type LakeEditRevision } from "./landscape/LakeEditSession.ts";
import type { LakeTerrainPreset } from "./landscape/LakeBasinTerrain.ts";
import {
  sampleWaterTerrainHeight,
  createHeightfieldWaterBodySourceDescriptorV1,
  createHeightfieldWaterRepresentationDataV1,
  WaterQualityTier,
  WaterFieldProviderKind
} from "@galacean/engine-water/water/index";
import {
  sampleLakeBoundary,
  sampleLakeTerrainHeight,
  validateHeightfieldWaterDescriptor,
  hashStableValue
} from "@galacean/engine-water/water/compiler/index";

import {
  HeightfieldWaterBaseQueryService,
  createHeightfieldWaterBaseQueryResult,
  HeightfieldWaterCompileWorkerClient,
  HeightfieldWaterBackend,
  type HeightfieldWaterBackendRuntimeContext
} from "@galacean/engine-water/water/runtime/heightfield/index";
import type { LakeBoundaryV1 } from "@galacean/engine-water/water/index";
import { GrasslandsLakeShorelineMarkers } from "./GrasslandsLakeShorelineMarkers.ts";
import {
  createGrasslandsLakeAuthoringControls,
  withLakeTerrainEditAvailability
} from "./GrasslandsLakeAuthoringControls.ts";

import {
  BloomEffect,
  Color,
  ColorAdjustmentsEffect,
  DayNightProceduralSky,
  DayNightSolarPosition,
  Downsampling,
  Layer,
  PostProcess,
  RealtimeIBLBaker,
  Script,
  ShaderProperty,
  ShadowCascadesMode,
  TonemappingEffect,
  TonemappingMode,
  Vector4,
  WebGLEngine,
  WebGLMode,
  type Camera,
  type Entity
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { resizeEngineCanvasByClientSize } from "../resizeEngineCanvas.ts";

import type {
  WaterCompiledResourceReadPort,
  HeightfieldWaterCompiledData
} from "@galacean/engine-water/water/compiler/index";

import type { HeightfieldWaterRuntimeController } from "@galacean/engine-water/water/runtime/heightfield/index";
import {
  HeightfieldWaterCompositionMode,
  HeightfieldWaterDebugMode
} from "@galacean/engine-water/water/runtime/heightfield/config";
import type { HeightfieldWaterSurfaceAppearanceFeatureFlags } from "@galacean/engine-water/water/runtime/heightfield/config";
import {
  WaterBackendRegistry,
  resolveWaterBodyQualityTier,
  WaterBodyAssetRegistry,
  WaterBodyLoader,
  type WaterBodyActivationHandle,
  WaterWorld,
  CameraWaterFeatureBroker,
  WaterReflectionPreRenderSynchronizer,
  WaterReflectionService,
  WaterEnvironmentReflectionProvider,
  calculateWaterFresnelF0
} from "@galacean/engine-water/water/runtime/index";

import { WaterRuntimeResourceRegistry } from "@galacean/engine-water/water/runtime/resources/index";
import type { WaterOpticalProfile, WaterSurfaceAppearanceBindingV2 } from "@galacean/engine-water/water/runtime/index";

import { createShowcaseCameraController, type ShowcaseCameraController } from "../showcase/ShowcaseCameraControl.ts";
import { resolveShowcaseCameraMode, SHOWCASE_CAMERA_MOVEMENT_SPEED } from "../showcase/ShowcaseCameraPolicy.ts";
import { type WaterShowcaseAcceptanceSnapshot } from "../showcase/WaterShowcaseAcceptance.ts";
import {
  LakeNormalAssetLoader,
  LAKE_NORMAL_ASSET_ID,
  LAKE_NORMAL_CONTENT_HASH,
  LAKE_NORMAL_HEIGHT,
  LAKE_NORMAL_WIDTH,
  type LakeNormalAssetSource,
  LAKE_NORMAL_RESOURCE
} from "@galacean/engine-water/water/resources/lake/index";
import { GrasslandsAsyncTeardownBarrier } from "./GrasslandsAsyncTeardownBarrier.ts";
import { WaterLandscapeAssets } from "../shared/WaterLandscapeAssets.ts";
import { LAKE_LANDSCAPE_ASSET_HASH } from "./landscape/LakeLandscapeAssetCatalog.ts";
import {
  GRASSLANDS_ENVIRONMENT_REFLECTION_EXPOSURE,
  GRASSLANDS_ENVIRONMENT_REFLECTION_HDR,
  GRASSLANDS_ENVIRONMENT_REFLECTION_ROTATION_DEGREES
} from "./GrasslandsEnvironmentReflectionConfig.ts";
import { createGrasslandsPcgFixture } from "./GrasslandsPcgFixture.ts";
import {
  GRASSLANDS_LAKE_MAX_BASIN_DEPTH,
  grasslandsQualityPresetIdForQuality,
  GRASSLANDS_STYLIZED_WATER_INSTANCE_ID,
  registerGrasslandsStylizedWaterBodyAuthoring
} from "./GrasslandsWaterBodyAuthoring.ts";
import {
  lakeOpticsPresetIdForQuality,
  lakeLookPresetIdForQuality,
  LAKE_HYBRID_APPEARANCE_PRESET_ID,
  LAKE_SURFACE_FIELD_DEPENDENCIES_V2,
  LAKE_LOCAL_LOW_SURFACE_FIELDS_V2,
  LAKE_LOCAL_MEDIUM_SURFACE_FIELDS_V2,
  LAKE_SHOWCASE_OPTICAL_PROFILE,
  LAKE_COMPILED_SURFACE_APPEARANCE_V2
} from "@galacean/engine-water/water/presets/lake/index";

import {
  GrasslandsLightingController,
  createGrasslandsReferenceLightingReadback
} from "./GrasslandsLightingController.ts";
import { GRASSLANDS_PCG_PRESET, GRASSLANDS_SHARED_SHOWCASE_CAPTURE_POSES } from "./GrasslandsPcgPreset.ts";

import {
  PROCEDURAL_SKY_REALTIME_IBL_OPTIONS,
  PROCEDURAL_SKY_SOLAR_POSITION
} from "@galacean/engine-environment/lighting/ProceduralSkyLightingProfile";

import {
  GrasslandsSceneController,
  type GrasslandsAnchorRockReadback,
  type GrasslandsDirectLightState
} from "./GrasslandsSceneController.ts";
import {
  createGrasslandsShowcaseAcceptanceApi,
  createGrasslandsSharedAcceptanceSnapshot,
  createGrasslandsSharedShowcaseCaptureApi,
  type GrasslandsAcceptanceRuntimeReadback,
  type GrasslandsReflectionScenario,
  type GrasslandsSharedCaptureState,
  type GrasslandsShowcaseAcceptanceApi,
  type GrasslandsShowcaseAcceptanceSnapshot
} from "./GrasslandsShowcaseAcceptance.ts";
import {
  GRASSLANDS_FIXED_SURFACE_TIME,
  resolveGrasslandsSurfaceTimeOverride,
  resolveGrasslandsSurfaceTimeReadback
} from "./GrasslandsSurfaceTimePolicy.ts";
import type { GrasslandsVector3 } from "./GrasslandsPcgTypes.ts";
import { isGrasslandsExclusionClean, observeGrasslandsExcludedResources } from "./GrasslandsRuntimeObservation.ts";

const GRASSLANDS_LIFECYCLE_JOURNAL_KEY = "water-pcg-grasslands-last-dispose";
const SCENE_WEATHER_STATE = ShaderProperty.getByName("scene_WeatherState");
const SCENE_WEATHER_TIME = ShaderProperty.getByName("scene_WeatherTime");
const GRASSLANDS_INITIAL_LIGHTING_READBACK = createGrasslandsReferenceLightingReadback();
const GRASSLANDS_TOP_DOWN_CAMERA_POSE = Object.freeze({
  position: Object.freeze([0, 90, 0] as const),
  target: Object.freeze([0, 0, 0] as const),
  worldUp: Object.freeze([0, 0, -1] as const)
});
type GrasslandsCameraPose = GrasslandsSharedCaptureState | "top-down";
const GRASSLANDS_DEVTOOLS_CAMERA_POSES = Object.freeze({
  "Hero view": "hero",
  "Interaction view": "interaction",
  "Detail view": "detail",
  "Top-down view": "top-down"
} satisfies Readonly<Record<string, GrasslandsCameraPose>>);
const DEFAULT_APPEARANCE_FEATURE_FLAGS: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags> = Object.freeze({
  externalNormal: true,
  depthTint: true,
  coastalAlpha: true,
  contactFoam: true,
  directSpecular: true
});

function freezeVector3(x: number, y: number, z: number): GrasslandsVector3 {
  return Object.freeze([x, y, z] as const);
}

function isGrasslandsCameraPose(value: string): value is GrasslandsCameraPose {
  return value === "top-down" || Object.hasOwn(GRASSLANDS_SHARED_SHOWCASE_CAPTURE_POSES, value);
}

function vectorsMatch(actual: GrasslandsVector3 | undefined, expected: GrasslandsVector3, epsilon = 1e-6): boolean {
  return actual !== undefined && actual.every((value, axis) => Math.abs(value - expected[axis]) <= epsilon);
}

function qualityOpticsTier(quality: WaterQualityTier): "off" | "medium" | "high" {
  return quality === WaterQualityTier.Low ? "off" : quality === WaterQualityTier.High ? "high" : "medium";
}

function downsamplingLabel(value: Downsampling, enabled: boolean): "off" | "none" | "2x" {
  if (!enabled) return "off";
  return value === Downsampling.None ? "none" : "2x";
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function bootstrapGrasslandsShowcase(): Promise<void> {
  const bootstrapSearch = new URLSearchParams(window.location.search);
  const requestedSeed = bootstrapSearch.has("seed") ? Number(bootstrapSearch.get("seed")) : GRASSLANDS_PCG_PRESET.seed;
  const requestedRainRate = Number(bootstrapSearch.get("rainRate") ?? 0);
  const rainRate = Number.isFinite(requestedRainRate) ? Math.min(Math.max(requestedRainRate, 0), 1) : 0;
  const weatherState = new Vector4(rainRate, 0, 0, 0);
  const fixture = createGrasslandsPcgFixture(requestedSeed);
  const initialLakeRevision = createLakeEditRevision(
    fixture.descriptor,
    {
      boundary: fixture.descriptor.lakeBoundary!,
      basin: { referenceLevel: 0, depth: 3.2, shoreWidth: 8 }
    },
    0
  );
  let currentLakeDescriptor = initialLakeRevision.descriptor;
  let lakeEditSession: LakeEditSession | undefined;
  let lakeShorelineMarkers: GrasslandsLakeShorelineMarkers | undefined;
  let engine: WebGLEngine | undefined;
  let root: Entity | undefined;
  let runtimeController: HeightfieldWaterRuntimeController | undefined;
  let waterBodyHandle: WaterBodyActivationHandle | undefined;
  let waterBodyLoader: WaterBodyLoader | undefined;
  let waterBackend: HeightfieldWaterBackend | undefined;
  let waterWorld: WaterWorld | undefined;
  let runtimeResourceRegistry: WaterRuntimeResourceRegistry | undefined;
  let cameraFeatureBroker: CameraWaterFeatureBroker | undefined;
  let reflectionService: WaterReflectionService | undefined;
  let reflectionServiceLease: ReturnType<typeof WaterReflectionService.acquire> | undefined;
  let reflectionSynchronizer: WaterReflectionPreRenderSynchronizer | undefined;
  let environmentReflectionProvider: WaterEnvironmentReflectionProvider | undefined;
  let environmentIBLBaker: RealtimeIBLBaker | undefined;
  let proceduralSky: DayNightProceduralSky | undefined;
  let sceneController: GrasslandsSceneController | undefined;
  let lightingController: GrasslandsLightingController | undefined;
  let environmentAssets: WaterLandscapeAssets | undefined;
  let cameraController: ShowcaseCameraController | undefined;
  let assetLoader: LakeNormalAssetLoader | undefined;
  let compileWorker: HeightfieldWaterCompileWorkerClient | undefined;
  let activeResource: WaterCompiledResourceReadPort<HeightfieldWaterCompiledData> | undefined;
  let appearanceBinding: Readonly<WaterSurfaceAppearanceBindingV2> | undefined;
  let currentQuality = WaterQualityTier.High;
  let currentDebugMode = HeightfieldWaterDebugMode.Final;
  let appearanceEnabled = true;
  let reflectionEnabled = true;
  let runtimeOperationalReady = false;
  let runtimeError: string | null = null;
  let phase: GrasslandsAcceptanceRuntimeReadback["phase"] = "initializing";
  let cameraMode: "free" | "fixed" = "fixed";
  let currentCameraPose: GrasslandsCameraPose = "hero";
  let automation = false;
  let normalSource: LakeNormalAssetSource = "tracked";
  let rebuildRevision = 0;
  let activeLoadAbort: AbortController | undefined;
  let rebuildQueue: Promise<void> = Promise.resolve();
  let lifecycleDisposed = false;
  let runtimeControllerDestroyed = false;
  let compileWorkerDisposed = false;
  let cameraFeatureBrokerDestroyed = false;
  let cameraControllerDestroyed = false;
  let sceneControllerDestroyed = false;
  let environmentAssetsDestroyed = false;
  let rootDestroyed = false;
  let engineDestroyed = false;
  let perFrameMeshUploadDetected = false;
  let lastStableMeshUploadCount = 0;
  let engineUpdateCount = 0;
  let weatherTime = 0;
  let lifecycleDisposeMode: "manual" | "failure" = "manual";
  let waterTeardownStarted = false;
  let currentAppearanceFeatureFlags: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags> =
    DEFAULT_APPEARANCE_FEATURE_FLAGS;
  let refractionEnabled = true;
  let reflectionScenario: GrasslandsReflectionScenario = "environment";
  let beforeUnloadHandler: (() => void) | undefined;
  let compileAndActivateImpl: (quality: WaterQualityTier) => Promise<void> = async () => {
    throw new Error("Grasslands runtime is not initialized.");
  };
  let cleanupImpl: (mode?: "manual" | "failure") => GrasslandsShowcaseAcceptanceSnapshot;
  let finalizeEngineTeardown: (() => void) | undefined;
  const teardownBarrier = new GrasslandsAsyncTeardownBarrier(() => finalizeEngineTeardown?.());

  const publishWaterResource = (resource: WaterCompiledResourceReadPort<HeightfieldWaterCompiledData>): void => {
    activeResource = resource;
    if (resource.data.lakeBoundary) lakeShorelineMarkers?.update(resource.data.lakeBoundary);
  };

  const synchronizePublishedRuntime = (): HeightfieldWaterRuntimeController | undefined => {
    const nextRuntime = waterBackend?.getRuntimeDiagnostics(GRASSLANDS_STYLIZED_WATER_INSTANCE_ID);
    const nextResource = waterBodyHandle?.resource as
      | WaterCompiledResourceReadPort<HeightfieldWaterCompiledData>
      | undefined;
    if (!nextRuntime || !nextResource) return runtimeController;
    if (nextRuntime.controller === runtimeController && nextResource === activeResource) return runtimeController;
    runtimeController = nextRuntime.controller;
    appearanceBinding = runtimeController.surfaceAppearanceBinding;
    publishWaterResource(nextResource);
    const resolvedQuality = waterBodyHandle?.inspect().quality?.tier;
    if (resolvedQuality !== undefined) {
      currentQuality = resolvedQuality;
    }
    runtimeController.flushDeferredResources();
    lastStableMeshUploadCount = runtimeController.meshUploadCount;
    return runtimeController;
  };

  const readRuntime = (): GrasslandsAcceptanceRuntimeReadback => {
    synchronizePublishedRuntime();
    const appearance = runtimeController?.activeSurfaceAppearanceReadback;
    const optics = runtimeController?.activeSurfaceOpticsReadback;
    const runtimeResources = runtimeController?.resourceMetrics;
    const appearanceFlags = runtimeController?.surfaceAppearanceFeatureFlags;
    const broker = cameraFeatureBroker?.metrics;
    const scene = sceneController?.metrics;
    const loader = assetLoader?.readback;
    const environment = environmentAssets?.metrics;
    const reflectionMetrics = reflectionService?.metrics;
    const lighting = lightingController?.readback ?? GRASSLANDS_INITIAL_LIGHTING_READBACK;
    const activeScene = engine && !engineDestroyed ? engine.sceneManager.activeScene! : undefined;
    const exclusionResources = observeGrasslandsExcludedResources(activeScene, sceneController?.camera, optics);
    const activeSetCount = runtimeResources?.activeRuntimeSetCount ?? 0;
    const opaqueTextureRequested = broker?.opaqueTextureRequested ?? false;
    const depthTextureRequested = broker?.depthTextureRequested ?? false;
    const fieldGraph = broker?.surfaceFieldGraphs.length === 1 ? broker.surfaceFieldGraphs[0]?.graph : undefined;
    const effectiveDepth = (broker?.totalDepthCopyPassCount ?? 0) === 1;
    const effectiveOpaque = (broker?.totalColorCopyPassCount ?? 0) === 1;
    const effectiveDownsampling = downsamplingLabel(
      broker?.opaqueTextureDownsampling ?? Downsampling.None,
      effectiveOpaque
    );
    const actualPosition = sceneController?.cameraEntity.transform.worldPosition;
    const actualForward = sceneController?.cameraEntity.transform.worldForward;
    const cameraPosition = actualPosition
      ? freezeVector3(actualPosition.x, actualPosition.y, actualPosition.z)
      : fixture.camera.position;
    const cameraForward = actualForward
      ? freezeVector3(actualForward.x, actualForward.y, actualForward.z)
      : fixture.camera.forward;
    const fallbackReason = appearance?.fallbackReason ?? loader?.fallbackReason ?? null;
    const activeV2Appearance = appearanceBinding?.appearance;
    const firstV2Detail = activeV2Appearance?.detailLayers[0];
    const v2Depth = activeV2Appearance?.depthResponse;
    const v2Coastal = activeV2Appearance?.boundaryEffects.find(({ id }) => id === "coastal-alpha");
    const v2Contact = activeV2Appearance?.boundaryEffects.find(({ id }) => id === "contact-foam");
    const materialActive = appearance?.active === true && appearance.normalContentHash === fixture.externalAssetHash;
    const allAppearanceFeaturesEnabled =
      appearanceFlags?.externalNormal === true &&
      appearanceFlags.depthTint === true &&
      appearanceFlags.coastalAlpha === true &&
      appearanceFlags.contactFoam === true &&
      appearanceFlags.directSpecular === true;
    const strictAppearanceParameters =
      activeV2Appearance?.sourceId === LAKE_COMPILED_SURFACE_APPEARANCE_V2.sourceId &&
      appearance?.normalTextureWidth === LAKE_NORMAL_WIDTH &&
      appearance.normalTextureHeight === LAKE_NORMAL_HEIGHT &&
      appearance.normalLayerCount === 2 &&
      activeV2Appearance.detailLayers.length === 2 &&
      activeV2Appearance.detailLayers.every(
        (layer) =>
          layer.scale[0] === 0.05 &&
          layer.scale[1] === 0.05 &&
          layer.velocity[0] === 0.02 &&
          layer.velocity[1] === 0.02 &&
          layer.strength === 0.2 &&
          layer.normalConvention === "opengl" &&
          layer.strengthMode === "preserve-source-z" &&
          layer.blend === "partial-derivative"
      ) &&
      v2Depth?.model === "power-ramp" &&
      v2Depth.field === "vertical-depth" &&
      v2Depth.distanceMeters === 3.6 &&
      v2Depth.exponent === 1.1 &&
      v2Coastal?.field === "scene-ray-depth" &&
      v2Coastal.rangeMeters ===
        LAKE_COMPILED_SURFACE_APPEARANCE_V2.boundaryEffects.find(({ id }) => id === "coastal-alpha")?.rangeMeters &&
      v2Contact?.field === "obstacle-contact" &&
      v2Contact.rangeMeters === 0.1791 &&
      v2Contact.pattern?.model === "animated-voronoi-f1" &&
      v2Contact.pattern.worldScale === 2.5 &&
      v2Contact.pattern.timeRate === 1 &&
      v2Contact.pattern.opacity === 0.453 &&
      v2Contact.pattern.octaves.count === 3 &&
      v2Contact.pattern.octaves.weights[0] === 0.5 &&
      v2Contact.pattern.octaves.weights[1] === 0.25 &&
      v2Contact.pattern.octaves.weights[2] === 0.125 &&
      v2Contact.pattern.lacunarity === 2 &&
      v2Contact.pattern.response === "power" &&
      v2Contact.pattern.invert === true &&
      v2Contact.pattern.exponent === -1.5 &&
      v2Contact.pattern.combine === "signed-boundary-add-saturate" &&
      v2Contact.outputs.refractionSuppression === undefined &&
      v2Contact.outputs.roughness === 1 &&
      activeV2Appearance.refraction.uvScale === LAKE_COMPILED_SURFACE_APPEARANCE_V2.refraction.uvScale &&
      activeV2Appearance.refraction.normalSource === "tangent-space" &&
      activeV2Appearance.refraction.validation === "shifted-scene-depth" &&
      activeV2Appearance.composition === "precomposed-replace";
    const actualCompositionMode = runtimeController?.compositionMode ?? HeightfieldWaterCompositionMode.AlphaBlend;
    const actualDepthWriteEnabled = runtimeController?.depthWriteEnabled ?? false;
    const actualSurfaceTime = resolveGrasslandsSurfaceTimeReadback(
      runtimeController?.surfaceTimeOverride,
      engine?.time.elapsedTime
    );
    const surfaceTimeReady = automation
      ? runtimeController?.surfaceTimeOverride === GRASSLANDS_FIXED_SURFACE_TIME
      : runtimeController?.surfaceTimeOverride === undefined && actualSurfaceTime >= 0;
    const gameplayQueryRegistered =
      waterBodyHandle?.queryEnabled === true && (waterWorld?.metrics.registeredBodyCount ?? 0) > 0;
    const directLightEnabled = scene?.directLight.enabled === true;
    const directLightMatchesFixture =
      directLightEnabled &&
      scene?.directLight.state === "default" &&
      vectorsMatch(scene.directLight.color, fixture.directLight.color) &&
      Math.abs(scene.directLight.intensity - fixture.directLight.intensity) <= 1e-6 &&
      vectorsMatch(
        scene.directLight.effectiveColor,
        freezeVector3(
          fixture.directLight.color[0] * fixture.directLight.intensity,
          fixture.directLight.color[1] * fixture.directLight.intensity,
          fixture.directLight.color[2] * fixture.directLight.intensity
        )
      ) &&
      vectorsMatch(scene.directLight.forward, fixture.directLight.forward);
    const sceneReady =
      scene?.destroyed === false &&
      scene.finite &&
      scene.environmentReady &&
      scene.environmentAssetSetHash === LAKE_LANDSCAPE_ASSET_HASH &&
      scene.terrainMaterialRegionCount === 3 &&
      scene.terrainMaterialRegionIds.join(",") === "mud-stones,sand,grass-mud" &&
      scene.rockModelResourceCount === 5 &&
      scene.largeRockVariantCount === 2 &&
      scene.smallRockVariantCount === 3 &&
      scene.sharedRockMeshCount === 5 &&
      scene.proxyRockMeshCount === 0 &&
      environment?.ready === true &&
      isGrasslandsExclusionClean(exclusionResources);
    const highFieldGraphReady =
      fieldGraph?.active === true &&
      fieldGraph.failed === false &&
      fieldGraph.quality === WaterQualityTier.High &&
      fieldGraph.bindings.length === LAKE_SURFACE_FIELD_DEPENDENCIES_V2.bindings.length &&
      fieldGraph.bindings.every((binding) => binding.status === "resolved") &&
      fieldGraph.bindings.find((binding) => binding.consumerId === "contact-foam")?.resolvedProvider ===
        WaterFieldProviderKind.CameraDepth &&
      fieldGraph.bindings.find((binding) => binding.consumerId === "water-column-depth")?.resolvedProvider ===
        WaterFieldProviderKind.CompiledSpatialField;
    const mediumFieldGraphReady =
      fieldGraph?.sourceId === LAKE_LOCAL_MEDIUM_SURFACE_FIELDS_V2.id &&
      fieldGraph.active === true &&
      fieldGraph.failed === false &&
      fieldGraph.quality === WaterQualityTier.Medium &&
      fieldGraph.cameraDepthRequested === false &&
      fieldGraph.cameraOpaqueColorRequested === true &&
      fieldGraph.bindings.length === LAKE_LOCAL_MEDIUM_SURFACE_FIELDS_V2.bindings.length &&
      fieldGraph.bindings.every((binding) => binding.status === "resolved") &&
      fieldGraph.bindings.find((binding) => binding.consumerId === "water-column-depth")?.resolvedProvider ===
        WaterFieldProviderKind.CompiledSpatialField &&
      fieldGraph.bindings.find((binding) => binding.consumerId === "scene-composition-color")?.resolvedProvider ===
        WaterFieldProviderKind.CameraOpaqueColor;
    const brokerReady =
      currentQuality === WaterQualityTier.Low
        ? (broker?.activeConsumerCount ?? 0) === 0 &&
          (broker?.surfaceFieldGraphs.length ?? 0) === 0 &&
          LAKE_LOCAL_LOW_SURFACE_FIELDS_V2.bindings.length === 2
        : currentQuality === WaterQualityTier.High
          ? broker?.depthTextureRequested === true &&
            broker.opaqueTextureRequested === true &&
            broker.depthCopyPassCount === 1 &&
            broker.colorCopyPassCount === 1 &&
            broker.surfaceFieldGraphs.length === 1 &&
            highFieldGraphReady
          : broker?.depthTextureRequested === false &&
            broker.opaqueTextureRequested === true &&
            broker.depthCopyPassCount === 0 &&
            broker.colorCopyPassCount === 1 &&
            broker.surfaceFieldGraphs.length === 1 &&
            mediumFieldGraphReady;
    const operationalReady =
      runtimeOperationalReady &&
      activeSetCount === 1 &&
      sceneReady &&
      brokerReady &&
      runtimeError === null &&
      !lifecycleDisposed;
    const strictMaterialReady =
      operationalReady &&
      currentQuality === WaterQualityTier.High &&
      materialActive &&
      appearanceEnabled &&
      allAppearanceFeaturesEnabled &&
      strictAppearanceParameters &&
      runtimeController?.refractionEnabled === true &&
      reflectionEnabled &&
      optics?.requestedSource === "ssr" &&
      optics.effectiveSource === "ssr" &&
      optics.requestedMode === "ssr" &&
      optics.effectiveMode === "ssr" &&
      optics.environmentProviderId === "water-pcg-grasslands-scene-environment" &&
      optics.environmentOwnership === "borrowed" &&
      optics.environmentRotationDegrees === GRASSLANDS_ENVIRONMENT_REFLECTION_ROTATION_DEGREES &&
      optics.environmentExposure === GRASSLANDS_ENVIRONMENT_REFLECTION_EXPOSURE &&
      optics.environmentIntensity === 1 &&
      optics.environmentColorSpace === "linear" &&
      optics.environmentHDR === GRASSLANDS_ENVIRONMENT_REFLECTION_HDR &&
      (optics.environmentMaximumMipLevel ?? 0) > 0 &&
      optics.opticalProfile.fresnelF0 ===
        calculateWaterFresnelF0(LAKE_SHOWCASE_OPTICAL_PROFILE.indexOfRefraction ?? 1.333) &&
      optics.opticalProfile.reflectionIntensity === LAKE_SHOWCASE_OPTICAL_PROFILE.reflectionIntensity &&
      optics.fallbackReason === undefined &&
      reflectionMetrics?.borrowedEnvironmentTextureCount === 1 &&
      reflectionMetrics.ownedEnvironmentTextureCount === 0 &&
      reflectionMetrics.boundEnvironmentConsumerCount === 1 &&
      exclusionResources.auxiliaryCameraCount === 0 &&
      exclusionResources.renderTargetCount === 0 &&
      directLightMatchesFixture &&
      actualCompositionMode === HeightfieldWaterCompositionMode.PrecomposedReplace &&
      actualDepthWriteEnabled &&
      surfaceTimeReady &&
      !gameplayQueryRegistered &&
      loader?.ready === true &&
      assetLoader?.resource?.texture.destroyed === false &&
      loader.actualContentHash === loader.expectedContentHash &&
      appearance?.normalContentHash === LAKE_NORMAL_CONTENT_HASH &&
      loader.width === LAKE_NORMAL_WIDTH &&
      loader.height === LAKE_NORMAL_HEIGHT &&
      loader.colorSpace === "linear" &&
      loader.wrapU === "repeat" &&
      loader.wrapV === "repeat" &&
      loader.filter === "bilinear" &&
      loader.mipmaps === true &&
      loader.anisotropy === 1 &&
      fallbackReason === null;
    const finiteValues = [
      fixture.seed,
      fixture.wetTexelCount,
      runtimeController?.meshUploadCount ?? 0,
      scene?.sceneMeshUploadCount ?? 0,
      environment?.sourceByteLength ?? 0,
      actualSurfaceTime,
      activeResource?.memory.cpuStaticBytes ?? 0,
      engine?.renderingStatistics.bufferMemory ?? 0,
      engine?.renderingStatistics.textureMemory ?? 0,
      engine?.renderingStatistics.totalMemory ?? 0,
      ...cameraPosition,
      ...cameraForward,
      ...(scene?.directLight.effectiveColor ?? [0, 0, 0])
    ];
    const finite =
      runtimeError === null && finiteValues.every(Number.isFinite) && (scene?.finite ?? phase === "initializing");
    const normalOwnership = appearance?.ownership === "borrowed" ? "borrowed" : "unavailable";
    const sceneBounds =
      scene?.terrainBounds ??
      Object.freeze({
        minimum: Object.freeze([0, 0, 0] as const),
        maximum: Object.freeze([0, 0, 0] as const)
      });

    return Object.freeze({
      phase,
      ready: operationalReady,
      strictMaterialReady,
      finite,
      runtimeError,
      disposed: lifecycleDisposed,
      qualityTier: currentQuality,
      opticsTier: qualityOpticsTier(currentQuality),
      surfaceTime: actualSurfaceTime,
      runtimeCompiledHash: activeResource?.identity.compiledHash ?? "",
      lakeBoundary: activeResource?.data.lakeBoundary
        ? Object.freeze({
            waterLevel: activeResource.data.lakeBoundary.waterLevel,
            ringCount: activeResource.data.lakeBoundary.rings.length,
            sampledPointCount: activeResource.data.lakeBoundary.rings.reduce((sum, r) => sum + r.length, 0),
            sampleMarkerCount: lakeShorelineMarkers?.sampleCount ?? 0,
            triangleCount: activeResource.data.stats.triangleCount,
            vertexCount: activeResource.data.stats.vertexCount,
            queryCoverage: activeResource.data.lakeBoundary.queryCoverage
          })
        : undefined,
      effectiveDebugMode: (optics?.debugView as HeightfieldWaterDebugMode | undefined) ?? currentDebugMode,
      appearanceFallbackReason: fallbackReason,
      foamOctaveCount: v2Contact?.pattern?.octaves.count ?? 0,
      refractionEnabled: runtimeController?.refractionEnabled === true,
      normal: Object.freeze({
        requested: appearance?.requested ?? false,
        active: appearance?.active ?? false,
        source: normalSource,
        assetId: appearance?.normalAssetId ?? loader?.assetId ?? LAKE_NORMAL_ASSET_ID,
        contentHash: appearance?.normalContentHash ?? loader?.actualContentHash ?? "",
        expectedContentHash: fixture.externalAssetHash,
        width: appearance?.normalTextureWidth ?? loader?.width ?? 0,
        height: appearance?.normalTextureHeight ?? loader?.height ?? 0,
        colorSpace: loader?.colorSpace ?? "unavailable",
        wrapU: loader?.wrapU ?? "unavailable",
        wrapV: loader?.wrapV ?? "unavailable",
        filter: loader?.filter ?? "unavailable",
        mipmaps: loader?.mipmaps === true,
        anisotropy: loader?.anisotropy ?? 0,
        textureDestroyed: assetLoader?.resource?.texture.destroyed ?? true,
        flipGreen: firstV2Detail?.normalConvention === "directx",
        layerCount: appearance?.normalLayerCount ?? 0,
        tiling: firstV2Detail?.scale[0] ?? 0,
        scrollUvPerSecond: firstV2Detail?.velocity[0] ?? 0,
        strength: firstV2Detail?.strength ?? 0,
        ownership: normalOwnership,
        fallbackReason: appearance?.fallbackReason ?? loader?.fallbackReason ?? null
      }),
      appearance: Object.freeze({
        requested: appearance?.requested ?? false,
        active: appearance?.active ?? false,
        enabled: appearanceEnabled,
        assetId: appearance?.appearanceAssetId ?? "",
        appearanceHash: appearance?.appearanceHash ?? "",
        variantKey: appearance?.variantKey ?? "",
        featureFlags: Object.freeze({
          externalNormal: appearanceFlags?.externalNormal ?? false,
          depthTint: appearanceFlags?.depthTint ?? false,
          coastalAlpha: appearanceFlags?.coastalAlpha ?? false,
          contactFoam: appearanceFlags?.contactFoam ?? false,
          directSpecular: appearanceFlags?.directSpecular ?? false
        }),
        depthTint: Object.freeze({
          model: v2Depth?.model ?? "unavailable",
          enabled: v2Depth !== undefined,
          color: Object.freeze(
            v2Depth && "color" in v2Depth ? [...v2Depth.color] : ([0, 0, 0, 0] as [number, number, number, number])
          ) as readonly [number, number, number, number],
          distance: v2Depth && "distanceMeters" in v2Depth ? v2Depth.distanceMeters : 0,
          exponent: v2Depth && "exponent" in v2Depth ? v2Depth.exponent : 0
        }),
        coastalAlpha: Object.freeze({
          model: v2Coastal?.field ?? "unavailable",
          enabled: v2Coastal !== undefined,
          distance: v2Coastal?.rangeMeters ?? 0
        }),
        contactFoam: Object.freeze({
          model: v2Contact?.pattern?.model ?? "unavailable",
          enabled: v2Contact?.pattern !== undefined,
          worldScale: v2Contact?.pattern?.worldScale ?? 0,
          timeRate: v2Contact?.pattern?.timeRate ?? 0,
          opacity: v2Contact?.pattern?.opacity ?? 0,
          contactDistance: v2Contact?.rangeMeters ?? 0,
          octaveCount: v2Contact?.pattern?.octaves.count ?? 0,
          weights: Object.freeze([...(v2Contact?.pattern?.octaves.weights ?? [])]),
          lacunarity: v2Contact?.pattern?.lacunarity ?? 0,
          suppressRefraction: v2Contact?.outputs.refractionSuppression ?? 0,
          smoothnessReduction: v2Contact?.outputs.roughness ?? 0
        }),
        fallbackReason: appearance?.fallbackReason ?? null
      }),
      cameraFeatures: Object.freeze({
        fieldGraph: fieldGraph ?? null,
        requested: Object.freeze({
          depthTexture: depthTextureRequested,
          opaqueTexture: opaqueTextureRequested,
          quality: qualityOpticsTier(currentQuality),
          opaqueDownsampling:
            currentQuality === WaterQualityTier.High
              ? "none"
              : currentQuality === WaterQualityTier.Medium
                ? "2x"
                : "off"
        }),
        effective: Object.freeze({
          depthTexture: effectiveDepth,
          opaqueTexture: effectiveOpaque,
          activeConsumerCount: broker?.activeConsumerCount ?? 0,
          depthCopyPassCount: broker?.depthCopyPassCount ?? 0,
          colorCopyPassCount: broker?.colorCopyPassCount ?? 0,
          opaqueDownsampling: effectiveDownsampling,
          incrementalEstimatedRenderTargetBytes: broker?.incrementalEstimatedRenderTargetBytes ?? 0,
          totalEstimatedRenderTargetBytes: broker?.totalEstimatedRenderTargetBytes ?? 0
        })
      }),
      directLight: Object.freeze({
        bound: materialActive && exclusionResources.directLightComponentCount === 1 && directLightEnabled,
        matchesFixture: directLightMatchesFixture,
        count: exclusionResources.directLightComponentCount,
        state: scene?.directLight.state ?? "disabled",
        enabled: directLightEnabled,
        color: scene?.directLight.color ?? fixture.directLight.color,
        effectiveColor: scene?.directLight.effectiveColor ?? fixture.directLight.color,
        intensity: scene?.directLight.intensity ?? fixture.directLight.intensity,
        forward: scene?.directLight.forward ?? fixture.directLight.forward
      }),
      compositionMode:
        actualCompositionMode === HeightfieldWaterCompositionMode.PrecomposedReplace
          ? "precomposed-replace"
          : "alpha-blend",
      depthWriteEnabled: actualDepthWriteEnabled,
      reflection: Object.freeze({
        contributionEnabled:
          reflectionEnabled &&
          (optics?.effectiveMode !== "environment" || (optics.environmentIntensity ?? 0) > 0) &&
          (optics?.opticalProfile.reflectionIntensity ?? 0) > 0,
        requestedSource: optics?.requestedSource ?? "sky",
        effectiveSource: optics?.effectiveSource ?? "sky",
        requestedMode: optics?.requestedMode ?? "analytic",
        effectiveMode: optics?.effectiveMode ?? "analytic",
        environmentProviderId: reflectionMetrics?.selectedEnvironmentProviderId ?? null,
        environmentOwnership: reflectionMetrics?.environmentAvailable ? "borrowed" : "unavailable",
        environmentRotationDegrees: reflectionMetrics?.environmentRotationDegrees ?? 0,
        environmentExposure: reflectionMetrics?.environmentExposure ?? 0,
        environmentIntensity: reflectionMetrics?.environmentIntensity ?? 0,
        environmentColorSpace: reflectionMetrics?.environmentColorSpace ?? "linear",
        environmentHDR: reflectionMetrics?.environmentHDR ?? false,
        environmentMaximumMipLevel: reflectionMetrics?.environmentMaximumMipLevel ?? 0,
        borrowedEnvironmentTextureCount: reflectionMetrics?.borrowedEnvironmentTextureCount ?? 0,
        ownedEnvironmentTextureCount: 0,
        boundEnvironmentConsumerCount: reflectionMetrics?.boundEnvironmentConsumerCount ?? 0,
        ownerCount: reflectionMetrics?.boundEnvironmentConsumerCount ?? 0,
        intensity: optics?.opticalProfile.reflectionIntensity ?? 0,
        effectiveIntensity: reflectionEnabled
          ? (optics?.opticalProfile.reflectionIntensity ?? 0) *
            (optics?.effectiveMode === "environment"
              ? (optics.environmentExposure ?? 0) * (optics.environmentIntensity ?? 0)
              : 1)
          : 0,
        fallbackReason: optics?.fallbackReason ?? null,
        cameraCount: exclusionResources.auxiliaryCameraCount,
        renderTargetCount: exclusionResources.renderTargetCount
      }),
      runtimeSet: Object.freeze({
        activeSetCount: activeSetCount as 0 | 1,
        activeId: runtimeController?.activeId ?? null,
        compiledHash: activeResource?.identity.compiledHash ?? "",
        chunkCount: runtimeController?.activeChunkCount ?? 0,
        drawCount: runtimeResources?.activeDrawCount ?? 0,
        meshUploadCount: runtimeController?.meshUploadCount ?? 0,
        perFrameMeshUpload: perFrameMeshUploadDetected,
        activeWaveCount: runtimeController?.activeData?.waveSet.activeWaveCount ?? 0,
        waveStrength: runtimeController?.activeData?.surfaceMotion.waveStrength ?? 0,
        gameplayQueryRegistered
      }),
      resources: Object.freeze({
        bufferMemory: engine?.renderingStatistics.bufferMemory ?? 0,
        textureMemory: engine?.renderingStatistics.textureMemory ?? 0,
        totalMemory: engine?.renderingStatistics.totalMemory ?? 0,
        liveRenderTargets: exclusionResources.renderTargetCount,
        liveReflectionCameras: exclusionResources.auxiliaryCameraCount,
        meshUploadCount: (runtimeController?.meshUploadCount ?? 0) + (scene?.sceneMeshUploadCount ?? 0),
        perFrameMeshUpload: perFrameMeshUploadDetected,
        ownedTextureCount:
          Math.max(0, (loader?.textureCreateCount ?? 0) - (loader?.textureDestroyCount ?? 0)) +
          (runtimeResources?.retainedLocalMapTextureCount ?? 0) +
          Math.max(0, (environment?.textureCreateCount ?? 0) - (environment?.textureDestroyCount ?? 0)),
        borrowedTextureCount:
          (loader?.activeRuntimeBorrowCount ?? 0) + (reflectionMetrics?.borrowedEnvironmentTextureCount ?? 0),
        textureCreateCount:
          (loader?.textureCreateCount ?? 0) +
          (runtimeResources?.localMapTextureCreateCount ?? 0) +
          (environment?.textureCreateCount ?? 0),
        textureDestroyCount:
          (loader?.textureDestroyCount ?? 0) +
          (runtimeResources?.localMapTextureDestroyCount ?? 0) +
          (environment?.textureDestroyCount ?? 0),
        materialCount:
          (runtimeResources?.retainedMaterialCount ?? 0) +
          Math.max(0, (environment?.materialCreateCount ?? 0) - (environment?.materialDestroyCount ?? 0)),
        runtimeSetCreateCount: runtimeResources?.runtimeSetCreateCount ?? 0,
        runtimeSetDestroyCount: runtimeResources?.runtimeSetDestroyCount ?? 0,
        materialCreateCount: (runtimeResources?.materialCreateCount ?? 0) + (environment?.materialCreateCount ?? 0),
        materialDestroyCount: (runtimeResources?.materialDestroyCount ?? 0) + (environment?.materialDestroyCount ?? 0),
        localMapTextureCreateCount: runtimeResources?.localMapTextureCreateCount ?? 0,
        localMapTextureDestroyCount: runtimeResources?.localMapTextureDestroyCount ?? 0,
        meshCreateCount: (runtimeResources?.meshCreateCount ?? 0) + (scene?.meshCreateCount ?? 0),
        meshDestroyCount: (runtimeResources?.meshDestroyCount ?? 0) + (scene?.meshDestroyCount ?? 0),
        sceneMeshCreateCount: scene?.meshCreateCount ?? 0,
        sceneMeshDestroyCount: scene?.meshDestroyCount ?? 0,
        sceneMaterialCreateCount: scene?.materialCreateCount ?? 0,
        sceneMaterialDestroyCount: scene?.materialDestroyCount ?? 0,
        sceneEntityCreateCount: scene?.entityCreateCount ?? 0,
        sceneEntityDestroyCount: scene?.entityDestroyCount ?? 0,
        sceneMeshUploadCount: scene?.sceneMeshUploadCount ?? 0,
        environmentTextureCreateCount: environment?.textureCreateCount ?? 0,
        environmentTextureDestroyCount: environment?.textureDestroyCount ?? 0,
        environmentTextures: environment?.textures ?? [],
        environmentMaterialCreateCount: environment?.materialCreateCount ?? 0,
        environmentMaterialDestroyCount: environment?.materialDestroyCount ?? 0,
        environmentGltfResourceCreateCount: environment?.gltfResourceCreateCount ?? 0,
        environmentGltfResourceDestroyCount: environment?.gltfResourceDestroyCount ?? 0,
        environmentMeshCreateCount: environment?.meshCreateCount ?? 0,
        environmentMeshDestroyCount: environment?.meshDestroyCount ?? 0,
        environmentTemplateEntityCreateCount: environment?.templateEntityCreateCount ?? 0,
        environmentTemplateEntityDestroyCount: environment?.templateEntityDestroyCount ?? 0,
        environmentActiveRockInstanceCount: environment?.activeRockInstanceCount ?? 0,
        environmentRockInstanceCreateCount: environment?.rockInstanceCreateCount ?? 0,
        environmentRockInstanceDestroyCount: environment?.rockInstanceDestroyCount ?? 0,
        renderTargetCount: exclusionResources.renderTargetCount,
        reflectionCameraCount: exclusionResources.auxiliaryCameraCount,
        cameraCount: exclusionResources.cameraComponentCount
      }),
      frame: Object.freeze({
        engineUpdateCount
      }),
      camera: Object.freeze({
        mode: cameraMode,
        freeControlActive: cameraController?.freeControlActive ?? false,
        movementSpeed: SHOWCASE_CAMERA_MOVEMENT_SPEED.grasslands,
        position: cameraPosition,
        forward: cameraForward
      }),
      scene: Object.freeze({
        ready: sceneReady,
        finite: scene?.finite ?? false,
        cameraMode,
        fixtureId: scene?.fixtureId ?? fixture.fixtureId,
        fixtureHash: scene?.fixtureHash ?? fixture.fixtureHash,
        bounds: sceneBounds,
        terrainEntityCount: scene?.terrainEntityCount ?? 0,
        anchorRockCount: scene?.anchorRockCount ?? 0,
        activeRockCount: scene?.activeRockCount ?? 0,
        scenicRockCount: scene?.scenicRockCount ?? 0,
        submergedScenicRockCount: scene?.submergedScenicRockCount ?? 0,
        shoreScenicRockCount: scene?.shoreScenicRockCount ?? 0,
        contactProbeCount: scene?.contactProbeCount ?? 0,
        terrainIndexCount: scene?.terrainIndexCount ?? 0,
        terrainMudStonesIndexCount: scene?.terrainMudStonesIndexCount ?? 0,
        terrainSandIndexCount: scene?.terrainSandIndexCount ?? 0,
        terrainGrassMudIndexCount: scene?.terrainGrassMudIndexCount ?? 0,
        terrainBedIndexCount: scene?.terrainBedIndexCount ?? 0,
        terrainBankIndexCount: scene?.terrainBankIndexCount ?? 0,
        terrainShorelineSampleCount: scene?.terrainShorelineSampleCount ?? 0,
        terrainDegenerateTriangleCount: scene?.terrainDegenerateTriangleCount ?? 0,
        terrainDirectMudGrassAdjacencyCount: scene?.terrainDirectMudGrassAdjacencyCount ?? 0,
        environmentReady: scene?.environmentReady ?? false,
        environmentAssetSetHash: scene?.environmentAssetSetHash ?? "",
        terrainMaterialRegionCount: scene?.terrainMaterialRegionCount ?? 0,
        terrainMaterialRegionIds: scene?.terrainMaterialRegionIds ?? Object.freeze([]),
        rockModelResourceCount: scene?.rockModelResourceCount ?? 0,
        largeRockVariantCount: scene?.largeRockVariantCount ?? 0,
        smallRockVariantCount: scene?.smallRockVariantCount ?? 0,
        sharedRockMeshCount: scene?.sharedRockMeshCount ?? 0,
        proxyRockMeshCount: scene?.proxyRockMeshCount ?? 0,
        sceneMeshUploadCount: scene?.sceneMeshUploadCount ?? 0,
        connectedWaterBodyCount: scene?.connectedWaterBodyCount ?? 0,
        landscapeRegionCount: scene?.landscapeRegionCount ?? 0,
        landscapeRegionIds: scene?.landscapeRegionIds ?? Object.freeze([]),
        landscapeExtentScaleXZ: scene?.landscapeExtentScaleXZ ?? Object.freeze([0, 0] as const),
        directLightCount: exclusionResources.directLightComponentCount,
        skyboxCount: exclusionResources.skyboxCount,
        auxiliaryCameraCount: exclusionResources.auxiliaryCameraCount,
        reflectionProbeCount: exclusionResources.reflectionProbeCount,
        renderTargetCount: exclusionResources.renderTargetCount,
        anchorRocks: scene?.anchorRocks ?? Object.freeze([])
      }),
      exclusionResources
    });
  };

  const requireRuntime = (): HeightfieldWaterRuntimeController => {
    const activeRuntime = synchronizePublishedRuntime();
    if (!activeRuntime || lifecycleDisposed) throw new Error("Grasslands runtime is unavailable.");
    return activeRuntime;
  };

  const requireScene = (): GrasslandsSceneController => {
    if (!sceneController || lifecycleDisposed) throw new Error("Grasslands scene is unavailable.");
    return sceneController;
  };

  const applyCameraPose = (state: GrasslandsCameraPose, restoreFreeControl: boolean): void => {
    const scene = requireScene();
    const activeCameraController = cameraController;
    activeCameraController?.setFreeControlActive(false);
    if (state === "top-down") {
      const { position, target, worldUp } = GRASSLANDS_TOP_DOWN_CAMERA_POSE;
      scene.setCameraPose(position, target, worldUp);
    } else {
      const pose = GRASSLANDS_SHARED_SHOWCASE_CAPTURE_POSES[state];
      scene.setCameraPose(pose.position, pose.target);
    }
    activeCameraController?.syncFromTransform();
    activeCameraController?.setFreeControlActive(restoreFreeControl && cameraMode === "free");
    currentCameraPose = state;
  };
  const resetHeroCamera = (): void => applyCameraPose("hero", true);

  const restoreAllContactProbes = (): void => {
    const scene = requireScene();
    for (const rock of fixture.anchorRocks) scene.restoreContactProbe(rock.id);
  };

  const applyOpticalPresentation = (
    controller: HeightfieldWaterRuntimeController,
    quality: WaterQualityTier = currentQuality
  ): void => {
    const opticalProfile: WaterOpticalProfile = Object.freeze({
      ...LAKE_SHOWCASE_OPTICAL_PROFILE,
      reflectionIntensity: reflectionEnabled ? LAKE_SHOWCASE_OPTICAL_PROFILE.reflectionIntensity : 0
    });
    controller.setOpticalProfile(opticalProfile);
    controller.setRefractionEnabled(refractionEnabled && quality !== WaterQualityTier.Low);
    if (reflectionScenario === "environment") {
      waterBodyHandle?.refreshReflectionBinding();
    } else if (reflectionScenario === "analytic-sky") {
      controller.setReflectionBinding(undefined);
    } else {
      // Explicit diagnostics boundary: isolate an unavailable legacy probe.
      controller.setReflectionBinding(
        Object.freeze({
          requestedSource: "probe",
          resolvedSource: "sky",
          fallbackReason: "environment-unavailable"
        })
      );
    }
  };

  const bridge = {
    readRuntime,
    readLighting: () => lightingController?.readback ?? GRASSLANDS_INITIAL_LIGHTING_READBACK,
    setSurfaceAppearanceFeatureFlags(flags: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags>): void {
      currentAppearanceFeatureFlags = flags;
      requireRuntime().setSurfaceAppearanceFeatureFlags(flags);
    },
    setAppearanceEnabled(enabled: boolean): void {
      appearanceEnabled = enabled;
      requireRuntime().setSurfaceAppearanceFeatureFlags(
        enabled
          ? currentAppearanceFeatureFlags
          : { externalNormal: false, depthTint: false, coastalAlpha: false, contactFoam: false, directSpecular: false }
      );
    },
    setRefractionEnabled(enabled: boolean): void {
      refractionEnabled = enabled;
      requireRuntime().setRefractionEnabled(enabled && currentQuality !== WaterQualityTier.Low);
    },
    setReflectionEnabled(enabled: boolean): void {
      reflectionEnabled = enabled;
      applyOpticalPresentation(requireRuntime());
    },
    setReflectionScenario(scenario: GrasslandsReflectionScenario): void {
      reflectionScenario = scenario;
      applyOpticalPresentation(requireRuntime());
    },
    setDebugMode(mode: HeightfieldWaterDebugMode): void {
      currentDebugMode = mode;
      requireRuntime().setDebugMode(mode);
    },
    setDirectLightState(state: GrasslandsDirectLightState): void {
      if (!lightingController) throw new Error("Grasslands Lighting Controller is unavailable.");
      lightingController.setDirectLightState(state);
    },
    setLightingPreset(preset: Parameters<GrasslandsLightingController["applyPreset"]>[0]): void {
      if (!lightingController) throw new Error("Grasslands Lighting Controller is unavailable.");
      lightingController.applyPreset(preset);
    },
    setQuality(quality: WaterQualityTier): Promise<void> {
      return compileAndActivateImpl(quality);
    },
    resetHeroCamera,
    raiseContactProbe(id: string): GrasslandsAnchorRockReadback {
      return requireScene().raiseContactProbe(id);
    },
    removeContactProbe(id: string): GrasslandsAnchorRockReadback {
      return requireScene().removeContactProbe(id);
    },
    restoreContactProbe(id: string): GrasslandsAnchorRockReadback {
      return requireScene().restoreContactProbe(id);
    },
    restoreAllContactProbes,
    async dispose(): Promise<GrasslandsShowcaseAcceptanceSnapshot> {
      cleanupImpl();
      await teardownBarrier.whenFinalized();
      return acceptanceApi.snapshot();
    }
  };

  const acceptanceApi = createGrasslandsShowcaseAcceptanceApi(fixture, bridge);
  const acceptanceGetter = (): Readonly<WaterShowcaseAcceptanceSnapshot> =>
    createGrasslandsSharedAcceptanceSnapshot(acceptanceApi.snapshot());
  const applySharedCaptureState = (state: GrasslandsSharedCaptureState): void => {
    acceptanceApi.setCaptureState("hero");
    applyCameraPose(state, false);
  };
  const resetSharedCaptureState = (): void => {
    acceptanceApi.setCaptureState("hero");
    applyCameraPose("hero", true);
  };
  const sharedShowcaseApi = createGrasslandsSharedShowcaseCaptureApi(applySharedCaptureState, resetSharedCaptureState);
  window.waterPcgGrasslands = acceptanceApi;
  window.waterPcgShowcase = sharedShowcaseApi;
  Object.defineProperty(window, "waterPcgAcceptance", {
    configurable: true,
    enumerable: true,
    get: acceptanceGetter
  });

  const removeAcceptanceProperties = (): void => {
    if (window.waterPcgGrasslands === acceptanceApi) delete window.waterPcgGrasslands;
    if (window.waterPcgShowcase === sharedShowcaseApi) delete window.waterPcgShowcase;
    const descriptor = Object.getOwnPropertyDescriptor(window, "waterPcgAcceptance");
    if (descriptor?.get === acceptanceGetter) delete window.waterPcgAcceptance;
  };

  const recordCleanupError = (stage: string, error: unknown): void => {
    const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
    runtimeError ??= `Grasslands cleanup ${stage} failed: ${details}`;
  };

  const writeLifecycleJournal = (stage: "interim" | "final"): GrasslandsShowcaseAcceptanceSnapshot => {
    let snapshot = acceptanceApi.snapshot();
    try {
      window.sessionStorage.setItem(
        GRASSLANDS_LIFECYCLE_JOURNAL_KEY,
        JSON.stringify({
          schemaVersion: 1,
          stage,
          mode: lifecycleDisposeMode,
          seed: snapshot.seed,
          fixtureHash: snapshot.fixtureHash,
          phase: snapshot.phase,
          disposed: snapshot.disposed,
          runtimeError: snapshot.runtimeError,
          engineDestroyed,
          pendingAsyncOperationCount: teardownBarrier.pendingCount,
          resources: snapshot.resources,
          runtimeSet: snapshot.runtimeSet,
          cameraFeatures: snapshot.cameraFeatures
        })
      );
    } catch (error) {
      recordCleanupError("lifecycle-journal", error);
      snapshot = acceptanceApi.snapshot();
    }
    return snapshot;
  };

  finalizeEngineTeardown = (): void => {
    if (assetLoader) {
      try {
        assetLoader.requestDisposeAfterRuntimeDetach();
      } catch (error) {
        recordCleanupError("asset-loader-dispose", error);
      }
    }
    if (cameraController && !cameraControllerDestroyed) {
      try {
        cameraController.destroy();
        cameraControllerDestroyed = true;
      } catch (error) {
        recordCleanupError("camera-controller-destroy", error);
      }
    }
    if (sceneController && !sceneControllerDestroyed) {
      try {
        lightingController = undefined;
        lakeShorelineMarkers?.destroy();
        lakeShorelineMarkers = undefined;
        sceneController.destroy();
        sceneControllerDestroyed = true;
      } catch (error) {
        recordCleanupError("scene-controller-destroy", error);
      }
    }
    if (environmentAssets && !environmentAssetsDestroyed) {
      try {
        environmentAssets.destroyAfterSceneDetach();
        environmentAssetsDestroyed = true;
      } catch (error) {
        recordCleanupError("environment-assets-destroy", error);
      }
    }
    if (root && !rootDestroyed) {
      try {
        root.destroy();
        rootDestroyed = true;
      } catch (error) {
        recordCleanupError("root-destroy", error);
      }
    }
    if (engine && !engineDestroyed) {
      try {
        engine.destroy();
        engineDestroyed = true;
      } catch (error) {
        recordCleanupError("engine-destroy", error);
      }
      delete document.documentElement.dataset.waterPcgAutomation;
    }
    writeLifecycleJournal("final");
  };

  const destroyWaterRuntimeOwned = async (): Promise<void> => {
    const run = async (stage: string, operation: () => void | Promise<void>): Promise<void> => {
      try {
        await operation();
      } catch (error) {
        recordCleanupError(stage, error);
      }
    };
    activeLoadAbort?.abort();
    activeLoadAbort = undefined;
    await run("lake-edit-session-dispose", async () => {
      await lakeEditSession?.dispose();
    });
    await run("water-body-loader-destroy", async () => {
      await waterBodyLoader?.destroy();
    });
    waterBodyHandle = undefined;
    runtimeControllerDestroyed = true;
    activeResource = undefined;
    await run("runtime-resource-registry-destroy", async () => {
      await runtimeResourceRegistry?.destroy();
    });
    appearanceBinding = undefined;
    await run("water-world-destroy", () => {
      waterWorld?.destroy();
    });
    await run("compile-worker-dispose", () => {
      if (compileWorker && !compileWorkerDisposed) {
        compileWorker.dispose();
        compileWorkerDisposed = true;
      }
    });
    await run("camera-feature-broker-destroy", () => {
      if (cameraFeatureBroker && !cameraFeatureBrokerDestroyed) {
        cameraFeatureBroker.destroy();
        cameraFeatureBrokerDestroyed = true;
      }
    });
    await run("reflection-pre-render-synchronizer-destroy", () => {
      if (reflectionSynchronizer) {
        reflectionSynchronizer.enabled = false;
        reflectionSynchronizer.clear();
        reflectionSynchronizer.destroy();
        reflectionSynchronizer = undefined;
      }
    });
    await run("environment-reflection-provider-destroy", () => {
      environmentReflectionProvider?.destroy();
      environmentReflectionProvider = undefined;
    });
    await run("environment-ibl-destroy", () => {
      environmentIBLBaker?.destroy();
      environmentIBLBaker = undefined;
    });
    await run("procedural-sky-destroy", () => {
      proceduralSky?.destroy();
      proceduralSky = undefined;
    });
    await run("reflection-service-release", () => {
      reflectionServiceLease?.release();
      reflectionServiceLease = undefined;
      reflectionService = undefined;
    });
  };

  cleanupImpl = (mode = "manual"): GrasslandsShowcaseAcceptanceSnapshot => {
    lifecycleDisposeMode = mode;
    const firstTeardownRequest = !lifecycleDisposed;
    if (firstTeardownRequest) {
      rebuildRevision++;
      lifecycleDisposed = true;
      runtimeOperationalReady = false;
      phase = mode === "failure" ? "error" : "disposed";
      window.removeEventListener("resize", resizeCanvas);
      if (beforeUnloadHandler) window.removeEventListener("beforeunload", beforeUnloadHandler);
      lakeEditSession?.cancel();
      delete (window as Window & { lakeDemo?: unknown }).lakeDemo;
      activeLoadAbort?.abort();
    } else if (mode === "failure") {
      phase = "error";
    } else if (mode === "manual") {
      phase = "disposed";
    }

    if (engine && !engineDestroyed) engine.pause();
    if (!waterTeardownStarted) {
      waterTeardownStarted = true;
      void teardownBarrier.track(destroyWaterRuntimeOwned());
    }
    teardownBarrier.requestFinalize();

    const snapshot = writeLifecycleJournal(teardownBarrier.finalized ? "final" : "interim");
    if (mode === "manual") removeAcceptanceProperties();
    return snapshot;
  };

  const resizeCanvas = (): void => {
    if (engine) resizeEngineCanvasByClientSize(engine);
    if (engine) cameraFeatureBroker?.setViewportSize(engine.canvas.width, engine.canvas.height);
  };

  beforeUnloadHandler = () => {
    cleanupImpl();
  };
  window.addEventListener("beforeunload", beforeUnloadHandler, { once: true });

  try {
    const routeIdentity = {
      caseId: document.documentElement.dataset.waterPcgCase,
      runtime: document.documentElement.dataset.waterPcgRuntime,
      preset: document.documentElement.dataset.waterPcgPreset
    };
    if (
      routeIdentity.caseId !== GRASSLANDS_PCG_PRESET.caseId ||
      routeIdentity.runtime !== GRASSLANDS_PCG_PRESET.runtime ||
      routeIdentity.preset !== GRASSLANDS_PCG_PRESET.preset
    ) {
      throw new Error("Grasslands route identity mismatch.");
    }

    const search = bootstrapSearch;
    const resolvedCameraMode = resolveShowcaseCameraMode(search, false);
    cameraMode = resolvedCameraMode === "free" ? "free" : "fixed";
    automation = cameraMode === "fixed";
    document.documentElement.dataset.waterPcgAutomation = String(automation);
    normalSource = search.get("normalSource") === "local" ? "local-override" : "tracked";

    const engineConfiguration = {
      canvas: "canvas",
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: {
        webGLMode: WebGLMode.WebGL2
      }
    } as unknown as Parameters<typeof WebGLEngine.create>[0];
    const createdEngine = await teardownBarrier.track(
      WebGLEngine.create(engineConfiguration).then((createdEngine) => {
        engine = createdEngine;
        return createdEngine;
      })
    );
    engine = createdEngine;
    if (lifecycleDisposed) {
      cleanupImpl();
      return;
    }
    resizeEngineCanvasByClientSize(engine);
    window.addEventListener("resize", resizeCanvas);

    const scene = engine.sceneManager.activeScene!;
    scene.shaderData.setVector4(SCENE_WEATHER_STATE, weatherState);
    scene.shaderData.setFloat(SCENE_WEATHER_TIME, weatherTime);
    scene.background.solidColor = new Color(0.055, 0.11, 0.105, 1);
    root = scene.createRootEntity("grasslands-water-showcase");
    assetLoader = new LakeNormalAssetLoader(engine, {
      strict: true,
      source: normalSource,
      sourceUrl:
        normalSource === "local-override"
          ? new URL("../../../../../packages/water/src/water/resources/lake/assets/grasslands-water-normal-1024.png", import.meta.url).href
          : undefined,
      enableDevelopmentLocalOverride:
        normalSource === "local-override" && search.get("developmentLocalOverride") === "1"
    });
    const loadedEnvironmentAssets = await teardownBarrier.track(
      WaterLandscapeAssets.load(engine).then((loaded) => {
        environmentAssets = loaded;
        return loaded;
      })
    );
    if (lifecycleDisposed) {
      cleanupImpl();
      return;
    }
    sceneController = new GrasslandsSceneController(engine, root, loadedEnvironmentAssets, {
      ...fixture,
      descriptor: currentLakeDescriptor,
      terrain: { ...fixture.terrain, heightfield: initialLakeRevision.terrain }
    });
    lakeShorelineMarkers = new GrasslandsLakeShorelineMarkers(root, {
      ...fixture.terrain,
      heightfield: initialLakeRevision.terrain
    });
    scene.sun = sceneController.directLight;
    scene.shadowDistance = 90;
    scene.shadowCascades = ShadowCascadesMode.TwoCascades;
    proceduralSky = new DayNightProceduralSky(
      scene,
      new DayNightSolarPosition(PROCEDURAL_SKY_SOLAR_POSITION),
      "GrasslandsProceduralSky"
    );
    environmentIBLBaker = new RealtimeIBLBaker(scene, PROCEDURAL_SKY_REALTIME_IBL_OPTIONS);
    lightingController = new GrasslandsLightingController(scene.ambientLight, sceneController, "runtime-sky", () => {
      environmentIBLBaker?.requestBake();
    });
    // The accepted source scene renders this material into HDR before ACES. Keep
    // that scene-owned color pipeline outside the Water asset/closure.
    sceneController.camera.enableHDR = true;
    sceneController.camera.enablePostProcess = true;
    const postProcess = root.createChild("grasslands-visual-parity-post-process").addComponent(PostProcess);
    const tonemapping = postProcess.addEffect(TonemappingEffect)!;
    tonemapping.mode.value = TonemappingMode.ACES;
    const colorAdjustments = postProcess.addEffect(ColorAdjustmentsEffect)!;
    colorAdjustments.postExposure.value = 1;
    colorAdjustments.temperature.value = 10;
    const bloom = postProcess.addEffect(BloomEffect)!;
    bloom.threshold.value = 0.5;
    bloom.intensity.value = 0.35;
    bloom.scatter.value = 0.6;
    cameraController = createShowcaseCameraController(sceneController.cameraEntity, {
      mode: cameraMode,
      movementSpeed: SHOWCASE_CAMERA_MOVEMENT_SPEED.grasslands
    });

    cameraFeatureBroker = new CameraWaterFeatureBroker(sceneController.camera);
    cameraFeatureBroker.setViewportSize(engine.canvas.width, engine.canvas.height);
    reflectionServiceLease = WaterReflectionService.acquire(engine, root, sceneController.camera);
    reflectionService = reflectionServiceLease.service;
    environmentReflectionProvider = new WaterEnvironmentReflectionProvider({
      service: reflectionService,
      id: "water-pcg-grasslands-scene-environment",
      source: {
        ambientLight: scene.ambientLight,
        rotationDegrees: GRASSLANDS_ENVIRONMENT_REFLECTION_ROTATION_DEGREES,
        exposure: GRASSLANDS_ENVIRONMENT_REFLECTION_EXPOSURE,
        hdr: GRASSLANDS_ENVIRONMENT_REFLECTION_HDR
      }
    });

    const runtimeRoot = root.createChild("grasslands-heightfield-runtime-root");
    runtimeRoot.layer = Layer.Layer30;
    compileWorker = new HeightfieldWaterCompileWorkerClient();
    waterBackend = new HeightfieldWaterBackend({
      compile: (descriptor, context) => {
        if (!compileWorker) {
          throw new Error("Grasslands Heightfield worker is unavailable.");
        }
        return compileWorker.compile(
          descriptor,
          context.signal,
          context.resolvedInstance?.qualityPlan.query ?? "dense"
        );
      }
    });
    const backendRegistry = new WaterBackendRegistry();
    backendRegistry.register(waterBackend);
    const assetRegistry = new WaterBodyAssetRegistry();
    const authoring = registerGrasslandsStylizedWaterBodyAuthoring(assetRegistry, currentLakeDescriptor);
    waterWorld = new WaterWorld();
    runtimeResourceRegistry = new WaterRuntimeResourceRegistry();
    runtimeResourceRegistry.register({
      descriptor: LAKE_NORMAL_RESOURCE,
      async load() {
        if (!assetLoader) {
          throw new Error("Grasslands normal Loader is unavailable.");
        }
        const normalResource = await assetLoader.load();
        if (!normalResource) {
          throw new Error("Grasslands strict normal asset did not produce a texture.");
        }
        const releaseBorrow = assetLoader.acquireRuntimeBorrow();
        return Object.freeze({
          texture: normalResource.texture,
          releaseBorrow
        });
      },
      destroy(resource: unknown): void {
        const normal = resource as {
          releaseBorrow(): void;
        };
        normal.releaseBorrow();
        assetLoader?.disposeAfterRuntimeDetach();
      }
    });
    const activeReflectionService = reflectionService;
    waterBodyLoader = new WaterBodyLoader({
      registry: backendRegistry,
      world: waterWorld,
      cameraFeatures: cameraFeatureBroker,
      assets: assetRegistry,
      resources: runtimeResourceRegistry,
      reflection: {
        service: activeReflectionService,
        cullingMask: Layer.Everything,
        waterLayerMask: Layer.Layer30
      }
    });
    lakeEditSession = new LakeEditSession(initialLakeRevision, async (next: LakeEditRevision, signal) => {
      const handle = waterBodyHandle;
      if (!handle?.prepareInstanceReplacement || !sceneController || !root)
        throw new Error("Lake is not ready for editing.");
      const previousAsset = assetRegistry.getAsset(authoring.instance.assetId)!;
      const previousDescriptor = currentLakeDescriptor;
      const previousMarkers = lakeShorelineMarkers!;
      const source = { ...authoring.source, descriptor: createHeightfieldWaterBodySourceDescriptorV1(next.descriptor) };
      const representationData = createHeightfieldWaterRepresentationDataV1(next.descriptor);
      const validation = validateHeightfieldWaterDescriptor(next.descriptor);
      if (!validation.valid) throw new Error(validation.diagnostics.map((d) => d.message).join("; "));
      const ground = sceneController.prepareLakeTerrain(
        next.terrain,
        next.document.boundary.waterLevel,
        next.document.basin.profile === "calibration"
      );
      let markers: GrasslandsLakeShorelineMarkers | undefined;
      let water: Awaited<ReturnType<NonNullable<typeof handle.prepareInstanceReplacement>>> | undefined;
      let published = false;
      try {
        markers = new GrasslandsLakeShorelineMarkers(root, { ...fixture.terrain, heightfield: next.terrain });
        markers.setVisible(false);
        markers.update(sampleLakeBoundary(next.descriptor.lakeBoundary!));
        assetRegistry.replaceAsset({
          ...previousAsset,
          source,
          sourceHash: hashStableValue(source),
          representationData,
          representationDataHash: hashStableValue(representationData)
        });
        water = await handle.prepareInstanceReplacement(handle.instance, { signal });
      } catch (error) {
        try {
          await water?.rollback();
        } finally {
          ground.rollback();
          markers?.destroy();
          assetRegistry.replaceAsset(previousAsset);
        }
        throw error;
      }
      const preparedWater = water,
        preparedMarkers = markers;
      return {
        commit: () => {
          published = true;
          preparedWater.commit();
          ground.commit();
          previousMarkers.setVisible(false);
          preparedMarkers.setVisible(true);
          lakeShorelineMarkers = preparedMarkers;
          currentLakeDescriptor = next.descriptor;
          synchronizePublishedRuntime();
        },
        finalize: async () => {
          try {
            await preparedWater.finalize();
          } finally {
            ground.finalize();
            previousMarkers.destroy();
          }
        },
        rollback: async () => {
          try {
            if (published) await preparedWater.revert();
            else await preparedWater.rollback();
          } finally {
            ground.rollback();
            preparedMarkers.destroy();
            previousMarkers.setVisible(true);
            lakeShorelineMarkers = previousMarkers;
            currentLakeDescriptor = previousDescriptor;
            assetRegistry.replaceAsset(previousAsset);
            synchronizePublishedRuntime();
          }
        }
      };
    });
    const editor = lakeEditSession;
    const canEditLakeTerrain = () => editor.current.document.terrainPreset !== "existing-basin";
    let landscapeSeed = fixture.seed;
    let landscapeRequest = 0;
    let landscapePending = false;
    let landscapeError: string | null = null;
    const cancelLandscape = () => {
      landscapeRequest++;
      landscapePending = false;
    };
    const landscapeStatus = () => {
      const landscape = sceneController?.landscapeSnapshot;
      return {
        seed: landscapeSeed,
        pending: landscapePending,
        error: landscapeError,
        stale:
          landscape?.terrainHash !== editor.current.terrain.hash ||
          landscape?.waterLevel !== editor.current.document.boundary.waterLevel ||
          landscape?.seed !== landscapeSeed,
        generatedSeed: landscape?.seed,
        sourceHash: landscape?.sourceHash,
        hash: landscape?.hash,
        count: landscape?.placements?.length ?? 0
      };
    };
    const regenerateLandscape = async () => {
      if (editor.status.pending) throw new Error("Wait for the Lake edit to finish before generating scenery.");
      const request = ++landscapeRequest;
      const revision = editor.current;
      const seed = landscapeSeed;
      landscapePending = true;
      landscapeError = null;
      try {
        // Allow cancellation and the pending indicator a frame before bounded CPU generation.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (request !== landscapeRequest || lifecycleDisposed) return;
        if (editor.status.pending || revision !== editor.current)
          throw new Error("Lake changed; generate scenery again.");
        sceneController!.regenerateLandscape(revision.descriptor.lakeBoundary!, seed);
      } catch (error) {
        if (request === landscapeRequest) landscapeError = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        if (request === landscapeRequest) landscapePending = false;
      }
    };
    const lakeDemoApi = {
      snapshot: () => ({
        ...editor.status,
        document: structuredClone(editor.current.document),
        waterLevel: editor.current.document.boundary.waterLevel,
        shoreline: editor.current.descriptor.lakeBoundary,
        landscape: landscapeStatus(),
        meshUploadCount: sceneController?.metrics.sceneMeshUploadCount
      }),
      landscape: () => structuredClone(sceneController?.landscapeSnapshot),
      regenerateLandscape,
      cancelLandscape,
      setLandscapeSeed: (seed: number) => {
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
          throw new RangeError("Landscape seed must be uint32.");
        cancelLandscape();
        landscapeSeed = seed;
      },
      setBoundary: (boundary: LakeBoundaryV1) => editor.update({ ...editor.draft, boundary }),
      setTerrainPreset: (terrainPreset: LakeTerrainPreset) =>
        editor.update({ ...editor.draft, terrainPreset, basin: { ...editor.draft.basin, profile: "natural" } }),
      setWaterLevel: (waterLevel: number) =>
        editor.update({ ...editor.draft, boundary: { ...editor.draft.boundary, waterLevel } }),
      setBasin: (depth: number, shoreWidth: number) =>
        editor.update({ ...editor.draft, basin: { ...editor.draft.basin, depth, shoreWidth } }),
      setFalloffWidth: (falloffWidth: number) =>
        editor.update({ ...editor.draft, basin: { ...editor.draft.basin, falloffWidth } }),
      setCalibration: (enabled: boolean) =>
        editor.update({
          ...editor.draft,
          basin: { ...editor.draft.basin, profile: enabled ? "calibration" : "natural" }
        }),
      undo: () => editor.undo(),
      cancel: () => editor.cancel(),
      reset: () => editor.update(initialLakeRevision.document),
      probe: (x: number, z: number) => {
        if (!activeResource) throw new Error("Lake query is not ready.");
        const water = new HeightfieldWaterBaseQueryService(activeResource.data).sampleBaseSurface(
          x,
          z,
          createHeightfieldWaterBaseQueryResult()
        );
        const bedHeight = sampleLakeTerrainHeight(editor.current.terrain, x, z);
        const base = editor.current.baseTerrain;
        const baseHeight = sampleWaterTerrainHeight(base, x, z);
        return {
          ...water,
          bedHeight,
          baseHeight,
          terrainHash: editor.current.terrain.hash,
          revision: editor.current.revision
        };
      }
    };
    Object.defineProperty(window, "lakeDemo", { configurable: true, value: lakeDemoApi });
    if (import.meta.env.DEV) {
      const { mountWaterDevTools } = await import("@galacean/engine-water/water/devtools/index");
      const { createGrasslandsLightingSceneControls } = await import("./GrasslandsLightingDevTools.ts");
      mountWaterDevTools({
        loader: waterBodyLoader,
        sceneActions: [
          { group: "Lake", label: "Undo lake edit", run: lakeDemoApi.undo },
          { group: "Lake", label: "Cancel lake edit", run: lakeDemoApi.cancel },
          { group: "Lake", label: "Reset lake", run: lakeDemoApi.reset },
          { group: "Lake", label: "Regenerate landscape / 重新生成景观", run: regenerateLandscape },
          { group: "Lake", label: "Cancel generation / 取消生成", run: cancelLandscape }
        ],
        sceneControls: [
          ...createGrasslandsLightingSceneControls(lightingController),
          {
            kind: "enum",
            id: "scene.lake.terrainPreset",
            label: "Terrain input / 地形输入",
            group: "Lake",
            owner: "scene",
            effect: "authoring",
            updateMode: "commit",
            sessionScope: "transient",
            options: {
              "丘陵地形 · 雕刻湖盆": "hills",
              "平坦地形 · 雕刻湖盆": "flat",
              "现有湖盆 · 只读地面": "existing-basin"
            },
            read: () => editor.current.document.terrainPreset ?? "hills",
            write: (value) => lakeDemoApi.setTerrainPreset(value as LakeTerrainPreset)
          },
          {
            kind: "readonly",
            id: "scene.lake.terrainSource",
            label: "Terrain source / 地形来源",
            group: "Lake",
            updateMode: "readonly",
            sessionScope: "transient",
            read: () => `${editor.current.baseTerrain.id} · v${editor.current.baseTerrain.revision}`
          },
          {
            kind: "number",
            id: "scene.lake.landscapeSeed",
            label: "Landscape seed",
            group: "Lake",
            owner: "scene",
            effect: "authoring",
            updateMode: "commit",
            sessionScope: "transient",
            minimum: 0,
            maximum: 0xffffffff,
            step: 1,
            read: () => landscapeSeed,
            write: lakeDemoApi.setLandscapeSeed
          },
          {
            kind: "readonly",
            id: "scene.lake.landscapeStatus",
            label: "Landscape / 景观状态",
            group: "Lake",
            updateMode: "readonly",
            sessionScope: "transient",
            read: () => {
              const status = landscapeStatus();
              return status.pending
                ? "Generating…"
                : (status.error ?? (status.stale ? "待更新 / Regenerate" : `Ready · ${status.count} objects`));
            }
          },
          withLakeTerrainEditAvailability(
            {
              kind: "boolean",
              id: "scene.lake.calibration",
              label: "Optics calibration (0.25 / 1 / 2 m)",
              group: "Lake",
              owner: "scene",
              effect: "authoring",
              updateMode: "commit",
              sessionScope: "transient",
              read: () => editor.current.document.basin.profile === "calibration",
              write: lakeDemoApi.setCalibration
            },
            canEditLakeTerrain
          ),
          ...createGrasslandsLakeAuthoringControls(
            () => ({ ...currentLakeDescriptor, lakeBoundary: editor.draft.boundary }),
            lakeDemoApi.setBoundary,
            canEditLakeTerrain
          ),
          withLakeTerrainEditAvailability(
            {
              kind: "number",
              id: "scene.lake.basinDepth",
              label: "Basin depth (m)",
              group: "Lake",
              owner: "authoring",
              effect: "authoring",
              updateMode: "commit",
              sessionScope: "transient",
              minimum: 0.5,
              maximum: GRASSLANDS_LAKE_MAX_BASIN_DEPTH,
              step: 0.1,
              read: () => editor.current.document.basin.depth,
              write: (depth) => lakeDemoApi.setBasin(depth, editor.draft.basin.shoreWidth)
            },
            canEditLakeTerrain
          ),
          withLakeTerrainEditAvailability(
            {
              kind: "number",
              id: "scene.lake.shoreWidth",
              label: "Shore slope width (m)",
              group: "Lake",
              owner: "authoring",
              effect: "authoring",
              updateMode: "commit",
              sessionScope: "transient",
              minimum: 2,
              maximum: 16,
              step: 0.1,
              read: () => editor.current.document.basin.shoreWidth,
              write: (width) => lakeDemoApi.setBasin(editor.draft.basin.depth, width)
            },
            canEditLakeTerrain
          ),
          withLakeTerrainEditAvailability(
            {
              kind: "number",
              id: "scene.lake.falloff",
              label: "Terrain falloff (m)",
              group: "Lake",
              owner: "authoring",
              effect: "authoring",
              updateMode: "commit",
              sessionScope: "transient",
              minimum: 0.5,
              maximum: 8,
              step: 0.5,
              read: () => editor.current.document.basin.falloffWidth ?? 4,
              write: lakeDemoApi.setFalloffWidth
            },
            canEditLakeTerrain
          ),
          {
            kind: "readonly",
            id: "scene.lake.editStatus",
            label: "Lake edit",
            group: "Lake",
            updateMode: "readonly",
            sessionScope: "transient",
            read: () => (editor.status.pending ? "Applying…" : (editor.status.error ?? "Ready"))
          }
        ],
        camera: {
          poses: GRASSLANDS_DEVTOOLS_CAMERA_POSES,
          readPose: () => currentCameraPose,
          setPose: (pose) => {
            if (!isGrasslandsCameraPose(pose)) {
              throw new RangeError(`Unknown Grasslands camera pose "${pose}".`);
            }
            applyCameraPose(pose, true);
          }
        }
      });
    }
    const surfaceTimeOverride = resolveGrasslandsSurfaceTimeOverride(search);
    const createRuntimeContext = (): HeightfieldWaterBackendRuntimeContext => ({
      engine: createdEngine,
      root: runtimeRoot,
      submission: {
        frameBudgetMs: 4
      },
      debugMode: currentDebugMode,
      surfaceTimeOverride
    });

    compileAndActivateImpl = (quality: WaterQualityTier): Promise<void> => {
      if (lifecycleDisposed) throw new Error("Grasslands runtime is disposed.");
      if (
        quality !== WaterQualityTier.Low &&
        quality !== WaterQualityTier.Medium &&
        quality !== WaterQualityTier.High
      ) {
        throw new RangeError(`Unknown Grasslands quality tier "${String(quality)}".`);
      }
      activeLoadAbort?.abort();
      const loadAbort = new AbortController();
      activeLoadAbort = loadAbort;
      const revision = ++rebuildRevision;
      currentQuality = quality;
      runtimeOperationalReady = false;
      runtimeError = null;
      phase = "initializing";
      const operation = rebuildQueue
        .catch(() => {})
        .then(async () => {
          if (revision !== rebuildRevision || lifecycleDisposed || loadAbort.signal.aborted) {
            return;
          }
          try {
            const loader = waterBodyLoader;
            const backend = waterBackend;
            if (!loader || !backend) {
              throw new Error("Grasslands WaterBody product path is unavailable.");
            }
            let handle = waterBodyHandle;
            if (handle) {
              await handle.update(
                {
                  lookPresetId: lakeLookPresetIdForQuality(quality),
                  qualityPlanId: grasslandsQualityPresetIdForQuality(quality)
                },
                {
                  signal: loadAbort.signal,
                  runtimeContext: createRuntimeContext()
                }
              );
            } else {
              handle = await loader.loadInstance(authoring.instance, {
                signal: loadAbort.signal,
                runtimeContext: createRuntimeContext()
              });
              waterBodyHandle = handle;
            }
            if (revision !== rebuildRevision || lifecycleDisposed || loadAbort.signal.aborted) {
              return;
            }
            const runtime = backend.getRuntimeDiagnostics(GRASSLANDS_STYLIZED_WATER_INSTANCE_ID);
            const resource = handle.resource as WaterCompiledResourceReadPort<HeightfieldWaterCompiledData> | undefined;
            if (!runtime || !resource || runtime.activation.submittedChunkCount !== resource.data.chunks.length) {
              throw new Error("Grasslands Heightfield Loader activation did not publish a complete runtime.");
            }
            runtimeController = runtime.controller;
            appearanceBinding = runtimeController.surfaceAppearanceBinding;
            if (!appearanceBinding) {
              throw new Error("Grasslands appearance binding is unavailable after activation.");
            }
            publishWaterResource(resource);
            runtimeController.flushDeferredResources();
            lastStableMeshUploadCount = runtimeController.meshUploadCount;
            runtimeOperationalReady = true;
            phase = "ready";
          } catch (error) {
            if (revision !== rebuildRevision || lifecycleDisposed || loadAbort.signal.aborted) {
              return;
            }
            runtimeError = readErrorMessage(error);
            phase = "error";
            runtimeOperationalReady = false;
            throw error;
          } finally {
            if (activeLoadAbort === loadAbort) {
              activeLoadAbort = undefined;
            }
          }
        });
      rebuildQueue = operation;
      return teardownBarrier.track(operation);
    };

    await compileAndActivateImpl(WaterQualityTier.High);
    if (lifecycleDisposed) {
      cleanupImpl();
      return;
    }

    const activeSceneController = sceneController;
    if (!activeSceneController || !reflectionService) {
      throw new Error("Grasslands reflection pre-render synchronization dependencies are unavailable.");
    }
    reflectionSynchronizer = activeSceneController.cameraEntity.addComponent(WaterReflectionPreRenderSynchronizer);
    reflectionSynchronizer.configure({
      sourceCamera: activeSceneController.camera,
      service: reflectionService,
      beforeUpdate: () => environmentReflectionProvider?.refresh(),
      afterUpdate: () => {
        if (reflectionScenario === "environment") {
          waterBodyHandle?.refreshReflectionBinding();
        }
      },
      onError: (error: unknown) => {
        runtimeError = readErrorMessage(error);
        runtimeOperationalReady = false;
        phase = "error";
      }
    });

    class GrasslandsShowcaseUpdateScript extends Script {
      onUpdate(deltaTime: number): void {
        try {
          environmentIBLBaker?.update();
          weatherTime += deltaTime;
          scene.shaderData.setFloat(SCENE_WEATHER_TIME, weatherTime);
          engineUpdateCount++;
          const meshUploadCount = synchronizePublishedRuntime()?.meshUploadCount ?? 0;
          if (runtimeOperationalReady && meshUploadCount !== lastStableMeshUploadCount) {
            perFrameMeshUploadDetected = true;
          }
          lastStableMeshUploadCount = meshUploadCount;
        } catch (error) {
          runtimeError = readErrorMessage(error);
          runtimeOperationalReady = false;
          phase = "error";
        }
      }
    }
    root.addComponent(GrasslandsShowcaseUpdateScript);
    engine.run();
  } catch (error) {
    runtimeError = readErrorMessage(error);
    phase = "error";
    runtimeOperationalReady = false;
    cleanupImpl("failure");
    throw error;
  }
}

void bootstrapGrasslandsShowcase().catch((error: unknown) => {
  console.error(error instanceof Error ? error : new Error("Grasslands Showcase bootstrap failed closed."));
});
