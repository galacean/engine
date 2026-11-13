import { SPATIAL_COMPOSITION_COMPONENT } from "./SpatialCompositionParameters";
import { LAKE_DEFAULTS } from "./hydrology/LakeRegions";
import { SUSPENSION_BRIDGE_DEFAULTS } from "@galacean/engine-water/bridges/SuspensionBridge";
import { ANIMAL_POPULATION_COMPONENT } from "./AnimalPopulationComponent";
import { RIVER_DEFAULTS } from "./hydrology/RiverRegions";
import { layoutRuleManifest } from "./layout/LayoutRules";
import { NATURAL_VEGETATION_CONTROLS, NATURAL_VEGETATION_DEFAULTS } from "../planning-data/NaturalVegetationProfile";
import { NATURAL_VEGETATION_SIZE_CONTROLS } from "../runtime/NaturalVegetationLayers.ts";
import { LANDSCAPE_INFLUENCE_DEFAULTS } from "./ecology/LandscapeInfluences";
import { WAYFINDING_DEFAULTS } from "./guidance/WayfindingPolicy";
import landscapeRules from "../planning-data/landscape-contexts.json";
import { FLOWER_DEFAULTS } from "./ecology/FlowerRegions";
import { FLOWER_ASSET_VARIANTS } from "../planning-data/FlowerAssetWeights";
import { PLANT_MATERIAL_COMPONENT } from "./PlantMaterialParameters";
import { GRASS_APPEARANCE_COMPONENT, SURFACE_PALETTE_COMPONENT } from "./PlanningGrassAppearance";
import { PLANNING_WEATHER_COMPONENT } from "./PlanningWeather";
import { ROCK_FORMATION_COMPONENT, ROCK_OBB_COMPONENT } from "../integrations/terrain/rock-formation/Settings.ts";
import { ROCK_GENERATION_COMPONENT } from "../integrations/terrain/rock-formation/GenerationProfile.ts";
import { RELIEF_COMPONENT } from "./terrain/ReliefComponent";
import { INTEGRATED_WORLD_POST_PROCESS_PROFILE as POST } from "@galacean/engine-terrain/terrain/project/IntegratedWorldPostProcessPreset";
import poiLayoutDefaults from "../planning-data/poi-layout.json";
import layoutProfile from "./layout/space-rules.json";
import roadProfile from "../planning-data/units/road.json";
import { ComponentRegistry, type ComponentDefinition, type SpatialField } from "./SpatialDocument";
import { SUBJECT_VIEW_COMPONENT } from "./PlanningSubjectView";
import { WORLD_TEMPLATES } from "./WorldTemplateCatalog";
import { PLANNING_FARMING_COMPONENT } from "./farming/PlanningFarmingComponent";
import {
  PLANNING_LIGHT_SOURCE_FIELDS,
  PLANNING_SKY_FIELDS,
  PLANNING_LIGHTING_RESOURCES
} from "./PlanningLightingParameters";
import type { PlanningResourceDefinition } from "./PlanningResourcePreflight";
import { SEED_WORLD_LIGHTING_PROFILE_URL } from "../integrations/terrain/lighting/TerrainLightingProfile.ts";
/** Algorithm bindings are private to the planning adapter, never to the editor or an agent. */
export interface PlanningComponentDefinition extends ComponentDefinition {
  /** Resources must resolve and validate before an author transaction can publish a changed reference. */
  resources?: readonly PlanningResourceDefinition[];
  tab: "world" | "ecology" | "roads" | "lighting" | "wayfinding";
  /** Optional UI grouping for world-level recipe parameters; does not change component ownership. */
  group?: string;
  /** Primary spatial controls precede secondary ecological influences. */
  inspectorOrder?: number;
  /** False keeps specialized controls out of the spatial inspector; authoring and agent APIs remain available. */
  inspector?: boolean;
  /** Optional native authoring labels; no change to parameter ownership. */
  scopePresentation?: Record<string, { label: string; description: string }>;
  /** UI defaults remain implicit for additive controls in older saved recipes. */
  sparseGlobal?: boolean;
  /** Presentation components do not participate in geometry generation. */
  presentation?: boolean;
  /** World gameplay configuration is authored here, but consumed after geometry publication. */
  runtime?: boolean;
  /** Retained for saved recipes; not offered as a second authoring entry. */
  legacy?: boolean;
  global?: Record<string, string>;
  local?: Record<string, string>;
  kinds?: string[];
  /** Required published bindings, independent of the geometry's generic scene kind. */
  sceneComponents?: string[];
}
export function planningComponentAppliesTo(
  definition: PlanningComponentDefinition,
  scene: { kind: string; components: Record<string, unknown> }
): boolean {
  return (
    !!definition.kinds?.includes(scene.kind) &&
    (definition.sceneComponents ?? []).every((type) => !!scene.components[type])
  );
}
/** Numeric metadata contains mathematical limits only; initialization distributions live in planning-data. */
const number = (key: string, label: string, options: Partial<SpatialField>): SpatialField => ({
  key,
  label,
  type: "number",
  ...options,
  integer: key === "seed" || options.unit === "个",
  combine: "override"
});
const localPaths = (fields: SpatialField[], prefix = "") =>
  Object.fromEntries(fields.map((f) => [f.key, prefix + f.key]));
const prefixPaths = (fields: SpatialField[], prefix: string) =>
  Object.fromEntries(fields.map((f) => [f.key, prefix + f.key]));
const riverFields: SpatialField[] = [
  { ...number("speed", "流速", { unit: "m/s", min: 0, default: 1 }), kinds: ["water"] },
  { ...number("bankClearance", "岸顶预留高度", { unit: "m", min: 0, default: 0.05 }), kinds: ["water"] },
  { ...number("dropThreshold", "落水识别高度", { unit: "m", min: 0.000001, default: 0.5 }), kinds: ["water"] },
  { ...number("slopeThreshold", "落水识别坡度", { min: 0.000001, default: 0.2 }), kinds: ["water"] },
  { ...number("probeSpacing", "地形采样间距", { unit: "m", min: 0.000001, default: 0.25 }), kinds: ["water"] },
  {
    key: "levelMode",
    label: "河面高程来源",
    type: "string",
    kinds: ["water"],
    combine: "override",
    options: ["terrain", "minimum"],
    optionLabels: { terrain: "沿地形流动", minimum: "按完整路径最低地面生成平水面" },
    default: "terrain"
  },
  {
    key: "points",
    label: "河流控制点（米）",
    type: "records",
    kinds: ["water"],
    combine: "override",
    columns: [
      { key: "x", label: "X", type: "number", default: 0 },
      { key: "z", label: "Z", type: "number", default: 0 },
      { key: "elevation", label: "水面高程", type: "number" },
      { key: "width", label: "宽度", type: "number", default: 1 },
      { key: "depth", label: "深度", type: "number", default: 0.1 }
    ]
  },
  {
    key: "sections",
    label: "分段形式与雕刻授权",
    type: "records",
    kinds: ["water"],
    combine: "override",
    columns: [
      { key: "from", label: "起点 ID", type: "string" },
      { key: "to", label: "终点 ID", type: "string" },
      {
        key: "form",
        label: "auto / slope / waterfall / steps",
        type: "string",
        choices: ["auto", "slope", "waterfall", "steps"],
        default: "auto"
      },
      { key: "carve", label: "允许雕刻", type: "boolean", default: false },
      { key: "drop", label: "目标落差（米）", type: "number" },
      { key: "stepCount", label: "台阶数", type: "number" }
    ]
  },
  { key: "enabled", label: "生成此河流", type: "boolean", default: true, kinds: ["water"], combine: "override" },
  number("countMin", "河流数量下限", {
    description: "按 Seed 在范围内采样候选数；空间不足时允许少于下限，不补造。",
    unit: "个",
    min: 0,
    default: RIVER_DEFAULTS.countMin,
    kinds: ["world"]
  }),
  number("countMax", "河流数量上限", { unit: "个", min: 0, default: RIVER_DEFAULTS.countMax, kinds: ["world"] }),
  {
    key: "automaticLevel",
    label: "按地形生成逐段高程",
    type: "boolean",
    combine: "override",
    default: true,
    kinds: ["world"]
  } as SpatialField,
  number("waterY", "指定水面高度", {
    unit: "m",
    step: 0.5,
    default: RIVER_DEFAULTS.waterY,
    kinds: ["world"],
    visibleWhen: { field: "automaticLevel", values: [false] }
  }),
  number("lengthM", "河流长度", {
    unit: "m",
    min: 1,
    step: 10,
    default: RIVER_DEFAULTS.lengthM,
    kinds: ["world", "water"]
  }),
  ...(
    [
      ["widthMinM", "河宽下限"],
      ["widthMaxM", "河宽上限"],
      ["bendM", "弯曲幅度"],
      ["bendScaleM", "弯曲尺度"],
      ["depthMinM", "水下深度下限"],
      ["depthMaxM", "水下深度上限"],
      ["bankWidthM", "基础岸坡过渡宽度"]
    ] as const
  ).map(([key, label]) => number(key, label, { unit: "m", step: 0.5, min: 0.01, default: RIVER_DEFAULTS[key] })),
  number("preference", "河流经过倾向", { step: 0.1, min: 0, default: 1, kinds: ["poi"] })
];
const lakeFields: SpatialField[] = [
  number("referenceLevel", "固定湖盆参考高程", { unit: "m", kinds: ["lake"] }),
  {
    key: "shoreline",
    label: "闭合湖岸与岛洞（米）",
    type: "records",
    kinds: ["lake"],
    combine: "override",
    columns: [
      { key: "ring", label: "环（shore 为外岸）", type: "string", default: "shore" },
      { key: "x", label: "X", type: "number", default: 0 },
      { key: "z", label: "Z", type: "number", default: 0 }
    ]
  },
  number("countMin", "湖泊数量下限", {
    description: "按 Seed 在范围内采样候选数；空间不足时允许少于下限，不补造。",
    unit: "个",
    min: 0,
    default: LAKE_DEFAULTS.countMin,
    kinds: ["world"]
  }),
  number("countMax", "湖泊数量上限", { unit: "个", min: 0, default: LAKE_DEFAULTS.countMax, kinds: ["world"] }),
  number("radiusM", "湖区半径", { unit: "m", min: 0.5, default: LAKE_DEFAULTS.radiusM }),
  number("depthM", "湖盆目标深度", { unit: "m", min: 0.01, default: LAKE_DEFAULTS.depthM }),
  number("bankWidthM", "岸外过渡宽度", { unit: "m", min: 0.05, default: LAKE_DEFAULTS.bankWidthM }),
  { key: "allowCarving", label: "允许雕刻湖盆", type: "boolean", default: true, combine: "override" },
  number("offsetX", "湖区 X 偏移", { unit: "m", default: 0, kinds: ["lake"] }),
  number("offsetZ", "湖区 Z 偏移", { unit: "m", default: 0, kinds: ["lake"] }),
  number("levelOffsetM", "水位相对湖岸", { unit: "m", max: 0, default: 0, kinds: ["lake"] }),
  { key: "enabled", label: "生成此湖泊", type: "boolean", default: true, combine: "override", kinds: ["lake"] }
];
const landscape = [
  ...NATURAL_VEGETATION_SIZE_CONTROLS.flatMap((control) =>
    (["scaleMin", "scaleMax"] as const).map((bound, index) => ({
      ...number(`plantSizes.${control.key}.${bound}`, `${control.label} · 共享尺度${index === 0 ? "下限" : "上限"}`, {
        unit: "倍（素材原始尺度）",
        min: 0,
        step: 0.05,
        default: control.scale[index],
        kinds: ["world"]
      }),
      description:
        "同一功能层的所有物种共用此范围，各实例与LOD按各自素材原始尺寸等比生长；范围须为正数，下限不超过上限。重新计算植株实际占地、净空及低草与花灌木的相对高度；不改变颜色、物种权重或密度参数。仅全局功能层级，不能声称只改一种、一株或一块花区。未设置端点继续继承生态配方，reset恢复来源。乔木使用treeHeight范围，连续低草使用grassRelativeHeight。"
    }))
  ),
  ...(
    [
      {
        ...number("companionStoneDensity", "地表小石头密度", {
          min: 0,
          max: 1,
          step: 0.01,
          unit: "%",
          default: NATURAL_VEGETATION_DEFAULTS.companionStoneDensity
        }),
        description: "控制自动散布和树脚伴生的小石头，0 时关闭。"
      },
      {
        ...number("grassRelativeHeight", "低草相对花灌木高度", {
          min: 0.05,
          max: 1,
          step: 0.01,
          unit: "%",
          default: NATURAL_VEGETATION_DEFAULTS.grassRelativeHeight
        }),
        description: "以所在群落启用的花、灌木实测最小高度为参照，推导低草高度；没有花灌木时按草本素材自身尺度生长。"
      },
      {
        ...number("grassHeightVariation", "低草高度变化", {
          min: 0,
          max: 0.95,
          step: 0.01,
          unit: "%",
          default: NATURAL_VEGETATION_DEFAULTS.grassHeightVariation
        }),
        description: "在生态推导的高度以下产生稳定的个体差异，0为等高；不改变叶宽和密度。"
      },
      {
        ...number("roadsideGrassHeightRatio", "路边低草相对高度", {
          min: 0.05,
          max: 1,
          step: 0.01,
          unit: "%",
          default: NATURAL_VEGETATION_DEFAULTS.roadsideGrassHeightRatio
        }),
        description: "贴近路边时占群落低草高度的比例，在伴生带内向外平滑恢复；1不额外压低。"
      },
      {
        ...number("roadsideBandM", "路边伴生带宽度", {
          min: 0,
          step: 0.5,
          unit: "m",
          default: NATURAL_VEGETATION_DEFAULTS.roadsideBandM
        }),
        description: "从实际路面边缘向外计算；0关闭路边偏好，不改变道路净空。"
      },
      {
        ...number("roadsideDensityMultiplier", "路边伴生倍率", {
          min: 0,
          step: 0.1,
          unit: "倍",
          default: NATURAL_VEGETATION_DEFAULTS.roadsideDensityMultiplier
        }),
        description:
          "灌木、花丛和地被在路边富集，向带外平滑衰减。1无偏好，0抑制贴边生长；改变实际显示数量，不把被遮挡的花丛搬到其他位置补足。"
      },
      {
        ...number("solidEdgeBandM", "岩石与墙脚伴生带宽度", {
          min: 0,
          step: 0.5,
          unit: "m",
          default: NATURAL_VEGETATION_DEFAULTS.solidEdgeBandM
        }),
        description: "从实际占地边缘向外计算，0关闭贴边偏好。"
      },
      {
        ...number("solidEdgeDensityMultiplier", "岩石与墙脚伴生倍率", {
          min: 0,
          step: 0.1,
          unit: "倍",
          default: NATURAL_VEGETATION_DEFAULTS.solidEdgeDensityMultiplier
        }),
        description: "在岩石与建筑边缘富集灌木、花丛、地被；高草不随之增密。"
      }
    ] satisfies SpatialField[]
  ).map((field) => ({ ...field, kinds: ["world"] })),
  ...NATURAL_VEGETATION_CONTROLS.map((layer) => ({
    ...number("vegetation." + layer.key, layer.label + "密度比例", {
      min: 0,
      max: 1,
      step: 0.01,
      unit: "%",
      default: layer.density
    }),
    description:
      layer.key === "grass"
        ? "控制低草实例与地表草覆盖，0关闭，1恢复配方覆盖；其他植被层独立。"
        : "在所属区域筛选固定生成候选，0隐藏该层，1恢复配方候选；减少后恢复保留原位置，不补位、不搬动其他植株或修改其他模块。单体作者记录独立，不由此字段删改。" +
          (layer.key === "flowers" ? "野花候选来自flowers花区，实际数量不保证等于面积乘密度。" : "")
  })),
  number("density", "区域景观密度系数", { unit: "%", step: 0.01, min: 0 }),
  number("edgeDensity", "远离中心的保留密度", {
    unit: "%",
    step: 0.01,
    min: 0,
    max: 1,
    default: landscapeRules.distribution.edgeDensity
  }),
  number("falloffRatio", "景观衰减范围", {
    unit: "%",
    step: 0.01,
    min: 0,
    default: 1
  }),
  {
    ...number("boundaryBlendM", "区域边界过渡", {
      unit: "m",
      step: 1,
      min: 0,
      default: landscapeRules.distribution.boundaryBlendM
    }),
    kinds: ["world"]
  },
  number("contexts.openland", "空地密度系数", {
    unit: "%",
    step: 0.01,
    min: 0,
    default: landscapeRules.distribution.openlandDensity
  }),
  number("treeHeightMinM", "景观高度下限", { unit: "m", step: 0.1, min: 0.001 }),
  number("treeHeightMaxM", "景观高度上限", { unit: "m", step: 0.1, min: 0.001 }),
  number("maxAltitudeM", "海拔上限", { unit: "m", step: 1, min: 0.001 }),
  number("maxSlopeDegrees", "坡度上限", { unit: "°", step: 1, min: 0, max: 90 }),
  ...["road", "building", "landform", "poi"].map((k, i) =>
    number("contexts." + k, ["道路带", "体量带", "实体带", "点位邻近带"][i] + "密度系数", {
      unit: "%",
      step: 0.01,
      min: 0
    })
  )
];
const flowers = [
  {
    ...number("coverage", "花区覆盖率", { min: 0, max: 1, step: 0.01, unit: "%", default: FLOWER_DEFAULTS.coverage }),
    description:
      "花分布场的疏密倾向，不是精确面积配额；0 关闭，1 覆盖可用预览区域。实际花丛仍检查水域、道路、实体与坡度。"
  },
  {
    ...number("densityPerM2", "花区内密度", {
      min: 0,
      step: 0.01,
      unit: "丛/㎡",
      default: FLOWER_DEFAULTS.densityPerM2
    }),
    description:
      "每平方米的一次候选采样率，不计算或补足目标株数；道路、水域、实体、坡度及可见性筛选决定实际数量。自然植被中的野花密度比例只筛选固定候选，减少后恢复不会搬动原有花丛。"
  },
  number("patchSizeM", "花丛斑块尺度", { min: 0.001, step: 1, unit: "m", default: FLOWER_DEFAULTS.patchSizeM }),
  number("maxSlopeDegrees", "花丛坡度上限", {
    min: 0,
    max: 90,
    step: 1,
    unit: "°",
    default: FLOWER_DEFAULTS.maxSlopeDegrees
  }),
  ...FLOWER_ASSET_VARIANTS.map((asset) => ({
    ...number(`assetWeights.${asset.id}`, `${asset.label} · 出现权重`, { min: 0, step: 0.01, unit: "相对权重" }),
    computedSource: "按 Seed 与花区生成",
    description: `原生花资产的出现权重，不是颜色参数；未编辑字段仍按 Seed 与花区身份确定性抽样，0 不生成，正值按同一花区内权重归一化选择。设置部分花型的正权重不会关闭其它花型；全部为0时不生成花丛。保留原形体与 LOD，花瓣和茎叶均可通过世界 plantMaterial 的各自材质槽修改线性 RGB，不限于素材原色。此变体未覆盖的花瓣原色：${asset.petals.map((slot) => `${slot.id} [${slot.baseColor.join(", ")}]`).join("；")}。草地与低草颜色属于 grassAppearance，树冠、灌木及其它植物槽属于 plantMaterial；本字段不改变它们。`
  }))
];
// Read compatibility for historical per-world/POI context values; absent from authoring discovery and UI.
const flowerInfluence = [
  { key: "enabled", label: "影响周边花丛", type: "boolean" as const, default: true },
  number("bandM", "影响范围", { unit: "m", step: 1, min: 0 }),
  number("multiplier", "选址偏好倍率", { unit: "倍", step: 0.05, min: 0 }),
  number("falloff", "向外衰减", { unit: "", step: 0.1, min: 0 })
];
const wayfindingFields: SpatialField[] = [
  {
    ...number("routeCoverage", "沿程引导覆盖比例", {
      unit: "%",
      step: 0.05,
      min: 0,
      max: 1,
      default: WAYFINDING_DEFAULTS.routeCoverage
    }),
    description: "按道路长度在转弯附近安排错落体量，形成开阔与收紧的空间节奏；放不下的位置保留空白。"
  },
  number("sBend", "S 形路径倾向", { unit: "%", step: 0.05, min: 0, max: 1, default: WAYFINDING_DEFAULTS.sBend }),
  number("corridorWidthM", "流动通道宽度", {
    unit: "m",
    step: 1,
    min: 0.001,
    default: WAYFINDING_DEFAULTS.corridorWidthM
  }),
  number("massHeightM", "沿路体量高度", { unit: "m", step: 1, min: 0.001, default: WAYFINDING_DEFAULTS.massHeightM }),
  number("massWidthM", "沿路体量长度", { unit: "m", step: 1, min: 0.001, default: WAYFINDING_DEFAULTS.massWidthM }),
  number("massDepthM", "沿路体量厚度", { unit: "m", step: 1, min: 0.001, default: WAYFINDING_DEFAULTS.massDepthM }),
  number("keypointSpacingM", "引导点最小间距", {
    unit: "m",
    step: 5,
    min: 0.001,
    default: WAYFINDING_DEFAULTS.keypointSpacingM
  }),
  number("cueSpanM", "单处引导最大范围", { unit: "m", step: 2, min: 0.001, default: WAYFINDING_DEFAULTS.cueSpanM }),
  number("spacingM", "引导点内体量间隔", { unit: "m", step: 1, min: 0.001, default: WAYFINDING_DEFAULTS.spacingM })
];
const globals: SpatialField[] = [
  {
    ...number("seed", "布局种子（Seed）", { unit: "", step: 1, min: 0, max: 4294967295 }),
    randomizeLabel: "换布局（随机 Seed）"
  },
  {
    key: "landMode",
    label: "陆域模式",
    type: "string" as const,
    default: "island",
    options: ["island", "continuous"],
    optionLabels: { island: "岛屿", continuous: "整图陆地" },
    description: "整图陆地铺满规划边界并关闭默认海洋。河流和湖泊仍独立配置。"
  },
  number("landCoverage", "主陆地占比", { unit: "%", step: 0.01, min: 0, max: 1 }),
  number("landAspect", "主岛长宽倾向", { unit: "%", step: 0.01, min: 0, max: 1 }),
  number("landOrientation", "主岛朝向", { unit: "%", step: 0.01, min: 0, max: 1 }),
  number("complexity", "海岸轮廓变化", { unit: "%", step: 0.01, min: 0, max: 1 }),
  number("offshoreCoverage", "离岸陆地占比", { unit: "%", step: 0.01, min: 0, max: 1 }),
  number("islandRichness", "离岸岛丰富度", { unit: "%", step: 0.01, min: 0, max: 1 })
].map(
  (field): SpatialField =>
    field.key === "seed" || field.key === "landMode"
      ? field
      : { ...field, hiddenWhen: { field: "landMode", values: ["continuous"] } }
);
const distributionFields = [
  number("spacingM", "POI 基准间距", {
    unit: "m",
    step: 1,
    min: 8,
    default: 210,
    description:
      "控制初始布点密度及自动补入的面积基准，参考面积为间距的平方。实际数量还受陆地形状、单点权重和最小面积影响；这不是两个锚点之间的硬性最小距离。"
  }),
  number("minAreaM2", "活跃区域最小面积", {
    unit: "㎡",
    step: 1,
    min: 0,
    default: 0,
    description: "小于此实际陆域面积的候选休眠，保留身份和作者参数；后续变化可重新激活。0 不另设面积门槛。"
  }),
  number("count", "实际 POI 数量", { unit: "个", readonly: true }),
  number("averageAreaM2", "平均管理面积", { unit: "㎡", readonly: true })
];
const network = [
  { key: "enabled", label: "生成道路", type: "boolean" as const, default: true, combine: "override" as const },
  number("widthM", "全局道路宽度", { unit: "m", step: 0.5, min: 0.001 }),
  number("bend", "全局道路弯曲", { unit: "%", step: 0.01, min: 0, max: 1 }),
  number("loopiness", "连接冗余", { unit: "%", step: 0.01, min: 0, max: 1 })
];
export const PLANNING_COMPONENTS: PlanningComponentDefinition[] = [
  {
    type: "worldTemplate",
    label: "世界风格",
    version: 1,
    tab: "world",
    inspector: false,
    fields: [
      {
        key: "id",
        label: "风格模板",
        type: "string",
        default: "",
        options: ["", ...WORLD_TEMPLATES.map((t) => t.id)],
        optionLabels: Object.fromEntries([["", "原始 Seed World"], ...WORLD_TEMPLATES.map((t) => [t.id, t.name])])
      },
      number("centerX", "主体中心 X", {
        unit: "m",
        description: "参考构图的世界坐标锚点；主体和核心地貌使用同一坐标，不随周边 Seed 漂移。"
      }),
      number("centerZ", "主体中心 Z", {
        unit: "m",
        description: "参考构图的世界坐标锚点；重设风格时从固定基础地貌求得。"
      })
    ],
    global: { id: "worldTemplate.id", centerX: "worldTemplate.centerX", centerZ: "worldTemplate.centerZ" }
  },
  SPATIAL_COMPOSITION_COMPONENT,
  {
    type: "population",
    label: "村庄规划",
    description: "按数量范围规划，实际结果取决于可用空间与布局；不强制补足，不限制手动新增建筑。",
    version: 2,
    tab: "world",
    inspectorOrder: 9,
    fields: [
      number("villageMin", "村庄数量下限", { unit: "个", min: 0, default: 1, kinds: ["world"] }),
      number("villageMax", "村庄数量上限", { unit: "个", min: 0, default: 10, kinds: ["world"] }),
      number("buildingMin", "建筑数量下限", { unit: "个", min: 0, default: 0, kinds: ["world"] }),
      number("buildingMax", "建筑数量上限", { unit: "个", min: 0, default: 20, kinds: ["world"] })
    ],
    ranges: [
      ["villageMin", "villageMax"],
      ["buildingMin", "buildingMax"]
    ],
    global: {
      villageMin: "population.villageMin",
      villageMax: "population.villageMax",
      buildingMin: "population.buildingMin",
      buildingMax: "population.buildingMax"
    }
  },
  ROCK_GENERATION_COMPONENT,
  ROCK_FORMATION_COMPONENT,
  ROCK_OBB_COMPONENT,
  PLANNING_FARMING_COMPONENT,
  ANIMAL_POPULATION_COMPONENT,
  RELIEF_COMPONENT,
  PLANT_MATERIAL_COMPONENT,
  SUBJECT_VIEW_COMPONENT,
  GRASS_APPEARANCE_COMPONENT,
  PLANNING_WEATHER_COMPONENT,
  SURFACE_PALETTE_COMPONENT,
  {
    type: "suspensionBridge",
    label: "木吊桥",
    version: 1,
    tab: "roads",
    kinds: ["bridge"],
    sparseGlobal: true,
    fields: [
      number("lengthM", "吊桥长度", { unit: "m", min: 0.001, kinds: ["bridge"], computedSource: "自动适配两岸" }),
      number("widthM", "桥面净宽", { unit: "m", min: 0.001, computedSource: "继承道路宽度" }),
      number("clearanceM", "桥底水面净空", { unit: "m", min: 0, default: SUSPENSION_BRIDGE_DEFAULTS.clearanceM }),
      number("towerHeightM", "桥头立柱高度", {
        unit: "m",
        min: 0.001,
        default: SUSPENSION_BRIDGE_DEFAULTS.towerHeightM
      }),
      number("railHeightM", "护绳高度", { unit: "m", min: 0.001, default: SUSPENSION_BRIDGE_DEFAULTS.railHeightM }),
      number("sagM", "桥面下垂", { unit: "m", min: 0, computedSource: "跨度的 2%，最多 0.5 米" })
    ],
    global: Object.fromEntries(
      ["widthM", "clearanceM", "towerHeightM", "railHeightM", "sagM"].map((key) => [key, "suspensionBridge." + key])
    ),
    local: Object.fromEntries(
      ["lengthM", "widthM", "clearanceM", "towerHeightM", "railHeightM", "sagM"].map((key) => [
        key,
        "suspensionBridge." + key
      ])
    )
  },
  {
    type: "layout",
    inspectorOrder: 10,
    label: "POI 内部布局",
    description: "按区域用途、组织、尺寸和间距生成 OBB。",
    version: 3,
    sparseGlobal: true,
    tab: "world",
    kinds: ["poi"],
    fields: [
      {
        key: "elementProfile",
        label: "区域用途",
        type: "string",
        options: Object.keys(layoutProfile.elementProfiles),
        optionLabels: Object.fromEntries(
          Object.entries(layoutProfile.elementProfiles).map(([id, profile]) => [id, profile.label])
        ),
        description: "建筑、岩体等用途独立于 POI 权重和空间组织。"
      },
      {
        key: "pattern",
        label: "空间组织",
        type: "string",
        description:
          "只改变 OBB 的空间组织；connected 支持分支展开和曲线两侧排列，courtyard 围绕中心留白。数量范围、尺寸和用途独立配置；OBB 内部内容由上层定义。",
        options: layoutRuleManifest().map((r) => r.id),
        optionLabels: Object.fromEntries(layoutRuleManifest().map((r) => [r.id, r.label]))
      },
      number("memberCount", "实际成员数量", {
        unit: "个",
        readonly: true,
        kinds: ["poi"],
        description: "数量范围、所属区域、空间组织、尺寸与间距共同决定的实际生成结果，只读。"
      }),
      number("memberMin", "成员数量下限", {
        unit: "个",
        step: 1,
        min: 0,
        default: 0,
        description: "自动布局的期望下限；空间、坡度或互斥不允许时只报告不足，不强制填充。"
      }),
      number("memberMax", "成员数量上限", {
        unit: "个",
        step: 1,
        min: 0,
        description: "自动布局接受的成员上限；未设置时由空间决定。仅影响规划生成，不限制运行时手动新增。"
      }),
      number("spacingMinM", "沿排列间距下限", {
        unit: "m",
        step: 0.1,
        hiddenWhen: { field: "pattern", values: ["region"] },
        description:
          "沿排列方向的 OBB 目标间距；曲线仅控制同侧，环形沿圆周排列。正值留空，负值允许搭接，仍遵守上层显式互斥关系。"
      }),
      number("spacingMaxM", "沿排列间距上限", {
        unit: "m",
        step: 0.1,
        hiddenWhen: { field: "pattern", values: ["region"] },
        description: "与下限共同决定相邻 OBB 的稳定随机间距，不是所有成员两两距离的上界。"
      }),
      number("widthMinM", "体量宽度下限", { unit: "m", step: 0.1, min: 0.001 }),
      number("widthMaxM", "体量宽度上限", { unit: "m", step: 0.1, min: 0.001 }),
      number("depthMinM", "体量深度下限", { unit: "m", step: 0.1, min: 0.001 }),
      number("depthMaxM", "体量深度上限", { unit: "m", step: 0.1, min: 0.001 }),
      number("heightMinM", "体量高度下限", { unit: "m", step: 0.1, min: 0.001 }),
      number("heightMaxM", "体量高度上限", { unit: "m", step: 0.1, min: 0.001 }),
      number("variationSeed", "局部随机种子", {
        integer: true,
        step: 1,
        description: "仅重采样本区域组织；不改变参数范围、POI 锚点或素材绑定。"
      }),
      number("radialVariationM", "径向错落幅度", {
        unit: "m",
        step: 1,
        min: 0,
        description: "从基础排列向外增加 0～该值的径向错落，中心留白保持。"
      }),
      number("orientationVariation", "朝向变化", {
        unit: "%",
        step: 0.01,
        min: 0,
        max: 1,
        hiddenWhen: { field: "pattern", values: ["region"] }
      }),
      number("headingDegrees", "元素朝向", {
        unit: "°",
        step: 1,
        default: 0,
        description: "元素宽轴方向；分支或围绕中心布局相对世界 X 轴，曲线布局相对当地切线，朝向变化在此基础上扰动。"
      }),
      number("maxGroundSlopeDegrees", "占地坡度上限", { unit: "°", step: 1, min: 0, max: 90 }),
      number("pathWidthM", "内部通道宽度", {
        unit: "m",
        step: 0.1,
        min: 0.001,
        description: "道路在最终体量间适配宽度，不改变体量位置或两侧净空。"
      }),
      {
        key: "roadMode",
        label: "内部道路",
        type: "string",
        options: ["none", "backbone", "members"],
        optionLabels: { none: "无", backbone: "仅骨架", members: "骨架＋成员支路" },
        description:
          "仅控制内部铺路。无：不生成内部道路；仅骨架：保留通道；骨架＋成员支路：再连接体量入口。全局接入、体量布局和表现绑定不变。"
      },
      number("openRadiusM", "中心留白半径", { unit: "m", step: 1, min: 0 }),
      {
        key: "branchShape",
        label: "连接骨架形状",
        type: "string",
        options: ["radial", "curve"],
        optionLabels: { radial: "分支展开", curve: "曲线两侧排列" }
      },
      number("curveBendM", "曲线弯曲幅度", { unit: "m", step: 1 }),
      number("curveHeadingDegrees", "曲线方向", { unit: "°", step: 1 }),
      {
        key: "curveMemberOrder",
        label: "曲线体量选位顺序",
        type: "string",
        options: ["along-street"],
        optionLabels: { "along-street": "沿街两侧依次选位" }
      },
      number("curveGapM", "曲线两侧基础净空", { unit: "m", step: 1, min: 0 }),
      number("curveLateralVariationM", "横向错落幅度", {
        unit: "m",
        step: 1,
        min: 0,
        description: "在基础净空外增加 0～两倍幅度的横向错落；0 恢复基础排列。"
      }),
      number("curveVariationScaleM", "曲线变化尺度", {
        unit: "m",
        step: 1,
        min: 0.001,
        description: "相邻弯曲极值之间的距离；局部随机种子决定形状，弯曲幅度决定偏离量。"
      })
    ],
    ranges: [
      ["memberMin", "memberMax"],
      ["spacingMinM", "spacingMaxM"],
      ["widthMinM", "widthMaxM"],
      ["depthMinM", "depthMaxM"],
      ["heightMinM", "heightMaxM"]
    ]
  },
  {
    type: "lakes",
    label: "湖泊",
    group: "水域",
    version: 1,
    tab: "world",
    sparseGlobal: true,
    fields: lakeFields,
    kinds: ["lake"],
    global: prefixPaths(
      lakeFields.filter((f) => !f.kinds || f.kinds.includes("world")),
      "lakes."
    ),
    local: prefixPaths(
      lakeFields.filter((f) => !f.kinds || f.kinds.includes("lake")),
      "lakes."
    ),
    ranges: [["countMin", "countMax"]]
  },
  {
    type: "rivers",
    label: "河流区域",
    group: "水域",
    version: 1,
    tab: "world",
    sparseGlobal: true,
    fields: riverFields,
    kinds: ["poi", "water"],
    global: prefixPaths(
      riverFields.filter((f) => !f.kinds || f.kinds.includes("world")),
      "rivers."
    ),
    local: prefixPaths(
      riverFields.filter((f) => !f.kinds || f.kinds.includes("poi") || f.kinds.includes("water")),
      "rivers."
    ),
    ranges: [
      ["countMin", "countMax"],
      ["widthMinM", "widthMaxM"],
      ["depthMinM", "depthMaxM"]
    ]
  },
  {
    type: "terrain",
    label: "地势骨架",
    group: "地势",
    version: 1,
    tab: "world",
    sparseGlobal: true,
    fields: [
      number("baseSeed", "地貌基础种子", {
        unit: "",
        step: 1,
        integer: true,
        min: 0,
        max: 4294967295,
        description:
          "可选的海岸、底层起伏及隆起位置随机源；未设置时跟随世界 Seed。风格模板固定此值，仅在作者参数范围内微调地貌。"
      }),
      number("reliefNearAmplitudeM", "FBM 近处起伏", { unit: "m", min: 0, max: 160, step: 1 }),
      number("reliefAmplitudeM", "FBM 中距离起伏", {
        unit: "m",
        min: 0,
        max: 160,
        step: 1,
        description: "距地图中心半个地图边长的约 60% 处的 FBM 振幅。未单独设置近处或远处时沿用此值。"
      }),
      number("reliefFarAmplitudeM", "FBM 远处起伏", { unit: "m", min: 0, max: 160, step: 1 }),
      number("reliefScaleM", "FBM 起伏尺度", { unit: "m", min: 32, max: 1024, step: 1 }),
      number("countMin", "隆起带数量下限", {
        description: "按地貌 Seed 在范围内确定性采样隆起带数量。",
        unit: "个",
        step: 1,
        min: 0,
        default: 2
      }),
      number("countMax", "隆起带数量上限", { unit: "个", step: 1, min: 0, default: 2 }),
      number("directionDegrees", "主方向", { unit: "°", step: 1, min: 0, default: 45 }),
      number("lengthM", "隆起带长度", { unit: "m", step: 1, min: 0.001, default: 600 }),
      number("heightM", "抬升高度", { unit: "m", step: 1, min: 0, default: 10 }),
      number("widthM", "两侧过渡宽度", { unit: "m", step: 1, min: 0.001, default: 160 }),
      { key: "surfaceBaseTextureUrl", label: "地表 Base 纹理 URL", type: "string" },
      { key: "surfaceNormalTextureUrl", label: "地表 Normal 纹理 URL", type: "string" },
      number("surfaceTileM", "地表纹理平铺尺寸", { unit: "m", step: 0.5, min: 0.25, default: 8 }),
      number("surfaceNormalScale", "地表法线强度", { unit: "倍", step: 0.05, min: 0, max: 4, default: 1 }),
      { key: "surfaceMicroNormalTextureUrl", label: "近景微法线 URL", type: "string" },
      { key: "roadSurfacePattern", label: "地表道路色块", type: "boolean", default: false }
    ],
    global: {
      surfaceBaseTextureUrl: "terrainSurface.baseTextureUrl",
      surfaceNormalTextureUrl: "terrainSurface.normalTextureUrl",
      surfaceTileM: "terrainSurface.tileMetres",
      surfaceNormalScale: "terrainSurface.normalScale",
      roadSurfacePattern: "terrainSurface.roadPattern",
      surfaceMicroNormalTextureUrl: "terrainSurface.microNormalTextureUrl",
      baseSeed: "landformSeed",
      reliefNearAmplitudeM: "reliefNearAmplitudeM",
      reliefAmplitudeM: "reliefAmplitudeM",
      reliefFarAmplitudeM: "reliefFarAmplitudeM",
      reliefScaleM: "reliefScaleM",
      countMin: "terrainSkeleton.countMin",
      countMax: "terrainSkeleton.countMax",
      directionDegrees: "terrainSkeleton.directionDegrees",
      lengthM: "terrainSkeleton.lengthM",
      heightM: "terrainSkeleton.heightM",
      widthM: "terrainSkeleton.widthM"
    },
    ranges: [["countMin", "countMax"]]
  },

  {
    type: "lighting",
    resources: PLANNING_LIGHTING_RESOURCES,
    label: "Seed 环境光照",
    version: 1,
    tab: "lighting",
    presentation: true,
    fields: [
      {
        key: "profileUrl",
        label: "日照曲线资产",
        type: "string",
        default: SEED_WORLD_LIGHTING_PROFILE_URL,
        unit: "JSONAsset URL",
        combine: "override",
        description:
          "原生日照 Profile JSONAsset 引用，包含完整日照曲线和星月参数；未覆盖的灯光值由它按时刻采样。资源加载失败时保留当前画面并报告错误。"
      },
      number("timeHours", "时刻", {
        unit: "h",
        step: 0.1,
        min: 0,
        max: 24,
        default: 12,
        description:
          "采样原生日照曲线，同时改变太阳方向、天空/云层颜色、大气与光源；时刻可按创作目标调整，不是仅调物体亮度。已明确覆盖的光源或天空参数仍优先，改变时刻不会清除这些覆盖；重置对应字段才恢复新时刻的曲线值。"
      }),
      ...PLANNING_LIGHT_SOURCE_FIELDS,
      ...PLANNING_SKY_FIELDS,
      { key: "direct", label: "太阳与月光", type: "boolean", default: true },
      { key: "environment", label: "天空环境光 IBL", type: "boolean", default: true },
      { key: "shadows", label: "实时阴影", type: "boolean", default: true },
      number("shadowStrength", "阴影强度", {
        unit: "%",
        step: 0.01,
        min: 0,
        max: 1,
        description: "显式覆盖所选日照资产的阴影强度；重置恢复资产曲线。"
      }),
      { key: "fog", label: "大气雾", type: "boolean", default: true },
      number("fogDensity", "雾密度", {
        unit: "m⁻¹",
        step: 0.00001,
        min: 0,
        description:
          "距离雾的密度系数，作用于整个世界，密度越高越快混入大气颜色；不能用加厚雾代替照明或通透感。显式覆盖所选日照资产的雾密度；重置恢复资产曲线。"
      }),
      number("fogExponent", "距离雾指数", {
        step: 0.1,
        min: Number.EPSILON,
        description: "控制雾随距离累积的曲线。提高指数可让雾集中在远景，保留近处材质的颜色。"
      })
    ]
  },
  {
    type: "postProcess",
    label: "Seed 后处理",
    version: 1,
    tab: "lighting",
    presentation: true,
    fields: [
      { key: "enabled", label: "启用后处理", type: "boolean", default: true },
      { key: "colorAdjustments", label: "调色", type: "boolean", default: true },
      { key: "tonemapping", label: "ACES 色调映射", type: "boolean", default: true },
      number("postExposure", "曝光补偿", { unit: "EV", step: 0.1, default: 0 }),
      number("temperature", "色温", {
        unit: "调整量",
        min: -100,
        max: 100,
        step: 1,
        default: POST.temperature,
        description:
          "全画面白平衡调整，0为中性；正值偏暖、负值偏冷。天空、云和所有物体一起受影响，不是对象材质颜色或开尔文。"
      }),
      number("contrast", "对比度", {
        unit: "调整量",
        min: -100,
        max: 100,
        step: 1,
        default: POST.contrast,
        description: "全画面对比调整，0为中性；不用于承诺只改变某个对象的明暗关系。"
      }),
      number("saturation", "饱和度", {
        unit: "调整量",
        min: -100,
        max: 100,
        step: 1,
        default: POST.saturation,
        description: "全画面颜色饱和度调整，0为中性；天空和全部物体一起受影响，不是某种植物的颜色倍率。"
      }),
      { key: "bloom", label: "Bloom", type: "boolean", default: true },
      number("bloomThreshold", "Bloom 阈值", { unit: "", step: 0.05, min: 0, default: POST.bloomThreshold }),
      number("bloomIntensity", "Bloom 强度", { unit: "", step: 0.05, min: 0, default: POST.bloomIntensity }),
      number("bloomScatter", "Bloom 扩散", { unit: "%", step: 0.01, min: 0, max: 1, default: POST.bloomScatter })
    ]
  },
  { type: "world", label: "世界生成", version: 1, tab: "world", fields: globals, global: localPaths(globals) },
  {
    type: "distribution",
    label: "POI 分布与区域",
    version: 1,
    tab: "world",
    fields: distributionFields,
    global: {
      spacingM: "poiLayout.spacingM",
      minAreaM2: "poiLayout.minAreaM2"
    }
  },

  {
    type: "network",
    label: "全局道路",
    version: 1,
    tab: "roads",
    fields: network.map((f) =>
      f.key === "loopiness" || f.key === "enabled"
        ? { ...f, kinds: ["world"] }
        : { ...f, label: f.key === "widthM" ? "道路宽度" : "道路弯曲" }
    ),
    kinds: ["globalRoute"],
    local: { widthM: "road.widthM", bend: "road.bend" },
    global: prefixPaths(network, "poiLayout.network.")
  },
  {
    type: "wayfinding",
    label: "道路与沿路错落",
    version: 1,
    tab: "wayfinding",
    sparseGlobal: true,
    fields: wayfindingFields,
    global: prefixPaths(wayfindingFields, "wayfinding."),
    local: prefixPaths(wayfindingFields, "wayfinding."),
    kinds: ["globalRoute"]
  },

  {
    type: "guidanceMember",
    label: "视觉引导来源",
    version: 1,
    tab: "world",
    legacy: true,
    fields: [{ key: "sourceId", label: "来源路径", type: "string" }]
  },
  {
    type: "roadWidth",
    inspectorOrder: 10,
    label: "场所道路",
    version: 1,
    tab: "roads",
    kinds: ["route"],
    fields: [
      {
        ...number("widthM", "道路宽度", { unit: "m", step: 0.1, min: 0.001 }),
        description: "道路在最终体量之间寻找连接；未找到时在诊断中报告，不否决体量布局。"
      }
    ],
    local: { widthM: "road.widthM" }
  },

  {
    type: "roadPath",
    label: "道路必经点",
    description:
      "按记录顺序经过中间点，坐标单位为米；起终点跟随真实入口。空数组或 reset 恢复自动路径。无可行路径时保留参数并报告，不移动必经点或强制移动体量，不自动创建新桥。",
    version: 1,
    tab: "roads",
    kinds: ["route", "globalRoute"],
    strict: true,
    fields: [
      {
        key: "keypoints",
        label: "中间必经点",
        type: "records",
        combine: "override",
        columns: [
          { key: "x", label: "X（米）", type: "number", default: 0 },
          { key: "z", label: "Z（米）", type: "number", default: 0 }
        ]
      }
    ],
    local: { keypoints: "road.keypoints" },
    validate: (values) => {
      if (
        values.keypoints !== undefined &&
        (!Array.isArray(values.keypoints) ||
          values.keypoints.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.z)))
      )
        throw new Error("道路必经点需要有限数值 x、z");
    }
  },

  {
    type: "flowers",
    label: "花区分布与花型出现权重",
    description:
      "控制分布场覆盖倾向、一次采样密度与花型出现比例；coverage 或 densityPerM2 为 0 时不生成种植花丛，landscape.vegetation.flowers 进一步筛选固定候选。实际数量受实体避让影响，不重试补足；尺寸可能改变边界处的避让结果。花瓣、茎叶、树冠和其它植物槽可由世界 plantMaterial 改色，草地与低草由 grassAppearance 改色。花型原色不是可编辑颜色的上限；只设置部分花型的正权重不会关闭其它花型。",
    scopePresentation: {
      world: {
        label: "花丛区域",
        description:
          "覆盖率、斑块尺度和分布偏好决定花区；区内密度定义候选采样密度，允许重建候选。自然植被的野花密度比例只筛选已有候选，实际数量不重试补足。"
      }
    },
    version: 2,
    tab: "ecology",
    sparseGlobal: true,
    fields: flowers,
    global: prefixPaths(flowers, "flowers."),
    local: prefixPaths(flowers, "flowers."),
    kinds: ["poi", "plaza", "flowerRegion"]
  },

  {
    type: "flowerInfluence",
    label: "周边花丛分布",
    version: 1,
    tab: "ecology",
    fields: flowerInfluence,
    kinds: ["route", "globalRoute", "plaza"],
    local: prefixPaths(flowerInfluence, "flowerInfluence.")
  },
  {
    type: "landscapeInfluence",
    label: "周边景观规则",
    version: 1,
    tab: "ecology",
    kinds: ["volume", "route", "globalRoute"],
    ranges: [["treeHeightMinM", "treeHeightMaxM"]],
    fieldLimits: (values) => ({
      treeHeightMinM: values.treeHeightMaxM === undefined ? {} : { max: Number(values.treeHeightMaxM) },
      treeHeightMaxM: { min: Number(values.treeHeightMinM ?? 0.001) }
    }),
    fields: [
      {
        ...number("densityMultiplier", "周边景观密度倍率", {
          unit: "倍",
          step: 0.05,
          min: 0,
          editEffect: "reveal",
          default: LANDSCAPE_INFLUENCE_DEFAULTS.densityMultiplier
        }),
        description:
          "在所属 POI 区域密度上相乘，只筛选底图中属于此环境带的候选，不改变候选位置或主体。0 关闭本环境带的自动景观。"
      },
      {
        ...number("treeHeightMinM", "周边景观高度下限", { unit: "m", step: 0.1, min: 0.001 }),
        description: "未设置时使用各所属区域的树高范围；局部设置覆盖对应端点。"
      },
      {
        ...number("treeHeightMaxM", "周边景观高度上限", { unit: "m", step: 0.1, min: 0.001 }),
        description: "未设置时使用各所属区域的树高范围；局部设置覆盖对应端点。"
      }
    ],
    local: {
      densityMultiplier: "landscapeInfluence.densityMultiplier",
      treeHeightMinM: "landscapeInfluence.treeHeightMinM",
      treeHeightMaxM: "landscapeInfluence.treeHeightMaxM"
    },
    validate: (values) => {
      if (
        values.treeHeightMinM !== undefined &&
        values.treeHeightMaxM !== undefined &&
        Number(values.treeHeightMinM) > Number(values.treeHeightMaxM)
      )
        throw new Error("周边景观高度下限不能超过上限");
    }
  },
  {
    type: "landscapePopulation",
    sparseGlobal: true,
    label: "全局景观总量",
    version: 1,
    tab: "ecology",
    fields: [
      {
        ...number("multiplier", "全局景观倍率", { unit: "倍", step: 0.05, min: 0, default: 1, editEffect: "reveal" }),
        description: "在所有区域配置之后统一相乘。设为0会关闭全部周边景观，但保留POI主体。"
      },
      {
        ...number("samplingDensityPer1000M2", "候选布点密度", {
          unit: "处/1000㎡",
          step: 1,
          min: 0.001,
          default: 1000 / 49
        }),
        description:
          "采样候选密度；增大可突破原有采样上限。仍需通过占地、坡度和环境筛选，不等于最终实例密度；此项变化会重新采样。"
      }
    ],
    global: {
      multiplier: "poiLayout.landscape.multiplier",
      samplingDensityPer1000M2: "poiLayout.landscape.samplingDensityPer1000M2"
    }
  },
  {
    type: "landscape",
    sparseGlobal: true,
    ranges: [
      ["treeHeightMinM", "treeHeightMaxM"],
      ...NATURAL_VEGETATION_SIZE_CONTROLS.map(
        (control) => [`plantSizes.${control.key}.scaleMin`, `plantSizes.${control.key}.scaleMax`] as [string, string]
      )
    ],
    label: "景观与自然植被",
    description:
      "vegetation.* 控制乔木、低草、灌木、草本、地被、野花、落叶的独立覆盖/密度，0 关闭对应层；vegetation.grass 同时关闭绿色草地表面与低草实例。plantSizes.<功能层> 为该层所有物种共用的正尺寸范围，缩小植物不会关闭生成。景观总量另由 landscapePopulation 控制，独立种植花区另由 flowers 控制。",
    scopePresentation: {
      world: {
        label: "自然植被与景观 · 全局默认",
        description: "设置各类植被密度和生长条件。单个地点的未覆盖项默认沿用这里。"
      }
    },
    version: 1,
    tab: "ecology",
    fields: [
      {
        key: "legacyPlantSizes",
        label: "旧工程物种尺寸",
        type: "records",
        hidden: true,
        kinds: ["world"],
        columns: [
          { key: "scaleMin", label: "尺度下限", type: "number" },
          { key: "scaleMax", label: "尺度上限", type: "number" }
        ]
      },
      ...landscape.map(
        (field): SpatialField => ({
          ...field,
          editEffect:
            ["density", "edgeDensity", "falloffRatio"].includes(field.key) ||
            field.key.startsWith("contexts.") ||
            field.key === "vegetation.trees"
              ? "reveal"
              : "replan",
          description:
            field.description ??
            (field.key.startsWith("treeHeight")
              ? "树高范围；冠幅按新植被物种比例同步计算，重新检查道路和建筑占地。"
              : field.key === "maxAltitudeM" || field.key === "maxSlopeDegrees"
                ? "生长筛选上限；当前区域没有越界候选时，调整不会改变数量。"
                : field.key.startsWith("contexts.")
                  ? "只影响落在该环境带内的候选；区域内没有对应道路、建筑或地貌时不会产生变化。"
                  : field.key.startsWith("vegetation.")
                    ? field.key === "vegetation.grass"
                      ? "低草层的覆盖比例，同时驱动 Terrain 草地表面和低草实例；0关闭草层并露出原生裸地，不改变花、灌木等独立植被层。全局→POI等级→局部覆盖。"
                      : "新植被分层配方的密度比例；0关闭该层。全局→POI等级→局部覆盖，保存到工程。乔木只调整周边分布，保留POI主体。"
                    : field.key === "falloffRatio"
                      ? "100% 到管理区边界衰减至最低密度；200% 衰减更缓，仅改变本区域，不影响邻居。"
                      : field.key === "density"
                        ? "全局基础→级别覆盖→离岛区域覆盖→单个POI覆盖，不逐级相乘；最终再乘全局景观倍率。只影响周边景观，不删除POI主体。"
                        : undefined)
        })
      )
    ],
    global: prefixPaths(landscape, "poiLayout.landscape."),
    local: prefixPaths(
      landscape.filter((field) => !field.key.startsWith("plantSizes.")),
      "landscape."
    ),
    kinds: ["poi", "island"],
    validate: (values) => {
      for (const row of (values.legacyPlantSizes ?? []) as { id: string; scaleMin?: number; scaleMax?: number }[]) {
        if (
          !NATURAL_VEGETATION_SIZE_CONTROLS.some((control) => control.assetIds.includes(row.id)) ||
          [row.scaleMin, row.scaleMax].some((value) => value !== undefined && !(value > 0)) ||
          Number(row.scaleMin) > Number(row.scaleMax)
        )
          throw new Error("旧工程植株尺度无效：" + row.id);
      }
      for (const control of NATURAL_VEGETATION_SIZE_CONTROLS) {
        const min = values[`plantSizes.${control.key}.scaleMin`];
        const max = values[`plantSizes.${control.key}.scaleMax`];
        if (
          (min !== undefined && !(Number(min) > 0)) ||
          (max !== undefined && !(Number(max) > 0)) ||
          Number(min) > Number(max)
        )
          throw new Error(`植株尺度须为正数且下限不超过上限：${control.label}`);
      }
      if (Number(values.treeHeightMinM) > Number(values.treeHeightMaxM))
        throw new Error("景观高度下限不能超过上限，请在同一事务调整范围");
    }
  },

  {
    type: "island",
    label: "离岛形状",
    version: 1,
    tab: "world",
    fields: [number("size", "离岛范围", { unit: "倍", step: 0.01, min: 0.001, default: 1 })],
    local: { size: "size" },
    kinds: ["island"]
  },

  {
    type: "anchor",
    inspectorOrder: 20,
    label: "POI 位置",
    version: 1,
    tab: "world",
    fields: [
      number("x", "X 位置", {
        unit: "m",
        step: 0.5,
        min: 0,
        description: "未覆盖时显示候选起点；显式设置任一坐标会固定此 POI 的位置，重置坐标覆盖后恢复自动求解。"
      }),
      number("z", "Z 位置", {
        unit: "m",
        step: 0.5,
        min: 0,
        description: "未覆盖时显示候选起点；显式设置任一坐标会固定此 POI 的位置，重置坐标覆盖后恢复自动求解。"
      })
    ],
    kinds: ["poi"]
  },
  {
    type: "regionalAppearance",
    label: "区域外观",
    version: 1,
    tab: "world",
    inspectorOrder: 31,
    kinds: ["poi"],
    global: { rockMaterial: "regionalAppearance.rockMaterial" },
    local: { rockMaterial: "regionalAppearance.rockMaterial" },
    fields: [
      {
        key: "rockMaterial",
        label: "岩石材质",
        type: "string",
        default: "yellow",
        options: ["yellow", "red"],
        optionLabels: { yellow: "黄色砂岩", red: "红色砂岩" },
        description: "POI 岩石组和周边散石共用此材质。只影响岩壁颜色；顶部沿用所在地表，地面保持独立配色。"
      }
    ]
  },
  {
    type: "poi",
    inspectorOrder: 30,
    label: "兴趣点",
    version: 1,
    tab: "world",
    kinds: ["poi"],
    local: {
      sizeWeight: "poi.sizeWeight",
      surfaceLayerId: "poi.surfaceLayerId",
      surfaceRadiusM: "poi.surfaceRadiusM",
      surfaceFeatherM: "poi.surfaceFeatherM"
    },
    fields: [
      {
        key: "surfaceLayerId",
        label: "地表材质",
        type: "string",
        options: ["", "sand-fine", "sand-large", "sand-rubble", "sand-dry"],
        optionLabels: {
          "": "自动",
          "sand-fine": "细沙",
          "sand-large": "粗沙",
          "sand-rubble": "碎石沙地",
          "sand-dry": "干土地面"
        },
        description: "选择当前地表纹理调色板中的层。无调色板的主题不使用此参数。"
      },
      number("surfaceRadiusM", "材质核心半径", { unit: "m", min: 0, step: 1, default: 35 }),
      number("surfaceFeatherM", "材质过渡宽度", { unit: "m", min: 1, step: 1, default: 24 }),

      {
        key: "active",
        label: "当前活跃",
        type: "boolean",
        readonly: true,
        description: "是否拥有有效管理区域；休眠候选仍保留稳定身份和作者参数，可通过后续编辑恢复。"
      },
      number("sizeWeight", "区域大小权重", {
        min: 0.001,
        step: 0.05,
        default: 1,
        description:
          "仅调整此 POI 的管理区大小偏好：1 使用统一默认，增大向外扩张、减小收缩；不是面积或建筑尺寸倍数，会重新求解锚点和轮廓。邻接区域会让出或获得空间，允许管理区缩至零面积；POI 身份和作者参数保留，可再次调整权重恢复区域。只预览分区时不重建世界，提交后更新依赖布局。"
      }),
      number("actualAreaM2", "实际管理面积", {
        unit: "㎡",
        readonly: true,
        description: "当前已接受分区与陆域相交后的面积；由权重和邻居共同决定，不是建筑占地面积。"
      })
    ]
  },
  {
    type: "solid",
    inspectorOrder: 10,
    label: "空间体量",
    description:
      "直接修改单体的位置、宽深高和水平朝向，允许重叠及移出原生成区域，不执行生成时的坡度、净空或避让求解，不自动移动邻居。建筑墙段与门窗使用建筑编辑能力。",
    kinds: ["volume", "landscapeElement"],
    version: 1,
    tab: "world",
    fields: [
      number("x", "X", { unit: "m", step: 0.5, default: 512, editEffect: "instance" }),
      number("z", "Z", { unit: "m", step: 0.5, default: 512, editEffect: "instance" }),
      number("width", "宽度", { unit: "m", step: 0.5, min: 0.001, default: 8, editEffect: "instance" }),
      number("depth", "深度", { unit: "m", step: 0.5, min: 0.001, default: 8, editEffect: "instance" }),
      number("height", "高度", { unit: "m", step: 0.5, min: 0.001, default: 8, editEffect: "instance" }),
      number("yawDegrees", "朝向", { unit: "°", step: 1, default: 0, editEffect: "instance" }),
      {
        ...number("maxGroundSlopeDegrees", "占地坡度上限", { unit: "°", step: 1, min: 0, max: 90, hidden: true }),
        kinds: ["volume"]
      }
    ]
  },
  {
    type: "appearance",
    legacy: true,
    label: "空间元素种类",
    version: 1,
    tab: "world",
    fields: [{ key: "kind", label: "种类", type: "string", options: ["rock", "tree"], default: "rock" }]
  },
  {
    type: "suppressed",
    legacy: true,
    label: "生成排除",
    version: 1,
    tab: "world",
    fields: [{ key: "value", label: "排除生成", type: "boolean", default: true }]
  }
];
export const planningRegistry = new ComponentRegistry();
/** Conservative default for planning extensions; reveal requires an explicit field contract. */
function declarePlanningEditEffects(definition: PlanningComponentDefinition): void {
  if (definition.presentation || definition.type === "solid") return;
  for (const field of definition.fields) field.editEffect ??= "replan";
}
const layoutDefaultsDefinition = PLANNING_COMPONENTS.find((definition) => definition.type === "layout")!;
layoutDefaultsDefinition.global = Object.fromEntries(
  layoutDefaultsDefinition.fields
    .filter((field) => !field.readonly)
    .map((field) => [field.key, "poiLayout.layoutDefaults." + field.key])
);

for (const definition of PLANNING_COMPONENTS) {
  declarePlanningEditEffects(definition);
  planningRegistry.register(definition);
}
/** Presentation is dispatched separately; unknown planning fields conservatively rebuild. */
export function planningFieldEditEffect(component: string, key: string): "reveal" | "replan" | "instance" {
  return planningRegistry.get(component).fields.find((field) => field.key === key)?.editEffect ?? "replan";
}
/** Register a component and its serialization bindings before mounting the editor or worker. */
export function registerPlanningComponent(definition: PlanningComponentDefinition): () => void {
  declarePlanningEditEffects(definition);
  planningRegistry.register(definition);
  PLANNING_COMPONENTS.push(definition);
  return () => {
    planningRegistry.unregister(definition);
    const i = PLANNING_COMPONENTS.indexOf(definition);
    if (i >= 0) PLANNING_COMPONENTS.splice(i, 1);
  };
}

/** Refresh plugin choices before capability discovery or inspection. No renderer names enter the rule registry. */
export function refreshLayoutRuleChoices(): void {
  const field = planningRegistry.get("layout").fields.find((f) => f.key === "pattern")!;
  const rules = layoutRuleManifest();
  field.options = rules.map((r) => r.id);
  field.optionLabels = Object.fromEntries(rules.map((r) => [r.id, r.label]));
  for (const key of [
    "headingDegrees",
    "pathWidthM",
    "roadMode",
    "openRadiusM",
    "branchShape",
    "curveBendM",
    "curveHeadingDegrees",
    "curveMemberOrder",
    "curveGapM",
    "curveLateralVariationM",
    "curveVariationScaleM",
    "radialVariationM"
  ]) {
    const parameter = planningRegistry.get("layout").fields.find((f) => f.key === key)!;
    if (key === "radialVariationM")
      parameter.hiddenWhen = {
        field: "pattern",
        values: ["connected"],
        and: [{ field: "branchShape", values: ["curve"] }]
      };
    parameter.visibleWhen = {
      field: "pattern",
      values: rules.filter((r) => r.parameterKeys?.includes(key)).map((r) => r.id),
      ...(key.startsWith("curve")
        ? { and: [{ field: "branchShape", values: ["curve"] }] }
        : key === "pathWidthM"
          ? { and: [{ field: "roadMode", values: ["backbone", "members"] }] }
          : {})
    };
  }
}
