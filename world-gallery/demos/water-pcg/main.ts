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
import {
  Camera,
  Color,
  Engine,
  Material,
  MeshRenderer,
  ModelMesh,
  RenderFace,
  UnlitMaterial,
  Vector2,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import * as dat from "dat.gui";
import { WorldAxesView } from "./debug/WorldAxesView";
import { WaterPreviewMode } from "./example/constants";
import { cloneOceanConfig, OceanConfig, waterPcgExamples } from "./example";
import {
  RiverDebugMode,
  RiverMaterialPreset,
  RiverPathMode,
  RiverPreviewStage,
  RIVER_PREVIEW_STAGE_COLOR,
  RiverQualityLevel
} from "./river/constants";
import { getRiverConfigWarnings, normalizeRiverConfig } from "./river/RiverConfigValidator";
import { RiverDebugView } from "./river/RiverDebugView";
import { buildRiverMeshes, updateMeshBounds } from "./river/RiverMeshBuilder";
import { createRiverMaterial, hexToColor, updateRiverMaterial } from "./river/RiverMaterialFactory";
import { createRiverConfigsFromNetwork } from "./river/RiverNetworkAdapter";
import { sampleRiverPath } from "./river/RiverPathSampler";
import { RiverConfig, RiverQueryResult, RiverSampleResult } from "./river/types";

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
}

interface RiverSegmentRuntime {
  config: RiverConfig;
  normalizedConfig: RiverConfig;
  sampleResult: RiverSampleResult;
  surfaceRenderer: MeshRenderer;
  foamRenderer: MeshRenderer;
  material: Material;
  foamMaterial: UnlitMaterial;
  debugView: RiverDebugView;
}

let activeExampleIndex = 0;
let oceanConfig: OceanConfig = cloneOceanConfig(waterPcgExamples[activeExampleIndex].ocean);
let riverConfigs: RiverConfig[] = createRiverConfigsFromNetwork(waterPcgExamples[activeExampleIndex].riverNetwork);

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
  warnings: "None"
};

let activeMode = waterPcgExamples[activeExampleIndex].initialMode;
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

function calculateWaveHeight(x: number, z: number, waterLevel: number, time: number): number {
  const frequency = (Math.PI * 2) / Math.max(oceanConfig.waveLength, 0.001);
  const waveTime = time * oceanConfig.waveSpeed;
  const waveA = Math.sin((x + z) * frequency + waveTime);
  const waveB = Math.sin((x * 0.45 - z * 0.8) * frequency * 1.7 + waveTime * 1.35);
  return waterLevel + (waveA * 0.65 + waveB * 0.35) * oceanConfig.waveAmplitude;
}

function createGridPositions(size: number, resolution: number, waterLevel: number, time: number): Vector3[] {
  const segmentCount = Math.max(1, Math.floor(resolution));
  const halfSize = size * 0.5;
  const positions: Vector3[] = [];

  for (let z = 0; z <= segmentCount; z++) {
    for (let x = 0; x <= segmentCount; x++) {
      const u = x / segmentCount;
      const v = z / segmentCount;
      const localX = u * size - halfSize;
      const localZ = v * size - halfSize;
      positions.push(new Vector3(localX, calculateWaveHeight(localX, localZ, waterLevel, time), localZ));
    }
  }

  return positions;
}

function createGridMesh(engine: Engine, size: number, resolution: number, waterLevel: number, time: number): ModelMesh {
  const segmentCount = Math.max(1, Math.floor(resolution));
  const vertexSide = segmentCount + 1;
  const uvs: Vector2[] = [];
  const indices: number[] = [];

  for (let z = 0; z <= segmentCount; z++) {
    for (let x = 0; x <= segmentCount; x++) {
      uvs.push(new Vector2(x / segmentCount, z / segmentCount));
    }
  }

  for (let z = 0; z < segmentCount; z++) {
    for (let x = 0; x < segmentCount; x++) {
      const a = z * vertexSide + x;
      const b = a + 1;
      const c = a + vertexSide;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return createModelMesh(engine, createGridPositions(size, resolution, waterLevel, time), uvs, indices);
}

function updateGridMesh(mesh: ModelMesh, size: number, resolution: number, waterLevel: number, time: number): void {
  const positions = createGridPositions(size, resolution, waterLevel, time);
  updateMeshBounds(mesh, positions);
  mesh.setPositions(positions);
  mesh.uploadData(false);
}

function createModelMesh(engine: Engine, positions: Vector3[], uvs: Vector2[], indexValues: number[]): ModelMesh {
  const mesh = new ModelMesh(engine);
  const indices = positions.length > 65535 ? new Uint32Array(indexValues) : new Uint16Array(indexValues);
  updateMeshBounds(mesh, positions);
  mesh.setPositions(positions);
  mesh.setUVs(uvs);
  mesh.setIndices(indices);
  mesh.uploadData(false);
  mesh.addSubMesh(0, indices.length);
  return mesh;
}

function createWaterMaterial(engine: Engine, baseColor: string, alpha: number): UnlitMaterial {
  const material = new UnlitMaterial(engine);
  material.isTransparent = true;
  material.renderFace = RenderFace.Double;
  material.baseColor = hexToColor(baseColor, alpha);
  return material;
}

function updateWaterMaterial(material: UnlitMaterial, baseColor: string, alpha: number): void {
  material.baseColor = hexToColor(baseColor, alpha);
}

function applyRiverPreset(preset: RiverMaterialPreset): void {
  updateAllRiverConfigs((config) => {
    config.material.preset = preset;
    if (preset === RiverMaterialPreset.MuddyRiver) {
      config.material.baseColor = "#5b8f7a";
      config.material.foamColor = "#e1e6cc";
      config.material.foamIntensity = 0.42;
      config.material.clarity = 0.28;
      return;
    }

    if (preset === RiverMaterialPreset.MountainCreek) {
      config.material.baseColor = "#5cc7d8";
      config.material.foamColor = "#f2fdff";
      config.material.foamIntensity = 0.78;
      config.material.clarity = 0.9;
      config.flow.speed = Math.max(config.flow.speed, 1.9);
      return;
    }

    config.material.baseColor = "#34a9c9";
    config.material.foamColor = "#d8f7ff";
    config.material.foamIntensity = 0.62;
    config.material.clarity = 0.72;
  });
}

function applyQuality(level: RiverQualityLevel): void {
  updateAllRiverConfigs((config) => {
    config.quality.level = level;
    if (level === RiverQualityLevel.Low) {
      config.path.segmentLength = 3.5;
      config.quality.maxSegmentCount = 180;
      return;
    }

    if (level === RiverQualityLevel.High) {
      config.path.segmentLength = 1.0;
      config.quality.maxSegmentCount = 1024;
      return;
    }

    config.path.segmentLength = 1.8;
    config.quality.maxSegmentCount = 512;
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
    riverConfig.quality.level === RiverQualityLevel.High
      ? "High"
      : riverConfig.quality.level === RiverQualityLevel.Low
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
  shaderCompiler: new ShaderCompiler()
} as unknown as Parameters<typeof WebGLEngine.create>[0];

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

  const oceanGroup = rootEntity.createChild("ocean-preview");
  const oceanRenderer = oceanGroup.createChild("ocean-surface").addComponent(MeshRenderer);
  const oceanMaterial = createWaterMaterial(engine, oceanConfig.oceanColor, oceanConfig.alpha);
  let oceanMesh = createGridMesh(engine, oceanConfig.size, oceanConfig.resolution, oceanConfig.waterLevel, 0);
  oceanRenderer.mesh = oceanMesh;
  oceanRenderer.setMaterial(oceanMaterial);

  const riverGroup = rootEntity.createChild("river-preview");
  let riverSegmentsRoot = riverGroup.createChild("river-segments");
  const riverMeshPreviewMaterial = createWaterMaterial(engine, RIVER_PREVIEW_STAGE_COLOR.meshSurface, 0.42);
  const riverBankPreviewMaterial = createWaterMaterial(engine, RIVER_PREVIEW_STAGE_COLOR.meshBankFoam, 0.24);
  let riverRuntimes: RiverSegmentRuntime[] = [];

  const rebuildOceanMesh = (): void => {
    oceanMesh = createGridMesh(engine, oceanConfig.size, oceanConfig.resolution, oceanConfig.waterLevel, 0);
    oceanRenderer.mesh = oceanMesh;
  };
  const updateOceanMaterial = (): void => {
    updateWaterMaterial(
      oceanMaterial,
      oceanConfig.oceanColor,
      Math.min(1, oceanConfig.alpha + oceanConfig.foamIntensity * 0.02)
    );
  };
  const getFoamAlpha = (config: RiverConfig): number =>
    Math.min(0.5, 0.18 + config.shape.bankFeather * 0.06 + config.material.foamIntensity * 0.18);
  const createRiverSegmentRuntime = (config: RiverConfig): RiverSegmentRuntime => {
    const segmentRoot = riverSegmentsRoot.createChild(`river-segment-${config.id}`);
    const foamRenderer = segmentRoot.createChild(`${config.id}-bank`).addComponent(MeshRenderer);
    const surfaceRenderer = segmentRoot.createChild(`${config.id}-water`).addComponent(MeshRenderer);
    const normalizedConfig = normalizeRiverConfig(config);
    const sampleResult = sampleRiverPath(normalizedConfig);
    const material = createRiverMaterial(engine, normalizedConfig.material, normalizedConfig.flow.speed);
    const foamMaterial = createWaterMaterial(
      engine,
      normalizedConfig.material.foamColor,
      getFoamAlpha(normalizedConfig)
    );
    const debugView = new RiverDebugView(engine, segmentRoot);
    foamRenderer.setMaterial(foamMaterial);
    surfaceRenderer.setMaterial(material);

    return {
      config,
      normalizedConfig,
      sampleResult,
      surfaceRenderer,
      foamRenderer,
      material,
      foamMaterial,
      debugView
    };
  };
  const rebuildRiverSegmentRuntimes = (): void => {
    riverSegmentsRoot.destroy();
    riverSegmentsRoot = riverGroup.createChild("river-segments");
    riverRuntimes = riverConfigs.map(createRiverSegmentRuntime);
  };
  const applyRiverPreviewStage = (runtime: RiverSegmentRuntime): void => {
    const stage = runtime.normalizedConfig.debug.previewStage;
    const showRiverMesh =
      stage === RiverPreviewStage.Mesh || stage === RiverPreviewStage.Material || stage === RiverPreviewStage.Full;
    runtime.surfaceRenderer.entity.isActive = showRiverMesh;
    runtime.foamRenderer.entity.isActive = showRiverMesh;

    if (stage === RiverPreviewStage.Mesh) {
      runtime.surfaceRenderer.setMaterial(riverMeshPreviewMaterial);
      runtime.foamRenderer.setMaterial(riverBankPreviewMaterial);
      return;
    }

    runtime.surfaceRenderer.setMaterial(runtime.material);
    runtime.foamRenderer.setMaterial(runtime.foamMaterial);
  };
  const rebuildRiver = (): void => {
    const warnings: string[] = [];
    let primaryQueryResult: RiverQueryResult | undefined;

    for (let i = 0; i < riverRuntimes.length; i++) {
      const runtime = riverRuntimes[i];
      runtime.normalizedConfig = normalizeRiverConfig(runtime.config);
      runtime.sampleResult = sampleRiverPath(runtime.normalizedConfig);
      const meshes = buildRiverMeshes(engine, runtime.sampleResult.points);
      runtime.foamRenderer.mesh = meshes.bankFoamMesh;
      runtime.surfaceRenderer.mesh = meshes.surfaceMesh;
      updateWaterMaterial(
        runtime.foamMaterial,
        runtime.normalizedConfig.material.foamColor,
        getFoamAlpha(runtime.normalizedConfig)
      );
      applyRiverPreviewStage(runtime);
      const queryResult = runtime.debugView.update(
        engine,
        createDebugRiverConfig(runtime.normalizedConfig),
        runtime.sampleResult.points
      );

      if (i === 0) {
        primaryQueryResult = queryResult;
      }

      warnings.push(
        ...getRiverConfigWarnings(runtime.normalizedConfig).map((warning) => `${runtime.config.id}: ${warning}`)
      );
    }

    if (primaryQueryResult) {
      updateQueryPanel(primaryQueryResult, warnings);
    }
  };
  const updateRiverVisuals = (time: number): void => {
    for (let i = 0; i < riverRuntimes.length; i++) {
      const runtime = riverRuntimes[i];
      updateRiverMaterial(
        runtime.material,
        runtime.normalizedConfig.material,
        runtime.normalizedConfig.flow.speed,
        time
      );
      updateWaterMaterial(
        runtime.foamMaterial,
        runtime.normalizedConfig.material.foamColor,
        getFoamAlpha(runtime.normalizedConfig)
      );
    }
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
    riverConfigs = createRiverConfigsFromNetwork(waterPcgExamples[activeExampleIndex].riverNetwork);
    rebuildExampleState();
  }
  function rebuildExampleState(): void {
    rebuildOceanMesh();
    updateOceanMaterial();
    rebuildRiverSegmentRuntimes();
    rebuildRiver();
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
          updateGridMesh(oceanMesh, oceanConfig.size, oceanConfig.resolution, oceanConfig.waterLevel, 0);
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
          rebuildRiver();
        });
      pathFolder
        .add(riverConfig.path, "segmentLength", 0.5, 8, 0.1)
        .name("Segment")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.path.segmentLength = value;
          });
          rebuildRiver();
        });
      pathFolder.open();

      const shapeFolder = gui.addFolder("River Shape");
      shapeFolder
        .add(riverConfig.shape, "width", 1, 18, 0.1)
        .name("Width")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.shape.width = value;
          });
          rebuildRiver();
        });
      shapeFolder
        .add(riverConfig.shape, "depth", 0, 5, 0.1)
        .name("Depth")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.shape.depth = value;
          });
          rebuildRiver();
        });
      shapeFolder
        .add(riverConfig.shape, "bankFeather", 0, 5, 0.1)
        .name("Bank")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.shape.bankFeather = value;
          });
          rebuildRiver();
        });
      shapeFolder.open();

      const flowFolder = gui.addFolder("River Flow");
      flowFolder
        .add(riverConfig.flow, "speed", 0, 4, 0.01)
        .name("Speed")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.flow.speed = value;
          });
          rebuildRiver();
        });
      flowFolder.open();

      const materialFolder = gui.addFolder("River Material");
      materialFolder
        .add(guiState, "materialPreset", Object.keys(RIVER_MATERIAL_OPTIONS) as RiverMaterialLabel[])
        .name("Preset")
        .onChange((label: RiverMaterialLabel) => {
          applyRiverPreset(RIVER_MATERIAL_OPTIONS[label]);
          rebuildRiver();
          rebuildGui();
        });
      materialFolder
        .addColor(riverConfig.material, "baseColor")
        .name("Base")
        .onChange((value: string) => {
          updateAllRiverConfigs((config) => {
            config.material.baseColor = value;
          });
          rebuildRiver();
        });
      materialFolder
        .addColor(riverConfig.material, "foamColor")
        .name("Foam")
        .onChange((value: string) => {
          updateAllRiverConfigs((config) => {
            config.material.foamColor = value;
          });
          rebuildRiver();
        });
      materialFolder
        .add(riverConfig.material, "foamIntensity", 0, 1, 0.01)
        .name("Foam Int")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.material.foamIntensity = value;
          });
          rebuildRiver();
        });
      materialFolder
        .add(riverConfig.material, "clarity", 0, 1, 0.01)
        .name("Clarity")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.material.clarity = value;
          });
          rebuildRiver();
        });
      materialFolder.open();

      const qualityFolder = gui.addFolder("Quality");
      qualityFolder
        .add(guiState, "quality", Object.keys(RIVER_QUALITY_OPTIONS) as RiverQualityLabel[])
        .name("Level")
        .onChange((label: RiverQualityLabel) => {
          applyQuality(RIVER_QUALITY_OPTIONS[label]);
          rebuildRiver();
          rebuildGui();
        });
      qualityFolder
        .add(riverConfig.quality, "maxSegmentCount", 32, 2048, 1)
        .name("Max Segments")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.quality.maxSegmentCount = value;
          });
          rebuildRiver();
        });

      const debugFolder = gui.addFolder("Debug");
      debugFolder
        .add(guiState, "previewStage", Object.keys(RIVER_PREVIEW_STAGE_OPTIONS) as RiverPreviewStageLabel[])
        .name("Stage")
        .onChange((label: RiverPreviewStageLabel) => {
          updateAllRiverConfigs((config) => {
            config.debug.previewStage = RIVER_PREVIEW_STAGE_OPTIONS[label];
          });
          rebuildRiver();
        });
      debugFolder
        .add(guiState, "debugMode", Object.keys(RIVER_DEBUG_MODE_OPTIONS) as RiverDebugModeLabel[])
        .name("Overlay")
        .onChange((label: RiverDebugModeLabel) => {
          updateAllRiverConfigs((config) => {
            config.debug.mode = RIVER_DEBUG_MODE_OPTIONS[label];
          });
          rebuildRiver();
        });
      debugFolder
        .add(riverConfig.debug, "queryT", 0, 1, 0.01)
        .name("Query T")
        .onChange((value: number) => {
          updateAllRiverConfigs((config) => {
            config.debug.queryT = value;
          });
          rebuildRiver();
        });
      debugFolder.add(queryPanelState, "inWater").name("In Water").listen();
      debugFolder.add(queryPanelState, "surfaceHeight").name("Height").listen();
      debugFolder.add(queryPanelState, "depth").name("Depth").listen();
      debugFolder.add(queryPanelState, "flow").name("Flow").listen();
      debugFolder.add(queryPanelState, "distanceToBank").name("Bank Dist").listen();
      debugFolder.add(queryPanelState, "warnings").name("Warnings").listen();
      debugFolder.open();
    }
  }

  rebuildExampleState();
  engine.run();

  const startTime = performance.now();
  const update = (): void => {
    const time = (performance.now() - startTime) / 1000;
    if (activeMode === WaterPreviewMode.Ocean) {
      updateGridMesh(oceanMesh, oceanConfig.size, oceanConfig.resolution, oceanConfig.waterLevel, time);
      updateOceanMaterial();
    } else {
      updateRiverVisuals(time);
    }
    requestAnimationFrame(update);
  };
  update();
});
