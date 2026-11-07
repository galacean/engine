import { SeedWorldViewSnapshots } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot.ts";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat } from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";
import { AIChatSession } from "@galacean/engine-ai-chat/ai-chat/ai-chat-session.ts";
import { createTestAgentLoop } from "../../../packages/ai-chat/tests/AIChatTestRuntime";
import { AgentTraceStore } from "@galacean/engine-ai-chat/ai-chat/agent-trace.ts";
import { SeedWorldSessionActivity } from "../../demos/seed-world/assistant/SeedWorldSessionActivity";
const request = vi.mocked(requestAsapChat);
const final = { content: "done", toolCalls: [], finishReason: "stop" as const };
const make = () =>
  new AIChatSession({
    agent: createTestAgentLoop({
      tools: [],
      definition: { toolNames: [], scriptApi: { catalog: "none", entries: [], modules: [] } }
    })
  });
beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(final);
});

function setup(voice = true) {
  const session = make(),
    trace = new AgentTraceStore({ enabled: true });
  const activity = new SeedWorldSessionActivity(
    session,
    { getWorldContext: () => ({}), captureTaskViewerSnapshot: () => () => {} } as any,
    trace
  );
  const id = voice ? trace.begin({ input: "", inputSource: "voice" }) : undefined;
  return { session, trace, activity, id };
}
function deferred() {
  let resolve!: (v: any) => void;
  const promise = new Promise<any>((r) => (resolve = r));
  return { promise, resolve };
}
for (const voice of [true, false])
  it(`${voice ? "voice" : "text"} preparation failure`, async () => {
    const h = setup(voice),
      release = vi.fn();
    const receipt = h.activity.submit(
      "photo",
      { inputSource: voice ? "voice" : "text" },
      "next-step",
      {
        prepare: async () => {
          throw new Error("export failed");
        },
        release
      },
      { id: h.id }
    );
    await expect(receipt.completion).rejects.toThrow("export failed");
    await vi.waitFor(() => expect(h.session.state).toBe("stopped"));

    expect(h.session.snapshot.current?.outcome?.status).toBe("failed");
    expect(release).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
    expect(h.trace.running).toBe(false);
    expect(h.trace.getLastTrace()?.status).toBe("failed");
    expect((h.activity as any).queuedTraces.size).toBe(0);
    h.session.dispose();
  });
it("stop then remove and late export settlement", async () => {
  const h = setup(),
    release = vi.fn(),
    gate = deferred();
  const receipt = h.activity.submit(
    "photo",
    { inputSource: "voice" },
    "next-step",
    { prepare: () => gate.promise, release },
    { id: h.id }
  );
  await h.session.stop();
  expect(release).not.toHaveBeenCalled();
  expect(h.session.canContinue).toBe(true);
  h.session.removeInput(receipt.id);
  await expect(receipt.completion).rejects.toThrow();
  gate.resolve([]);
  await Promise.resolve();

  expect(release).toHaveBeenCalledOnce();
  expect(h.trace.running).toBe(false);
  expect((h.activity as any).queuedTraces.size).toBe(0);
  expect(request).not.toHaveBeenCalled();
  h.session.dispose();
});
it("dispose during preparation and late export settlement", async () => {
  const h = setup(),
    release = vi.fn(),
    gate = deferred();
  const receipt = h.activity.submit(
    "photo",
    { inputSource: "voice" },
    "next-step",
    { prepare: () => gate.promise, release },
    { id: h.id }
  );
  h.session.dispose();
  await expect(receipt.completion).rejects.toThrow();
  gate.resolve([]);
  await Promise.resolve();
  expect(h.trace.running).toBe(false);
  expect(release).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
});
it("stop then continue success control", async () => {
  const h = setup(),
    release = vi.fn(),
    gate = deferred();
  const prepare = vi
    .fn()
    .mockImplementationOnce(() => gate.promise)
    .mockResolvedValue([]);
  const receipt = h.activity.submit("photo", { inputSource: "voice" }, "next-step", { prepare, release }, { id: h.id });
  await h.session.stop();
  const first = h.trace.getLastTrace()!;
  expect(first.status).toBe("cancelled");
  const next = await h.session.continue();
  await next.completion;
  await receipt.completion;
  gate.resolve([]);
  await Promise.resolve();

  expect(h.trace.getTraces()).toHaveLength(2);
  expect(h.trace.getLastTrace()?.session).toMatchObject({ inputId: receipt.id, continuedFrom: first.session!.id });
  expect(next.id).toBe(receipt.id);
  expect(h.trace.running).toBe(false);
  expect(h.trace.getLastTrace()?.status).toBe("completed");
  expect(release).toHaveBeenCalledOnce();
  h.session.dispose();
});
it("success control", async () => {
  const h = setup(),
    release = vi.fn();
  await h.activity.submit(
    "photo",
    { inputSource: "voice" },
    "next-step",
    { prepare: async () => [], release },
    { id: h.id }
  ).completion;
  expect(h.trace.running).toBe(false);
  expect(h.trace.getLastTrace()?.status).toBe("completed");
  expect(release).toHaveBeenCalledOnce();
  h.session.dispose();
});

it("failed supplement does not fail the task and clears source metadata", async () => {
  const h = setup(),
    release = vi.fn(),
    supplementRelease = vi.fn(),
    gate = deferred();
  request.mockImplementationOnce(() => gate.promise).mockResolvedValue(final);
  const initial = h.activity.submit(
    "first",
    { inputSource: "voice" },
    "next-step",
    { prepare: async () => [], release },
    { id: h.id }
  );
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  const extra = h.activity.submit(
    "second photo",
    { inputSource: "voice" },
    "next-step",
    {
      prepare: async () => {
        throw new Error("supplement export failed");
      },
      release: supplementRelease
    },
    { asr: undefined }
  );
  gate.resolve(final);
  await expect(extra.completion).rejects.toThrow("supplement export failed");
  await initial.completion;

  expect(h.session.snapshot.current?.outcome?.status).toBe("completed");
  expect(h.session.snapshot.current?.inputs.at(-1)?.error).toBe("supplement export failed");
  expect(h.trace.getLastTrace()?.session?.inputs.at(-1)).toMatchObject({
    id: extra.id,
    error: "supplement export failed"
  });
  expect(h.trace.running).toBe(false);
  expect((h.activity as any).queuedTraces.size).toBe(0);
  expect(supplementRelease).toHaveBeenCalledOnce();
  h.session.dispose();
});
it("later task preserves the archived preparation failure", async () => {
  const h = setup(),
    release = vi.fn();
  await expect(
    h.activity.submit(
      "failed photo",
      { inputSource: "voice" },
      "next-step",
      {
        prepare: async () => {
          throw new Error("export failed");
        },
        release
      },
      { id: h.id }
    ).completion
  ).rejects.toThrow();
  await vi.waitFor(() => expect(h.session.state).toBe("stopped"));
  await h.activity.submit(
    "next task",
    { inputSource: "text" },
    "next-step",
    { prepare: async () => [], release: vi.fn() },
    {}
  ).completion;

  expect(h.trace.getTraces().map((t) => t.status)).toEqual(["failed", "completed"]);
  expect(h.trace.getLastTrace()?.input.text).toBe("next task");
  expect((h.activity as any).queuedTraces.size).toBe(0);
  h.session.dispose();
});

it("real snapshot manager releases failed export and Trace finishes", async () => {
  const frame = {
    image: {
      texture: {} as any,
      width: 768,
      height: 432,
      dispose: vi.fn(),
      export: vi.fn(async () => {
        throw new Error("export failed");
      })
    },
    width: 2,
    height: 2,
    identities: { identityBits: 14, estimatedPosition: () => undefined, byteLength: 16, read: () => new Uint8Array(4), resolve: () => undefined, dispose: vi.fn() }
  };
  const views = new SeedWorldViewSnapshots(
    () => frame,
    () => "scene"
  );
  const session = new AIChatSession({
    agent: createTestAgentLoop({
      tools: [],
      definition: { toolNames: [], scriptApi: { catalog: "none", entries: [], modules: [] }, imageResources: views }
    })
  });
  const trace = new AgentTraceStore({ enabled: true });
  const activity = new SeedWorldSessionActivity(
    session,
    { getWorldContext: () => ({}), captureTaskViewerSnapshot: () => () => {} } as any,
    trace
  );
  const id = trace.begin({ input: "", inputSource: "voice" });
  const shot = await views.capture();
  views.setAttachment(shot.snapshotId, []);
  const lease = views.acquireAttachments()!,
    release = vi.fn(() => lease.release());
  await expect(
    activity.submit("photo", { inputSource: "voice" }, "next-step", { prepare: () => lease.export(), release }, { id })
      .completion
  ).rejects.toThrow("export failed");
  await vi.waitFor(() => expect(session.state).toBe("stopped"));
  views.removeAttachment(shot.snapshotId);
  await Promise.resolve();

  expect(release).toHaveBeenCalledOnce();
  expect(views.budget.stats.total).toBe(0);
  expect(frame.image.dispose).toHaveBeenCalledOnce();
  expect(frame.identities.dispose).toHaveBeenCalledOnce();
  expect(trace.running).toBe(false);
  session.dispose();
  views.dispose();
});

it("publishes the terminal outcome before disposal observers detach", async () => {
  const h = setup(),
    gate = deferred(),
    release = vi.fn();
  const receipt = h.activity.submit("photo", {}, "next-step", { prepare: () => gate.promise, release }, { id: h.id });
  const snapshots: (typeof h.session.snapshot)[] = [];
  h.session.subscribeState((snapshot) => snapshots.push(snapshot));
  h.session.dispose();
  const terminal = snapshots.find((snapshot) => snapshot.state === "disposed")!;
  expect(terminal.current?.outcome?.status).toBe("stopped");
  expect(h.trace.getTraces().map((t) => t.status)).toEqual(["cancelled"]);
  await expect(receipt.completion).rejects.toThrow();
  gate.resolve([]);
  await Promise.resolve();
  expect(h.trace.getTraces()).toHaveLength(1);
  expect(release).toHaveBeenCalledOnce();
});
it("removes a preparing input without losing its terminal record before the next input", async () => {
  const h = setup(),
    gate = deferred(),
    release = vi.fn();
  const first = h.activity.submit("remove", {}, "next-step", { prepare: () => gate.promise, release }, { id: h.id });
  const next = h.activity.submit("next", {}, "next-turn", { prepare: async () => [], release: vi.fn() }, {});
  h.session.removeInput(first.id);
  await expect(first.completion).rejects.toThrow();
  await next.completion;
  expect(h.trace.getTraces().map((t) => [t.input.text, t.status])).toEqual([
    ["remove", "cancelled"],
    ["next", "completed"]
  ]);
  gate.resolve([]);
  await Promise.resolve();
  expect(release).toHaveBeenCalledOnce();
  h.session.dispose();
});
it("closes an ASR trace when Session rejects admission without creating a task", () => {
  const h = setup(),
    release = vi.fn();
  expect(() => h.activity.submit(" ", {}, "next-step", { prepare: async () => [], release }, { id: h.id })).toThrow();
  expect(h.session.snapshot.tasks).toHaveLength(0);
  expect(h.trace.running).toBe(false);
  expect(h.trace.getLastTrace()?.status).toBe("failed");
  expect(release).toHaveBeenCalledOnce();
  h.session.dispose();
});

it("archives a stopped model execution and links its continuation without HUD ownership", async () => {
  const h = setup(),
    release = vi.fn();
  request.mockImplementationOnce(
    ({ signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })
  );
  const original = h.activity.submit(
    "inspect",
    { inputSource: "voice" },
    "next-step",
    { prepare: async () => [], release },
    { id: h.id }
  );
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(h.trace.getCurrentTrace()?.taskId).toBe(h.session.snapshot.current?.taskId);
  await h.session.stop();
  await expect(original.completion).rejects.toThrow();
  const stopped = h.trace.getLastTrace()!;
  expect(stopped.status).toBe("cancelled");
  expect(release).toHaveBeenCalledOnce();
  await (
    await h.session.continue()
  ).completion;
  expect(h.trace.getTraces().map((t) => t.status)).toEqual(["cancelled", "completed"]);
  expect(h.trace.getLastTrace()?.session).toMatchObject({ inputId: original.id, continuedFrom: stopped.session!.id });
  expect(release).toHaveBeenCalledOnce();
  h.session.dispose();
});
