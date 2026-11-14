import { fixtureBlob, serializedImages } from "./image-fixture";
import { imageDataUrl, ImageResourceBudget } from "../src/ai-chat/image-resources";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/ai-chat/asap-chat", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat, type AsapChatResult } from "../src/ai-chat/asap-chat";
import { AgentImageStore, AgentImageStorageLimitError } from "../src/ai-chat/agent-image-store";
import { AgentContextTranscript } from "../src/ai-chat/context-compaction";
import { buildAgentToolDefinitions, parseAgentToolCall } from "../src/ai-chat/agent-protocol";
import type { AgentEvent, AgentMessage } from "../src/ai-chat/agent-types";
import { createTestAgentLoop } from "./AIChatTestRuntime";

const request = vi.mocked(requestAsapChat);
const definition = { scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: [] };
const observation = (n = 1) => ({ image: { blob: fixtureBlob(`data:image/png;base64,${btoa(String(n))}`), width: n, height: 1 }, metadata: { view: n } });
const final = (): AsapChatResult => ({ content: "done", toolCalls: [], finishReason: "stop" });
const tool = (id: string, name = "snapshot", args = {}): AsapChatResult => ({ content: "", finishReason: "tool_calls", toolCalls: [
  { id, type: "function", function: { name, arguments: JSON.stringify(args) } }
] });
const imagesIn = (messages: readonly AgentMessage[]) => messages.filter(m => m.role === "user" && m.image);
function pairs(events: AgentEvent[], count: number) {
  const messages = events.flatMap(e => e.type === "transcript_appended" ? e.messages : []);
  const calls = messages.flatMap(m => m.role === "assistant" ? m.toolCalls ?? [] : []).map(t => t.id);
  expect(calls).toHaveLength(count);
  expect(messages.flatMap(m => m.role === "tool" ? [m.toolCallId] : [])).toEqual(calls);
}
beforeEach(() => request.mockReset());
afterEach(() => vi.restoreAllMocks());

it("continues past four observations, compacts offloaded history, and rereads exact originals without recapturing", async () => {
  let captured = 0;
  let firstId = "";
  const events: AgentEvent[] = [];
  const captureSnapshot = vi.fn(async () => observation(++captured));
  request.mockImplementation(async options => {
    const n = request.mock.calls.length;
    expect(imagesIn(options.messages).length).toBeLessThanOrEqual(4);
    const task = JSON.parse(options.messages.at(-1).content);
    expect(JSON.parse(options.messages[3].content).instruction).toBe("preserve constraints");
    expect(options.contextCompaction).toEqual({ version: 2, protectedPrefixLength: n === 1 ? 6 : 5 });
    if (n === 2) firstId = task.images[0].imagePath;
    if (n === 6) {
      expect(options.messages[7]).toMatchObject({ role: "user" });
      expect(options.messages[7].content).toContain(firstId);
      expect(imagesIn(options.messages).map(m => m.role === "user" && m.image!.width)).toEqual([2, 3, 4, 5]);
    }
    if (n >= 7) expect(task.images[0].imagePath).toBe(firstId);
    if (n === 9) {
      expect(imagesIn(options.messages).map(m => m.role === "user" && m.image!.width)).toEqual([5, 6, 7, 1]);
      expect(options.messages.at(-2)).toMatchObject({ image: observation().image });
      expect(task.images).toHaveLength(7);
    }
    const response = n <= 7 ? tool(`view-${n}`) : n === 8 ? tool("reread", "read", { file_path: firstId }) : final();
    return { ...response, telemetry: { modelName: "fixture", usage: { source: "provider", inputTokens: n * 100, outputTokens: 10 } },
      ...(n === 6 ? { contextCompaction: { version: 2, status: "compacted", strategy: "summary", beforeTokens: 1000,
        afterTokens: 500, durationMs: 1, replacement: { prefixLength: 5, cutIndex: 3, summary: "first observation summarized" } } } : {}) } as AsapChatResult;
  });
  const loop = createTestAgentLoop({ tools: [], definition: { ...definition, captureSnapshot } });
  loop.subscribe(e => events.push(e));
  const result = await loop.run("preserve constraints", { debugMode: true });
  expect(result.result.status).toBe("completed");
  expect(captureSnapshot).toHaveBeenCalledTimes(7);
  expect(request).toHaveBeenCalledTimes(9);
  expect(result.steps.flatMap(s => s.attempts).map(a => a.telemetry?.usage?.inputTokens)).toEqual([100,200,300,400,500,600,700,800,900]);
  pairs(events, 8);
  // Live image events feed the attachment store; attempt/transcript diagnostics stay redacted.
  expect(JSON.stringify(events.filter(event => event.type !== "model_request" && event.type !== "view_observed")))
    .not.toContain((await imageDataUrl(observation().image.blob)));
  expect(events.find(event => event.type === "view_observed")).toMatchObject({ image: observation().image });
  const releases = events.filter(event => event.type === "image_resources" && event.action === "released");
  expect(releases).toHaveLength(1);
  expect(releases[0]).toMatchObject({ storedCount: 0, storedBytes: 0 });
  expect(events.indexOf(releases[0])).toBeLessThan(events.findIndex(event => event.type === "task_completed"));
});

it("cancellation releases existing images immediately and ignores a late capture with a paired cancelled receipt", async () => {
  const pending = Promise.withResolvers<ReturnType<typeof observation>>();
  const entered = Promise.withResolvers<void>();
  const dispose = vi.spyOn(AgentImageStore.prototype, "dispose");
  const save = vi.spyOn(AgentImageStore.prototype, "save");
  const events: AgentEvent[] = [];
  let captured = 0;
  const loop = createTestAgentLoop({ tools: [], definition: { ...definition, captureSnapshot: async () => {
    if (++captured === 6) { entered.resolve(); return pending.promise; }
    return observation(captured);
  } } });
  loop.subscribe(e => events.push(e));
  request.mockImplementation(async () => tool(`view-${request.mock.calls.length}`));
  const outcome = loop.run("cancel capture", { debugMode: true }).catch(e => e);
  await entered.promise;
  loop.cancel();
  expect(dispose).toHaveBeenCalledOnce();
  expect(events.at(-1)).toMatchObject({ type: "image_resources", action: "released", storedCount: 0, storedBytes: 0 });
  pending.resolve(observation(6));
  expect((await outcome).message).toContain("cancelled");
  expect(save).toHaveBeenCalledTimes(5);
  expect(dispose).toHaveBeenCalledOnce();
  pairs(events, 6);
  request.mockResolvedValueOnce(final());
  await loop.run("next task", {});
  expect(request.mock.lastCall![0].messages).toHaveLength(6);
  expect(JSON.parse(request.mock.lastCall![0].messages[5].content).images).toBeUndefined();
});

it("releases images on model errors and preserves provider usage without a retry", async () => {
  const dispose = vi.spyOn(AgentImageStore.prototype, "dispose");
  const events: AgentEvent[] = [];
  const telemetry = { modelName: "fixture", usage: { source: "provider" as const, inputTokens: 250, outputTokens: 9 } };
  request.mockResolvedValueOnce(tool("view")).mockRejectedValueOnce(Object.assign(new Error("provider failed"), { telemetry }));
  const loop = createTestAgentLoop({ tools: [], definition: { ...definition, captureSnapshot: async () => observation() } });
  loop.subscribe(e => events.push(e));
  await expect(loop.run("task", { debugMode: true })).rejects.toThrow("provider failed");
  expect(dispose).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledTimes(2);
  expect(events.find(e => e.type === "model_failed")).toMatchObject({ attempts: [{ telemetry }] });
  pairs(events, 1);
});

it("unknown image IDs produce a paired failure without capturing or adding an image", async () => {
  const captureSnapshot = vi.fn(async () => observation());
  request.mockResolvedValueOnce(tool("missing", "read", { file_path: ".ai/snapshots/other-task.png" })).mockResolvedValueOnce(final());
  const loop = createTestAgentLoop({ tools: [], definition: { ...definition, captureSnapshot } });
  await loop.run("task", {});
  expect(captureSnapshot).not.toHaveBeenCalled();
  expect(JSON.parse(request.mock.lastCall![0].messages.at(-2)!.content)).toMatchObject({ ok: false, error: { code: "SNAPSHOT_UNAVAILABLE" } });
  expect(imagesIn(request.mock.lastCall![0].messages)).toHaveLength(0);
});

it("keeps immutable originals, accounts a byte budget, and makes released images unreadable", () => {
  const store = new AgentImageStore();
  const original = observation();
  const saved = store.save(original);
  original.metadata.view = 99;
  saved.image.blob = new Blob(["mutated"]);
  expect(store.read(saved.reference.imagePath)).toMatchObject({ image: observation().image, metadata: { view: 1 } });
  const large = { ...observation(), image: { ...observation().image, blob: new Blob([new Uint8Array(1536 * 1024)], { type: "image/png" }) } };
  expect(() => { for (let i = 0; i < 50; i++) store.save(large); }).toThrow(AgentImageStorageLimitError);
  expect(store.bytes).toBeLessThanOrEqual(64 * 1024 * 1024);
  expect(store.read(saved.reference.imagePath).image).toEqual(observation().image);
  store.dispose();
  expect(store.size).toBe(0); expect(store.bytes).toBe(0);
  expect(() => store.read(saved.reference.imagePath)).toThrow("released");
  expect(() => store.save(observation())).toThrow("released");
});

it("storage exhaustion ends the task after a paired failure rather than retrying forever", async () => {
  vi.spyOn(AgentImageStore.prototype, "save").mockImplementation(() => { throw new AgentImageStorageLimitError(); });
  request.mockResolvedValueOnce(tool("full"));
  const events: AgentEvent[] = [];
  const loop = createTestAgentLoop({ tools: [], definition: { ...definition, captureSnapshot: async () => observation() } });
  loop.subscribe(e => events.push(e));
  await expect(loop.run("task", { debugMode: true })).rejects.toThrow("Snapshot storage is full");
  expect(request).toHaveBeenCalledOnce(); pairs(events, 1);
  expect(JSON.stringify(events)).toContain("IMAGE_STORAGE_LIMIT");
});

it("offloading preserves canonical evidence and rejects snapshots invalidated by a history change", () => {
  const context = new AgentContextTranscript();
  for (let i = 1; i <= 5; i++) context.push({ role: "user", content: JSON.stringify({ imagePath: String(i) }), image: observation(i).image });
  const sent: AgentMessage[] = [{ role: "system", content: "rules" }, { role: "user", content: '{"contextKind":"agent_task"}' }, ...context.active];
  const snapshot = context.captureRequest(sent);
  expect(context.offloadImages()).toBe(1);
  expect(imagesIn(context.active)).toHaveLength(4);
  expect(imagesIn(context.canonical)).toHaveLength(0);
  expect(context.canonical.map(m => JSON.parse(m.content).imagePath)).toEqual(["1", "2", "3", "4", "5"]);
  expect(context.offloadImages()).toBe(0);
  expect(() => context.applyResponse(snapshot, sent, undefined)).toThrow("stale");
  context.clear(); expect(context.active).toEqual([]); expect(context.canonical).toEqual([]);
});

it.each([false, true])("bounds retained image bytes across 129 reads (compaction=%s)", compact => {
  const store = new AgentImageStore();
  const context = new AgentContextTranscript();
  const original = { ...observation(), image: { ...observation().image, blob: new Blob([new Uint8Array(64 * 1024)], { type: "image/png" }) } };
  const { reference } = store.save(original);
  const storedBytes = store.bytes;
  let compactions = 0;
  for (let n = 0; n < 129; n++) {
    const saved = store.read(reference.imagePath);
    expect(saved.image).toEqual(original.image);
    const id = `read-${n}`;
    context.push(
      { role: "assistant", content: "", toolCalls: tool(id, "read", { file_path: reference.imagePath }).toolCalls },
      { role: "tool", toolCallId: id, content: JSON.stringify({ ok: true, result: saved.reference }) },
      { role: "user", content: JSON.stringify({ contextKind: "view_observation", ...saved.reference }), image: saved.image }
    );
    context.offloadImages();
    const active = context.active;
    if (compact && n >= 4) {
      // Keep the latest four image exchanges; summarize only whole older Tool groups.
      const cutIndex = active.findIndex(m => m.role === "user" && m.image) - 2;
      const sent: AgentMessage[] = [{ role: "system", content: "rules" },
        { role: "user", content: JSON.stringify({ contextKind: "agent_task", images: store.references() }) }, ...active];
      context.applyResponse(context.captureRequest(sent), sent, {
        version: 2, status: "compacted", strategy: "summary", beforeTokens: 1000, afterTokens: 500, durationMs: 0,
        replacement: { prefixLength: 2, cutIndex, summary: "older image exchanges summarized" }
      });
      compactions++;
    }
    // Deterministic retention budget, independent of GC timing or engine string sharing.
    const retained = [...context.canonical, ...context.active];
    const historyImageBytes = retained.reduce((bytes, m) => bytes + (m.role === "user" && m.image ? 2 * m.image.blob.size : 0), 0);
    expect(historyImageBytes).toBeLessThanOrEqual(4 * 2 * original.image.blob.size);
    expect(store.bytes).toBe(storedBytes);
    saved.image.blob = new Blob(["mutated caller copy"]);
  }
  expect(compactions).toBe(compact ? 125 : 0);
  const evidence = context.canonical;
  const ids = Array.from({ length: 129 }, (_, n) => `read-${n}`);
  expect(evidence.flatMap(m => m.role === "assistant" ? m.toolCalls!.map(t => t.id) : [])).toEqual(ids);
  expect(evidence.flatMap(m => m.role === "tool" ? [m.toolCallId] : [])).toEqual(ids);
  expect(evidence.filter(m => m.role === "user").every(m =>
    m.content === JSON.stringify({ contextKind: "view_observation", ...reference }))).toBe(true);
  expect(store.read(reference.imagePath).image).toEqual(original.image);
  context.clear(); store.dispose();
  expect(context.canonical).toEqual([]); expect(context.active).toEqual([]);
  expect(store.bytes).toBe(0); expect(store.size).toBe(0);
  expect(() => store.read(reference.imagePath)).toThrow("released");
});

it("uses native read for images and removes old visual tools", () => {
  const names = buildAgentToolDefinitions(definition).map(t => t.function.name);
  expect(names).toContain("read");
  expect(names).not.toContain("read_image");
  expect(names).not.toContain("pointer");
  expect(names).not.toContain("observe_view");
});

it("validates the full image-message envelope before borrowing resources, and releases a rejected historical read", () => {
  const release = vi.fn();
  const metadata = { text: "x".repeat(65400) };
  const image = observation().image;
  const resources = { budget: new ImageResourceBudget(), hasImage: () => true,
    acquireImage: vi.fn(() => ({ observation: { imagePath: ".ai/snapshots/" + "a".repeat(160), image, metadata }, release })) };
  const store = new AgentImageStore(resources as any);
  // Valid as a standalone AgentValue; the transport wrapper pushes it over 64 KiB.
  expect(JSON.stringify(metadata).length).toBeLessThan(65536);
  expect(() => store.save({ imagePath: ".ai/snapshots/" + "a".repeat(160), image, metadata })).toThrow("65536");
  expect(resources.acquireImage).not.toHaveBeenCalled();
  expect(resources.budget.stats.total).toBe(0);
  const history = new AgentImageStore(resources as any, [{ imagePath: ".ai/snapshots/" + "a".repeat(160), width: 1, height: 1, capturedAt: "now" }]);
  expect(() => history.read(".ai/snapshots/" + "a".repeat(160))).toThrow("65536");
  expect(release).toHaveBeenCalledOnce();
  store.dispose(); history.dispose();
  expect(release).toHaveBeenCalledOnce();
});

it.each(["offset", "column", "limit"])("rejects text pagination %s for snapshot reads", async field => {
  const events: AgentEvent[] = [];
  request.mockResolvedValueOnce(tool("invalid-page", "read", {
    file_path: ".ai/snapshots/example/image.png", [field]: 1
  })).mockResolvedValueOnce(final());
  const loop = createTestAgentLoop({ tools: [], definition });
  loop.subscribe(event => events.push(event));
  await loop.run("read this snapshot", {});
  expect(events.find(event => event.type === "tool_finished")).toMatchObject({
    result: { ok: false, error: { message: "Snapshot images do not have line offsets, columns or limits; pass null" } }
  });
});
