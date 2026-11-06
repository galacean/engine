import { MAX_SCRIPT_OUTPUT_BYTES } from "./agent-values";
import type { AgentConsoleEntry, AgentExecutionReceipt, AgentScriptResult, AgentToolResult } from "./agent-types";
import { READ_MAX_LINE_LENGTH } from "./vendor/deepseek-read/read-window";

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2)).byteLength;

/** Native file steps share the same result/receipt projection in execution records and Session snapshots. */
export function fileToolStepResult(outcome: {
  result: AgentToolResult;
  receipt?: AgentExecutionReceipt;
}): AgentScriptResult {
  return outcome.result.ok
    ? { ok: true, output: outcome.result.value, receipt: outcome.receipt }
    : {
        ok: false,
        error: { code: outcome.result.error.code, message: outcome.result.error.message, phase: "tool" },
        receipt: outcome.receipt
      };
}

/** Generated artifacts must remain losslessly readable through line-only read windows. */
function readableOutput(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  if (text.split("\n").every((line) => line.length <= READ_MAX_LINE_LENGTH)) return text;
  const chunks: string[] = [];
  // Even worst-case JSON escaping (six chars per code unit) fits the read line cap.
  const chunkSize = Math.floor((READ_MAX_LINE_LENGTH - 16) / 6);
  for (let start = 0; start < text.length; ) {
    let end = Math.min(start + chunkSize, text.length);
    if (/[\uD800-\uDBFF]/.test(text.charAt(end - 1)) && /[\uDC00-\uDFFF]/.test(text.charAt(end))) end--;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return JSON.stringify(
    {
      format: "chunked-json",
      instructions: "Read all pages, concatenate chunks in order, then parse as JSON to recover the complete output.",
      chunks
    },
    null,
    2
  );
}

/** Presentation never changes success, error diagnostics or transaction receipts. */
export function presentScriptOutput(result: AgentScriptResult, save: (content: string) => string): AgentScriptResult {
  const display = {
    console: result.console ?? [],
    ...(result.ok ? { returnValue: result.output, returnValuePresent: result.returnValuePresent ?? true } : {})
  };
  if (bytes(display) <= MAX_SCRIPT_OUTPUT_BYTES) return result;

  let path: string | undefined;
  let storageError: string | undefined;
  try {
    path = save(readableOutput(display));
  } catch (error) {
    storageError = error instanceof Error ? error.message : String(error);
  }
  const notice: AgentConsoleEntry = {
    level: "info",
    args: [
      path
        ? `Output exceeds the display budget. Complete Console and Return: ${path}. Read it with the read tool.`
        : `Output exceeds the display budget; full output could not be saved: ${storageError}. Execution status and receipt are unchanged.`
    ]
  };
  const console: AgentConsoleEntry[] = [];
  for (const entry of display.console) {
    if (bytes({ console: [...console, entry, notice] }) > MAX_SCRIPT_OUTPUT_BYTES / 2) break;
    console.push(entry);
  }
  console.push(notice);
  const metadata = { console, ...(path ? { outputFile: path } : {}) };
  if (!result.ok) return { ...result, ...metadata };
  return {
    ...result,
    ...metadata,
    output:
      bytes({ returnValue: result.output }) < MAX_SCRIPT_OUTPUT_BYTES / 2
        ? result.output
        : { truncated: true, ...(path ? { path, section: "returnValue" } : { reason: storageError! }) }
  };
}
