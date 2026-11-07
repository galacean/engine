import type { PlanningComponentDefinition } from "../../../spatial/PlanningComponents.ts";
import type { PlanningDocument } from "../../../spatial/PlanningDocument.ts";
import { ComponentRegistry, resolveComponent } from "../../../spatial/SpatialDocument.ts";
import { readRockColorBlend, ROCK_COLOR_FIELDS, type RockColorBlend } from "./ColorPalette.ts";

/** Zero selects a world-space repeat of half the longest published OBB dimension. */
export const DEFAULT_ROCK_TEXTURE_SCALE = 0;
export const ROCK_SHAPE_DEFAULTS = {
  topScale: 0.7,
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
  shape: typeof ROCK_SHAPE_DEFAULTS;
  variation: number;
  simplifyError: number;
}
export const ROCK_FORMATION_DEFAULTS = {
  ...ROCK_SHAPE_DEFAULTS,
  textureScale: DEFAULT_ROCK_TEXTURE_SCALE,
  variation: 0.65,
  simplifyError: 0.008
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
    field("outlineIrregularity", "Outline variation / 整体轮廓变化", 0, 1, 0.01),
    field("wallCount", "Wall contours / 岩壁组合轮廓数", 4, 28, 1),
    field("wallOverlap", "Face width / 岩块横向宽度", 0, 1, 0.01),
    field("wallProtrusion", "Shoulder relief / 岩块伸出高度", 0, 1, 0.01),
    field("wallLength", "Face length / 岩块纵向长度", 0.5, 3, 0.05),
    field("wallTilt", "Face inclination / 岩块倾斜", -35, 35, 1, "°"),
    field("wallStrength", "Cut strength / 切削强度", 0, 1, 0.01),
    field("variation", "Per-rock variation / 单石变化范围", 0, 1, 0.01),
    field("simplifyError", "Mesh error / 减面误差比例", 0.001, 0.04, 0.001),
    { ...field("textureScale", "Texture repeat / 纹理平铺米数（0 自动）", 0, 2048, 1, "m"), affectsLayout: false },
    ...ROCK_COLOR_FIELDS
  ]
};
export const ROCK_OBB_COMPONENT: PlanningComponentDefinition = {
  type: "rockObb",
  label: "Individual rock OBB / 独立岩石 OBB",
  version: 1,
  tab: "world",
  kinds: ["rockObb"],
  description: "改变选中 OBB 的宽、高、深；位置、朝向及造型参数的作用域保持不变。",
  fields: (
    [
      ["width", "Width / 宽度"],
      ["height", "Height / 高度"],
      ["depth", "Depth / 深度"]
    ] as const
  ).map(([key, label]) => ({ key, label, type: "number" as const, unit: "m", min: 0.1, max: 2048, step: 0.5 }))
};

export function readRockFormationSettings(document: PlanningDocument): RockFormationSettings {
  const values = document.entities.world?.components.rockFormation
    ? resolveComponent(document, "world", "rockFormation", rockFormationRegistry).values
    : {};
  const read = (key: keyof typeof ROCK_FORMATION_DEFAULTS) => Number(values[key] ?? ROCK_FORMATION_DEFAULTS[key]);
  return {
    textureScale: read("textureScale"),
    colorBlend: readRockColorBlend(values),
    shape: Object.fromEntries(
      Object.keys(ROCK_SHAPE_DEFAULTS).map((key) => [key, read(key as keyof typeof ROCK_SHAPE_DEFAULTS)])
    ) as typeof ROCK_SHAPE_DEFAULTS,
    variation: read("variation"),
    simplifyError: read("simplifyError")
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
