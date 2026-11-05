import { waterColorRgbSchema } from "./SeedWorldWaterColorContract";
import * as z from "zod";
import { treeShapeSchema } from "./SeedWorldTreeShapeContract";

/** Every persistent semantic asset owns one public declaration module. */
export const SEED_WORLD_ASSET_TYPE_CATALOG = Object.freeze({
  building: Object.freeze({ domain: "infrastructure", typeSymbol: "BuildingAsset" }),
  terrain: Object.freeze({ domain: "terrain", typeSymbol: "TerrainAsset" }),
  mountain: Object.freeze({ domain: "terrain", typeSymbol: "MountainAsset" }),
  hill: Object.freeze({ domain: "terrain", typeSymbol: "HillAsset" }),
  ridge: Object.freeze({ domain: "terrain", typeSymbol: "RidgeAsset" }),
  canyon: Object.freeze({ domain: "terrain", typeSymbol: "CanyonAsset" }),
  valley: Object.freeze({ domain: "terrain", typeSymbol: "ValleyAsset" }),
  slope: Object.freeze({ domain: "terrain", typeSymbol: "SlopeAsset" }),
  plateau: Object.freeze({ domain: "terrain", typeSymbol: "PlateauAsset" }),
  basin: Object.freeze({ domain: "terrain", typeSymbol: "BasinAsset" }),
  ocean: Object.freeze({ domain: "water", typeSymbol: "OceanAsset" }),
  lake: Object.freeze({ domain: "water", typeSymbol: "LakeAsset" }),
  pond: Object.freeze({ domain: "water", typeSymbol: "PondAsset" }),
  river: Object.freeze({ domain: "water", typeSymbol: "RiverAsset" }),
  stream: Object.freeze({ domain: "water", typeSymbol: "StreamAsset" }),
  tree: Object.freeze({ domain: "vegetation", typeSymbol: "TreeAsset" }),
  forest: Object.freeze({ domain: "vegetation", typeSymbol: "ForestAsset" }),
  shrub: Object.freeze({ domain: "vegetation", typeSymbol: "ShrubAsset" }),
  shrubland: Object.freeze({ domain: "vegetation", typeSymbol: "ShrublandAsset" }),
  grassland: Object.freeze({ domain: "vegetation", typeSymbol: "GrasslandAsset" }),
  "flower-field": Object.freeze({ domain: "vegetation", typeSymbol: "FlowerFieldAsset" }),
  "aquatic-grass-bed": Object.freeze({ domain: "vegetation", typeSymbol: "AquaticGrassBedAsset" }),
  rock: Object.freeze({ domain: "object", typeSymbol: "RockAsset" }),
  mushroom: Object.freeze({ domain: "object", typeSymbol: "MushroomAsset" }),
  road: Object.freeze({ domain: "infrastructure", typeSymbol: "RoadAsset" }),
  bridge: Object.freeze({ domain: "infrastructure", typeSymbol: "BridgeAsset" }),
  poi: Object.freeze({ domain: "poi", typeSymbol: "PoiAsset" })
} as const);

export type SeedWorldAssetKind = keyof typeof SEED_WORLD_ASSET_TYPE_CATALOG;
export type SeedWorldAssetDomain = (typeof SEED_WORLD_ASSET_TYPE_CATALOG)[SeedWorldAssetKind]["domain"];

export const SEED_WORLD_ASSET_KINDS = Object.freeze(Object.keys(SEED_WORLD_ASSET_TYPE_CATALOG) as SeedWorldAssetKind[]);

const ASSET_DOMAIN_IDS = ["terrain", "water", "vegetation", "object", "infrastructure", "poi"] as const;

export const SEED_WORLD_ASSET_DOMAIN_CATALOG = Object.freeze(
  Object.fromEntries(
    ASSET_DOMAIN_IDS.map((domain) => {
      const entries = Object.entries(SEED_WORLD_ASSET_TYPE_CATALOG).filter(([, entry]) => entry.domain === domain);
      return [
        domain,
        Object.freeze({
          kinds: Object.freeze(entries.map(([kind]) => kind as SeedWorldAssetKind))
        })
      ];
    })
  )
) as Readonly<
  Record<
    SeedWorldAssetDomain,
    Readonly<{
      kinds: readonly SeedWorldAssetKind[];
    }>
  >
>;

export const SEED_WORLD_ASSET_CATALOG = Object.freeze(
  Object.fromEntries(ASSET_DOMAIN_IDS.map((domain) => [domain, SEED_WORLD_ASSET_DOMAIN_CATALOG[domain].kinds]))
) as Readonly<Record<SeedWorldAssetDomain, readonly SeedWorldAssetKind[]>>;

const metres = (description: string) => z.number().describe(`${description}，单位为米。`);
const unit = (description: string) => z.number().min(0).max(1).describe(`${description}，范围 0 到 1。`);
const count = (description: string) => z.number().int().nonnegative().describe(description);

export const hillAssetPropertiesSchema = z.strictObject({
  assetKind: z.literal("hill").describe("双层 compact-cosine 单丘原子。"),
  pedestalLiftMetres: metres("基座相对原地形的整体抬升"),
  influenceMajorRadiusMetres: metres("基座完整影响椭圆的长轴半径"),
  peakReliefMetres: metres("峰顶高出基座的局部峰高"),
  bodyMajorRadiusMetres: metres("可见峰体椭圆的长轴半径"),
  headingDegrees: z.number().describe("峰体长轴的世界航向角，单位为度。")
});
const genericTerrainAssetPropertiesBaseSchema = z.strictObject({
  planningElementId: z.string().optional(),
  assetKind: z
    .enum(["mountain", "ridge", "canyon", "valley", "slope", "plateau", "basin"])
    .describe("通用地貌语义类型。"),
  lengthMetres: metres("地貌主方向长度").optional(),
  widthMetres: metres("地貌横向宽度").optional(),
  elevationDeltaMetres: metres(
    "相对原地形的形状幅度（米），不是实际峰值增高或海拔；非对称、粗糙度和侵蚀会改变实测高度；负值表示下切"
  ).optional(),
  headingDegrees: z.number().describe("地貌主方向的世界航向角，单位为度。").optional(),
  sharpness: unit("峰脊或边缘的尖锐程度").optional(),
  asymmetry: unit("两侧形状的不对称程度").optional(),
  roughness: unit("表面起伏的粗糙程度").optional(),
  erosion: unit("侵蚀塑形强度").optional(),
  seed: z.number().int().nonnegative().describe("可复现生成形态的随机种子。").optional(),
  elevationMetres: metres("自然地貌代表点的海拔").optional()
});
export const mountainAssetPropertiesSchema = genericTerrainAssetPropertiesBaseSchema.extend({
  assetKind: z.literal("mountain")
});
export const ridgeAssetPropertiesSchema = genericTerrainAssetPropertiesBaseSchema.extend({
  assetKind: z.literal("ridge")
});
export const canyonAssetPropertiesSchema = genericTerrainAssetPropertiesBaseSchema.extend({
  assetKind: z.literal("canyon")
});
export const valleyAssetPropertiesSchema = genericTerrainAssetPropertiesBaseSchema.extend({
  assetKind: z.literal("valley")
});
export const slopeAssetPropertiesSchema = genericTerrainAssetPropertiesBaseSchema.extend({
  assetKind: z.literal("slope")
});
export const plateauAssetPropertiesSchema = genericTerrainAssetPropertiesBaseSchema.extend({
  assetKind: z.literal("plateau")
});
export const basinAssetPropertiesSchema = genericTerrainAssetPropertiesBaseSchema.extend({
  assetKind: z.literal("basin")
});

export const baseTerrainAssetPropertiesSchema = z.strictObject({
  assetKind: z.literal("terrain"),
  planningElementId: z.string().optional()
});

export const terrainAssetPropertiesSchema = z
  .discriminatedUnion("assetKind", [
    baseTerrainAssetPropertiesSchema,
    mountainAssetPropertiesSchema,
    hillAssetPropertiesSchema,
    ridgeAssetPropertiesSchema,
    canyonAssetPropertiesSchema,
    valleyAssetPropertiesSchema,
    slopeAssetPropertiesSchema,
    plateauAssetPropertiesSchema,
    basinAssetPropertiesSchema
  ])
  .describe("单丘使用精确原子参数；其他地貌使用通用语义属性，不暴露高度场内部数据。");

const stillWaterShape = {
  colorRgb: waterColorRgbSchema.optional(),
  radiusMetres: metres("水体的代表半径").optional(),
  depthMetres: metres("玩家创建水体的水深").optional(),
  maximumDepthMetres: metres("自然水体的最大水深").optional(),
  surfaceElevationMetres: metres("可进入水面的世界海拔").optional(),
  canonicalWaterLevelMetres: metres("水体充满时的基准绝对世界水位").optional(),
  minimumWaterLevelMetres: metres("水位允许下降到的最低绝对世界高度；湖泊或池塘在此水位呈干涸状态").optional(),
  maximumWaterLevelMetres: metres("水位允许上升到的最高绝对世界高度").optional(),
  waterLevelMetres: metres("当前实际生效的绝对世界水位；调整水量时应读取并修改此属性").optional(),
  shorelineIrregularity: unit("岸线不规则程度").optional(),
  seed: z.number().int().nonnegative().describe("可复现岸线和湖盆形态的随机种子。").optional()
};

export const oceanAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("ocean").describe("海洋水体。"),
    ...stillWaterShape
  })
  .describe("海洋资产的语义属性。");

export const lakeAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("lake").describe("湖泊水体。"),
    ...stillWaterShape
  })
  .describe("湖泊资产的语义属性。");

export const pondAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("pond").describe("池塘水体。"),
    ...stillWaterShape
  })
  .describe("池塘资产的语义属性。");

const flowingWaterShape = {
  colorRgb: waterColorRgbSchema.optional(),
  lengthMetres: metres("水道中心线长度").optional(),
  widthMetres: metres("玩家创建水道的代表宽度").optional(),
  maximumWidthMetres: metres("自然水道的最大宽度").optional(),
  depthMetres: metres("玩家创建水道的水深").optional(),
  maximumDepthMetres: metres("自然水道的最大水深").optional(),
  surfaceElevationMetres: metres("可进入水面的代表海拔").optional(),
  flowSpeed: z.number().nonnegative().describe("水流速度，单位为米每秒。").optional(),
  meander: unit("水道蜿蜒程度").optional(),
  headingDegrees: z.number().describe("水道主方向的世界航向角，单位为度。").optional(),
  pointCount: count("水道中心线的采样点数量。").optional()
};

export const riverAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("river").describe("河流水道。"),
    ...flowingWaterShape
  })
  .describe("河流资产的语义属性。");

export const streamAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("stream").describe("溪流水道。"),
    ...flowingWaterShape
  })
  .describe("溪流资产的语义属性。");

export const waterAssetPropertiesSchema = z
  .discriminatedUnion("assetKind", [
    oceanAssetPropertiesSchema,
    lakeAssetPropertiesSchema,
    pondAssetPropertiesSchema,
    riverAssetPropertiesSchema,
    streamAssetPropertiesSchema
  ])
  .describe("海洋、湖泊、池塘、河流和溪流按 assetKind 判别的精确属性。");

export const treeAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("tree").describe("单棵可独立引用的树。"),
    proceduralAssetId: z.string().optional().describe("实际渲染的程序化资源标识；材质槽按此物种发现。"),
    planningEntityId: z.string().optional().describe("规划组件目标；通过 world.parameters.inspect/apply 修改。"),
    treeShape: treeShapeSchema
      .optional()
      .describe("当前实际生效的共享树形参数；vegetation.update 的 treeShape 修改对应共享效果。"),
    treeRecipeId: z.string().optional().describe("内部共享树形配方标识，用于解析编辑目标。"),
    treeRecipeLabel: z.string().optional().describe("内部配方名称。"),
    treeEffectIndex: z
      .number()
      .int()
      .min(0)
      .max(7)
      .optional()
      .describe("内部效果编号：1 到 7 对应面板 Effect；0 为只读原型。"),
    species: z.string().describe("树种语义标识，例如 birch；未知时省略。").optional(),
    footprintMetres: z
      .tuple([z.number().positive(), z.number().positive()])
      .describe("树冠或树干占地宽度与深度；实例物化后可用。")
      .optional(),
    headingDegrees: z.number().describe("树木绕竖直轴的朝向角，单位为度；实例物化后可用。").optional(),
    scale: z
      .tuple([z.number().positive(), z.number().positive(), z.number().positive()])
      .describe("树木的世界缩放；实例物化后可用。")
      .optional()
  })
  .describe("单棵树的公共语义属性。");

export const shrubAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("shrub").describe("单株可独立引用的灌木。"),
    footprintMetres: z
      .tuple([z.number().positive(), z.number().positive()])
      .describe("灌木占地宽度与深度；实例物化后可用。")
      .optional(),
    headingDegrees: z.number().describe("灌木绕竖直轴的朝向角，单位为度；实例物化后可用。").optional(),
    scale: z
      .tuple([z.number().positive(), z.number().positive(), z.number().positive()])
      .describe("灌木的世界缩放；实例物化后可用。")
      .optional()
  })
  .describe("单株灌木的公共语义属性。");

const vegetationAreaAssetPropertiesBaseSchema = z.strictObject({
  planningEntityId: z.string().optional().describe("规划区域组件目标；通过 world.parameters.inspect/apply 修改。"),
  assetKind: z
    .enum(["forest", "shrubland", "grassland", "flower-field", "aquatic-grass-bed"])
    .describe("区域植被资产的语义类型。"),
  radiusMetres: metres("局部区域的代表半径；自然栖息地填充可能省略").optional(),
  memberCount: count("树林或灌木丛中实际物化且可独立引用的成员数量；草地、花地和水草区省略。").optional(),
  distribution: z.enum(["area", "habitat-fill"]).describe("植被在空间中的公共分布方式；内部实例求解方式不会暴露。"),
  seed: z.number().int().nonnegative().describe("可复现植被分布的随机种子。").optional()
});

export const forestAssetPropertiesSchema = vegetationAreaAssetPropertiesBaseSchema
  .extend({ assetKind: z.literal("forest") })
  .describe("树林资产的公共语义属性。");
export const shrublandAssetPropertiesSchema = vegetationAreaAssetPropertiesBaseSchema
  .extend({ assetKind: z.literal("shrubland") })
  .describe("灌木丛资产的公共语义属性。");
export const grasslandAssetPropertiesSchema = vegetationAreaAssetPropertiesBaseSchema
  .extend({ assetKind: z.literal("grassland") })
  .describe("草地资产的公共语义属性。");
export const flowerFieldAssetPropertiesSchema = vegetationAreaAssetPropertiesBaseSchema
  .extend({ assetKind: z.literal("flower-field") })
  .describe("花地资产的公共语义属性。");
export const aquaticGrassBedAssetPropertiesSchema = vegetationAreaAssetPropertiesBaseSchema
  .extend({
    assetKind: z.literal("aquatic-grass-bed")
  })
  .describe("水草区资产的公共语义属性。");

export const vegetationAreaAssetPropertiesSchema = z
  .discriminatedUnion("assetKind", [
    forestAssetPropertiesSchema,
    shrublandAssetPropertiesSchema,
    grasslandAssetPropertiesSchema,
    flowerFieldAssetPropertiesSchema,
    aquaticGrassBedAssetPropertiesSchema
  ])
  .describe("树林、灌木丛、草地、花地和水草区的公共语义属性。");

export const rockAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("rock").describe("可独立引用的岩石。"),
    sizeClass: z.enum(["small", "regular"]).describe("岩石的语义尺寸等级。")
  })
  .describe("岩石的公共语义属性；small-rock 只作为 sizeClass 暴露。");

export const mushroomAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("mushroom").describe("可独立引用的蘑菇。")
  })
  .describe("蘑菇的公共语义属性。");

export const roadAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("road").describe("连接两个 POI 的道路。"),
    fromPoiId: z.string().describe("道路起点 POI 的稳定标识。"),
    toPoiId: z.string().describe("道路终点 POI 的稳定标识。"),
    pointCount: count("道路中心线采样点数量。"),
    bridgeCount: count("该道路拥有的桥梁资产数量。")
  })
  .describe("道路的公共语义属性。");

export const bridgeAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("bridge").describe("道路跨越水系的一段桥梁。"),
    roadId: z.string().describe("桥梁所属道路的稳定标识。"),
    startArcMetres: metres("桥面沿道路的起始里程"),
    endArcMetres: metres("桥面沿道路的结束里程"),
    lengthMetres: metres("桥梁长度")
  })
  .describe("桥梁的公共语义属性。");

export const poiAssetPropertiesSchema = z
  .strictObject({
    assetKind: z.literal("poi").describe("规划兴趣点。"),
    poiKind: z.enum(["settlement", "lookout", "crossroads"]).describe("兴趣点的语义角色。")
  })
  .describe("POI 的公共语义属性。");

export const vegetationAssetPropertiesSchema = z
  .discriminatedUnion("assetKind", [
    treeAssetPropertiesSchema,
    shrubAssetPropertiesSchema,
    vegetationAreaAssetPropertiesSchema
  ])
  .describe("植被资产按 assetKind 判别的精确属性。");

export const objectAssetPropertiesSchema = z
  .discriminatedUnion("assetKind", [rockAssetPropertiesSchema, mushroomAssetPropertiesSchema])
  .describe("独立对象资产按 assetKind 判别的精确属性。");

/** Read-only published layout identity. Native Scene components own building edits. */
export const buildingAssetPropertiesSchema = z.strictObject({
  assetKind: z.literal("building"),
  planningElementId: z.string()
});

export const infrastructureAssetPropertiesSchema = z
  .discriminatedUnion("assetKind", [
    roadAssetPropertiesSchema,
    bridgeAssetPropertiesSchema,
    buildingAssetPropertiesSchema
  ])
  .describe("基础设施资产按 assetKind 判别的精确属性。");

export const worldAssetPropertiesSchema = z.discriminatedUnion("assetKind", [
  terrainAssetPropertiesSchema,
  waterAssetPropertiesSchema,
  vegetationAssetPropertiesSchema,
  objectAssetPropertiesSchema,
  infrastructureAssetPropertiesSchema,
  poiAssetPropertiesSchema
]);

const ASSET_PROPERTY_SCHEMA_BY_KIND: Readonly<Record<SeedWorldAssetKind, z.ZodType>> = Object.freeze({
  building: buildingAssetPropertiesSchema,
  terrain: baseTerrainAssetPropertiesSchema,
  mountain: mountainAssetPropertiesSchema,
  hill: hillAssetPropertiesSchema,
  ridge: ridgeAssetPropertiesSchema,
  canyon: canyonAssetPropertiesSchema,
  valley: valleyAssetPropertiesSchema,
  slope: slopeAssetPropertiesSchema,
  plateau: plateauAssetPropertiesSchema,
  basin: basinAssetPropertiesSchema,
  ocean: oceanAssetPropertiesSchema,
  lake: lakeAssetPropertiesSchema,
  pond: pondAssetPropertiesSchema,
  river: riverAssetPropertiesSchema,
  stream: streamAssetPropertiesSchema,
  tree: treeAssetPropertiesSchema,
  shrub: shrubAssetPropertiesSchema,
  forest: forestAssetPropertiesSchema,
  shrubland: shrublandAssetPropertiesSchema,
  grassland: grasslandAssetPropertiesSchema,
  "flower-field": flowerFieldAssetPropertiesSchema,
  "aquatic-grass-bed": aquaticGrassBedAssetPropertiesSchema,
  rock: rockAssetPropertiesSchema,
  mushroom: mushroomAssetPropertiesSchema,
  road: roadAssetPropertiesSchema,
  bridge: bridgeAssetPropertiesSchema,
  poi: poiAssetPropertiesSchema
});

export function seedWorldAssetPropertyNames(kinds?: readonly string[]): ReadonlySet<string> {
  const requested =
    kinds?.filter((kind): kind is SeedWorldAssetKind => kind in ASSET_PROPERTY_SCHEMA_BY_KIND) ??
    (Object.keys(ASSET_PROPERTY_SCHEMA_BY_KIND) as SeedWorldAssetKind[]);
  return new Set(requested.flatMap((kind) => objectPropertyNames(ASSET_PROPERTY_SCHEMA_BY_KIND[kind])));
}

function objectPropertyNames(schema: z.ZodType): string[] {
  if (schema instanceof z.ZodObject) return Object.keys(schema.shape);
  throw new Error("Seed World asset property registry accepts only object schemas");
}
