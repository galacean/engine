import { analyzeAgentScript } from "./agent-script-syntax";
import type { AgentScriptError } from "./agent-types";

/** Preserve preflight error priority; syntax/type errors are checked next. */
export function validateAgentScriptReferences(
  source: string,
  toolNames: readonly string[]
): AgentScriptError | undefined {
  const knownTools = new Set(toolNames);
  const unknown = analyzeAgentScript(source).references.filter((name) => !knownTools.has(name));
  if (unknown.length)
    return {
      code: "UNKNOWN_TOOL",
      phase: "parse",
      message: `Agent Script 引用了未注册的 API：${unknown.join(", ")}；脚本尚未执行`,
      tool: unknown[0]
    };
}
