import type { MSAASamples, TonemappingMode } from "@galacean/engine";
import type { TerrainClipmapSegmentSnapshot } from "../clipmap/TerrainClipmap";
import {
  TerrainDebugView,
  type TerrainAutoShaderTuning,
  type TerrainDualScalingTuning,
  type TerrainLayerTuning,
  type TerrainMacroVariationTuning,
  type TerrainMaterialTuning,
  type TerrainProjectionTuning,
  type TerrainSamplingTuning,
  type TerrainWorldNoiseTuning
} from "../TerrainMaterial";

export type { TerrainWorldNoiseTuning } from "../TerrainMaterial";

/** Named production shader outputs available to terrain diagnostics. */
export const TERRAIN_DEBUG_VIEWS = {
  surface: TerrainDebugView.Surface,
  checkerboard: TerrainDebugView.Checkerboard,
  grey: TerrainDebugView.Grey,
  height: TerrainDebugView.Height,
  jaggedness: TerrainDebugView.Jaggedness,
  normal: TerrainDebugView.TerrainNormal,
  region: TerrainDebugView.Region,
  "region-grid": TerrainDebugView.RegionGrid,
  "vertex-grid": TerrainDebugView.VertexGrid,
  "clipmap-lod": TerrainDebugView.ClipmapLod,
  wireframe: TerrainDebugView.Wireframe,
  "control-texture": TerrainDebugView.ControlTexture,
  "control-base": TerrainDebugView.ControlBase,
  "control-overlay": TerrainDebugView.ControlOverlay,
  "control-blend": TerrainDebugView.ControlBlend,
  "control-angle": TerrainDebugView.ControlAngle,
  "control-scale": TerrainDebugView.ControlScale,
  autoshader: TerrainDebugView.AutoShader,
  holes: TerrainDebugView.Holes,
  bilerp: TerrainDebugView.Bilerp,
  "texture-height": TerrainDebugView.TextureHeight,
  "texture-normal": TerrainDebugView.TextureNormal,
  "texture-roughness": TerrainDebugView.TextureRoughness,
  "color-map": TerrainDebugView.ColorMap,
  "rough-map": TerrainDebugView.RoughMap,
  "detile-cell": TerrainDebugView.DetileCell,
  "sampling-mip": TerrainDebugView.SamplingMip,
  "layer-source": TerrainDebugView.LayerSource,
  "layer-detiled": TerrainDebugView.LayerDetiled,
  "detile-rotation-axis": TerrainDebugView.DetileRotationAxis,
  "dual-factor": TerrainDebugView.DualFactor
} as const;

/** Production shader debug-view name. */
export type TerrainDebugViewName = keyof typeof TERRAIN_DEBUG_VIEWS;

/** Named deterministic camera pose. */
export type TerrainCameraPoseName = "first-person" | "overview" | "oblique" | "slope" | "dual" | "top" | "seam" | "background-seam";

/** terrain world background modes implemented by the Galacean core path. */
export type TerrainBackgroundMode = "none" | "flat" | "noise";

/** Top-level inspector group for a terrain diagnostic. */
export type TerrainDebugViewGroup = "surface" | "data" | "sampling" | "geometry";

/** Inspector metadata for one production shader debug view. */
export interface TerrainDebugViewInfo {
  /** Short bilingual label shown in the inspector. */
  readonly label: string;
  /** Inspector group containing the diagnostic. */
  readonly group: TerrainDebugViewGroup;
  /** Concise explanation of the shader output. */
  readonly description: string;
  /** Whether the output uses the inspector's selected texture layer. */
  readonly usesLayer?: boolean;
}

/** Descriptions for each production shader diagnostic. */
export const TERRAIN_DEBUG_VIEW_INFO: Record<TerrainDebugViewName, TerrainDebugViewInfo> = {
  surface: {
    label: "Surface / 最终材质",
    group: "surface",
    description: "最终地形光照：terrain albedo、纹理法线、粗糙度、方向光阴影接收与烘焙环境漫反射。"
  },
  checkerboard: { label: "Checkerboard / 世界棋盘", group: "geometry", description: "世界坐标棋盘；用于确认 clipmap 覆盖与坐标连续性。" },
  grey: { label: "Grey / 灰色基线", group: "geometry", description: "不读取任何 terrain 数据或纹理的几何基线。" },
  height: {
    label: "Height / 高度",
    group: "data",
    description: "terrain 的 smoothstep(-0.1, 2.0, 0.5 + world Y / 300) 灰阶：黑低、白高；不是最终材质颜色。"
  },
  jaggedness: { label: "Jaggedness / 法线突变", group: "data", description: "相邻 height normal 的差异；亮处表示高度数据或 region seam 不连续。" },
  normal: { label: "Terrain normal / 地形法线", group: "data", description: "heightmap 导出的世界法线 RGB 编码；不是 normal-map 纹理预览。" },
  region: { label: "Region / 区域层", group: "data", description: "region-map 命中的 height/control array layer；黑色表示空区域。" },
  "region-grid": { label: "Region grid / 区域网格", group: "geometry", description: "1024m region 边界与 region-map layer。" },
  "vertex-grid": { label: "Vertex grid / 顶点网格", group: "geometry", description: "vertex-density 对应的 terrain grid。" },
  "clipmap-lod": {
    label: "Clipmap LOD / 裁剪图层级",
    group: "geometry",
    description:
      "真实高度位移后的 clipmap 三角线框；每个离散 LOD 环有固定颜色，同色亮度按相机距离的 vertex morph 系数变化。"
  },
  wireframe: {
    label: "Wireframe / 三角线框", group: "geometry",
    description: "与 production height sampling 和 vertex geomorph 同路径的三角形线框。"
  },
  "control-texture": {
    label: "Control texture / 控制纹理",
    group: "data",
    description: "terrain 原始 32 色 base/overlay ID 调色板；中心圆区按 control blend 显示 Overlay，其余显示 Base。"
  },
  "control-base": { label: "Control base / 基础层 ID", group: "data", description: "原始 control word 的 base texture ID 灰度值；不是 albedo。" },
  "control-overlay": { label: "Control overlay / 覆盖层 ID", group: "data", description: "原始 control word 的 overlay texture ID 灰度值；不是 albedo。" },
  "control-blend": {
    label: "Control blend / 控制混合",
    group: "data",
    description: "terrain debug insert：红色为原始 8-bit control blend，绿色固定为 0，蓝色为启用 autoshader 后的 slope/height blend。"
  },
  "control-angle": { label: "Control rotation / 控制旋转", group: "data", description: "原始 control word 的 rotation index 灰度值。" },
  "control-scale": { label: "Control scale / 控制缩放", group: "data", description: "原始 control word 解码后的 UV scale 灰度值。" },
  autoshader: {
    label: "Autoshader flag / 自动材质标志",
    group: "data",
    description: "terrain DEBUG_AUTOSHADER：白色表示 control bit 0（或区域外）会使用 slope/height 自动混合；黑色表示保留手绘控制字。"
  },
  holes: {
    label: "Hole flag / 洞标志（Galacean）",
    group: "data",
    description: "terrain 1.0.2 在 vertex 阶段直接剔除 hole，未注入独立 fragment debug view；此 Galacean 诊断把 raw bit 2 显示为红色。"
  },
  bilerp: {
    label: "Bilerp / 四点插值", group: "sampling",
    description: "绿色为 four-corner material interpolation；红色为单 control texel 路径。"
  },
  "texture-height": {
    label: "Texture height / 纹理高度", group: "sampling",
    description: "完成 terrain material accumulation 后的 albedo-height alpha。"
  },
  "texture-normal": { label: "Texture normal / 纹理法线", group: "sampling", description: "完成 material accumulation 后的 normal sample RGB。" },
  "texture-roughness": { label: "Texture roughness / 纹理粗糙度", group: "sampling", description: "完成 material accumulation 后的 normal/roughness alpha 灰度值。" },
  "color-map": {
    label: "Color map / 区域颜色图",
    group: "data",
    description: "terrain _color_maps 的 RGB；主画面会将它乘到累计后的 albedo。"
  },
  "rough-map": {
    label: "Roughness map / 区域粗糙度图",
    group: "data",
    description: "terrain _color_maps 的 alpha 灰阶；PBR 路径将它混入最终 roughness。"
  },
  "detile-cell": { label: "Detile cell / 去重复单元", group: "sampling", description: "选定 layer 的 terrain detile cell 和单元边界。", usesLayer: true },
  "sampling-mip": {
    label: "Sampling mip / 采样 Mip", group: "sampling",
    description: "选定 layer 的 textureGrad mip estimate；蓝低、红高。",
    usesLayer: true
  },
  "layer-source": {
    label: "Layer original / 原始层采样", group: "sampling",
    description: "选定 layer，保留 projection/control transform，但移除 detile 的原始 textureGrad。",
    usesLayer: true
  },
  "layer-detiled": {
    label: "Layer detiled / 去重复层采样", group: "sampling",
    description: "选定 layer 的去重复 textureGrad，直接与原始层采样对照。",
    usesLayer: true
  },
  "detile-rotation-axis": {
    label: "Detile rotation axis / 去重复旋转轴",
    group: "sampling",
    description: "验证视图：每个地形单元的线条方向来自最终 id_cs。Detiling rotation 会转动线条；Detiling shift 不会改变它。",
    usesLayer: true
  },
  "dual-factor": { label: "Dual factor / 双尺度因子", group: "sampling", description: "dual scaling transition：蓝近、红远。" }
};

/** Localized labels for the inspector's diagnostic groups. */
export const TERRAIN_DEBUG_VIEW_GROUP_LABELS: Record<TerrainDebugViewGroup, string> = {
  surface: "Surface",
  data: "Data",
  sampling: "Sampling",
  geometry: "Geometry"
};

/** Read-only terrain fixture value at a world-space probe position. */
export interface TerrainProbeSnapshot {
  /** World-space XZ coordinate. */
  readonly world: readonly [x: number, z: number];
  /** Decoded metre height when the point belongs to a region. */
  readonly height?: number;
  /** Raw control word and its terrain fields when the point belongs to a region. */
  readonly control?: {
    readonly raw: number;
    readonly base: number;
    readonly overlay: number;
    readonly blend: number;
    readonly angleIndex: number;
    readonly scaleIndex: number;
    readonly scale: number;
    readonly hole: boolean;
    readonly navigation: boolean;
    readonly autoshader: boolean;
  };
}

/** First-person camera state exposed by the terrain demo. */
export interface TerrainFirstPersonSnapshot {
  /** Whether the first-person controller currently owns the camera. */
  readonly active: boolean;
  /** Camera height above the sampled terrain in metres. */
  readonly eyeHeight: number;
  /** Horizontal movement speed in metres per second. */
  readonly moveSpeed: number;
  /** Current world-space camera position. */
  readonly position: readonly [x: number, y: number, z: number];
  /** Sampled terrain height below the camera, when its XZ position is loaded. */
  readonly groundHeight?: number;
}

/** Texture asset metadata exposed to the diagnostics surface. */
export interface TerrainDebugLayerSnapshot {
  /** terrain texture asset identifier. */
  readonly id: number;
  /** User-facing texture asset name. */
  readonly name: string;
  /** Albedo-height asset path relative to the manifest. */
  readonly albedoHeight: string;
  /** Normal-roughness asset path relative to the manifest. */
  readonly normalRoughness: string;
}

/** Mutable copy of one texture asset's manifest sampling inputs. */
export interface TerrainDebugLayerTuningSnapshot extends Required<TerrainLayerTuning> {
  /** terrain texture asset identifier. */
  readonly layer: number;
}

/** Mutable copy of material-level manifest inputs. */
export interface TerrainMaterialTuningSnapshot {
  /** Auto-shader material inputs. */
  autoShader: Required<TerrainAutoShaderTuning>;
  /** Projection material inputs. */
  projection: Required<TerrainProjectionTuning>;
  /** Dual-scaling material inputs. */
  dualScaling: Required<TerrainDualScalingTuning>;
  /** Macro-variation material inputs. */
  macroVariation: Required<TerrainMacroVariationTuning>;
}

/** World-level terrain settings outside the material sampling blocks. */
export interface TerrainWorldTuningSnapshot {
  /** Empty space, a flat continuation, or terrain's procedural noise continuation outside regions. */
  background: TerrainBackgroundMode;
  /** Procedural world-continuation inputs from the manifest. */
  noise: Required<TerrainWorldNoiseTuning>;
}

/** Independent water-pcg diagnostic state retained from the pre-rebuild demo. */
export interface TerrainWaterDebugSnapshot {
  /** Whether the water diagnostic renderer is active. */
  enabled: boolean;
  /** Water surface height in world metres. */
  height: number;
}

/** Direct-light and baked-environment visibility exposed to terrain diagnostics. */
export interface TerrainLightingSnapshot {
  /** Whether the shadow-casting directional light is active. */
  directLight: boolean;
  /** Whether the directional light renders and samples its shadow map. */
  shadows: boolean;
  /** Whether baked ambient-light SH contributes diffuse terrain illumination. */
  environment: boolean;
  /** Whether the HDR cube is drawn as the visible sky background. */
  skybox: boolean;
}

/** Camera state belonging to rendering diagnostics rather than terrain material tuning. */
export interface TerrainCameraRenderingSnapshot {
  /** Whether the active camera renders to an HDR intermediate target. */
  hdr: boolean;
  /** Actual engine multisample mode after capability clamping. */
  msaaSamples: MSAASamples;
}

/** Post-process state belonging to rendering diagnostics. */
export interface TerrainPostProcessRenderingSnapshot {
  /** Whether the active camera executes the scene post-process manager. */
  enabled: boolean;
  /** Whether the terrain tonemapping effect is valid. */
  tonemapping: boolean;
  /** Active engine tonemapping enum value. */
  tonemappingMode: TonemappingMode;
}

/** Complete rendering state exposed by the terrain diagnostics panel. */
export interface TerrainRenderingSnapshot {
  /** Scene direct and image-based lighting state. */
  lighting: TerrainLightingSnapshot;
  /** Camera HDR and hardware multisample state. */
  camera: TerrainCameraRenderingSnapshot;
  /** Camera post-process and terrain tonemapping state. */
  postProcess: TerrainPostProcessRenderingSnapshot;
}

/** Partial rendering update accepted by terrain diagnostics. */
export interface TerrainRenderingTuning {
  /** Direct and image-based lighting values to replace. */
  lighting?: Partial<TerrainLightingSnapshot>;
  /** Camera values to replace. */
  camera?: Partial<TerrainCameraRenderingSnapshot>;
  /** Post-process values to replace. */
  postProcess?: Partial<TerrainPostProcessRenderingSnapshot>;
}

/** Full mutable copy of the terrain inputs exposed by the inspector. */
export interface TerrainDebugTuningSnapshot {
  /** Per-texture asset inputs. */
  layers: TerrainDebugLayerTuningSnapshot[];
  /** Sampling inputs shared by all texture assets. */
  sampling: Required<TerrainSamplingTuning>;
  /** Material-level inputs. */
  material: TerrainMaterialTuningSnapshot;
  /** World-level terrain settings. */
  world: TerrainWorldTuningSnapshot;
}

/** Stable browser contract used by terrain diagnostics without exposing engine internals. */
export interface TerrainDebugApi {
  /** Marks an initialized terrain demo. */
  readonly ready: true;
  /** Available production shader outputs. */
  readonly views: readonly TerrainDebugViewName[];
  /** Available deterministic camera poses. */
  readonly poses: readonly TerrainCameraPoseName[];
  /** Texture asset metadata. */
  readonly layers: readonly TerrainDebugLayerSnapshot[];
  /** Selects a production shader output. */
  setView(view: TerrainDebugViewName): void;
  /** Selects a deterministic camera pose. */
  setPose(pose: TerrainCameraPoseName): void;
  /** Returns the terrain-constrained first-person camera state. */
  getFirstPerson(): TerrainFirstPersonSnapshot;
  /** Updates first-person camera height above terrain in metres. */
  setFirstPersonEyeHeight(height: number): void;
  /** Updates first-person horizontal movement speed in metres per second. */
  setFirstPersonMoveSpeed(speed: number): void;
  /** Selects the asset used by layer-specific debug outputs. */
  setDebugLayer(layer: number): void;
  /** Returns a copy of all inspector-controlled values. */
  getTuning(): TerrainDebugTuningSnapshot;
  /** Updates one texture asset's sampling values. */
  setLayerTuning(layer: number, tuning: TerrainLayerTuning): void;
  /** Updates shared sampling values. */
  setSamplingTuning(tuning: TerrainSamplingTuning): void;
  /** Updates material-level values. */
  setMaterialTuning(tuning: TerrainMaterialTuning): void;
  /** Sets the terrain background mode outside loaded regions. */
  setWorldBackground(mode: TerrainBackgroundMode): void;
  /** Updates terrain world-noise settings. */
  setWorldNoiseTuning(tuning: TerrainWorldNoiseTuning): void;
  /** Returns independent water-pcg diagnostic state. */
  getWaterDebug(): TerrainWaterDebugSnapshot;
  /** Updates independent water-pcg diagnostic state. */
  setWaterDebug(tuning: Partial<TerrainWaterDebugSnapshot>): void;
  /** Returns direct-light and baked-environment visibility. */
  getLighting(): TerrainLightingSnapshot;
  /** Updates direct-light and baked-environment visibility. */
  setLighting(tuning: Partial<TerrainLightingSnapshot>): void;
  /** Returns the live rendering state without terrain material inputs. */
  getRendering(): TerrainRenderingSnapshot;
  /** Updates live scene rendering state and preserves engine capability clamping. */
  setRendering(tuning: TerrainRenderingTuning): void;
  /** Restores manifest defaults. */
  resetTuning(): void;
  /** Returns the rendered clipmap topology. */
  inspect(): {
    readonly regionLocations: readonly (readonly [number, number])[];
    readonly regionSize: number;
    readonly vertexSpacing: number;
    readonly meshSize: number;
    readonly meshLods: number;
    readonly segmentCount: number;
    readonly segmentsPerLod: readonly number[];
    readonly segments: readonly TerrainClipmapSegmentSnapshot[];
  };
  /** Reads raw fixture values at a world-space coordinate. */
  readProbe(worldX: number, worldZ: number): TerrainProbeSnapshot;
}

declare global {
  interface Window {
    /** Terrain diagnostics available after the demo reaches its ready state. */
    terrainDebug?: TerrainDebugApi;
  }
}
