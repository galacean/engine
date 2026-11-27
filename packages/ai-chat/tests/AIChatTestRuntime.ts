import { AgentLoop } from "../src/ai-chat/agent-loop";
import { JavaScriptAgentScriptRuntime } from "../src/ai-chat/agent-script-runtime";
import type { AgentLoopOptions } from "../src/ai-chat/agent-types";

/**
 * These suites exercise model orchestration, transcripts and UI in Node.
 * Browser isolation, actual TypeScript declarations and atomic editor data are
 * covered by tests/runtime-editor; fake tool callbacks here are just spies.
 */
export function createTestAgentLoop(options: AgentLoopOptions): AgentLoop {
  const configurations = new WeakMap<AgentLoopOptions["definition"], {tools: AgentLoopOptions["tools"]; definition: AgentLoopOptions["definition"]}>();
  const configure = (configuration: Pick<AgentLoopOptions, "definition" | "tools">) => {
    const previous = configurations.get(configuration.definition);
    if (previous?.tools === configuration.tools) return previous;
    const prepared = { tools: configuration.tools, definition: {
      ...configuration.definition,
      beginEdit: configuration.definition.beginEdit ?? ((id: string) => {
        let changed = false;
        return {
          tools: configuration.tools.map(tool => ({...tool, execute: async (input: unknown, context: Parameters<typeof tool.execute>[1]) => {
            const result = await tool.execute(input, context);
            if (tool.effect === undefined || tool.effect === "edit") changed = true;
            return result;
          }})),
          hasChanges: () => changed, prepare() {}, discard() {},
          commit: () => ({ transactionId: id })
        };
      })
    } };
    configurations.set(configuration.definition, prepared);
    return prepared;
  };
  return new AgentLoop({
    ...options,
    ...configure(options),
    getConfiguration: options.getConfiguration ? () => configure(options.getConfiguration!()) : undefined,
    scriptRuntime: options.scriptRuntime ?? new JavaScriptAgentScriptRuntime(),
    scriptChecker: options.scriptChecker ?? { check: async () => undefined }
  });
}
