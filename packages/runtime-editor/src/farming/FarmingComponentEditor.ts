import { parseAgentSkill } from "@galacean/engine-ai-chat/ai-chat/agent-skills";
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
      skills: [parseAgentSkill(FARMING_KNOWLEDGE.find((doc) => doc.path === "skills/farming/SKILL.md")!.content)],
      documents: FARMING_KNOWLEDGE.filter(
        (doc) =>
          doc.path.startsWith("declare/editor/farming/") || doc.path === "skills/farming/references/state-and-units.md"
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
