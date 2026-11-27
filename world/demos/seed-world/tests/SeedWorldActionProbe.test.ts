import assert from "node:assert/strict";
import test from "node:test";
import { startSeedWorldActionProbe } from "../assistant/SeedWorldActionProbe.ts";

for (const variant of ["valid", "wrong nonce", "truncated", "unexpected tool"]) {
  test("snapshot probe handles " + variant, async t => {
    const reply = (request: Record<string, unknown>) => Promise.resolve({
      type: "lingguang_seed_world_stream_result",
      version: 1,
      nonce: variant === "wrong nonce" ? "old-frame" : request.streamResponseNonce,
      result: {
        finishReason: variant === "truncated" ? "length" : "tool_calls",
        toolCalls: [{ type: "function", id: "view-1", function: {
          name: variant === "unexpected tool" ? "execute" : "snapshot", arguments: "{}"
        } }]
      }
    });
    const global = globalThis as typeof globalThis & { lingguang?: unknown };
    const old = Object.getOwnPropertyDescriptor(global, "lingguang");
    Object.defineProperty(global, "lingguang", {
      configurable: true,
      value: { ai: { seedWorldStream: reply, seedWorldStop: async () => ({}) } }
    });
    t.after(() => {
      if (old) Object.defineProperty(global, "lingguang", old);
      else delete global.lingguang;
    });
    let reads = 0;
    const attempt = startSeedWorldActionProbe(async () => ++reads);
    if (variant === "valid") {
      assert.deepEqual(await attempt.result, { toolCallId: "view-1", snapshot: 1 });
      assert.equal(reads, 1);
    } else {
      await assert.rejects(attempt.result);
      assert.equal(reads, 0);
    }
  });
}
