import * as z from "zod";
import type { SeedWorldAgentApplication } from "../SeedWorldAgentApplication.ts";
import { defineSeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";
import { defineSeedWorldTool } from "./define-seed-world-tool.ts";
import { runtimePickIdentitySchema } from "@galacean/engine-runtime-editor/runtime-inspection/runtime-inspection-contracts";

const point = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
const region = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("polygon"), points: z.array(point).min(3).max(4096) }),
  z.strictObject({
    kind: z.literal("stroke"),
    points: z.array(point).min(1).max(4096),
    radius: z.number().positive().finite()
  })
]);
const hit = z.object({ ref: runtimePickIdentitySchema });
const common = {
  domain: "world" as const,
  effect: "read" as const,
  inputDescription:
    "snapshotId 来自 observe_view 的 metadata.snapshotId 或本轮截图附件；imageId 用于 read_image，不能替代 snapshotId；原生 pointer 返回作者身份，world.view 返回运行时身份，不能互换；坐标是返回图片的像素，原点左上，x 向右、y 向下，与 CSS/画布像素不同。只查询这张快照，不查询当前视角。",
  outputDescription:
    "冻结的可见表面证据。currentScene=false 表示世界作者状态已改变，修改前须重新观察/核对目标。已释放的本会话快照报 SNAPSHOT_EXPIRED；未知 ID、imageId 或另一页面的快照报 SNAPSHOT_UNKNOWN，不能把旧坐标用于新图。未命中不证明空间为空，可能是天空或未注册的表面。"
};
export const SEED_WORLD_VIEW_CONTRACTS = [
  defineSeedWorldApiContract({
    ...common,
    name: "world.view.hitPoints",
    description:
      "根据截图、自由标记和文字判断目标位置，用 pointers 批量查询同一截图的可见运行时身份，保持输入顺序。返回 entityId/componentId，可直接用 runtime.entity.inspect/runtime.component.query 查询当前节点关系和组件，再按组件公开契约操作。instanceIndex 是该次绘制内索引，不能当作 Entity ID；instanceKey 如存在由绘制生产方提供，是不透明身份，公共层不推断其业务含义或编辑路径。自由笔迹不是闭合选区；查询原始身份图，不拾取当前场景。对象移动后身份不变；销毁后不得把旧指令施加于新对象。",
    input: z.strictObject({ snapshotId: z.string().min(1), pointers: z.array(point).min(1).max(256) }),
    output: z.object({
      snapshotId: z.string(),
      currentScene: z.boolean(),
      hits: z.array(
        z.object({
          status: z.enum(["hit", "no-registered-hit", "outside-image"]),
          hit: hit.nullable()
        })
      )
    })
  }),
  defineSeedWorldApiContract({
    ...common,
    name: "world.view.queryRegion",
    description:
      "查询截图多边形或涂抹轨迹内所有已注册可见候选，按可见像素数排序、分页。多边形采用奇偶填充；笔刷 radius 使用图片像素。先确定遮挡再按 componentType 过滤。命中只证明这些像素来自该运行时绘制对象，不代表父节点、整批实例或共享资源都应修改。结合原选区与用户文字确认范围。未覆盖的局部编辑能力不能用全局修改冒充。",
    input: z.strictObject({
      snapshotId: z.string().min(1),
      region,
      filter: z.strictObject({ componentTypes: z.array(z.string()).optional() }).optional(),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(100).optional()
    }),
    output: z.object({
      snapshotId: z.string(),
      currentScene: z.boolean(),
      items: z.array(hit.extend({ visiblePixels: z.number().int() })),
      matchedCount: z.number().int(),
      selectedPixels: z.number().int(),
      unregisteredPixels: z.number().int(),
      complete: z.boolean(),
      nextOffset: z.number().int().optional()
    })
  })
] as const;

export function createSeedWorldViewTools(application: SeedWorldAgentApplication) {
  return [
    defineSeedWorldTool(SEED_WORLD_VIEW_CONTRACTS[0], {
      execute: (input) => application.requireViewSnapshots().hitPoints(input.snapshotId, input.pointers)
    }),
    defineSeedWorldTool(SEED_WORLD_VIEW_CONTRACTS[1], {
      execute: (input) =>
        application
          .requireViewSnapshots()
          .queryRegion(input.snapshotId, input.region, input.filter, input.offset, input.limit)
    })
  ];
}
