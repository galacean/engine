import { expect, it, vi } from "vitest";
import { presentScriptOutput } from "../src/ai-chat/agent-output";
import type { AgentScriptResult } from "../src/ai-chat/agent-types";

it.each([false, true])("preserves explicitly repeated Console and Return data (stringified=%s)", stringified => {
  const output = { rows: Array.from({ length: 100 }, (_, id) => ({ id, name: "unique-record-marker" })) };
  const log = stringified ? JSON.stringify(output, null, 2) : output;
  const original: AgentScriptResult = { ok: true, output, returnValuePresent: true,
    console: [{ level: "log", args: ["query", log] }], receipt: { executionId: "one", status: "completed" } };
  const save = vi.fn(() => ".ai/outputs/one.json");
  const result = presentScriptOutput(original, save);
  expect(result).toEqual(original);
  expect(save).not.toHaveBeenCalled();
  expect(JSON.stringify(result).match(/unique-record-marker/g)).toHaveLength(200);
});

it("keeps nonduplicate data and preserves log level, ordering and original trace contents", () => {
  const data = { text: "x".repeat(400) };
  const original: AgentScriptResult = { ok: true, output: { text: "different" },
    console: [{ level: "warn", args: [data] }, { level: "error", args: ["again", data] }] };
  expect(presentScriptOutput(original, vi.fn()).console).toEqual(original.console);
});

it("retains full Console and Return in the artifact when display output is truncated", () => {
  const output = { text: "x".repeat(80000) };
  const original: AgentScriptResult = { ok: true, output, console: [{ level: "log", args: [output] }],
    receipt: { executionId: "committed", status: "committed", transactionId: "tx" } };
  const save = vi.fn((_content: string) => ".ai/outputs/large.json");
  const result = presentScriptOutput(original, save);
  expect(result).toMatchObject({ ok: true, receipt: original.receipt, outputFile: ".ai/outputs/large.json" });
  const stored = JSON.parse(save.mock.calls[0][0]);
  const full = stored.format === "chunked-json" ? JSON.parse(stored.chunks.join("")) : stored;
  expect(full).toMatchObject({ returnValue: output, console: original.console });
});

it("retains errors, receipts and original logs when a script fails after logging", () => {
  const data = "same diagnostic ".repeat(50);
  const original: AgentScriptResult = { ok: false, error: { code: "SCRIPT_RUNTIME_ERROR", phase: "execution", message: "failed" },
    console: [{ level: "warn", args: [data, data] }], receipt: { executionId: "one", status: "aborted" } };
  const result = presentScriptOutput(original, vi.fn());
  expect(result).toEqual(original);
});
