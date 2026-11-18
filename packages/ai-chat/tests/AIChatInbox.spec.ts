import { beforeEach, expect, it, vi } from "vitest";
import * as z from "zod";
vi.mock("../src/ai-chat/asap-chat", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat, type AsapChatResult } from "../src/ai-chat/asap-chat";
import { AgentCancelledError } from "../src/ai-chat/agent-loop";
import { AIChatSession } from "../src/ai-chat/ai-chat-session";
import { defineTool, type AgentEvent } from "../src/ai-chat/agent-types";
import { createTestAgentLoop } from "./AIChatTestRuntime";

const request = vi.mocked(requestAsapChat);
const final = (content = "done"): AsapChatResult => ({ content, toolCalls: [], finishReason: "stop" });
const execute = (code: string): AsapChatResult => ({
  content: "",
  finishReason: "tool_calls",
  toolCalls: [
    {
      id: crypto.randomUUID(),
      type: "function",
      function: { name: "execute", arguments: JSON.stringify({ code: ` ${code} ` }) }
    }
  ]
});
const context = (index: number) => JSON.parse(request.mock.calls[index][0].messages[3].content);
function setup(executeTool: () => unknown = () => ({ id: "tree-1" })) {
  const tool = defineTool({ name: "create", input: z.strictObject({}), output: z.unknown(), execute: executeTool });
  const session = new AIChatSession({
    agent: createTestAgentLoop({
      tools: [tool],
      definition: {
        toolNames: [tool.name],
        scriptApi: {
          catalog: "test",
          entries: [],
          modules: [
            {
              id: "test.d.ts",
              imports: [],
              source: "declare const tools: { create(input: {}): Promise<unknown> };",
              toolNames: [tool.name]
            }
          ]
        }
      }
    })
  });
  const events: AgentEvent[] = [];
  session.subscribe((event) => events.push(event));
  return { session, events };
}
function waitForAbort(): Promise<AsapChatResult> {
  return new Promise((_resolve, reject) => {
    const signal = request.mock.calls.at(-1)![0].signal;
    if (signal.aborted) reject(new Error("aborted"));
    else signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
}
beforeEach(() => request.mockReset());

it("consumes default steering at the next step without starting another turn", async () => {
  const first = Promise.withResolvers<AsapChatResult>();
  request.mockReturnValueOnce(first.promise).mockResolvedValueOnce(final("revised"));
  const { session, events } = setup();
  const original = session.run("plant trees", { model: "one" });
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  const inputContext = { selected: "tree-A" };
  const supplement = session.run("leave the view open", { context: inputContext });
  inputContext.selected = "tree-B";
  expect(request).toHaveBeenCalledOnce();
  first.resolve(final("old answer"));
  const [a, b] = await Promise.all([original, supplement]);
  expect(a.taskId).toBe(b.taskId);
  expect(a.finalMessage).toBe("revised");
  expect(context(1).inputs).toEqual([
    expect.objectContaining({ text: "leave the view open", context: { selected: "tree-A" } })
  ]);
  expect(events.filter((e) => e.type === "task_started")).toHaveLength(1);
  expect(events.filter((e) => e.type === "input_consumed")).toHaveLength(1);
});

it("finishes the whole running tool before delivering next-step input, and drains next-turn FIFO", async () => {
  const host = Promise.withResolvers<unknown>();
  const create = vi.fn(() => host.promise);
  request
    .mockResolvedValueOnce(execute("return await tools.create({});"))
    .mockResolvedValueOnce(final("trees"))
    .mockResolvedValueOnce(final("sunset"))
    .mockResolvedValueOnce(final("rain"));
  const { session } = setup(create);
  const a = session.run("trees");
  await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
  const b = session.run("sunset", {}, "next-turn");
  const c = session.run("less dense");
  const d = session.run("rain", {}, "next-turn");
  expect(request).toHaveBeenCalledOnce();
  host.resolve({ id: "tree-1" });
  const results = await Promise.all([a, b, c, d]);
  expect(results[0].taskId).toBe(results[2].taskId);
  expect(new Set(results.map((r) => r.taskId)).size).toBe(3);
  expect(context(1)).toMatchObject({ instruction: "trees", inputs: [{ text: "less dense" }] });
  expect(context(2).instruction).toBe("sunset");
  expect(context(3).instruction).toBe("rain");
});

it("stops admission, parks the queue and continues from committed tool results without replay", async () => {
  const create = vi.fn(() => ({ id: "tree-1" }));
  request
    .mockResolvedValueOnce(execute("return await tools.create({});"))
    .mockImplementationOnce(waitForAbort)
    .mockResolvedValueOnce(final("continued"))
    .mockResolvedValueOnce(final("queued done"));
  const { session, events } = setup(create);
  const original = session.run("plant then inspect");
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  const queued = session.run("sunset", {}, "next-turn");
  const supplement = session.run("keep the tree small");
  await session.stop();
  await expect(original).rejects.toThrow("cancelled");
  expect(session.state).toBe("stopped");
  expect(session.pendingInputs).toHaveLength(2);
  expect(request).toHaveBeenCalledTimes(2);
  const continued = session.continue().then(receipt => receipt.completion);
  await Promise.all([continued, queued, supplement]);
  expect(create).toHaveBeenCalledOnce();
  expect(JSON.stringify(request.mock.calls[2][0].messages)).toContain("tree-1");
  expect(context(2).inputs[0].text).toBe("keep the tree small");
  expect(events.filter((e) => e.type === "task_started").at(1)).toHaveProperty("continuedFrom");
});

it("removes pending inputs and never exposes a withdrawn message to the model", async () => {
  const first = Promise.withResolvers<AsapChatResult>();
  request.mockReturnValueOnce(first.promise);
  const { session } = setup();
  const running = session.run("trees");
  const removed = session.submit("rain", {}, "next-turn");
  expect(session.removeInput(removed.id)).toBe(true);
  expect(session.removeInput(removed.id)).toBe(false);
  await expect(removed.completion).rejects.toThrow("removed");
  await expect(removed.completion).rejects.toBeInstanceOf(AgentCancelledError);
  first.resolve(final());
  await running;
  expect(request).toHaveBeenCalledOnce();
});

it("preserves steering already consumed before interruption", async () => {
  const first = Promise.withResolvers<AsapChatResult>();
  request.mockReturnValueOnce(first.promise).mockImplementationOnce(waitForAbort).mockResolvedValueOnce(final());
  const { session } = setup();
  const firstRun = session.run("trees");
  const addition = session.run("only along the shore");
  first.resolve(final());
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await session.stop();
  await expect(firstRun).rejects.toThrow("cancelled");
  await expect(addition).rejects.toThrow("cancelled");
  await (await session.continue()).completion;
  expect(context(2).inputs[0].text).toBe("only along the shore");
});

it("does not lose a submission from a completion observer", async () => {
  request.mockResolvedValueOnce(final("first")).mockResolvedValueOnce(final("second"));
  const { session } = setup();
  let next: Promise<unknown> | undefined;
  session.subscribe((event) => {
    if (event.type === "task_completed" && !next) next = session.run("second");
  });
  await session.run("first");
  await next;
  expect(context(1).instruction).toBe("second");
});

it("stop during task_started prevents even the first model request", async () => {
  const { session } = setup();
  session.subscribe((event) => {
    if (event.type === "task_started") session.cancel();
  });
  await expect(session.run("trees")).rejects.toThrow("cancelled");
  await session.stop();
  expect(request).not.toHaveBeenCalled();
  expect(session.canContinue).toBe(true);
});

it("rejects a route change in next-step input but accepts it for next-turn", async () => {
  const first = Promise.withResolvers<AsapChatResult>();
  request.mockReturnValueOnce(first.promise).mockResolvedValueOnce(final());
  const { session } = setup();
  const running = session.run("trees", { model: "one" });
  await expect(session.run("different", { model: "two" })).rejects.toThrow("Cannot change model");
  const queued = session.run("different", { model: "two" }, "next-turn");
  first.resolve(final());
  await Promise.all([running, queued]);
  expect(request.mock.calls[1][0].model).toBe("two");
});

it("retains accepted supplements in the next task's compact history", async () => {
  const first = Promise.withResolvers<AsapChatResult>();
  request.mockReturnValueOnce(first.promise).mockResolvedValueOnce(final()).mockResolvedValueOnce(final());
  const { session } = setup();
  const running = session.run("trees");
  const addition = session.run("only along the shore", { context: { privateSnapshot: "camera" } });
  const later = session.run("what did I ask for?", {}, "next-turn");
  first.resolve(final());
  await Promise.all([running, addition, later]);
  expect(JSON.parse(request.mock.calls[2][0].messages[4].content).records[0].inputs).toEqual([{ text: "only along the shore", inputSource: "text" }]);
  expect(JSON.stringify(JSON.parse(request.mock.calls[2][0].messages[4].content).records)).not.toContain("privateSnapshot");
});

it("blocks continuation when publication has an unknown outcome", async () => {
  const edit = defineTool({ name: "create", input: z.strictObject({}), output: z.null(), execute: () => null });
  const session = new AIChatSession({
    agent: createTestAgentLoop({
      tools: [edit],
      definition: {
        toolNames: [edit.name],
        scriptApi: {
          catalog: "test",
          entries: [],
          modules: [
            {
              id: "test.d.ts",
              imports: [],
              source: "declare const tools: { create(input: {}): Promise<null> };",
              toolNames: [edit.name]
            }
          ]
        },
        beginEdit: () => ({
          tools: [edit],
          hasChanges: () => true,
          prepare() {},
          discard() {},
          commit: () => {
            throw new Error("Unknown publication outcome");
          }
        })
      }
    })
  });
  request.mockResolvedValueOnce(execute("return await tools.create({});"));
  await expect(session.run("create")).rejects.toThrow("Unknown publication outcome");
  await session.stop();
  expect(session.canContinue).toBe(false);
  expect(session.continuationBlocked).toBe(true);
  await expect(session.continue()).rejects.toThrow("unknown outcome");
  expect(request).toHaveBeenCalledOnce();
});

it("serializes continue requested while stop is still settling", async () => {
  request.mockImplementationOnce(waitForAbort).mockResolvedValueOnce(final("continued"));
  const { session } = setup();
  const running = session.run("trees");
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  const stopping = session.stop();
  const continuing = session.continue().then(receipt => receipt.completion);
  await expect(running).rejects.toThrow("cancelled");
  await stopping;
  expect((await continuing).finalMessage).toBe("continued");
  expect(request).toHaveBeenCalledTimes(2);
});

it("starts a fresh turn on new input after stop without resuming the stopped task", async () => {
  request.mockImplementationOnce(waitForAbort).mockResolvedValueOnce(final("new answer"));
  const { session, events } = setup();
  const running = session.run("old task", { model: "one" });
  const rejection = expect(running).rejects.toThrow("cancelled");
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  await session.stop();
  await rejection;
  expect(session.canContinue).toBe(true);
  const result = await session.run("new task", { model: "two" });
  expect(result.input).toBe("new task");
  expect(context(1).instruction).toBe("new task");
  expect(events.filter(e => e.type === "task_started").at(-1)).not.toHaveProperty("continuedFrom", expect.any(String));
  expect(session.canContinue).toBe(false);
});

it("waits for cancellation settlement, drops old steering, and preserves explicitly queued turns", async () => {
  const oldResponse = Promise.withResolvers<AsapChatResult>();
  request.mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce(final("fresh"))
    .mockResolvedValueOnce(final("queued"));
  const { session, events } = setup();
  const running = session.run("old task");
  const rejected = expect(running).rejects.toThrow("cancelled");
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  const oldSteering = session.run("old supplement");
  const removed = expect(oldSteering).rejects.toThrow("removed");
  const queued = session.run("queued task", {}, "next-turn");
  const stopping = session.stop();
  const fresh = session.run("fresh task");
  expect(() => session.submit("different route", { model: "other" })).toThrow("Cannot change model");
  expect(request).toHaveBeenCalledOnce();
  expect(session.state).toBe("stopping");
  oldResponse.resolve(final("too late"));
  await Promise.all([rejected, removed, stopping, fresh, queued]);
  expect(events.filter(e => e.type === "task_started").map(e => e.input)).toEqual(["old task", "fresh task", "queued task"]);
  expect(events.filter(e => e.type === "input_consumed")).toHaveLength(0);
  expect(JSON.parse(request.mock.calls[1][0].messages[4].content).records).toHaveLength(1);
});

it("starts a new task when an idle session was stopped", async () => {
  request.mockResolvedValueOnce(final());
  const { session } = setup();
  await session.stop();
  await session.run("later");
  expect(context(0).instruction).toBe("later");
});


it("preserves FIFO when a next-turn submission restarts a stopped queue", async () => {
  request.mockImplementationOnce(waitForAbort).mockResolvedValue(final());
  const { session, events } = setup();
  const running = session.run("old");
  const rejected = expect(running).rejects.toThrow("cancelled");
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  const first = session.run("first queued", {}, "next-turn");
  await session.stop();
  await rejected;
  const second = session.run("second queued", {}, "next-turn");
  await Promise.all([first, second]);
  expect(events.filter(e => e.type === "task_started").map(e => e.input)).toEqual(["old", "first queued", "second queued"]);
});

it("keeps continuation owned when a state observer stops before the resumed AgentLoop begins", async () => {
  const { session } = setup();
  request.mockImplementationOnce(waitForAbort).mockResolvedValueOnce(final("continued"));
  const original = session.run("work");
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  await session.stop(); await expect(original).rejects.toThrow("cancelled");
  const off = session.subscribeState(snapshot => { if (snapshot.state === "executing") session.cancel(); });
  await expect(session.continue().then(receipt => receipt.completion)).rejects.toThrow("cancelled");
  await session.stop(); off();
  expect(session.canContinue).toBe(true); expect(request).toHaveBeenCalledOnce();
  const result = await (await session.continue()).completion;
  expect(result.finalMessage).toBe("continued");
  expect(request).toHaveBeenCalledTimes(2); session.dispose();
});

it("does not deliver an obsolete snapshot after an observer changes the state", async () => {
  const { session } = setup();
  const phases: string[] = [];
  session.subscribeState(value => { if (value.state === "preparing") session.cancel(); });
  session.subscribeState(value => phases.push(value.state));
  const source = { prepare: vi.fn(async () => []), release: vi.fn() };
  const receipt = session.submit("photo", {}, "next-step", source);
  await session.stop();
  expect(phases).not.toContain("preparing");
  expect(phases.at(-1)).toBe("stopped");
  expect(source.prepare).not.toHaveBeenCalled();
  session.dispose(); await expect(receipt.completion).rejects.toThrow("removed");
  expect(source.release).toHaveBeenCalledOnce();
});

it("uses the newly queued input's route for reentrant steering after a previous task completed", async () => {
  const { session } = setup();
  request.mockResolvedValue(final());
  await session.run("prior");
  const mismatch = vi.fn();
  session.subscribe(event => {
    if (event.type === "input_queued" && event.input.text === "new task") {
      try { session.submit("wrong route", { model: "different" }); }
      catch (error) { mismatch(error); }
    }
  });
  await session.run("new task", { model: "owner" });
  expect(mismatch).toHaveBeenCalledOnce();
  expect(String(mismatch.mock.calls[0][0])).toContain("Cannot change model");
  expect(request).toHaveBeenCalledTimes(2); session.dispose();
});


it("acknowledges continue before execution settles and preserves the original input identity", async () => {
  const later = Promise.withResolvers<AsapChatResult>();
  request.mockImplementationOnce(waitForAbort).mockReturnValueOnce(later.promise);
  const { session } = setup();
  const input = session.submit("work");
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  await session.stop();
  await expect(input.completion).rejects.toThrow("cancelled");
  const receipt = await session.continue();
  expect(receipt.id).toBe(input.id);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(session.state).toBe("executing");
  await expect(session.continue()).rejects.toThrow("No stopped task");
  later.reject(new Error("HTTP 500"));
  await expect(receipt.completion).rejects.toThrow("HTTP 500");
  expect(session.snapshot.current?.outcome).toMatchObject({ status: "failed", message: expect.stringContaining("处理过程中遇到了问题") });
  session.dispose();
});
