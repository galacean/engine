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
import { RIVER_MATERIAL_PRESET_CONFIG, RIVER_QUALITY_PRESET } from "../authoring/river/RiverAuthoringLimits";
import { decodeRiverSamplePoints } from "../compiler/river/RiverGeometryCompiler";
import type { RiverCompiledData, RiverReachArtifact, RiverSampleResult } from "../compiler/river/types";
import { RiverDirtyFlag } from "./constants";
import { RiverDebugMode, RiverPreviewStage, RIVER_PREVIEW_STAGE_COLOR } from "./debug/constants";
import type { RiverDemoConfig as RiverConfig } from "./types";
import { getRiverConfigWarnings } from "../authoring/river/RiverSchemaDecoder";
import { RiverDebugController } from "./debug/RiverDebugController";
import { createRiverDemoDescriptor, normalizeRiverDemoConfig } from "./normalizeRiverDemoConfig";
import { OceanPreviewController } from "./examples/ocean-preview/OceanPreviewController";
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
import { RiverCameraFeatureController } from "./RiverCameraFeatureController";

const PREVIEW_MODE_OPTIONS = {
  Ocean: WaterPreviewMode.Ocean,
  River: WaterPreviewMode.River
} as const;

const RIVER_PATH_MODE_OPTIONS = {
  Polyline: RiverPathMode.Polyline,
  CatmullRom: RiverPathMode.CatmullRom,
  Bezier: RiverPathMode.Bezier
} as const;

const RIVER_DEBUG_MODE_OPTIONS = {
  Off: RiverDebugMode.Off,
  Path: RiverDebugMode.Path,
  Banks: RiverDebugMode.Banks,
  Full: RiverDebugMode.Full
} as const;

const RIVER_QUALITY_OPTIONS = {
  Low: RiverQualityLevel.Low,
  Medium: RiverQualityLevel.Medium,
  High: RiverQualityLevel.High
} as const;

const RIVER_MATERIAL_OPTIONS = {
  ClearStream: RiverMaterialPreset.ClearStream,
  MuddyRiver: RiverMaterialPreset.MuddyRiver,
  MountainCreek: RiverMaterialPreset.MountainCreek
} as const;

type PreviewModeLabel = keyof typeof PREVIEW_MODE_OPTIONS;
type RiverPathModeLabel = keyof typeof RIVER_PATH_MODE_OPTIONS;
type RiverDebugModeLabel = keyof typeof RIVER_DEBUG_MODE_OPTIONS;
type RiverQualityLabel = keyof typeof RIVER_QUALITY_OPTIONS;
type RiverMaterialLabel = keyof typeof RIVER_MATERIAL_OPTIONS;

interface GuiState {
  mode: PreviewModeLabel;
  pathMode: RiverPathModeLabel;
  debugMode: RiverDebugModeLabel;
  quality: RiverQualityLabel;
  materialPreset: RiverMaterialLabel;
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
  jsUpdateP95Ms: number;
}

declare global {
  interface Window {
    waterPcgProfileMetrics?: WaterPcgProfileMetrics;
  }
}

async function bootstrapWaterPcg(): Promise<void> {
  const riverCompileWorker = new RiverCompileWorkerClient();
  let activeExampleIndex = 0;
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
    debugMode: "Full",
    quality: "Medium",
    materialPreset: "ClearStream"
  };

  let activeMode = waterPcgExamples[activeExampleIndex].initialMode;
  const startupQuality = new URLSearchParams(window.location.search).get("quality");
  const profilingEnabled = new URLSearchParams(window.location.search).get("profile") === "1";
  const requestedSubmissionBudgetMs = Number(new URLSearchParams(window.location.search).get("submissionBudgetMs"));
  const startupSubmissionBudgetMs =
    Number.isFinite(requestedSubmissionBudgetMs) && requestedSubmissionBudgetMs > 0
      ? requestedSubmissionBudgetMs
      : undefined;
  const exampleBar = document.getElementById("example-bar");

  if (!(exampleBar instanceof HTMLDivElement)) {
    throw new Error("Water PCG example bar is missing.");
  }
  const exampleBarElement: HTMLDivElement = exampleBar;

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
      if (level === RiverQualityLevel.Low) config.debug.mode = RiverDebugMode.Off;
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
    guiState.debugMode =
      riverConfig.debug.mode === RiverDebugMode.Full
        ? "Full"
        : riverConfig.debug.mode === RiverDebugMode.Banks
          ? "Banks"
          : riverConfig.debug.mode === RiverDebugMode.Path
            ? "Path"
            : "Off";
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

  function getEffectiveDebugMode(stage: RiverPreviewStage, debugMode: RiverDebugMode): RiverDebugMode {
    if (stage === RiverPreviewStage.Path) {
      return RiverDebugMode.Path;
    }

    if (stage === RiverPreviewStage.Banks) {
      return RiverDebugMode.Banks;
    }

    if (stage === RiverPreviewStage.Full) {
      return debugMode;
    }

    return RiverDebugMode.Off;
  }

  function createDebugRiverConfig(config: RiverConfig): RiverConfig {
    return {
      ...config,
      debug: {
        ...config.debug,
        mode: getEffectiveDebugMode(config.debug.previewStage, config.debug.mode)
      }
    };
  }

  const engineConfiguration = {
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: {
      webGLMode: new URLSearchParams(window.location.search).get("webgl") === "1" ? WebGLMode.WebGL1 : WebGLMode.Auto
    }
  } as unknown as Parameters<typeof WebGLEngine.create>[0];

  if (startupQuality === RiverQualityLevel.Low) {
    for (const configs of riverConfigSets) applyQualityToConfigs(configs, RiverQualityLevel.Low);
    guiState.quality = "Low";
    const lowResources = await Promise.all(
      waterPcgExamples.map((example, exampleIndex) =>
        riverCompileWorker.compile(createRiverDemoDescriptor(example.riverDescriptor, riverConfigSets[exampleIndex]))
      )
    );
    for (let index = 0; index < lowResources.length; index++) {
      riverResourceSets[index].dispose();
      riverResourceSets[index] = lowResources[index];
      riverCompiledDataSets[index] = lowResources[index].data;
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
  new WorldAxesView(engine, rootEntity);

  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 300;
  const control = cameraEntity.addComponent(OrbitControl);
  const riverCameraFeatureController = new RiverCameraFeatureController(camera);

  const oceanPreview = new OceanPreviewController(engine, rootEntity, oceanConfig);
  const oceanGroup = oceanPreview.root;

  const riverGroup = rootEntity.createChild("river-preview");
  const riverSegmentsRoot = riverGroup.createChild("river-segments");
  const riverRuntimeController = new RiverRuntimeController(engine, riverSegmentsRoot);
  const riverDebugController = new RiverDebugController(engine);
  const riverBedController = new RiverBedController(engine, riverGroup);
  const riverRockController = new RiverRockController(engine, riverGroup);
  const riverMeshPreviewMaterial = createWaterPreviewMaterial(engine, RIVER_PREVIEW_STAGE_COLOR.meshSurface, 0.42);
  const riverBankPreviewMaterial = createWaterPreviewMaterial(engine, RIVER_PREVIEW_STAGE_COLOR.meshBankFoam, 0.24);
  let riverRuntimes: RiverSegmentRuntime[] = [];
  const riverDemoRuntimeSets = new Map<string, RiverSegmentRuntime[]>();
  let pendingRuntimeStatsRefresh = false;
  let topologyRevision = 0;

  const updateRiverCameraFeatures = (): void => {
    riverCameraFeatureController.apply(
      activeMode === WaterPreviewMode.River,
      getPrimaryRiverConfig().quality.material.level
    );
    exampleBarElement.dataset.riverDepthTextureRequested = String(riverCameraFeatureController.depthTextureRequested);
    exampleBarElement.dataset.cameraDepthTextureMode =
      camera.depthTextureMode === DepthTextureMode.PrePass ? "prepass" : "none";
  };

  const rebuildOceanMesh = (): void => oceanPreview.rebuildMesh();
  const updateOceanMaterial = (): void => oceanPreview.updateMaterial();
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
  const rebuildRiverSegmentRuntimes = (): boolean => {
    const exampleId = waterPcgExamples[activeExampleIndex].id;
    const activation = riverRuntimeController.activate(exampleId, activeRiverResource, createRuntimeReachSources());
    riverDebugController.activate(exampleId, activation.reaches);
    const queryService = riverRuntimeController.activeQueryService;
    if (queryService) {
      riverBedController.rebuild(activeRiverCompiledData);
      riverRockController.rebuild(activeRiverCompiledData, queryService);
    }
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
    const stage = runtime.normalizedConfig.debug.previewStage;
    const showRiverMesh =
      stage === RiverPreviewStage.Mesh || stage === RiverPreviewStage.Material || stage === RiverPreviewStage.Full;
    const isLow = runtime.normalizedConfig.quality.material.level === RiverQualityLevel.Low;
    riverRuntimeController.applyPresentation(reachIndex, {
      surfaceVisible: showRiverMesh,
      foamVisible: showRiverMesh && !isLow && Boolean(runtime.artifact.bankFoamGeometry),
      surfaceMaterial: stage === RiverPreviewStage.Mesh ? riverMeshPreviewMaterial : undefined,
      foamMaterial: stage === RiverPreviewStage.Mesh && !isLow ? riverBankPreviewMaterial : undefined
    });
  };
  const hasDirty = (flags: RiverDirtyFlag, flag: RiverDirtyFlag): boolean => (flags & flag) !== 0;
  const networkQueryResult = createRiverNetworkQueryResult();
  let compileRequestRevision = 0;
  const recompileActiveNetwork = async (): Promise<boolean> => {
    const requestRevision = ++compileRequestRevision;
    const requestExampleIndex = activeExampleIndex;
    const descriptor = createRiverDemoDescriptor(waterPcgExamples[activeExampleIndex].riverDescriptor, riverConfigs);
    let nextResource: RiverResource;
    try {
      nextResource = await riverCompileWorker.compile(descriptor);
    } catch (error) {
      exampleBarElement.dataset.runtimeError =
        error instanceof RiverCompileWorkerError ? error.message : "River Worker compilation failed.";
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
    const queryService = riverRuntimeController.activeQueryService;
    if (queryService) {
      riverBedController.rebuild(nextData);
      riverRockController.rebuild(nextData, queryService);
    }
    exampleBarElement.dataset.riverBedChunkCount = String(riverBedController.chunkCount);
    exampleBarElement.dataset.rockCount = String(riverRockController.rockCount);
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
    exampleBarElement.dataset.workerDeserializeMs = riverCompileWorker.lastDeserializeMs.toFixed(3);
    exampleBarElement.dataset.terrainCorridorCount = String(nextData.terrainInteraction.reachCorridors.length);
    exampleBarElement.dataset.localMapRegionCount = String(nextData.stats.localMapRegionCount);
    exampleBarElement.dataset.waterSlopeAdjustmentCount = String(nextData.stats.waterSlopeAdjustmentCount);
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
      riverDebugController.update(
        i,
        createDebugRiverConfig(runtime.normalizedConfig),
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
        exampleBarElement.dataset.lowDrawCallsPerChunk =
          runtime.normalizedConfig.quality.material.level === RiverQualityLevel.Low ? "1" : "2";
      }

      warnings.push(
        ...getRiverConfigWarnings(runtime.normalizedConfig).map((warning) => `${runtime.config.id}: ${warning}`),
        ...runtime.sampleResult.diagnostics.map(
          (diagnostic) => `${runtime.config.id}: ${diagnostic.code}: ${diagnostic.message}`
        )
      );
    }

    const primaryRuntime = riverRuntimes[0];
    const queryService = riverRuntimeController.activeQueryService;
    if (primaryRuntime && queryService) {
      const queryPosition = getPointAtRiverT(primaryRuntime.sampleResult.points, primaryRuntime.config.debug.queryT);
      queryService.sampleSurface(queryPosition, networkQueryResult);
      exampleBarElement.dataset.querySourceKind = networkQueryResult.sourceKind ?? "none";
      exampleBarElement.dataset.diagnosticCount = String(warnings.length);
    }
    pendingRuntimeStatsRefresh = true;
    if (networkRecompiled) rebuildGui();
  };
  const applyRiverChanges = (requestedFlags: RiverDirtyFlag): void => {
    void applyRiverChangesAsync(requestedFlags).catch((error: unknown) => {
      exampleBarElement.dataset.runtimeError = error instanceof Error ? error.message : "River update failed.";
    });
  };
  const setPreviewMode = (mode: WaterPreviewMode): void => {
    activeMode = mode;
    guiState.mode = mode === WaterPreviewMode.Ocean ? "Ocean" : "River";
    oceanGroup.isActive = mode === WaterPreviewMode.Ocean;
    riverGroup.isActive = mode === WaterPreviewMode.River;
    scene.background.solidColor =
      mode === WaterPreviewMode.Ocean ? new Color(0.06, 0.1, 0.12, 1) : new Color(0.05, 0.08, 0.08, 1);
    updateRiverCameraFeatures();

    if (mode === WaterPreviewMode.Ocean) {
      control.target.set(0, 0, 0);
      cameraEntity.transform.setPosition(0, 34, 54);
      cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
    } else {
      const view = waterPcgExamples[activeExampleIndex].view;
      control.target.set(view.cameraTarget[0], view.cameraTarget[1], view.cameraTarget[2]);
      cameraEntity.transform.setPosition(view.cameraPosition[0], view.cameraPosition[1], view.cameraPosition[2]);
      cameraEntity.transform.lookAt(new Vector3(view.cameraTarget[0], view.cameraTarget[1], view.cameraTarget[2]));
    }
  };
  function renderExampleTabs(): void {
    exampleBarElement.innerHTML = "";
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
    exampleBarElement.dataset.rockCount = String(riverRockController.rockCount);
    for (let i = 0; i < waterPcgExamples.length; i++) {
      const example = waterPcgExamples[i];
      const button = document.createElement("button");
      button.type = "button";
      button.className = i === activeExampleIndex ? "example-tab is-active" : "example-tab";
      button.textContent = example.label;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", i === activeExampleIndex ? "true" : "false");
      button.addEventListener("click", () => {
        if (i === activeExampleIndex) {
          return;
        }
        loadExample(i);
      });
      exampleBarElement.appendChild(button);
    }
  }
  function loadExample(index: number): void {
    compileRequestRevision++;
    activeExampleIndex = index;
    oceanConfig = cloneOceanConfig(waterPcgExamples[activeExampleIndex].ocean);
    oceanPreview.setConfig(oceanConfig);
    activeRiverCompiledData = riverCompiledDataSets[activeExampleIndex];
    activeRiverResource = riverResourceSets[activeExampleIndex];
    riverConfigs = riverConfigSets[activeExampleIndex];
    if (startupQuality === RiverQualityLevel.Low) applyQuality(RiverQualityLevel.Low);
    rebuildExampleState();
  }
  function rebuildExampleState(): void {
    rebuildRiverSegmentRuntimes();
    applyRiverChanges(RiverDirtyFlag.Material | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
    setPreviewMode(waterPcgExamples[activeExampleIndex].initialMode);
    renderExampleTabs();
    rebuildGui();
  }

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
      gui.add(oceanConfig, "waterLevel", -2, 3, 0.05).name("Water Level").onChange(rebuildOceanMesh);
      gui.add(oceanConfig, "waveAmplitude", 0, 2, 0.01).name("Wave Height");
      gui.add(oceanConfig, "waveSpeed", 0, 3, 0.01).name("Wave Speed");
      gui.add(oceanConfig, "alpha", 0.15, 1, 0.01).name("Opacity").onChange(updateOceanMaterial);
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
        .add(riverConfig.shape, "width", 1, 18, 0.1)
        .name("Width")
        .onFinishChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.shape.width = value;
          });
          applyRiverChanges(RiverDirtyFlag.Geometry | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
        });
      gui
        .add(riverConfig.shape, "depth", 0, 5, 0.1)
        .name("Depth")
        .onFinishChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.shape.depth = value;
          });
          applyRiverChanges(RiverDirtyFlag.Geometry | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
        });
      gui
        .add(riverConfig.flow, "speed", 0, 4, 0.01)
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
        .add(guiState, "debugMode", Object.keys(RIVER_DEBUG_MODE_OPTIONS) as RiverDebugModeLabel[])
        .name("Debug")
        .onChange((label: RiverDebugModeLabel) => {
          updateAllRiverConfigs((config) => {
            config.debug.mode = RIVER_DEBUG_MODE_OPTIONS[label];
          });
          applyRiverChanges(RiverDirtyFlag.Debug);
        });
    }
  }

  rebuildExampleState();
  class WaterPcgUpdateScript extends Script {
    private readonly _profileSamples: number[] = [];

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
      }
      if (activeMode === WaterPreviewMode.Ocean) oceanPreview.update(deltaTime);
      if (profilingEnabled && this._profileSamples.length < 300) {
        this._profileSamples.push(performance.now() - updateStart);
        if (this._profileSamples.length === 300) {
          const sorted = [...this._profileSamples].sort((a, b) => a - b);
          window.waterPcgProfileMetrics = {
            sampleCount: sorted.length,
            jsUpdateP95Ms: sorted[Math.floor(sorted.length * 0.95)]
          };
        }
      }
    }
  }
  rootEntity.addComponent(WaterPcgUpdateScript);
  window.addEventListener("beforeunload", () => {
    riverCameraFeatureController.destroy();
    riverDebugController.destroy();
    riverBedController.destroy();
    riverRockController.destroy();
    riverRuntimeController.destroy();
    for (const resource of riverResourceSets) resource.dispose();
    riverCompileWorker.dispose();
    oceanPreview.destroy();
  });
  engine.run();
}

void bootstrapWaterPcg().catch((error: unknown) => {
  console.error(error instanceof Error ? error : new Error("Water PCG bootstrap failed."));
});
