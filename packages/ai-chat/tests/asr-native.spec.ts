import { it, expect, vi } from "vitest";
import { createAsrClient } from "../src/ai-chat/asr";

type AsrHost = NonNullable<Parameters<typeof createAsrClient>[0]>;
type NativeAsr = NonNullable<NonNullable<AsrHost["lingguang"]>["asr"]>;

function createHost(url = "https://render.lingguangcontent.com/seed-world/") {
  const call = vi.fn();
  const start = vi.fn<NativeAsr["start"]>().mockResolvedValue(undefined);
  const stop = vi.fn<NativeAsr["stop"]>().mockResolvedValue(undefined);
  const abort = vi.fn<NonNullable<NativeAsr["abort"]>>().mockResolvedValue(undefined);
  const host = {
    location: new URL(url),
    CandyJar: { call },
    lingguang: { asr: { start, stop, abort } }
  } as unknown as AsrHost;
  return { host, call, start, stop, abort };
}

it("starts the public ASR directly and stops with the final text", async () => {
  const { host, call, start, stop, abort } = createHost();
  const client = createAsrClient(host);
  const onText = vi.fn();
  const session = client.start({ onText });

  await Promise.resolve();
  expect(call).not.toHaveBeenCalled();
  expect(start).toHaveBeenCalledOnce();
  await session.ready;

  const [callbacks] = start.mock.calls[0];
  stop.mockImplementation(async () => {
    callbacks.onText({ text: "把时间调到晚上", sessionId: "native-session", isFinal: true });
    callbacks.onEnd?.("stop", "native-session");
  });
  await expect(session.stop()).resolves.toMatchObject({ status: "completed", text: "把时间调到晚上" });
  await session.released;
  expect(onText).toHaveBeenCalledWith(expect.objectContaining({ text: "把时间调到晚上", isFinal: true }));
  expect(stop).toHaveBeenCalledOnce();
  expect(abort).not.toHaveBeenCalled();
});

it("does not open the microphone when cancelled before startup", async () => {
  const { host, call, start } = createHost();
  const client = createAsrClient(host);
  const session = client.start({ onText: vi.fn() });

  await expect(session.abort()).resolves.toMatchObject({ status: "aborted" });
  await session.released;
  expect(call).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
});

it.each(["http://localhost/", "http://127.0.0.1:4173/", "http://192.168.1.20:4173/"])(
  "declares ASR unavailable before calling the SDK development mock at %s",
  async (url) => {
    const { host, call, start } = createHost(url);
    const client = createAsrClient(host);
    expect(client.getDiagnostics().availability).toMatchObject({
      available: false,
      reason: "sdk-dev-mock",
      message: "暂不支持语音"
    });

    const session = client.start({ onText: vi.fn() });
    await expect(session.ready).rejects.toMatchObject({ code: "ASR_NOT_SUPPORTED" });
    await expect(session.done).resolves.toMatchObject({ status: "failed", error: { error: "unsupported" } });
    await session.released;
    expect(call).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  }
);
