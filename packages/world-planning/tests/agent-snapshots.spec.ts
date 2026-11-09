import { collectCallEvidence } from "../../ai-chat/tests/llm/call-evidence.mjs";
import { expect, it, vi } from "vitest";
import { AgentImageStore } from "@galacean/engine-ai-chat/ai-chat/agent-image-store.ts";
import { parseSnapshotPick } from "@galacean/engine-ai-chat/ai-chat/agent-snapshots.ts";
import { buildAgentToolDefinitions } from "@galacean/engine-ai-chat/ai-chat/agent-protocol.ts";
import { createTestAgentLoop } from "../../ai-chat/tests/AIChatTestRuntime";
import { SeedWorldViewSnapshots } from "../src/world/SeedWorldViewSnapshot";
vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat } from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";
const call = (name: string, args: unknown) => ({ content: "", finishReason: "tool_calls" as const,
  toolCalls: [{ id: name, type: "function" as const, function: { name, arguments: JSON.stringify(args) } }] });
const final = { content: "done", finishReason: "stop" as const, toolCalls: [] };
function fixture() {
  let state = "original";
  const pose = { capturedAt: "2026-11-04T00:00:00.000Z", viewer: { position: [1, 2, 3], forward: [0, 0, 1] } };
  const frame = { metadata: structuredClone(pose), width: 2, height: 2,
    image: { texture: {} as any, width: 2, height: 2, dispose: vi.fn(),
      export: vi.fn(async () => ({ blob: new Blob(["photo"], { type: "image/jpeg" }), width: 2, height: 2 })) },
    identities: { identityBits: 14, estimatedPosition: () => undefined, byteLength: 16, dispose: vi.fn(), read: vi.fn((_x: number, _y: number, width: number, height: number) => {
      const bytes = new Uint8Array(width * height * 4);
      for (let i = 0; i < bytes.length; i += 4) bytes[i] = 1;
      return bytes;
    }), resolve: () => ({ entityId: 10, componentId: 11, componentType: "MeshRenderer" }) }
  };
  const capture = vi.fn(() => frame);
  const views = new SeedWorldViewSnapshots(capture, () => state);
  const definition = { scriptApi: { catalog: "view", entries: [], modules: [] }, toolNames: [],
    imageResources: views, captureSnapshot: (signal: AbortSignal) => views.snapshot(signal) };
  return { frame, capture, views, definition, pose, change: () => { state = "changed"; } };
}
it("routes snapshot, read and pick through one frame without duplicate capture or encoding", async () => {
  const f = fixture(), request = vi.mocked(requestAsapChat); request.mockReset();
  request.mockResolvedValueOnce(call("snapshot", {}));
  let path = "";
  request.mockImplementationOnce(async ({ messages }) => {
    path = JSON.parse(messages.find(m => m.role === "tool")!.content).result.imagePath;
    expect(path).toMatch(/^\.ai\/snapshots\//);
    f.change();
    return call("read", { file_path: path, offset: null, limit: null });
  });
  request.mockImplementationOnce(async ({ messages }) => {
    expect(JSON.parse(messages.at(-2)!.content).metadata).toMatchObject(f.pose);
    return call("pick", { file_path: path, points: [{ x: 0, y: 0 }] });
  });
  request.mockResolvedValueOnce(final);
  const loop = createTestAgentLoop({ definition: f.definition, tools: [] });
  const events: any[] = []; loop.subscribe(e => events.push(e));
  await loop.run("看看这个人", { debugMode: true });
  const reply = request.mock.calls[3][0].messages.find(m => m.role === "tool" && m.toolCallId === "pick")!;
  expect(JSON.parse(reply.content)).toMatchObject({ ok: true, result: { ...f.pose, file_path: path,
    currentScene: false, hits: [{ status: "hit", hit: { ref: { entityId: 10 } } }] } });
  expect(f.capture).toHaveBeenCalledOnce(); expect(f.frame.image.export).toHaveBeenCalledOnce();
  expect(events.filter(e => e.type === "tool_finished").map(e => [e.tool, e.result.ok])).toEqual([
    ["snapshot", true], ["read", true], ["pick", true]
  ]);
  const evidence = collectCallEvidence({ agentEvents: events.map(event => ({event})) });
  expect(evidence.errors).toEqual([]);
  expect(evidence.complete).toBe(true);
  expect(events.findLast(e => e.type === "image_resources")).toMatchObject({ action: "released", storedBytes: 0 });
  expect(f.views.hasImage(path)).toBe(true); // Conversation owns retained frames; task cleanup releases leases only.
  f.views.dispose(); await Promise.resolve(); expect(f.views.budget.stats.total).toBe(0);
});
it("keeps a later failed invocation separate when the model reuses a successful pick ID", async () => {
  const f = fixture(), request = vi.mocked(requestAsapChat); request.mockReset();
  const photo = await f.views.snapshot(new AbortController().signal);
  request.mockResolvedValueOnce(call("pick", { file_path: photo.imagePath, points: [{ x: 0, y: 0 }] }))
    .mockResolvedValueOnce(call("pick", { file_path: ".ai/snapshots/missing.jpg", points: [{ x: 0, y: 0 }] }))
    .mockResolvedValueOnce(final);
  const loop = createTestAgentLoop({ definition: f.definition, tools: [] });
  const events: any[] = []; loop.subscribe(event => events.push(event));
  try {
    await loop.run("查看两张照片", { debugMode: true });
    const evidence = collectCallEvidence({ agentEvents: events.map(event => ({ event })) });
    expect(evidence.complete).toBe(true); // Evidence is complete; the second operation still failed.
    expect(evidence.exchanges).toHaveLength(2);
    const [first, second] = evidence.exchanges;
    expect(first.call.id).toBe(second.call.id);
    expect(first.key).not.toBe(second.key);
    expect([first, second].map(record => record.finishes[0].result.ok)).toEqual([true, false]);
    expect([first, second].map(record => JSON.parse(record.reply.content).ok)).toEqual([true, false]);
    expect(JSON.parse(second.reply.content).error.code).toBe("SNAPSHOT_NOT_FOUND");
  } finally { f.views.dispose(); }
});
it("user photos, annotated versions and Agent images share pick data, timestamps and VFS paths", async () => {
  const f = fixture(), shot = await f.views.capture();
  f.views.setAttachment(shot.snapshotId, [{ points: [{ x: 0, y: 0 }], width: 1, color: "#ffffff" }]);
  const lease = f.views.acquireAttachments()!;
  const [photo] = await lease.export();
  const store = new AgentImageStore(f.views);
  const saved = store.save(photo);
  expect(saved.reference.capturedAt).toBe(f.pose.capturedAt);
  expect([...store.provider.paths()]).toContain(photo.imagePath);
  expect(await store.provider.open!(photo.imagePath!)).toEqual({ kind: "binary", byteLength: 5 });
  expect(store.pick({ file_path: photo.imagePath!, points: [{ x: 0, y: 0 }] })).toMatchObject({ hits: [{ status: "hit" }] });
  store.read(photo.imagePath!); expect(f.frame.image.export).toHaveBeenCalledOnce();
  f.views.removeAttachment(shot.snapshotId); lease.release();
  f.views.beginTurn(10); expect(f.views.hasImage(photo.imagePath!)).toBe(true);
  store.dispose();
  expect(() => f.views.pick({ file_path: photo.imagePath!, points: [{x:0,y:0}] })).toThrowError(/过期/);
  expect(() => f.views.acquireImage(".ai/snapshots/unknown.jpg")).toThrowError(/找不到/);
  f.views.dispose();
});
it("validates pick modes and exposes only the new public visual tools", () => {
  const f = fixture();
  const names = buildAgentToolDefinitions(f.definition).map(t => t.function.name);
  expect(names).toEqual(expect.arrayContaining(["snapshot", "pick", "read"]));
  for (const name of ["pointer", "read_image", "observe_view"]) expect(names).not.toContain(name);
  for (const input of [
    { file_path: "elsewhere.png", points: [{x:0,y:0}] },
    { file_path: ".ai/snapshots/a.jpg" },
    { file_path: ".ai/snapshots/a.jpg", points: [{x:-1,y:0}] },
    { file_path: ".ai/snapshots/a.jpg", points: [{x:0,y:0}], limit: 1 },
    { file_path: ".ai/snapshots/a.jpg", points: [{x:0,y:0}], region: {kind:"stroke",points:[{x:0,y:0}],radius:1} }
  ]) expect(() => parseSnapshotPick(input)).toThrow();
  f.views.dispose();
});
it("reports an unknown snapshot as a failed call and never captures a replacement silently", async () => {
  const f = fixture(), request = vi.mocked(requestAsapChat); request.mockReset();
  request.mockResolvedValueOnce(call("pick", { file_path: ".ai/snapshots/unknown.jpg", points: [{x:0,y:0}] })).mockResolvedValueOnce(final);
  const loop = createTestAgentLoop({ definition: f.definition, tools: [] });
  await loop.run("inspect", {});
  expect(JSON.parse(request.mock.lastCall![0].messages.at(-2)!.content)).toMatchObject({ok:false,error:{code:"SNAPSHOT_NOT_FOUND"}});
  expect(f.capture).not.toHaveBeenCalled(); f.views.dispose();
});

it("binary VFS inspection does not acquire or refresh a snapshot lease", async () => {
  const f = fixture(), image = await f.views.snapshot(new AbortController().signal);
  const acquire = vi.spyOn(f.views, "acquireImage");
  const store = new AgentImageStore(f.views);
  expect([...store.provider.paths()]).toContain(image.imagePath);
  expect(await store.provider.open!(image.imagePath!)).toEqual({kind:"binary"});
  expect(acquire).not.toHaveBeenCalled();
  expect(store.bytes).toBe(0);
  store.dispose(); f.views.dispose();
});
