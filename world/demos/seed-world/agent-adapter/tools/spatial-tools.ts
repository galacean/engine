import * as z from "zod";

import type { AgentTool } from "@galacean/engine-ai-chat/ai-chat/index";
import type { SeedWorldAgentApplication } from "../SeedWorldAgentApplication.ts";
import { defineSeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";
import { defineSeedWorldTool } from "./define-seed-world-tool.ts";
import { VIEWER_ANCHOR_DESCRIPTION, spatialTargetSchema } from "./spatial-tool-input.ts";
import {
  assetDomainSchema,
  assetKindSchema,
  assetSourceSchema,
  mutationControlShape,
  teleportOutputSchema,
  worldPositionSchema,
  worldRefSchema
} from "./tool-contract.ts";

const filterSchema = z.strictObject({
  field: z.string().trim().min(1).max(120).describe("WorldAsset 公共字段或 properties 中已声明的语义属性名"),
  operator: z.enum(["eq", "in", "gt", "lt", "contains"])
    .describe("属性比较方式：eq 相等、in 属于 value 数组、gt/lt 数值比较、contains 检查字符串或数组包含"),
  value: z.json().describe("比较值；in 必须使用数组，gt/lt 必须使用数值，其余操作保持与字段类型一致")
}).describe("对精确 WorldAsset 属性执行的查询过滤条件");

export const selectorSpatialSchema = z.strictObject({
  anchor: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("viewer").describe(VIEWER_ANCHOR_DESCRIPTION) }),
    z.strictObject({
      kind: z.literal("world-ref").describe("使用一个世界资产作为查询锚点"),
      ref: worldRefSchema.describe("vegetation.query、terrain.query 或修改 API 返回的稳定资产引用")
    }),
    z.strictObject({
      kind: z.literal("position").describe("使用明确世界坐标作为查询锚点"),
      x: z.number().describe("世界 x 坐标，单位为米"),
      y: z.number().optional().describe("世界 y 坐标，单位为米；当前水平关系查询可省略"),
      z: z.number().describe("世界 z 坐标，单位为米")
    })
  ]).describe("空间过滤所参照的玩家、资产或明确坐标"),
  relation: z.enum(["at", "near", "in-front-of", "behind", "left", "right", "inside", "around"])
    .describe("候选资产与锚点必须满足的空间关系；inside 仅适用于有边界的资产锚点，并要求候选水平占地边界完全包含于锚点水平占地边界"),
  minDistanceMetres: z.number().nonnegative().optional().describe("候选代表位置到锚点的最小水平距离，单位为米；省略时不设下限"),
  maxDistanceMetres: z.number().positive().optional().describe("候选代表位置到锚点的最大水平距离，单位为米；at 省略时默认为 1 米，其余关系省略时不设上限"),
  maxViewAngleDegrees: z.number().min(1).max(180).optional().describe("in-front-of 相对锚点朝向的最大夹角，单位为度；省略时为 45 度")
}).describe("Selector 使用的空间过滤条件");

const baseSelectorShape = {
  ids: z.array(z.string().trim().min(1).max(240)).min(1).max(64).optional()
    .describe("要精确匹配的稳定 WorldAsset id；创建后验证、检查是否删除等身份查询直接使用此字段"),
  domains: z.array(assetDomainSchema).min(1).max(6).optional().describe("要匹配的持久资产领域"),
  kinds: z.array(assetKindSchema).min(1).max(20).optional().describe("要匹配的世界资产语义种类"),
  sources: z.array(assetSourceSchema).min(1).max(2).optional()
    .describe("按资产来源匹配：natural 为自然生成，authored 为玩家创建"),
  filters: z.array(filterSchema).max(16).optional().describe("精确语义属性过滤"),
  spatial: selectorSpatialSchema.optional().describe("相对玩家、资产或坐标的空间过滤"),
  sort: z.enum(["nearest", "farthest", "largest", "highest", "lowest"]).optional()
    .describe("结果排序方式；省略时按稳定资产 id 排序")
};

const relatedSelectorSchema = z.strictObject(baseSelectorShape).superRefine(validateFilterScope);
const selectorShape = {
  ...baseSelectorShape,
  relatedTo: z
    .array(
      z.strictObject({
        selector: relatedSelectorSchema.describe("用于寻找关联资产的嵌套选择条件"),
        relation: z.enum(["near", "inside", "intersects", "connected-to"])
          .describe("当前候选和关联资产的关系：inside 要求候选水平占地边界完全包含于关联资产，intersects 只要求水平占地边界相交"),
        maxDistanceMetres: z.number().positive().optional().describe("near 关系的最大水平距离，单位为米；省略时为 5 米，其他关系忽略")
      })
    )
    .max(8)
    .optional()
    .describe("按父子、相交、邻近或连接关系继续筛选")
};

const hasSelectorCriteria = (value: Record<string, unknown>) =>
  value.ids !== undefined ||
  value.domains !== undefined ||
  value.kinds !== undefined ||
  value.sources !== undefined ||
  value.filters !== undefined ||
  value.spatial !== undefined ||
  value.relatedTo !== undefined ||
  value.sort !== undefined;

export const worldSelectorSchema = z
  .strictObject(selectorShape)
  .refine(
    hasSelectorCriteria,
    { message: "Selector 至少需要 id、领域、kind、来源、过滤、空间关系、关联关系或排序之一" }
  )
  .superRefine(validateFilterScope);

export function createDomainSelectorSchema<const Kind extends string>(
  kindSchema: z.ZodEnum<Record<Kind, Kind>>,
  label: string
) {
  const shape = {
    ids: baseSelectorShape.ids,
    kinds: z.array(kindSchema).min(1).max(20).optional().describe(`要匹配的${label}资产语义种类；省略时匹配本系统全部种类`),
    sources: baseSelectorShape.sources,
    filters: baseSelectorShape.filters,
    spatial: baseSelectorShape.spatial,
    sort: baseSelectorShape.sort,
    relatedTo: selectorShape.relatedTo
  };
  return {
    queryInput: z.strictObject({
      ...shape,
      offset: z.number().int().nonnegative().optional()
        .describe("当前页从完整排序结果的第几个资产开始；首轮省略或传 0，后续直接传上页 nextOffset"),
      limit: z.number().int().min(1).max(256).optional()
        .describe("本页 items 上限，不影响 matchedCount；省略时为 16；需要遍历全部结果时持续请求 nextOffset")
    }),
    deleteSelector: z
      .strictObject(shape)
      .refine(
        (value) =>
          value.ids !== undefined ||
          value.kinds !== undefined ||
          value.sources !== undefined ||
          value.filters !== undefined ||
          value.spatial !== undefined ||
          value.relatedTo !== undefined ||
          value.sort !== undefined,
        { message: `${label}删除 selector 至少需要 ids、kinds、sources、filters、spatial、relatedTo 或 sort 之一` }
      )
  };
}

export function createDomainDeleteInputSchema<const Kind extends string, SelectorSchema extends z.ZodType>(
  kindSchema: z.ZodEnum<Record<Kind, Kind>>,
  deleteSelector: SelectorSchema,
  label: string
) {
  const domainRef = z
    .strictObject({ ...worldRefSchema.shape, kind: kindSchema })
    .describe(`要精确删除的${label}稳定资产引用`);
  return z
    .union([
      z.strictObject({
        refs: z.array(domainRef).min(1).max(64).describe(`要精确删除的 1 到 64 个${label}稳定资产引用`),
        ...mutationControlShape
      }),
      z.strictObject({
        selector: deleteSelector.describe(`要穷尽删除的${label}资产选择条件；批量删除不使用查询分页 limit`),
        ...mutationControlShape
      })
    ])
    .describe(`使用 refs 精确删除${label}，或用 selector 批量选择并删除`);
}

function validateFilterScope(
  value: { filters?: readonly unknown[]; domains?: readonly unknown[]; kinds?: readonly unknown[] },
  context: z.core.$RefinementCtx
): void {
  if ((value.filters?.length ?? 0) > 0 && (value.domains?.length ?? 0) === 0 && (value.kinds?.length ?? 0) === 0) {
    context.addIssue({
      code: "custom",
      path: ["filters"],
      message: "按领域属性过滤时必须同时提供 domains 或 kinds，以确定字段所属的具体资产类型"
    });
  }
}

export const navigationTeleportInputSchema = z.strictObject({
  target: spatialTargetSchema.describe("玩家要到达的空间目标；这是唯一允许修改玩家 Pose 的 API"),
  heightOffset: z.number().min(0.5).max(100).describe("相对导航表面的相机或眼睛高度，单位为米")
});

export const spatialSearchInputSchema = z.strictObject({
  constraints: z.strictObject({
    minimumElevationMetres: z.number().optional().describe("可见表面的最低世界海拔，单位为米；省略时不设下限"),
    maximumElevationMetres: z.number().optional().describe("可见表面的最高世界海拔，单位为米；省略时不设上限"),
    minimumSlopeDegrees: z.number().nonnegative().optional().describe("地表最小坡度，单位为度；省略时不设下限"),
    maximumSlopeDegrees: z.number().nonnegative().optional().describe("地表最大坡度，单位为度；省略时不设上限"),
    minimumMoisture: z.number().optional().describe("地表最小湿度值；省略时不设下限"),
    maximumMoisture: z.number().optional().describe("地表最大湿度值；省略时不设上限"),
    water: z.boolean().optional().describe(
      "true 只搜索水面，false 只搜索陆地地形；省略时两者都可返回。验证地形高度变化时必须使用 false，水域位置的 elevationMetres 是水面而不是水底。"
    ),
    maximumRiverDistanceMetres: z.number().nonnegative().optional().describe("到内陆水体（河道、湖泊、池塘）的最大水平距离，单位为米；不包含海洋；省略时不限制"),
    maximumRoadDistanceMetres: z.number().nonnegative().optional().describe("到最近道路的最大水平距离，单位为米；省略时不限制")
  }).optional().describe("基于当前实时地表状态的约束"),
  nearestTo: z.strictObject({
    x: z.number().describe("参照点世界 x 坐标，单位为米"),
    z: z.number().describe("参照点世界 z 坐标，单位为米")
  }).optional().describe("nearest 排序的参照位置；省略时使用 viewer 锚点（活动输入提交时的位置；无活动输入时使用实时位置）"),
  sort: z.enum(["highest", "lowest", "flattest", "steepest", "wettest", "driest", "nearest"])
    .describe("位置候选排序目标"),
  limit: z.number().int().min(1).max(32).default(1).describe("最多返回的位置数量"),
  spacingMetres: z.number().min(0.25).max(100).default(2).describe("候选采样之间的最小水平间距，单位为米")
}).describe("实时搜索满足约束的位置；结果不是资产且没有 Ref");

export type SpatialConstraints = z.infer<typeof spatialSearchInputSchema>["constraints"];

export const spatialCheckInputSchema = z.strictObject({
  positions: z.array(z.strictObject({ x: z.number(), z: z.number() })).min(1).max(32)
    .describe("精确检查的世界坐标，最多 32 个；不会寻找或替换成附近位置。"),
  constraints: spatialSearchInputSchema.shape.constraints
});

export const locationCandidateSchema = z.strictObject({
  position: worldPositionSchema,
  surface: z.strictObject({
    elevationMetres: z.number().describe(
      "当前可见表面高度：water=true 时是水面高度，water=false 时是地形高度；不是水下河床或湖底高度。"
    ),
    slopeDegrees: z.number().nonnegative().describe("采样点地形坡度，单位为度；不是水面倾角。"),
    moisture: z.number().describe("世界地表湿度场的归一化值（0 到 1），不是农田土壤含水量，也不能据此判断脚下是否有水。"),
    water: z.boolean().describe("此采样点是否被水面覆盖；只描述该点，不表示周边没有水体。"),
    riverDistanceMetres: z.number().nonnegative().describe("兼容字段：此点到内陆水体（河道、湖泊、池塘）的水平距离，单位为米；不包含海洋，不能解释为最近水面距离。"),
    riverDistanceScope: z.literal("inland-water-excluding-ocean").describe("riverDistanceMetres 的实际测量范围；名称为兼容旧调用保留。"),
    nearestWaterDistanceMetres: z.null().describe("未计算到最近全部水体（含海洋、河流、湖泊、池塘）的距离，固定返回 null 表示未知；不是没有水或距离无限，不能用 riverDistanceMetres 代替。"),
    roadDistanceMetres: z.number().nonnegative().describe("此点到最近道路的距离，单位为米。")
  })
});

export const spatialSearchOutputSchema = z.strictObject({
  coverage: z.literal("finite-grid").describe("items 是本次完整有限网格中的排序候选；不是连续地表的精确极值或互相独立山峰。"),
  requestedCountSatisfied: z.boolean().describe("已找到请求数量的候选；若用户未另加约束，无需继续更密的全图扫描。"),
  status: z.enum(["matched", "no_match"]).describe("本次有限采样是否找到候选；no_match 不证明连续空间处处无解。"),
  effectiveSpacingMetres: z.number().positive().optional().describe("实际搜索网格间距；不是指定坐标检查。"),
  matchedCount: z.number().int().nonnegative(),
  items: z.array(locationCandidateSchema)
});

export const spatialCheckContract = defineSeedWorldApiContract({
  name: "spatial.check", effect: "read", domain: "spatial",
  description: "一次检查指定坐标的地形条件，逐点返回符合/不符合和原因，不搜索或重选位置。",
  inputDescription: "最多 32 个坐标及用户明确要求的地形条件；只检查这些点，不代表完整建筑占地或几何碰撞。",
  outputDescription: "每个点含 matches、failedConstraints 和 surface。outside_world 表示超出已发布地形范围。条件已判定后停止检查，不自行追加条件反复试探。",
  input: spatialCheckInputSchema,
  output: z.strictObject({
    items: z.array(z.strictObject({
      position: z.strictObject({ x: z.number(), z: z.number() }),
      matches: z.boolean(),
      failedConstraints: z.array(z.string()),
      surface: locationCandidateSchema.shape.surface.nullable()
    }))
  })
});

export const spatialResolveContract = defineSeedWorldApiContract({
  name: "spatial.resolve", effect: "read", domain: "spatial",
  description: "将相对空间描述解析成可直接传给其他 API 的确定 Target。",
  inputDescription: "包含锚点、关系和放置规则的 Target。",
  outputDescription: "可直接作为后续地景或导航 API target 参数的 Target；不要再包裹、拆解或改写。",
  input: spatialTargetSchema, output: spatialTargetSchema
});

export const spatialViewerContract = defineSeedWorldApiContract({
  name: "spatial.viewer", effect: "read", domain: "spatial",
  description: "读取已发布的实时玩家相机位置和朝向，不移动玩家，不使用 viewer 指令参照快照。",
  inputDescription: "无参数。传送后验证实际位置，应在传送 execute 提交完成后的下一次 execute 调用。",
  outputDescription: "source=published；回答当前位置和朝向可直接使用 position、headingDegrees、pitchDegrees 和 nearestHorizontalAxis。position 是眼睛的绝对世界坐标，Y 不是离地眼高；本接口不测量脚下海拔、离地高度或地理区位，不能据此推断这些信息。不会返回未提交草稿中的目标位置；需要检查脚下地表时另读 spatial.check 声明。",
  inputMode: "optional", input: z.strictObject({}),
  output: z.strictObject({
    source: z.literal("published"),
    mode: z.enum(["roam", "orbit"]),
    position: z.tuple([z.number(), z.number(), z.number()]).describe("实时相机眼睛的绝对世界坐标 [x,y,z]，单位为米。Y 是相对世界原点的高度，不是相机离地眼高，也不是脚下地面海拔；坐标本身不提供东南西北地理区位。"),
    forward: z.tuple([z.number(), z.number(), z.number()]).describe("实时相机朝向向量。"),
    headingDegrees: z.number().min(0).lt(360).nullable().describe("由同一 forward 换算的水平航向角：[0,360)，0=-Z、90=+X、180=+Z、270=-X。水平分量长度≤1e-8 时为 null，方向未定义。"),
    pitchDegrees: z.number().min(-90).max(90).nullable().describe("由同一 forward 换算的俯仰角：正数朝上、负数朝下、0 水平；向量长度≤1e-8 时为 null。"),
    nearestHorizontalAxis: z.enum(["+X", "-X", "+Z", "-Z"]).nullable().describe("当前水平朝向最接近的世界轴向，供文字说明方向；不是精确朝向或地图方位名称。X/Z 分量绝对值相等时取 X；水平分量长度≤1e-8 时为 null。")
  })
});

export const navigationTeleportContract = defineSeedWorldApiContract({
  name: "spatial.teleport", domain: "spatial",
  description: "将玩家传送到目标位置；这是唯一会修改玩家 Pose 的 API。",
  inputDescription: "空间目标和 0.5 到 100 米的相机高度偏移。",
  outputDescription: "草稿中预期的相机位置及附加状态；实际传送在 execute 提交后执行。",
  input: navigationTeleportInputSchema, output: teleportOutputSchema
});

export const spatialSearchContract = defineSeedWorldApiContract({
  name: "spatial.search", effect: "read", domain: "spatial",
  description: "在有限网格中搜索满足用户条件的位置；检查指定坐标使用 spatial.check，不能用 nearest 搜索替代逐点检测。",
  inputDescription: "地表约束、排序、数量和采样间距。",
  outputDescription: "matched 表示找到候选，no_match 表示本次有限采样无匹配。读取结果后结束该次搜索；不要自行增加坡度、避水或其他要求重新搜索。候选不是资产，也不构成建筑放置许可。",
  input: spatialSearchInputSchema, output: spatialSearchOutputSchema
});

export const SEED_WORLD_SPATIAL_CONTRACTS = Object.freeze([
  spatialSearchContract,
  spatialCheckContract,
  spatialResolveContract,
  spatialViewerContract,
  navigationTeleportContract
]);

export function createSeedWorldSpatialTools(application: SeedWorldAgentApplication): readonly AgentTool[] {
  return [
    defineSeedWorldTool(spatialSearchContract, {
      execute: (input) => application.searchSpatial(input)
    }),
    defineSeedWorldTool(spatialCheckContract, {
      execute: (input) => application.checkSpatial(input)
    }),
    defineSeedWorldTool(spatialResolveContract, {
      execute: (target) => application.resolveSpatialTarget(target)
    }),
    defineSeedWorldTool(spatialViewerContract, {
      execute: () => application.readViewer()
    }),
    defineSeedWorldTool(navigationTeleportContract, {
      execute: (input) => application.teleport(input)
    })
  ];
}
