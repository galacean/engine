import { z } from "zod";
import {
  createRuntimeComponentExtension,
  type RuntimeComponentMethod,
  type RuntimeComponentPort
} from "../runtime-editor-agent/runtime-component-extension";
import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import { FarmingSystem } from "@galacean/engine-farming/farming/native/FarmingSystem";
import { FarmingAPI } from "@galacean/engine-farming/farming/native/FarmingAPI";
import {
  farmingOperations,
  type FarmingCommands,
  type FarmingRequest
} from "@galacean/engine-farming/farming/native/FarmingAPIContract";
import {
  describeFarmingCommand,
  executeFarmingRequest
} from "@galacean/engine-farming/farming/native/FarmingAgentCommands";
import { FARMING_SYSTEM_EDITOR_DECLARATION } from "@galacean/engine-farming/farming/native/FarmingAPIDeclarations";
import { FARMING_KNOWLEDGE } from "@galacean/engine-farming/farming/native/FarmingKnowledge";

/** Editor behavior belongs to the actual Scene component; regions remain domain objects. */
export function createFarmingComponentExtension(port: RuntimeComponentPort) {
  const methods: Record<string, RuntimeComponentMethod<FarmingSystem>> = {};
  for (const operation of Object.keys(farmingOperations) as (keyof FarmingCommands)[]) {
    const contract = farmingOperations[operation];
    const read = contract.effect === "read";
    methods[operation] = {
      effect: contract.effect,
      input: contract.input,
      output: z.object({ ok: z.literal(true), value: z.unknown(), context: z.unknown().optional() }).strict(),
      ...("options" in contract ? { options: contract.options } : {}),
      describeCommand: read
        ? undefined
        : (envelope, result) => {
            const { input, options } = envelope as unknown as { input: unknown; options?: unknown };
            return describeFarmingCommand(
              toAgentValue({ operation, input, ...(options === undefined ? {} : { options }) }),
              result
            );
          },
      execute: (system, input, context, options) =>
        executeFarmingRequest(
          new FarmingAPI(system),
          {
            operation,
            input,
            ...(options === undefined ? {} : { options })
          } as FarmingRequest,
          context.signal
        )
    };
  }
  return createRuntimeComponentExtension(port, {
    type: "FarmingSystem",
    componentClass: FarmingSystem,
    methods,
    scriptApi: {
      catalog:
        "农场：先读 [使用说明](editor/farming/system-editor.md)，再从 [方法索引](editor/farming/methods/README.md) 读取本次所需方法的完整输入、输出与类型。总 [Editor 声明](editor/farming/FarmingSystem.d.ts) 仅作完整参考，分页读取未结束时不能据此猜字段。查询 FarmingSystem 场景组件；list 查询区域，按 farmId 操作地块、作物、土壤和库存。",
      documents: FARMING_KNOWLEDGE.filter(
        (doc) =>
          doc.path.startsWith("farming/methods/") ||
          ["farming/system-editor.md", "farming/state-and-units.md"].includes(doc.path)
      ),
      entries: [
        {
          name: "editor.component.query",
          description:
            "查询 FarmingSystem 组件，发现农场、播种、浇水、收获、管理道具、持久篮子、耕地与容器、诊断并验证命令。",
          moduleId: "farming/FarmingSystem.d.ts"
        }
      ],
      modules: [
        { id: "farming/FarmingSystem.d.ts", imports: [], source: FARMING_SYSTEM_EDITOR_DECLARATION, toolNames: [] }
      ]
    }
  });
}
