import type { Component, Entity } from "@galacean/engine";
import * as z from "zod";
import type { AgentEditorExtension } from "@galacean/engine-ai-chat/ai-chat/agent-extensions";
import {
  defineTool,
  type AgentScriptApiCatalog,
  type AgentToolExecutionContext,
  type AgentTool
} from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import type {
  RuntimeComponentIdentity,
  RuntimeComponentSelector
} from "../runtime-editor/scene/runtime-component-identity";

export interface RuntimeComponentPort {
  queryComponents(selector?: RuntimeComponentSelector): RuntimeComponentIdentity[];
  resolveComponent(identity: RuntimeComponentIdentity): Component;
}
export interface RuntimeComponentMethod<T extends Component> {
  readonly effect: "read" | "command";
  readonly input: z.ZodType;
  readonly output: z.ZodType;
  readonly options?: z.ZodType;
  readonly describeCommand?: AgentTool["describeCommand"];
  /** Executes on the Engine thread, after identity and input validation. */
  execute(
    component: T,
    input: unknown,
    context: AgentToolExecutionContext,
    options?: unknown
  ): unknown | Promise<unknown>;
}

/** A native system registers its own behavior; the shared dispatcher knows no system names. */
export function createRuntimeComponentExtension<T extends Component>(
  port: RuntimeComponentPort,
  descriptor: {
    readonly type: string;
    readonly componentClass: new (entity: Entity) => T;
    readonly methods: Readonly<Record<string, RuntimeComponentMethod<T>>>;
    readonly scriptApi: AgentScriptApiCatalog;
  }
): AgentEditorExtension {
  const type = descriptor.type;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(type)) throw new Error(`Invalid component type: ${type}`);
  const identity = z
    .object({ scene: z.string().min(1), entityId: z.string().min(1), id: z.string().min(1), type: z.literal(type) })
    .strict();
  const queryName = `editorComponents.${type}.query`;
  const tools = [
    defineTool({
      name: queryName,
      effect: "read",
      input: z
        .object({
          type: z.literal(type),
          scene: z.string().min(1).optional(),
          entityId: z.string().min(1).optional(),
          id: z.string().min(1).optional()
        })
        .strict(),
      output: z.array(identity),
      execute: (query, context) => {
        context.signal.throwIfAborted();
        return port.queryComponents(query).filter((ref) => query.scene === undefined || query.scene === ref.scene);
      }
    })
  ];
  const methods: Record<string, string> = {};
  for (const [name, method] of Object.entries(descriptor.methods)) {
    if (
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(name) ||
      ["then", "constructor", "prototype", "__proto__", "scene", "entityId", "id", "type"].includes(name)
    )
      throw new Error(`Invalid component method: ${name}`);
    const toolName = `editorComponents.${type}.methods.${name}`;
    methods[name] = toolName;
    tools.push(
      defineTool({
        name: toolName,
        effect: method.effect,
        describeCommand: method.describeCommand,
        input: z
          .object({ identity, input: method.input, ...(method.options ? { options: method.options.optional() } : {}) })
          .strict(),
        output: method.output,
        execute: (envelope, context) => {
          context.signal.throwIfAborted();
          // A proxy survives replacement, but must never retain an old Engine instance.
          const component = port.resolveComponent(envelope.identity);
          if (component.destroyed || !(component instanceof descriptor.componentClass))
            throw new Error(`Unavailable component implementation: ${envelope.identity.id}`);
          return method.execute(component, envelope.input, context, (envelope as { options?: unknown }).options);
        }
      })
    );
  }
  // Normal Tool output validation plus the same bounded JSON boundary as every other extension.
  const boundedTools = tools.map((tool) => ({
    ...tool,
    parseOutput: (value: unknown) => toAgentValue(tool.parseOutput(value))
  }));
  return {
    tools: boundedTools,
    definition: {
      toolNames: tools.map((tool) => tool.name),
      scriptApi: {
        ...descriptor.scriptApi,
        modules: descriptor.scriptApi.modules.map((module) => ({
          ...module,
          ...(descriptor.scriptApi.entries.some((entry) => entry.moduleId === module.id)
            ? { toolNames: tools.map((tool) => tool.name) }
            : {})
        }))
      },
      editorComponents: [{ type, queryTool: queryName, identityFields: ["scene", "entityId", "id", "type"], methods }]
    }
  };
}
