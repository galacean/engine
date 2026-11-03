import * as z from "zod";
import { skyColorRgbSchema } from "../contracts/SeedWorldSkyColorContract.ts";
import {
  aquaticGrassBedAssetPropertiesSchema,
  basinAssetPropertiesSchema,
  bridgeAssetPropertiesSchema,
  buildingAssetPropertiesSchema,
  canyonAssetPropertiesSchema,
  flowerFieldAssetPropertiesSchema,
  forestAssetPropertiesSchema,
  grasslandAssetPropertiesSchema,
  hillAssetPropertiesSchema,
  lakeAssetPropertiesSchema,
  mountainAssetPropertiesSchema,
  mushroomAssetPropertiesSchema,
  oceanAssetPropertiesSchema,
  plateauAssetPropertiesSchema,
  poiAssetPropertiesSchema,
  pondAssetPropertiesSchema,
  ridgeAssetPropertiesSchema,
  riverAssetPropertiesSchema,
  roadAssetPropertiesSchema,
  rockAssetPropertiesSchema,
  shrubAssetPropertiesSchema,
  shrublandAssetPropertiesSchema,
  slopeAssetPropertiesSchema,
  streamAssetPropertiesSchema,
  treeAssetPropertiesSchema,
  valleyAssetPropertiesSchema,
  SEED_WORLD_ASSET_KINDS,
  SEED_WORLD_ASSET_TYPE_CATALOG,
  type SeedWorldAssetKind
} from "@galacean/engine-world-planning/agent-adapter/contracts/SeedWorldAssetContracts";

export const emptyToolInputSchema = z.strictObject({}).describe("该 Tool 不接受参数");
export const jsonObjectSchema = z.record(z.string(), z.json()).describe("JSON object");
export const worldPositionTupleSchema = z.tuple([z.number(), z.number(), z.number()])
  .describe("世界坐标或方向向量，依次表示 x、y、z");
export const worldPositionSchema = z.strictObject({
  x: z.number().describe("世界 x 坐标"),
  y: z.number().describe("世界 y 坐标"),
  z: z.number().describe("世界 z 坐标")
}).describe("命名字段形式的世界坐标");
export const worldBoundsSchema = z.strictObject({
  minimum: worldPositionTupleSchema.describe("轴对齐包围盒的最小世界坐标"),
  maximum: worldPositionTupleSchema.describe("轴对齐包围盒的最大世界坐标")
}).describe("轴对齐世界包围盒");

export const assetDomainSchema = z.enum([
  "terrain",
  "water",
  "vegetation",
  "object",
  "infrastructure",
  "poi"
]).describe("持久世界资产的语义分类，用于查询、身份识别和领域路由");
export const assetSourceSchema = z.enum(["natural", "authored"])
  .describe("资产来源：natural 表示世界自然生成，authored 表示玩家创建");
export const assetKindSchema = z.enum(
  SEED_WORLD_ASSET_KINDS as [SeedWorldAssetKind, ...SeedWorldAssetKind[]]
).describe("持久世界资产的语义种类；白桦等具体品种仍使用 tree，树林使用 forest");
export const worldRefSchema = z.strictObject({
  id: z.string().trim().min(1).max(240).describe("世界资产的稳定唯一标识；只能复用 API 返回值"),
  domain: assetDomainSchema.describe("资产所属语义领域"),
  kind: assetKindSchema.describe("资产语义种类，取值来自 WorldAssetCatalog"),
  source: assetSourceSchema
}).describe(
  "LLM 可复用的稳定世界资产引用；身份只由 id、domain、kind、source 组成，运行时版本不属于 Ref"
);

function domainRefSchema<const Domain extends z.output<typeof assetDomainSchema>>(domain: Domain) {
  return z.intersection(
    worldRefSchema,
    z.object({ domain: z.literal(domain) })
  ).describe(`${domain} 领域的稳定资产引用。`);
}

export const terrainRefSchema = domainRefSchema("terrain");
export const waterRefSchema = domainRefSchema("water");
export const vegetationRefSchema = domainRefSchema("vegetation");
export const objectRefSchema = domainRefSchema("object");
export const infrastructureRefSchema = domainRefSchema("infrastructure");
export const poiRefSchema = domainRefSchema("poi");

export const mutationControlShape = {
  executionMode: z.enum(["apply", "preview"]).optional().describe("默认 apply；preview 只返回影响估算"),
  impactBudget: z
    .strictObject({
      maxAreaSquareMetres: z.number().positive().optional().describe("允许影响的最大水平面积，单位为平方米"),
      maxObjectCount: z.number().int().positive().optional().describe("允许创建、更新或删除的最大公共资产或对象数量"),
      maxTerrainDeltaMetres: z.number().positive().optional().describe("允许地形发生的最大绝对高度变化，单位为米")
    })
    .optional()
    .describe("可选影响上限；任一估算超过上限时修改不执行，省略时不额外限制")
};

const authoringResultSummaryShape = {
  matchedCount: z.number().int().nonnegative().describe("本次编辑匹配到的公共世界资产数量"),
  createdCount: z.number().int().nonnegative().describe("新建的公共世界资产数量；不是内部实例数量"),
  updatedCount: z.number().int().nonnegative().describe("更新的公共世界资产数量"),
  deletedCount: z.number().int().nonnegative().describe("删除的公共世界资产数量"),
  skippedCount: z.number().int().nonnegative().describe("因约束或无变化而跳过的资产数量"),
  createdRefs: z.array(worldRefSchema).describe("新建资产的有界稳定引用摘要"),
  updatedRefs: z.array(worldRefSchema).describe("更新资产的有界稳定引用摘要"),
  deletedRefs: z.array(worldRefSchema).describe(
    "已删除资产的有界身份摘要；这些 Ref 已是 tombstone，不能再检查或作为空间锚点。验证删除应把这些 Ref 的 id 传给 WorldSelector.ids"
  ),
  refsTruncated: z.boolean().describe("引用数组是否因有界返回而被截断；计数始终是完整值"),
  affectedBounds: worldBoundsSchema.nullable().describe("本次编辑影响的世界范围；没有可定义范围时为 null"),
  warnings: z.array(z.string()).describe("不阻止成功但需要关注的提示"),
  resolvedEffect: jsonObjectSchema.nullable().describe("引擎实际采用的语义参数或效果摘要；没有时为 null")
};

export const appliedAuthoringResultSchema = z.strictObject({
  status: z.literal("applied").describe("修改已应用到本次 execute 草稿；以 execute.receipt 判断是否提交"),
  transactionId: z.string().trim().min(1).describe("本次操作的事务标识；整次编辑的撤销使用 execute.receipt.transactionId"),
  reason: z.null().describe("已应用修改没有未变更原因"),
  ...authoringResultSummaryShape
});
export const previewAuthoringResultSchema = z.strictObject({
  status: z.literal("preview").describe("只返回影响估算，世界没有被修改"),
  transactionId: z.null().describe("preview 没有已提交事务"),
  reason: z.null().describe("preview 没有未变更原因"),
  ...authoringResultSummaryShape
});
export const unchangedAuthoringResultSchema = z.strictObject({
  status: z.literal("unchanged").describe("调用成功完成，但没有匹配到需要修改的内容"),
  transactionId: z.null().describe("没有修改时不存在事务"),
  reason: z.string().trim().min(1).describe("没有修改的明确原因"),
  ...authoringResultSummaryShape
});
export const authoringResultSchema = z.discriminatedUnion("status", [
  appliedAuthoringResultSchema,
  previewAuthoringResultSchema,
  unchangedAuthoringResultSchema
]).describe(
  "世界编辑成功结果。Tool 执行失败不会作为本类型返回，而会通过结构化 Tool Error 交给 Agent。"
);

export const appliedAssetMutationResultSchema = appliedAuthoringResultSchema.extend({
  assetRef: worldRefSchema.describe("本次 create/update 返回的稳定引用；后续 inspect、update 或 delete 直接复用")
});
export const previewAssetMutationResultSchema = previewAuthoringResultSchema.extend({
  assetRef: z.null().describe("preview 没有已创建或更新的资产引用")
});
export const assetMutationResultSchema = z.discriminatedUnion("status", [
  appliedAssetMutationResultSchema,
  previewAssetMutationResultSchema
]).describe(
  "创建或更新一个持久资产的成功结果；失败通过结构化 Tool Error 返回，不存在 ok/error 字段。"
);

export const assetRelationsSchema = z.strictObject({
  parent: worldRefSchema.optional().describe("拥有或包含该资产的父资产"),
  connectedTo: z.array(worldRefSchema).optional().describe("与该资产直接相连的其他资产")
});
const worldAssetBaseShape = {
  type: assetKindSchema.describe("资产的公开类型判别字段；与 ref.kind 完全一致"),
  ref: worldRefSchema.describe("资产稳定引用"),
  position: worldPositionTupleSchema.optional().describe("资产代表位置"),
  bounds: worldBoundsSchema.optional().describe("资产占据的世界范围"),
  tags: z.array(z.string()).optional().describe("玩家为该资产添加的语义标签"),
  relations: assetRelationsSchema.optional()
};

function requireMatchingAssetIdentity(
  asset: Readonly<{ type: SeedWorldAssetKind; ref: Readonly<{ kind: SeedWorldAssetKind; domain: z.output<typeof assetDomainSchema> }> }>,
  context: z.RefinementCtx
): void {
  if (asset.type !== asset.ref.kind) context.addIssue({
    code: "custom",
    path: ["type"],
    message: "Asset.type 必须与 Asset.ref.kind 完全一致"
  });
  if (asset.ref.domain !== SEED_WORLD_ASSET_TYPE_CATALOG[asset.type].domain) context.addIssue({
    code: "custom",
    path: ["ref", "domain"],
    message: "Asset.ref.domain 必须与资产类型目录一致"
  });
}

export const worldAssetSchema = z.strictObject(worldAssetBaseShape)
  .superRefine(requireMatchingAssetIdentity)
  .describe("所有持久世界资产共享的公共查询字段；不包含具体资产 properties");

export const queriedWorldAssetSchema = z.strictObject({
  ...worldAssetBaseShape,
  distanceMetres: z.number().optional().describe("资产到本次查询锚点的距离；它是查询上下文，不属于资产本身")
})
  .superRefine(requireMatchingAssetIdentity)
  .describe("world.query 返回的公共 Asset 投影，以及可选的查询距离");

function concreteAssetRefSchema(
  domain: z.output<typeof assetDomainSchema>,
  kind: string
) {
  return z.intersection(
    worldRefSchema,
    z.object({ domain: z.literal(domain), kind: z.literal(kind) })
  );
}

function concreteAssetSchema(
  domain: z.output<typeof assetDomainSchema>,
  kind: string,
  properties: z.ZodObject,
  description: string
) {
  const { assetKind: _internalAssetKind, ...publicPropertiesShape } = properties.shape;
  return z.strictObject({
    ...worldAssetBaseShape,
    type: z.literal(kind),
    ref: concreteAssetRefSchema(domain, kind),
    properties: z.strictObject(publicPropertiesShape)
  }).describe(description);
}

export const mountainAssetSchema = concreteAssetSchema("terrain", "mountain", mountainAssetPropertiesSchema, "山峰资产。");
export const hillAssetSchema = concreteAssetSchema("terrain", "hill", hillAssetPropertiesSchema, "单丘资产。");
export const ridgeAssetSchema = concreteAssetSchema("terrain", "ridge", ridgeAssetPropertiesSchema, "山脊资产。");
export const canyonAssetSchema = concreteAssetSchema("terrain", "canyon", canyonAssetPropertiesSchema, "峡谷资产。");
export const valleyAssetSchema = concreteAssetSchema("terrain", "valley", valleyAssetPropertiesSchema, "山谷资产。");
export const slopeAssetSchema = concreteAssetSchema("terrain", "slope", slopeAssetPropertiesSchema, "坡地资产。");
export const plateauAssetSchema = concreteAssetSchema("terrain", "plateau", plateauAssetPropertiesSchema, "台地资产。");
export const basinAssetSchema = concreteAssetSchema("terrain", "basin", basinAssetPropertiesSchema, "盆地资产。");
export const oceanAssetSchema = concreteAssetSchema("water", "ocean", oceanAssetPropertiesSchema, "海洋资产。");
export const lakeAssetSchema = concreteAssetSchema("water", "lake", lakeAssetPropertiesSchema, "湖泊资产。");
export const pondAssetSchema = concreteAssetSchema("water", "pond", pondAssetPropertiesSchema, "池塘资产。");
export const riverAssetSchema = concreteAssetSchema("water", "river", riverAssetPropertiesSchema, "河流资产。");
export const streamAssetSchema = concreteAssetSchema("water", "stream", streamAssetPropertiesSchema, "溪流资产。");
export const treeAssetSchema = concreteAssetSchema("vegetation", "tree", treeAssetPropertiesSchema, "单棵树资产。");
export const forestAssetSchema = concreteAssetSchema("vegetation", "forest", forestAssetPropertiesSchema, "树林资产。");
export const shrubAssetSchema = concreteAssetSchema("vegetation", "shrub", shrubAssetPropertiesSchema, "单株灌木资产。");
export const shrublandAssetSchema = concreteAssetSchema(
  "vegetation",
  "shrubland",
  shrublandAssetPropertiesSchema,
  "灌木丛资产。"
);
export const grasslandAssetSchema = concreteAssetSchema(
  "vegetation",
  "grassland",
  grasslandAssetPropertiesSchema,
  "草地资产。"
);
export const flowerFieldAssetSchema = concreteAssetSchema(
  "vegetation",
  "flower-field",
  flowerFieldAssetPropertiesSchema,
  "花地资产。"
);
export const aquaticGrassBedAssetSchema = concreteAssetSchema(
  "vegetation",
  "aquatic-grass-bed",
  aquaticGrassBedAssetPropertiesSchema,
  "水草区资产。"
);
export const rockAssetSchema = concreteAssetSchema("object", "rock", rockAssetPropertiesSchema, "岩石资产。");
export const mushroomAssetSchema = concreteAssetSchema(
  "object",
  "mushroom",
  mushroomAssetPropertiesSchema,
  "蘑菇资产。"
);
export const roadAssetSchema = concreteAssetSchema("infrastructure", "road", roadAssetPropertiesSchema, "道路资产。");
export const bridgeAssetSchema = concreteAssetSchema(
  "infrastructure",
  "bridge",
  bridgeAssetPropertiesSchema,
  "桥梁资产。"
);
export const poiAssetSchema = concreteAssetSchema("poi", "poi", poiAssetPropertiesSchema, "规划兴趣点资产。");

export const terrainAssetSchema = z.union([
  mountainAssetSchema,
  hillAssetSchema,
  ridgeAssetSchema,
  canyonAssetSchema,
  valleyAssetSchema,
  slopeAssetSchema,
  plateauAssetSchema,
  basinAssetSchema
]);
export const waterAssetSchema = z.union([
  oceanAssetSchema,
  lakeAssetSchema,
  pondAssetSchema,
  riverAssetSchema,
  streamAssetSchema
]);
export const vegetationAssetSchema = z.union([
  treeAssetSchema,
  forestAssetSchema,
  shrubAssetSchema,
  shrublandAssetSchema,
  grasslandAssetSchema,
  flowerFieldAssetSchema,
  aquaticGrassBedAssetSchema
]);
export const objectAssetSchema = z.union([rockAssetSchema, mushroomAssetSchema]);
export const buildingAssetSchema = concreteAssetSchema("infrastructure", "building", buildingAssetPropertiesSchema, "只读的规划建筑体量引用。实际建筑由 Scene 的 Entity 和 Component 管理，通过原生编辑器修改。")
  .extend({ ref: z.intersection(concreteAssetRefSchema("infrastructure", "building"), z.object({ source: z.literal("natural") })) })
  .describe("只读的规划建筑体量引用，source 固定为 natural。实际建筑由 Scene 的 Entity 和 Component 管理，通过原生编辑器修改。");
export const infrastructureAssetSchema = z.union([roadAssetSchema, bridgeAssetSchema, buildingAssetSchema]);

export const inspectedWorldAssetSchema = z.union([
  buildingAssetSchema,
  mountainAssetSchema,
  hillAssetSchema,
  ridgeAssetSchema,
  canyonAssetSchema,
  valleyAssetSchema,
  slopeAssetSchema,
  plateauAssetSchema,
  basinAssetSchema,
  oceanAssetSchema,
  lakeAssetSchema,
  pondAssetSchema,
  riverAssetSchema,
  streamAssetSchema,
  treeAssetSchema,
  forestAssetSchema,
  shrubAssetSchema,
  shrublandAssetSchema,
  grasslandAssetSchema,
  flowerFieldAssetSchema,
  aquaticGrassBedAssetSchema,
  rockAssetSchema,
  mushroomAssetSchema,
  roadAssetSchema,
  bridgeAssetSchema,
  poiAssetSchema
]).describe("world.inspect 返回的具体持久资产可判别联合。");

export const worldAssetSchemaByKind = Object.freeze({
  building: buildingAssetSchema,
  mountain: mountainAssetSchema,
  hill: hillAssetSchema,
  ridge: ridgeAssetSchema,
  canyon: canyonAssetSchema,
  valley: valleyAssetSchema,
  slope: slopeAssetSchema,
  plateau: plateauAssetSchema,
  basin: basinAssetSchema,
  ocean: oceanAssetSchema,
  lake: lakeAssetSchema,
  pond: pondAssetSchema,
  river: riverAssetSchema,
  stream: streamAssetSchema,
  tree: treeAssetSchema,
  forest: forestAssetSchema,
  shrub: shrubAssetSchema,
  shrubland: shrublandAssetSchema,
  grassland: grasslandAssetSchema,
  "flower-field": flowerFieldAssetSchema,
  "aquatic-grass-bed": aquaticGrassBedAssetSchema,
  rock: rockAssetSchema,
  mushroom: mushroomAssetSchema,
  road: roadAssetSchema,
  bridge: bridgeAssetSchema,
  poi: poiAssetSchema
} satisfies Record<SeedWorldAssetKind, z.ZodType>);

export const selectionResultSchema = z.strictObject({
  selectionId: z.string().describe("可保存或作为空间锚点复用的选择标识"),
  matchedCount: z.number().int().nonnegative().describe("完整匹配数量，不受 limit 限制"),
  offset: z.number().int().nonnegative().describe("当前页在完整排序结果中的起始下标"),
  nextOffset: z.number().int().positive().optional().describe("存在时表示仍有下一页；下一次 world.query 原样作为 offset 传入"),
  pageLimitedByBytes: z.literal(true).optional().describe("为 true 时当前页因 Agent 传输字节预算而提前结束；继续使用 nextOffset 即可"),
  items: z.array(queriedWorldAssetSchema).describe("按排序和 limit 返回的公共 Asset 查询投影；按 type 选择具体资产声明后再调用 world.inspect 读取详情"),
  resolvedBounds: worldBoundsSchema.optional().describe("返回 assets 合并后的包围盒")
}).describe("一次有界世界资产查询结果");

export const seasonSchema = z.enum(["spring", "summer", "autumn", "winter"]);
export const weatherPresetSchema = z.enum(["clear", "cloudy", "rain", "storm", "snow", "fog"]);
export const environmentStateSchema = z.strictObject({
  skyColorRgb: skyColorRgbSchema.optional(),
  season: seasonSchema.describe("当前季节"),
  seasonTransitionProgress: z.number().min(0).max(1).describe("季节过渡进度，1 表示已完成"),
  precipitation: z.string().describe("当前降水摘要，例如 none、rain:1.00 或 snow:0.50"),
  rainIntensity: z.number().min(0).max(1).describe("当前降雨强度"),
  snowIntensity: z.number().min(0).max(1).describe("当前降雪强度"),
  cloudCoverage: z.number().min(0).max(1).describe("当前云层覆盖"),
  fogIntensity: z.number().min(0).max(1).describe("当前雾强度"),
  windSpeed: z.number().nonnegative().describe("当前配置的持续风速，单位为米每秒；不包含瞬时阵风波动"),
  windIntensity: z.number().min(0).max(1).describe("风力归一化强度"),
  windDirectionDegrees: z.number().describe("相对世界前方的当前风向角，单位为度"),
  windGustiness: z.number().min(0).max(1).describe("当前阵风强度"),
  windTurbulence: z.number().min(0).max(1).describe("当前乱流程度"),
  lightningFrequency: z.number().min(0).max(1).describe("当前闪电频率"),
  lightningIntensity: z.number().min(0).max(1).describe("当前闪电强度")
}).describe("玩家语义的完整天象状态；字段均位于 environment 顶层，不使用 wind、rain 或 lightning 子对象");
export const liveWorldStateSchema = z.looseObject({
  world: z.strictObject({
    rootSeed: z.number().int(), sizeMetres: z.number().positive(),
    origin: z.tuple([z.number(), z.number()]).optional().describe("世界 X/Z 平面最小坐标，单位米；省略时以世界中心为原点。")
  }),
  camera: z.looseObject({
    mode: z.enum(["orbit", "roam"]),
    position: worldPositionTupleSchema,
    forward: worldPositionTupleSchema
  }),
  lighting: z.looseObject({ timeHours: z.number(), phase: z.string(), playing: z.boolean() }),
  environment: environmentStateSchema
});
export const environmentUpdateOutputSchema = z.strictObject({
  requested: jsonObjectSchema,
  state: liveWorldStateSchema.nullable()
});
export const teleportOutputSchema = z
  .strictObject({ cameraPosition: worldPositionTupleSchema })
  .catchall(z.json());
