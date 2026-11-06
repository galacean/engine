import { fixtureBlob } from "./image-fixture";
import { describe, expect, it } from "vitest";
import { AgentContextTranscript, createContextCompactionRequest, parseContextCompaction } from "../src/ai-chat/context-compaction";
import type { ContextCompactionResult } from "../src/ai-chat/context-compaction";
import type { AgentMessage } from "../src/ai-chat/agent-types";
import { formatContextTrace } from "../src/ai-chat/context-trace";

const prefix: AgentMessage[] = [{ role: "system", content: "rules" }, { role: "user", content: '{"contextKind":"agent_task","instruction":"keep the task"}' }];
const pair: AgentMessage[] = [
  { role: "assistant", content: "", toolCalls: [{ id: "a", type: "function", function: { name: "execute", arguments: "{}" } }] },
  { role: "tool", toolCallId: "a", content: "original tool receipt" }
];
const compacted: ContextCompactionResult = {
  version: 2, status: "compacted", strategy: "summary", beforeTokens: 100, afterTokens: 40, durationMs: 2,
  replacement: { prefixLength: 2, cutIndex: 2, summary: "server summary verbatim" }
};

function prepare(tail: AgentMessage[] = pair) {
  const context = new AgentContextTranscript();
  context.push(...tail);
  const sent = [...structuredClone(prefix), ...context.active];
  return { context, sent, request: context.captureRequest(sent) };
}

describe("compaction contract", () => {
  it("uses only explicit budgets and server defaults", () => {
    expect(createContextCompactionRequest()).toEqual({ version: 2, protectedPrefixLength: 2 });
    expect(createContextCompactionRequest({ triggerTokens: 100, targetTokens: 30 })).toMatchObject({ triggerTokens: 100, targetTokens: 30 });
    for (const bad of [{ triggerTokens: 0 }, { targetTokens: Infinity }, { triggerTokens: 2, targetTokens: 2 }, { targetTokens: -1 }]) {
      expect(() => createContextCompactionRequest(bad)).toThrow();
    }
  });

  it.each([
    null, {}, { ...compacted, version: 3 }, { ...compacted, status: "unknown" }, { ...compacted, strategy: "truncate" },
    { ...compacted, afterTokens: 100 }, { ...compacted, beforeTokens: NaN }, { ...compacted, durationMs: -1 },
    { ...compacted, replacement: undefined }, { ...compacted, reason: 3 }, { ...compacted, messages: [] },
    ...[
      { prefixLength: 1 }, { cutIndex: 0 }, { cutIndex: -1 }, { cutIndex: 1.5 }, { summary: "  " }, { summary: null }, { messages: [] }
    ].map(patch => ({ ...compacted, replacement: { ...compacted.replacement!, ...patch } })),
    { ...compacted, status: "failed" }, { ...compacted, status: "not_needed", replacement: undefined }
  ])("rejects malformed metadata without repairing or echoing it", bad => {
    expect(() => parseContextCompaction(bad)).toThrow("Invalid contextCompaction");
  });

  it.each(["failed", "not_needed"] as const)("retains history for %s and missing old-server metadata", status => {
    const { context, request, sent } = prepare();
    const result = { version: 2, status, strategy: "summary", beforeTokens: 100, afterTokens: 100, durationMs: 0 };
    expect(context.applyResponse(request, sent, result)).toEqual(result);
    expect(context.active).toEqual(pair);
    expect(parseContextCompaction(undefined)).toBeUndefined();
  });

  it("replaces only active history once, retains canonical evidence and opaque server summary", () => {
    const { context, request, sent } = prepare();
    context.applyResponse(request, sent, compacted);
    expect(context.active).toEqual([{ role: "user", content: compacted.replacement!.summary }]);
    expect(context.canonical).toEqual(pair);
    expect(sent.slice(0, 2)).toEqual(prefix);
    expect(() => context.applyResponse(request, sent, compacted)).toThrow("duplicate or stale");
    expect(context.active).toHaveLength(1);
  });

  it("rejects stale state and mismatched sent prefix", () => {
    const stale = prepare();
    stale.context.push({ role: "user", content: "new state" });
    expect(() => stale.context.applyResponse(stale.request, stale.sent, compacted)).toThrow("stale");
    const changed = prepare();
    changed.sent[1].content = "changed task";
    expect(() => changed.context.applyResponse(changed.request, changed.sent, compacted)).toThrow("sent prefix");
    expect(changed.context.active).toEqual(pair);
  });

  it.each([1, 3])("rejects split or out-of-range cut %s atomically", cutIndex => {
    const { context, request, sent } = prepare();
    expect(() => context.applyResponse(request, sent, { ...compacted, replacement: { ...compacted.replacement, cutIndex } })).toThrow();
    expect(context.active).toEqual(pair);
  });

  it.each([
    [{ role: "tool", toolCallId: "orphan", content: "x" }],
    [pair[0], { role: "tool", toolCallId: "wrong", content: "x" }],
    [pair[0], { role: "user", content: "interleaved" }, pair[1]],
    [pair[0]]
  ] as AgentMessage[][])("rejects invalid atomic tool groups", (...tail) => {
    const { context, request, sent } = prepare(tail);
    expect(() => context.applyResponse(request, sent, { ...compacted, replacement: { ...compacted.replacement, cutIndex: tail.length } })).toThrow();
  });

  it("allows reused IDs in completed exchanges but rejects duplicates within one assistant group", () => {
    const valid = prepare([...pair, ...pair]);
    valid.context.applyResponse(valid.request, valid.sent, compacted);
    expect(valid.context.active.slice(1)).toEqual(pair);
    const call = (pair[0] as Extract<AgentMessage, { role: "assistant" }>).toolCalls![0];
    const invalid = prepare([{ role: "assistant", content: "", toolCalls: [call, call] }, pair[1], pair[1]]);
    expect(() => invalid.context.applyResponse(invalid.request, invalid.sent, {
      ...compacted, replacement: { ...compacted.replacement, cutIndex: 3 }
    })).toThrow("duplicate Tool call within group");
  });

  it.each([
    { role: "system", content: "fixed suffix" },
    { role: "user", content: "image", image: { blob: fixtureBlob("data:image/png;base64,YQ=="), width: 1, height: 1 } }
  ] as AgentMessage[])("preserves protected suffixes and rejects their removal", protectedMessage => {
    const tail = [...pair, protectedMessage];
    const good = prepare(tail);
    good.context.applyResponse(good.request, good.sent, compacted);
    expect(good.context.active[1]).toEqual(protectedMessage);
    const bad = prepare(tail);
    expect(() => bad.context.applyResponse(bad.request, bad.sent, {
      ...compacted, replacement: { ...compacted.replacement, cutIndex: 3 }
    })).toThrow("protected");
    expect(bad.context.active).toEqual(tail);
  });

  it("displays compaction counters and the server reason without summary content", () => {
    const text = formatContextTrace([{ elapsedMilliseconds: 0, event: { type: "model_finished", step: { step: 1, attempts: [{
      attempt: 1, error: null, contextCompaction: { ...compacted, reason: "protected image prevents compaction" }
    }] } } }]);
    expect(text).toContain("compacted；100 → 40 token；2 ms");
    expect(text).not.toContain("server summary");
    expect(text).toContain("protected image prevents compaction");
  });
});
