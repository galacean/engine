import { validateAgentScriptReferences } from "./agent-script-preflight";
import { AgentJavaScriptChecker } from "./agent-script-checker";
import { agentTypecheckLibraries } from "../script-checking/typecheck-libraries";
import type { AgentCheckRequest } from "./agent-worker-checker";

const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
globalThis.onmessage = ({ data }: MessageEvent<AgentCheckRequest>) => {
  try {
    if (data.toolNames !== undefined) {
      globalThis.postMessage({ id: data.id, error: validateAgentScriptReferences(data.source, data.toolNames) });
      return;
    }
    globalThis.postMessage({ id: data.id, error: checker.check(data.source, data.declarations) });
  } catch (error) {
    globalThis.postMessage({
      id: data.id,
      error: {
        code: "SCRIPT_CHECK_UNAVAILABLE",
        phase: "check",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
};
