/**
 * Water PCG gallery entry for AI World Engine water generation.
 *
 * This file is the demo orchestration layer, not the river-domain implementation.
 * It owns Galacean engine setup, scene/camera/gui lifecycle, and the preview switch
 * between the ocean grid and the river prototype. River-specific work is delegated
 * to the river modules so validation, path sampling, mesh building, material
 * animation, water queries, and debug rendering can evolve toward engine-level
 * APIs without being coupled to dat.gui or gallery state.
 */
import { Camera, Color, DepthTextureMode, Script, Vector3, WebGLMode, WebGLEngine } from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import * as dat from "dat.gui";
import { WorldAxesView } from "./debug/WorldAxesView";
import { WaterPreviewMode } from "./examples/constants";
import { cloneOceanConfig, OceanConfig, waterPcgExamples } from "./examples";
import { RiverMaterialPreset, RiverPathMode, RiverQualityLevel } from "../authoring/river/RiverAuthoringEnums";
import {
  RIVER_LIMITS,
  RIVER_MATERIAL_PRESET_CONFIG,
  RIVER_QUALITY_PRESET
} from "../authoring/river/RiverAuthoringLimits";
import { decodeRiverSamplePoints } from "../compiler/river/RiverGeometryCompiler";
import type { RiverCompiledData, RiverReachArtifact, RiverSampleResult } from "../compiler/river/types";
import { RiverDirtyFlag, RIVER_PROFILE_SAMPLE_COUNT, RIVER_REBUILD_STRESS } from "./constants";
import { RiverDebugMode, RIVER_PREVIEW_STAGE_COLOR } from "./debug/constants";
import type { RiverDemoConfig as RiverConfig } from "./types";
import { getRiverConfigWarnings } from "../authoring/river/RiverSchemaDecoder";
import { RiverDebugController } from "./debug/RiverDebugController";
import { createRiverDemoDescriptor, normalizeRiverDemoConfig } from "./normalizeRiverDemoConfig";
import { OceanPreviewController } from "./examples/ocean-preview/OceanPreviewController";
import { OCEAN_PREVIEW_GUI_LIMITS } from "./examples/ocean-preview/constants";
import type { OceanPreviewMetrics, OceanPreviewStressResult } from "./examples/ocean-preview/types";
import { createWaterPreviewMaterial } from "./WaterPreviewMaterial";
import {
  RiverRuntimeController,
  RiverRuntimeSubmissionCancelledError,
  type RiverRuntimeActivation,
  type RiverRuntimeReach,
  type RiverRuntimeReachSource
} from "../runtime/river/RiverRuntimeController";
import { cloneCompiledRiverConfig } from "../compiler/river/RiverNetworkCompiler";
import { createRiverNetworkQueryResult, getPointAtRiverT } from "../runtime/river/RiverQueryService";
import { RiverCompileWorkerClient, RiverCompileWorkerError } from "../runtime/river/RiverCompileWorkerClient";
import type { RiverResource } from "../runtime/river/RiverResource";
import { RiverDiagnosticSeverity } from "../compiler/shared/diagnostics";
import { RiverBedController } from "./decoration/RiverBedController";
import { RiverRockController } from "./decoration/RiverRockController";
import { PoolSceneController } from "./decoration/PoolSceneController";
import { WaterDecorationStyle } from "./decoration/constants";
import { RiverCameraFeatureController } from "./RiverCameraFeatureController";
import { CameraWaterFeatureBroker } from "../runtime/optics/CameraWaterFeatureBroker";
import { RIVER_SURFACE_TEXTURE_SAMPLE_COUNT } from "../runtime/river/constants";
import { WaterQualityTier } from "../authoring/wave/enums/WaterQualityTier";
import {
  RiverDebugChannel,
  RiverDebugSession,
  RiverDebugStage,
  parseRiverDebugTarget,
  resolveRiverDebugSceneState,
  serializeRiverDebugTarget,
  type RiverDebugRuntimeMetrics,
  type RiverDebugSelection,
  type RiverDebugSessionContext,
  type RiverDebugSnapshot
} from "./debug/RiverDebugSession";
import { mountWaterDebugPanel } from "./debug/WaterDebugPanel";
import { RiverNetworkDebugController } from "./debug/RiverNetworkDebugController";
import { getWaterPcgCaseHref, resolveWaterPcgCase, syncWaterPcgNavigation } from "./navigation";
import { getWaterBodyCapabilities } from "../runtime/body/WaterBodyCapabilities";
import { WaterBodyRuntimeAdapter, type WaterBoundsXZ } from "../runtime/body/WaterBodyRuntime";
import { WaterP0DebugController } from "../runtime/body/WaterP0DebugApi";
import { WaterWorld } from "../runtime/body/WaterWorld";
import { RiverWaterSurfaceProvider } from "../runtime/river/RiverWaterSurfaceProvider";

const PREVIEW_MODE_OPTIONS = {
  Ocean: WaterPreviewMode.Ocean,
  River: WaterPreviewMode.River
} as const;

const RIVER_PATH_MODE_OPTIONS = {
  Polyline: RiverPathMode.Polyline,
  CatmullRom: RiverPathMode.CatmullRom,
  Bezier: RiverPathMode.Bezier
} as const;

const RIVER_QUALITY_OPTIONS = {
  Low: RiverQualityLevel.Low,
  Medium: RiverQualityLevel.Medium,
  High: RiverQualityLevel.High
} as const;

const WATER_WAVE_QUALITY_OPTIONS = {
  Low: WaterQualityTier.Low,
  Medium: WaterQualityTier.Medium,
  High: WaterQualityTier.High
} as const;

const RIVER_MATERIAL_OPTIONS = {
  ClearStream: RiverMaterialPreset.ClearStream,
  MuddyRiver: RiverMaterialPreset.MuddyRiver,
  MountainCreek: RiverMaterialPreset.MountainCreek
} as const;

type PreviewModeLabel = keyof typeof PREVIEW_MODE_OPTIONS;
type RiverPathModeLabel = keyof typeof RIVER_PATH_MODE_OPTIONS;
type RiverQualityLabel = keyof typeof RIVER_QUALITY_OPTIONS;
type WaterWaveQualityLabel = keyof typeof WATER_WAVE_QUALITY_OPTIONS;
type RiverMaterialLabel = keyof typeof RIVER_MATERIAL_OPTIONS;

interface GuiState {
  mode: PreviewModeLabel;
  pathMode: RiverPathModeLabel;
  quality: RiverQualityLabel;
  materialPreset: RiverMaterialLabel;
  macroDisplacement: boolean;
  microSurface: boolean;
}

function isWaterWaveQualityLabel(value: string): value is WaterWaveQualityLabel {
  return value in WATER_WAVE_QUALITY_OPTIONS;
}

interface RiverSegmentRuntime {
  config: RiverConfig;
  normalizedConfig: RiverConfig;
  sampleResult: RiverSampleResult;
  artifact: RiverReachArtifact;
  geometryBuildCount: number;
  networkDistanceOffset: number;
}

interface WaterPcgProfileMetrics {
  sampleCount: number;
  frameP95Ms: number;
  jsUpdateP95Ms: number;
  estimatedRiverDrawCalls: number;
  surfaceVertexCount: number;
  atlasPixelCount: number;
  surfaceTextureSamples: number;
  bufferMemory: number;
  textureMemory: number;
  totalMemory: number;
}

interface WaterPcgStressResult {
  readonly requestedIterations: number;
  readonly completedIterations: number;
  readonly resourceByteLength: number;
  readonly resourceHash: string;
  readonly initialTotalMemory: number;
  readonly finalTotalMemory: number;
}

function getRiverWaterBounds(data: RiverCompiledData): WaterBoundsXZ {
  const bounds = data.queryIndex.primitiveBounds.toTypedArray();
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < bounds.length; offset += 4) {
    minX = Math.min(minX, bounds[offset]);
    minZ = Math.min(minZ, bounds[offset + 1]);
    maxX = Math.max(maxX, bounds[offset + 2]);
    maxZ = Math.max(maxZ, bounds[offset + 3]);
  }
  return Number.isFinite(minX) ? { minX, minZ, maxX, maxZ } : { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
}

export interface WaterPcgDebugApi {
  readonly snapshot: RiverDebugSnapshot;
  select(selection: Partial<RiverDebugSelection>): void;
}

declare global {
  interface Window {
    waterPcgProfileMetrics?: WaterPcgProfileMetrics;
    waterPcgSetSurfaceTime?: (elapsedTime?: number) => void;
    waterPcgStressRebuild?: (iterations?: number) => Promise<WaterPcgStressResult>;
    waterPcgGetOceanMetrics?: () => OceanPreviewMetrics;
    waterPcgStressOcean?: (iterations?: number) => OceanPreviewStressResult;
    waterPcgDebug?: WaterPcgDebugApi;
  }
}

async function bootstrapWaterPcg(): Promise<void> {
  const riverCompileWorker = new RiverCompileWorkerClient();
  const startupExampleId = resolveWaterPcgCase(window.location).id;
  let activeExampleIndex = Math.max(
    0,
    waterPcgExamples.findIndex((example) => example.id === startupExampleId)
  );
  let oceanConfig: OceanConfig = cloneOceanConfig(waterPcgExamples[activeExampleIndex].ocean);
  const riverResourceSets = await Promise.all(
    waterPcgExamples.map((example) => riverCompileWorker.compile(example.riverDescriptor))
  );
  const riverCompiledDataSets: RiverCompiledData[] = riverResourceSets.map((resource) => resource.data);
  const riverConfigSets = riverCompiledDataSets.map((compiledData, exampleIndex) =>
    compiledData.reaches.map((reach) => ({
      ...cloneCompiledRiverConfig(reach.config),
      debug: { ...waterPcgExamples[exampleIndex].riverDebug }
    }))
  );
  let activeRiverCompiledData = riverCompiledDataSets[activeExampleIndex];
  let activeRiverResource = riverResourceSets[activeExampleIndex];
  let riverConfigs: RiverConfig[] = riverConfigSets[activeExampleIndex];

  const guiState: GuiState = {
    mode: "River",
    pathMode: "CatmullRom",
    quality: "Medium",
    materialPreset: "ClearStream",
    macroDisplacement: true,
    microSurface: true
  };

  let activeMode = waterPcgExamples[activeExampleIndex].initialMode;
  const startupQualityParameter = new URLSearchParams(window.location.search).get("quality");
  const startupQuality = Object.values(RiverQualityLevel).find((level) => level === startupQualityParameter);
  const startupWaterQuality = Object.values(WaterQualityTier).find((level) => level === startupQualityParameter);
  const startupModeParameter = new URLSearchParams(window.location.search).get("mode");
  const startupMode = Object.values(WaterPreviewMode).find((mode) => mode === startupModeParameter);
  if (startupMode) activeMode = startupMode;
  if (startupWaterQuality) oceanConfig.quality = startupWaterQuality;
  guiState.macroDisplacement = new URLSearchParams(window.location.search).get("macro") !== "0";
  guiState.microSurface = new URLSearchParams(window.location.search).get("micro") !== "0";
  const requestedSurfaceTimeParameter = new URLSearchParams(window.location.search).get("surfaceTime");
  const requestedSurfaceTime =
    requestedSurfaceTimeParameter === null ? Number.NaN : Number(requestedSurfaceTimeParameter);
  const startupSurfaceTime = Number.isFinite(requestedSurfaceTime) ? Math.max(0, requestedSurfaceTime) : undefined;
  const profilingEnabled = new URLSearchParams(window.location.search).get("profile") === "1";
  const requestedSubmissionBudgetMs = Number(new URLSearchParams(window.location.search).get("submissionBudgetMs"));
  const startupSubmissionBudgetMs =
    Number.isFinite(requestedSubmissionBudgetMs) && requestedSubmissionBudgetMs > 0
      ? requestedSubmissionBudgetMs
      : undefined;
  const exampleBar = document.getElementById("example-bar");

  if (!(exampleBar instanceof HTMLElement)) {
    throw new Error("Water PCG example bar is missing.");
  }
  const exampleBarElement: HTMLElement = exampleBar;

  function writeSurfaceMetrics(data: RiverCompiledData): void {
    const atlas = data.terrainInteraction.localMapAtlas;
    const materialLevel = data.reaches[0]?.config.quality.material.level ?? RiverQualityLevel.Low;
    const localMapChunkCount = data.chunks.filter((chunk) => chunk.localMapTileIndex !== undefined).length;
    exampleBarElement.dataset.surfaceVertexCount = String(
      data.chunks.reduce((count, chunk) => count + chunk.surfaceGeometry.positions.length, 0)
    );
    exampleBarElement.dataset.waveVariant =
      materialLevel === RiverQualityLevel.Low ? "flat-low" : "macro-displacement-ridged-micro";
    exampleBarElement.dataset.atlasPixelCount = String(data.stats.mapPixelCount);
    exampleBarElement.dataset.atlasTileCount = String(atlas?.tiles.length ?? 0);
    exampleBarElement.dataset.atlasByteLength = String(atlas?.pixels.length ?? 0);
    exampleBarElement.dataset.localMapChunkCount = String(localMapChunkCount);
    exampleBarElement.dataset.surfaceTextureSamples = String(
      materialLevel === RiverQualityLevel.Low
        ? RIVER_SURFACE_TEXTURE_SAMPLE_COUNT.low
        : localMapChunkCount > 0
          ? RIVER_SURFACE_TEXTURE_SAMPLE_COUNT.localMap
          : RIVER_SURFACE_TEXTURE_SAMPLE_COUNT.regular
    );
    exampleBarElement.dataset.surfaceMotionSeed = String(data.surfaceMotion.seed);
    exampleBarElement.dataset.maxSurfaceDisplacement = data.surfaceMotion.maxDisplacement.toFixed(3);
    exampleBarElement.dataset.dynamicQuery = "height-normal-verticalVelocity";
    exampleBarElement.dataset.disturbanceCount = String(data.disturbances.length);
  }

  function getPrimaryRiverConfig(): RiverConfig {
    return riverConfigs[0];
  }

  function updateAllRiverConfigs(callback: (config: RiverConfig) => void): void {
    for (let i = 0; i < riverConfigs.length; i++) {
      callback(riverConfigs[i]);
    }
  }

  function applyRiverPreset(preset: RiverMaterialPreset): void {
    updateAllRiverConfigs((config) => {
      const materialPreset = RIVER_MATERIAL_PRESET_CONFIG[preset];
      config.material.preset = preset;
      config.material.baseColor = materialPreset.baseColor;
      config.material.foamColor = materialPreset.foamColor;
      config.material.foamIntensity = materialPreset.foamIntensity;
      config.material.clarity = materialPreset.clarity;

      if (preset === RiverMaterialPreset.MountainCreek) {
        config.flow.speed = Math.max(config.flow.speed, 1.9);
      }
    });
  }

  function applyQualityToConfigs(configs: readonly RiverConfig[], level: RiverQualityLevel): void {
    for (const config of configs) {
      const preset = RIVER_QUALITY_PRESET[level];
      config.path.segmentLength = preset.segmentLength;
      config.quality.geometry = {
        level,
        maxSegmentCount: preset.maxSegmentCount,
        maxChordError: preset.maxChordError
      };
      config.quality.material.level = level;
      config.quality.maps.level = level === RiverQualityLevel.Low ? RiverQualityLevel.Low : level;
      config.quality.query.level = level;
    }
  }

  function applyQuality(level: RiverQualityLevel): void {
    applyQualityToConfigs(riverConfigs, level);
  }

  function syncGuiStateFromRiverConfig(): void {
    const riverConfig = getPrimaryRiverConfig();
    guiState.pathMode =
      riverConfig.path.mode === RiverPathMode.CatmullRom
        ? "CatmullRom"
        : riverConfig.path.mode === RiverPathMode.Bezier
          ? "Bezier"
          : "Polyline";
    guiState.quality =
      riverConfig.quality.material.level === RiverQualityLevel.High
        ? "High"
        : riverConfig.quality.material.level === RiverQualityLevel.Low
          ? "Low"
          : "Medium";
    guiState.materialPreset =
      riverConfig.material.preset === RiverMaterialPreset.MountainCreek
        ? "MountainCreek"
        : riverConfig.material.preset === RiverMaterialPreset.MuddyRiver
          ? "MuddyRiver"
          : "ClearStream";
  }

  const engineConfiguration = {
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: {
      webGLMode: WebGLMode.WebGL2
    }
  } as unknown as Parameters<typeof WebGLEngine.create>[0];

  if (startupQuality) {
    for (const configs of riverConfigSets) applyQualityToConfigs(configs, startupQuality);
    guiState.quality =
      startupQuality === RiverQualityLevel.Low ? "Low" : startupQuality === RiverQualityLevel.High ? "High" : "Medium";
    const qualityResources = await Promise.all(
      waterPcgExamples.map((example, exampleIndex) =>
        riverCompileWorker.compile(createRiverDemoDescriptor(example.riverDescriptor, riverConfigSets[exampleIndex]))
      )
    );
    for (let index = 0; index < qualityResources.length; index++) {
      riverResourceSets[index].dispose();
      riverResourceSets[index] = qualityResources[index];
      riverCompiledDataSets[index] = qualityResources[index].data;
    }
    activeRiverResource = riverResourceSets[activeExampleIndex];
    activeRiverCompiledData = riverCompiledDataSets[activeExampleIndex];
  }

  const engine = await WebGLEngine.create(engineConfiguration);
  engine.canvas.resizeByClientSize();
  window.addEventListener("resize", () => engine.canvas.resizeByClientSize());

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.05, 0.08, 0.08, 1);
  const rootEntity = scene.createRootEntity("water-pcg-root");
  const worldAxesView = new WorldAxesView(engine, rootEntity);

  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 300;
  const control = cameraEntity.addComponent(OrbitControl);
  const cameraWaterFeatureBroker = new CameraWaterFeatureBroker(camera);
  cameraWaterFeatureBroker.setViewportSize(engine.canvas.width, engine.canvas.height);
  const riverCameraFeatureController = new RiverCameraFeatureController(camera, cameraWaterFeatureBroker);

  const oceanPreview = new OceanPreviewController(engine, rootEntity, oceanConfig);
  const oceanGroup = oceanPreview.root;

  const riverGroup = rootEntity.createChild("river-preview");
  const riverSegmentsRoot = riverGroup.createChild("river-segments");
  const riverRuntimeController = new RiverRuntimeController(engine, riverSegmentsRoot);
  const riverSurfaceProvider = new RiverWaterSurfaceProvider(riverRuntimeController);
  const waterWorld = new WaterWorld();
  const waterP0Debug = new WaterP0DebugController(waterWorld);
  window.waterPcgP0 = waterP0Debug;
  let surfaceTimeOverride = startupSurfaceTime;
  oceanPreview.setSurfaceTimeOverride(surfaceTimeOverride);
  riverRuntimeController.setSurfaceFeatureFlags(guiState.macroDisplacement, guiState.microSurface);
  riverRuntimeController.setSurfaceTimeOverride(surfaceTimeOverride);
  const riverDebugController = new RiverDebugController(engine);
  const riverBedController = new RiverBedController(engine, riverGroup);
  const riverRockController = new RiverRockController(engine, riverGroup);
  const poolSceneController = new PoolSceneController(engine, riverGroup);
  const riverMeshPreviewMaterial = createWaterPreviewMaterial(engine, RIVER_PREVIEW_STAGE_COLOR.meshSurface, 0.42);
  const riverJunctionPreviewMaterial = createWaterPreviewMaterial(engine, "#ff70d2", 0.5);
  const riverBankPreviewMaterial = createWaterPreviewMaterial(engine, RIVER_PREVIEW_STAGE_COLOR.meshBankFoam, 0.24);
  const riverNetworkDebugController = new RiverNetworkDebugController(engine, riverGroup);
  let riverRuntimes: RiverSegmentRuntime[] = [];
  const riverDemoRuntimeSets = new Map<string, RiverSegmentRuntime[]>();
  let pendingRuntimeStatsRefresh = false;
  let topologyRevision = 0;
  let riverMeshUploadCount = 0;
  let riverWorldBody: WaterBodyRuntimeAdapter | undefined;
  let oceanWorldBody: WaterBodyRuntimeAdapter | undefined;

  const refreshWaterWorld = (): void => {
    waterWorld.unregister("river-network");
    waterWorld.unregister("ocean-preview");
    const riverTriangleCount = activeRiverCompiledData.chunks.reduce(
      (count, chunk) => count + chunk.surfaceGeometry.indices.length / 3,
      0
    );
    riverWorldBody = new WaterBodyRuntimeAdapter({
      id: "river-network",
      type: "river",
      capabilities: getWaterBodyCapabilities("river"),
      surface: riverSurfaceProvider,
      bounds: getRiverWaterBounds(activeRiverCompiledData),
      priority: 10,
      enabled: activeMode === WaterPreviewMode.River,
      metrics: {
        meshUploadCount: riverMeshUploadCount,
        drawCount: activeRiverCompiledData.chunks.length,
        triangleCount: riverTriangleCount,
        resourceBytes: activeRiverResource.byteLength
      }
    });
    const oceanMetrics = oceanPreview.metrics;
    const oceanExtent = oceanPreview.surfaceProvider.horizontalExtent;
    oceanWorldBody = new WaterBodyRuntimeAdapter({
      id: "ocean-preview",
      type: "ocean",
      capabilities: getWaterBodyCapabilities("ocean"),
      surface: oceanPreview.surfaceProvider,
      bounds: { minX: -oceanExtent, minZ: -oceanExtent, maxX: oceanExtent, maxZ: oceanExtent },
      priority: 0,
      enabled: activeMode === WaterPreviewMode.Ocean,
      metrics: {
        meshUploadCount: oceanMetrics.meshUploadCount,
        drawCount: 1,
        triangleCount: Math.max(0, oceanConfig.resolution * oceanConfig.resolution * 2),
        resourceBytes: 0
      }
    });
    waterWorld.register(riverWorldBody);
    waterWorld.register(oceanWorldBody);
    exampleBarElement.dataset.waterCapabilityMatrix = JSON.stringify(waterP0Debug.capabilityMatrix);
    exampleBarElement.dataset.waterWorldBodyCount = String(waterWorld.metrics.registeredBodyCount);
  };

  const readDebugRuntimeMetrics = (): RiverDebugRuntimeMetrics => ({
    resourceByteLength: activeRiverResource.byteLength,
    drawCalls: Number(exampleBarElement.dataset.estimatedRiverDrawCalls ?? 0),
    bufferMemory: Number(exampleBarElement.dataset.bufferMemory ?? 0),
    textureMemory: Number(exampleBarElement.dataset.textureMemory ?? 0),
    totalMemory: Number(exampleBarElement.dataset.totalMemory ?? 0),
    submissionYieldCount: Number(exampleBarElement.dataset.submissionYieldCount ?? 0),
    submissionMaxSliceMs: Number(exampleBarElement.dataset.submissionMaxSliceMs ?? 0),
    workerDeserializeMs: Number(exampleBarElement.dataset.workerDeserializeMs ?? riverCompileWorker.lastDeserializeMs),
    queryBaseFlowX: Number(exampleBarElement.dataset.queryBaseFlowX ?? 0),
    queryBaseFlowZ: Number(exampleBarElement.dataset.queryBaseFlowZ ?? 0),
    queryLocalFlowX: Number(exampleBarElement.dataset.queryLocalFlowX ?? 0),
    queryLocalFlowZ: Number(exampleBarElement.dataset.queryLocalFlowZ ?? 0),
    queryFinalFlowX: Number(exampleBarElement.dataset.queryFinalFlowX ?? 0),
    queryFinalFlowZ: Number(exampleBarElement.dataset.queryFinalFlowZ ?? 0),
    queryLocalFlowWeight: Number(exampleBarElement.dataset.queryLocalFlowWeight ?? 0)
  });
  const createDebugContext = (): RiverDebugSessionContext => ({
    exampleLabel: waterPcgExamples[activeExampleIndex].label,
    resourceHash: activeRiverResource.metadata.compiledHash,
    data: activeRiverCompiledData,
    quality: getPrimaryRiverConfig().quality.material.level,
    metrics: readDebugRuntimeMetrics()
  });
  const debugParameters = new URLSearchParams(window.location.search);
  const debugStageParameter = debugParameters.get("debugStage");
  const debugChannelParameter = debugParameters.get("debugChannel");
  const debugTargetParameter = debugParameters.get("debugTarget");
  const debugQueryParameterValue = debugParameters.get("debugQueryT");
  const debugQueryParameter = debugQueryParameterValue === null ? Number.NaN : Number(debugQueryParameterValue);
  const initialDebugStage = Object.values(RiverDebugStage).find((stage) => stage === debugStageParameter);
  const initialDebugChannel = Object.values(RiverDebugChannel).find((channel) => channel === debugChannelParameter);
  const debugSession = new RiverDebugSession(createDebugContext(), {
    stage: initialDebugStage,
    channel: initialDebugChannel,
    target: parseRiverDebugTarget(debugTargetParameter),
    queryT: Number.isFinite(debugQueryParameter)
      ? debugQueryParameter
      : waterPcgExamples[activeExampleIndex].riverDebug.queryT
  });
  const waterDebugPanel = mountWaterDebugPanel(document.body, debugSession);
  let latestDebugSnapshot = debugSession.snapshot;
  const stopDebugSnapshotTracking = debugSession.subscribe((snapshot) => {
    latestDebugSnapshot = snapshot;
  });

  const updateRiverCameraFeatures = (): void => {
    cameraWaterFeatureBroker.setViewportSize(engine.canvas.width, engine.canvas.height);
    riverCameraFeatureController.apply(
      activeMode === WaterPreviewMode.River,
      getPrimaryRiverConfig().quality.material.level
    );
    exampleBarElement.dataset.riverDepthTextureRequested = String(riverCameraFeatureController.depthTextureRequested);
    exampleBarElement.dataset.riverOpaqueTextureRequested = String(riverCameraFeatureController.opaqueTextureRequested);
    exampleBarElement.dataset.cameraDepthTextureMode =
      camera.depthTextureMode === DepthTextureMode.PrePass ? "prepass" : "none";
    const metrics = cameraWaterFeatureBroker.metrics;
    exampleBarElement.dataset.cameraFeatureConsumerCount = String(metrics.activeConsumerCount);
    exampleBarElement.dataset.cameraCopyDepthPassCount = String(metrics.depthCopyPassCount);
    exampleBarElement.dataset.cameraCopyColorPassCount = String(metrics.colorCopyPassCount);
    exampleBarElement.dataset.cameraFeatureRenderTargetBytes = String(metrics.estimatedRenderTargetBytes);
  };

  const writeOceanMetrics = (): void => {
    const metrics = oceanPreview.metrics;
    exampleBarElement.dataset.oceanWaveModel = metrics.waveModel;
    exampleBarElement.dataset.oceanQuality = metrics.quality;
    exampleBarElement.dataset.oceanActiveWaveCount = String(metrics.activeWaveCount);
    exampleBarElement.dataset.oceanShaderWaveCount = String(metrics.shaderWaveCount);
    exampleBarElement.dataset.oceanSourceHash = metrics.sourceHash;
    exampleBarElement.dataset.oceanMeshUploadCount = String(metrics.meshUploadCount);
    exampleBarElement.dataset.oceanPerFrameMeshUpload = String(metrics.perFrameMeshUpload);
    exampleBarElement.dataset.oceanActiveMeshCount = String(metrics.activeMeshCount);
    exampleBarElement.dataset.oceanActiveMaterialCount = String(metrics.activeMaterialCount);
    exampleBarElement.dataset.oceanFrameCount = String(metrics.frameCount);
  };
  const updateOceanMaterial = (): void => {
    oceanPreview.updateMaterial();
    writeOceanMetrics();
  };
  const createRiverSegmentRuntime = (
    config: RiverConfig,
    reachIndex: number,
    runtimeReach: RiverRuntimeReach
  ): RiverSegmentRuntime => {
    const normalizedConfig = normalizeRiverDemoConfig(config);
    const artifact = runtimeReach.artifact;
    const sampleResult: RiverSampleResult = {
      points: decodeRiverSamplePoints(artifact.samples),
      totalLength: artifact.totalLength,
      diagnostics: artifact.diagnostics.map((diagnostic) => ({ ...diagnostic }))
    };

    return {
      config,
      normalizedConfig,
      sampleResult,
      artifact,
      geometryBuildCount: 0,
      networkDistanceOffset: activeRiverCompiledData.reaches[reachIndex]?.networkDistanceOffset ?? 0
    };
  };
  const createRuntimeReachSources = (
    compiledData: RiverCompiledData = activeRiverCompiledData,
    configs: readonly RiverConfig[] = riverConfigs
  ): RiverRuntimeReachSource[] =>
    configs.map((config, reachIndex) => {
      const normalizedConfig = normalizeRiverDemoConfig(config);
      return {
        config: normalizedConfig,
        artifact: compiledData.reaches[reachIndex].artifact
      };
    });
  const writeDecorationMetrics = (): void => {
    exampleBarElement.dataset.rockCount = String(riverRockController.root.isActive ? riverRockController.rockCount : 0);
    exampleBarElement.dataset.poolFixtureCount = String(
      poolSceneController.root.isActive ? poolSceneController.fixtureCount : 0
    );
  };
  const rebuildWaterDecorations = (data: RiverCompiledData): void => {
    const decorationStyle = waterPcgExamples[activeExampleIndex].decorationStyle;
    const isPool = decorationStyle === WaterDecorationStyle.Pool;
    riverBedController.rebuild(data, decorationStyle);
    riverRockController.root.isActive = !isPool;
    poolSceneController.root.isActive = isPool;
    if (isPool) {
      poolSceneController.rebuild(data);
    } else {
      const queryService = riverRuntimeController.activeQueryService;
      if (queryService) riverRockController.rebuild(data, queryService);
    }
    writeDecorationMetrics();
  };
  const applyDecorationVisibility = (bedVisible: boolean, decorationsVisible: boolean): void => {
    const decorationStyle = waterPcgExamples[activeExampleIndex].decorationStyle;
    riverBedController.root.isActive = bedVisible;
    riverRockController.root.isActive =
      decorationsVisible &&
      (decorationStyle === WaterDecorationStyle.River || decorationStyle === WaterDecorationStyle.HeightfieldRiver);
    poolSceneController.root.isActive = decorationsVisible && decorationStyle === WaterDecorationStyle.Pool;
    writeDecorationMetrics();
  };
  const rebuildRiverSegmentRuntimes = (): boolean => {
    const exampleId = waterPcgExamples[activeExampleIndex].id;
    const activation = riverRuntimeController.activate(exampleId, activeRiverResource, createRuntimeReachSources());
    if (activation.created) riverMeshUploadCount += activation.submittedChunkCount;
    exampleBarElement.dataset.riverMeshUploadCount = String(riverMeshUploadCount);
    riverDebugController.activate(exampleId, activation.reaches);
    rebuildWaterDecorations(activeRiverCompiledData);
    refreshWaterWorld();
    const cached = riverDemoRuntimeSets.get(exampleId);
    if (cached) {
      riverRuntimes = cached;
      return false;
    }
    riverRuntimes = riverConfigs.map((config, index) =>
      createRiverSegmentRuntime(config, index, activation.reaches[index])
    );
    riverDemoRuntimeSets.set(exampleId, riverRuntimes);
    return true;
  };
  const applyRiverPreviewStage = (runtime: RiverSegmentRuntime, reachIndex: number): void => {
    const sceneState = resolveRiverDebugSceneState(
      latestDebugSnapshot.selection,
      runtime.normalizedConfig.quality.material.level,
      Boolean(activeRiverCompiledData.terrainInteraction.localMapAtlas)
    );
    const isLow = runtime.normalizedConfig.quality.material.level === RiverQualityLevel.Low;
    riverRuntimeController.applyPresentation(reachIndex, {
      surfaceVisible: sceneState.surfaceVisible,
      foamVisible: sceneState.foamVisible && !isLow && Boolean(runtime.artifact.bankFoamGeometry),
      surfaceMaterial: sceneState.rawGeometryMaterial ? riverMeshPreviewMaterial : undefined,
      junctionSurfaceMaterial: sceneState.rawGeometryMaterial ? riverJunctionPreviewMaterial : undefined,
      foamMaterial: sceneState.rawGeometryMaterial && !isLow ? riverBankPreviewMaterial : undefined
    });
  };
  const hasDirty = (flags: RiverDirtyFlag, flag: RiverDirtyFlag): boolean => (flags & flag) !== 0;
  const networkQueryResult = createRiverNetworkQueryResult();
  let compileRequestRevision = 0;
  const recompileActiveNetwork = async (): Promise<boolean> => {
    const requestRevision = ++compileRequestRevision;
    const requestExampleIndex = activeExampleIndex;
    const descriptor = createRiverDemoDescriptor(waterPcgExamples[activeExampleIndex].riverDescriptor, riverConfigs);
    debugSession.setStatus("compiling", `compiling ${descriptor.id}`);
    let nextResource: RiverResource;
    try {
      nextResource = await riverCompileWorker.compile(descriptor);
    } catch (error) {
      exampleBarElement.dataset.runtimeError =
        error instanceof RiverCompileWorkerError ? error.message : "River Worker compilation failed.";
      debugSession.setStatus("error", exampleBarElement.dataset.runtimeError);
      return false;
    }
    if (requestRevision !== compileRequestRevision || requestExampleIndex !== activeExampleIndex) {
      nextResource.dispose();
      return false;
    }

    const exampleId = waterPcgExamples[activeExampleIndex].id;
    const previousResource = activeRiverResource;
    const nextData = nextResource.data;
    const currentDebug = riverConfigs[0]
      ? { ...riverConfigs[0].debug }
      : { ...waterPcgExamples[activeExampleIndex].riverDebug };
    const nextConfigs = nextData.reaches.map((reach) => ({
      ...cloneCompiledRiverConfig(reach.config),
      debug: { ...currentDebug }
    }));
    let activation: RiverRuntimeActivation;
    try {
      activation = await riverRuntimeController.replaceActiveIncremental(
        exampleId,
        nextResource,
        createRuntimeReachSources(nextData, nextConfigs),
        {
          frameBudgetMs: startupSubmissionBudgetMs,
          shouldCancel: () => requestRevision !== compileRequestRevision || requestExampleIndex !== activeExampleIndex
        }
      );
    } catch (error) {
      nextResource.dispose();
      if (error instanceof RiverRuntimeSubmissionCancelledError) return false;
      exampleBarElement.dataset.runtimeError =
        error instanceof Error ? error.message : "River Runtime submission failed.";
      debugSession.setStatus("error", exampleBarElement.dataset.runtimeError);
      return false;
    }
    riverDebugController.remove(exampleId);
    activeRiverResource = nextResource;
    riverResourceSets[activeExampleIndex] = nextResource;
    activeRiverCompiledData = nextData;
    riverCompiledDataSets[activeExampleIndex] = nextData;
    riverConfigs = nextConfigs;
    riverConfigSets[activeExampleIndex] = riverConfigs;
    previousResource.dispose();
    delete exampleBarElement.dataset.runtimeError;
    riverDebugController.activate(exampleId, activation.reaches);
    riverRuntimes = riverConfigs.map((config, index) =>
      createRiverSegmentRuntime(config, index, activation.reaches[index])
    );
    riverDemoRuntimeSets.set(exampleId, riverRuntimes);
    rebuildWaterDecorations(nextData);
    exampleBarElement.dataset.riverBedChunkCount = String(riverBedController.chunkCount);
    topologyRevision++;
    exampleBarElement.dataset.topologyRevision = String(topologyRevision);
    exampleBarElement.dataset.compiledNodeCount = String(nextData.stats.nodeCount);
    exampleBarElement.dataset.compiledReachCount = String(nextData.stats.reachCount);
    exampleBarElement.dataset.compiledJunctionCount = String(nextData.junctions.length);
    exampleBarElement.dataset.compiledChunkCount = String(nextData.chunks.length);
    exampleBarElement.dataset.queryPrimitiveCount = String(nextData.queryIndex.primitiveCount);
    exampleBarElement.dataset.queryCellCount = String(nextData.queryIndex.cellCount);
    exampleBarElement.dataset.resourceAssetVersion = String(nextResource.metadata.assetVersion);
    exampleBarElement.dataset.resourceHash = nextResource.metadata.compiledHash;
    exampleBarElement.dataset.resourceByteLength = String(nextResource.byteLength);
    exampleBarElement.dataset.submissionYieldCount = String(activation.yieldCount);
    exampleBarElement.dataset.submissionMaxSliceMs = activation.maxSliceMs.toFixed(3);
    riverMeshUploadCount += activation.submittedChunkCount;
    exampleBarElement.dataset.riverMeshUploadCount = String(riverMeshUploadCount);
    exampleBarElement.dataset.workerDeserializeMs = riverCompileWorker.lastDeserializeMs.toFixed(3);
    exampleBarElement.dataset.terrainCorridorCount = String(nextData.terrainInteraction.reachCorridors.length);
    exampleBarElement.dataset.localMapRegionCount = String(nextData.stats.localMapRegionCount);
    exampleBarElement.dataset.waterSlopeAdjustmentCount = String(nextData.stats.waterSlopeAdjustmentCount);
    writeSurfaceMetrics(nextData);
    refreshWaterWorld();
    debugSession.updateContext(createDebugContext());
    debugSession.setStatus("ready", "runtime ready");
    return true;
  };
  const applyRiverChangesAsync = async (requestedFlags: RiverDirtyFlag): Promise<void> => {
    let flags = requestedFlags;
    let networkRecompiled = false;
    if (hasDirty(flags, RiverDirtyFlag.Topology) || hasDirty(flags, RiverDirtyFlag.Geometry)) {
      if (!(await recompileActiveNetwork())) return;
      networkRecompiled = true;
      flags = RiverDirtyFlag.Material | RiverDirtyFlag.Query | RiverDirtyFlag.Debug;
    }
    const warnings = activeRiverCompiledData.diagnostics
      .filter((diagnostic) => diagnostic.severity !== RiverDiagnosticSeverity.Info)
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`);
    const geometryDirty = hasDirty(flags, RiverDirtyFlag.Geometry);
    const materialDirty = hasDirty(flags, RiverDirtyFlag.Material);

    for (const runtime of riverRuntimes) {
      runtime.normalizedConfig = normalizeRiverDemoConfig(runtime.config);
    }

    for (let i = 0; i < riverRuntimes.length; i++) {
      const runtime = riverRuntimes[i];
      riverRuntimeController.updateReach(i, runtime.normalizedConfig, runtime.artifact, materialDirty);
      applyRiverPreviewStage(runtime, i);
      const target = latestDebugSnapshot.selection.target;
      const overlayVisible = target.kind === "network" || (target.kind === "reach" && target.id === runtime.config.id);
      const sceneState = resolveRiverDebugSceneState(
        latestDebugSnapshot.selection,
        runtime.normalizedConfig.quality.material.level,
        Boolean(activeRiverCompiledData.terrainInteraction.localMapAtlas)
      );
      riverDebugController.update(
        i,
        runtime.normalizedConfig,
        overlayVisible ? sceneState.overlayMode : RiverDebugMode.Off,
        latestDebugSnapshot.selection.queryT,
        runtime.sampleResult.points,
        runtime.artifact.querySource,
        {
          geometry: geometryDirty || hasDirty(flags, RiverDirtyFlag.Debug),
          query: geometryDirty || hasDirty(flags, RiverDirtyFlag.Query)
        }
      );

      if (i === 0) {
        exampleBarElement.dataset.materialQuality = runtime.normalizedConfig.quality.material.level;
        exampleBarElement.dataset.sampleCount = String(runtime.sampleResult.points.length);
        exampleBarElement.dataset.geometryBuildCount = String(runtime.geometryBuildCount);
        exampleBarElement.dataset.waterDrawCallsPerChunk = "1";
      }

      warnings.push(
        ...getRiverConfigWarnings(runtime.normalizedConfig).map((warning) => `${runtime.config.id}: ${warning}`),
        ...runtime.sampleResult.diagnostics.map(
          (diagnostic) => `${runtime.config.id}: ${diagnostic.code}: ${diagnostic.message}`
        )
      );
    }

    const sceneState = resolveRiverDebugSceneState(
      latestDebugSnapshot.selection,
      getPrimaryRiverConfig().quality.material.level,
      Boolean(activeRiverCompiledData.terrainInteraction.localMapAtlas)
    );
    const runtimeDebugTarget =
      latestDebugSnapshot.selection.stage === RiverDebugStage.Final
        ? ({ kind: "network" } as const)
        : latestDebugSnapshot.selection.stage === RiverDebugStage.Geometry &&
            latestDebugSnapshot.selection.channel === RiverDebugChannel.Junctions &&
            latestDebugSnapshot.selection.target.kind === "network"
          ? ({ kind: "junctions" } as const)
          : latestDebugSnapshot.selection.target;
    riverRuntimeController.setDebugTarget(runtimeDebugTarget);
    riverRuntimeController.setSurfaceDebugMode(sceneState.surfaceDebugMode);
    riverNetworkDebugController.update(
      engine,
      activeRiverCompiledData,
      activeRiverResource.metadata.compiledHash,
      sceneState.networkOverlay,
      latestDebugSnapshot.selection.target
    );
    applyDecorationVisibility(sceneState.bedVisible, sceneState.decorationsVisible);

    const selectedReachIndex =
      latestDebugSnapshot.selection.target.kind === "reach"
        ? riverRuntimes.findIndex((runtime) => runtime.config.id === latestDebugSnapshot.selection.target.id)
        : 0;
    const primaryRuntime = riverRuntimes[Math.max(0, selectedReachIndex)];
    const queryService = riverRuntimeController.activeQueryService;
    if (primaryRuntime && queryService) {
      const queryPosition = getPointAtRiverT(primaryRuntime.sampleResult.points, latestDebugSnapshot.selection.queryT);
      if (surfaceTimeOverride === undefined) queryService.sampleSurface(queryPosition, networkQueryResult);
      else queryService.sampleSurfaceAtTime(queryPosition, surfaceTimeOverride, networkQueryResult);
      exampleBarElement.dataset.querySourceKind = networkQueryResult.sourceKind ?? "none";
      exampleBarElement.dataset.queryBaseFlowX = String(networkQueryResult.baseFlowVector.x);
      exampleBarElement.dataset.queryBaseFlowZ = String(networkQueryResult.baseFlowVector.z);
      exampleBarElement.dataset.queryLocalFlowX = String(networkQueryResult.localFlowVector.x);
      exampleBarElement.dataset.queryLocalFlowZ = String(networkQueryResult.localFlowVector.z);
      exampleBarElement.dataset.queryFinalFlowX = String(networkQueryResult.flowVector.x);
      exampleBarElement.dataset.queryFinalFlowZ = String(networkQueryResult.flowVector.z);
      exampleBarElement.dataset.queryLocalFlowWeight = String(networkQueryResult.localFlowWeight);
      exampleBarElement.dataset.diagnosticCount = String(warnings.length);
    }
    pendingRuntimeStatsRefresh = true;
    if (networkRecompiled) rebuildGui();
  };
  const applyRiverChanges = (requestedFlags: RiverDirtyFlag): void => {
    void applyRiverChangesAsync(requestedFlags).catch((error: unknown) => {
      exampleBarElement.dataset.runtimeError = error instanceof Error ? error.message : "River update failed.";
      debugSession.setStatus("error", exampleBarElement.dataset.runtimeError);
    });
  };
  let lastDebugSelectionToken = "";
  const stopDebugSceneSubscription = debugSession.subscribe((snapshot) => {
    const selectionToken = `${snapshot.selection.stage}:${snapshot.selection.channel}:${serializeRiverDebugTarget(snapshot.selection.target)}:${snapshot.selection.queryT.toFixed(3)}`;
    if (selectionToken === lastDebugSelectionToken) return;
    lastDebugSelectionToken = selectionToken;
    const url = new URL(window.location.href);
    url.searchParams.set("debugStage", snapshot.selection.stage);
    url.searchParams.set("debugChannel", snapshot.selection.channel);
    url.searchParams.set("debugTarget", serializeRiverDebugTarget(snapshot.selection.target));
    url.searchParams.set("debugQueryT", snapshot.selection.queryT.toFixed(2));
    window.history.replaceState(null, "", url);
    applyRiverChanges(RiverDirtyFlag.Debug | RiverDirtyFlag.Query);
  });
  const setPreviewMode = (mode: WaterPreviewMode): void => {
    activeMode = mode;
    guiState.mode = mode === WaterPreviewMode.Ocean ? "Ocean" : "River";
    oceanGroup.isActive = mode === WaterPreviewMode.Ocean;
    riverGroup.isActive = mode === WaterPreviewMode.River;
    if (riverWorldBody) riverWorldBody.enabled = mode === WaterPreviewMode.River;
    if (oceanWorldBody) oceanWorldBody.enabled = mode === WaterPreviewMode.Ocean;
    const view = waterPcgExamples[activeExampleIndex].view;
    const backgroundColor = view.backgroundColor;
    worldAxesView.setVisible(
      mode === WaterPreviewMode.River &&
        view.showWorldAxes !== false &&
        waterPcgExamples[activeExampleIndex].decorationStyle !== WaterDecorationStyle.Pool
    );
    scene.background.solidColor =
      mode === WaterPreviewMode.Ocean ? new Color(0.06, 0.1, 0.12, 1) : new Color(...backgroundColor);
    updateRiverCameraFeatures();
    writeOceanMetrics();
    debugSession.setStatus(
      mode === WaterPreviewMode.Ocean ? "ocean" : "ready",
      mode === WaterPreviewMode.Ocean ? "River debug paused in Ocean preview" : "runtime ready"
    );

    if (mode === WaterPreviewMode.Ocean) {
      control.target.set(0, 0, 0);
      cameraEntity.transform.setPosition(0, 34, 54);
      cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
    } else {
      control.target.set(view.cameraTarget[0], view.cameraTarget[1], view.cameraTarget[2]);
      cameraEntity.transform.setPosition(view.cameraPosition[0], view.cameraPosition[1], view.cameraPosition[2]);
      cameraEntity.transform.lookAt(new Vector3(view.cameraTarget[0], view.cameraTarget[1], view.cameraTarget[2]));
    }
  };
  function renderExampleTabs(): void {
    exampleBarElement.dataset.activeExample = waterPcgExamples[activeExampleIndex].id;
    exampleBarElement.dataset.segmentCount = String(riverConfigs.length);
    exampleBarElement.dataset.compiledNetworkId = activeRiverCompiledData.sourceId;
    exampleBarElement.dataset.compiledNodeCount = String(activeRiverCompiledData.stats.nodeCount);
    exampleBarElement.dataset.compiledReachCount = String(activeRiverCompiledData.stats.reachCount);
    exampleBarElement.dataset.compiledJunctionCount = String(activeRiverCompiledData.junctions.length);
    exampleBarElement.dataset.compiledChunkCount = String(activeRiverCompiledData.chunks.length);
    exampleBarElement.dataset.queryPrimitiveCount = String(activeRiverCompiledData.queryIndex.primitiveCount);
    exampleBarElement.dataset.queryCellCount = String(activeRiverCompiledData.queryIndex.cellCount);
    exampleBarElement.dataset.resourceAssetVersion = String(activeRiverResource.metadata.assetVersion);
    exampleBarElement.dataset.resourceHash = activeRiverResource.metadata.compiledHash;
    exampleBarElement.dataset.resourceByteLength = String(activeRiverResource.byteLength);
    exampleBarElement.dataset.topologyRevision = String(topologyRevision);
    exampleBarElement.dataset.riverMeshUploadCount = String(riverMeshUploadCount);
    exampleBarElement.dataset.workerCompile = "true";
    exampleBarElement.dataset.workerDeserializeMs = riverCompileWorker.lastDeserializeMs.toFixed(3);
    exampleBarElement.dataset.submissionBudgetMs = String(startupSubmissionBudgetMs ?? 4);
    exampleBarElement.dataset.terrainCorridorCount = String(
      activeRiverCompiledData.terrainInteraction.reachCorridors.length
    );
    exampleBarElement.dataset.localMapRegionCount = String(activeRiverCompiledData.stats.localMapRegionCount);
    exampleBarElement.dataset.waterSlopeAdjustmentCount = String(
      activeRiverCompiledData.stats.waterSlopeAdjustmentCount
    );
    exampleBarElement.dataset.riverBedChunkCount = String(riverBedController.chunkCount);
    writeDecorationMetrics();
    writeSurfaceMetrics(activeRiverCompiledData);
    debugSession.updateContext(createDebugContext());
    syncWaterPcgNavigation(exampleBarElement, waterPcgExamples[activeExampleIndex].id);
  }
  function loadExample(index: number): void {
    compileRequestRevision++;
    activeExampleIndex = index;
    document.title = `Water PCG · ${waterPcgExamples[activeExampleIndex].label}`;
    oceanConfig = cloneOceanConfig(waterPcgExamples[activeExampleIndex].ocean);
    if (startupWaterQuality) oceanConfig.quality = startupWaterQuality;
    oceanPreview.setConfig(oceanConfig);
    refreshWaterWorld();
    activeRiverCompiledData = riverCompiledDataSets[activeExampleIndex];
    activeRiverResource = riverResourceSets[activeExampleIndex];
    riverConfigs = riverConfigSets[activeExampleIndex];
    if (startupQuality) applyQuality(startupQuality);
    debugSession.updateContext(createDebugContext());
    rebuildExampleState();
  }
  function rebuildExampleState(): void {
    rebuildRiverSegmentRuntimes();
    applyRiverChanges(RiverDirtyFlag.Material | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
    setPreviewMode(startupMode ?? waterPcgExamples[activeExampleIndex].initialMode);
    renderExampleTabs();
    rebuildGui();
  }

  function handleExampleBarClick(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[data-case-id]") : null;
    if (!target || target.dataset.caseKind !== "river") return;

    const nextIndex = waterPcgExamples.findIndex((example) => example.id === target.dataset.caseId);
    if (nextIndex < 0) return;
    event.preventDefault();
    if (nextIndex === activeExampleIndex) return;

    window.location.assign(getWaterPcgCaseHref(window.location.href, waterPcgExamples[nextIndex].id));
  }

  function handleLocationChange(): void {
    const selectedCase = resolveWaterPcgCase(window.location);
    if (selectedCase.kind !== "river") return;
    const nextIndex = waterPcgExamples.findIndex((example) => example.id === selectedCase.id);
    if (nextIndex >= 0 && nextIndex !== activeExampleIndex) loadExample(nextIndex);
  }

  exampleBarElement.addEventListener("click", handleExampleBarClick);
  window.addEventListener("popstate", handleLocationChange);
  window.addEventListener("hashchange", handleLocationChange);

  let gui: dat.GUI | null = null;
  function rebuildGui(): void {
    gui?.destroy();
    syncGuiStateFromRiverConfig();
    gui = new dat.GUI({ name: "Water Controls", width: 280 });
    gui
      .add(guiState, "mode", Object.keys(PREVIEW_MODE_OPTIONS) as PreviewModeLabel[])
      .name("Preview")
      .onChange((label: PreviewModeLabel) => {
        setPreviewMode(PREVIEW_MODE_OPTIONS[label]);
        rebuildGui();
      });

    if (activeMode === WaterPreviewMode.Ocean) {
      const oceanQualityState = {
        quality:
          oceanConfig.quality === WaterQualityTier.Low
            ? "Low"
            : oceanConfig.quality === WaterQualityTier.High
              ? "High"
              : "Medium"
      };
      gui
        .add(oceanQualityState, "quality", Object.keys(WATER_WAVE_QUALITY_OPTIONS))
        .name("Quality")
        .onChange((label: string) => {
          if (!isWaterWaveQualityLabel(label)) return;
          oceanConfig.quality = WATER_WAVE_QUALITY_OPTIONS[label];
          updateOceanMaterial();
        });
      gui
        .add(
          oceanConfig,
          "waterLevel",
          OCEAN_PREVIEW_GUI_LIMITS.waterLevel.min,
          OCEAN_PREVIEW_GUI_LIMITS.waterLevel.max,
          OCEAN_PREVIEW_GUI_LIMITS.waterLevel.step
        )
        .name("Water Level")
        .onChange(updateOceanMaterial);
      gui
        .add(
          oceanConfig,
          "amplitudeScale",
          OCEAN_PREVIEW_GUI_LIMITS.amplitudeScale.min,
          OCEAN_PREVIEW_GUI_LIMITS.amplitudeScale.max,
          OCEAN_PREVIEW_GUI_LIMITS.amplitudeScale.step
        )
        .name("Wave Height")
        .onChange(updateOceanMaterial);
      gui
        .add(
          oceanConfig,
          "timeScale",
          OCEAN_PREVIEW_GUI_LIMITS.timeScale.min,
          OCEAN_PREVIEW_GUI_LIMITS.timeScale.max,
          OCEAN_PREVIEW_GUI_LIMITS.timeScale.step
        )
        .name("Wave Speed")
        .onChange(updateOceanMaterial);
      gui
        .add(
          oceanConfig,
          "foamIntensity",
          OCEAN_PREVIEW_GUI_LIMITS.crestIntensity.min,
          OCEAN_PREVIEW_GUI_LIMITS.crestIntensity.max,
          OCEAN_PREVIEW_GUI_LIMITS.crestIntensity.step
        )
        .name("Crest")
        .onChange(updateOceanMaterial);
      gui
        .add(
          oceanConfig,
          "alpha",
          OCEAN_PREVIEW_GUI_LIMITS.alpha.min,
          OCEAN_PREVIEW_GUI_LIMITS.alpha.max,
          OCEAN_PREVIEW_GUI_LIMITS.alpha.step
        )
        .name("Opacity")
        .onChange(updateOceanMaterial);
      gui.addColor(oceanConfig, "oceanColor").name("Color").onChange(updateOceanMaterial);
    } else {
      const riverConfig = getPrimaryRiverConfig();
      gui
        .add(guiState, "quality", Object.keys(RIVER_QUALITY_OPTIONS) as RiverQualityLabel[])
        .name("Quality")
        .onChange((label: RiverQualityLabel) => {
          const quality = RIVER_QUALITY_OPTIONS[label];
          applyQuality(quality);
          updateRiverCameraFeatures();
          applyRiverChanges(
            RiverDirtyFlag.Geometry | RiverDirtyFlag.Material | RiverDirtyFlag.Query | RiverDirtyFlag.Debug
          );
          rebuildGui();
        });
      gui
        .add(guiState, "pathMode", Object.keys(RIVER_PATH_MODE_OPTIONS) as RiverPathModeLabel[])
        .name("Path Mode")
        .onChange((label: RiverPathModeLabel) => {
          updateAllRiverConfigs((config) => {
            config.path.mode = RIVER_PATH_MODE_OPTIONS[label];
          });
          applyRiverChanges(RiverDirtyFlag.Geometry | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
        });
      gui
        .add(riverConfig.shape, "width", RIVER_LIMITS.minWidth, RIVER_LIMITS.maxWidth, 0.1)
        .name("Width")
        .onFinishChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.shape.width = value;
          });
          applyRiverChanges(RiverDirtyFlag.Geometry | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
        });
      gui
        .add(riverConfig.shape, "depth", RIVER_LIMITS.minDepth, RIVER_LIMITS.maxDepth, 0.1)
        .name("Depth")
        .onFinishChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.shape.depth = value;
          });
          applyRiverChanges(RiverDirtyFlag.Geometry | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
        });
      gui
        .add(riverConfig.flow, "speed", RIVER_LIMITS.minFlowSpeed, RIVER_LIMITS.maxFlowSpeed, 0.01)
        .name("Flow Speed")
        .onFinishChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.flow.speed = value;
          });
          applyRiverChanges(
            RiverDirtyFlag.Geometry | RiverDirtyFlag.Material | RiverDirtyFlag.Query | RiverDirtyFlag.Debug
          );
        });
      gui
        .add(guiState, "materialPreset", Object.keys(RIVER_MATERIAL_OPTIONS) as RiverMaterialLabel[])
        .name("Material")
        .onChange((label: RiverMaterialLabel) => {
          applyRiverPreset(RIVER_MATERIAL_OPTIONS[label]);
          applyRiverChanges(RiverDirtyFlag.Material | RiverDirtyFlag.Query);
          rebuildGui();
        });
      gui
        .add(riverConfig.material, "foamIntensity", 0, 1, 0.01)
        .name("Foam")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.material.foamIntensity = value;
          });
          applyRiverChanges(RiverDirtyFlag.Material);
        });
      gui
        .add(riverConfig.material, "clarity", 0, 1, 0.01)
        .name("Clarity")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.material.clarity = value;
          });
          applyRiverChanges(RiverDirtyFlag.Material);
        });
      gui
        .add(guiState, "macroDisplacement")
        .name("Macro Geometry")
        .onChange((enabled: boolean) => {
          riverRuntimeController.setSurfaceFeatureFlags(enabled, guiState.microSurface);
        });
      gui
        .add(guiState, "microSurface")
        .name("Micro Ripples")
        .onChange((enabled: boolean) => {
          riverRuntimeController.setSurfaceFeatureFlags(guiState.macroDisplacement, enabled);
        });
    }
  }

  window.waterPcgSetSurfaceTime = (elapsedTime?: number): void => {
    surfaceTimeOverride = elapsedTime === undefined ? undefined : Math.max(0, elapsedTime);
    riverRuntimeController.setSurfaceTimeOverride(surfaceTimeOverride);
    oceanPreview.setSurfaceTimeOverride(surfaceTimeOverride);
    exampleBarElement.dataset.surfaceTime = surfaceTimeOverride === undefined ? "live" : surfaceTimeOverride.toFixed(3);
    applyRiverChanges(RiverDirtyFlag.Query);
  };
  window.waterPcgGetOceanMetrics = (): OceanPreviewMetrics => oceanPreview.metrics;
  window.waterPcgStressOcean = (iterations?: number): OceanPreviewStressResult => {
    const result = oceanPreview.stressReconfigure(iterations);
    writeOceanMetrics();
    return result;
  };
  window.waterPcgStressRebuild = async (
    iterations = RIVER_REBUILD_STRESS.defaultIterations
  ): Promise<WaterPcgStressResult> => {
    const requestedIterations = Math.min(RIVER_REBUILD_STRESS.maxIterations, Math.max(0, Math.floor(iterations)));
    const initialTotalMemory = engine.renderingStatistics.totalMemory;
    let completedIterations = 0;
    for (let index = 0; index < requestedIterations; index++) {
      if (!(await recompileActiveNetwork())) break;
      completedIterations++;
    }
    riverRuntimeController.flushDeferredResources();
    engine.resourceManager.gc();
    return {
      requestedIterations,
      completedIterations,
      resourceByteLength: activeRiverResource.byteLength,
      resourceHash: activeRiverResource.metadata.compiledHash,
      initialTotalMemory,
      finalTotalMemory: engine.renderingStatistics.totalMemory
    };
  };
  window.waterPcgDebug = {
    get snapshot() {
      return debugSession.snapshot;
    },
    select(selection: Partial<RiverDebugSelection>): void {
      debugSession.select(selection);
    }
  };

  rebuildExampleState();
  class WaterPcgUpdateScript extends Script {
    private readonly _profileSamples: number[] = [];
    private readonly _frameSamples: number[] = [];

    onUpdate(deltaTime: number): void {
      const updateStart = profilingEnabled ? performance.now() : 0;
      riverRuntimeController.flushDeferredResources();
      if (pendingRuntimeStatsRefresh && riverRuntimes.length > 0) {
        const foamDrawCalls = activeRiverCompiledData.chunks.reduce(
          (count, chunk) => count + (chunk.bankFoamGeometry ? 1 : 0),
          0
        );
        const drawCalls = activeRiverCompiledData.chunks.length + foamDrawCalls;
        exampleBarElement.dataset.bufferMemory = String(engine.renderingStatistics.bufferMemory);
        exampleBarElement.dataset.textureMemory = String(engine.renderingStatistics.textureMemory);
        exampleBarElement.dataset.totalMemory = String(engine.renderingStatistics.totalMemory);
        exampleBarElement.dataset.estimatedRiverDrawCalls = String(drawCalls);
        pendingRuntimeStatsRefresh = false;
        debugSession.updateContext(createDebugContext());
      }
      if (activeMode === WaterPreviewMode.Ocean) oceanPreview.update(deltaTime);
      if (profilingEnabled && this._profileSamples.length < RIVER_PROFILE_SAMPLE_COUNT) {
        this._profileSamples.push(performance.now() - updateStart);
        this._frameSamples.push(deltaTime * 1000);
        if (this._profileSamples.length === RIVER_PROFILE_SAMPLE_COUNT) {
          const sorted = [...this._profileSamples].sort((a, b) => a - b);
          const sortedFrames = [...this._frameSamples].sort((a, b) => a - b);
          const percentileIndex = Math.floor(sorted.length * 0.95);
          window.waterPcgProfileMetrics = {
            sampleCount: sorted.length,
            frameP95Ms: sortedFrames[percentileIndex],
            jsUpdateP95Ms: sorted[percentileIndex],
            estimatedRiverDrawCalls: Number(exampleBarElement.dataset.estimatedRiverDrawCalls ?? 0),
            surfaceVertexCount: Number(exampleBarElement.dataset.surfaceVertexCount ?? 0),
            atlasPixelCount: Number(exampleBarElement.dataset.atlasPixelCount ?? 0),
            surfaceTextureSamples: Number(exampleBarElement.dataset.surfaceTextureSamples ?? 0),
            bufferMemory: engine.renderingStatistics.bufferMemory,
            textureMemory: engine.renderingStatistics.textureMemory,
            totalMemory: engine.renderingStatistics.totalMemory
          };
        }
      }
    }
  }
  rootEntity.addComponent(WaterPcgUpdateScript);
  window.addEventListener("beforeunload", () => {
    exampleBarElement.removeEventListener("click", handleExampleBarClick);
    window.removeEventListener("popstate", handleLocationChange);
    window.removeEventListener("hashchange", handleLocationChange);
    riverCameraFeatureController.destroy();
    cameraWaterFeatureBroker.destroy();
    stopDebugSceneSubscription();
    stopDebugSnapshotTracking();
    waterDebugPanel.destroy();
    riverNetworkDebugController.destroy();
    riverDebugController.destroy();
    riverBedController.destroy();
    riverRockController.destroy();
    poolSceneController.destroy();
    riverRuntimeController.destroy();
    riverMeshPreviewMaterial.destroy(true);
    riverJunctionPreviewMaterial.destroy(true);
    riverBankPreviewMaterial.destroy(true);
    for (const resource of riverResourceSets) resource.dispose();
    riverCompileWorker.dispose();
    oceanPreview.destroy();
    waterWorld.destroy();
    window.waterPcgP0 = undefined;
    window.waterPcgDebug = undefined;
  });
  engine.run();
}

void bootstrapWaterPcg().catch((error: unknown) => {
  console.error(error instanceof Error ? error : new Error("Water PCG bootstrap failed."));
});
