import type { AgentTool } from "./agent-types";

export class ToolRegistry {
  readonly #tools = new Map<string, AgentTool>();

  constructor(tools: readonly AgentTool[]) {
    for (const tool of tools) {
      const name = tool.name.trim();
      if (!name) {
        throw new Error("Tool name cannot be empty");
      }
      if (this.#tools.has(name)) {
        throw new Error(`Duplicate tool: ${name}`);
      }
      this.#tools.set(name, tool);
    }
  }

  get(name: string): AgentTool | undefined {
    return this.#tools.get(name);
  }

  require(name: string): AgentTool {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool;
  }

  select(names: readonly string[]): AgentTool[] {
    return names.map((name) => this.require(name));
  }
}
