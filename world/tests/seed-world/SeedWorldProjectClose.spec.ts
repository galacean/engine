import { expect, it, vi } from "vitest";
import { createSeedWorldProjectClose } from "../../demos/seed-world/SeedWorldProjectClose.ts";

it("retains the drained project after save failure and retries persistence without replaying domain work", async () => {
  const calls: string[] = [];
  let failed = false;
  const close = createSeedWorldProjectClose(
    async () => {
      calls.push("checkpoint");
    },
    async () => {
      calls.push("save");
      if (!failed) {
        failed = true;
        throw new Error("storage unavailable");
      }
    },
    () => {
      calls.push("release");
    }
  );
  await expect(close()).rejects.toThrow("storage unavailable");
  expect(calls).toEqual(["checkpoint", "save"]);
  await close();
  await close();
  expect(calls).toEqual(["checkpoint", "save", "save", "release"]);
});

it("waits for in-flight accepted writes and shares concurrent close requests", async () => {
  let finish!: () => void;
  const drain = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const stop = vi.fn(() => drain),
    save = vi.fn(async () => {}),
    release = vi.fn();
  const close = createSeedWorldProjectClose(stop, save, release);
  const first = close(),
    second = close();
  expect(first).toBe(second);
  expect(save).not.toHaveBeenCalled();
  finish();
  await first;
  expect(stop).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
});
