import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat } from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";
import { AIChatSession } from "@galacean/engine-ai-chat/ai-chat/ai-chat-session.ts";
import { createTestAgentLoop } from "../../../packages/ai-chat/tests/AIChatTestRuntime";
import { ConversationHistory } from "@galacean/engine-ai-chat/ai-chat/conversation-history.ts";
import { SeedWorldViewSnapshots, type ViewAnnotation } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot.ts";

const request = vi.mocked(requestAsapChat);
const final = { content: "done", toolCalls: [], finishReason: "stop" as const };
const definition = { toolNames: [], scriptApi: { catalog: "No tools", entries: [], modules: [] } };
function fixture() {
  const frame = {
    image: { texture: {} as any, width: 768, height: 432, dispose: vi.fn(),
      export: vi.fn(async (marks: readonly ViewAnnotation[]) => ({ width: 768, height: 432,
        blob: new Blob([JSON.stringify(marks)], { type: "image/jpeg" }) })) },
    width: 2, height: 2,
    identities: { identityBits: 14, estimatedPosition: () => undefined, byteLength: 16, read: () => new Uint8Array(4), resolve: () => undefined, dispose: vi.fn() }
  };
  const views = new SeedWorldViewSnapshots(() => frame, () => "scene");
  const history = new ConversationHistory();
  const session = new AIChatSession({ history, agent: createTestAgentLoop({ tools: [], definition: { ...definition, imageResources: views } }) });
  return { frame, views, session, history };
}
function readImage(imagePath: string) {
  return { content: "", finishReason: "tool_calls" as const, toolCalls: [{ id: crypto.randomUUID(), type: "function" as const,
    function: { name: "read", arguments: JSON.stringify({ file_path: imagePath }) } }] };
}
function prepared(lease: NonNullable<ReturnType<SeedWorldViewSnapshots["acquireAttachments"]>>) {
  return { prepare: vi.fn(() => lease.export()), release: vi.fn(() => lease.release()) };
}
beforeEach(() => { request.mockReset(); request.mockResolvedValue(final); });
afterEach(() => vi.unstubAllGlobals());

it("owns pending photo export before Stop, ignores late completion, and continues without aging the snapshot", async () => {
  const { frame, views, session } = fixture();
  const shot = await views.capture(); views.setAttachment(shot.snapshotId, []);
  const gate = Promise.withResolvers<Awaited<ReturnType<typeof frame.image.export>>>();
  frame.image.export.mockImplementationOnce(() => gate.promise);
  const source = prepared(views.acquireAttachments()!);
  const states: string[] = [];
  session.subscribe(event => { if (event.type === "session_state") states.push(event.state); });
  const pending = session.submit("look at this photo", {}, "next-step", source);
  expect(session.pendingInputs.map(item => item.input.id)).toEqual([pending.id]);
  await vi.waitFor(() => expect(frame.image.export).toHaveBeenCalledOnce());
  await session.stop();
  expect(session.state).toBe("stopped"); expect(session.canContinue).toBe(true);
  expect(views.resourceStats.turn).toBe(0); expect(request).not.toHaveBeenCalled();
  views.removeAttachment(shot.snapshotId);
  gate.resolve({ width: 768, height: 432, blob: new Blob(["frozen"], { type: "image/jpeg" }) });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(session.state).toBe("stopped"); expect(request).not.toHaveBeenCalled();
  expect(states.at(-1)).toBe("stopped"); expect(source.release).not.toHaveBeenCalled();
  await (await session.continue()).completion; await pending.completion;
  expect(request).toHaveBeenCalledOnce(); expect(frame.image.export).toHaveBeenCalledOnce();
  expect(source.release).toHaveBeenCalledOnce(); expect(views.resourceStats.turn).toBe(1);
  await session.run("turn 2"); await session.run("turn 3");
  expect(frame.image.dispose).not.toHaveBeenCalled();
  await session.run("turn 4");
  expect(frame.image.dispose).toHaveBeenCalledOnce(); expect(frame.identities.dispose).toHaveBeenCalledOnce();
  await Promise.resolve(); expect(views.budget.stats.total).toBe(0);
  session.dispose(); views.dispose();
});

it.each(["remove", "dispose"] as const)("%s releases queued input but lets its in-flight export settle safely", async action => {
  const { frame, views, session } = fixture();
  const shot = await views.capture(); views.setAttachment(shot.snapshotId, []);
  const gate = Promise.withResolvers<Awaited<ReturnType<typeof frame.image.export>>>();
  frame.image.export.mockImplementationOnce(() => gate.promise);
  const source = prepared(views.acquireAttachments()!);
  const pending = session.submit("photo", {}, "next-step", source);
  const rejected = expect(pending.completion).rejects.toThrow("removed");
  await vi.waitFor(() => expect(frame.image.export).toHaveBeenCalledOnce());
  views.removeAttachment(shot.snapshotId);
  if (action === "dispose") session.dispose(); else session.removeInput(pending.id);
  await rejected;
  expect(source.release).toHaveBeenCalledOnce(); expect(frame.image.dispose).not.toHaveBeenCalled();
  gate.resolve({ width: 768, height: 432, blob: new Blob(["late"], { type: "image/jpeg" }) });
  await vi.waitFor(() => expect(frame.image.dispose).toHaveBeenCalledOnce());
  expect(frame.identities.dispose).toHaveBeenCalledOnce(); expect(views.budget.stats.total).toBe(0);
  expect(request).not.toHaveBeenCalled(); session.dispose(); views.dispose();
});

it("cancelling one input cannot invalidate another input sharing the same pending photo export", async () => {
  const { frame, views, session } = fixture();
  const shot = await views.capture(); views.setAttachment(shot.snapshotId, []);
  const gate = Promise.withResolvers<Awaited<ReturnType<typeof frame.image.export>>>();
  frame.image.export.mockImplementationOnce(() => gate.promise);
  const a = prepared(views.acquireAttachments()!), b = prepared(views.acquireAttachments()!);
  const first = session.submit("discard this input", {}, "next-step", a);
  await vi.waitFor(() => expect(frame.image.export).toHaveBeenCalledOnce());
  const second = session.submit("keep this input", {}, "next-turn", b);
  session.removeInput(first.id); await expect(first.completion).rejects.toThrow("removed");
  await vi.waitFor(() => expect(b.prepare).toHaveBeenCalledOnce());
  views.removeAttachment(shot.snapshotId);
  gate.resolve({ width: 768, height: 432, blob: new Blob(["shared"], { type: "image/jpeg" }) });
  await second.completion;
  expect(request).toHaveBeenCalledOnce(); expect(frame.image.export).toHaveBeenCalledOnce();
  expect(a.release).toHaveBeenCalledOnce(); expect(b.release).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][0].messages.some(m => m.role === "user" && m.image)).toBe(true);
  session.dispose(); views.dispose(); await Promise.resolve(); expect(views.budget.stats.total).toBe(0);
});

it("stopping during a supplemental export preserves both prepared and pending inputs for Continue", async () => {
  const { frame, views, session } = fixture();
  const shot = await views.capture(); views.setAttachment(shot.snapshotId, []);
  const modelGate = Promise.withResolvers<typeof final>();
  request.mockImplementationOnce(() => modelGate.promise);
  const initial = session.run("start work");
  const initialRejected = expect(initial).rejects.toThrow("cancelled");
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  const ready = { prepare: vi.fn(async () => []), release: vi.fn() };
  const first = session.submit("first supplement", {}, "next-step", ready);
  const gate = Promise.withResolvers<Awaited<ReturnType<typeof frame.image.export>>>();
  frame.image.export.mockImplementationOnce(() => gate.promise);
  const source = prepared(views.acquireAttachments()!);
  const second = session.submit("photo supplement", {}, "next-step", source);
  modelGate.resolve(final);
  await vi.waitFor(() => expect(frame.image.export).toHaveBeenCalledOnce());
  await session.stop(); await initialRejected;
  expect(session.pendingInputs.map(item => item.input.id)).toEqual([first.id, second.id]);
  expect(ready.release).not.toHaveBeenCalled(); expect(source.release).not.toHaveBeenCalled();
  gate.resolve({ width: 768, height: 432, blob: new Blob(["later"], { type: "image/jpeg" }) });
  await (await session.continue()).completion; await first.completion; await second.completion;
  expect(ready.prepare).toHaveBeenCalledOnce(); expect(source.prepare).toHaveBeenCalledTimes(2);
  expect(ready.release).toHaveBeenCalledOnce(); expect(source.release).toHaveBeenCalledOnce();
  expect(views.resourceStats.turn).toBe(1);
  expect(request.mock.lastCall![0].messages.map(m => m.content).join("\n")).toContain("photo supplement");
  session.dispose(); views.dispose();
});

it("failed preparation releases input ownership without starting a conversation turn or leaking a lease", async () => {
  const { frame, views, session } = fixture();
  const shot = await views.capture(); views.setAttachment(shot.snapshotId, []);
  frame.image.export.mockRejectedValueOnce(new Error("export failed"));
  const source = prepared(views.acquireAttachments()!);
  await expect(session.run("photo", {}, "next-step", source)).rejects.toThrow("export failed");
  expect(source.release).toHaveBeenCalledOnce(); expect(request).not.toHaveBeenCalled();
  expect(views.resourceStats.turn).toBe(0); expect(session.pendingInputs).toHaveLength(0);
  views.removeAttachment(shot.snapshotId); await Promise.resolve(); expect(views.budget.stats.total).toBe(0);
  session.dispose(); views.dispose();
});

it.each([false, true])("reads a near-limit fractional stroke in the same or later turn (sameTurn=%s) with lightweight history", async sameTurn => {
  const { frame, views, session, history } = fixture();
  const shot = await views.capture();
  const marks = (count: number): ViewAnnotation[] => [{ width: 3, color: "#ff8000", points: Array.from({ length: count }, (_, i) =>
    ({ x: i % 768 + 0.123456789012345, y: i % 432 + 0.987654321098765 })) }];
  let low = 1, high = 5000;
  while (low < high) {
    const n = Math.ceil((low + high) / 2);
    try { views.setAttachment(shot.snapshotId, marks(n)); low = n; } catch { high = n - 1; }
  }
  const fullMarks = marks(low); views.setAttachment(shot.snapshotId, fullMarks);
  expect(JSON.stringify(fullMarks).length).toBeGreaterThan(64000);
  const lease = views.acquireAttachments()!, imagePath = lease.references[0].imagePath;
  if (sameTurn) request.mockResolvedValueOnce(readImage(imagePath));
  await session.run("look", {}, "next-step", prepared(lease));
  if (!sameTurn) {
    views.setAttachment(shot.snapshotId, []); // Edit and undo/redo must not rewrite the submitted version.
    request.mockResolvedValueOnce(readImage(imagePath));
    await session.run("read the previous photo");
  }
  const messages = request.mock.lastCall![0].messages;
  expect(messages.filter(m => m.role === "tool").map(m => JSON.parse(m.content))).toContainEqual(expect.objectContaining({ ok: true }));
  expect(JSON.stringify(messages)).not.toContain('"annotations"');
  const reread = messages.filter(m => m.role === "user" && m.image).at(-1)!;
  expect(JSON.parse(await (reread as any).image.blob.text())).toEqual(fullMarks);
  expect(JSON.stringify(history.snapshot())).not.toContain("metadata");
  expect(JSON.stringify(history.snapshot()).length).toBeLessThan(4000);
  expect(views.hitPoints(shot.snapshotId, [{ x: 1, y: 1 }]).snapshotId).toBe(shot.snapshotId);
  views.removeAttachment(shot.snapshotId);
  await session.run("unrelated 1"); await session.run("unrelated 2");
  expect(views.hasImage(imagePath)).toBe(true);
  await session.run("unrelated 3");
  expect(views.hasImage(imagePath)).toBe(false); expect(frame.image.dispose).toHaveBeenCalledOnce();
  await Promise.resolve(); expect(views.budget.stats.total).toBe(0);
  const prefix = request.mock.lastCall![0].messages[5].content;
  expect(prefix).not.toContain("annotations"); expect(prefix).toContain('"available":false');
  session.dispose(); views.dispose();
});

it("actual ChatPanel registers the input before export, so its public Stop gesture cannot be undone by a late export", async () => {
  vi.stubGlobal("window", {});
  const { SeedWorldVoiceHudController } = await import("../../demos/seed-world/assistant/SeedWorldChatPanel");
  const { frame, views, session } = fixture();
  const shot = await views.capture(); views.setAttachment(shot.snapshotId, []);
  const gate = Promise.withResolvers<Awaited<ReturnType<typeof frame.image.export>>>();
  frame.image.export.mockImplementationOnce(() => gate.promise);
  const panel = {
    application: { getViewerSnapshot: () => ({}), viewSnapshots: views },
    _activity: { submit: (...args: Parameters<AIChatSession["submit"]>) => session.submit(...args) },
    session, _state: { kind: "agent" }, _traceStore: { enabled: false }, _waitForAsrCleanup: async () => {},
    _clearResultTimer() {}, _showFeedback: vi.fn(), _cancelListening() {},
    _turnRevision: 1, _turnHidden: false, _transcriptOwnsWorldInput: false,
    _view: { layout: { cancelReading() {} } }, _options: { setWorldInputEnabled() {} }
  };
  Object.setPrototypeOf(panel, SeedWorldVoiceHudController.prototype);
  const pending = SeedWorldVoiceHudController.prototype.submit.call(panel as any, "look at this picture");
  await vi.waitFor(() => expect(frame.image.export).toHaveBeenCalledOnce());
  const gesture = SeedWorldVoiceHudController.prototype.beginTaskControlGesture.call(panel as any);
  expect(gesture).toBeDefined(); gesture!.click();
  await vi.waitFor(() => expect(session.state).toBe("stopped"));
  gate.resolve({ width: 768, height: 432, blob: new Blob(["late"], { type: "image/jpeg" }) });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(request).not.toHaveBeenCalled(); expect(session.state).toBe("stopped");
  expect(session.pendingInputs).toHaveLength(1);
  session.dispose(); await pending; views.dispose(); await Promise.resolve();
  expect(views.budget.stats.total).toBe(0);
});

it("repeated photo submissions retain only small references in history and never copy full vectors to model context", async () => {
  const { views, session, history, frame } = fixture();
  const shot = await views.capture();
  const annotations = [{ width: 3, color: "#71e6ff", points: Array.from({ length: 3000 }, (_, i) => ({ x: i % 768, y: i % 432 })) }];
  views.setAttachment(shot.snapshotId, annotations);
  for (let i = 0; i < 6; i++) await session.run(`photo ${i}`, { debugMode: true }, "next-step", prepared(views.acquireAttachments()!));
  expect(frame.image.export).toHaveBeenCalledOnce();
  const presentation = session.snapshot;
  expect(presentation.tasks.every(task => task.debug?.steps.every(step => step.attempts.every(attempt => !("requestMessages" in attempt))))).toBe(true);
  expect(JSON.stringify(presentation)).not.toContain("annotations");
  expect(history.snapshot()).toHaveLength(5);
  expect(JSON.stringify(history.snapshot()).length).toBeLessThan(5000);
  for (const [call] of request.mock.calls) {
    expect(JSON.stringify(call.messages)).not.toContain('"annotations"');
    expect(call.messages[5].content.length).toBeLessThan(8000);
  }
  session.dispose(); views.dispose(); await Promise.resolve(); expect(views.budget.stats.total).toBe(0);
});

it("releases rejected submissions and a stopped queue on reset exactly once", async () => {
  const { views, session } = fixture();
  const invalid = { prepare: vi.fn(async () => []), release: vi.fn() };
  await expect(session.run(" ", {}, "next-step", invalid)).rejects.toThrow("empty");
  expect(invalid.prepare).not.toHaveBeenCalled(); expect(invalid.release).toHaveBeenCalledOnce();
  const pending = { prepare: vi.fn(() => new Promise<never>(() => {})), release: vi.fn() };
  const submitted = session.submit("queued photo", {}, "next-step", pending);
  await session.stop(); session.reset();
  await expect(submitted.completion).rejects.toThrow("removed");
  expect(pending.release).toHaveBeenCalledOnce();
  expect(session.pendingInputs).toHaveLength(0); expect(session.canContinue).toBe(false);
  expect(request).not.toHaveBeenCalled();
  session.dispose(); views.dispose();
});

it("numbers reused images by each input's order, while rereading returns only immutable photo facts", async () => {
  const { views, session } = fixture();
  const a = await views.capture(); views.setAttachment(a.snapshotId, []);
  const b = await views.capture(); views.setAttachment(b.snapshotId, []);
  const gate = Promise.withResolvers<typeof final>();
  request.mockReturnValueOnce(gate.promise).mockResolvedValue(final);
  const first = session.submit("compare both", {}, "next-step", prepared(views.acquireAttachments()!));
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  views.removeAttachment(a.snapshotId);
  const secondLease = views.acquireAttachments()!;
  expect(secondLease.references[0].metadata).not.toHaveProperty("photoNumber");
  const imagePath = secondLease.references[0].imagePath;
  const second = session.submit("now only this one", {}, "next-step", prepared(secondLease));
  gate.resolve(final); await Promise.all([first.completion, second.completion]);
  const refs = request.mock.calls[1][0].messages.filter(m => m.content.includes('"contextKind":"user_visual_reference"'))
    .map(m => JSON.parse(m.content));
  expect(refs.map(r => [r.inputId, r.photoNumber, r.photoCount])).toEqual([
    [first.id, 1, 2], [first.id, 2, 2], [second.id, 1, 1]
  ]);
  expect(refs[1].imagePath).toBe(refs[2].imagePath);
  expect(refs.every(r => !Object.hasOwn(r.metadata, "photoNumber"))).toBe(true);
  request.mockResolvedValueOnce(readImage(imagePath)).mockResolvedValueOnce(final);
  await session.run("read previous image");
  const imageReply = request.mock.lastCall![0].messages.find(m => m.content.includes('"contextKind":"view_observation"') && "image" in m && m.image)!;
  expect(imageReply).toBeDefined();
  expect(imageReply.content).not.toMatch(/photoNumber|photoCount/);
  session.dispose(); views.dispose();
});

it("publishes immutable state through preparation failure and disposal without accepting late export", async () => {
  const { session } = fixture();
  const states: string[] = [];
  session.subscribeState(value => states.push(value.state));
  const release = vi.fn();
  await expect(session.run("export failure", {}, "next-step", {
    prepare: async () => { throw new Error("encoder failed"); }, release
  })).rejects.toThrow("encoder failed");
  await vi.waitFor(() => expect(session.state).toBe("stopped"));
  expect(session.canContinue).toBe(false); expect(release).toHaveBeenCalledOnce();
  const old = session.snapshot;
  expect(old.current?.outcome).toMatchObject({ status: "failed", message: "encoder failed" });
  expect(Object.isFrozen(old.current?.progress)).toBe(true);
  const gate = Promise.withResolvers<any[]>();
  const next = session.run("pending", {}, "next-step", { prepare: () => gate.promise, release: vi.fn() });
  expect(session.state).toBe("preparing"); session.dispose();
  await expect(next).rejects.toThrow("removed");
  gate.resolve([]); await new Promise(resolve => setTimeout(resolve, 0));
  expect(session.state).toBe("disposed"); expect(states.at(-1)).toBe("disposed");
  expect(old.current?.input).toBe("export failure"); expect(request).not.toHaveBeenCalled();
});
