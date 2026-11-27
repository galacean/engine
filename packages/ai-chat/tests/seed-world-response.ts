/** SDK response for a provider result carried by the Seed World terminal frame. */
export function seedWorldResponse(request: { streamResponseNonce: string }, result: unknown) {
  return { content: JSON.stringify({
    type: "lingguang_seed_world_stream_result", version: 1, nonce: request.streamResponseNonce, result
  }) };
}
