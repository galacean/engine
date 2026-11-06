import * as z from "zod";
import type { AgentTool } from "@galacean/engine-ai-chat/ai-chat/index";
import type { SeedWorldAnimalService } from "../ports/SeedWorldAnimalService.ts";
import { defineSeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";
import { defineSeedWorldTool } from "./define-seed-world-tool.ts";

// Command identities also enter the generic ledger's UTF-8 boundary.
const encoder = new TextEncoder();
const identity = z
  .string()
  .min(1)
  .max(128)
  .regex(/^(?=[\s\S]*\S)[^\u0000-\u001f]+$/)
  .refine((value) => encoder.encode(value).length <= 128)
  .describe("非空稳定标识，不含控制字符，UTF-8 最多 128 字节。");
const text = z.string().min(1);
const target = z.strictObject({
  query: identity,
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
});
const receipt = z.object({
  id: identity,
  requestId: identity,
  skillId: identity.optional(),
  target: target.optional(),
  status: z.enum(["accepted", "running", "completed", "cancelled", "failed", "rejected", "not_found"]),
  reason: text.optional()
});

/** The executable schemas are also the source of APISearch declarations and the knowledge index. */
export const SEED_WORLD_ANIMAL_CONTRACTS = [
  defineSeedWorldApiContract({
    name: "world.animals.query",
    domain: "animals",
    effect: "read",
    description:
      "分页查询当前动物实例，包括尚未加载模型的规划身份；可按 typeId 和 visible 筛选。只读，不触发模型下载。enabled=false 表示动物系统关闭并返回空列表；loaded=false 表示不能立即执行行为。数量和分布配置仍通过 world.parameters 的 animals 组件修改。",
    inputDescription: "使用返回的真实 id、typeId；省略筛选查询全部。offset 默认 0，limit 默认 50，最大 100。",
    outputDescription:
      "当前启用状态、动物身份、米制世界位置、加载与显示状态。matchedCount 为全部匹配数，nextOffset 缺省表示读完。",
    input: z.strictObject({
      typeId: identity.optional(),
      visible: z.boolean().optional(),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(100).optional()
    }),
    output: z.object({
      enabled: z.boolean(),
      animals: z.array(
        z.object({
          id: identity,
          typeId: identity,
          label: text,
          loaded: z.boolean(),
          visible: z.boolean(),
          position: z.tuple([z.number(), z.number(), z.number()])
        })
      ),
      matchedCount: z.number().int().nonnegative(),
      offset: z.number().int().nonnegative(),
      nextOffset: z.number().int().nonnegative().optional()
    })
  }),
  defineSeedWorldApiContract({
    name: "world.animals.describe",
    domain: "animals",
    effect: "read",
    description:
      "读取一个真实动物当前可用的语义技能和目标查询参数，不加载资源。只选择返回的 skillId 与 target.query；动画列表、权重和状态切换由动物系统管理。available=false 时以 reason 判断 disabled、not_found 或 not_ready 等实际限制。",
    inputDescription: "id 来自 world.animals.query。",
    outputDescription:
      "技能名称、是否持续/自主背景、是否必须指定目标，以及宿主支持的目标查询与参数类型；不包含动画片段。",
    input: z.strictObject({ id: identity }),
    output: z.object({
      id: identity,
      available: z.boolean(),
      reason: text.optional(),
      skills: z.array(
        z.object({
          skillId: identity,
          label: text,
          repeat: z.boolean(),
          background: z.boolean(),
          requiresTarget: z.boolean()
        })
      ),
      targets: z.array(
        z.object({
          query: identity,
          label: text,
          description: text,
          parameters: z
            .array(
              z.object({
                name: identity,
                type: z.enum(["string", "number", "boolean"]),
                required: z.boolean(),
                description: text
              })
            )
            .optional()
        })
      )
    })
  }),
  defineSeedWorldApiContract({
    name: "world.animals.command",
    domain: "animals",
    effect: "command",
    description:
      "向一个已加载且可见的动物下发语义指令。先读取 describe，使用注册的技能和目标查询；闲置表示自主闲逛，动画选择由行为树决定。显式指令立即替换旧指令，无冷却。相同 requestId 和内容为幂等重试，新的明确指令使用新 requestId。系统关闭、未加载、隐藏、未知目标或不支持的技能必须拒绝，不会为命令强制加载资源。本指令独立于世界参数编辑事务执行，不会随编辑回滚或 editor.history.undo 撤销。",
    inputDescription:
      "真实动物 id、稳定 requestId、发现的 skillId，以及该技能需要的 target。目标参数只使用 describe 中的声明；不得传动画名、权重或行为树节点。",
    outputDescription:
      "真实运行时回执。accepted/running 只表示接受/进行中，不能声称已到达或完成；使用 receipt 查询后续状态。rejected/failed 以 reason 为准。",
    input: z.strictObject({ id: identity, requestId: identity, skillId: identity, target: target.optional() }),
    output: receipt
  }),
  defineSeedWorldApiContract({
    name: "world.animals.receipt",
    domain: "animals",
    effect: "read",
    description:
      "只读查询该动物 requestId 的最新语义指令状态，不重新执行指令、不加载资源。not_found 表示该身份或回执当前不存在，不能推断执行成功；系统关闭或实例重建后旧回执可能不可用。",
    inputDescription: "沿用原命令的 id 和 requestId；重试查询不产生新的行为。",
    outputDescription:
      "accepted、running、completed、cancelled、failed、rejected 或 not_found 及原因；completed 才代表该指令目标完成，自主背景切换完成不意味着动物静止。",
    input: z.strictObject({ id: identity, requestId: identity }),
    output: receipt
  }),
  defineSeedWorldApiContract({
    name: "world.animals.catalog",
    domain: "animals",
    effect: "read",
    description:
      "分页搜索可召唤的动物素材目录，包括默认不展示的备选动物；按中文或英文名称/别名搜索。系统关闭时也可查询，不下载模型或启动模拟。需要新增动物时先选目录中的 typeId 和可选 appearanceId，再调用 spawn；URL 由运行时从配置解析，不允许传入任意 URL。",
    inputDescription:
      "search 是名称/别名片段；pack 可限定 cute-zoo 或 low-poly-100。offset 默认 0，limit 默认 50，最大 100。",
    outputDescription: "匹配总数、分页、种类/外观身份、资源 URL 和物种分组 speciesId。目录存在不代表场景已经有该动物。",
    input: z.strictObject({
      search: z.string().min(1).optional(),
      pack: z.enum(["cute-zoo", "low-poly-100"]).optional(),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(100).optional()
    }),
    output: z.object({
      entries: z.array(
        z.object({
          typeId: identity,
          label: text,
          aliases: z.array(text),
          pack: z.enum(["cute-zoo", "low-poly-100"]),
          speciesId: identity,
          modelUrl: z.url(),
          appearances: z.array(z.object({ id: identity, label: text, modelUrl: z.url() }))
        })
      ),
      matchedCount: z.number().int().nonnegative(),
      offset: z.number().int().nonnegative(),
      nextOffset: z.number().int().nonnegative().optional()
    })
  }),
  defineSeedWorldApiContract({
    name: "world.animals.spawn",
    domain: "animals",
    effect: "command",
    description:
      "在当前世界新增并持久保存一只已注册动物，不重建已有动物，也不修改初始化数量。先查 catalog 选择 typeId；不指定 appearanceId 时沿用初始化外观权重，默认等权。省略 position 则在观察者附近 12 米内找落点，必须位于固定世界出生区域且避开水体、实体和其他动物；采样失败如实拒绝。关闭或尚未就绪时拒绝。新增身份按激活距离进入异步加载队列并自主闲逛。相同 requestId 和参数幂等，换参数须用新 ID。新增身份、出生位置和外观保存到项目 DB，刷新和重建恢复，不保存自主移动的每帧状态；不随 editor.history.undo 撤销。初始化数量范围不限制新增。保存失败返回 rejected，不新增动物。",
    inputDescription:
      "稳定 requestId、目录返回的 typeId、可选 appearanceId 和米制水平 position。不得传 URL、动画片段或权重。",
    outputDescription:
      "accepted 表示落点和身份已持久保存，并非模型加载完成；返回 id 可用 query/describe 观察加载状态，再下发语义指令。rejected 以 reason 为准。",
    input: z.strictObject({
      requestId: identity,
      typeId: identity,
      appearanceId: identity.optional(),
      position: z.strictObject({ x: z.number(), z: z.number() }).optional()
    }),
    output: z.object({
      requestId: identity,
      status: z.enum(["accepted", "rejected"]),
      id: identity.optional(),
      typeId: identity.optional(),
      appearanceId: identity.optional(),
      reason: text.optional()
    })
  })
] as const;

/** Bind the host's live service without importing its simulation or asset registration. */
export function createSeedWorldAnimalTools(service?: SeedWorldAnimalService): readonly AgentTool[] {
  if (!service) return [];
  const [query, describe, command, readReceipt, catalog, spawn] = SEED_WORLD_ANIMAL_CONTRACTS;
  return [
    defineSeedWorldTool(query, {
      execute: (input, { signal }) => {
        signal.throwIfAborted();
        return service.query(input);
      }
    }),
    defineSeedWorldTool(describe, {
      execute: (input, { signal }) => {
        signal.throwIfAborted();
        return service.describe(input);
      }
    }),
    {
      ...defineSeedWorldTool(command, {
        execute: (input, { signal }) => {
          signal.throwIfAborted();
          return service.command(input);
        }
      }),
      describeCommand: (input) => {
        const request = command.input.parse(input);
        return { scopeId: request.id, commandId: request.requestId };
      }
    },
    defineSeedWorldTool(readReceipt, {
      execute: (input, { signal }) => {
        signal.throwIfAborted();
        return service.receipt(input);
      }
    }),
    defineSeedWorldTool(catalog, {
      execute: (input, { signal }) => {
        signal.throwIfAborted();
        return service.catalog(input);
      }
    }),
    {
      ...defineSeedWorldTool(spawn, {
        execute: (input, { signal }) => {
          signal.throwIfAborted();
          return service.spawn(input);
        }
      }),
      describeCommand: (input) => {
        const request = spawn.input.parse(input);
        return { scopeId: "animal-population", commandId: request.requestId };
      }
    }
  ];
}
