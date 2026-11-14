import { TestWorker } from "../../project/tests/TestRegexWorker";
import { presentScriptOutput } from "../src/ai-chat/agent-output";
import { projectTrajectory } from "../src/ai-chat/trajectory/trajectory-model";
import { AgentTraceStore } from "../src/ai-chat/agent-trace";
import { afterEach, expect, it, vi } from "vitest";
import { createTestAgentLoop } from "./AIChatTestRuntime";
import { AgentJavaScriptChecker } from "../src/ai-chat/agent-script-checker";
import { agentTypecheckLibraries } from "../src/script-checking/typecheck-libraries";
import { AgentArtifacts } from "../src/ai-chat/agent-artifacts";
import { buildAgentToolDefinitions, parseAgentToolCall } from "../src/ai-chat/agent-protocol";
vi.mock("../src/ai-chat/asap-chat", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat } from "../src/ai-chat/asap-chat";

afterEach(() => vi.unstubAllGlobals());
const request = vi.mocked(requestAsapChat);
const definition = {
  scriptApi: {
    hostNotes: "# Host",
    entries: [],
    modules: [],
    documents: [{ path: "skills/fixture/guide.md", content: "before\nneedle\nafter" }]
  },
  toolNames: []
};
const final = { content: "done", toolCalls: [], finishReason: "stop" as const };
const execute = (body: string) => ({
  content: "",
  toolCalls: [
    {
      id: crypto.randomUUID(),
      type: "function" as const,
      function: { name: "execute", arguments: JSON.stringify({ code: `${body}` }) }
    }
  ],
  finishReason: "tool_calls" as const
});
const last = () =>
  JSON.parse(
    request.mock.calls
      .at(-1)![0]
      .messages.filter((m) => m.role === "tool")
      .at(-1)!.content
  );

const fileCall = (name: string, input: unknown, id: string = crypto.randomUUID()) => ({
  id,
  type: "function" as const,
  function: { name, arguments: JSON.stringify(input) }
});
it("exposes native file tools and rejects removed entrypoints", () => {
  expect(buildAgentToolDefinitions(definition).map((t) => t.function.name)).toEqual([
    "execute",
    "read",
    "write",
    "edit",
    "delete",
    "glob",
    "grep"
  ]);
  for (const name of ["read_tool", "list_tool", "search_tool"])
    expect(() => parseAgentToolCall(fileCall(name, {}))).toThrow("未注册");
});
it("returns independent file results and errors from one response without opening an edit", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const open = vi.fn(() => {
    throw new Error("must not open");
  });
  request.mockReset();
  request
    .mockResolvedValueOnce({
      content: "inspect",
      finishReason: "tool_calls",
      toolCalls: [
        fileCall("read", { file_path: "skills/fixture/guide.md" }, "a"),
        fileCall("read", { file_path: "missing" }, "b"),
        fileCall("glob", { pattern: "**/*.md" }, "c"),
        fileCall("grep", { path: "skills/fixture/guide.md", pattern: "needle" }, "d"),
        { id: "e", type: "function", function: { name: "execute", arguments: '{"code":42}' } },
        fileCall("read", { file_path: "skills/fixture/guide.md" }, "f")
      ]
    })
    .mockResolvedValueOnce(final);
  const loop = createTestAgentLoop({ definition: { ...definition, beginEdit: open }, tools: [] });
  const store = new AgentTraceStore({ enabled: true });
  const id = store.begin({ input: "inspect", inputSource: "text" });
  loop.subscribe((event) => store.captureAgentEvent(event));
  await loop.run("inspect", { debugMode: true });
  store.finish(id, "completed");
  expect(open).not.toHaveBeenCalled();
  const replies = request.mock.calls[1][0].messages.filter((m) => m.role === "tool");
  expect(replies.map((m) => m.toolCallId)).toEqual(["a", "b", "c", "d", "e", "f"]);
  expect(replies[0].content).toContain("2: needle");
  expect(replies[1].content).toContain("Error:");
  expect(replies[2].content).toContain("skills/fixture/guide.md");
  expect(replies[3].content).toContain("Line 2: needle");
  expect(replies[4].content).toContain("INVALID_TOOL_CALL");
  expect(replies[5].content).toContain("2: needle");
  expect(request).toHaveBeenCalledTimes(2);
  const trajectory = projectTrajectory(store.getLastTrace()!);
  expect(trajectory.cells.filter((c) => c.kind === "assistant")).toHaveLength(2);
  const cells = trajectory.cells.filter((c) => c.kind === "tool");
  expect(cells.map((c) => c.callId).sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
});

it("retains separate console/return, permits no return, and preserves error diagnostics", async () => {
  request.mockReset();
  request.mockResolvedValueOnce(execute('console.warn("warning", {n:1});')).mockResolvedValueOnce(final);
  const loop = createTestAgentLoop({ definition, tools: [] });
  await loop.run("log", {});
  expect(last()).toMatchObject({
    ok: true,
    returnValuePresent: false,
    console: [{ level: "warn", args: ["warning", { n: 1 }] }]
  });
  request.mockReset();
  request
    .mockResolvedValueOnce(execute('console.log("before"); throw new Error("broken");'))
    .mockResolvedValueOnce(final);
  await loop.run("error", {});
  expect(last()).toMatchObject({
    ok: false,
    console: [{ level: "log", args: ["before"] }],
    phase: "execution",
    location: { source: "execute.code" }
  });
  expect(last().error).toContain("broken");
});

it("recovers complete Console and Return from spilled output through external read pages", async () => {
  const text = '中文😀"\\\n\u0000'.repeat(10000);
  const pages: string[] = [];
  let outputFile = "", reads = 0;
  request.mockReset();
  request.mockResolvedValueOnce(execute(`const text = ${JSON.stringify(text.slice(0, 8))}.repeat(10000); console.log(text); return {text};`))
    .mockImplementation(async ({ messages }) => {
      const reply = messages.filter(m => m.role === "tool").at(-1)!.content;
      if (!outputFile) {
        const result = JSON.parse(reply);
        expect(result).toMatchObject({ ok: true, outputFile: expect.stringMatching(/^\.ai\/outputs\//) });
        outputFile = result.outputFile;
      } else {
        expect(reply).not.toContain("line truncated");
        const rows = reply.split("\n").filter(line => /^\d+: /.test(line));
        pages.push(...rows.map(line => line.replace(/^\d+: /, "")));
        const next = /Continue with read offset=(\d+)/.exec(reply);
        if (!next) return final;
        expect(++reads).toBeLessThan(150);
        return { content: "", finishReason: "tool_calls", toolCalls: [fileCall("read", {
          file_path: outputFile, offset: Number(next[1])
        })] };
      }
      return { content: "", finishReason: "tool_calls", toolCalls: [fileCall("read", { file_path: outputFile })] };
    });
  await createTestAgentLoop({ definition, tools: [] }).run("large", {});
  expect(reads).toBeGreaterThan(1);
  const artifact = JSON.parse(pages.join("\n"));
  expect(artifact.format).toBe("chunked-json");
  expect(JSON.parse(artifact.chunks.join(""))).toEqual({
    console: [{ level: "log", args: [text] }], returnValue: { text }, returnValuePresent: true
  });
  const executed = request.mock.calls.at(-1)![0].messages.filter(m => m.role === "assistant")
    .flatMap(m => m.toolCalls ?? []).filter(call => call.function.name === "execute");
  expect(executed).toHaveLength(1);
});

it.each([
  { paths: ["a"] }, { file_path: "" }, { file_path: "../a" },
  { file_path: "a", offset: 0 }, { file_path: "a", limit: 2001 },
  { file_path: "a", column: 1 }, { file_path: "a", extra: true }
])("validates the actual external read schema: %j", async args => {
  request.mockReset();
  request.mockResolvedValueOnce({ content: "", finishReason: "tool_calls", toolCalls: [fileCall("read", args)] })
    .mockResolvedValueOnce(final);
  await createTestAgentLoop({ definition, tools: [] }).run("read", {});
  expect(request.mock.calls[1][0].messages.filter(m => m.role === "tool").at(-1)!.content).toMatch(/^Error:/);
});

it("rejects removed script file APIs with the retained simplified TSC", () => {
  const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
  expect(checker.check('return await files.read({file_path:"README.md"});', [])).toMatchObject({
    code: "SCRIPT_CHECK_FAILED",
    phase: "check"
  });
  expect(checker.check('console.log("ready"); return 1;', [])).toBeUndefined();
  checker.dispose();
});

it("keeps immutable artifacts and execution receipts when output storage fills", () => {
  const store = new AgentArtifacts(256);
  const path = store.save("first", "saved");
  const receipt = { executionId: "second", status: "committed" as const, transactionId: "tx" };
  const result = presentScriptOutput({ ok: true, output: "x".repeat(70000), receipt }, (content) =>
    store.save("second", content)
  );
  expect(result).toMatchObject({
    ok: true,
    receipt,
    output: { truncated: true, reason: expect.stringContaining("storage limit") }
  });
  expect(result.outputFile).toBeUndefined();
  expect(result.console?.at(-1)?.args[0]).toContain("could not be saved");
  expect(store.provider.read(path)).toBe("saved");
  store.clear();
  expect([...store.provider.paths()]).toEqual([]);
});

it("renders separate Console and Return blocks and keeps the existing failure detail", async () => {
  for (const body of [
    'console.log("progress"); return null;',
    'console.warn("before error"); throw new Error("broken");'
  ]) {
    request.mockReset();
    request.mockResolvedValueOnce(execute(body)).mockResolvedValueOnce(final);
    const loop = createTestAgentLoop({ definition, tools: [] });
    const store = new AgentTraceStore({ enabled: true });
    const id = store.begin({ input: "run", inputSource: "text" });
    loop.subscribe((event) => store.captureAgentEvent(event));
    await loop.run("run", { debugMode: true });
    store.finish(id, "completed");
    const tool = projectTrajectory(store.getLastTrace()!).cells.find((cell) => cell.kind === "tool")!;
    const blocks = tool.outputBlocks?.map((block) => ("content" in block ? block.content : "")) ?? [];
    expect(blocks[0]).toMatch(/^Console\n/);
    if (body.includes("throw")) {
      expect(tool.status).toBe("failed");
      expect(tool.outputDetail).toContain("SCRIPT_RUNTIME_ERROR");
      expect(tool.outputDetail).toContain("execute.code");
    } else expect(blocks).toContain("Return\nnull");
  }
});

it("preserves Console and Return contents in both model feedback and trace", async () => {
  request.mockReset();
  request.mockResolvedValueOnce(execute('const data = { text: "channel-marker".repeat(200) }; console.log(JSON.stringify(data)); return data;'))
    .mockResolvedValueOnce(final);
  const loop = createTestAgentLoop({ definition, tools: [] });
  const events: import("../src/ai-chat/agent-types").AgentEvent[] = [];
  loop.subscribe(event => events.push(event));
  await loop.run("inspect", {});
  const feedback = last();
  expect(feedback.console[0].args[0]).toBe(JSON.stringify(feedback.result));
  expect(feedback.result.text).toBe("channel-marker".repeat(200));
  const finished = events.find(event => event.type === "script_finished");
  expect(finished?.type === "script_finished" && finished.result).toMatchObject({
    ok: true, output: feedback.result, console: feedback.console
  });
});

it("settles every admitted call before applying the script repair limit", async () => {
  request.mockReset();
  request.mockResolvedValueOnce({
    content: "run",
    finishReason: "tool_calls",
    toolCalls: [
      fileCall("execute", { code: 'throw new Error("first");' }, "first"),
      fileCall("execute", { code: 'throw new Error("second");' }, "second"),
      fileCall("read", { file_path: "skills/fixture/guide.md" }, "read-after-errors")
    ]
  });
  const loop = createTestAgentLoop({ definition, tools: [], maxScriptRepairs: 2 });
  const transcript: import("../src/ai-chat/agent-types").AgentMessage[] = [];
  loop.subscribe((event) => {
    if (event.type === "transcript_appended") transcript.push(...event.messages);
  });
  await expect(loop.run("try calls", { debugMode: true })).rejects.toThrow();
  expect(transcript.filter((m) => m.role === "tool").map((m) => m.toolCallId)).toEqual([
    "first",
    "second",
    "read-after-errors"
  ]);
  expect(transcript.at(-1)?.content).toContain("needle");
});

it("returns paired not-started replies for mutations behind cancellation", async () => {
  request.mockReset();
  request.mockResolvedValueOnce({
    content: "read then write",
    finishReason: "tool_calls",
    toolCalls: [
      fileCall("read", { file_path: "skills/fixture/guide.md" }, "read"),
      fileCall("write", { file_path: "skills/fixture/new.md", content: "new" }, "write")
    ]
  });
  const loop = createTestAgentLoop({ definition, tools: [] });
  const messages: import("../src/ai-chat/agent-types").AgentMessage[] = [];
  loop.subscribe((event) => {
    if (event.type === "transcript_appended") messages.push(...event.messages);
    if (event.type === "tool_finished" && event.tool === "read") loop.cancel();
  });
  await expect(loop.run("cancel batch", { debugMode: true })).rejects.toThrow();
  const replies = messages.filter((m) => m.role === "tool");
  expect(replies.map((m) => m.toolCallId)).toEqual(["read", "write"]);
  expect(replies[0].content).toContain("needle");
  expect(replies[1].content).toContain("NOT_STARTED");
  expect(request).toHaveBeenCalledOnce();
});

it("retains long outputs across tasks but expires them on conversation reset", async()=>{
  request.mockReset();
  const loop=createTestAgentLoop({definition,tools:[]});
  request.mockResolvedValueOnce(execute('return "x".repeat(70000);')).mockResolvedValueOnce(final);
  await loop.run("produce output",{});
  const path=last().outputFile;
  expect(path).toMatch(/^\.ai\/outputs\//);
  const readCall=()=>({content:"",finishReason:"tool_calls" as const,toolCalls:[fileCall("read",{file_path:path,limit:2})]});
  request.mockResolvedValueOnce(readCall()).mockResolvedValueOnce(final);
  await loop.run("read previous output",{});
  expect(request.mock.lastCall![0].messages.at(-2)!.content).toContain(`<path>${path}</path>`);
  loop.resetKnowledge();
  request.mockResolvedValueOnce(readCall()).mockResolvedValueOnce(final);
  await loop.run("read expired output",{});
  expect(request.mock.lastCall![0].messages.at(-2)!.content).toContain("临时文件已过期");
});
