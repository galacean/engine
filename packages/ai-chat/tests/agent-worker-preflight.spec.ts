import { afterEach, expect, it, vi } from "vitest";
import { WorkerAgentScriptChecker, type AgentCheckRequest } from "../src/ai-chat/agent-worker-checker";
import { validateAgentScriptReferences } from "../src/ai-chat/agent-script-preflight";
import { createTestAgentLoop } from "./AIChatTestRuntime";
vi.mock("../src/ai-chat/asap-chat", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat } from "../src/ai-chat/asap-chat";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function worker() {
  return {
    onmessage: undefined as any,
    onerror: undefined as any,
    onmessageerror: undefined as any,
    postMessage: vi.fn<(request: AgentCheckRequest) => void>(),
    terminate: vi.fn()
  };
}
it("reuses one Worker across preflight and type checks and rejects stale responses", async () => {
  const w = worker(),
    create = vi.fn(() => w as unknown as Worker),
    checker = new WorkerAgentScriptChecker(create);
  const signal = new AbortController().signal;
  const preflight = checker.preflight("await tools.time.update({});", ["time.update"], signal);
  const first = w.postMessage.mock.calls[0][0];
  expect(first.toolNames).toEqual(["time.update"]);
  w.onmessage({ data: { id: first.id } });
  expect(await preflight).toBeUndefined();
  const check = checker.check(first.source, [{ id: "tools.d.ts", source: "declare const tools: {};" }], signal);
  const second = w.postMessage.mock.calls[1][0];
  expect(second.toolNames).toBeUndefined();
  let settled = false;
  void check.then(() => {
    settled = true;
  });
  w.onmessage({ data: { id: first.id, error: { code: "stale" } } });
  await Promise.resolve();
  expect(settled).toBe(false);
  w.onmessage({
    data: { id: second.id, error: { code: "SCRIPT_CHECK_FAILED", phase: "check", message: "type error" } }
  });
  expect(await check).toMatchObject({ code: "SCRIPT_CHECK_FAILED" });
  expect(create).toHaveBeenCalledOnce();
  checker.dispose();
});
it.each(["abort", "timeout", "dispose"] as const)(
  "terminates pending preflight on %s and can retry with a fresh Worker",
  async (reason) => {
    vi.useFakeTimers();
    const workers: ReturnType<typeof worker>[] = [];
    const checker = new WorkerAgentScriptChecker(() => {
      const w = worker();
      workers.push(w);
      return w as unknown as Worker;
    });
    const controller = new AbortController();
    const pending = checker.preflight("return 1;", [], controller.signal);
    if (reason === "abort") controller.abort();
    else if (reason === "dispose") checker.dispose();
    else await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toMatchObject({
      code: reason === "timeout" ? "SCRIPT_CHECK_UNAVAILABLE" : "SCRIPT_CANCELLED"
    });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const retry = checker.preflight("return 1;", [], new AbortController().signal);
    workers[1].onmessage({ data: { id: workers[1].postMessage.mock.calls[0][0].id } });
    expect(await retry).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    checker.dispose();
  }
);
it("preserves reference rules and validates the current tool namespace", () => {
  const source = '/* tools.missing.comment() */ const text = "tools.missing.string()"; await tools.time.update({});';
  expect(validateAgentScriptReferences(source, ["time.update"])).toBeUndefined();
  expect(validateAgentScriptReferences(source, [])).toMatchObject({
    code: "UNKNOWN_TOOL",
    tool: "time.update",
    phase: "parse"
  });
  // The following checker retains syntax/error priority; preflight only checks references.
  expect(validateAgentScriptReferences("const = ;", [])).toBeUndefined();
});
it("rejects unknown references before script-start, type checking, or transaction creation", async () => {
  vi.mocked(requestAsapChat)
    .mockReset()
    .mockResolvedValueOnce({
      content: "",
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "execute",
          type: "function",
          function: { name: "execute", arguments: JSON.stringify({ code: "await tools.unknown.call({});" }) }
        }
      ]
    })
    .mockResolvedValueOnce({ content: "done", finishReason: "stop", toolCalls: [] });
  const check = vi.fn(async () => undefined),
    beginEdit = vi.fn(),
    events: string[] = [];
  const agent = createTestAgentLoop({
    tools: [],
    definition: { scriptApi: { entries: [], modules: [] }, toolNames: [], beginEdit },
    scriptChecker: {
      preflight: async (source, names) => {
        await Promise.resolve();
        return validateAgentScriptReferences(source, names);
      },
      check
    }
  });
  agent.subscribe((event) => events.push(event.type));
  const result = await agent.run("test", {});
  expect(result.stageResults[0]).toMatchObject({
    ok: false,
    error: { code: "UNKNOWN_TOOL" },
    receipt: { status: "rejected" }
  });
  expect(check).not.toHaveBeenCalled();
  expect(beginEdit).not.toHaveBeenCalled();
  expect(events).not.toContain("script_started");
  agent.dispose();
});

it("does not build an unused project namespace while requesting a model-only answer", async () => {
  vi.mocked(requestAsapChat).mockReset().mockResolvedValue({ content: "done", finishReason: "stop", toolCalls: [] });
  const paths = vi.fn(() => ["assets/a"]);
  const agent = createTestAgentLoop({ tools: [], definition: { scriptApi: { entries: [], modules: [] }, toolNames: [],
    projectFiles: [{ paths, read: () => "source" }] } });
  try {
    expect((await agent.run("answer only", {})).finalMessage).toBe("done");
    expect(paths).not.toHaveBeenCalled();
  } finally { agent.dispose(); }
});
