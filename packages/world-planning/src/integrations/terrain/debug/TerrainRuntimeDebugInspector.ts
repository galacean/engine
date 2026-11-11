import * as dat from "dat.gui";
import { FogMode, TonemappingMode, WeatherPresets } from "@galacean/engine";
import { DebugInspector, type DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import {
  TerrainRuntimeDebug,
  type TerrainGeometryDebugView,
  type TerrainSurfaceDebugView,
  type TerrainVegetationDebugView
} from "@galacean/engine-terrain/terrain/debug/TerrainRuntimeDebug";
import { TerrainDemoControls, type TerrainDemoCameraPose } from "./TerrainDemoControls.ts";
import type { TerrainWaterReflectionMode } from "../project/TerrainWaterRuntime.ts";
import { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import {
  getTerrainFogModeDefaultExponent,
  TerrainLightingRuntime,
  type TerrainLightingRuntimeSnapshot,
  type TerrainLightingVisualTuning
} from "../lighting/TerrainLightingRuntime.ts";
import {
  TerrainProbeVolumeAuthoring,
  type TerrainProbeVolumeScenario
} from "../lighting/TerrainProbeVolumeAuthoring.ts";
import {
  WorldEnvironmentRuntime,
  TERRAIN_SEASON_DEFAULT_COMPOSITIONS,
  type TerrainSeason,
  type TerrainSurfaceWaterTuning
} from "../environment/WorldEnvironmentRuntime.ts";
import type {
  TerrainSeasonColor,
  TerrainSeasonPalette
} from "@galacean/engine-environment/terrain/environment/SceneSeasonPalette";
import {
  TERRAIN_SURFACE_HYDROLOGY_TIME_SCALE,
  TERRAIN_SURFACE_SNOW_MELT_TIME_SCALE,
  terrainRainRateToMillimetresPerHour
} from "@galacean/engine-environment/terrain/environment/SurfaceClimate";

type SkyLightingPresetId = keyof typeof WeatherPresets.skyLighting;
type CloudPresetId = keyof typeof WeatherPresets.cloud;
type PrecipitationPresetId = keyof typeof WeatherPresets.precipitation;
type WindPresetId = keyof typeof WeatherPresets.wind;
type LightningPresetId = keyof typeof WeatherPresets.lightning;

const DEBUG_READOUT_UPDATE_INTERVAL_MS = 100;

const ENVIRONMENT_COMPOSITION_TEMPLATES = {
  clearDay: {
    timeHours: 10,
    skyLighting: "clear",
    cloud: "scattered",
    precipitation: "none",
    wind: "breeze",
    lightning: "none"
  },
  rainyDay: {
    timeHours: 10,
    skyLighting: "overcast",
    cloud: "overcast",
    precipitation: "rain",
    wind: "breeze",
    lightning: "none"
  },
  storm: {
    timeHours: 15,
    skyLighting: "storm",
    cloud: "dense",
    precipitation: "heavyRain",
    wind: "gale",
    lightning: "thunderstorm"
  },
  snowyDay: {
    timeHours: 10,
    skyLighting: "overcast",
    cloud: "overcast",
    precipitation: "snow",
    wind: "breeze",
    lightning: "none"
  }
} as const;

type EnvironmentCompositionTemplateId = "custom" | keyof typeof ENVIRONMENT_COMPOSITION_TEMPLATES;

const SKY_LIGHTING_OPTIONS = {
  "Clear / 晴朗": "clear",
  "Overcast / 阴天": "overcast",
  "Storm lighting / 风暴光照": "storm",
  "Fog / 浓雾": "fog"
} as const;

const CLOUD_OPTIONS = {
  "Clear / 无云": "clear",
  "Scattered / 疏云": "scattered",
  "Overcast / 阴云": "overcast",
  "Dense / 密云": "dense"
} as const;

const PRECIPITATION_OPTIONS = {
  "None / 无降水": "none",
  "Rain / 下雨": "rain",
  "Heavy rain / 暴雨": "heavyRain",
  "Snow / 下雪": "snow"
} as const;

const SEASON_OPTIONS = {
  "Spring / 春季": "spring",
  "Summer / 夏季": "summer",
  "Autumn / 秋季": "autumn",
  "Winter / 冬季": "winter"
} as const;

const WIND_OPTIONS = {
  "Off / 无风": "off",
  "Calm / 静风": "calm",
  "Breeze / 和风": "breeze",
  "Windy / 强风": "windy",
  "Gale / 烈风": "gale"
} as const;

const LIGHTNING_OPTIONS = {
  "Off / 无雷电": "none",
  "Thunderstorm / 雷暴": "thunderstorm"
} as const;

const COMPOSITION_LABELS = {
  season: { spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季" },
  skyLighting: { clear: "晴朗", overcast: "阴天", storm: "风暴光照", fog: "浓雾" },
  cloud: { clear: "无云", scattered: "疏云", overcast: "阴云", dense: "密云" },
  precipitation: { none: "无降水", rain: "下雨", heavyRain: "暴雨", snow: "下雪" },
  wind: { off: "无风", calm: "静风", breeze: "和风", windy: "强风", gale: "烈风" },
  lightning: { none: "无雷电", thunderstorm: "雷暴" }
} as const;

type MutableVisualLightingTuning = {
  -readonly [K in keyof TerrainLightingVisualTuning]: TerrainLightingVisualTuning[K];
};

type MutableSurfaceWaterTuning = {
  -readonly [K in keyof TerrainSurfaceWaterTuning]: TerrainSurfaceWaterTuning[K];
};

interface LightingAuthoringControlsHandle {
  synchronize(): void;
  destroy(): void;
}

type TerrainSeasonPaletteCategory = keyof TerrainSeasonPalette;

interface TerrainSeasonPaletteControlState {
  color: string;
  influence: number;
}

const SHARED_VIEW_OPTIONS = {
  "Final Lit / 最终光照": "final-lit",
  "Albedo / 反照率": "albedo",
  "Geometry Normal / 几何法线": "geometry-normal",
  "Shading Normal / 着色法线": "shading-normal",
  "Direct Light / 直接光": "direct-light",
  "Environment / 环境光": "environment-light",
  "Shadow / 阴影衰减": "shadow-attenuation"
} as const;

const TERRAIN_VIEW_OPTIONS = {
  ...SHARED_VIEW_OPTIONS,
  "Source Height / 源高度": "source-height",
  "Rendered Height / 渲染高度": "rendered-height",
  "Height Error / 高度误差": "height-error",
  "Region + Seam / 区域接缝": "region-seam",
  "Layer Weights / 图层权重": "layer-weights",
  "Holes / 地形洞": "holes",
  "Clipmap LOD + Morph / 层级过渡": "clipmap-lod",
  "Sampling Mip / 采样层级": "sampling-mip"
} as const;

const SURFACE_VIEW_OPTIONS = {
  ...SHARED_VIEW_OPTIONS,
  "LOD Fade / 层级渐变": "lod-fade"
} as const;

const VEGETATION_VIEW_OPTIONS = {
  ...SURFACE_VIEW_OPTIONS,
  "Alpha / 透明度": "alpha",
  "Alpha Cutoff / 透明裁剪": "alpha-cutoff",
  "Wind Weight / 风权重": "wind-weight",
  "Wind Displacement / 风位移": "wind-displacement",
  "Dither Threshold / 抖动阈值": "dither-threshold",
  "Geometry Parity / 阴影几何一致性": "geometry-parity"
} as const;

/** Camera controls that a page may own outside the shared dat.gui inspector. */
export type TerrainRuntimeDebugInspectorCameraControl =
  | "pose"
  | "movementSpeed"
  | "groundCollision"
  | "groundClearance";

/** Inputs for the compact runtime diagnostic panel. */
export interface TerrainRuntimeDebugInspectorOptions {
  /** Optional world-owned natural audio; controls live only in the debug inspector. */
  audio?: {
    getSnapshot(): { muted: boolean; volume: number };
    setMuted(value: boolean): void;
    setVolume(value: number): void;
  };
  /** Optional renderer-diagnostic controller used only by pages that ship diagnostic Materials. */
  debug?: TerrainRuntimeDebug;
  /** Stable camera, navigation, and Scene-element controls retained by the demo shell. */
  controls: TerrainDemoControls;
  /** Scene-owned post-processing profile receiving detailed debug controls. */
  postProcess: TerrainPostProcessRuntime;
  /** Shared day/night state and editable probe-bake lighting source. */
  lighting: TerrainLightingRuntime;
  /** Weather composition, surface climate, wind forcing, and precipitation presentation. */
  environment: WorldEnvironmentRuntime;
  /** Complete-world adaptive probe-volume authoring controller. */
  probeVolume: TerrainProbeVolumeAuthoring;
  /** Camera controls that are rendered by the page shell instead of the shared inspector. */
  readonly hiddenCameraControls?: readonly TerrainRuntimeDebugInspectorCameraControl[];
  /** Optional page-owned road and grass palette controls. */
  readonly surfacePalette?: TerrainSurfacePaletteDebugControl;
  /** Optional page-owned runtime grass-density and blade-height controls. */
  readonly grassDensity?: TerrainGrassDensityDebugControl;
  /** Optional independent detail categories replacing the aggregate Details visibility row. */
  readonly detailVisibility?: {
    isVisible(category: "grass" | "flower"): boolean;
    setVisible(category: "grass" | "flower", visible: boolean): void;
  };
  /** Optional page-owned exact-Prefab spatial scheduling A/B controls. */
  readonly exactInstanceSpatial?: TerrainExactInstanceSpatialDebugControl;
}

/** Live renderer-only surface palette bridge exposed by the shared Debug inspector. */
export interface TerrainSurfacePaletteDebugControl {
  /** Palette-only presets leave density, field coordinates and lighting unchanged. */
  readonly presets?: Readonly<
    Record<
      string,
      Pick<TerrainGrassColorFieldDebugTuning, "colorA" | "colorB" | "roadColorA" | "roadColorB" | "saturation">
    >
  >;
  /** @returns Current road colour and shared Terrain/grass-root colour field. */
  getTuning(): TerrainSurfacePaletteDebugTuning;
  /** Applies one complete road and grass palette without rebuilding baked world data. */
  setTuning(tuning: TerrainSurfacePaletteDebugTuning): void;
  /** Restores the page-owned authored defaults for every control in this palette. */
  resetTuning(): void;
}

/** Runtime-only grass density and blade-height bridge kept independent from colour-field tuning. */
export interface TerrainGrassDensityDebugControl {
  /** Optional physical-density control; older runtimes retain the multiplier UI. */
  perSquareMetre?: {
    getValue(): number;
    setValue(density: number): void;
    resetValue(): void;
  };
  /** Optional distance thinning controls for runtimes that support stable grass prefixes. */
  distanceLod?: {
    /** Read the current distance thinning switch. */
    getEnabled(): boolean;
    /** Enable thinning or restore original full-density submissions. */
    setEnabled(enabled: boolean): void;
  };
  /** @returns Current multiplier applied to the authored grass DensityField. */
  getMultiplier(): number;
  /** Applies a multiplier from zero to two without rebuilding the DensityField. */
  setMultiplier(multiplier: number): void;
  /** Restores the authored full-density multiplier. */
  resetMultiplier(): void;
  /** @returns Current grass height range in world metres. */
  getHeightRangeMetres(): Readonly<{ minimum: number; maximum: number }>;
  /** Applies physical grass height; each runtime owns the corresponding model scaling. */
  setHeightRangeMetres(minimum: number, maximum: number): void;
  /** Restores the authored grass height range. */
  resetHeightRange(): void;
}

/** Baked world-space palette controls shared by Terrain grass and grass roots. */
export interface TerrainGrassColorFieldDebugTuning {
  readonly enabled: boolean;
  readonly colorA: readonly [number, number, number];
  readonly colorB: readonly [number, number, number];
  readonly roadColorA?: readonly [number, number, number];
  readonly roadColorB?: readonly [number, number, number];
  readonly roadColorStrength?: number;
  readonly roadColorContrast?: number;
  readonly roadColorMidpoint?: number;
  readonly colorOverrideA?: readonly [number, number, number];
  readonly colorOverrideB?: readonly [number, number, number];
  readonly saturation: number;
  readonly uvScale: number;
  readonly angleRadians: number;
  readonly offset: readonly [number, number];
  readonly softnessMetres: number;
  readonly vistaSoftnessMetres?: number;
  readonly vistaContrast?: number;
  readonly vistaRepeatSizeMetres?: number;
  readonly vistaBlendStartMetres: number;
  readonly vistaBlendEndMetres: number;
  readonly remapLow: number;
  readonly remapHigh: number;
}

/** Road colour plus the baked grass palette edited by the top-level colour panel. */
export interface TerrainSurfacePaletteDebugTuning {
  readonly roadColor: readonly [red: number, green: number, blue: number];
  readonly grass: TerrainGrassColorFieldDebugTuning;
}

/** Runtime bridge for category-independent exact-Prefab spatial scheduling diagnostics. */
export interface TerrainExactInstanceSpatialDebugControl {
  /** @returns Active linear baseline or Cell implementation. */
  getMode(): "linear" | "cell";
  /**
   * Selects the exact-Prefab spatial scheduling implementation.
   * @param mode Unchanged per-frame linear baseline or Cell broad phase.
   * @returns Nothing.
   */
  setMode(mode: "linear" | "cell"): void;
  /** @returns Horizontal Cell edge length in metres. */
  getCellSizeMetres(): number;
  /**
   * Rebuilds the exact-Prefab broad-phase ownership grid.
   * @param cellSizeMetres Finite positive horizontal Cell edge length in metres.
   * @returns Nothing.
   * @throws {RangeError} When the Cell size is not finite and positive.
   */
  setCellSizeMetres(cellSizeMetres: number): void;
}

/** Compact diagnostic panel limited to current renderer and editor acceptance needs. */
export class TerrainRuntimeDebugInspector {
  /** Underlying dat.gui instance used by browser interaction tests. */
  readonly gui: dat.GUI;
  /** Scoped host for page-owned terrain authoring. */
  readonly terrainFolderHost: DebugInspectorPanelHost;
  /** Scoped host for page-owned grass and vegetation authoring. */
  readonly grassFolderHost: DebugInspectorPanelHost;
  /** Scoped host for page-owned procedural-tree material authoring. */
  readonly treeFolderHost: DebugInspectorPanelHost;
  /** Scoped host for page-owned rock and scene-prop authoring. */
  readonly rockFolderHost: DebugInspectorPanelHost;
  /** Scoped host for Water-owned controls. */
  readonly waterFolderHost: DebugInspectorPanelHost;
  /** Scoped host for the dedicated screen-space-reflection authoring category. */
  readonly ssrFolderHost: DebugInspectorPanelHost;
  /** Scoped host for weather-composition authoring. */
  readonly climateFolderHost: DebugInspectorPanelHost;
  /** Scoped host for the dedicated volumetric-cloud authoring category. */
  readonly cloudFolderHost: DebugInspectorPanelHost;
  /** Scoped host that nests development-only Water tuning below the canonical Water group. */
  readonly waterDevToolsFolderHost: DebugInspectorPanelHost;
  private readonly _inspector: DebugInspector;
  private _gameplayFolderHost?: DebugInspectorPanelHost;

  /** Returns the lazily mounted gameplay category for page-owned modules. */
  get gameplayFolderHost(): DebugInspectorPanelHost {
    return (this._gameplayFolderHost ??= createPanelHost(this._inspector, this._inspector.folder("玩法", true)));
  }
  private readonly _lightingAuthoringControls: LightingAuthoringControlsHandle;
  private readonly _stopEnvironmentSynchronization: () => void;
  private readonly _waterReflectionState: { waterReflectionMode: TerrainWaterReflectionMode };
  private readonly _waterReflectionController?: dat.GUIController;

  /**
   * Mounts the compact panel and connects it to one runtime-debug controller.
   * @param options Runtime controller and live readout provider.
   */
  constructor(options: TerrainRuntimeDebugInspectorOptions) {
    const runtimeDebug = options.debug;
    const sceneState = options.controls.getSnapshot();
    const postProcessState = options.postProcess.getDebugSnapshot();
    const hiddenCameraControls = new Set(options.hiddenCameraControls);
    let syncGroundControls = (_pose: TerrainDemoCameraPose): void => undefined;

    const inspector = (this._inspector = new DebugInspector("Terrain runtime diagnostics"));
    const gui = (this.gui = inspector.gui);
    gui.open();
    let categoryIndex = 1;
    const category = (title: string, open = false): dat.GUI =>
      inspector.folder(`${String(categoryIndex++).padStart(2, "0")} ${title}`, open);

    if (options.audio) {
      const audio = options.audio;
      const snapshot = audio.getSnapshot();
      const state = {
        enabled: !snapshot.muted,
        volume: snapshot.volume
      };
      const folder = category("Audio / 声音");
      folder
        .add(state, "enabled")
        .name("自然声音")
        .onChange((value: boolean) => audio.setMuted(!value));
      folder
        .add(state, "volume", 0, 1, 0.01)
        .name("音量")
        .onChange((value: number) => audio.setVolume(value));
    }

    const hasCameraControls = ["pose", "movementSpeed", "groundCollision", "groundClearance"].some(
      (control) => !hiddenCameraControls.has(control as TerrainRuntimeDebugInspectorCameraControl)
    );
    const scene = hasCameraControls ? category("Camera / 相机", false) : undefined;
    if (!hiddenCameraControls.has("pose")) {
      scene!
        .add(sceneState, "pose", {
          "Walk / 漫游": "walk",
          "Overview / 全景": "overview",
          "Vegetation / 植被": "vegetation",
          "Water / 水体": "water",
          "River / 河流": "river"
        })
        .name("Camera / 视角")
        .onChange((pose: TerrainDemoCameraPose) => {
          options.controls.setPose(pose);
          syncGroundControls(pose);
        });
    }
    if (!hiddenCameraControls.has("movementSpeed")) {
      scene!
        .add(sceneState, "movementSpeed", 1, 120, 1)
        .name("Move speed / 漫游速度")
        .onChange((speed: number) => options.controls.setMovementSpeed(speed));
    }
    const groundCollision = hiddenCameraControls.has("groundCollision")
      ? undefined
      : scene!
          .add(sceneState, "groundCollision")
          .name("Ground collision / 地面碰撞")
          .onChange((enabled: boolean) => options.controls.setGroundCollision(enabled));
    const groundClearance = hiddenCameraControls.has("groundClearance")
      ? undefined
      : scene!
          .add(sceneState, "groundClearance", 0.5, 3, 0.01)
          .name("Ground clearance / 离地高度")
          .onChange((height: number) => options.controls.setGroundClearance(height));
    syncGroundControls = (pose: TerrainDemoCameraPose): void => {
      const available = pose !== "overview";
      for (const controller of [groundCollision, groundClearance]) {
        if (!controller) continue;
        const row = controller.domElement.parentElement;
        if (!row) {
          continue;
        }
        row.style.opacity = available ? "1" : "0.45";
        row.style.pointerEvents = available ? "auto" : "none";
      }
    };
    syncGroundControls(sceneState.pose);

    const terrain = category("Terrain / 地形", false);
    const vegetation = category("Grass & Vegetation / 草地与植被", false);
    const proceduralTrees = category("Procedural Trees / 程序化树", false);
    const rocks = category("Rocks / 岩石", false);
    const water = category("Water / 水", false);
    const ssr = category("Screen-space Reflection / 屏幕空间反射", false);
    const season = category("Season / 季节", false);
    const dayNight = category("Day & Night / 昼夜", false);
    const climate = category("Climate / 气候", false);
    const clouds = category("Volumetric Clouds / 体积云", false);
    const lighting = category("Lighting / 光照", false);
    const postProcess = category("Post-processing / 后处理", false);
    const rendering = category("Rendering / 渲染", false);
    const debug = runtimeDebug ? category("Debug / 调试", false) : undefined;
    this.terrainFolderHost = createPanelHost(inspector, terrain);
    this.grassFolderHost = createPanelHost(inspector, vegetation);
    this.treeFolderHost = createPanelHost(inspector, proceduralTrees);
    this.rockFolderHost = createPanelHost(inspector, rocks);
    this.waterFolderHost = createPanelHost(inspector, water);
    this.ssrFolderHost = createPanelHost(inspector, ssr);
    this.climateFolderHost = createPanelHost(inspector, climate);
    this.cloudFolderHost = createPanelHost(inspector, clouds);
    this.waterDevToolsFolderHost = createWaterDevelopmentHost(inspector, water);

    if (options.surfacePalette) {
      mountRoadAndGrassControls(inspector, vegetation, options.surfacePalette, options.grassDensity);
    }

    const elementFolders = {
      terrain,
      details: vegetation,
      trees: vegetation,
      prefabs: rocks,
      water,
      lake: water,
      ocean: water
    };
    if (options.detailVisibility) {
      const visibility = options.detailVisibility;
      const state = { grass: visibility.isVisible("grass"), flower: visibility.isVisible("flower") };
      vegetation
        .add(state, "grass")
        .name("Grass / 草叶")
        .onChange((visible: boolean) => visibility.setVisible("grass", visible));
      vegetation
        .add(state, "flower")
        .name("Plants / 程序化花草")
        .onChange((visible: boolean) => visibility.setVisible("flower", visible));
    }
    for (const property of sceneState.elementGroups) {
      if (property === "details" && options.detailVisibility) continue;
      if ((property === "water" || property === "lake" || property === "ocean") && !sceneState.availability[property])
        continue;
      const capability = sceneState.capabilities[property];
      const controller = elementFolders[property]
        .add(sceneState, property)
        .name(capability.label)
        .onChange((visible: boolean) => options.controls.setElementVisible(property, visible));
      setRuntimeControlAvailability(
        controller,
        sceneState.availability[property],
        capability.label,
        capability.category
      );
    }

    const lod = inspector.subfolder(rendering, "LOD & Culling / 层级与剔除", true);
    const lodEnabled = lod
      .add(sceneState, "lodEnabled")
      .name("Mesh LOD / 网格层级")
      .onChange((enabled: boolean) => options.controls.setLodTuning(enabled, sceneState.lodDistanceScale));
    const lodDistanceScale = lod
      .add(sceneState, "lodDistanceScale", 0.25, 2, 0.01)
      .name("Distance scale / 距离倍率")
      .onChange((distanceScale: number) => options.controls.setLodTuning(sceneState.lodEnabled, distanceScale));
    setRuntimeControlAvailability(lodEnabled, sceneState.availability.lod, "Mesh LOD / 网格层级");
    setRuntimeControlAvailability(lodDistanceScale, sceneState.availability.lod, "Distance scale / 距离倍率");
    if (options.exactInstanceSpatial) {
      const exactInstanceSpatialState = {
        mode: options.exactInstanceSpatial.getMode(),
        cellSizeMetres: options.exactInstanceSpatial.getCellSizeMetres()
      };
      lod
        .add(exactInstanceSpatialState, "mode", {
          "CELL / 网格": "cell",
          "LINEAR / 线性": "linear"
        })
        .name("Exact Prefabs / 精确实例")
        .onChange((mode: "linear" | "cell") => options.exactInstanceSpatial!.setMode(mode));
      lod
        .add(exactInstanceSpatialState, "cellSizeMetres", 32, 256, 16)
        .name("Cell size / 网格米")
        .onFinishChange((cellSizeMetres: number) => options.exactInstanceSpatial!.setCellSizeMetres(cellSizeMetres));
    }

    if (runtimeDebug) {
      const renderingState = runtimeDebug.getSnapshot().lighting;
      lighting
        .add(renderingState, "direct")
        .name("Direct light / 直接光")
        .onChange((value: boolean) => {
          runtimeDebug.setDirectLightEnabled(value);
        });
      lighting
        .add(renderingState, "environment")
        .name("Environment / 环境光")
        .onChange((value: boolean) => {
          runtimeDebug.setEnvironmentEnabled(value);
        });
      lighting
        .add(renderingState, "shadows")
        .name("Shadows / 阴影")
        .onChange((value: boolean) => {
          runtimeDebug.setShadowsEnabled(value);
        });
      lighting
        .add(renderingState, "fog")
        .name("Fog / 雾")
        .onChange((value: boolean) => {
          runtimeDebug.setFogEnabled(value);
        });
    }
    const shadowCascadeState = options.lighting.getShadowCascadeTuning();
    const shadowCascades = inspector.subfolder(lighting, "Shadow cascades / 级联阴影", true);
    const shadowDistanceController = shadowCascades
      .add(shadowCascadeState, "distance", 10, 500, 1)
      .name("Distance / 距离")
      .onChange((distance: number) => options.lighting.setShadowCascadeTuning({ distance }));
    const shadowDistributionController = shadowCascades
      .add(shadowCascadeState, "distribution", 1, 30, 0.05)
      .name("Distribution / 分布密度")
      .onChange((distribution: number) => options.lighting.setShadowCascadeTuning({ distribution }));
    let restorePostProcess: (() => void) | undefined;
    const editPostProcess =
      <T>(apply: (value: T) => void) =>
      (value: T): void => {
        restorePostProcess ??= options.postProcess.captureDebugReset();
        apply(value);
      };
    if (runtimeDebug) {
      postProcess
        .add(postProcessState, "enabled")
        .name("Post process / 后处理")
        .onChange(editPostProcess((enabled: boolean) => runtimeDebug.setPostProcessEnabled(enabled)));
    }
    const colorAdjustments = inspector.subfolder(postProcess, "Color Adjustments / 颜色调整", true);
    colorAdjustments
      .add(postProcessState.colorAdjustments, "enabled")
      .name("Enabled / 启用")
      .onChange(editPostProcess((enabled: boolean) => options.postProcess.setColorAdjustmentsEnabled(enabled)));
    colorAdjustments
      .add(postProcessState.colorAdjustments, "temperature", -100, 100, 1)
      .name("Temperature / 色温")
      .onChange(editPostProcess((temperature: number) => options.postProcess.setTemperature(temperature)));
    colorAdjustments
      .add(postProcessState.colorAdjustments, "tint", -100, 100, 1)
      .name("Tint / 色调")
      .onChange(editPostProcess((tint: number) => options.postProcess.setTint(tint)));
    colorAdjustments
      .add(postProcessState.colorAdjustments, "contrast", -100, 100, 1)
      .name("Contrast / 对比度")
      .onChange(editPostProcess((contrast: number) => options.postProcess.setContrast(contrast)));
    colorAdjustments
      .add(postProcessState.colorAdjustments, "saturation", -100, 100, 1)
      .name("Saturation / 饱和度")
      .onChange(editPostProcess((saturation: number) => options.postProcess.setSaturation(saturation)));
    bindNumericInput(
      colorAdjustments
        .add(postProcessState.colorAdjustments, "postExposure", -10, 10, 0.01)
        .name("Post exposure / 后曝光")
        .onChange(editPostProcess((postExposure: number) => options.postProcess.setPostExposure(postExposure)))
    );
    postProcess
      .add(postProcessState, "tonemapping")
      .name("Tonemapping / 色调映射")
      .onChange(editPostProcess((enabled: boolean) => options.postProcess.setTonemappingEnabled(enabled)));
    postProcess
      .add(postProcessState, "tonemappingMode", {
        "Neutral / 中性": TonemappingMode.Neutral,
        "ACES / 电影": TonemappingMode.ACES
      })
      .name("Tonemapping mode / 色调映射模式")
      .onChange(
        editPostProcess((mode: number) => options.postProcess.setTonemappingMode(Number(mode) as TonemappingMode))
      );
    const bloom = inspector.subfolder(postProcess, "Bloom / 泛光", true);
    bloom
      .add(postProcessState.bloom, "enabled")
      .name("Enabled / 启用")
      .onChange(editPostProcess((enabled: boolean) => options.postProcess.setBloomEnabled(enabled)));
    const applyBloomTint = (): void => {
      const { tintR, tintG, tintB } = postProcessState.bloom;
      options.postProcess.setBloomTint(tintR, tintG, tintB);
    };
    for (const [key, channel] of [
      ["tintR", "R"],
      ["tintG", "G"],
      ["tintB", "B"]
    ] as const) {
      bloom
        .add(postProcessState.bloom, key, 0, 4, 0.001)
        .name(`Bloom tint ${channel} / 泛光颜色 ${channel}`)
        .onChange(editPostProcess(applyBloomTint));
    }
    bindNumericInput(
      bloom
        .add(postProcessState.bloom, "threshold", 0, 5, 0.01)
        .name("Bloom threshold / 泛光阈值")
        .onChange(editPostProcess((threshold: number) => options.postProcess.setBloomThreshold(threshold)))
    );
    bindNumericInput(
      bloom
        .add(postProcessState.bloom, "intensity", 0, 5, 0.01)
        .name("Bloom intensity / 泛光强度")
        .onChange(editPostProcess((intensity: number) => options.postProcess.setBloomIntensity(intensity)))
    );
    const synchronizePostProcessControls = (): void => {
      const current = options.postProcess.getDebugSnapshot();
      Object.assign(postProcessState, {
        enabled: current.enabled,
        tonemapping: current.tonemapping,
        tonemappingMode: current.tonemappingMode
      });
      Object.assign(postProcessState.colorAdjustments, current.colorAdjustments);
      Object.assign(postProcessState.bloom, current.bloom);
      const activeElement = document.activeElement;
      if (!colorAdjustments.domElement.contains(activeElement)) colorAdjustments.updateDisplay();
      if (!bloom.domElement.contains(activeElement)) bloom.updateDisplay();
    };
    this._lightingAuthoringControls = mountLightingAuthoringControls(
      inspector,
      lighting,
      options.lighting,
      options.probeVolume,
      synchronizePostProcessControls
    );
    bloom
      .add(postProcessState.bloom, "scatter", 0, 1, 0.01)
      .name("Bloom scatter / 泛光扩散")
      .onChange(editPostProcess((scatter: number) => options.postProcess.setBloomScatter(scatter)));
    inspector.addAction(postProcess, "重置后处理参数", () => {
      restorePostProcess?.();
      restorePostProcess = undefined;
      synchronizePostProcessControls();
      postProcess.updateDisplay();
    });
    const synchronizeLightingSource = (): void => {
      this._lightingAuthoringControls.synchronize();
      Object.assign(shadowCascadeState, options.lighting.getShadowCascadeTuning());
      shadowDistanceController.updateDisplay();
      shadowDistributionController.updateDisplay();
    };
    const synchronizeSurfaceWaterControls = mountSurfaceWaterControls(inspector, water, options.environment);
    this._stopEnvironmentSynchronization = mountEnvironmentControls(
      inspector,
      season,
      dayNight,
      climate,
      options.environment,
      options.lighting,
      synchronizeLightingSource,
      synchronizeSurfaceWaterControls
    );
    if (runtimeDebug && debug) {
      const snapshot = runtimeDebug.getSnapshot();
      const shaderState = {
        enabled: snapshot.enabled,
        terrain: snapshot.terrainView,
        surface: snapshot.surfaceView,
        vegetation: snapshot.vegetationView,
        wireframe: snapshot.wireframe,
        refresh: () => runtimeDebug.refreshBindings()
      };
      const shader = inspector.subfolder(debug, "Shader Debug / 着色诊断", true);
      shader
        .add(shaderState, "enabled")
        .name("Enabled / 启用")
        .onChange((value: boolean) => {
          runtimeDebug.setEnabled(value);
        });
      shader
        .add(shaderState, "terrain", TERRAIN_VIEW_OPTIONS)
        .name("Terrain / 地形")
        .onChange((view: TerrainGeometryDebugView) => runtimeDebug.setTerrainView(view));
      shader
        .add(shaderState, "surface", SURFACE_VIEW_OPTIONS)
        .name("Surface / 地表")
        .onChange((view: TerrainSurfaceDebugView) => runtimeDebug.setSurfaceView(view));
      shader
        .add(shaderState, "vegetation", VEGETATION_VIEW_OPTIONS)
        .name("Vegetation / 植被")
        .onChange((view: TerrainVegetationDebugView) => runtimeDebug.setVegetationView(view));
      shader
        .add(shaderState, "wireframe")
        .name("Wireframe / 线框")
        .onChange((value: boolean) => {
          runtimeDebug.setWireframe(value);
        });
      shader.add(shaderState, "refresh").name("Refresh bindings / 刷新绑定");
    }

    this._waterReflectionState = { waterReflectionMode: sceneState.waterReflectionMode };
    if (sceneState.availability.waterReflection) {
      this._waterReflectionController = water
        .add(this._waterReflectionState, "waterReflectionMode", {
          "Environment / 环境反射": "environment",
          "SSR / 屏幕空间反射": "ssr"
        })
        .name("Reflection / 反射")
        .onChange((mode: TerrainWaterReflectionMode) => {
          void options.controls.setWaterReflectionMode(mode).catch((error) => {
            console.error("[terrain-debug] Water reflection Look update failed", error);
          });
        });
      setRuntimeControlAvailability(
        this._waterReflectionController,
        sceneState.availability.waterReflection,
        "Reflection / 反射",
        "water-reflection",
        sceneState.availability.water
          ? "Reflection / 反射 · Environment or SSR / 环境或屏幕空间反射"
          : "Reflection / 反射 · unavailable / 当前 Seed 无运行时"
      );
      const reflectionRow = this._waterReflectionController.domElement.parentElement;
      if (reflectionRow) reflectionRow.id = "water-reflection-control";
      const reflectionSelect = this._waterReflectionController.domElement.querySelector<HTMLSelectElement>("select");
      if (reflectionSelect) {
        reflectionSelect.id = "water-reflection-mode";
        reflectionSelect.setAttribute("aria-label", "Water reflection mode");
      }
    }
  }

  /** Synchronizes the Water selector after a programmatic reflection-mode change. */
  synchronizeWaterReflectionMode(mode: TerrainWaterReflectionMode): void {
    this._waterReflectionState.waterReflectionMode = mode;
    this._waterReflectionController?.updateDisplay();
  }

  /** Releases the panel, its refresh timer, and DOM listeners. */
  destroy(): void {
    this._stopEnvironmentSynchronization();
    this._lightingAuthoringControls.destroy();
    this._inspector.destroy();
  }
}

function createPanelHost(inspector: DebugInspector, parent: dat.GUI): DebugInspectorPanelHost {
  return {
    gui: parent,
    folder: (title, open = true) => inspector.subfolder(parent, title, open),
    subfolder: (folder, title, open = true) => inspector.subfolder(folder, title, open),
    addReadout: (folder, label, outputId) => inspector.addReadout(folder, label, outputId),
    addAction: (folder, label, onClick) => inspector.addAction(folder, label, onClick),
    refreshLayout: () => inspector.refreshLayout()
  };
}

function createWaterDevelopmentHost(inspector: DebugInspector, waterFolder: dat.GUI): DebugInspectorPanelHost {
  return {
    ...createPanelHost(inspector, waterFolder),
    folder: (_title, open = true) => {
      const folder = inspector.subfolder(waterFolder, "Water System / 水系统", open);
      const item = folder.domElement.closest("li.folder");
      const list = item?.parentElement;
      if (item && list) list.insertBefore(item, list.querySelector(":scope > li.folder"));
      return folder;
    }
  };
}

function mountSeasonPaletteControls(
  inspector: DebugInspector,
  seasonFolder: dat.GUI,
  environment: WorldEnvironmentRuntime
): () => void {
  const paletteFolder = inspector.subfolder(seasonFolder, "Season Palette / 季节调色板", true);
  inspector.addReadout(
    paletteFolder,
    "Contract / 数据约定"
  )("颜色定义全局类别色调；Influence=0 保留原色，1 应用完整色调并保留素材与地块的明暗层次");
  const states = {} as Record<TerrainSeason, Record<TerrainSeasonPaletteCategory, TerrainSeasonPaletteControlState>>;
  const seasonLabels: Readonly<Record<TerrainSeason, string>> = {
    spring: "Spring / 春季",
    summer: "Summer / 夏季",
    autumn: "Autumn / 秋季",
    winter: "Winter / 冬季"
  };
  const categories: ReadonlyArray<readonly [TerrainSeasonPaletteCategory, string]> = [
    ["grass", "Grass + Terrain / 草与地面"],
    ["treeLeaf", "Tree Leaves / 树叶"],
    ["treeBark", "Tree Bark / 树干"]
  ];

  const writeState = (season: TerrainSeason): void => {
    const palette = environment.getSeasonPalette(season);
    const seasonState = states[season];
    for (const [category] of categories) {
      const color = palette[category];
      const target = seasonState[category];
      target.color = linearRgbToHex([color.r, color.g, color.b]);
      target.influence = color.influence;
    }
  };

  for (const season of Object.values(SEASON_OPTIONS)) {
    const palette = environment.getSeasonPalette(season);
    const seasonState = (states[season] = {} as Record<TerrainSeasonPaletteCategory, TerrainSeasonPaletteControlState>);
    const seasonFolder = inspector.subfolder(paletteFolder, seasonLabels[season], true);
    for (const [category, categoryLabel] of categories) {
      const source = palette[category];
      const state = (seasonState[category] = {
        color: linearRgbToHex([source.r, source.g, source.b]),
        influence: source.influence
      });
      const categoryFolder = inspector.subfolder(seasonFolder, categoryLabel, true);
      const apply = (): void => {
        const [r, g, b] = hexToLinearRgb(state.color);
        environment.setSeasonPaletteColor(season, category, {
          r,
          g,
          b,
          influence: state.influence
        });
      };
      categoryFolder.addColor(state, "color").name("Target tone / 目标色调").onChange(apply);
      const influenceController = categoryFolder
        .add(state, "influence", 0, 1, 0.01)
        .name("Influence / 色调影响")
        .onChange(apply);
      bindNumericInput(influenceController);
    }
  }

  const synchronize = (): void => {
    if (paletteFolder.domElement.contains(document.activeElement)) return;
    for (const season of Object.values(SEASON_OPTIONS)) writeState(season);
    paletteFolder.updateDisplay();
  };
  inspector.addAction(paletteFolder, "Reset palette / 重置季节调色板", () => {
    environment.resetSeasonPalettes();
    synchronize();
  });
  return synchronize;
}

function addSurfaceWaterNumber(
  folder: dat.GUI,
  state: MutableSurfaceWaterTuning,
  key: keyof TerrainSurfaceWaterTuning,
  label: string,
  minimum: number,
  maximum: number,
  step: number,
  apply: (key: keyof TerrainSurfaceWaterTuning, value: number) => void
): void {
  const controller = folder
    .add(state, key, minimum, maximum, step)
    .name(label)
    .onChange((value: number) => apply(key, value));
  bindNumericInput(controller);
}

function mountEnvironmentControls(
  inspector: DebugInspector,
  seasonFolder: dat.GUI,
  dayNightFolder: dat.GUI,
  climateFolder: dat.GUI,
  environment: WorldEnvironmentRuntime,
  lighting: TerrainLightingRuntime,
  synchronizeLightingSource: () => void,
  synchronizeSurfaceWaterControls: () => void
): () => void {
  const snapshot = environment.getSnapshot();
  const lightingSnapshot = lighting.getSnapshot();
  const state = {
    template: "custom" as EnvironmentCompositionTemplateId,
    playing: lightingSnapshot.playing,
    timeHours: lightingSnapshot.timeHours,
    timeScale: lightingSnapshot.timeScale,
    season: snapshot.season.id,
    skyLighting: "clear" as SkyLightingPresetId,
    cloud: "scattered" as CloudPresetId,
    precipitation: "none" as PrecipitationPresetId,
    wind: "breeze" as WindPresetId,
    lightning: "none" as LightningPresetId,
    transitionDuration: snapshot.transitionDuration
  };
  const markCompositionCustom = (): void => {
    if (state.template === "custom") return;
    state.template = "custom";
    templateController.updateDisplay();
  };
  const templateController = climateFolder
    .add(state, "template", {
      "Custom / 自由组合": "custom",
      "Clear + dry / 晴朗 + 无降水": "clearDay",
      "Overcast + rain / 阴天 + 下雨": "rainyDay",
      "Storm composition / 风暴组合": "storm",
      "Overcast + snow / 阴天 + 下雪": "snowyDay"
    })
    .name("Quick fill / 快捷填充")
    .onChange((templateId: EnvironmentCompositionTemplateId) => {
      if (templateId === "custom") return;
      const template = ENVIRONMENT_COMPOSITION_TEMPLATES[templateId];
      state.playing = false;
      state.timeHours = template.timeHours;
      state.skyLighting = template.skyLighting;
      state.cloud = template.cloud;
      state.precipitation = template.precipitation;
      state.wind = template.wind;
      state.lightning = template.lightning;
      lighting.setTuning({ playing: false, timeHours: template.timeHours });
      environment.setSkyLighting(WeatherPresets.skyLighting[template.skyLighting]);
      environment.setCloud(WeatherPresets.cloud[template.cloud]);
      environment.setPrecipitation(WeatherPresets.precipitation[template.precipitation]);
      environment.setWind(WeatherPresets.wind[template.wind]);
      environment.setLightning(WeatherPresets.lightning[template.lightning]);
      synchronizeLightingSource();
      for (const controller of compositionControllers) controller.updateDisplay();
    });
  const playingController = dayNightFolder
    .add(state, "playing")
    .name("Auto day/night / 自动昼夜")
    .onChange((playing: boolean) => {
      markCompositionCustom();
      lighting.setTuning({ playing });
    });
  const timeScaleController = dayNightFolder
    .add(state, "timeScale", 0, 7200, 1)
    .name("Speed / 速度（模拟秒/秒）")
    .onChange((timeScale: number) => {
      markCompositionCustom();
      lighting.setTuning({ timeScale });
    });
  bindNumericInput(timeScaleController);
  const timeController = dayNightFolder
    .add(state, "timeHours", 0, 24, 0.05)
    .name("Time / 时刻")
    .onChange((timeHours: number) => {
      markCompositionCustom();
      state.playing = false;
      lighting.setTuning({ playing: false, timeHours });
      synchronizeLightingSource();
      playingController.updateDisplay();
    });
  bindNumericInput(timeController);
  const seasonController = seasonFolder
    .add(state, "season", SEASON_OPTIONS)
    .name("Season / 季节")
    .onChange((season: TerrainSeason) => {
      markCompositionCustom();
      const defaults = TERRAIN_SEASON_DEFAULT_COMPOSITIONS[season];
      state.skyLighting = defaults.skyLighting;
      state.cloud = defaults.cloud;
      state.precipitation = defaults.precipitation;
      environment.setSeason(season);
      skyLightingController.updateDisplay();
      cloudController.updateDisplay();
      precipitationController.updateDisplay();
      synchronizeLightingSource();
    });
  const transitionController = seasonFolder
    .add(state, "transitionDuration", 0, 20, 0.1)
    .name("Environment transition duration / 环境过渡秒数（全局）")
    .onChange((duration: number) => environment.setTransitionDuration(duration));
  bindNumericInput(transitionController);
  const synchronizeSeasonPalette = mountSeasonPaletteControls(inspector, seasonFolder, environment);
  const skyLightingController = climateFolder
    .add(state, "skyLighting", SKY_LIGHTING_OPTIONS)
    .name("Sky lighting / 天空光照")
    .onChange((preset: SkyLightingPresetId) => {
      markCompositionCustom();
      environment.setSkyLighting(WeatherPresets.skyLighting[preset]);
      synchronizeLightingSource();
    });
  const cloudController = climateFolder
    .add(state, "cloud", CLOUD_OPTIONS)
    .name("Cloud / 云层")
    .onChange((preset: CloudPresetId) => {
      markCompositionCustom();
      environment.setCloud(WeatherPresets.cloud[preset]);
    });
  const precipitationController = climateFolder
    .add(state, "precipitation", PRECIPITATION_OPTIONS)
    .name("Precipitation / 降水")
    .onChange((preset: PrecipitationPresetId) => {
      markCompositionCustom();
      environment.setPrecipitation(WeatherPresets.precipitation[preset]);
    });
  const windController = climateFolder
    .add(state, "wind", WIND_OPTIONS)
    .name("Wind / 风力")
    .onChange((preset: WindPresetId) => {
      markCompositionCustom();
      environment.setWind(WeatherPresets.wind[preset]);
    });
  inspector.addAction(climateFolder, "Trigger gust / 触发阵风", () => environment.triggerWindGust(0.85));
  const lightningController = climateFolder
    .add(state, "lightning", LIGHTNING_OPTIONS)
    .name("Lightning / 雷电")
    .onChange((preset: LightningPresetId) => {
      markCompositionCustom();
      environment.setLightning(WeatherPresets.lightning[preset]);
    });
  const compositionControllers = [
    playingController,
    timeController,
    seasonController,
    skyLightingController,
    cloudController,
    precipitationController,
    windController,
    lightningController
  ];
  const updateSceneSeasonReadout = inspector.addReadout(seasonFolder, "Scene season uniforms / 场景季节 Uniform");
  const updateCombination = inspector.addReadout(climateFolder, "Current combination / 当前组合");

  const updateReadout = inspector.addReadout(climateFolder, "Runtime diagnostics / 运行诊断");
  let active = true;
  let updateTimer = 0;
  const synchronize = (): void => {
    if (!active) return;
    const current = environment.getSnapshot();
    const currentLighting = lighting.getSnapshot();
    state.playing = currentLighting.playing;
    state.timeHours = currentLighting.timeHours;
    state.timeScale = currentLighting.timeScale;
    const activeElement = document.activeElement;
    for (const controller of [playingController, timeController, timeScaleController]) {
      if (!controller.domElement.contains(activeElement)) controller.updateDisplay();
    }
    synchronizeSurfaceWaterControls();
    if (state.transitionDuration !== current.transitionDuration) {
      state.transitionDuration = current.transitionDuration;
      transitionController.updateDisplay();
    }
    if (state.season !== current.season.id) {
      state.season = current.season.id;
      seasonController.updateDisplay();
    }
    synchronizeSeasonPalette();
    updateSceneSeasonReadout(
      `scene_SeasonState = [${current.season.weights.spring.toFixed(3)}, ` +
        `${current.season.weights.summer.toFixed(3)}, ${current.season.weights.autumn.toFixed(3)}, ` +
        `${current.season.weights.winter.toFixed(3)}]\n` +
        `scene_GrassSeasonColor = [${current.seasonColors.grass.r.toFixed(3)}, ` +
        `${current.seasonColors.grass.g.toFixed(3)}, ${current.seasonColors.grass.b.toFixed(3)}, ` +
        `${current.seasonColors.grass.influence.toFixed(3)}]\n` +
        `scene_TreeLeafSeasonColor = [${current.seasonColors.treeLeaf.r.toFixed(3)}, ` +
        `${current.seasonColors.treeLeaf.g.toFixed(3)}, ${current.seasonColors.treeLeaf.b.toFixed(3)}, ` +
        `${current.seasonColors.treeLeaf.influence.toFixed(3)}]\n` +
        `scene_TreeBarkSeasonColor = [${current.seasonColors.treeBark.r.toFixed(3)}, ` +
        `${current.seasonColors.treeBark.g.toFixed(3)}, ${current.seasonColors.treeBark.b.toFixed(3)}, ` +
        `${current.seasonColors.treeBark.influence.toFixed(3)}]`
    );
    updateCombination(
      `${formatHours(currentLighting.timeHours)}（${currentLighting.playing ? "自动昼夜" : "固定时刻"}） + ` +
        `${COMPOSITION_LABELS.season[state.season]} + ` +
        `${COMPOSITION_LABELS.skyLighting[state.skyLighting]} + ` +
        `${COMPOSITION_LABELS.cloud[state.cloud]} + ` +
        `${COMPOSITION_LABELS.precipitation[state.precipitation]} + ${COMPOSITION_LABELS.wind[state.wind]} + ` +
        `${COMPOSITION_LABELS.lightning[state.lightning]}\n` +
        `时间 + 季节 + 天空光照 + 云层 + 降水 + 风 + 雷电\n` +
        `过渡：季节 ${(current.season.transitionProgress * 100).toFixed(0)}% · ` +
        `天空 ${(current.transitionProgress.skyLighting * 100).toFixed(0)}% · ` +
        `云 ${(current.transitionProgress.cloud * 100).toFixed(0)}% · ` +
        `降水 ${(current.transitionProgress.precipitation * 100).toFixed(0)}% · ` +
        `风 ${(current.transitionProgress.wind * 100).toFixed(0)}% · ` +
        `雷电 ${(current.transitionProgress.lightning * 100).toFixed(0)}%`
    );
    updateReadout(
      `season ${state.season} ${(current.season.transitionProgress * 100).toFixed(0)}% · ` +
        `sky ${state.skyLighting} ${(current.transitionProgress.skyLighting * 100).toFixed(0)}% · ` +
        `cloud ${state.cloud} ${(current.transitionProgress.cloud * 100).toFixed(0)}% · ` +
        `precip ${state.precipitation} ${(current.transitionProgress.precipitation * 100).toFixed(0)}%\n` +
        `rain ${terrainRainRateToMillimetresPerHour(current.weather.precipitation.rainRate).toFixed(1)} mm/h · ` +
        `hydrology ${TERRAIN_SURFACE_HYDROLOGY_TIME_SCALE}× · ` +
        `snow ${current.weather.precipitation.snowRate.toFixed(2)} · ` +
        `temperature ${current.weather.precipitation.temperatureCelsius.toFixed(1)} °C · ` +
        `snow melt ${TERRAIN_SURFACE_SNOW_MELT_TIME_SCALE}× · ` +
        `cloud ${current.weather.cloud.cloudCoverage.toFixed(2)} · ${current.clouds.quality} ` +
        `${current.clouds.settings.coverage.toFixed(2)} coverage\n` +
        `cloud base ${current.clouds.scaleSettings.baseAltitude.toFixed(0)} m · ` +
        `${current.clouds.baseHeightAboveObserver.toFixed(0)} m above camera · ` +
        `${current.clouds.scaleSettings.thickness.toFixed(0)} m layer · ` +
        `${current.cloudAdvectionSpeed.toFixed(2)} cloud speed\n` +
        `wet ${current.surface.wetness.toFixed(2)} · puddle ${current.surface.puddles.toFixed(2)} ` +
        `(${current.surface.puddleWaterMillimetres.toFixed(2)} mm) · ` +
        `snow cover ${current.surface.snowCover.toFixed(2)}\n` +
        `wind ${state.wind} ${(current.transitionProgress.wind * 100).toFixed(0)}% · ` +
        `${current.wind.speedMps.toFixed(2)} m/s · gust ${current.wind.gust.toFixed(2)} · ` +
        `turbulence ${current.wind.turbulence.toFixed(2)} · ` +
        `${current.wind.activeGustCount} active packets · ` +
        `${current.wind.dormant ? "dormant" : "running"}\n` +
        (current.wind.bridge
          ? `wind field ${current.wind.bridge.rasterBackend.toUpperCase()} · ` +
            `${current.wind.bridge.lastLocalFieldCpuTimeMs.toFixed(2)} ms CPU · ` +
            `${current.wind.bridge.lastExposureSampleCount} exposure + ` +
            `${current.wind.bridge.lastDynamicSampleCount} dynamic samples · ` +
            `${current.wind.bridge.lastDirtyReasons.join("+") || "clean"}` +
            (current.wind.bridge.rasterBackend === "cpu"
              ? ` · baseline full ${current.wind.bridge.cpuExposureAndDynamicBaseline.timeMs.toFixed(2)} ms / ` +
                `dynamic ${current.wind.bridge.cpuDynamicOnlyBaseline.timeMs.toFixed(2)} ms\n`
              : "\n")
          : "wind field detached\n") +
        `particles ${Math.round(current.precipitation.rainParticlesPerSecond)} rain · ` +
        `${Math.round(current.precipitation.splashParticlesPerSecond)} splash · ` +
        `${Math.round(current.precipitation.waterSplashParticlesPerSecond)} water splash · ` +
        `${Math.round(current.precipitation.snowParticlesPerSecond)} snow · ` +
        `${current.precipitation.rainImpactCount} terrain impacts · ` +
        `${current.precipitation.waterRainImpactCount} water impacts · ` +
        `${current.precipitation.waterSurfaceQueryCount} water queries\n` +
        `lightning ${state.lightning} ${(current.transitionProgress.lightning * 100).toFixed(0)}% · ` +
        `${current.lightning.active ? "flash" : "waiting"} · ` +
        `${current.lightning.strikeCount} strikes · pulse ${current.lightning.pulse.toFixed(2)}`
    );
    updateTimer = window.setTimeout(synchronize, DEBUG_READOUT_UPDATE_INTERVAL_MS);
  };
  updateTimer = window.setTimeout(synchronize, 0);
  return () => {
    active = false;
    clearTimeout(updateTimer);
  };
}

function mountSurfaceWaterControls(
  inspector: DebugInspector,
  waterFolder: dat.GUI,
  environment: WorldEnvironmentRuntime
): () => void {
  const presentationFolder = inspector.subfolder(waterFolder, "Surface Climate / 地表水文", true);
  inspector.addAction(presentationFolder, "Reset surface / 重置地表", () => environment.resetSurfaceClimate());
  const state: MutableSurfaceWaterTuning = { ...environment.getSurfaceWaterTuning() };
  const puddles = inspector.subfolder(presentationFolder, "Ground Puddles / 地表积水", true);
  inspector.addReadout(
    puddles,
    "Reflection sources / 反射来源"
  )("IBL = 实时程序化天空；SSR 混合 1 = 命中时全 SSR，0.5 = 命中时天空/SSR 各半，0 = 纯天空 IBL");
  const apply = (key: keyof TerrainSurfaceWaterTuning, value: number): void => {
    state[key] = value;
    environment.applySurfaceWaterTuning({ [key]: value } as Partial<TerrainSurfaceWaterTuning>);
  };
  for (const [key, label, minimum, maximum, step] of [
    ["coverageMultiplier", "Coverage / 覆盖倍率", 0, 4, 0.01],
    ["puddleStorageBias", "Storage preview / 储水预览偏置", 0, 1, 0.005],
    ["reflectionIntensity", "Reflection / 反射强度", 0, 4, 0.01],
    ["ssrMix", "SSR mix / SSR 与天空混合", 0, 1, 0.01],
    ["thinFilmRoughness", "Thin roughness / 薄水膜粗糙度", 0.005, 1, 0.005],
    ["standingWaterRoughness", "Puddle roughness / 水洼粗糙度", 0.005, 1, 0.005],
    ["normalFlattening", "Normal flattening / 法线压平", 0, 1, 0.01],
    ["rippleNormalStrength", "Ripple normal / 涟漪法线强度", 0, 4, 0.01],
    ["rippleUvTiling", "Ripple UV tiling / 涟漪 UV 平铺", 0.05, 8, 0.01],
    ["rippleCount", "Ripple count / 涟漪数量", 0, 4, 0.01],
    ["rippleRoughnessMultiplier", "Ripple polish / 涟漪粗糙倍率", 0, 1, 0.01],
    ["ior", "Water IOR / 水折射率", 1.001, 2, 0.001]
  ] as const) {
    addSurfaceWaterNumber(puddles, state, key, label, minimum, maximum, step, apply);
  }
  inspector.addAction(puddles, "Reset puddles / 重置积水参数", () => {
    environment.resetSurfaceWaterTuning();
    Object.assign(state, environment.getSurfaceWaterTuning());
    puddles.updateDisplay();
  });

  return (): void => {
    if (!puddles.domElement.contains(document.activeElement)) {
      Object.assign(state, environment.getSurfaceWaterTuning());
      puddles.updateDisplay();
    }
  };
}

function mountLightingAuthoringControls(
  inspector: DebugInspector,
  lightingFolder: dat.GUI,
  lighting: TerrainLightingRuntime,
  probeVolume: TerrainProbeVolumeAuthoring,
  synchronizePostProcessControls: () => void
): LightingAuthoringControlsHandle {
  const runtimeState = { iblBakingEnabled: lighting.getSnapshot().iblBakingEnabled };
  const runtimeFolder = inspector.subfolder(lightingFolder, "Environment Lighting / 环境光运行时", true);
  const iblBakingController = runtimeFolder
    .add(runtimeState, "iblBakingEnabled")
    .name("Realtime IBL bake / 实时 IBL 烘焙")
    .onChange((enabled: boolean) => lighting.setIBLBakingEnabled(enabled));
  const updateLightingReadout = inspector.addReadout(runtimeFolder, "Lighting state / 光照状态");
  const updateIBLProfileReadout = inspector.addReadout(runtimeFolder, "IBL profile / IBL 性能细分");
  let displayedIBLProfileRevision = 0;

  const visualLightingState: MutableVisualLightingTuning = { ...lighting.getVisualTuning() };
  const applyVisualLighting = (key: keyof TerrainLightingVisualTuning, value: number): void => {
    visualLightingState[key] = value;
    lighting.setTuning({ playing: false });
    lighting.applyVisualTuning({ [key]: value } as Partial<TerrainLightingVisualTuning>);
  };
  addVisualNumber(
    lightingFolder,
    visualLightingState,
    "shadowStrength",
    "Shadow strength / 阴影强度",
    0,
    1,
    0.01,
    applyVisualLighting
  );
  const visualFolder = inspector.subfolder(lightingFolder, "Live Light & Fog / 实时光雾调节", true);
  const sunFolder = inspector.subfolder(visualFolder, "Sun / 太阳", true);
  addVisualNumber(
    sunFolder,
    visualLightingState,
    "sunIntensity",
    "Direct intensity / 日光直射强度",
    0,
    8,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    sunFolder,
    visualLightingState,
    "sunColorR",
    "Direct color R / 日光颜色 R",
    0,
    4,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    sunFolder,
    visualLightingState,
    "sunColorG",
    "Direct color G / 日光颜色 G",
    0,
    4,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    sunFolder,
    visualLightingState,
    "sunColorB",
    "Direct color B / 日光颜色 B",
    0,
    4,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    sunFolder,
    visualLightingState,
    "sunSize",
    "Disk size / 太阳盘尺寸",
    0,
    0.2,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    sunFolder,
    visualLightingState,
    "sunSizeConvergence",
    "Disk convergence / 太阳盘聚焦",
    0,
    20,
    0.01,
    applyVisualLighting
  );

  const environmentFolder = inspector.subfolder(visualFolder, "Environment Light / 环境光", true);
  addVisualNumber(
    environmentFolder,
    visualLightingState,
    "ambientIntensity",
    "Ambient diffuse / 环境漫反射",
    0,
    4,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    environmentFolder,
    visualLightingState,
    "iblIntensity",
    "IBL reflection / 环境反射",
    0,
    4,
    0.01,
    applyVisualLighting
  );

  const starsFolder = inspector.subfolder(visualFolder, "Stars / 星星", true);
  addVisualNumber(
    starsFolder,
    visualLightingState,
    "starIntensity",
    "Brightness / 亮度",
    0,
    8,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(starsFolder, visualLightingState, "starSize", "Size / 大小", 0, 4, 0.01, applyVisualLighting);
  addVisualNumber(starsFolder, visualLightingState, "starCount", "Count / 数量", 0, 4, 0.01, applyVisualLighting);
  addVisualNumber(
    starsFolder,
    visualLightingState,
    "starTwinkleIntensity",
    "Twinkle strength / 闪烁强度",
    0,
    1,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    starsFolder,
    visualLightingState,
    "starTwinkleSpeed",
    "Twinkle speed / 闪烁速度",
    0,
    4,
    0.01,
    applyVisualLighting
  );

  const moonFolder = inspector.subfolder(visualFolder, "Moon / 月亮", true);
  addVisualNumber(
    moonFolder,
    visualLightingState,
    "moonLightIntensity",
    "Direct intensity / 月光直射强度",
    0,
    1,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    moonFolder,
    visualLightingState,
    "moonColorR",
    "Direct color R / 月光颜色 R",
    0,
    4,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    moonFolder,
    visualLightingState,
    "moonColorG",
    "Direct color G / 月光颜色 G",
    0,
    4,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    moonFolder,
    visualLightingState,
    "moonColorB",
    "Direct color B / 月光颜色 B",
    0,
    4,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    moonFolder,
    visualLightingState,
    "moonDiskIntensity",
    "Disk brightness / 月盘亮度",
    0,
    8,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    moonFolder,
    visualLightingState,
    "moonAtmosphereIntensityScale",
    "Atmosphere glow / 大气辉光",
    0,
    20,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    moonFolder,
    visualLightingState,
    "moonAngularScale",
    "Apparent size / 视直径倍率",
    0.25,
    4,
    0.01,
    applyVisualLighting
  );

  const skyFolder = inspector.subfolder(visualFolder, "Sky & Atmosphere / 天空与大气", true);
  addVisualNumber(
    skyFolder,
    visualLightingState,
    "skyExposure",
    "Sky exposure / 天空曝光",
    0,
    8,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    skyFolder,
    visualLightingState,
    "twilightIntensity",
    "Twilight brightness / 暮光亮度",
    0,
    8,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    skyFolder,
    visualLightingState,
    "airglowIntensity",
    "Airglow brightness / 气辉亮度",
    0,
    8,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    skyFolder,
    visualLightingState,
    "atmosphereThickness",
    "Atmosphere / 大气厚度",
    0,
    5,
    0.01,
    applyVisualLighting
  );
  const scatteringFolder = inspector.subfolder(skyFolder, "Physical Scattering / 物理散射", true);
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "atmosphereHeight",
    "Layer height ratio / 大气层高度比",
    0.005,
    0.1,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "observerHeight",
    "Observer height ratio / 观察者高度比",
    0.000001,
    0.01,
    0.000001,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "rayleighScattering",
    "Rayleigh strength / 瑞利强度",
    0,
    0.02,
    0.0001,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "rayleighScaleHeight",
    "Rayleigh scale height / 瑞利尺度高度",
    0.0001,
    0.05,
    0.0001,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "mieScattering",
    "Mie strength / 米氏强度",
    0,
    0.02,
    0.0001,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "mieScaleHeight",
    "Mie scale height / 米氏尺度高度",
    0.00005,
    0.02,
    0.00005,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "mieAnisotropy",
    "Mie anisotropy / 米氏各向异性",
    0,
    0.99,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "scatteringIntensity",
    "Sun & moon scattering / 日月散射亮度",
    0,
    100,
    0.1,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "horizonHaze",
    "Horizon haze / 地平线气溶胶消隐",
    0,
    4,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "atmosphereSampleCount",
    "View samples / 视线采样数",
    2,
    8,
    1,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "skyTintR",
    "Wavelength tint R / 散射波长色 R",
    0,
    2,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "skyTintG",
    "Wavelength tint G / 散射波长色 G",
    0,
    2,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "skyTintB",
    "Wavelength tint B / 散射波长色 B",
    0,
    2,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "groundTintR",
    "Ground albedo R / 地面反照色 R",
    0,
    2,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "groundTintG",
    "Ground albedo G / 地面反照色 G",
    0,
    2,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    scatteringFolder,
    visualLightingState,
    "groundTintB",
    "Ground albedo B / 地面反照色 B",
    0,
    2,
    0.001,
    applyVisualLighting
  );

  const customSkyColorFolder = inspector.subfolder(skyFolder, "Sky Colors / 天空颜色", true);
  addVisualNumber(
    customSkyColorFolder,
    visualLightingState,
    "customSkyTintStrength",
    "Strength / 生效强度",
    0,
    1,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    customSkyColorFolder,
    visualLightingState,
    "customSkyZenithR",
    "Zenith color R / 天顶色 R",
    0,
    2,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    customSkyColorFolder,
    visualLightingState,
    "customSkyZenithG",
    "Zenith color G / 天顶色 G",
    0,
    2,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    customSkyColorFolder,
    visualLightingState,
    "customSkyZenithB",
    "Zenith color B / 天顶色 B",
    0,
    2,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    customSkyColorFolder,
    visualLightingState,
    "customSkyHorizonR",
    "Horizon color R / 地平线色 R",
    0,
    2,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    customSkyColorFolder,
    visualLightingState,
    "customSkyHorizonG",
    "Horizon color G / 地平线色 G",
    0,
    2,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    customSkyColorFolder,
    visualLightingState,
    "customSkyHorizonB",
    "Horizon color B / 地平线色 B",
    0,
    2,
    0.001,
    applyVisualLighting
  );

  const fogFolder = inspector.subfolder(visualFolder, "Fog / 雾", true);
  let fogExponentController: dat.GUIController | undefined;
  const synchronizeFogExponentAvailability = (fogMode: FogMode): void => {
    if (!fogExponentController) return;
    setRuntimeControlAvailability(
      fogExponentController,
      fogMode !== FogMode.Linear,
      "Exponent / 指数",
      "fog-mode",
      "Exponent / 指数 · exponential only / 仅指数雾"
    );
  };
  fogFolder
    .add(visualLightingState, "fogMode", {
      "Linear / 线性距离雾": FogMode.Linear,
      "Exponential / 指数雾": FogMode.Exponential,
      "Exponential Squared / 指数平方雾": FogMode.ExponentialSquared
    })
    .name("Mode / 模式")
    .onChange((value: FogMode) => {
      const fogMode = Number(value) as FogMode;
      const fogExponent = getTerrainFogModeDefaultExponent(fogMode);
      visualLightingState.fogMode = fogMode;
      visualLightingState.fogExponent = fogExponent;
      lighting.setTuning({ playing: false });
      lighting.applyVisualTuning({ fogMode, fogExponent });
      fogExponentController?.updateDisplay();
      synchronizeFogExponentAvailability(fogMode);
    });
  fogExponentController = addVisualNumber(
    fogFolder,
    visualLightingState,
    "fogExponent",
    "Exponent / 指数",
    0.25,
    4,
    0.01,
    applyVisualLighting
  );
  synchronizeFogExponentAvailability(visualLightingState.fogMode);
  addVisualNumber(
    fogFolder,
    visualLightingState,
    "fogStart",
    "Linear start / 线性起点",
    0,
    12000,
    1,
    applyVisualLighting
  );
  addVisualNumber(fogFolder, visualLightingState, "fogEnd", "Linear end / 线性终点", 1, 20000, 1, applyVisualLighting);
  addVisualNumber(
    fogFolder,
    visualLightingState,
    "fogDensity",
    "Density / 密度",
    0,
    0.02,
    0.00001,
    applyVisualLighting
  );
  addVisualNumber(
    fogFolder,
    visualLightingState,
    "fogRadianceIntensity",
    "Sky radiance / 天空辐射强度",
    0,
    8,
    0.01,
    applyVisualLighting
  );
  addVisualNumber(
    fogFolder,
    visualLightingState,
    "fogTintR",
    "Radiance multiplier R / 雾色倍率 R",
    0,
    4,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    fogFolder,
    visualLightingState,
    "fogTintG",
    "Radiance multiplier G / 雾色倍率 G",
    0,
    4,
    0.001,
    applyVisualLighting
  );
  addVisualNumber(
    fogFolder,
    visualLightingState,
    "fogTintB",
    "Radiance multiplier B / 雾色倍率 B",
    0,
    4,
    0.001,
    applyVisualLighting
  );

  const probeFolder = inspector.subfolder(lightingFolder, "Probe Volume Bake / 光照烘焙", true);
  const layout = probeVolume.layout;
  const updateLayoutReadout = inspector.addReadout(probeFolder, "Layout / 布局");
  updateLayoutReadout(
    `${layout.bounds.size.map((value) => value.toFixed(0)).join(" × ")} m\n` +
      `${layout.coarseLayoutEstimate.brickCount.toLocaleString()} bricks · ` +
      `${layout.coarseLayoutEstimate.probeCount.toLocaleString()} probes`
  );
  const updateBakeReadout = inspector.addReadout(probeFolder, "Bake status / 烘焙状态");
  const bakeActions = {
    scenario: "Noon" as TerrainProbeVolumeScenario,
    bake: (): void => {
      void probeVolume.bake(bakeActions.scenario, lighting.getBakeLightingTuning());
    }
  };
  probeFolder
    .add(bakeActions, "scenario", Object.fromEntries(layout.scenarios.map((scenario) => [scenario, scenario])))
    .name("Scenario / 场景");
  probeFolder.add(bakeActions, "bake").name("Bake scenario / 烘焙场景");

  let active = true;
  let updateTimer = 0;
  const synchronize = (): boolean => {
    if (!active || !document.documentElement.contains(inspector.gui.domElement)) return false;
    const current = lighting.getSnapshot();
    const dominantElevation = current.dominantDirectSource === "Moon" ? current.moonElevation : current.sunElevation;
    const dominantAzimuth = current.dominantDirectSource === "Moon" ? current.moonAzimuth : current.sunAzimuth;
    const dominantColor = current.dominantDirectSource === "Moon" ? current.moonLightColor : current.directLightColor;
    runtimeState.iblBakingEnabled = current.iblBakingEnabled;
    const activeElement = document.activeElement;
    if (!visualFolder.domElement.contains(activeElement)) {
      Object.assign(visualLightingState, lighting.getVisualTuning());
      visualFolder.updateDisplay();
      synchronizeFogExponentAvailability(visualLightingState.fogMode);
    }
    synchronizePostProcessControls();
    if (!iblBakingController.domElement.contains(activeElement)) {
      iblBakingController.updateDisplay();
    }
    updateLightingReadout(
      `${formatHours(current.timeHours)} · ${current.phase} · ${current.playing ? "playing" : "paused"}\n` +
        `dominant direct ${current.dominantDirectSource.toLowerCase()} · ` +
        `${dominantElevation.toFixed(1)}° / ${dominantAzimuth.toFixed(1)}° · ` +
        `RGB ${dominantColor.map((channel) => channel.toFixed(3)).join(" / ")}\n` +
        `sun ${current.sunElevation.toFixed(1)}° / ${current.sunAzimuth.toFixed(1)}° · ` +
        `base ${current.sunIntensity.toFixed(2)} · visible ${current.visibleSunIntensity.toFixed(2)} · ` +
        `RGB ${current.sunLightColor.map((channel) => channel.toFixed(3)).join(" / ")}\n` +
        `season light direct ${current.seasonDirectTint.map((channel) => channel.toFixed(2)).join(" / ")} ` +
        `× ${current.seasonDirectIntensity.toFixed(2)} · ` +
        `weather × ${current.weatherDirectIntensity.toFixed(2)} · cloud × ${current.cloudTransmittance.toFixed(2)}\n` +
        `shadow caster ${current.shadowCaster.toLowerCase()} · ` +
        `${current.shadowStrength.toFixed(2)} × weather ${current.weatherShadowStrength.toFixed(2)} · ` +
        `environment ${current.seasonEnvironmentTint.map((channel) => channel.toFixed(2)).join(" / ")}\n` +
        `moon ${current.moonElevation.toFixed(1)}° / ${current.moonAzimuth.toFixed(1)}° · ` +
        `phase ${(current.moonIlluminatedFraction * 100).toFixed(0)}% · energy ${current.moonIntensity.toFixed(2)} · ` +
        `RGB ${current.moonLightColor.map((channel) => channel.toFixed(3)).join(" / ")}\n` +
        `ambient ${current.ambientIntensity.toFixed(2)} · IBL ${current.iblIntensity.toFixed(2)} · ` +
        `sky exposure ${current.skyExposure.toFixed(2)}\n` +
        `fog mean ${current.fogColor.map((channel) => channel.toFixed(3)).join(" / ")} · ` +
        `density ${current.fogDensity.toFixed(5)} · exponent ${current.fogExponent.toFixed(2)}\n` +
        `IBL bake ${current.iblBakingEnabled ? "enabled" : "paused"} · ` +
        `r${current.iblBake.publishedRevision} · ${current.iblBake.phase}` +
        `${current.iblBake.frame >= 0 ? ` ${current.iblBake.frame}/25` : ""} · ` +
        `${current.iblBake.resolution}² · ${current.iblBake.sampleCount} spp` +
        `${formatIBLBakePerformance(current.iblBakePerformance)}`
    );
    if (current.iblBake.phase === "idle" && current.iblBake.publishedRevision > displayedIBLProfileRevision) {
      const profile = lighting.getIBLProfile();
      if (profile.pendingGpuQueryCount === 0) {
        const revision = profile.revisions.find(
          (candidate) => candidate.revision === current.iblBake.publishedRevision
        );
        if (revision?.complete) {
          updateIBLProfileReadout(formatIBLProfile(profile, revision.revision));
          displayedIBLProfileRevision = revision.revision;
        }
      }
    }
    const bake = probeVolume.getBakeSnapshot();
    updateBakeReadout(
      `${bake.status} · ${bake.scenario} · ${bake.completedProbes.toLocaleString()} / ` +
        `${bake.totalProbes.toLocaleString()}\n${bake.message}`
    );
    return true;
  };
  const scheduleSynchronization = (delayMilliseconds: number): void => {
    updateTimer = window.setTimeout(() => {
      if (!synchronize()) return;
      scheduleSynchronization(DEBUG_READOUT_UPDATE_INTERVAL_MS);
    }, delayMilliseconds);
  };
  const destroy = (): void => {
    if (!active) return;
    active = false;
    clearTimeout(updateTimer);
  };
  scheduleSynchronization(0);
  return Object.freeze({
    synchronize: () => {
      synchronize();
    },
    destroy
  });
}

function addVisualNumber(
  folder: dat.GUI,
  state: MutableVisualLightingTuning,
  key: keyof TerrainLightingVisualTuning,
  label: string,
  minimum: number,
  maximum: number,
  step: number,
  apply: (key: keyof TerrainLightingVisualTuning, value: number) => void
): dat.GUIController {
  const controller = folder
    .add(state, key, minimum, maximum, step)
    .name(label)
    .onChange((value: number) => apply(key, value));
  bindNumericInput(controller);
  return controller;
}

function bindNumericInput(controller: dat.GUIController): void {
  const input = controller.domElement.querySelector<HTMLInputElement>('input[type="text"]');
  input?.addEventListener("focus", () => input.select());
  input?.addEventListener("input", () => {
    if (!input.value.trim()) {
      return;
    }
    const value = Number(input.value);
    if (Number.isFinite(value)) {
      controller.setValue(value);
    }
  });
}

function mountRoadAndGrassControls(
  inspector: DebugInspector,
  grassFolder: dat.GUI,
  control: TerrainSurfacePaletteDebugControl,
  grassDensity: TerrainGrassDensityDebugControl | undefined
): void {
  const tuning = control.getTuning();
  const hasRoadPalette = tuning.grass.roadColorStrength !== undefined;
  const heightRange = grassDensity?.getHeightRangeMetres() ?? { minimum: 0.47, maximum: 0.8 };
  const state = {
    preset: "自定义",
    roadColor: linearRgbToHex(tuning.roadColor),
    densityMultiplier: grassDensity?.getMultiplier() ?? 1,
    densityPerSquareMetre: grassDensity?.perSquareMetre?.getValue() ?? 0,
    distanceDensity: grassDensity?.distanceLod?.getEnabled() ?? false,
    minimumHeightMetres: heightRange.minimum,
    maximumHeightMetres: heightRange.maximum,
    enabled: tuning.grass.enabled,
    colorA: linearRgbToHex(tuning.grass.colorA),
    colorB: linearRgbToHex(tuning.grass.colorB),
    roadColorA: linearRgbToHex(tuning.grass.roadColorA ?? tuning.roadColor),
    roadColorB: linearRgbToHex(tuning.grass.roadColorB ?? tuning.roadColor),
    roadColorStrength: tuning.grass.roadColorStrength ?? 0,
    roadColorContrast: tuning.grass.roadColorContrast ?? 1,
    roadColorMidpoint: tuning.grass.roadColorMidpoint ?? 0.5,
    saturation: tuning.grass.saturation,
    repeatSizeMetres: 1 / tuning.grass.uvScale,
    offsetXMetres: tuning.grass.offset[0] / tuning.grass.uvScale,
    offsetZMetres: tuning.grass.offset[1] / tuning.grass.uvScale,
    angleDegrees: (tuning.grass.angleRadians * 180) / Math.PI,
    softnessMetres: tuning.grass.softnessMetres,
    vistaSoftnessMetres: tuning.grass.vistaSoftnessMetres ?? 192,
    vistaContrast: tuning.grass.vistaContrast ?? 1,
    vistaRepeatSizeMetres: tuning.grass.vistaRepeatSizeMetres ?? 3072,
    vistaBlendStartMetres: tuning.grass.vistaBlendStartMetres,
    vistaBlendEndMetres: tuning.grass.vistaBlendEndMetres,
    remapLow: tuning.grass.remapLow,
    remapHigh: tuning.grass.remapHigh
  };
  const apply = (): void => {
    const uvScale = 1 / state.repeatSizeMetres;
    control.setTuning({
      roadColor: hexToLinearRgb(state.roadColor),
      grass: {
        ...control.getTuning().grass,
        enabled: state.enabled,
        colorA: hexToLinearRgb(state.colorA),
        colorB: hexToLinearRgb(state.colorB),
        ...(hasRoadPalette
          ? {
              roadColorA: hexToLinearRgb(state.roadColorA),
              roadColorB: hexToLinearRgb(state.roadColorB),
              roadColorStrength: state.roadColorStrength,
              roadColorContrast: state.roadColorContrast,
              roadColorMidpoint: state.roadColorMidpoint
            }
          : {}),
        saturation: state.saturation,
        uvScale,
        angleRadians: (state.angleDegrees * Math.PI) / 180,
        offset: [state.offsetXMetres * uvScale, state.offsetZMetres * uvScale],
        softnessMetres: state.softnessMetres,
        ...(control.getTuning().grass.vistaSoftnessMetres !== undefined
          ? {
              vistaSoftnessMetres: state.vistaSoftnessMetres,
              vistaContrast: state.vistaContrast,
              vistaRepeatSizeMetres: state.vistaRepeatSizeMetres
            }
          : {}),
        vistaBlendStartMetres: state.vistaBlendStartMetres,
        vistaBlendEndMetres: state.vistaBlendEndMetres,
        remapLow: state.remapLow,
        remapHigh: state.remapHigh
      }
    });
  };

  const synchronize = (): void => {
    const current = control.getTuning();
    Object.assign(state, {
      roadColor: linearRgbToHex(current.roadColor),
      enabled: current.grass.enabled,
      colorA: linearRgbToHex(current.grass.colorA),
      colorB: linearRgbToHex(current.grass.colorB),
      roadColorA: linearRgbToHex(current.grass.roadColorA ?? current.roadColor),
      roadColorB: linearRgbToHex(current.grass.roadColorB ?? current.roadColor),
      roadColorStrength: current.grass.roadColorStrength ?? 0,
      roadColorContrast: current.grass.roadColorContrast ?? 1,
      roadColorMidpoint: current.grass.roadColorMidpoint ?? 0.5,
      saturation: current.grass.saturation,
      repeatSizeMetres: 1 / current.grass.uvScale,
      offsetXMetres: current.grass.offset[0] / current.grass.uvScale,
      offsetZMetres: current.grass.offset[1] / current.grass.uvScale,
      angleDegrees: (current.grass.angleRadians * 180) / Math.PI,
      softnessMetres: current.grass.softnessMetres,
      vistaSoftnessMetres: current.grass.vistaSoftnessMetres ?? 192,
      vistaContrast: current.grass.vistaContrast ?? 1,
      vistaRepeatSizeMetres: current.grass.vistaRepeatSizeMetres ?? 3072,
      vistaBlendStartMetres: current.grass.vistaBlendStartMetres,
      vistaBlendEndMetres: current.grass.vistaBlendEndMetres,
      remapLow: current.grass.remapLow,
      remapHigh: current.grass.remapHigh
    });
    if (grassDensity) {
      state.densityMultiplier = grassDensity.getMultiplier();
      state.densityPerSquareMetre = grassDensity.perSquareMetre?.getValue() ?? 0;
      state.distanceDensity = grassDensity.distanceLod?.getEnabled() ?? false;
      const currentHeightRange = grassDensity.getHeightRangeMetres();
      state.minimumHeightMetres = currentHeightRange.minimum;
      state.maximumHeightMetres = currentHeightRange.maximum;
    }
  };

  const panel = inspector.subfolder(grassFolder, "Surface Palette & Density / 地表配色与密度", true);
  const controllers: dat.GUIController[] = [];
  const track = (controller: dat.GUIController): dat.GUIController => {
    controllers.push(controller);
    return controller;
  };
  inspector.addAction(panel, "Reset road + grass / 重置道路与草地", () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && panel.domElement.contains(activeElement)) activeElement.blur();
    control.resetTuning();
    grassDensity?.resetMultiplier();
    grassDensity?.perSquareMetre?.resetValue();
    grassDensity?.distanceLod?.setEnabled(true);
    grassDensity?.resetHeightRange();
    state.preset = "自定义";
    synchronize();
    for (const controller of controllers) controller.updateDisplay();
  });

  if (grassDensity) {
    if (grassDensity.distanceLod) {
      track(
        panel
          .add(state, "distanceDensity")
          .name("Distance Density / 随距离减密")
          .onChange((enabled: boolean) => grassDensity.distanceLod!.setEnabled(enabled))
      );
    }
    if (grassDensity.perSquareMetre) {
      bindNumericInput(
        track(
          panel
            .add(state, "densityPerSquareMetre", 0, 60, 0.5)
            .name("Density clumps/m² / 草密度")
            .onFinishChange((density: number) => grassDensity.perSquareMetre!.setValue(density))
        )
      );
    } else
      bindNumericInput(
        track(
          panel
            .add(state, "densityMultiplier", 0, 2, 0.01)
            .name("Grass Density / 草密度")
            .onChange((multiplier: number) => grassDensity.setMultiplier(multiplier))
        )
      );
    let minimumHeightController: dat.GUIController;
    let maximumHeightController: dat.GUIController;
    minimumHeightController = track(
      panel
        .add(state, "minimumHeightMetres", 0.1, 2, 0.01)
        .name("Grass Min Height m / 草最小高度")
        .onChange((minimum: number) => {
          if (minimum > state.maximumHeightMetres) {
            state.maximumHeightMetres = minimum;
            maximumHeightController.updateDisplay();
          }
          grassDensity.setHeightRangeMetres(minimum, state.maximumHeightMetres);
        })
    );
    maximumHeightController = track(
      panel
        .add(state, "maximumHeightMetres", 0.1, 2, 0.01)
        .name("Grass Max Height m / 草最大高度")
        .onChange((maximum: number) => {
          if (maximum < state.minimumHeightMetres) {
            state.minimumHeightMetres = maximum;
            minimumHeightController.updateDisplay();
          }
          grassDensity.setHeightRangeMetres(state.minimumHeightMetres, maximum);
        })
    );
    bindNumericInput(minimumHeightController);
    bindNumericInput(maximumHeightController);
  }

  const colors = inspector.subfolder(panel, "Colors / 配色", true);
  const field = inspector.subfolder(panel, "Color Field / 色块变换", true);
  if (control.presets) {
    track(
      colors
        .add(state, "preset", ["自定义", ...Object.keys(control.presets)])
        .name("Theme / 配色预设")
        .onChange((name: string) => {
          const preset = control.presets?.[name];
          if (!preset) return;
          state.colorA = linearRgbToHex(preset.colorA);
          state.colorB = linearRgbToHex(preset.colorB);
          if (preset.roadColorA) state.roadColorA = linearRgbToHex(preset.roadColorA);
          if (preset.roadColorB) state.roadColorB = linearRgbToHex(preset.roadColorB);
          state.roadColorStrength = 1;
          // Apply the exact linear endpoints; the colour picker is only their display.
          const current = control.getTuning();
          control.setTuning({ ...current, grass: { ...current.grass, ...preset, roadColorStrength: 1 } });
          synchronize();
          for (const controller of controllers) controller.updateDisplay();
        })
    );
  }
  const applyColor = (): void => {
    const current = control.getTuning();
    if (
      state.colorA === linearRgbToHex(current.grass.colorA) &&
      state.colorB === linearRgbToHex(current.grass.colorB) &&
      (hasRoadPalette
        ? state.roadColorA === linearRgbToHex(current.grass.roadColorA ?? current.roadColor) &&
          state.roadColorB === linearRgbToHex(current.grass.roadColorB ?? current.roadColor)
        : state.roadColor === linearRgbToHex(current.roadColor))
    )
      return;
    state.preset = "自定义";
    apply();
    for (const controller of controllers) controller.updateDisplay();
  };
  if (!hasRoadPalette) track(colors.addColor(state, "roadColor").name("Road / 道路颜色").onChange(applyColor));
  if (hasRoadPalette) {
    track(colors.addColor(state, "roadColorA").name("Road A / 道路色块 A").onChange(applyColor));
    track(colors.addColor(state, "roadColorB").name("Road B / 道路色块 B").onChange(applyColor));
    bindNumericInput(
      track(colors.add(state, "roadColorStrength", 0, 1, 0.01).name("Road Variation / 道路色块强度").onChange(apply))
    );
    bindNumericInput(
      track(colors.add(state, "roadColorContrast", 1, 16, 0.1).name("Road Contrast / 道路色块对比度").onChange(apply))
    );
    bindNumericInput(
      track(colors.add(state, "roadColorMidpoint", 0, 1, 0.0001).name("Road Midpoint / 深色分界").onChange(apply))
    );
  }
  track(colors.addColor(state, "colorA").name("Grass A / 草色 A").onChange(applyColor));
  track(colors.addColor(state, "colorB").name("Grass B / 草色 B").onChange(applyColor));
  bindNumericInput(track(colors.add(state, "saturation", 0, 2, 0.01).name("Saturation / 草色饱和度").onChange(apply)));
  track(field.add(state, "enabled").name("Enabled / 启用色块").onChange(apply));
  bindNumericInput(
    track(field.add(state, "repeatSizeMetres", 0.2, 100, 0.1).name("Repeat Size m / 色块重复尺寸").onChange(apply))
  );
  bindNumericInput(track(field.add(state, "offsetXMetres", 0, 100, 0.1).name("Offset X m / 偏移 X").onChange(apply)));
  bindNumericInput(track(field.add(state, "offsetZMetres", 0, 100, 0.1).name("Offset Z m / 偏移 Z").onChange(apply)));
  bindNumericInput(track(field.add(state, "angleDegrees", -180, 180, 0.1).name("Angle / 旋转角度").onChange(apply)));
  bindNumericInput(track(field.add(state, "softnessMetres", 0, 16, 0.1).name("Softness m / 柔和范围").onChange(apply)));
  if (tuning.grass.vistaSoftnessMetres !== undefined) {
    bindNumericInput(
      track(field.add(state, "vistaRepeatSizeMetres", 128, 3072, 16).name("远景色块尺寸（m）").onChange(apply))
    );
    bindNumericInput(
      track(field.add(state, "vistaSoftnessMetres", 0, 768, 1).name("远景柔和范围（m）").onChange(apply))
    );
    bindNumericInput(track(field.add(state, "vistaContrast", 1, 4, 0.05).name("远景色块对比度").onChange(apply)));
  }
  let vistaBlendStartController: dat.GUIController;
  let vistaBlendEndController: dat.GUIController;
  vistaBlendStartController = track(
    field
      .add(state, "vistaBlendStartMetres", 0, 5_999, 1)
      .name("Vista Start m / 远景开始")
      .onChange(() => {
        if (state.vistaBlendStartMetres >= state.vistaBlendEndMetres) {
          state.vistaBlendEndMetres = Math.min(6_000, state.vistaBlendStartMetres + 1);
          vistaBlendEndController.updateDisplay();
        }
        apply();
      })
  );
  vistaBlendEndController = track(
    field
      .add(state, "vistaBlendEndMetres", 1, 6_000, 1)
      .name("Vista Full m / 远景完成")
      .onChange(() => {
        if (state.vistaBlendEndMetres <= state.vistaBlendStartMetres) {
          state.vistaBlendStartMetres = Math.max(0, state.vistaBlendEndMetres - 1);
          vistaBlendStartController.updateDisplay();
        }
        apply();
      })
  );
  bindNumericInput(vistaBlendStartController);
  bindNumericInput(vistaBlendEndController);
  let lowController: dat.GUIController;
  let highController: dat.GUIController;
  lowController = track(
    field
      .add(state, "remapLow", 0, 0.99, 0.01)
      .name("Remap Low / 色块下限")
      .onChange(() => {
        if (state.remapLow >= state.remapHigh) {
          state.remapHigh = Math.min(1, state.remapLow + 0.01);
          highController.updateDisplay();
        }
        apply();
      })
  );
  highController = track(
    field
      .add(state, "remapHigh", 0.01, 1, 0.01)
      .name("Remap High / 色块上限")
      .onChange(() => {
        if (state.remapHigh <= state.remapLow) {
          state.remapLow = Math.max(0, state.remapHigh - 0.01);
          lowController.updateDisplay();
        }
        apply();
      })
  );
}

function linearRgbToHex(color: readonly [number, number, number]): string {
  const encoded = color.map((component) => {
    const linear = Math.max(0, Math.min(1, component));
    const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${encoded.join("")}`;
}

function hexToLinearRgb(value: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/iu.exec(value);
  if (!match) throw new RangeError(`Invalid grass colour ${JSON.stringify(value)}`);
  const encoded = match[1];
  return [0, 2, 4].map((offset) => {
    const srgb = Number.parseInt(encoded.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

function setRuntimeControlAvailability(
  controller: dat.GUIController,
  available: boolean,
  label: string,
  category = "runtime",
  unavailableLabel = `${label} · unavailable / 当前 Seed 无运行时`
): void {
  controller.name(available ? label : unavailableLabel);
  const row = controller.domElement.parentElement;
  if (!row) return;
  row.dataset.runtimeAvailable = String(available);
  row.dataset.runtimeCategory = category;
  row.setAttribute("aria-disabled", String(!available));
  row.style.opacity = available ? "1" : "0.45";
  row.style.pointerEvents = available ? "auto" : "none";
  for (const input of row.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
    "input, select, button"
  )) {
    input.disabled = !available;
  }
}

function formatHours(timeHours: number): string {
  const totalMinutes = ((Math.round(timeHours * 60) % 1440) + 1440) % 1440;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function formatIBLBakePerformance(performance: TerrainLightingRuntimeSnapshot["iblBakePerformance"]): string {
  if (performance.revision === 0 || performance.peakFrame === null || performance.peakCpuFrame === null) {
    return "";
  }
  return (
    `\npeak r${performance.revision} f${performance.peakFrame} · ${performance.peakFrameTimeMs.toFixed(1)} ms frame` +
    ` · f${performance.peakCpuFrame} ${performance.peakCpuTimeMs.toFixed(2)} ms CPU`
  );
}

function formatIBLProfile(
  profile: ReturnType<TerrainLightingRuntime["getIBLProfile"]>,
  revisionNumber: number
): string {
  const revision = profile.revisions.find((candidate) => candidate.revision === revisionNumber)!;
  const revisionFrames = profile.frames.filter((frame) => frame.revision === revisionNumber);
  const peakFrame = revisionFrames.reduce((peak, frame) => (frame.bakerCpuTimeMs > peak.bakerCpuTimeMs ? frame : peak));
  const stage = (name: Parameters<typeof findIBLStage>[1]) => findIBLStage(revision, name);
  const shProject = stage("sh-project");
  const sourceCapture = stage("source-capture");
  const sourceMipmap = stage("source-mipmap");
  const ggx = stage("ggx-prefilter");
  const gpuCapability =
    profile.capability.status === "available"
      ? `${profile.capability.queryCounterBits}-bit timer`
      : `GPU ${profile.capability.reason}`;
  return (
    `r${revision.revision} · ${revision.updateCount} updates · GPU SH · ${gpuCapability}\n` +
    `CPU peak f${revision.bakerCpu.peakFrame} ${revision.bakerCpu.maxMs.toFixed(2)} ms · ` +
    `stage ${formatIBLStagePeak(revision.peakStageCpu)} · residual ${peakFrame.unprofiledCpuTimeMs.toFixed(2)} ms\n` +
    `capture source / mip GPU ${formatIBLStageGpu(sourceCapture)} / ${formatIBLStageGpu(sourceMipmap)} ms max\n` +
    `GPU SH project CPU/GPU ${formatIBLStageCpu(shProject)} / ${formatIBLStageGpu(shProject)} ms max\n` +
    `GGX CPU ${formatIBLStageCpu(ggx)} ms max · GPU ${formatIBLStageGpu(ggx)} ms max · ` +
    `frame ${revision.frameTime ? `f${revision.frameTime.peakFrame} ${revision.frameTime.maxMs.toFixed(1)} ms` : "pending"}`
  );
}

function findIBLStage(
  revision: ReturnType<TerrainLightingRuntime["getIBLProfile"]>["revisions"][number],
  stage: ReturnType<TerrainLightingRuntime["getIBLProfile"]>["frames"][number]["stages"][number]["stage"]
) {
  return revision.stages.find((candidate) => candidate.stage === stage);
}

function formatIBLStageCpu(stage: ReturnType<typeof findIBLStage>): string {
  return stage ? stage.cpu.maxMs.toFixed(2) : "n/a";
}

function formatIBLStageGpu(stage: ReturnType<typeof findIBLStage>): string {
  return stage?.gpu ? stage.gpu.maxMs.toFixed(2) : "n/a";
}

function formatIBLStagePeak(
  peak: ReturnType<TerrainLightingRuntime["getIBLProfile"]>["revisions"][number]["peakStageCpu"]
): string {
  return peak ? `${peak.stage} f${peak.frame} ${peak.timeMs.toFixed(2)} ms` : "n/a";
}
