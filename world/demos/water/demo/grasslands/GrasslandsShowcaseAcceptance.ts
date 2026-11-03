import { WaterQualityTier } from "@galacean/engine-water/water/index";
import type { LakeLandscapeTextureReadback } from "../shared/WaterLandscapeAssets.ts";
import { HeightfieldWaterDebugMode } from "@galacean/engine-water/water/runtime/heightfield/config";
import type { HeightfieldWaterSurfaceAppearanceFeatureFlags } from "@galacean/engine-water/water/runtime/heightfield/config";
import type { WaterSurfaceFieldGraphReadback } from "@galacean/engine-water/water/runtime/index";
import type {
  WaterShowcaseAcceptanceSnapshot,
  WaterShowcaseCaptureApi,
  WaterShowcaseReflectionMetrics
} from "../showcase/WaterShowcaseAcceptance.ts";
import type {
  GrasslandsAnchorRockReadback,
  GrasslandsDirectLightReadbackState,
  GrasslandsDirectLightState
} from "./GrasslandsSceneController.ts";
import type { GrasslandsBuiltInLightingPreset, GrasslandsLightingReadback } from "./GrasslandsLightingController.ts";
import type { GrasslandsPcgFixture, GrasslandsVector3, GrasslandsWorldBounds } from "./GrasslandsPcgTypes.ts";

export const GRASSLANDS_CAPTURE_STATES = Object.freeze([
  "hero",
  "detail-normal",
  "refraction",
  "depth-color",
  "contact-foam",
  "coastal-alpha",
  "direct-specular",
  "reflection"
] as const);

export type GrasslandsCaptureState = (typeof GRASSLANDS_CAPTURE_STATES)[number];

export const GRASSLANDS_SHARED_CAPTURE_STATES = Object.freeze(["hero", "interaction", "detail"] as const);

export type GrasslandsSharedCaptureState = (typeof GRASSLANDS_SHARED_CAPTURE_STATES)[number];

export const GRASSLANDS_CAPTURE_DEBUG_MODE: Readonly<Record<GrasslandsCaptureState, HeightfieldWaterDebugMode>> =
  Object.freeze({
    hero: HeightfieldWaterDebugMode.Final,
    "detail-normal": HeightfieldWaterDebugMode.DetailNormal,
    refraction: HeightfieldWaterDebugMode.RefractionUvDelta,
    "depth-color": HeightfieldWaterDebugMode.DepthTint,
    "contact-foam": HeightfieldWaterDebugMode.ContactFoam,
    "coastal-alpha": HeightfieldWaterDebugMode.CoastalAlpha,
    "direct-specular": HeightfieldWaterDebugMode.DirectSpecular,
    reflection: HeightfieldWaterDebugMode.ReflectionColor
  });

export type GrasslandsCausalFeature =
  | "externalNormal"
  | "refraction"
  | "depthColor"
  | "contactFoam"
  | "coastalAlpha"
  | "directSpecular"
  | "reflection";
export type GrasslandsReflectionScenario = "environment" | "analytic-sky" | "missing-probe";

export interface GrasslandsCausalFeatureState {
  readonly externalNormal: boolean;
  readonly refraction: boolean;
  readonly depthColor: boolean;
  readonly contactFoam: boolean;
  readonly coastalAlpha: boolean;
  readonly directSpecular: boolean;
  readonly reflection: boolean;
}

export interface GrasslandsNormalAcceptanceReadback {
  readonly requested: boolean;
  readonly active: boolean;
  readonly source: "tracked" | "local-override";
  readonly assetId: string;
  readonly contentHash: string;
  readonly expectedContentHash: string;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "linear" | "unavailable";
  readonly wrapU: "repeat" | "unavailable";
  readonly wrapV: "repeat" | "unavailable";
  readonly filter: "bilinear" | "unavailable";
  readonly mipmaps: boolean;
  readonly anisotropy: number;
  readonly textureDestroyed: boolean;
  readonly flipGreen: boolean;
  readonly layerCount: 0 | 1 | 2;
  readonly tiling: number;
  readonly scrollUvPerSecond: number;
  readonly strength: number;
  readonly ownership: "borrowed" | "unavailable";
  readonly fallbackReason: string | null;
}

export interface GrasslandsCameraFeatureAcceptanceReadback {
  /** Per-consumer field resolution; null for the unchanged V1 LocalBathymetry path. */
  readonly fieldGraph: WaterSurfaceFieldGraphReadback | null;
  readonly requested: {
    readonly depthTexture: boolean;
    readonly opaqueTexture: boolean;
    readonly quality: "off" | "medium" | "high";
    readonly opaqueDownsampling: "off" | "none" | "2x";
  };
  readonly effective: {
    readonly depthTexture: boolean;
    readonly opaqueTexture: boolean;
    readonly activeConsumerCount: number;
    readonly depthCopyPassCount: 0 | 1;
    readonly colorCopyPassCount: 0 | 1;
    readonly opaqueDownsampling: "off" | "none" | "2x";
    readonly incrementalEstimatedRenderTargetBytes: number;
    readonly totalEstimatedRenderTargetBytes: number;
  };
}

export interface GrasslandsDirectLightAcceptanceReadback {
  readonly bound: boolean;
  readonly matchesFixture: boolean;
  readonly count: number;
  readonly state: GrasslandsDirectLightReadbackState;
  readonly enabled: boolean;
  readonly color: GrasslandsVector3;
  readonly effectiveColor: GrasslandsVector3;
  readonly intensity: number;
  readonly forward: GrasslandsVector3;
}

export interface GrasslandsAppearanceAcceptanceReadback {
  readonly requested: boolean;
  readonly active: boolean;
  readonly enabled: boolean;
  readonly assetId: string;
  readonly appearanceHash: string;
  readonly variantKey: string;
  readonly featureFlags: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags>;
  readonly depthTint: {
    readonly model: string;
    readonly enabled: boolean;
    readonly color: readonly [number, number, number, number];
    readonly distance: number;
    readonly exponent: number;
  };
  readonly coastalAlpha: {
    readonly model: string;
    readonly enabled: boolean;
    readonly distance: number;
  };
  readonly contactFoam: {
    readonly model: string;
    readonly enabled: boolean;
    readonly worldScale: number;
    readonly timeRate: number;
    readonly opacity: number;
    readonly contactDistance: number;
    readonly octaveCount: 0 | 1 | 2 | 3;
    readonly weights: readonly number[];
    readonly lacunarity: number;
    readonly suppressRefraction: number;
    readonly smoothnessReduction: number;
  };
  readonly fallbackReason: string | null;
}

export interface GrasslandsReflectionAcceptanceReadback {
  readonly contributionEnabled: boolean;
  readonly requestedSource: "none" | "sky" | "probe" | "ssr";
  readonly effectiveSource: "none" | "sky" | "probe" | "ssr";
  readonly requestedMode: "analytic" | "environment" | "ssr";
  readonly effectiveMode: "analytic" | "environment" | "ssr";
  readonly environmentProviderId: string | null;
  readonly environmentOwnership: "borrowed" | "unavailable";
  readonly environmentRotationDegrees: number;
  readonly environmentExposure: number;
  readonly environmentIntensity: number;
  readonly environmentColorSpace: "linear" | "srgb";
  readonly environmentHDR: boolean;
  readonly environmentMaximumMipLevel: number;
  readonly borrowedEnvironmentTextureCount: number;
  readonly ownedEnvironmentTextureCount: 0;
  readonly boundEnvironmentConsumerCount: number;
  readonly ownerCount: number;
  readonly intensity: number;
  readonly effectiveIntensity: number;
  readonly fallbackReason: string | null;
  readonly cameraCount: number;
  readonly renderTargetCount: number;
}

export interface GrasslandsRuntimeSetAcceptanceReadback {
  readonly activeSetCount: 0 | 1;
  readonly activeId: string | null;
  readonly compiledHash: string;
  readonly chunkCount: number;
  readonly drawCount: number;
  readonly meshUploadCount: number;
  readonly perFrameMeshUpload: boolean;
  readonly activeWaveCount: number;
  readonly waveStrength: number;
  readonly gameplayQueryRegistered: boolean;
}

export interface GrasslandsResourceAcceptanceReadback {
  readonly bufferMemory: number;
  readonly textureMemory: number;
  readonly totalMemory: number;
  readonly liveRenderTargets: number;
  readonly liveReflectionCameras: number;
  readonly meshUploadCount: number;
  readonly perFrameMeshUpload: boolean;
  readonly ownedTextureCount: number;
  readonly borrowedTextureCount: number;
  readonly textureCreateCount: number;
  readonly textureDestroyCount: number;
  readonly materialCount: number;
  readonly runtimeSetCreateCount: number;
  readonly runtimeSetDestroyCount: number;
  readonly materialCreateCount: number;
  readonly materialDestroyCount: number;
  readonly localMapTextureCreateCount: number;
  readonly localMapTextureDestroyCount: number;
  readonly meshCreateCount: number;
  readonly meshDestroyCount: number;
  readonly sceneMeshCreateCount: number;
  readonly sceneMeshDestroyCount: number;
  readonly sceneMaterialCreateCount: number;
  readonly sceneMaterialDestroyCount: number;
  readonly sceneEntityCreateCount: number;
  readonly sceneEntityDestroyCount: number;
  readonly sceneMeshUploadCount: number;
  readonly environmentTextureCreateCount: number;
  readonly environmentTextureDestroyCount: number;
  readonly environmentTextures?: readonly LakeLandscapeTextureReadback[];
  readonly environmentMaterialCreateCount: number;
  readonly environmentMaterialDestroyCount: number;
  readonly environmentGltfResourceCreateCount: number;
  readonly environmentGltfResourceDestroyCount: number;
  readonly environmentMeshCreateCount: number;
  readonly environmentMeshDestroyCount: number;
  readonly environmentTemplateEntityCreateCount: number;
  readonly environmentTemplateEntityDestroyCount: number;
  readonly environmentActiveRockInstanceCount: number;
  readonly environmentRockInstanceCreateCount: number;
  readonly environmentRockInstanceDestroyCount: number;
  readonly renderTargetCount: number;
  readonly reflectionCameraCount: number;
  readonly cameraCount: number;
}

export interface GrasslandsFrameAcceptanceReadback {
  readonly engineUpdateCount: number;
}

export interface GrasslandsCameraAcceptanceReadback {
  readonly mode: "free" | "fixed";
  readonly freeControlActive: boolean;
  readonly movementSpeed: number;
  readonly position: GrasslandsVector3;
  readonly forward: GrasslandsVector3;
}

export interface GrasslandsSceneAcceptanceReadback {
  readonly ready: boolean;
  readonly finite: boolean;
  readonly cameraMode: "free" | "fixed";
  readonly fixtureId: string;
  readonly fixtureHash: string;
  readonly bounds: GrasslandsWorldBounds;
  readonly terrainEntityCount: number;
  readonly anchorRockCount: number;
  readonly activeRockCount: number;
  readonly scenicRockCount: number;
  readonly submergedScenicRockCount: number;
  readonly shoreScenicRockCount: number;
  readonly contactProbeCount: number;
  readonly terrainIndexCount: number;
  readonly terrainMudStonesIndexCount: number;
  readonly terrainSandIndexCount: number;
  readonly terrainGrassMudIndexCount: number;
  readonly terrainBedIndexCount: number;
  readonly terrainBankIndexCount: number;
  readonly terrainShorelineSampleCount: number;
  readonly terrainDegenerateTriangleCount: number;
  readonly terrainDirectMudGrassAdjacencyCount: number;
  readonly environmentReady: boolean;
  readonly environmentAssetSetHash: string;
  readonly terrainMaterialRegionCount: number;
  readonly terrainMaterialRegionIds: readonly string[];
  readonly rockModelResourceCount: number;
  readonly largeRockVariantCount: number;
  readonly smallRockVariantCount: number;
  readonly sharedRockMeshCount: number;
  readonly proxyRockMeshCount: number;
  readonly sceneMeshUploadCount: number;
  readonly connectedWaterBodyCount: number;
  readonly landscapeRegionCount: number;
  readonly landscapeRegionIds: readonly string[];
  readonly landscapeExtentScaleXZ: readonly [number, number];
  readonly directLightCount: number;
  readonly skyboxCount: number;
  readonly auxiliaryCameraCount: number;
  readonly reflectionProbeCount: number;
  readonly renderTargetCount: number;
  readonly anchorRocks: readonly GrasslandsAnchorRockReadback[];
}

export interface GrasslandsExcludedResourceAcceptanceReadback {
  readonly source: "runtime-observed";
  readonly cameraComponentCount: number;
  readonly directLightComponentCount: number;
  readonly skyboxCount: number;
  readonly auxiliaryCameraCount: number;
  readonly reflectionProbeCount: number;
  readonly renderTargetCount: number;
}

export interface GrasslandsAcceptanceRuntimeReadback {
  readonly lakeBoundary?: Readonly<{
    waterLevel: number;
    ringCount: number;
    sampledPointCount: number;
    sampleMarkerCount?: number;
    triangleCount: number;
    vertexCount: number;
    queryCoverage: string;
  }>;
  readonly phase: "initializing" | "ready" | "error" | "disposed";
  readonly ready: boolean;
  readonly strictMaterialReady: boolean;
  readonly finite: boolean;
  readonly runtimeError: string | null;
  readonly disposed: boolean;
  readonly qualityTier: WaterQualityTier;
  readonly opticsTier: "off" | "medium" | "high";
  readonly surfaceTime: number;
  readonly runtimeCompiledHash: string;
  readonly effectiveDebugMode: HeightfieldWaterDebugMode;
  readonly appearanceFallbackReason: string | null;
  readonly foamOctaveCount: 0 | 1 | 2 | 3;
  readonly refractionEnabled: boolean;
  readonly normal: Readonly<GrasslandsNormalAcceptanceReadback>;
  readonly appearance: Readonly<GrasslandsAppearanceAcceptanceReadback>;
  readonly cameraFeatures: Readonly<GrasslandsCameraFeatureAcceptanceReadback>;
  readonly directLight: Readonly<GrasslandsDirectLightAcceptanceReadback>;
  readonly compositionMode: "alpha-blend" | "precomposed-replace";
  readonly depthWriteEnabled: boolean;
  readonly reflection: Readonly<GrasslandsReflectionAcceptanceReadback>;
  readonly runtimeSet: Readonly<GrasslandsRuntimeSetAcceptanceReadback>;
  readonly resources: Readonly<GrasslandsResourceAcceptanceReadback>;
  readonly frame: Readonly<GrasslandsFrameAcceptanceReadback>;
  readonly camera: Readonly<GrasslandsCameraAcceptanceReadback>;
  readonly scene: Readonly<GrasslandsSceneAcceptanceReadback>;
  readonly exclusionResources: Readonly<GrasslandsExcludedResourceAcceptanceReadback>;
}

export interface GrasslandsShowcaseAcceptanceSnapshot extends GrasslandsAcceptanceRuntimeReadback {
  readonly caseId: "showcase-grasslands-stylized-water";
  readonly runtime: "grasslands";
  readonly preset: "hero-grasslands";
  readonly waterBodyType: "lake";
  readonly seed: number;
  readonly fixtureId: string;
  readonly fixtureHash: string;
  readonly descriptorSchema: 1;
  readonly descriptorHash: string;
  readonly appearanceAssetId: string;
  readonly appearanceHash: string;
  readonly appearanceVariantKey: GrasslandsPcgFixture["appearanceVariantKey"];
  readonly externalAssetHash: string;
  readonly wetTexelCount: number;
  readonly waterBounds: GrasslandsWorldBounds;
  readonly captureViewport: readonly [number, number];
  readonly appearanceEnabled: boolean;
  readonly activeAbState: Readonly<GrasslandsCausalFeatureState>;
  readonly captureState: GrasslandsCaptureState;
  readonly requestedDebugMode: HeightfieldWaterDebugMode;
  readonly lighting: Readonly<GrasslandsLightingReadback>;
}

export interface GrasslandsShowcaseAcceptanceBridge {
  readRuntime(): GrasslandsAcceptanceRuntimeReadback;
  readLighting(): GrasslandsLightingReadback;
  setSurfaceAppearanceFeatureFlags(flags: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags>): void;
  setAppearanceEnabled(enabled: boolean): void;
  setRefractionEnabled(enabled: boolean): void;
  setReflectionEnabled(enabled: boolean): void;
  setReflectionScenario(scenario: GrasslandsReflectionScenario): void;
  setDebugMode(mode: HeightfieldWaterDebugMode): void;
  setDirectLightState(state: GrasslandsDirectLightState): void;
  setLightingPreset(preset: GrasslandsBuiltInLightingPreset): void;
  setQuality(quality: WaterQualityTier): Promise<void>;
  resetHeroCamera(): void;
  raiseContactProbe(id: string): GrasslandsAnchorRockReadback;
  removeContactProbe(id: string): GrasslandsAnchorRockReadback;
  restoreContactProbe(id: string): GrasslandsAnchorRockReadback;
  restoreAllContactProbes(): void;
  dispose(): Promise<GrasslandsShowcaseAcceptanceSnapshot>;
}

export interface GrasslandsShowcaseAcceptanceApi {
  readonly fixture: GrasslandsPcgFixture;
  readonly states: readonly GrasslandsCaptureState[];
  readonly currentState: GrasslandsCaptureState;
  snapshot(): GrasslandsShowcaseAcceptanceSnapshot;
  setCaptureState(state: GrasslandsCaptureState): void;
  setDebugMode(mode: HeightfieldWaterDebugMode): void;
  setAppearanceEnabled(enabled: boolean): void;
  setCausalFeature(feature: GrasslandsCausalFeature, enabled: boolean): void;
  setReflectionScenario(scenario: GrasslandsReflectionScenario): void;
  setDirectLightState(state: GrasslandsDirectLightState): void;
  setLightingPreset(preset: GrasslandsBuiltInLightingPreset): void;
  setQuality(quality: WaterQualityTier): Promise<void>;
  resetHeroCamera(): void;
  raiseContactProbe(id: string): GrasslandsAnchorRockReadback;
  removeContactProbe(id: string): GrasslandsAnchorRockReadback;
  restoreContactProbe(id: string): GrasslandsAnchorRockReadback;
  reset(): Promise<void>;
  dispose(): Promise<GrasslandsShowcaseAcceptanceSnapshot>;
}

declare global {
  interface Window {
    waterPcgGrasslands?: GrasslandsShowcaseAcceptanceApi;
  }
}

const DEFAULT_CAUSAL_FEATURE_STATE: Readonly<GrasslandsCausalFeatureState> = Object.freeze({
  externalNormal: true,
  refraction: true,
  depthColor: true,
  contactFoam: true,
  coastalAlpha: true,
  directSpecular: true,
  reflection: true
});

function createAppearanceFeatureFlags(
  state: Readonly<GrasslandsCausalFeatureState>
): Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags> {
  return Object.freeze({
    externalNormal: state.externalNormal,
    depthTint: state.depthColor,
    coastalAlpha: state.coastalAlpha,
    contactFoam: state.contactFoam,
    directSpecular: state.directSpecular
  });
}

class GrasslandsShowcaseAcceptanceController {
  readonly api: GrasslandsShowcaseAcceptanceApi;

  private _captureState: GrasslandsCaptureState = "hero";
  private _requestedDebugMode = HeightfieldWaterDebugMode.Final;
  private _appearanceEnabled = true;
  private _causalState: Readonly<GrasslandsCausalFeatureState> = DEFAULT_CAUSAL_FEATURE_STATE;

  constructor(
    private readonly _fixture: GrasslandsPcgFixture,
    private readonly _bridge: GrasslandsShowcaseAcceptanceBridge
  ) {
    const controller = this;
    this.api = Object.freeze({
      fixture: _fixture,
      states: GRASSLANDS_CAPTURE_STATES,
      get currentState() {
        return controller._captureState;
      },
      snapshot: () => controller.snapshot(),
      setCaptureState: (state: GrasslandsCaptureState) => controller.setCaptureState(state),
      setDebugMode: (mode: HeightfieldWaterDebugMode) => controller.setDebugMode(mode),
      setAppearanceEnabled: (enabled: boolean) => controller.setAppearanceEnabled(enabled),
      setCausalFeature: (feature: GrasslandsCausalFeature, enabled: boolean) =>
        controller.setCausalFeature(feature, enabled),
      setReflectionScenario: (scenario: GrasslandsReflectionScenario) =>
        controller._bridge.setReflectionScenario(scenario),
      setDirectLightState: (state: GrasslandsDirectLightState) => controller._bridge.setDirectLightState(state),
      setLightingPreset: (preset: GrasslandsBuiltInLightingPreset) => controller.setLightingPreset(preset),
      setQuality: (quality: WaterQualityTier) => controller._bridge.setQuality(quality),
      resetHeroCamera: () => controller._bridge.resetHeroCamera(),
      raiseContactProbe: (id: string) => controller._bridge.raiseContactProbe(id),
      removeContactProbe: (id: string) => controller._bridge.removeContactProbe(id),
      restoreContactProbe: (id: string) => controller._bridge.restoreContactProbe(id),
      reset: () => controller.reset(),
      dispose: () => controller._bridge.dispose()
    });
  }

  snapshot(): GrasslandsShowcaseAcceptanceSnapshot {
    const runtime = this._bridge.readRuntime();
    return Object.freeze({
      ...runtime,
      caseId: this._fixture.caseId,
      runtime: this._fixture.runtime,
      preset: this._fixture.preset,
      waterBodyType: this._fixture.waterBodyType,
      seed: this._fixture.seed,
      fixtureId: this._fixture.fixtureId,
      fixtureHash: this._fixture.fixtureHash,
      descriptorSchema: this._fixture.descriptor.schemaVersion,
      descriptorHash: this._fixture.descriptorHash,
      appearanceAssetId: this._fixture.appearanceAssetId,
      appearanceHash: this._fixture.appearanceHash,
      appearanceVariantKey: this._fixture.appearanceVariantKey,
      externalAssetHash: this._fixture.externalAssetHash,
      wetTexelCount: this._fixture.wetTexelCount,
      waterBounds: this._fixture.waterBounds,
      captureViewport: this._fixture.captureViewport,
      appearanceEnabled: this._appearanceEnabled,
      activeAbState: this._causalState,
      captureState: this._captureState,
      requestedDebugMode: this._requestedDebugMode,
      lighting: this._bridge.readLighting()
    });
  }

  setLightingPreset(preset: GrasslandsBuiltInLightingPreset): void {
    if (preset !== "reference" && preset !== "all-off" && preset !== "direct-only" && preset !== "indirect-only") {
      throw new RangeError(`Unknown Grasslands Lighting preset "${String(preset)}".`);
    }
    this._bridge.setLightingPreset(preset);
  }

  setCaptureState(state: GrasslandsCaptureState): void {
    if (!GRASSLANDS_CAPTURE_STATES.includes(state)) {
      throw new RangeError(`Unknown Grasslands capture state "${String(state)}".`);
    }
    this._captureState = state;
    this.setDebugMode(GRASSLANDS_CAPTURE_DEBUG_MODE[state]);
  }

  setDebugMode(mode: HeightfieldWaterDebugMode): void {
    if (
      !Number.isInteger(mode) ||
      mode < HeightfieldWaterDebugMode.Final ||
      mode > HeightfieldWaterDebugMode.CompositeReflection
    ) {
      throw new RangeError(`Unknown Grasslands Debug mode "${String(mode)}".`);
    }
    this._requestedDebugMode = mode;
    this._bridge.setDebugMode(mode);
  }

  setAppearanceEnabled(enabled: boolean): void {
    if (typeof enabled !== "boolean") throw new TypeError("Grasslands Appearance state must be boolean.");
    this._appearanceEnabled = enabled;
    this._bridge.setAppearanceEnabled(enabled);
  }

  setCausalFeature(feature: GrasslandsCausalFeature, enabled: boolean): void {
    if (typeof enabled !== "boolean") throw new TypeError("Grasslands causal feature state must be boolean.");
    if (!Object.hasOwn(this._causalState, feature)) {
      throw new RangeError(`Unknown Grasslands causal feature "${String(feature)}".`);
    }
    this._causalState = Object.freeze({
      ...this._causalState,
      [feature]: enabled
    });
    switch (feature) {
      case "refraction":
        this._bridge.setRefractionEnabled(enabled);
        return;
      case "reflection":
        this._bridge.setReflectionEnabled(enabled);
        return;
      default:
        this._bridge.setSurfaceAppearanceFeatureFlags(createAppearanceFeatureFlags(this._causalState));
    }
  }

  async reset(): Promise<void> {
    this._causalState = DEFAULT_CAUSAL_FEATURE_STATE;
    this._appearanceEnabled = true;
    this._bridge.setAppearanceEnabled(true);
    this._bridge.setSurfaceAppearanceFeatureFlags(createAppearanceFeatureFlags(this._causalState));
    this._bridge.setRefractionEnabled(true);
    this._bridge.setReflectionEnabled(true);
    this._bridge.setReflectionScenario("environment");
    this._captureState = "hero";
    this._requestedDebugMode = HeightfieldWaterDebugMode.Final;
    this._bridge.setDebugMode(HeightfieldWaterDebugMode.Final);
    this._bridge.setLightingPreset("reference");
    this._bridge.restoreAllContactProbes();
    this._bridge.resetHeroCamera();
    await this._bridge.setQuality(WaterQualityTier.High);
  }
}

export function createGrasslandsShowcaseAcceptanceApi(
  fixture: GrasslandsPcgFixture,
  bridge: GrasslandsShowcaseAcceptanceBridge
): GrasslandsShowcaseAcceptanceApi {
  return new GrasslandsShowcaseAcceptanceController(fixture, bridge).api;
}

function normalizeSharedReflectionSource(
  source: GrasslandsReflectionAcceptanceReadback["effectiveSource"]
): WaterShowcaseReflectionMetrics["effectiveSource"] {
  return source === "none" ? "sky" : source;
}

export function createGrasslandsSharedAcceptanceSnapshot(
  snapshot: Readonly<GrasslandsShowcaseAcceptanceSnapshot>
): Readonly<WaterShowcaseAcceptanceSnapshot> {
  const reflectionSourceReady =
    snapshot.reflection.requestedSource !== "none" && snapshot.reflection.effectiveSource !== "none";
  return Object.freeze({
    ready:
      snapshot.ready &&
      snapshot.strictMaterialReady &&
      snapshot.qualityTier === WaterQualityTier.High &&
      snapshot.opticsTier === "high" &&
      reflectionSourceReady,
    caseId: snapshot.caseId,
    runtime: snapshot.runtime,
    preset: snapshot.preset,
    runtimeError: snapshot.runtimeError,
    finite: snapshot.finite,
    qualityTier: "high",
    opticsTier: "high",
    resources: Object.freeze({
      bufferMemory: snapshot.resources.bufferMemory,
      textureMemory: snapshot.resources.textureMemory,
      totalMemory: snapshot.resources.totalMemory,
      liveRenderTargets: snapshot.resources.liveRenderTargets,
      liveReflectionCameras: snapshot.resources.liveReflectionCameras,
      meshUploadCount: snapshot.resources.meshUploadCount,
      perFrameMeshUpload: snapshot.resources.perFrameMeshUpload
    }),
    reflection: Object.freeze({
      requestedSource: normalizeSharedReflectionSource(snapshot.reflection.requestedSource),
      effectiveSource: normalizeSharedReflectionSource(snapshot.reflection.effectiveSource),
      ownerCount: snapshot.reflection.ownerCount,
      cameraCount: snapshot.reflection.cameraCount,
      renderTargetCount: snapshot.reflection.renderTargetCount,
      fallbackReason:
        snapshot.reflection.fallbackReason ?? (reflectionSourceReady ? null : "reflection-source-unavailable")
    }),
    refractionEnabled: snapshot.refractionEnabled,
    scene: Object.freeze({
      cameraMode: snapshot.scene.cameraMode,
      waterBodyType: snapshot.waterBodyType,
      activeSetCount: snapshot.runtimeSet.activeSetCount,
      chunkCount: snapshot.runtimeSet.chunkCount,
      drawCount: snapshot.runtimeSet.drawCount,
      activeWaveCount: snapshot.runtimeSet.activeWaveCount,
      waveStrength: snapshot.runtimeSet.waveStrength,
      gameplayQueryRegistered: snapshot.runtimeSet.gameplayQueryRegistered,
      connectedWaterBodyCount: snapshot.scene.connectedWaterBodyCount,
      terrainMaterialRegionCount: snapshot.scene.terrainMaterialRegionCount,
      activeRockCount: snapshot.scene.activeRockCount,
      scenicRockCount: snapshot.scene.scenicRockCount,
      proxyRockMeshCount: snapshot.scene.proxyRockMeshCount
    })
  });
}

export function createGrasslandsSharedShowcaseCaptureApi(
  applyCaptureState: (state: GrasslandsSharedCaptureState) => void,
  resetCaptureState: () => void
): WaterShowcaseCaptureApi {
  let currentState: GrasslandsSharedCaptureState = "hero";
  const setCaptureState = (state: string): void => {
    if (!GRASSLANDS_SHARED_CAPTURE_STATES.includes(state as GrasslandsSharedCaptureState)) {
      throw new RangeError(`Unknown shared Grasslands capture state "${String(state)}".`);
    }
    currentState = state as GrasslandsSharedCaptureState;
    applyCaptureState(currentState);
  };
  return Object.freeze({
    states: GRASSLANDS_SHARED_CAPTURE_STATES,
    get currentState() {
      return currentState;
    },
    setCaptureState,
    reset(): void {
      currentState = "hero";
      resetCaptureState();
    }
  });
}
