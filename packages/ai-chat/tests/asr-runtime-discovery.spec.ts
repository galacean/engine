import { afterEach, expect, it, vi } from "vitest";
import { createAsrClient } from "../src/ai-chat/asr";
import type { CandyJarApi } from "../src/ai-chat/candyjar-bridge";

const unavailableLocalRuntime = {
  runtime: "asap-local-wrapper",
  protocolVersion: 1,
  capabilities: { asr: { available: false } }
};

function createClient(call: CandyJarApi["call"]) {
  const start = vi.fn(async () => {});
  const host = {
    CandyJar: { call },
    lingguang: { asr: { start, stop: vi.fn(async () => {}) } }
  } as NonNullable<Parameters<typeof createAsrClient>[0]>;
  return { client: createAsrClient(host), start };
}

afterEach(() => vi.useRealTimers());

it("starts native ASR after a silent runtime probe times out and ignores late replies", async () => {
  vi.useFakeTimers();
  const call = vi.fn<CandyJarApi["call"]>();
  const { client, start } = createClient(call);
  const session = client.start({ onText: vi.fn() });

  await vi.advanceTimersByTimeAsync(999);
  expect(start).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(start).toHaveBeenCalledOnce();
  await session.ready;

  call.mock.calls[0][3](unavailableLocalRuntime);
  expect(await client.availability).toMatchObject({ available: true, provider: "native" });
  expect(start).toHaveBeenCalledOnce();
});

it("does not start the microphone after a session was cancelled during discovery", async () => {
  vi.useFakeTimers();
  const { client, start } = createClient(vi.fn<CandyJarApi["call"]>());
  const session = client.start({ onText: vi.fn() });
  const resolved = vi.fn();
  void client.availability.then(resolved);

  await expect(session.abort()).resolves.toMatchObject({ status: "aborted" });
  await session.released;
  await vi.advanceTimersByTimeAsync(1000);
  expect(resolved).toHaveBeenCalledWith(expect.objectContaining({ available: true, provider: "native" }));
  expect(start).not.toHaveBeenCalled();
});

it("honors a local wrapper capability reply received before the deadline", async () => {
  vi.useFakeTimers();
  const { client, start } = createClient((_method, _action, _params, reply) => reply(unavailableLocalRuntime));

  expect(await client.availability).toMatchObject({ available: false });
  expect(start).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
