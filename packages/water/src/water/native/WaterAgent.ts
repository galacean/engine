import type { AgentApplicationDefinition, AgentTool, AgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { AgentToolExecutionError } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { WaterAPI, WATER_API_CONTRACT, WATER_KNOWLEDGE, type WaterCommand } from "./WaterAPI";
import { WATER_API_DECLARATION } from "./WaterAPIDeclarations";

/** System-owned package consumed by the existing AgentLoop. No application Prompt or Agent changes. */
export function createWaterAgentPackage(api: WaterAPI): { definition: AgentApplicationDefinition; tools: AgentTool[] } {
  return {
    definition: {
      toolNames: ["water.execute"],
      scriptApi: {
        catalog: "水系统：先读取 water/README.md 和 water.execute，再调用 tools.water.execute。",
        documents: [{ path: "water/README.md", content: JSON.stringify(WATER_KNOWLEDGE, null, 2) }],
        entries: [
          {
            name: "water.execute",
            description: Object.entries(WATER_API_CONTRACT)
              .map(([key, description]) => `${key}: ${description}`)
              .join("\n"),
            moduleId: "water/WaterAPI.d.ts"
          }
        ],
        modules: [
          { id: "water/WaterAPI.d.ts", source: WATER_API_DECLARATION, imports: [], toolNames: ["water.execute"] }
        ]
      }
    },
    tools: [
      {
        name: "water.execute",
        // API owns input validation; it returns recognizable domain errors instead of coercing fields here.
        parseInput: (value) => value,
        execute: async (input, context) => {
          // Agent tools must distinguish a failed operation from a successful tool value.
          const result = await api.execute(input as WaterCommand, context.signal);
          if (!result.ok) {
            throw new AgentToolExecutionError({
              code: result.error.code,
              message: result.error.message,
              executed: false,
              retryable: false,
              details: { revision: result.revision }
            });
          }
          return result as unknown as AgentValue;
        },
        parseOutput: (value) => value
      }
    ]
  };
}
