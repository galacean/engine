// Experimental debug entry. Only a validated snapshot call may reach the game.
type ProbeBridge = {
  seedWorldStream(request: Record<string, unknown>): Promise<unknown>;
  seedWorldStop(sessionId: string): Promise<unknown>;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("Malformed Seed World probe response");
  return value as Record<string, unknown>;
}

export function startSeedWorldActionProbe(captureSnapshot: (signal: AbortSignal) => Promise<unknown>) {
  const ai = (globalThis as { lingguang?: { ai?: ProbeBridge } }).lingguang?.ai;
  if (!ai?.seedWorldStream || !ai.seedWorldStop) throw new Error("Seed World probe requires the experimental shell");
  const sessionId = "seed-world-" + crypto.randomUUID().replace(/-/g, "");
  const nonce = crypto.randomUUID();
  const controller = new AbortController();
  const result = ai.seedWorldStream({
    signal: controller.signal,
    version: 1,
    sessionId,
    queryId: crypto.randomUUID(),
    streamResponseNonce: nonce,
    messages: [{ role: "user", content: "Call snapshot exactly once with {} to inspect the current view." }],
    tools: [{ type: "function", function: {
      name: "snapshot",
      description: "Read the current view without editing the world",
      strict: true,
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false }
    } }]
  }).then(async raw => {
    controller.signal.throwIfAborted();
    const result = record(raw);
    const frame = record(typeof result.content === "string" ? JSON.parse(result.content) : result);
    if (frame.type !== "lingguang_seed_world_stream_result" || frame.version !== 1 || frame.nonce !== nonce)
      throw new Error("Unexpected probe response envelope");
    const reply = record(frame.result);
    const calls = reply.toolCalls;
    if (reply.error || reply.finishReason !== "tool_calls" || !Array.isArray(calls) || calls.length !== 1)
      throw new Error("No complete snapshot call");
    const call = record(calls[0]);
    const fn = record(call.function);
    if (call.type !== "function" || !call.id || fn.name !== "snapshot" || typeof fn.arguments !== "string")
      throw new Error("Unexpected tool call");
    const args: unknown = JSON.parse(fn.arguments);
    if (Array.isArray(args) || Object.keys(record(args)).length) throw new Error("Unexpected snapshot arguments");
    return { toolCallId: call.id, snapshot: await captureSnapshot(controller.signal) };
  });
  return {
    sessionId,
    result,
    async stop() {
      controller.abort();
      const receipt = record(await ai.seedWorldStop(sessionId));
      if (receipt.success !== true || receipt.status !== "accepted" || !receipt.executionId)
        throw new Error("ASAP did not accept a stop for an active execution: " + String(receipt.status));
      return receipt;
    }
  };
}
