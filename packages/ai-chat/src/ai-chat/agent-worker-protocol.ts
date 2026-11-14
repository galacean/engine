import type { AgentEditorComponentBinding } from "./agent-editor-facade";
import type {
  AgentConsoleEntry,
  AgentScriptResult,
  AgentScriptToolBinding,
  AgentScriptTrace,
  AgentToolResult,
  AgentValue
} from "./agent-types";

export type AgentWorkerRequest =
  | {
      type: "execute";
      id: string;
      source: string;
      editorComponents?: readonly AgentEditorComponentBinding[];
      tools: Pick<AgentScriptToolBinding, "name" | "effect">[];
      maxToolCalls: number;
      timeoutMs: number;
    }
  | { type: "tool_result"; requestId: number; result: AgentToolResult };

export type AgentWorkerResponse =
  | { type: "tool"; requestId: number; call?: number; name: string; input: AgentValue }
  | { type: "log"; line: string; entry: AgentConsoleEntry }
  | { type: "complete"; result: AgentScriptResult; trace: AgentScriptTrace };
