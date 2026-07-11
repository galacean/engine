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
import { Camera, Color, Script, Vector3, WebGLMode, WebGLEngine } from "@galacean/engine";
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
  type RiverRuntimeReach,
  type RiverRuntimeReachSource
} from "../runtime/river/RiverRuntimeController";
import { cloneCompiledRiverConfig, RiverNetworkCompiler } from "../compiler/river/RiverNetworkCompiler";
import type { RiverQueryResult } from "../runtime/river/types";

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

const RIVER_PREVIEW_STAGE_OPTIONS = {
  Path: RiverPreviewStage.Path,
  Banks: RiverPreviewStage.Banks,
  Mesh: RiverPreviewStage.Mesh,
  Material: RiverPreviewStage.Material,
  Full: RiverPreviewStage.Full
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
type RiverPreviewStageLabel = keyof typeof RIVER_PREVIEW_STAGE_OPTIONS;
type RiverQualityLabel = keyof typeof RIVER_QUALITY_OPTIONS;
type RiverMaterialLabel = keyof typeof RIVER_MATERIAL_OPTIONS;

interface GuiState {
  mode: PreviewModeLabel;
  pathMode: RiverPathModeLabel;
  previewStage: RiverPreviewStageLabel;
  debugMode: RiverDebugModeLabel;
  quality: RiverQualityLabel;
  materialPreset: RiverMaterialLabel;
}

interface QueryPanelState {
  inWater: string;
  surfaceHeight: string;
  depth: string;
  flow: string;
  distanceToBank: string;
  warnings: string;
  runtime: string;
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

let activeExampleIndex = 0;
let oceanConfig: OceanConfig = cloneOceanConfig(waterPcgExamples[activeExampleIndex].ocean);
function compileRiverDescriptor(source: unknown): RiverCompiledData {
  const result = RiverNetworkCompiler.compile(source);
  if (!result.data) {
    throw new Error(result.diagnostics.map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`).join(", "));
  }
  return result.data;
}
const riverCompiledDataSets: RiverCompiledData[] = waterPcgExamples.map((example) =>
  compileRiverDescriptor(example.riverDescriptor)
);
const riverConfigSets = riverCompiledDataSets.map((compiledData, exampleIndex) =>
  compiledData.reaches.map((reach) => ({
    ...cloneCompiledRiverConfig(reach.config),
    debug: { ...waterPcgExamples[exampleIndex].riverDebug }
  }))
);
let activeRiverCompiledData = riverCompiledDataSets[activeExampleIndex];
let riverConfigs: RiverConfig[] = riverConfigSets[activeExampleIndex];

const guiState: GuiState = {
  mode: "River",
  pathMode: "Bezier",
  previewStage: "Full",
  debugMode: "Full",
  quality: "Medium",
  materialPreset: "ClearStream"
};

const queryPanelState: QueryPanelState = {
  inWater: "true",
  surfaceHeight: "0.00",
  depth: "0.00",
  flow: "0.00, 0.00",
  distanceToBank: "0.00",
  warnings: "None",
  runtime: "pending"
};

let activeMode = waterPcgExamples[activeExampleIndex].initialMode;
const startupQuality = new URLSearchParams(window.location.search).get("quality");
const profilingEnabled = new URLSearchParams(window.location.search).get("profile") === "1";
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

function applyQuality(level: RiverQualityLevel): void {
  updateAllRiverConfigs((config) => {
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
  });
}

function syncGuiStateFromRiverConfig(): void {
  const riverConfig = getPrimaryRiverConfig();
  guiState.pathMode =
    riverConfig.path.mode === RiverPathMode.Bezier
      ? "Bezier"
      : riverConfig.path.mode === RiverPathMode.CatmullRom
        ? "CatmullRom"
        : "Polyline";
  guiState.previewStage =
    riverConfig.debug.previewStage === RiverPreviewStage.Path
      ? "Path"
      : riverConfig.debug.previewStage === RiverPreviewStage.Banks
        ? "Banks"
        : riverConfig.debug.previewStage === RiverPreviewStage.Mesh
          ? "Mesh"
          : riverConfig.debug.previewStage === RiverPreviewStage.Material
            ? "Material"
            : "Full";
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

function updateQueryPanel(queryResult: RiverQueryResult, warnings: string[]): void {
  queryPanelState.inWater = queryResult.inWater ? "true" : "false";
  queryPanelState.surfaceHeight = queryResult.surfaceHeight.toFixed(2);
  queryPanelState.depth = queryResult.depth.toFixed(2);
  queryPanelState.flow = `${queryResult.flowDirection.x.toFixed(2)}, ${queryResult.flowDirection.z.toFixed(2)} @ ${queryResult.flowSpeed.toFixed(2)}`;
  queryPanelState.distanceToBank = queryResult.distanceToBank.toFixed(2);
  queryPanelState.warnings = warnings.length > 0 ? warnings.join(" | ") : "None";
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
  applyQuality(RiverQualityLevel.Low);
  guiState.quality = "Low";
}
const initialCompiledPreview = RiverNetworkCompiler.compile(
  createRiverDemoDescriptor(waterPcgExamples[activeExampleIndex].riverDescriptor, riverConfigs)
);
if (initialCompiledPreview.data) {
  activeRiverCompiledData = initialCompiledPreview.data;
  riverCompiledDataSets[activeExampleIndex] = initialCompiledPreview.data;
}

WebGLEngine.create(engineConfiguration).then((engine) => {
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

  const oceanPreview = new OceanPreviewController(engine, rootEntity, oceanConfig);
  const oceanGroup = oceanPreview.root;

  const riverGroup = rootEntity.createChild("river-preview");
  const riverSegmentsRoot = riverGroup.createChild("river-segments");
  const riverRuntimeController = new RiverRuntimeController(engine, riverSegmentsRoot);
  const riverDebugController = new RiverDebugController(engine);
  const riverMeshPreviewMaterial = createWaterPreviewMaterial(engine, RIVER_PREVIEW_STAGE_COLOR.meshSurface, 0.42);
  const riverBankPreviewMaterial = createWaterPreviewMaterial(engine, RIVER_PREVIEW_STAGE_COLOR.meshBankFoam, 0.24);
  let riverRuntimes: RiverSegmentRuntime[] = [];
  const riverDemoRuntimeSets = new Map<string, RiverSegmentRuntime[]>();
  let pendingRuntimeStatsRefresh = false;
  let topologyRevision = 0;

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
  const createRuntimeReachSources = (): RiverRuntimeReachSource[] =>
    riverConfigs.map((config, reachIndex) => {
      const normalizedConfig = normalizeRiverDemoConfig(config);
      return {
        config: normalizedConfig,
        artifact: activeRiverCompiledData.reaches[reachIndex].artifact
      };
    });
  const rebuildRiverSegmentRuntimes = (): boolean => {
    const exampleId = waterPcgExamples[activeExampleIndex].id;
    const activation = riverRuntimeController.activate(exampleId, activeRiverCompiledData, createRuntimeReachSources());
    riverDebugController.activate(exampleId, activation.reaches);
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
  const recompileActiveNetwork = (): boolean => {
    const previousPrimaryConfig = riverConfigs[0];
    const previousQuality = previousPrimaryConfig?.quality.material.level;
    const previousDebug = previousPrimaryConfig ? { ...previousPrimaryConfig.debug } : undefined;
    const result = RiverNetworkCompiler.compile(
      createRiverDemoDescriptor(waterPcgExamples[activeExampleIndex].riverDescriptor, riverConfigs)
    );
    if (!result.data) {
      queryPanelState.warnings = result.diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`)
        .join(" | ");
      return false;
    }

    const exampleId = waterPcgExamples[activeExampleIndex].id;
    riverDebugController.remove(exampleId);
    activeRiverCompiledData = result.data;
    riverCompiledDataSets[activeExampleIndex] = result.data;
    riverConfigs = result.data.reaches.map((reach) => ({
      ...cloneCompiledRiverConfig(reach.config),
      debug: { ...waterPcgExamples[activeExampleIndex].riverDebug }
    }));
    riverConfigSets[activeExampleIndex] = riverConfigs;
    if (previousQuality) applyQuality(previousQuality);
    if (previousDebug) {
      updateAllRiverConfigs((config) => {
        config.debug = { ...previousDebug };
      });
    }
    const runtimeReaches = riverRuntimeController.replaceActive(exampleId, result.data, createRuntimeReachSources());
    riverDebugController.activate(exampleId, runtimeReaches);
    riverRuntimes = riverConfigs.map((config, index) =>
      createRiverSegmentRuntime(config, index, runtimeReaches[index])
    );
    riverDemoRuntimeSets.set(exampleId, riverRuntimes);
    topologyRevision++;
    exampleBarElement.dataset.topologyRevision = String(topologyRevision);
    exampleBarElement.dataset.compiledNodeCount = String(result.data.stats.nodeCount);
    exampleBarElement.dataset.compiledReachCount = String(result.data.stats.reachCount);
    exampleBarElement.dataset.compiledJunctionCount = String(result.data.junctions.length);
    exampleBarElement.dataset.compiledChunkCount = String(result.data.chunks.length);
    return true;
  };
  const applyRiverChanges = (requestedFlags: RiverDirtyFlag): void => {
    let flags = requestedFlags;
    if (hasDirty(flags, RiverDirtyFlag.Topology) || hasDirty(flags, RiverDirtyFlag.Geometry)) {
      if (!recompileActiveNetwork()) return;
      flags = RiverDirtyFlag.Material | RiverDirtyFlag.Query | RiverDirtyFlag.Debug;
    }
    const warnings: string[] = [];
    let primaryQueryResult: RiverQueryResult | undefined;
    const geometryDirty = hasDirty(flags, RiverDirtyFlag.Geometry);
    const materialDirty = hasDirty(flags, RiverDirtyFlag.Material);

    for (const runtime of riverRuntimes) {
      runtime.normalizedConfig = normalizeRiverDemoConfig(runtime.config);
    }

    for (let i = 0; i < riverRuntimes.length; i++) {
      const runtime = riverRuntimes[i];
      riverRuntimeController.updateReach(i, runtime.normalizedConfig, runtime.artifact, materialDirty);
      applyRiverPreviewStage(runtime, i);
      const queryResult = riverDebugController.update(
        i,
        createDebugRiverConfig(runtime.normalizedConfig),
        runtime.sampleResult.points,
        runtime.artifact.querySource,
        {
          geometry: geometryDirty || hasDirty(flags, RiverDirtyFlag.Debug),
          query: geometryDirty || hasDirty(flags, RiverDirtyFlag.Query)
        }
      );

      if (i === 0 && queryResult) {
        primaryQueryResult = queryResult;
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

    if (primaryQueryResult) {
      updateQueryPanel(primaryQueryResult, warnings);
    }
    pendingRuntimeStatsRefresh = true;
  };
  const setPreviewMode = (mode: WaterPreviewMode): void => {
    activeMode = mode;
    guiState.mode = mode === WaterPreviewMode.Ocean ? "Ocean" : "River";
    oceanGroup.isActive = mode === WaterPreviewMode.Ocean;
    riverGroup.isActive = mode === WaterPreviewMode.River;
    scene.background.solidColor =
      mode === WaterPreviewMode.Ocean ? new Color(0.06, 0.1, 0.12, 1) : new Color(0.05, 0.08, 0.08, 1);

    if (mode === WaterPreviewMode.Ocean) {
      control.target.set(0, 0, 0);
      cameraEntity.transform.setPosition(0, 34, 54);
      cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
    } else {
      control.target.set(4, 0, 4);
      cameraEntity.transform.setPosition(0, 30, 52);
      cameraEntity.transform.lookAt(new Vector3(4, 0, 4));
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
    activeExampleIndex = index;
    oceanConfig = cloneOceanConfig(waterPcgExamples[activeExampleIndex].ocean);
    oceanPreview.setConfig(oceanConfig);
    activeRiverCompiledData = riverCompiledDataSets[activeExampleIndex];
    riverConfigs = riverConfigSets[activeExampleIndex];
    if (startupQuality === RiverQualityLevel.Low) applyQuality(RiverQualityLevel.Low);
    const compiledPreview = RiverNetworkCompiler.compile(
      createRiverDemoDescriptor(waterPcgExamples[activeExampleIndex].riverDescriptor, riverConfigs)
    );
    if (compiledPreview.data) {
      activeRiverCompiledData = compiledPreview.data;
      riverCompiledDataSets[activeExampleIndex] = compiledPreview.data;
    }
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
    gui = new dat.GUI({ name: "Water PCG", width: 340 });
    gui
      .add(guiState, "mode", Object.keys(PREVIEW_MODE_OPTIONS) as PreviewModeLabel[])
      .name("Preview")
      .onChange((label: PreviewModeLabel) => {
        setPreviewMode(PREVIEW_MODE_OPTIONS[label]);
        rebuildGui();
      });

    if (activeMode === WaterPreviewMode.Ocean) {
      const oceanFolder = gui.addFolder("Ocean");
      oceanFolder.add(oceanConfig, "size", 20, 180, 1).name("Size").onFinishChange(rebuildOceanMesh);
      oceanFolder.add(oceanConfig, "resolution", 4, 128, 1).name("Resolution").onFinishChange(rebuildOceanMesh);
      oceanFolder
        .add(oceanConfig, "waterLevel", -2, 3, 0.05)
        .name("Water Level")
        .onChange(() => {
          oceanPreview.rebuildMesh();
        });
      oceanFolder.add(oceanConfig, "waveAmplitude", 0, 2, 0.01).name("Amplitude");
      oceanFolder.add(oceanConfig, "waveLength", 2, 40, 0.1).name("Wave Length");
      oceanFolder.add(oceanConfig, "waveSpeed", 0, 3, 0.01).name("Wave Speed");
      oceanFolder.add(oceanConfig, "alpha", 0.15, 1, 0.01).name("Alpha").onChange(updateOceanMaterial);
      oceanFolder.add(oceanConfig, "foamIntensity", 0, 5, 0.1).name("Foam").onChange(updateOceanMaterial);
      oceanFolder.addColor(oceanConfig, "oceanColor").name("Color").onChange(updateOceanMaterial);
      oceanFolder.open();
    } else {
      const riverConfig = getPrimaryRiverConfig();
      const pathFolder = gui.addFolder("River Path");
      pathFolder
        .add(guiState, "pathMode", Object.keys(RIVER_PATH_MODE_OPTIONS) as RiverPathModeLabel[])
        .name("Mode")
        .onChange((label: RiverPathModeLabel) => {
          updateAllRiverConfigs((config) => {
            config.path.mode = RIVER_PATH_MODE_OPTIONS[label];
          });
          applyRiverChanges(RiverDirtyFlag.Geometry | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
        });
      pathFolder
        .add(riverConfig.path, "segmentLength", 0.5, 8, 0.1)
        .name("Segment")
        .onFinishChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.path.segmentLength = value;
          });
          applyRiverChanges(RiverDirtyFlag.Geometry | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
        });
      pathFolder.open();

      const shapeFolder = gui.addFolder("River Shape");
      shapeFolder
        .add(riverConfig.shape, "width", 1, 18, 0.1)
        .name("Width")
        .onFinishChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.shape.width = value;
          });
          applyRiverChanges(RiverDirtyFlag.Geometry | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
        });
      shapeFolder
        .add(riverConfig.shape, "depth", 0, 5, 0.1)
        .name("Depth")
        .onFinishChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.shape.depth = value;
          });
          applyRiverChanges(RiverDirtyFlag.Geometry | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
        });
      shapeFolder
        .add(riverConfig.shape, "bankFeather", 0, 5, 0.1)
        .name("Bank")
        .onFinishChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.shape.bankFeather = value;
          });
          applyRiverChanges(RiverDirtyFlag.Geometry | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
        });
      shapeFolder.open();

      const flowFolder = gui.addFolder("River Flow");
      flowFolder
        .add(riverConfig.flow, "speed", 0, 4, 0.01)
        .name("Speed")
        .onFinishChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.flow.speed = value;
          });
          applyRiverChanges(
            RiverDirtyFlag.Geometry | RiverDirtyFlag.Material | RiverDirtyFlag.Query | RiverDirtyFlag.Debug
          );
        });
      flowFolder.open();

      const materialFolder = gui.addFolder("River Material");
      materialFolder
        .add(guiState, "materialPreset", Object.keys(RIVER_MATERIAL_OPTIONS) as RiverMaterialLabel[])
        .name("Preset")
        .onChange((label: RiverMaterialLabel) => {
          applyRiverPreset(RIVER_MATERIAL_OPTIONS[label]);
          applyRiverChanges(RiverDirtyFlag.Material | RiverDirtyFlag.Query);
          rebuildGui();
        });
      materialFolder
        .addColor(riverConfig.material, "baseColor")
        .name("Base")
        .onChange((value: string) => {
          updateAllRiverConfigs((config) => {
            config.material.baseColor = value;
          });
          applyRiverChanges(RiverDirtyFlag.Material);
        });
      materialFolder
        .addColor(riverConfig.material, "foamColor")
        .name("Foam")
        .onChange((value: string) => {
          updateAllRiverConfigs((config) => {
            config.material.foamColor = value;
          });
          applyRiverChanges(RiverDirtyFlag.Material);
        });
      materialFolder
        .add(riverConfig.material, "foamIntensity", 0, 1, 0.01)
        .name("Foam Int")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.material.foamIntensity = value;
          });
          applyRiverChanges(RiverDirtyFlag.Material);
        });
      materialFolder
        .add(riverConfig.material, "clarity", 0, 1, 0.01)
        .name("Clarity")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.material.clarity = value;
          });
          applyRiverChanges(RiverDirtyFlag.Material);
        });
      materialFolder.open();

      const qualityFolder = gui.addFolder("Quality");
      qualityFolder
        .add(guiState, "quality", Object.keys(RIVER_QUALITY_OPTIONS) as RiverQualityLabel[])
        .name("Level")
        .onChange((label: RiverQualityLabel) => {
          applyQuality(RIVER_QUALITY_OPTIONS[label]);
          applyRiverChanges(
            RiverDirtyFlag.Geometry | RiverDirtyFlag.Material | RiverDirtyFlag.Query | RiverDirtyFlag.Debug
          );
          rebuildGui();
        });
      qualityFolder
        .add(riverConfig.quality.geometry, "maxSegmentCount", 32, 2048, 1)
        .name("Max Segments")
        .onFinishChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.quality.geometry.maxSegmentCount = value;
          });
          applyRiverChanges(RiverDirtyFlag.Geometry | RiverDirtyFlag.Query | RiverDirtyFlag.Debug);
        });

      const debugFolder = gui.addFolder("Debug");
      debugFolder
        .add(guiState, "previewStage", Object.keys(RIVER_PREVIEW_STAGE_OPTIONS) as RiverPreviewStageLabel[])
        .name("Stage")
        .onChange((label: RiverPreviewStageLabel) => {
          updateAllRiverConfigs((config) => {
            config.debug.previewStage = RIVER_PREVIEW_STAGE_OPTIONS[label];
          });
          applyRiverChanges(RiverDirtyFlag.Material | RiverDirtyFlag.Debug);
        });
      debugFolder
        .add(guiState, "debugMode", Object.keys(RIVER_DEBUG_MODE_OPTIONS) as RiverDebugModeLabel[])
        .name("Overlay")
        .onChange((label: RiverDebugModeLabel) => {
          updateAllRiverConfigs((config) => {
            config.debug.mode = RIVER_DEBUG_MODE_OPTIONS[label];
          });
          applyRiverChanges(RiverDirtyFlag.Debug);
        });
      debugFolder
        .add(riverConfig.debug, "queryT", 0, 1, 0.01)
        .name("Query T")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.debug.queryT = value;
          });
          applyRiverChanges(RiverDirtyFlag.Query);
        });
      debugFolder
        .add(
          {
            recompileNetwork: () => {
              applyRiverChanges(RiverDirtyFlag.Topology);
              rebuildGui();
            }
          },
          "recompileNetwork"
        )
        .name("Recompile Network");
      debugFolder.add(queryPanelState, "inWater").name("In Water").listen();
      debugFolder.add(queryPanelState, "surfaceHeight").name("Height").listen();
      debugFolder.add(queryPanelState, "depth").name("Depth").listen();
      debugFolder.add(queryPanelState, "flow").name("Flow").listen();
      debugFolder.add(queryPanelState, "distanceToBank").name("Bank Dist").listen();
      debugFolder.add(queryPanelState, "warnings").name("Warnings").listen();
      debugFolder.add(queryPanelState, "runtime").name("Runtime").listen();
      debugFolder.open();
    }
  }

  rebuildExampleState();
  class WaterPcgUpdateScript extends Script {
    private readonly _profileSamples: number[] = [];

    onUpdate(deltaTime: number): void {
      const updateStart = profilingEnabled ? performance.now() : 0;
      riverRuntimeController.flushDeferredResources();
      if (pendingRuntimeStatsRefresh && riverRuntimes.length > 0) {
        const runtime = riverRuntimes[0];
        const passesPerChunk = runtime.normalizedConfig.quality.material.level === RiverQualityLevel.Low ? 1 : 2;
        const drawCalls = activeRiverCompiledData.chunks.length * passesPerChunk;
        exampleBarElement.dataset.bufferMemory = String(engine.renderingStatistics.bufferMemory);
        exampleBarElement.dataset.estimatedRiverDrawCalls = String(drawCalls);
        queryPanelState.runtime = `${runtime.normalizedConfig.quality.material.level} | ${drawCalls} draw / ${activeRiverCompiledData.chunks.length} chunks | ${activeRiverCompiledData.stats.sampleCount} samples | ${(engine.renderingStatistics.bufferMemory / 1024).toFixed(1)} KiB buffers`;
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
    riverDebugController.destroy();
    riverRuntimeController.destroy();
    oceanPreview.destroy();
  });
  engine.run();
});
