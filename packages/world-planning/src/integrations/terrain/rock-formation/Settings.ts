import type { PlanningComponentDefinition } from "../../../spatial/PlanningComponents.ts";
import type { PlanningDocument } from "../../../spatial/PlanningDocument.ts";
import { ComponentRegistry, resolveComponent } from "../../../spatial/SpatialDocument.ts";
import { DEFAULT_ROCK_HEIGHT_MODE, DEFAULT_ROCK_HEIGHT_VARIATION } from "@galacean/engine-terrain/rock-formation/types";
import { DEFAULT_ROCK_SLOPE_VARIATION } from "@galacean/engine-terrain/rock-formation/Slope";
import { readRockColorBlend, ROCK_COLOR_FIELDS, type RockColorBlend } from "./ColorPalette.ts";

/** Zero selects a world-space repeat of half the longest published OBB dimension. */
export const DEFAULT_ROCK_TEXTURE_SCALE = 0;
export const ROCK_SHAPE_DEFAULTS = {
  topScale: 1,
  bottomScale: 0.95,
  shoulderScale: 0.95,
  shoulderHeight: 0.5,
  topRoughness: 0.65,
  topSlope: 15,
  wallCount: 14,
  wallOverlap: 0.65,
  wallProtrusion: 1,
  wallLength: 2.35,
  wallTilt: 30,
  wallStrength: 0.92,
  outlineIrregularity: 0.6
};
export interface RockFormationSettings {
  textureScale: number;
  colorBlend: RockColorBlend;
  shape: typeof ROCK_SHAPE_DEFAULTS & { topDirection?: number };
  /** Sparse, independently authored shapes; resolved only for the requested rock. */
  overrides?: Record<string, Partial<typeof ROCK_FORMATION_DEFAULTS> & { topDirection?: number }>;
  variation: number;
  targetTriangles: number;
}
export const ROCK_FORMATION_DEFAULTS = {
  ...ROCK_SHAPE_DEFAULTS,
  textureScale: DEFAULT_ROCK_TEXTURE_SCALE,
  variation: 0.65,
  targetTriangles: 1000
};
const field = (
  key: keyof typeof ROCK_FORMATION_DEFAULTS,
  label: string,
  min: number,
  max: number,
  step: number,
  unit?: string
) => ({ key, label, type: "number" as const, min, max, step, unit, default: ROCK_FORMATION_DEFAULTS[key] });
export const ROCK_FORMATION_COMPONENT: PlanningComponentDefinition = {
  type: "rockFormation",
  label: "Procedural rocks / 程序化岩石",
  version: 1,
  tab: "world",
  sparseGlobal: true,
  presentation: true,
  description:
    "所有岩石共用受约束轮廓、连续岩肩与切削生成器。仅改变 OBB 内部造型，布局和尺寸不变；同种子及对象身份可重复生成。",
  fields: [
    field("topScale", "Top section / 顶部截面范围", 0.08, 1, 0.01),
    field("bottomScale", "Bottom section / 底部截面范围", 0, 1, 0.01),
    field("shoulderScale", "Shoulder width / 肩部宽度", 0.08, 1, 0.01),
    field("shoulderHeight", "Shoulder height / 肩部高度", 0.15, 0.9, 0.01),
    field("topRoughness", "Top relief / 顶部起伏", 0, 1, 0.01),
    field("topSlope", "Top inclination / 顶部倾斜", 0, 75, 1, "°"),
    {
      key: "topDirection",
      label: "Top direction / 顶部坡向",
      type: "number",
      min: 0,
      max: 360,
      step: 1,
      unit: "°",
      description: "未指定时按 Seed 生成坡向；指定后使用 OBB 内的固定方向。"
    },
    field("outlineIrregularity", "Outline variation / 整体轮廓变化", 0, 1, 0.01),
    field("wallCount", "Wall contours / 岩壁组合轮廓数", 4, 28, 1),
    field("wallOverlap", "Face width / 岩块横向宽度", 0, 1, 0.01),
    field("wallProtrusion", "Shoulder relief / 岩块伸出高度", 0, 1, 0.01),
    field("wallLength", "Face length / 岩块纵向长度", 0.5, 3, 0.05),
    field("wallTilt", "Face inclination / 岩块倾斜", -35, 35, 1, "°"),
    field("wallStrength", "Cut strength / 切削强度", 0, 1, 0.01),
    field("variation", "Per-rock variation / 单石变化范围", 0, 1, 0.01),
    field("targetTriangles", "Triangles per rock / 单石目标面数", 500, 10000, 100),
    {
      ...field("textureScale", "Texture repeat / 纹理平铺米数（0 自动）", 0, 2048, 1, "m"),
      affectsLayout: false,
      kinds: ["world"]
    },
    ...ROCK_COLOR_FIELDS.map((field) => ({ ...field, kinds: ["world"] }))
  ]
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
      label: "Upper height variation / 上层高度变化",
      type: "number",
      unit: "%",
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_ROCK_HEIGHT_VARIATION
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
  const read = (key: keyof typeof ROCK_FORMATION_DEFAULTS) => Number(values[key] ?? ROCK_FORMATION_DEFAULTS[key]);
  return {
    textureScale: read("textureScale"),
    colorBlend: readRockColorBlend(values),
    shape: {
      ...(Object.fromEntries(
        Object.keys(ROCK_SHAPE_DEFAULTS).map((key) => [key, read(key as keyof typeof ROCK_SHAPE_DEFAULTS)])
      ) as typeof ROCK_SHAPE_DEFAULTS),
      ...(values.topDirection !== undefined ? { topDirection: Number(values.topDirection) } : {})
    },
    overrides: Object.fromEntries(
      Object.values(document.entities).flatMap((entity) => {
        if (entity.id === "world" || !entity.components.rockFormation) return [];
        const resolved = resolveComponent(document, entity.id, "rockFormation", rockFormationRegistry);
        return [
          [
            entity.id,
            Object.fromEntries(
              Object.entries(resolved.values).filter(
                ([key]) =>
                  resolved.sources[key]?.some((source) => source !== "world") &&
                  (key in ROCK_SHAPE_DEFAULTS || ["topDirection", "variation", "targetTriangles"].includes(key))
              )
            )
          ]
        ];
      })
    ),
    variation: read("variation"),
    targetTriangles: read("targetTriangles")
  };
}
/** Material edits retain geometry, collision and worker caches. */
export function rockGeometrySettings(
  settings: RockFormationSettings
): Omit<RockFormationSettings, "textureScale" | "colorBlend"> {
  const { textureScale: _textureScale, colorBlend: _colorBlend, ...geometry } = settings;
  return geometry;
}

export const rockFormationRegistry = new ComponentRegistry();
rockFormationRegistry.register(ROCK_FORMATION_COMPONENT);
rockFormationRegistry.register(ROCK_OBB_COMPONENT);

/** A job is one editable OBB. Local shape edits cannot invalidate its siblings' caches. */
export function rockSettingsForJob(settings: RockFormationSettings, id: string): RockFormationSettings {
  const ownerEnd = id.lastIndexOf(":obb:");
  const owner = ownerEnd < 0 ? id : id.slice(0, ownerEnd);
  const patch = { ...settings.overrides?.[owner], ...settings.overrides?.[id] };
  const { variation, targetTriangles, ...shape } = patch;
  const { overrides: _overrides, ...base } = settings;
  return {
    ...base,
    shape: { ...base.shape, ...shape },
    variation: variation ?? base.variation,
    targetTriangles: targetTriangles ?? base.targetTriangles
  };
}
