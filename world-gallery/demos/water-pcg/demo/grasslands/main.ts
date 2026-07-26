import { Color, Downsampling, Script, WebGLEngine, WebGLMode, type Entity } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import { HeightfieldWaterCompileWorkerClient } from "../../runtime/heightfield/HeightfieldWaterCompileWorkerClient";
import type { HeightfieldWaterResource } from "../../runtime/heightfield/HeightfieldWaterResource";
import { HeightfieldWaterRuntimeController } from "../../runtime/heightfield/HeightfieldWaterRuntimeController";
import {
  HeightfieldWaterCompositionMode,
  HeightfieldWaterDebugMode
} from "../../runtime/heightfield/HeightfieldWaterRuntimeEnums";
import type { HeightfieldWaterSurfaceAppearanceFeatureFlags } from "../../runtime/heightfield/types";
import { CameraWaterFeatureBroker } from "../../runtime/optics/CameraWaterFeatureBroker";
import type { WaterOpticalProfile } from "../../runtime/optics/WaterOpticalProfile";
import type { WaterSurfaceAppearanceBinding } from "../../runtime/surface/WaterSurfaceAppearanceRuntimeTypes";
import { createShowcaseCameraController, type ShowcaseCameraController } from "../showcase/ShowcaseCameraControl";
import { resolveShowcaseCameraMode, SHOWCASE_CAMERA_MOVEMENT_SPEED } from "../showcase/ShowcaseCameraPolicy";
import { WaterShowcaseFrameSampler } from "../showcase/WaterShowcaseAcceptance";
import {
  GrasslandsAssetLoader,
  GRASSLANDS_NORMAL_ASSET_ID,
  GRASSLANDS_NORMAL_CONTENT_HASH,
  type GrasslandsNormalAssetSource
} from "./GrasslandsAssetLoader";
import { GrasslandsAsyncTeardownBarrier } from "./GrasslandsAsyncTeardownBarrier";
import { GrasslandsControlledCalibration } from "./GrasslandsControlledCalibration";
import { GrasslandsEnvironmentAssets, GRASSLANDS_ENVIRONMENT_ASSET_SET_HASH } from "./GrasslandsEnvironmentAssets";
import { createGrasslandsPcgFixture } from "./GrasslandsPcgFixture";
import {
  GRASSLANDS_COMPILED_SURFACE_APPEARANCE,
  GRASSLANDS_NORMAL_FLIP_GREEN,
  GRASSLANDS_PCG_PRESET,
  GRASSLANDS_WATER_OPTICAL_PROFILE
} from "./GrasslandsPcgPreset";
import {
  GrasslandsSceneController,
  type GrasslandsAnchorRockReadback,
  type GrasslandsDirectLightState
} from "./GrasslandsSceneController";
import {
  createGrasslandsShowcaseAcceptanceApi,
  type GrasslandsAcceptanceRuntimeReadback,
  type GrasslandsCaptureState,
  type GrasslandsCausalFeature,
  type GrasslandsReflectionScenario,
  type GrasslandsShowcaseAcceptanceApi,
  type GrasslandsShowcaseAcceptanceSnapshot
} from "./GrasslandsShowcaseAcceptance";
import {
  GRASSLANDS_FIXED_SURFACE_TIME,
  resolveGrasslandsSurfaceTimeOverride,
  resolveGrasslandsSurfaceTimeReadback
} from "./GrasslandsSurfaceTimePolicy";
import type { GrasslandsVector3 } from "./GrasslandsPcgTypes";
import { isGrasslandsExclusionClean, observeGrasslandsExcludedResources } from "./GrasslandsRuntimeObservation";

const GRASSLANDS_RUNTIME_SET_ID = "grasslands-heightfield-water";
const GRASSLANDS_LIFECYCLE_JOURNAL_KEY = "water-pcg-grasslands-last-dispose";
const DEFAULT_APPEARANCE_FEATURE_FLAGS: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags> = Object.freeze({
  externalNormal: true,
  depthTint: true,
  coastalAlpha: true,
  contactFoam: true,
  directSpecular: true
});

type GrasslandsHudState = "loading" | "ready" | "fallback" | "error" | "disposed";

function freezeVector3(x: number, y: number, z: number): GrasslandsVector3 {
  return Object.freeze([x, y, z] as const);
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

function createQualityDescriptor(
  descriptor: HeightfieldWaterDescriptorV1,
  quality: WaterQualityTier
): HeightfieldWaterDescriptorV1 {
  if (quality === descriptor.quality) return descriptor;
  return {
    ...descriptor,
    id: `${descriptor.id}-${quality}`,
    quality
  };
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function bootstrapGrasslandsShowcase(): Promise<void> {
  const bootstrapSearch = new URLSearchParams(window.location.search);
  const requestedSeed = bootstrapSearch.has("seed") ? Number(bootstrapSearch.get("seed")) : GRASSLANDS_PCG_PRESET.seed;
  const fixture = createGrasslandsPcgFixture(requestedSeed);
  const frameSampler = new WaterShowcaseFrameSampler();
  const uiCleanupCallbacks: Array<() => void> = [];
  let engine: WebGLEngine | undefined;
  let root: Entity | undefined;
  let runtimeController: HeightfieldWaterRuntimeController | undefined;
  let cameraFeatureBroker: CameraWaterFeatureBroker | undefined;
  let sceneController: GrasslandsSceneController | undefined;
  let environmentAssets: GrasslandsEnvironmentAssets | undefined;
  let cameraController: ShowcaseCameraController | undefined;
  let assetLoader: GrasslandsAssetLoader | undefined;
  let compileWorker: HeightfieldWaterCompileWorkerClient | undefined;
  let controlledCalibration: GrasslandsControlledCalibration | undefined;
  let activeResource: HeightfieldWaterResource | undefined;
  let appearanceBinding: Readonly<WaterSurfaceAppearanceBinding> | undefined;
  let releaseRuntimeBorrow: (() => void) | undefined;
  let statusElement: HTMLSpanElement | undefined;
  let metricsElement: HTMLDListElement | undefined;
  let currentQuality = WaterQualityTier.High;
  let currentDebugMode = HeightfieldWaterDebugMode.Final;
  let appearanceEnabled = true;
  let reflectionEnabled = true;
  let runtimeOperationalReady = false;
  let runtimeError: string | null = null;
  let phase: GrasslandsAcceptanceRuntimeReadback["phase"] = "initializing";
  let cameraMode: "free" | "fixed" = "fixed";
  let automation = false;
  let normalSource: GrasslandsNormalAssetSource = "tracked";
  let rebuildRevision = 0;
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
  let lifecycleDisposeMode: "manual" | "failure" = "manual";
  let beforeUnloadHandler: (() => void) | undefined;
  let compileAndActivateImpl: (quality: WaterQualityTier) => Promise<void> = async () => {
    throw new Error("Grasslands runtime is not initialized.");
  };
  let cleanupImpl: (mode?: "manual" | "failure") => GrasslandsShowcaseAcceptanceSnapshot;
  let finalizeEngineTeardown: (() => void) | undefined;
  const teardownBarrier = new GrasslandsAsyncTeardownBarrier(() => finalizeEngineTeardown?.());

  const readRuntime = (): GrasslandsAcceptanceRuntimeReadback => {
    const appearance = runtimeController?.activeSurfaceAppearanceReadback;
    const optics = runtimeController?.activeSurfaceOpticsReadback;
    const runtimeResources = runtimeController?.resourceMetrics;
    const appearanceFlags = runtimeController?.surfaceAppearanceFeatureFlags;
    const broker = cameraFeatureBroker?.metrics;
    const scene = sceneController?.metrics;
    const loader = assetLoader?.readback;
    const environment = environmentAssets?.metrics;
    const activeScene = engine && !engineDestroyed ? engine.sceneManager.activeScene : undefined;
    const exclusionResources = observeGrasslandsExcludedResources(activeScene, sceneController?.camera, optics);
    const activeSetCount = runtimeResources?.activeRuntimeSetCount ?? 0;
    const screenTexturesRequested = !lifecycleDisposed && currentQuality !== WaterQualityTier.Low;
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
    const frame = frameSampler.metrics;
    const fallbackReason =
      currentQuality === WaterQualityTier.Low
        ? "surface-appearance-quality-unsupported"
        : (appearance?.fallbackReason ?? loader?.fallbackReason ?? null);
    const materialActive =
      appearance?.active === true &&
      appearance.appearanceHash === fixture.appearanceHash &&
      appearance.normalContentHash === fixture.externalAssetHash;
    const allAppearanceFeaturesEnabled =
      appearanceFlags?.externalNormal === true &&
      appearanceFlags.depthTint === true &&
      appearanceFlags.coastalAlpha === true &&
      appearanceFlags.contactFoam === true &&
      appearanceFlags.directSpecular === true;
    const strictAppearanceParameters =
      appearance?.normalTextureWidth === 1024 &&
      appearance.normalTextureHeight === 1024 &&
      appearance.normalLayerCount === 2 &&
      appearance.normalTiling === 0.05 &&
      appearance.normalScrollUvPerSecond === 0.02 &&
      appearance.normalStrength === 0.2 &&
      appearance.flipGreen === GRASSLANDS_NORMAL_FLIP_GREEN &&
      appearance.depthTintModel === "scene-depth-power" &&
      appearance.depthTintEnabled === true &&
      appearance.depthTintDistance === 10 &&
      appearance.depthTintExponent === 0.5 &&
      appearance.coastalAlphaModel === "scene-depth" &&
      appearance.coastalAlphaEnabled === true &&
      appearance.coastalAlphaDistance === 0.5 &&
      appearance.contactFoamModel === "scene-depth-voronoi" &&
      appearance.contactFoamEnabled === true &&
      appearance.contactFoamWorldScale === 2.5 &&
      appearance.contactFoamTimeRate === 1 &&
      appearance.contactFoamOpacity === 0.453 &&
      appearance.contactFoamContactDistance === 0.1791 &&
      appearance.contactFoamOctaveCount === 3 &&
      appearance.contactFoamWeights.length === 3 &&
      appearance.contactFoamWeights[0] === 0.5 &&
      appearance.contactFoamWeights[1] === 0.25 &&
      appearance.contactFoamWeights[2] === 0.125 &&
      appearance.contactFoamLacunarity === 2 &&
      appearance.contactFoamSuppressRefraction === 1 &&
      appearance.contactFoamSmoothnessReduction === 1;
    const actualCompositionMode = runtimeController?.compositionMode ?? HeightfieldWaterCompositionMode.LegacyAlpha;
    const actualDepthWriteEnabled = runtimeController?.depthWriteEnabled ?? false;
    const actualSurfaceTime = resolveGrasslandsSurfaceTimeReadback(
      runtimeController?.surfaceTimeOverride,
      engine?.time.elapsedTime
    );
    const surfaceTimeReady = automation
      ? runtimeController?.surfaceTimeOverride === GRASSLANDS_FIXED_SURFACE_TIME
      : runtimeController?.surfaceTimeOverride === undefined && actualSurfaceTime >= 0;
    // The Grasslands entry intentionally creates no gameplay body registry;
    // source-boundary tests and the formal harness independently enforce that.
    const gameplayQueryRegistered = false;
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
      scene.environmentAssetSetHash === GRASSLANDS_ENVIRONMENT_ASSET_SET_HASH &&
      scene.terrainMaterialRegionCount === 3 &&
      scene.terrainMaterialRegionIds.join(",") === "mud-stones,sand,grass-mud" &&
      scene.rockModelResourceCount === 5 &&
      scene.largeRockVariantCount === 2 &&
      scene.smallRockVariantCount === 3 &&
      scene.sharedRockMeshCount === 5 &&
      scene.proxyRockMeshCount === 0 &&
      environment?.ready === true &&
      isGrasslandsExclusionClean(exclusionResources);
    const brokerReady =
      currentQuality === WaterQualityTier.Low
        ? (broker?.activeConsumerCount ?? 0) === 0
        : broker?.depthTextureRequested === true &&
          broker.opaqueTextureRequested === true &&
          broker.depthCopyPassCount === 1 &&
          broker.colorCopyPassCount === 1;
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
      optics?.requestedSource === "sky" &&
      optics.effectiveSource === "sky" &&
      optics.opticalProfile.reflectionIntensity === 1 &&
      optics.fallbackReason === undefined &&
      directLightMatchesFixture &&
      actualCompositionMode === HeightfieldWaterCompositionMode.PrecomposedReplace &&
      actualDepthWriteEnabled &&
      surfaceTimeReady &&
      !gameplayQueryRegistered &&
      loader?.ready === true &&
      assetLoader?.resource?.texture.destroyed === false &&
      loader.actualContentHash === GRASSLANDS_NORMAL_CONTENT_HASH &&
      loader.width === 1024 &&
      loader.height === 1024 &&
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
      activeResource?.byteLength ?? 0,
      engine?.renderingStatistics.bufferMemory ?? 0,
      engine?.renderingStatistics.textureMemory ?? 0,
      engine?.renderingStatistics.totalMemory ?? 0,
      frame.fps,
      frame.p95FrameMs,
      ...cameraPosition,
      ...cameraForward,
      ...(scene?.directLight.effectiveColor ?? [0, 0, 0])
    ];
    const finite =
      runtimeError === null &&
      finiteValues.every(Number.isFinite) &&
      frame.finite &&
      (scene?.finite ?? phase === "initializing");
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
      runtimeCompiledHash: activeResource?.metadata.compiledHash ?? "",
      effectiveDebugMode: (optics?.debugView as HeightfieldWaterDebugMode | undefined) ?? currentDebugMode,
      appearanceFallbackReason: fallbackReason,
      foamOctaveCount: appearance?.contactFoamOctaveCount ?? 0,
      normal: Object.freeze({
        requested: appearance?.requested ?? false,
        active: appearance?.active ?? false,
        source: normalSource,
        assetId: appearance?.normalAssetId ?? loader?.assetId ?? GRASSLANDS_NORMAL_ASSET_ID,
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
        flipGreen: appearance?.flipGreen ?? false,
        layerCount: appearance?.normalLayerCount ?? 0,
        tiling: appearance?.normalTiling ?? 0,
        scrollUvPerSecond: appearance?.normalScrollUvPerSecond ?? 0,
        strength: appearance?.normalStrength ?? 0,
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
          model: appearance?.depthTintModel ?? "unavailable",
          enabled: appearance?.depthTintEnabled ?? false,
          color: Object.freeze(
            appearance?.depthTintColor
              ? [...appearance.depthTintColor]
              : ([0, 0, 0, 0] as [number, number, number, number])
          ) as readonly [number, number, number, number],
          distance: appearance?.depthTintDistance ?? 0,
          exponent: appearance?.depthTintExponent ?? 0
        }),
        coastalAlpha: Object.freeze({
          model: appearance?.coastalAlphaModel ?? "unavailable",
          enabled: appearance?.coastalAlphaEnabled ?? false,
          distance: appearance?.coastalAlphaDistance ?? 0
        }),
        contactFoam: Object.freeze({
          model: appearance?.contactFoamModel ?? "unavailable",
          enabled: appearance?.contactFoamEnabled ?? false,
          worldScale: appearance?.contactFoamWorldScale ?? 0,
          timeRate: appearance?.contactFoamTimeRate ?? 0,
          opacity: appearance?.contactFoamOpacity ?? 0,
          contactDistance: appearance?.contactFoamContactDistance ?? 0,
          octaveCount: appearance?.contactFoamOctaveCount ?? 0,
          weights: Object.freeze([...(appearance?.contactFoamWeights ?? [])]),
          lacunarity: appearance?.contactFoamLacunarity ?? 0,
          suppressRefraction: appearance?.contactFoamSuppressRefraction ?? 0,
          smoothnessReduction: appearance?.contactFoamSmoothnessReduction ?? 0
        }),
        fallbackReason: appearance?.fallbackReason ?? null
      }),
      cameraFeatures: Object.freeze({
        requested: Object.freeze({
          depthTexture: screenTexturesRequested,
          opaqueTexture: screenTexturesRequested,
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
          opaqueDownsampling: effectiveDownsampling
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
          : "legacy-alpha",
      depthWriteEnabled: actualDepthWriteEnabled,
      reflection: Object.freeze({
        contributionEnabled: reflectionEnabled && (optics?.opticalProfile.reflectionIntensity ?? 0) > 0,
        requestedSource: optics?.requestedSource ?? "sky",
        effectiveSource: optics?.effectiveSource ?? "sky",
        intensity: optics?.opticalProfile.reflectionIntensity ?? 0,
        effectiveIntensity: reflectionEnabled ? (optics?.opticalProfile.reflectionIntensity ?? 0) : 0,
        fallbackReason: optics?.fallbackReason ?? null,
        cameraCount: exclusionResources.planarCameraCount,
        renderTargetCount: exclusionResources.renderTargetCount
      }),
      runtimeSet: Object.freeze({
        activeSetCount: activeSetCount as 0 | 1,
        activeId: runtimeController?.activeId ?? null,
        compiledHash: activeResource?.metadata.compiledHash ?? "",
        chunkCount: runtimeController?.activeChunkCount ?? 0,
        drawCount: runtimeResources?.activeDrawCount ?? 0,
        meshUploadCount: runtimeController?.meshUploadCount ?? 0,
        perFrameMeshUpload: perFrameMeshUploadDetected,
        activeWaveCount: runtimeController?.activeData?.waveSet.activeWaveCount ?? 0,
        waveStrength: runtimeController?.activeData?.material.waveStrength ?? 0,
        gameplayQueryRegistered
      }),
      resources: Object.freeze({
        bufferMemory: engine?.renderingStatistics.bufferMemory ?? 0,
        textureMemory: engine?.renderingStatistics.textureMemory ?? 0,
        totalMemory: engine?.renderingStatistics.totalMemory ?? 0,
        ownedTextureCount:
          Math.max(0, (loader?.textureCreateCount ?? 0) - (loader?.textureDestroyCount ?? 0)) +
          (runtimeResources?.retainedLocalMapTextureCount ?? 0) +
          Math.max(0, (environment?.textureCreateCount ?? 0) - (environment?.textureDestroyCount ?? 0)),
        borrowedTextureCount: loader?.activeRuntimeBorrowCount ?? 0,
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
        reflectionCameraCount: exclusionResources.planarCameraCount,
        cameraCount: exclusionResources.cameraComponentCount
      }),
      frame: Object.freeze({
        ...frame,
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
        planarCameraCount: exclusionResources.planarCameraCount,
        reflectionProbeCount: exclusionResources.reflectionProbeCount,
        renderTargetCount: exclusionResources.renderTargetCount,
        anchorRocks: scene?.anchorRocks ?? Object.freeze([])
      }),
      exclusionResources
    });
  };

  const requireRuntime = (): HeightfieldWaterRuntimeController => {
    if (!runtimeController || lifecycleDisposed) throw new Error("Grasslands runtime is unavailable.");
    return runtimeController;
  };

  const requireScene = (): GrasslandsSceneController => {
    if (!sceneController || lifecycleDisposed) throw new Error("Grasslands scene is unavailable.");
    return sceneController;
  };

  const resetHeroCamera = (): void => {
    const scene = requireScene();
    scene.resetHeroCamera();
    cameraController?.syncFromTransform();
  };

  const restoreAllContactProbes = (): void => {
    const scene = requireScene();
    for (const rock of fixture.anchorRocks) scene.restoreContactProbe(rock.id);
  };

  controlledCalibration = new GrasslandsControlledCalibration({
    readRuntime,
    readOptics: () => runtimeController?.activeSurfaceOpticsReadback,
    readNormalSourceUrl: () => {
      const sourceUrl = assetLoader?.readback.sourceUrl;
      if (!sourceUrl) throw new Error("Grasslands normal source URL is unavailable.");
      return sourceUrl;
    }
  });

  const bridge = {
    readRuntime,
    setSurfaceAppearanceFeatureFlags(flags: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags>): void {
      requireRuntime().setSurfaceAppearanceFeatureFlags(flags);
    },
    setAppearanceEnabled(enabled: boolean): void {
      appearanceEnabled = enabled;
      requireRuntime().setSurfaceAppearanceBinding(
        enabled && currentQuality !== WaterQualityTier.Low ? appearanceBinding : undefined
      );
    },
    setRefractionEnabled(enabled: boolean): void {
      requireRuntime().setRefractionEnabled(enabled);
    },
    setReflectionEnabled(enabled: boolean): void {
      reflectionEnabled = enabled;
      const opticalProfile: WaterOpticalProfile = Object.freeze({
        ...GRASSLANDS_WATER_OPTICAL_PROFILE,
        reflectionIntensity: enabled ? 1 : 0
      });
      requireRuntime().setOpticalProfile(opticalProfile);
    },
    setReflectionScenario(scenario: GrasslandsReflectionScenario): void {
      if (scenario === "analytic-sky") {
        requireRuntime().setReflectionBinding(undefined);
        return;
      }
      requireRuntime().setReflectionBinding(
        Object.freeze({
          requestedSource: "probe",
          resolvedSource: "sky",
          fallbackReason: "probe-unavailable"
        })
      );
    },
    setDebugMode(mode: HeightfieldWaterDebugMode): void {
      currentDebugMode = mode;
      requireRuntime().setDebugMode(mode);
    },
    setDirectLightState(state: GrasslandsDirectLightState): void {
      requireScene().setDirectLightState(state);
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
    readControlledCalibration() {
      const calibration = controlledCalibration;
      if (!calibration || lifecycleDisposed) {
        return Promise.reject(new Error("Grasslands controlled calibration is unavailable."));
      }
      return teardownBarrier.track(calibration.read());
    },
    dispose(): GrasslandsShowcaseAcceptanceSnapshot {
      return cleanupImpl();
    }
  };

  const acceptanceApi = createGrasslandsShowcaseAcceptanceApi(fixture, bridge);
  const acceptanceGetter = (): GrasslandsShowcaseAcceptanceSnapshot => acceptanceApi.snapshot();
  window.waterPcgGrasslands = acceptanceApi;
  Object.defineProperty(window, "waterPcgAcceptance", {
    configurable: true,
    enumerable: true,
    get: acceptanceGetter
  });

  const writeMetric = (name: string, value: string): void => {
    const target = metricsElement?.querySelector(`[data-metric="${name}"]`);
    if (target) target.textContent = value;
  };

  const updateHud = (): void => {
    const snapshot = acceptanceApi.snapshot();
    if (statusElement) {
      const state: GrasslandsHudState =
        snapshot.phase === "error"
          ? "error"
          : snapshot.phase === "disposed"
            ? "disposed"
            : snapshot.qualityTier === WaterQualityTier.Low
              ? "fallback"
              : snapshot.ready
                ? "ready"
                : "loading";
      statusElement.dataset.state = state;
      statusElement.textContent =
        state === "ready"
          ? `${snapshot.qualityTier} ready`
          : state === "fallback"
            ? "low fallback"
            : state === "error"
              ? "failed closed"
              : state;
    }
    writeMetric("identity", `${snapshot.runtime} / ${snapshot.preset}`);
    writeMetric("quality", snapshot.qualityTier);
    writeMetric("capture", `${snapshot.captureState} / ${snapshot.effectiveDebugMode}`);
    writeMetric("normal", `${snapshot.normal.width}² · ${snapshot.normal.layerCount} layers`);
    writeMetric("foam", `${snapshot.foamOctaveCount} octaves`);
    writeMetric(
      "broker",
      `${snapshot.cameraFeatures.effective.depthCopyPassCount}/${snapshot.cameraFeatures.effective.colorCopyPassCount}`
    );
    writeMetric("runtime-set", `${snapshot.runtimeSet.activeSetCount} · ${snapshot.runtimeSet.chunkCount} chunks`);
    writeMetric("uploads", String(snapshot.runtimeSet.meshUploadCount));
    writeMetric("fixture", snapshot.fixtureHash);
    writeMetric("appearance", snapshot.appearanceHash);
    writeMetric("asset", snapshot.normal.contentHash || "unavailable");
    writeMetric("ready", String(snapshot.strictMaterialReady));
    if (metricsElement) {
      metricsElement.dataset.ready = String(snapshot.ready);
      metricsElement.dataset.strictMaterialReady = String(snapshot.strictMaterialReady);
      metricsElement.dataset.runtimeError = snapshot.runtimeError ?? "";
      metricsElement.dataset.fixtureHash = snapshot.fixtureHash;
      metricsElement.dataset.descriptorHash = snapshot.descriptorHash;
      metricsElement.dataset.appearanceHash = snapshot.appearanceHash;
      metricsElement.dataset.assetHash = snapshot.normal.contentHash;
      metricsElement.dataset.quality = snapshot.qualityTier;
      metricsElement.dataset.captureState = snapshot.captureState;
      metricsElement.dataset.debugMode = String(snapshot.effectiveDebugMode);
      metricsElement.dataset.activeRuntimeSetCount = String(snapshot.runtimeSet.activeSetCount);
      metricsElement.dataset.gameplayQueryRegistered = String(snapshot.runtimeSet.gameplayQueryRegistered);
      metricsElement.dataset.fallbackReason = snapshot.appearanceFallbackReason ?? "";
    }
    document.querySelectorAll<HTMLButtonElement>("[data-grasslands-capture-state]").forEach((button) => {
      button.dataset.active = String(button.dataset.grasslandsCaptureState === snapshot.captureState);
    });
    document.querySelectorAll<HTMLButtonElement>("[data-grasslands-toggle]").forEach((button) => {
      const feature = button.dataset.grasslandsToggle as GrasslandsCausalFeature | undefined;
      button.dataset.active = String(feature ? snapshot.activeAbState[feature] : false);
    });
  };

  const removeAcceptanceProperties = (): void => {
    if (window.waterPcgGrasslands === acceptanceApi) delete window.waterPcgGrasslands;
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
    if (releaseRuntimeBorrow) {
      try {
        releaseRuntimeBorrow();
        releaseRuntimeBorrow = undefined;
      } catch (error) {
        recordCleanupError("borrow-release", error);
      }
    }
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
    updateHud();
    writeLifecycleJournal("final");
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
      for (const removeListener of uiCleanupCallbacks.splice(0)) removeListener();
      controlledCalibration?.dispose();
    } else if (mode === "failure") {
      phase = "error";
    } else if (mode === "manual") {
      phase = "disposed";
    }

    if (engine && !engineDestroyed) engine.pause();
    if (runtimeController && !runtimeControllerDestroyed) {
      try {
        runtimeController.setSurfaceAppearanceBinding(undefined);
      } catch (error) {
        recordCleanupError("appearance-detach", error);
      }
      try {
        runtimeController.destroy();
        runtimeControllerDestroyed = true;
      } catch (error) {
        recordCleanupError("runtime-destroy", error);
      }
    }
    if (activeResource) {
      try {
        activeResource.dispose();
        activeResource = undefined;
      } catch (error) {
        recordCleanupError("compiled-resource-dispose", error);
      }
    }
    if (compileWorker && !compileWorkerDisposed) {
      try {
        compileWorker.dispose();
        compileWorkerDisposed = true;
      } catch (error) {
        recordCleanupError("compile-worker-dispose", error);
      }
    }
    if (cameraFeatureBroker && !cameraFeatureBrokerDestroyed) {
      try {
        cameraFeatureBroker.destroy();
        cameraFeatureBrokerDestroyed = true;
      } catch (error) {
        recordCleanupError("camera-feature-broker-destroy", error);
      }
    }
    teardownBarrier.requestFinalize();

    updateHud();
    const snapshot = writeLifecycleJournal(teardownBarrier.finalized ? "final" : "interim");
    if (mode === "manual") removeAcceptanceProperties();
    return snapshot;
  };

  const resizeCanvas = (): void => {
    engine?.canvas.resizeByClientSize();
    if (engine) cameraFeatureBroker?.setViewportSize(engine.canvas.width, engine.canvas.height);
  };

  const applyCameraFeaturePolicy = (quality: WaterQualityTier): void => {
    if (!cameraFeatureBroker) return;
    if (quality === WaterQualityTier.Low) {
      cameraFeatureBroker.removeRequest(GRASSLANDS_RUNTIME_SET_ID);
      return;
    }
    cameraFeatureBroker.setRequest(GRASSLANDS_RUNTIME_SET_ID, {
      depthTexture: true,
      opaqueTexture: true,
      reflection: "none",
      caustics: false,
      underwater: false,
      quality: quality === WaterQualityTier.High ? "high" : "medium",
      opaqueDownsampling: quality === WaterQualityTier.High ? Downsampling.None : Downsampling.TwoX
    });
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

    const statusCandidate = document.getElementById("grasslands-water-status");
    const metricsCandidate = document.getElementById("grasslands-water-metrics");
    if (!(statusCandidate instanceof HTMLSpanElement) || !(metricsCandidate instanceof HTMLDListElement)) {
      throw new Error("Grasslands Showcase template is incomplete.");
    }
    statusElement = statusCandidate;
    metricsElement = metricsCandidate;

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
    engine.canvas.resizeByClientSize();
    window.addEventListener("resize", resizeCanvas);

    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor = new Color(0.055, 0.11, 0.105, 1);
    scene.ambientLight.diffuseSolidColor.set(0.28, 0.36, 0.31, 1);
    scene.ambientLight.diffuseIntensity = 0.62;
    root = scene.createRootEntity("grasslands-water-showcase");
    assetLoader = new GrasslandsAssetLoader(engine, {
      strict: true,
      source: normalSource,
      enableDevelopmentLocalOverride:
        normalSource === "local-override" && search.get("developmentLocalOverride") === "1"
    });
    const normalResource = await teardownBarrier.track(assetLoader.load());
    if (lifecycleDisposed) {
      cleanupImpl();
      return;
    }
    if (!normalResource) throw new Error("Grasslands strict normal asset did not produce a texture.");
    const loadedEnvironmentAssets = await teardownBarrier.track(
      GrasslandsEnvironmentAssets.load(engine).then((loaded) => {
        environmentAssets = loaded;
        return loaded;
      })
    );
    if (lifecycleDisposed) {
      cleanupImpl();
      return;
    }
    sceneController = new GrasslandsSceneController(engine, root, loadedEnvironmentAssets, fixture);
    cameraController = createShowcaseCameraController(sceneController.cameraEntity, {
      mode: cameraMode,
      movementSpeed: SHOWCASE_CAMERA_MOVEMENT_SPEED.grasslands
    });

    cameraFeatureBroker = new CameraWaterFeatureBroker(sceneController.camera);
    cameraFeatureBroker.setViewportSize(engine.canvas.width, engine.canvas.height);
    applyCameraFeaturePolicy(WaterQualityTier.High);

    const runtimeRoot = root.createChild("grasslands-heightfield-runtime-root");
    runtimeController = new HeightfieldWaterRuntimeController(engine, runtimeRoot);
    compileWorker = new HeightfieldWaterCompileWorkerClient();
    releaseRuntimeBorrow = assetLoader.acquireRuntimeBorrow();
    appearanceBinding = Object.freeze({
      appearance: GRASSLANDS_COMPILED_SURFACE_APPEARANCE,
      assetId: normalResource.bindingMetadata.assetId,
      contentHash: normalResource.bindingMetadata.contentHash,
      texture: normalResource.bindingMetadata.texture,
      ownership: "borrowed"
    });

    runtimeController.setSurfaceAppearanceBinding(appearanceBinding);
    runtimeController.setSurfaceAppearanceFeatureFlags(DEFAULT_APPEARANCE_FEATURE_FLAGS);
    runtimeController.setOpticalProfile(GRASSLANDS_WATER_OPTICAL_PROFILE);
    runtimeController.setRefractionEnabled(true);
    runtimeController.setCompositionMode(HeightfieldWaterCompositionMode.PrecomposedReplace);
    runtimeController.setDepthWriteEnabled(true);
    runtimeController.setSurfaceTimeOverride(resolveGrasslandsSurfaceTimeOverride(search));
    runtimeController.setDebugMode(HeightfieldWaterDebugMode.Final);

    compileAndActivateImpl = async (quality: WaterQualityTier): Promise<void> => {
      if (lifecycleDisposed) throw new Error("Grasslands runtime is disposed.");
      if (
        quality !== WaterQualityTier.Low &&
        quality !== WaterQualityTier.Medium &&
        quality !== WaterQualityTier.High
      ) {
        throw new RangeError(`Unknown Grasslands quality tier "${String(quality)}".`);
      }
      const revision = ++rebuildRevision;
      currentQuality = quality;
      runtimeOperationalReady = false;
      runtimeError = null;
      phase = "initializing";
      updateHud();
      applyCameraFeaturePolicy(quality);
      const runtime = requireRuntime();
      runtime.setSurfaceAppearanceBinding(
        quality === WaterQualityTier.Low || !appearanceEnabled ? undefined : appearanceBinding
      );
      let nextResource: HeightfieldWaterResource | undefined;
      try {
        const descriptor = createQualityDescriptor(fixture.descriptor, quality);
        const compileOperation = compileWorker?.compile(descriptor);
        if (!compileOperation) throw new Error("Grasslands Heightfield worker is unavailable.");
        nextResource = await teardownBarrier.track(compileOperation);
        if (revision !== rebuildRevision || lifecycleDisposed) {
          nextResource.dispose();
          return;
        }
        const activation = await teardownBarrier.track(
          runtime.replaceActiveIncremental(GRASSLANDS_RUNTIME_SET_ID, nextResource, {
            frameBudgetMs: 4,
            shouldCancel: () => revision !== rebuildRevision || lifecycleDisposed
          })
        );
        if (revision !== rebuildRevision || lifecycleDisposed) {
          nextResource.dispose();
          return;
        }
        if (activation.submittedChunkCount !== nextResource.data.chunks.length) {
          throw new Error("Grasslands Heightfield activation submitted an incomplete chunk set.");
        }
        const previousResource = activeResource;
        activeResource = nextResource;
        nextResource = undefined;
        previousResource?.dispose();
        runtime.flushDeferredResources();
        lastStableMeshUploadCount = runtime.meshUploadCount;
        runtimeOperationalReady = true;
        phase = quality === WaterQualityTier.Low ? "fallback" : "ready";
        updateHud();
      } catch (error) {
        nextResource?.dispose();
        if (revision !== rebuildRevision || lifecycleDisposed) return;
        runtimeError = readErrorMessage(error);
        phase = "error";
        runtimeOperationalReady = false;
        updateHud();
        throw error;
      }
    };

    const captureButtons = document.querySelectorAll<HTMLButtonElement>("[data-grasslands-capture-state]");
    captureButtons.forEach((button) => {
      const handleClick = (): void => {
        acceptanceApi.setCaptureState(button.dataset.grasslandsCaptureState as GrasslandsCaptureState);
        updateHud();
      };
      button.addEventListener("click", handleClick);
      uiCleanupCallbacks.push(() => button.removeEventListener("click", handleClick));
    });
    const toggleButtons = document.querySelectorAll<HTMLButtonElement>("[data-grasslands-toggle]");
    toggleButtons.forEach((button) => {
      const handleClick = (): void => {
        const feature = button.dataset.grasslandsToggle as GrasslandsCausalFeature;
        const enabled = acceptanceApi.snapshot().activeAbState[feature];
        acceptanceApi.setCausalFeature(feature, !enabled);
        updateHud();
      };
      button.addEventListener("click", handleClick);
      uiCleanupCallbacks.push(() => button.removeEventListener("click", handleClick));
    });
    const qualitySelect = document.querySelector<HTMLSelectElement>("[data-grasslands-quality]");
    if (qualitySelect) {
      const handleQuality = (): void => {
        const quality = qualitySelect.value as WaterQualityTier;
        void acceptanceApi.setQuality(quality).catch((error: unknown) => {
          runtimeError = readErrorMessage(error);
          phase = "error";
          updateHud();
        });
      };
      qualitySelect.addEventListener("change", handleQuality);
      uiCleanupCallbacks.push(() => qualitySelect.removeEventListener("change", handleQuality));
    }
    const resetButton = document.querySelector<HTMLButtonElement>("[data-grasslands-reset]");
    if (resetButton) {
      const handleReset = (): void => {
        void acceptanceApi
          .reset()
          .then(updateHud)
          .catch((error: unknown) => {
            runtimeError = readErrorMessage(error);
            phase = "error";
            updateHud();
          });
      };
      resetButton.addEventListener("click", handleReset);
      uiCleanupCallbacks.push(() => resetButton.removeEventListener("click", handleReset));
    }

    await compileAndActivateImpl(WaterQualityTier.High);
    if (lifecycleDisposed) {
      cleanupImpl();
      return;
    }

    class GrasslandsShowcaseUpdateScript extends Script {
      onUpdate(deltaTime: number): void {
        try {
          engineUpdateCount++;
          const meshUploadCount = runtimeController?.meshUploadCount ?? 0;
          if (runtimeOperationalReady && meshUploadCount !== lastStableMeshUploadCount) {
            perFrameMeshUploadDetected = true;
          }
          lastStableMeshUploadCount = meshUploadCount;
          frameSampler.record(deltaTime);
        } catch (error) {
          runtimeError = readErrorMessage(error);
          runtimeOperationalReady = false;
          phase = "error";
          updateHud();
        }
      }
    }
    root.addComponent(GrasslandsShowcaseUpdateScript);
    updateHud();
    engine.run();
  } catch (error) {
    runtimeError = readErrorMessage(error);
    phase = "error";
    runtimeOperationalReady = false;
    cleanupImpl("failure");
    if (statusElement) {
      statusElement.textContent = "failed closed";
      statusElement.dataset.state = "error";
    }
    if (metricsElement) {
      metricsElement.dataset.ready = "false";
      metricsElement.dataset.runtimeError = runtimeError;
    }
    throw error;
  }
}

void bootstrapGrasslandsShowcase().catch((error: unknown) => {
  console.error(error instanceof Error ? error : new Error("Grasslands Showcase bootstrap failed closed."));
});
