import type { PlanningComponentDefinition } from "../../../spatial/PlanningComponents.ts";
import type { PlanningDocument } from "../../../spatial/PlanningDocument.ts";
import { ComponentRegistry, resolveComponent } from "../../../spatial/SpatialDocument.ts";
import { defaultSlabSettings, type SlabSettings } from "@galacean/engine-terrain/rock-formation/SlabSettings";
import type { NoiseSettings } from "@galacean/engine-terrain/rock-formation/PerlinNoise";
import type { CellularCurvatureSettings } from "@galacean/engine-terrain/rock-formation/CellularCurvature";
import { DEFAULT_ROCK_HEIGHT_MODE, type RockSurfaceMode } from "@galacean/engine-terrain/rock-formation/types";
import { DEFAULT_ROCK_SLOPE_VARIATION } from "@galacean/engine-terrain/rock-formation/Slope";
import { readRockColorBlend, ROCK_COLOR_FIELDS, type RockColorBlend } from "./ColorPalette.ts";

export type { RockSurfaceMode } from "@galacean/engine-terrain/rock-formation/types";
export const DEFAULT_ROCK_SURFACE_MODE: RockSurfaceMode = "vertex-slabs";
export const DEFAULT_ROCK_TEXTURE_SCALE = 60;
/** Both surfaces consume each OBB's selected ascent or ascent-masked Perlin guide. */
export interface RockFormationSettings {
  surfaceMode: RockSurfaceMode;
  /** Painted-rock texture repeat size in metres; does not change geometry. */
  textureScale: number;
  /** Single linear RGB multiplier for the grayscale rock texture. */
  colorBlend: RockColorBlend;
  perlin: NoiseSettings & { maskPower: number };
  slabs: SlabSettings;
  curvature: CellularCurvatureSettings;
}
export const ROCK_FORMATION_DEFAULTS = {
  noiseSeed: 18,
  frequency: 4,
  octaves: 5,
  lacunarity: 2,
  persistence: 0.5,
  maskPower: 1,
  slabSeed: 17,
  slabSize: 28,
  slabCoverage: 0.65,
  slabDepth: 2,
  slabVariation: 0.85,
  cellSize: 24,
  cellInset: 0.35,
  cellDepth: 0.6,
  cellDetail: 0.2,
  cellCoverage: 1,
  textureScale: DEFAULT_ROCK_TEXTURE_SCALE
};
const field = (
  key: keyof typeof ROCK_FORMATION_DEFAULTS,
  label: string,
  min: number,
  max: number,
  step: number,
  integer = false
) => ({ key, label, type: "number" as const, min, max, step, integer, default: ROCK_FORMATION_DEFAULTS[key] });
export const ROCK_FORMATION_COMPONENT: PlanningComponentDefinition = {
  type: "rockFormation",
  label: "Rock surface & Perlin / 岩石表面与 Perlin 参数",
  version: 1,
  tab: "world",
  sparseGlobal: true,
  presentation: true,
  description:
    "各 OBB 独立选择高度生成和表面形变；未指定表面的 OBB 使用这里的默认表面。Perlin、顶点岩层和蜂窝曲率的细节参数共享。纹理尺寸以米计，仅改变绘制岩石材质。",
  fields: [
    {
      key: "surfaceMode",
      label: "Default rock surface / 默认岩石表面",
      type: "string",
      default: DEFAULT_ROCK_SURFACE_MODE,
      options: ["vertex-slabs", "cellular-curvature"],
      optionLabels: {
        "vertex-slabs": "Vertex-defined slabs / 顶点定义岩层",
        "cellular-curvature": "Cellular curvature · rock faces / 蜂窝曲率·岩面"
      }
    },
    field("noiseSeed", "Perlin seed / Perlin 种子", 0, 0xffffffff, 1, true),
    field("frequency", "Perlin frequency / Perlin 频率", 0.25, 32, 0.25),
    field("octaves", "Perlin octaves / Perlin 层数", 1, 8, 1, true),
    field("lacunarity", "Lacunarity / 频率倍率", 1, 4, 0.1),
    field("persistence", "Persistence / 振幅衰减", 0, 1, 0.05),
    field("maskPower", "Ascent mask power / 上升遮罩指数", 0.1, 8, 0.1),
    field("slabSeed", "Slab vertex seed / 岩层顶点种子", 0, 0xffffffff, 1, true),
    field("slabSize", "Slab size / 岩层尺寸 (m)", 2, 120, 1),
    field("slabCoverage", "Slab coverage / 岩层覆盖", 0, 1, 0.05),
    field("slabDepth", "Slab deformation depth / 岩层形变深度 (m)", 0.1, 20, 0.1),
    field("slabVariation", "Slab variation / 岩层变化", 0, 1, 0.05),
    { ...field("cellSize", "Cell size / 蜂窝尺寸 (m)", 4, 80, 1), unit: "m" },
    field("cellInset", "Cell inset / 蜂窝内缩", 0, 1, 0.05),
    field("cellDepth", "Cell depth multiplier / 蜂窝深度倍率", 0.1, 2, 0.1),
    field("cellDetail", "Cell detail multiplier / 蜂窝细节倍率", 0, 2, 0.1),
    field("cellCoverage", "Cell coverage / 蜂窝覆盖", 0, 1, 0.05),
    {
      key: "textureScale",
      label: "Texture scale / 纹理尺寸 (m)",
      type: "number",
      unit: "m",
      default: DEFAULT_ROCK_TEXTURE_SCALE,
      min: 0,
      step: 1,
      affectsLayout: false
    },
    ...ROCK_COLOR_FIELDS
  ],
  validate(values) {
    if (values.textureScale !== undefined && !(Number(values.textureScale) > 0))
      throw new Error("Rock texture scale must be positive / 岩石纹理尺寸必须大于 0");
  }
};
export const ROCK_OBB_COMPONENT: PlanningComponentDefinition = {
  type: "rockObb",
  label: "Individual rock OBB / 独立岩石 OBB",
  version: 1,
  tab: "world",
  kinds: ["rockObb"],
  description:
    "只改变选中 OBB 的宽、高、深、高度生成、坡率和表面形变。自动基础坡率为高度除以较短底边的一半；手动坡率和变化控制随机上升及 Perlin 上升遮罩。底面、位置和朝向保持。",
  fields: [
    ...(
      [
        ["width", "Width / 宽度"],
        ["height", "Height / 高度"],
        ["depth", "Depth / 深度"]
      ] as const
    ).map(([key, label]) => ({ key, label, type: "number" as const, unit: "m", min: 0.1, max: 2048, step: 0.5 })),
    {
      key: "heightMode",
      label: "Height mode / 高度生成模式",
      type: "string",
      default: DEFAULT_ROCK_HEIGHT_MODE,
      options: ["random-ascent", "perlin-ascent"],
      optionLabels: {
        "random-ascent": "Random ascent / 随机上升",
        "perlin-ascent": "Perlin noise · ascent mask / Perlin 噪声·上升遮罩"
      }
    },
    {
      key: "surfaceMode",
      label: "Rock surface / 岩石表面",
      type: "string",
      options: ["vertex-slabs", "cellular-curvature"],
      optionLabels: {
        "vertex-slabs": "Vertex-defined slabs / 顶点定义岩层",
        "cellular-curvature": "Cellular curvature · rock faces / 蜂窝曲率·岩面"
      }
    },
    {
      key: "slopeMode",
      label: "Slope mode / 坡率模式",
      type: "string",
      default: "auto",
      options: ["auto", "manual"],
      optionLabels: {
        auto: "Automatic from OBB size / 按 OBB 尺寸自动计算",
        manual: "Manual base slope / 手动基础坡率"
      }
    },
    { key: "slopeRate", label: "Manual base slope / 手动基础坡率", type: "number", unit: "m/m", min: 0, step: 0.05 },
    {
      key: "slopeVariation",
      label: "Slope variation / 坡率变化",
      type: "number",
      min: 0,
      max: 1,
      step: 0.05,
      default: DEFAULT_ROCK_SLOPE_VARIATION
    },
    {
      key: "heightVariation",
      label: "Top height variation / 顶部高度变化",
      type: "number",
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.2
    }
  ],
  validate(values) {
    if (values.slopeRate !== undefined && !(Number(values.slopeRate) > 0)) throw new Error("岩石基础坡率必须大于 0");
  }
};

export function readRockFormationSettings(document: PlanningDocument): RockFormationSettings {
  const values = document.entities.world?.components.rockFormation
    ? resolveComponent(document, "world", "rockFormation", rockFormationRegistry).values
    : {};
  const d = ROCK_FORMATION_DEFAULTS;
  const read = (key: keyof typeof d) => Number(values[key] ?? d[key]);
  return {
    surfaceMode: (values.surfaceMode ?? DEFAULT_ROCK_SURFACE_MODE) as RockSurfaceMode,
    textureScale: read("textureScale"),
    colorBlend: readRockColorBlend(values),
    perlin: {
      seed: read("noiseSeed"),
      frequency: read("frequency"),
      octaves: read("octaves"),
      lacunarity: read("lacunarity"),
      persistence: read("persistence"),
      maskPower: read("maskPower")
    },
    slabs: {
      ...defaultSlabSettings(),
      seed: read("slabSeed"),
      size: read("slabSize"),
      coverage: read("slabCoverage"),
      depth: read("slabDepth"),
      variation: read("slabVariation")
    },
    curvature: {
      cellSize: read("cellSize"),
      inset: read("cellInset"),
      depth: read("cellDepth"),
      detail: read("cellDetail"),
      coverage: read("cellCoverage")
    }
  };
}

/** Material edits must not invalidate worker meshes or building-support geometry. */
export function rockGeometrySettings(
  settings: RockFormationSettings
): Omit<RockFormationSettings, "textureScale" | "colorBlend"> {
  const { textureScale: _textureScale, colorBlend: _colorBlend, ...geometry } = settings;
  return geometry;
}

export const rockFormationRegistry = new ComponentRegistry();
rockFormationRegistry.register(ROCK_FORMATION_COMPONENT);
rockFormationRegistry.register(ROCK_OBB_COMPONENT);
