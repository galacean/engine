import { describeFarmingCommand, executeFarmingRequest } from "./FarmingAgentCommands";
import { type AgentApplicationDefinition, type AgentTool } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import { FarmingAPI, FARMING_API_CONTRACT, isFarmingReadOperation } from "./FarmingAPI";
import type { FarmingCommands, FarmingRequest } from "./FarmingAPIContract";
import { FARMING_API_DECLARATION } from "./FarmingAPIDeclarations";
import { FARMING_KNOWLEDGE } from "./FarmingKnowledge";

/** System-owned capabilities for the existing generic Agent. No application or Prompt changes. */
export function createFarmingAgentPackage(api: FarmingAPI): {
  definition: AgentApplicationDefinition;
  tools: AgentTool[];
} {
  const index = Object.entries(FARMING_API_CONTRACT)
    .map(([operation, description]) => `- ${operation}: ${description}`)
    .join("\n");
  const pkg: { definition: AgentApplicationDefinition; tools: AgentTool[] } = {
    definition: {
      toolNames: [],
      scriptApi: {
        catalog:
          '种植系统：先读取 farming/README.md；用 editor.component.query({type: "FarmingAreaComponent"}) 获取区域代理，通过区域方法操作。',
        documents: FARMING_KNOWLEDGE.filter((doc) => doc.path !== "farming/system-editor.md").map((doc) => ({
          path: doc.path,
          content: doc.content + (doc.path === "farming/README.md" ? `\n## API 索引\n\n${index}\n` : "")
        })),
        entries: [
          {
            name: "editor.component.query",
            description: "查询种植区域与真实目录，管理耕地，执行播种、浇水、收获、整地，读取回执和状态验证结果。",
            moduleId: "farming/FarmingAPI.d.ts"
          }
        ],
        modules: [
          {
            id: "farming/FarmingAPI.d.ts",
            source: FARMING_API_DECLARATION,
            imports: [],
            toolNames: []
          }
        ]
      }
    },
    tools: []
  };
  const execute: Omit<AgentTool, "name"> = {
    effect: "command",
    describeCommand: describeFarmingCommand,
    parseInput: (value) => value,
    execute: (input, context) => executeFarmingRequest(api, input as FarmingRequest, context.signal),
    parseOutput: (value) => toAgentValue(value)
  };
  const operations = Object.keys(FARMING_API_CONTRACT).filter((name) => name !== "list") as (keyof FarmingCommands)[];
  const methods = Object.fromEntries(
    operations.map((name) => [name === "get" ? "read" : name, `farming.component.${name}`])
  );
  pkg.definition.editorComponents = [
    { type: "FarmingAreaComponent", queryTool: "farming.component.query", identityFields: ["farmId"], methods }
  ];
  pkg.tools.push({
    name: "farming.component.query",
    effect: "read",
    parseInput: (value) => {
      const query = object(value);
      if (query.type !== "FarmingAreaComponent" || Object.keys(query).some((key) => key !== "type" && key !== "farmId"))
        throw new Error("Expected FarmingAreaComponent query with optional farmId");
      if (query.farmId !== undefined && typeof query.farmId !== "string") throw new Error("farmId must be a string");
      return query;
    },
    execute: async (input, context) => {
      const result = await api.execute({ operation: "list", input: {} }, context.signal);
      if (!result.ok) throw new Error(result.error.message);
      const query = object(input);
      return result.value
        .filter((area) => query.farmId === undefined || area.farmId === query.farmId)
        .map((area) => ({ farmId: area.farmId }));
    },
    parseOutput: toAgentValue
  });
  // The singleton system remains discoverable even when no area could initialize.
  pkg.definition.editorComponents = [
    ...pkg.definition.editorComponents,
    {
      type: "FarmingSystem",
      queryTool: "farming.system.query",
      identityFields: ["systemId"],
      methods: { getDiagnostics: "farming.system.getDiagnostics" }
    }
  ];
  pkg.tools.push(
    {
      name: "farming.system.query",
      effect: "read",
      parseInput: (value) => {
        const input = object(value);
        if (input.type !== "FarmingSystem" || Object.keys(input).length !== 1)
          throw new Error("Expected FarmingSystem query");
        return value;
      },
      execute: async () => [{ systemId: "farming" }],
      parseOutput: toAgentValue
    },
    {
      name: "farming.system.getDiagnostics",
      effect: "read",
      parseInput: (value) => {
        const envelope = object(value),
          identity = object(envelope.identity);
        if (
          identity.systemId !== "farming" ||
          Object.keys(identity).length !== 1 ||
          Object.keys(envelope).some((key) => !["identity", "input"].includes(key))
        )
          throw new Error("Invalid farming system call");
        object(envelope.input);
        return value;
      },
      execute: (value, context) =>
        execute.execute(toAgentValue({ operation: "getDiagnostics", input: object(value).input }), context),
      parseOutput: execute.parseOutput
    }
  );
  for (const operation of operations) {
    const request = (value: unknown): FarmingRequest => {
      const envelope = object(value);
      if (Object.keys(envelope).some((key) => !["identity", "input", "options"].includes(key)))
        throw new Error("Unknown component call field");
      const identity = object(envelope.identity);
      const input = object(envelope.input);
      if (Object.keys(identity).length !== 1 || typeof identity.farmId !== "string" || !identity.farmId)
        throw new Error("Invalid farm identity");
      if (Object.hasOwn(input, "farmId")) throw new Error("Cannot override bound farmId");
      return {
        operation,
        input: { ...input, farmId: identity.farmId },
        ...(envelope.options === undefined ? {} : { options: envelope.options })
      } as FarmingRequest;
    };
    pkg.tools.push({
      name: `farming.component.${operation}`,
      effect: isFarmingReadOperation(operation) ? "read" : "command",
      describeCommand: isFarmingReadOperation(operation)
        ? undefined
        : (input, result) => execute.describeCommand!(toAgentValue(request(input)), result),
      parseInput: (value) => {
        request(value);
        return value;
      },
      execute: (input, context) => execute.execute(toAgentValue(request(input)), context),
      parseOutput: execute.parseOutput
    });
  }
  pkg.definition.toolNames = pkg.tools.map((tool) => tool.name);
  pkg.definition.scriptApi.modules = pkg.definition.scriptApi.modules.map((module) => ({
    ...module,
    toolNames: pkg.definition.toolNames
  }));
  return pkg;
}

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected component argument object");
  return value as Record<string, any>;
}
