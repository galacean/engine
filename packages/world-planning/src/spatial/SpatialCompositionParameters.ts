import type { PlanningComponentDefinition } from "./PlanningComponents";
import type { PlanningSystemDeclaration } from "./PlanningSystemDeclaration";

/** General generation controls. No per-object poses, path points or instance lists. */
export const SPATIAL_COMPOSITION_DEFAULTS = {
  enabled: false,
  seed: 0,
  centerX: 512,
  centerZ: 512,
  headingDegrees: 0,
  widthM: 360,
  frontDepthM: 190,
  backDepthM: 150,
  roadWidthM: 0,
  roadBendM: 20,
  roadWavelengthM: 110,
  roadEndWidthRatio: 0.65,
  destinationId: "",
  forecourtDepthM: 0,
  streamWidthM: 0,
  streamDepthM: 1.4,
  bankWidthM: 7,
  leftReliefM: 0,
  rightReliefM: 0,
  reliefSurface: "terrain",
  reliefBandWidthM: 0,
  reliefFrontDepthM: 0,
  reliefInnerHeightRatio: 0,
  reliefFrontHeightRatio: 0,
  reliefTreeDensity: 0,
  terraceStepHeightM: 20,
  terraceTreadM: 32,
  cliffSharpness: 1,
  terrainRoughness: 0.15,
  waterfallWidthM: 0,
  treeSpacingM: 0,
  treeBandWidthM: 18,
  treeAssetId: "",
  rockSpacingM: 0,
  rockWidthM: 6,
  rockDepthM: 5,
  rockHeightM: 3,
  subjectSpacingM: 12,
  subjectArcDegrees: 30,
  subjectSide: "right",
  primaryPattern: "row",
  floatingHeightM: 30,
  basinRadiusM: 0,
  basinDepthM: 4,
  replacePopulation: false
} as const;
export type SpatialCompositionParameters = {
  [K in keyof typeof SPATIAL_COMPOSITION_DEFAULTS]: (typeof SPATIAL_COMPOSITION_DEFAULTS)[K] extends boolean
    ? boolean
    : (typeof SPATIAL_COMPOSITION_DEFAULTS)[K] extends number
      ? number
      : string;
};
export function spatialCompositionParameters(
  value?: Partial<SpatialCompositionParameters>
): SpatialCompositionParameters {
  return { ...SPATIAL_COMPOSITION_DEFAULTS, ...value };
}
const labels: Record<keyof SpatialCompositionParameters, string> = {
  enabled: "启用景观布局",
  seed: "布局随机种子",
  centerX: "布局中心 X",
  centerZ: "布局中心 Z",
  headingDegrees: "整体朝向",
  widthM: "布局宽度",
  frontDepthM: "前景纵深",
  backDepthM: "后景纵深",
  roadWidthM: "步道宽度（0 关闭）",
  roadBendM: "步道弯曲幅度",
  roadWavelengthM: "步道弯曲尺度",
  roadEndWidthRatio: "远端与近端路宽比",
  destinationId: "步道目的地对象 ID",
  forecourtDepthM: "主体前庭净深",
  streamWidthM: "两侧水道宽度（0 关闭）",
  streamDepthM: "浅水深度",
  bankWidthM: "道路与水岸间距",
  leftReliefM: "左侧岩台总高",
  rightReliefM: "右侧岩台总高",
  reliefSurface: "岩台生成方式",
  reliefBandWidthM: "岩壁带宽（0 自动）",
  reliefFrontDepthM: "岩壁向前伸出距离",
  reliefInnerHeightRatio: "岩壁内缘高度比例",
  reliefFrontHeightRatio: "岩壁前缘高度比例",
  reliefTreeDensity: "岩台树木密度",
  terraceStepHeightM: "岩台单级高度",
  terraceTreadM: "岩台单级进深",
  cliffSharpness: "岩台边缘锐度",
  terrainRoughness: "地貌粗糙度",
  waterfallWidthM: "高岸落水宽度（0 关闭）",
  treeSpacingM: "沿岸树间距（0 关闭）",
  treeBandWidthM: "沿岸植被带宽",
  treeAssetId: "乔木资产 ID（空为自然物种）",
  rockSpacingM: "岸石间距（0 关闭）",
  rockWidthM: "岸石宽度",
  rockDepthM: "岸石进深",
  rockHeightM: "岸石高度",
  subjectSpacingM: "主体与附属资产间距",
  subjectArcDegrees: "附属资产展开角",
  subjectSide: "附属资产方位",
  primaryPattern: "主景排列方向",
  floatingHeightM: "悬空主体离地高度",
  basinRadiusM: "水下场景湖盆半径（0 关闭）",
  basinDepthM: "水下场景湖盆深度",
  replacePopulation: "由布局参数接管区域内景观"
};
const positive = new Set([
  "widthM",
  "frontDepthM",
  "backDepthM",
  "roadWavelengthM",
  "roadEndWidthRatio",
  "streamDepthM",
  "bankWidthM",
  "terraceStepHeightM",
  "terraceTreadM",
  "rockWidthM",
  "rockDepthM",
  "rockHeightM",
  "basinDepthM"
]);
const ratios = new Set([
  "cliffSharpness",
  "terrainRoughness",
  "reliefInnerHeightRatio",
  "reliefFrontHeightRatio",
  "reliefTreeDensity"
]);
export const SPATIAL_COMPOSITION_COMPONENT: PlanningComponentDefinition = {
  type: "landscapeComposition",
  label: "景观布局生成",
  version: 1,
  tab: "world",
  kinds: ["world"],
  description: "通用轴线、岸线、阶梯地貌和沿岸植被参数。实例位置、道路控制点和河岸轮廓均为求解结果，不持久化。",
  fields: Object.entries(SPATIAL_COMPOSITION_DEFAULTS).map(([key, value]) => ({
    key,
    label: labels[key as keyof SpatialCompositionParameters],
    type: typeof value as "number" | "boolean" | "string",
    default: value,
    combine: "override" as const,
    ...(typeof value === "number"
      ? {
          unit: key.endsWith("Degrees")
            ? "°"
            : ratios.has(key) || key.endsWith("Ratio")
              ? "比例"
              : key === "seed"
                ? "整数"
                : "m",
          integer: key === "seed",
          step: key.endsWith("Ratio") || ratios.has(key) ? 0.05 : 1,
          min: ["centerX", "centerZ", "headingDegrees"].includes(key)
            ? undefined
            : positive.has(key)
              ? Number.EPSILON
              : 0,
          ...(ratios.has(key) ? { max: 1 } : {})
        }
      : {}),
    ...(key === "subjectSide" ? { options: ["left", "right", "both"] } : {}),
    ...(key === "primaryPattern" ? { options: ["row", "depth"] } : {}),
    ...(key === "reliefSurface"
      ? { options: ["terrain", "rocks"], optionLabels: { terrain: "地形台地", rocks: "程序化岩石" } }
      : {})
  })),
  global: Object.fromEntries(
    Object.keys(SPATIAL_COMPOSITION_DEFAULTS).map((key) => [key, "spatialComposition." + key])
  ),
  validate: (values) => {
    const q = spatialCompositionParameters(values as Partial<SpatialCompositionParameters>);
    if (q.subjectArcDegrees >= 180) throw new Error("附属资产展开角须小于 180 度");
    if (!Number.isSafeInteger(q.seed) || q.seed > 0xffffffff) throw new Error("布局 Seed 须为 32 位无符号整数");
    if (!["terrain", "rocks"].includes(q.reliefSurface)) throw new Error("未知岩台生成方式");
  }
};
export const SPATIAL_COMPOSITION_DECLARATION: PlanningSystemDeclaration = {
  id: "landscape-composition",
  title: "景观布局生成",
  skill: "spatial",
  components: [
    {
      type: "landscapeComposition",
      domain: "composition",
      knowledge: [
        "landscapeComposition 控制通用的布局尺寸、轴线弯曲、步道路宽、两岸水系、阶梯岩台、树石间距与主体排列；不接收逐实例坐标或路径点表。",
        "宽度、纵深和间距决定实例数量；道路、水面、地形、植被及导航消费同一求解结果。0 可关闭路、水、树石或瀑布，不需要模板专用分支。",
        "新增或调整参数经现有 set/reset/base、保存和撤销事务求解。颜色、光照及已有植被密度继续由它们自己的组件负责。"
      ]
    }
  ]
};
