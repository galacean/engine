import * as z from "zod";
import { treeShapePatchSchema } from "@galacean/engine-world-planning/agent-adapter/contracts/SeedWorldTreeShapeContract";

import type { AgentTool } from "@galacean/engine-ai-chat/ai-chat/index";
import { SEED_WORLD_DEFAULT_HILL_ATOM_PARAMETERS, SEED_WORLD_HILL_ATOM_LIMITS } from "@galacean/engine-world-planning/world/SeedWorldHillAtom";
import {
  SEED_WORLD_TERRAIN_TRANSITION_DEFAULT_DURATION_SECONDS,
  SEED_WORLD_TERRAIN_TRANSITION_MAXIMUM_DURATION_SECONDS
} from "@galacean/engine-terrain/world/SeedWorldTerrainTransition";
import type { SeedWorldAgentApplication } from "../SeedWorldAgentApplication.ts";
import { defineSeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";
import { spatialTargetSchema } from "./spatial-tool-input.ts";
import { defineSeedWorldTool } from "./define-seed-world-tool.ts";
import { SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import {
  authoringResultSchema,
  appliedAssetMutationResultSchema,
  assetMutationResultSchema,
  mutationControlShape,
  previewAssetMutationResultSchema,
  terrainRefSchema,
  vegetationRefSchema
} from "./tool-contract.ts";

export const terrainFeatureRefSchema = terrainRefSchema;
export const vegetationFeatureRefSchema = vegetationRefSchema;

const terrainTransitionControlShape = {
  ...mutationControlShape,
  transitionDurationSeconds: z
    .number()
    .min(0)
    .max(SEED_WORLD_TERRAIN_TRANSITION_MAXIMUM_DURATION_SECONDS)
    .optional()
    .describe(
      `地势从当前高度过渡到最终高度的时间，单位为秒；省略时默认 ${SEED_WORLD_TERRAIN_TRANSITION_DEFAULT_DURATION_SECONDS} 秒，0 时立即完成`
    )
};

const genericTerrainFeatureKindSchema = z.enum(["mountain", "ridge", "canyon", "valley", "slope", "plateau", "basin"]);
const authoredHillFeatureRefSchema = z
  .intersection(terrainRefSchema, z.object({ kind: z.literal("hill"), source: z.literal("authored") }))
  .describe("terrain.create 返回的、可由 terrain.update 修改的单丘资产引用");
const authoredGenericTerrainFeatureRefSchema = z
  .intersection(
    terrainRefSchema,
    z.object({ kind: genericTerrainFeatureKindSchema, source: z.literal("authored") })
  )
  .describe("terrain.create 返回的、可由 terrain.update 修改的通用地貌资产引用");
const directionSchema = z
  .union([
    z.strictObject({
      kind: z.literal("viewer-forward").describe("使用调用时玩家视角的水平前方")
    }),
    z.strictObject({
      kind: z.literal("heading").describe("使用明确的世界航向角"),
      degrees: z.number().describe("世界航向角，单位为度；运行时归一化到 0 到 360 度")
    })
  ])
  .optional()
  .describe("地貌或水道的主方向；省略时使用玩家视角前方");
const hillParameter = <Parameter extends keyof typeof SEED_WORLD_HILL_ATOM_LIMITS>(
  parameter: Parameter,
  description: string,
  omittedDescription: string
) =>
  z
    .number()
    .min(SEED_WORLD_HILL_ATOM_LIMITS[parameter].minimum)
    .max(SEED_WORLD_HILL_ATOM_LIMITS[parameter].maximum)
    .optional()
    .describe(`${description}；${omittedDescription}`);
const hillFeatureCreateSchema = z.strictObject({
  kind: z.literal("hill").describe("创建一个双层 compact-cosine 单丘原子"),
  target: spatialTargetSchema.describe("山丘中心的空间目标；解析后只使用位置，不改变玩家 Pose"),
  direction: directionSchema,
  pedestalLiftMetres: hillParameter(
    "pedestalLiftMetres",
    "基座相对原地形的整体抬升，单位为米",
    `省略时为 ${SEED_WORLD_DEFAULT_HILL_ATOM_PARAMETERS.pedestalLiftMetres} 米`
  ),
  influenceMajorRadiusMetres: hillParameter(
    "influenceMajorRadiusMetres",
    "基座完整影响椭圆的长轴半径，单位为米",
    `省略时为 ${SEED_WORLD_DEFAULT_HILL_ATOM_PARAMETERS.influenceMajorRadiusMetres} 米`
  ),
  peakReliefMetres: hillParameter(
    "peakReliefMetres",
    "峰顶高出基座的局部峰高，单位为米",
    `省略时为 ${SEED_WORLD_DEFAULT_HILL_ATOM_PARAMETERS.peakReliefMetres} 米`
  ),
  bodyMajorRadiusMetres: hillParameter(
    "bodyMajorRadiusMetres",
    "可见峰体椭圆的长轴半径，单位为米",
    `省略时为 ${SEED_WORLD_DEFAULT_HILL_ATOM_PARAMETERS.bodyMajorRadiusMetres} 米`
  ),
  ...terrainTransitionControlShape
});
const genericTerrainFeatureCreateSchema = z.strictObject({
  kind: genericTerrainFeatureKindSchema.describe("要创建的语义地貌类型；决定未提供形态参数时采用的自然默认外观"),
  target: spatialTargetSchema.describe("地貌中心的空间目标；解析后只使用位置，不改变玩家 Pose"),
  direction: directionSchema,
  lengthMetres: z
    .number()
    .min(4)
    .max(1_000)
    .optional()
    .describe("沿主方向的地貌长度，单位为米；省略时使用该 kind 的自然默认长度"),
  widthMetres: z
    .number()
    .min(4)
    .max(1_000)
    .optional()
    .describe("垂直主方向的地貌宽度，单位为米；省略时使用该 kind 的自然默认宽度"),
  heightMetres: z
    .number()
    .min(0.5)
    .max(200)
    .optional()
    .describe("山峰、山脊、坡地和台地相对原地形抬高的高度，单位为米；省略时使用 kind 默认值"),
  depthMetres: z
    .number()
    .min(0.5)
    .max(200)
    .optional()
    .describe("峡谷、山谷和盆地相对原地形下切的深度，单位为米；省略时使用 kind 默认值"),
  sharpness: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("峰顶、脊线或边缘的尖锐程度；0 最圆润，1 最尖锐；省略时使用 kind 默认值"),
  asymmetry: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("地貌两侧的不对称程度；0 对称，1 高度不对称；省略时使用 kind 默认值"),
  roughness: z.number().min(0).max(1).optional().describe("表面局部起伏强度；0 平滑，1 粗糙；省略时使用 kind 默认值"),
  erosion: z.number().min(0).max(1).optional().describe("侵蚀塑形强度；0 不侵蚀，1 最强；省略时使用 kind 默认值"),
  seed: z
    .number()
    .int()
    .min(0)
    .max(0xffff_ffff)
    .optional()
    .describe("控制地貌细节的无符号 32 位随机种子；省略时由世界种子、kind 和创建序号稳定派生"),
  ...terrainTransitionControlShape
});
export const terrainFeatureCreateSchema = z.discriminatedUnion("kind", [
  hillFeatureCreateSchema,
  genericTerrainFeatureCreateSchema
]);
export const terrainPatchSchema = z
  .strictObject({
    lengthMetres: z.number().min(4).max(1_000).optional().describe("新的主方向长度，单位为米；省略时保持不变"),
    widthMetres: z.number().min(4).max(1_000).optional().describe("新的横向宽度，单位为米；省略时保持不变"),
    elevationDeltaMetres: z
      .number()
      .min(-200)
      .max(200)
      .optional()
      .describe("相对原地形的新高度变化，单位为米；正值抬高，负值下切；省略时保持不变"),
    headingDegrees: z
      .number()
      .optional()
      .describe("新的世界航向角，单位为度；运行时归一化到 0 到 360 度；省略时保持不变"),
    sharpness: z.number().min(0).max(1).optional().describe("新的尖锐程度；省略时保持不变"),
    asymmetry: z.number().min(0).max(1).optional().describe("新的不对称程度；省略时保持不变"),
    roughness: z.number().min(0).max(1).optional().describe("新的表面粗糙程度；省略时保持不变"),
    erosion: z.number().min(0).max(1).optional().describe("新的侵蚀强度；省略时保持不变"),
    seed: z.number().int().min(0).max(0xffff_ffff).optional().describe("新的无符号 32 位随机种子；省略时保持不变")
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), { message: "patch 不能为空" });
export const hillFeaturePatchSchema = z
  .strictObject({
    pedestalLiftMetres: hillParameter("pedestalLiftMetres", "新的基座整体抬升，单位为米", "省略时保持不变"),
    influenceMajorRadiusMetres: hillParameter(
      "influenceMajorRadiusMetres",
      "新的基座影响椭圆长轴半径，单位为米",
      "省略时保持不变"
    ),
    peakReliefMetres: hillParameter("peakReliefMetres", "新的局部峰高，单位为米", "省略时保持不变"),
    bodyMajorRadiusMetres: hillParameter("bodyMajorRadiusMetres", "新的峰体椭圆长轴半径，单位为米", "省略时保持不变"),
    headingDegrees: z
      .number()
      .optional()
      .describe("新的世界航向角，单位为度；运行时归一化到 0 到 360 度；省略时保持不变")
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), { message: "patch 不能为空" });

const plantKindSchema = z.enum(["tree", "shrub", "grass", "flower", "aquatic-grass"]);
const vegetationAssetKindSchema = z.enum([
  "tree",
  "forest",
  "shrub",
  "shrubland",
  "grassland",
  "flower-field",
  "aquatic-grass-bed"
]);
const vegetationDistributionSchema = z
  .union([
    z.strictObject({ kind: z.literal("single").describe("创建一个可独立引用的单株资产") }),
    z.strictObject({
      kind: z.literal("area").describe("创建树林或灌木丛区域；Runtime 根据范围、可选精确株数和地表约束生成自然布局"),
      radiusMetres: z
        .number()
        .min(0.5)
        .max(500)
        .optional()
        .describe("区域半径，单位为米；用户未明确范围时必须省略，由 Runtime 按 plant 使用语义默认半径"),
      count: z
        .number()
        .int()
        .min(2)
        .max(SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES)
        .optional()
        .describe("仅当用户明确给出株数时填写；Runtime 必须完整物化该数量，否则整个事务失败且不保留部分结果")
    })
  ])
  .describe("植被资产的空间分布方式");
const authoredVegetationSingleRefSchema = z
  .intersection(
    vegetationRefSchema,
    z.object({ kind: z.enum(["tree", "shrub"]), source: z.literal("authored") })
  )
  .describe("vegetation.create 返回的玩家单棵树或单株灌木引用");
const authoredVegetationDiscreteAreaRefSchema = z
  .intersection(
    vegetationRefSchema,
    z.object({ kind: z.enum(["forest", "shrubland"]), source: z.literal("authored") })
  )
  .describe("vegetation.create 返回的、可修改位置、范围或株数的玩家树林或灌木丛引用");
const authoredVegetationCoverageAreaRefSchema = z
  .intersection(
    vegetationRefSchema,
    z.object({ kind: z.enum(["grassland", "flower-field", "aquatic-grass-bed"]), source: z.literal("authored") })
  )
  .describe("vegetation.create 返回的、可修改位置或范围的玩家草地、花地或水草区引用");
export const vegetationCreateSchema = z.union([
  z.strictObject({
    plant: z.enum(["tree", "shrub"]).describe("要创建的单株或区域植被种类"),
    target: spatialTargetSchema.describe("植被中心的空间目标；不会改变玩家 Pose"),
    distribution: vegetationDistributionSchema,
    seed: z
      .number()
      .int()
      .min(0)
      .max(0xffff_ffff)
      .optional()
      .describe("控制实例分布的无符号 32 位随机种子；省略时使用运行时默认随机序列"),
    ...mutationControlShape
  }),
  z.strictObject({
    plant: z.enum(["grass", "flower", "aquatic-grass"]).describe("要创建的区域植被种类；这些种类不支持单株资产"),
    target: spatialTargetSchema.describe("植被区域中心的空间目标；aquatic-grass 必须要求真实水域"),
    distribution: z
      .strictObject({
        kind: z.literal("area").describe("草、花和水草的最小资产单位固定为区域"),
        radiusMetres: z
          .number()
          .min(0.5)
          .max(500)
          .optional()
          .describe(
            "区域半径，单位为米；用户未明确范围时必须省略，由 Runtime 使用 grass 35 米、flower 25 米、aquatic-grass 20 米"
          )
      })
      .describe("区域覆盖物的范围；玩家创建的草和花按明确范围直接生成并允许与已有内容重叠；水草仍要求真实水域"),
    seed: z
      .number()
      .int()
      .min(0)
      .max(0xffff_ffff)
      .optional()
      .describe("控制实例分布的无符号 32 位随机种子；省略时使用运行时默认随机序列"),
    ...mutationControlShape
  })
]);
const vegetationCreatedSchema = z.strictObject({
  plant: plantKindSchema,
  assetKind: vegetationAssetKindSchema.describe("本次调用创建的唯一公共资产类型。"),
  distribution: z.enum(["single", "area"]),
  requestedPlantCount: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("调用方明确要求的精确株数；未明确数量时为 null"),
  realizedPlantCount: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe(
      "树或灌木实际生成的株数；草地和花地是区域覆盖资产，因此为 null；preview 或没有公共单株数量时为 null"
    )
});
export const vegetationCreateResultSchema = z
  .discriminatedUnion("status", [
    appliedAssetMutationResultSchema.extend({ created: vegetationCreatedSchema }),
    previewAssetMutationResultSchema.extend({ created: vegetationCreatedSchema })
  ])
  .superRefine((value, context) => {
    if (value.status === "preview" && value.created.realizedPlantCount !== null) {
      context.addIssue({
        code: "custom",
        path: ["created", "realizedPlantCount"],
        message: "preview 没有已物化实例，realizedPlantCount 必须为 null"
      });
      return;
    }
    if (value.status === "preview") return;
    const isDiscretePlant = value.created.plant === "tree" || value.created.plant === "shrub";
    if (isDiscretePlant && value.created.realizedPlantCount === null) {
      context.addIssue({
        code: "custom",
        path: ["created", "realizedPlantCount"],
        message: "树或灌木的成功结果必须返回实际成员数量"
      });
    }
    if (!isDiscretePlant && value.created.realizedPlantCount !== null) {
      context.addIssue({
        code: "custom",
        path: ["created", "realizedPlantCount"],
        message: "草地、花地和水草区没有公共单株数量，realizedPlantCount 必须为 null"
      });
    }
    const isExact = value.created.distribution === "single" || value.created.requestedPlantCount !== null;
    if (isExact && value.created.realizedPlantCount !== value.created.requestedPlantCount) {
      context.addIssue({
        code: "custom",
        path: ["created", "realizedPlantCount"],
        message: "精确数量创建成功后 realizedPlantCount 必须等于 requestedPlantCount"
      });
    }
  });
const vegetationUpdatedSchema = z.strictObject({
  plant: plantKindSchema.describe("本次调用更新的植被种类"),
  assetKind: vegetationAssetKindSchema.describe("本次调用更新的唯一公共资产类型"),
  realizedPlantCount: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe("树或灌木更新后的实际株数；preview 或没有公共单株数量时为 null")
});
export const vegetationUpdateResultSchema = z
  .discriminatedUnion("status", [
    appliedAssetMutationResultSchema.extend({ updated: vegetationUpdatedSchema }),
    previewAssetMutationResultSchema.extend({ updated: vegetationUpdatedSchema })
  ])
  .superRefine((value, context) => {
    if (value.status === "preview" && value.updated.realizedPlantCount !== null) {
      context.addIssue({
        code: "custom",
        path: ["updated", "realizedPlantCount"],
        message: "preview 没有已物化实例，realizedPlantCount 必须为 null"
      });
      return;
    }
    if (value.status === "preview") return;
    const isDiscretePlant = value.updated.plant === "tree" || value.updated.plant === "shrub";
    if (isDiscretePlant && value.updated.realizedPlantCount === null) {
      context.addIssue({
        code: "custom",
        path: ["updated", "realizedPlantCount"],
        message: "树、树林、灌木或灌木丛的成功更新结果必须返回实际成员数量"
      });
    }
    if (!isDiscretePlant && value.updated.realizedPlantCount !== null) {
      context.addIssue({
        code: "custom",
        path: ["updated", "realizedPlantCount"],
        message: "草地、花地和水草区没有公共单株数量，不能返回 realizedPlantCount"
      });
    }
  });
const vegetationSinglePatchSchema = z
  .strictObject({
    target: spatialTargetSchema.optional().describe("单株的新位置；省略时保持原位置"),
    seed: z.number().int().min(0).max(0xffff_ffff).optional().describe("新的无符号 32 位分布随机种子；省略时保持不变")
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), { message: "patch 不能为空" });
const vegetationDiscreteAreaPatchSchema = z
  .strictObject({
    target: spatialTargetSchema.optional().describe("区域的新中心位置；省略时保持原位置"),
    radiusMetres: z.number().min(0.5).max(500).optional().describe("新的区域半径，单位为米；省略时保持不变"),
    count: z
      .number()
      .int()
      .min(2)
      .max(SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES)
      .optional()
      .describe("仅树林或灌木丛可用：新的精确株数；Runtime 无法完整物化时整个事务失败"),
    seed: z.number().int().min(0).max(0xffff_ffff).optional().describe("新的无符号 32 位分布随机种子；省略时保持不变")
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), { message: "patch 不能为空" });
const vegetationCoverageAreaPatchSchema = z
  .strictObject({
    target: spatialTargetSchema.optional().describe("区域的新中心位置；省略时保持原位置"),
    radiusMetres: z.number().min(0.5).max(500).optional().describe("新的区域半径，单位为米；省略时保持不变"),
    seed: z.number().int().min(0).max(0xffff_ffff).optional().describe("新的无符号 32 位分布随机种子；省略时保持不变")
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), { message: "patch 不能为空" });
export const vegetationPatchSchema = z.union([
  vegetationSinglePatchSchema,
  vegetationDiscreteAreaPatchSchema,
  vegetationCoverageAreaPatchSchema
]);

export const terrainPatchApplyInputSchema = z.strictObject({
  operation: z.enum(["raise", "lower"]).describe("raise 抬高现有地势，lower 降低现有地势"),
  target: spatialTargetSchema.describe("局部高度笔刷中心的空间目标；不会创建持久地貌资产"),
  radiusMetres: z
    .number()
    .min(0.5)
    .max(500)
    .describe(
      "平滑笔刷的外半径；中心一半范围应用完整高度差。实际最小值由当前高度场分辨率决定，省略时使用可表达的最小半径。"
    )
    .optional(),
  amount: z.union([
    z.strictObject({
      intensity: z
        .enum(["subtle", "moderate", "strong"])
        .describe("语义高度幅度：subtle=1.5 米、moderate=4 米、strong=10 米")
    }),
    z.strictObject({
      heightDeltaMetres: z
        .number()
        .min(0.1)
        .max(200)
        .describe("笔刷中心完整应用的垂直高度差，单位为米；raise 使用正幅值，lower 由 operation 转为负方向。")
    })
  ]),
  falloff: z
    .literal("smooth")
    .optional()
    .describe("高度从中心向边缘平滑衰减；当前只支持 smooth，省略时同样使用 smooth"),
  ...mutationControlShape
});
export const terrainFeatureUpdateInputSchema = z.union([
  z.strictObject({
    ref: authoredHillFeatureRefSchema,
    patch: hillFeaturePatchSchema.describe("只包含需要修改的单丘原子参数；未提供的参数保持不变"),
    ...terrainTransitionControlShape
  }),
  z.strictObject({
    ref: authoredGenericTerrainFeatureRefSchema,
    patch: terrainPatchSchema.describe("只包含需要修改的通用地貌属性；未提供的属性保持不变"),
    ...terrainTransitionControlShape
  })
]);
export const vegetationUpdateInputSchema = z.union([
  z.strictObject({
    ref: z.intersection(vegetationRefSchema, z.object({ kind: z.literal("tree") }))
      .describe("world.query/get 返回的树引用，用它解析共享配方与效果，支持 natural 和 authored。"),
    patch: z.strictObject({
      treeShape: treeShapePatchSchema,
      treeShapeScope: z.literal("shared-effect").describe("复用面板共享参数，所有使用该配方及效果的树一起变化；不提供单树覆盖。"),
      treeEffectIndex: z.number().int().min(1).max(7).optional().describe("仅用户明确指定效果编号时填写；省略则使用引用树的当前效果。")
    }),
    ...mutationControlShape
  }),
  z.strictObject({
    ref: authoredVegetationSingleRefSchema,
    patch: vegetationSinglePatchSchema.describe("只包含需要修改的单棵树或单株灌木属性；未提供的属性保持不变"),
    ...mutationControlShape
  }),
  z.strictObject({
    ref: authoredVegetationDiscreteAreaRefSchema,
    patch: vegetationDiscreteAreaPatchSchema.describe("只包含需要修改的树林或灌木丛属性；count 是新的精确株数"),
    ...mutationControlShape
  }),
  z.strictObject({
    ref: authoredVegetationCoverageAreaRefSchema,
    patch: vegetationCoverageAreaPatchSchema.describe("只包含需要修改的草地、花地或水草区属性"),
    ...mutationControlShape
  })
]);

export const terrainPatchApplyContract = defineSeedWorldApiContract({
  name: "terrain.patch",
  domain: "terrain",
  description: "抬高或降低现有局部地势，不创建独立世界资产。",
  inputDescription: "操作方向、空间目标、范围、改变量和可选执行控制。",
  outputDescription: "成功时返回 applied/preview 状态、地形修改计数、范围和事务标识；执行失败通过 Tool Error 返回。",
  input: terrainPatchApplyInputSchema,
  output: authoringResultSchema
});
export const terrainFeatureCreateContract = defineSeedWorldApiContract({
  name: "terrain.create",
  domain: "terrain",
  description: "创建山峰、单丘、山脊、峡谷、山谷、坡地、台地或盆地资产。",
  inputDescription: "hill 使用基座抬升、整体影响半径、局部峰高和峰体半径；其他 kind 使用通用地貌参数。",
  outputDescription:
    "assetRef 是新地貌可直接复用的稳定引用；另返回事务标识和实际效果摘要。",
  input: terrainFeatureCreateSchema,
  output: assetMutationResultSchema
});
export const terrainFeatureUpdateContract = defineSeedWorldApiContract({
  name: "terrain.update",
  domain: "terrain",
  description: "修改已有语义地貌资产的形状或高度；单丘与其他地貌使用各自精确的参数集。",
  inputDescription:
    "terrain.create 返回的 authored 地貌 Ref、与 Ref.kind 匹配的非空 patch 和可选执行控制；自然地貌不可通过此 API 修改。",
  outputDescription:
    "assetRef 是可直接复用的稳定引用；另返回事务标识和实际效果摘要。",
  input: terrainFeatureUpdateInputSchema,
  output: assetMutationResultSchema
});
export const vegetationCreateContract = defineSeedWorldApiContract({
  name: "vegetation.create",
  domain: "vegetation",
  description: "创建单棵树、树林、单株灌木、灌木丛、草地、花地或水草区资产。",
  inputDescription:
    "树和灌木支持 single 或 area；single 在解析出的目标位置直接创建，允许重叠或移出生成区域，不执行生成布局的避让、坡度或适生性约束。area 可选精确 count 和范围；成片树仍使用自然布局约束。玩家创建的草、花和灌木按指定范围直接生成，允许与岩石、道路、水域和已有植被重叠，不按海拔、坡度或自然适生性过滤。草、花和水草的最小资产单位是 area。",
  outputDescription:
    "返回新植被资产和可复用稳定引用；created.realizedPlantCount 是树或灌木实际创建的株数，也是对外反馈数量的唯一事实来源。明确提供灌木 count 时会完整创建该数量并允许重叠。草地和花地的 realizedPlantCount 为 null，因为它们是区域覆盖资产；相同位置的重复笔刷会叠加覆盖。地形高度只用于最终落地。",
  input: vegetationCreateSchema,
  output: vegetationCreateResultSchema
});
export const vegetationUpdateContract = defineSeedWorldApiContract({
  name: "vegetation.update",
  domain: "vegetation",
  description: "修改程序化树共享效果的大小、树干粗细、树枝形态、树叶密度/大小和颜色；也可修改玩家创建的植被分布。",
  inputDescription:
    "查询结果的 ref 可直接复用：先 const ref = item.ref，再按 ref.kind 和 ref.source 检查操作适用性；不要把已返回的引用重新拼成宽泛 string 对象，也不要用类型断言绕过来源检查。树形编辑先通过 world.inspect 读取当前值和效果，使用 treeShape 和 treeShapeScope: shared-effect 更新同配方同效果的共享参数；不创建单树覆盖，不与位置/seed 混用。其他分布编辑只支持玩家创建的植被：单体可直接修改位置或 seed，允许重叠，不执行生成约束或自动移开邻居；区域可修改位置、范围或 seed，树林和灌木丛还可修改精确株数。",
  outputDescription:
    "assetRef 是可复用的稳定引用；共享树形编辑的 updated.realizedPlantCount 为受影响树数，其他植被分布更新时为更新后的实际株数；preview 或没有公共单株数量时为 null。",
  input: vegetationUpdateInputSchema,
  output: vegetationUpdateResultSchema
});

export const SEED_WORLD_TERRAIN_CONTRACTS = Object.freeze([
  terrainPatchApplyContract,
  terrainFeatureCreateContract,
  terrainFeatureUpdateContract
]);
export const SEED_WORLD_VEGETATION_CONTRACTS = Object.freeze([vegetationCreateContract, vegetationUpdateContract]);

export function createSeedWorldLandscapeTools(application: SeedWorldAgentApplication): readonly AgentTool[] {
  return [
    defineSeedWorldTool(terrainPatchApplyContract, {
      execute: (input, { signal }) => application.applyTerrainPatch(input, signal)
    }),
    defineSeedWorldTool(terrainFeatureCreateContract, {
      execute: (input, { signal }) => application.createTerrainFeature(input, signal)
    }),
    defineSeedWorldTool(terrainFeatureUpdateContract, {
      execute: ({ ref, patch, ...control }, { signal }) => application.updateTerrainFeature(ref, patch, control, signal)
    }),
    defineSeedWorldTool(vegetationCreateContract, {
      execute: (input, { signal }) => application.createVegetation(input, signal)
    }),
    defineSeedWorldTool(vegetationUpdateContract, {
      execute: ({ ref, patch, ...control }, { signal }) => application.updateVegetation(ref, patch, control, signal)
    })
  ];
}
