import * as z from "zod";

import { SEED_WORLD_FRONT_RELATION_DISTANCE_METRES } from "../SeedWorldSpatialSemantics.ts";
import { worldRefSchema } from "./tool-contract.ts";

export const viewerAnchorDescription = "当前指令提交时的玩家位置和朝向；同一指令内跨 execute 保持不变，传送或玩家移动不会更新此参照点。消费新的补充指令时更新。实时位置请调用 tools.spatial.viewer()；没有活动指令时使用实时位置";

export const kernelSpatialAnchorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("viewer").describe(viewerAnchorDescription) }),
  z.strictObject({
    kind: z.literal("world-ref"),
    ref: worldRefSchema.describe("world.query 或修改 API 返回的稳定世界引用")
  }),
  z.strictObject({
    kind: z.literal("selection"),
    selectionId: z.string().trim().min(1).max(160).describe("world.query 返回或命名保存的选择标识")
  }),
  z.strictObject({
    kind: z.literal("position"),
    x: z.number().describe("明确世界 x 坐标"),
    y: z.number().optional().describe("明确世界 y 坐标；省略时由 placement 解析"),
    z: z.number().describe("明确世界 z 坐标")
  })
]).describe("空间关系所参照的世界锚点");

export const kernelSpatialRelationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("at").describe("位于锚点本身") }),
  z.strictObject({
    kind: z.literal("front").describe("位于锚点水平朝向正前方"),
    distanceMetres: z
      .number()
      .min(0.5)
      .max(5_000)
      .optional()
      .describe(
        `正前方的精确水平距离，单位为米；用户只说“面前”或“前方”时必须省略并使用默认 ${SEED_WORLD_FRONT_RELATION_DISTANCE_METRES} 米，用户明确距离时必须原样填写`
      )
  }),
  z.strictObject({
    kind: z.enum(["behind", "left", "right"]),
    distanceMetres: z
      .number()
      .min(0.5)
      .max(5_000)
      .describe("与锚点的距离，单位为米")
  }),
  z.strictObject({ kind: z.literal("near"), preferredDistanceMetres: z.number().min(0.5).max(5_000).describe("期望距离，单位为米") }),
  z.strictObject({ kind: z.literal("around"), radiusMetres: z.number().min(0.5).max(2_000).describe("圆形区域半径，单位为米") }),
  z.strictObject({
    kind: z.literal("offset"),
    forwardMetres: z
      .number()
      .min(-5_000)
      .max(5_000)
      .describe("锚点局部前后偏移，负值向后；普通‘面前’关系应使用 front"),
    rightMetres: z.number().min(-5_000).max(5_000).describe("锚点局部左右偏移，负值向左"),
    upMetres: z.number().min(-1_000).max(1_000).optional().describe("上下偏移，负值向下")
  })
]).describe("相对于锚点的空间关系");

export const spatialTargetSchema = z
  .strictObject({
    anchor: kernelSpatialAnchorSchema.describe("空间关系的参照物"),
    frame: z.enum(["world", "anchor-local"]).optional()
      .describe(
        "关系向量使用的坐标系；anchor-local 跟随锚点朝向，world 使用世界轴；省略时为 anchor-local。front 始终使用锚点的水平方向，不受 frame 覆盖"
      ),
    origin: z
      .enum(["feet", "eyes", "center", "surface", "bounds-nearest", "bounds-center"])
      .optional()
      .describe("默认 surface；对象通常使用 center 或 bounds-nearest"),
    relation: kernelSpatialRelationSchema.describe("目标相对于锚点的位置关系"),
    placement: z
      .strictObject({
        snapTo: z.enum(["terrain", "water-surface", "none"])
          .describe("高度贴合规则：terrain 贴地、water-surface 贴水面、none 保留锚点高度"),
        collision: z.enum(["avoid", "allow"]).optional()
          .describe("对象碰撞规则；avoid 避开已有对象，allow 允许重叠；省略时由调用方使用安全默认值"),
        maxSlope: z.number().min(0).max(90).optional().describe("允许的最大地表坡度，单位为度；省略时不限制坡度"),
        avoidWater: z.boolean().optional().describe("true 要求目标避开水域；省略或 false 时不施加避水约束"),
        requireWater: z.boolean().optional().describe("true 要求目标位于实时真实水域；省略或 false 时不要求水域")
      })
      .optional()
      .describe("贴地、贴水、碰撞、坡度和水域约束；省略时默认贴合地形")
  })
  .describe(
    "所有导航与地景能力共享的空间语言；地景 Tool 只能读取 viewer Pose。贴地、避障、避水等 placement 必须写在 target.placement，不能放在 Tool 顶层"
  );
