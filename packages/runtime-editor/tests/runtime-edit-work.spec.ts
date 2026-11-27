import { afterEach, expect, it, vi } from "vitest";
import { runtimeEditWork } from "../src/runtime-editor/runtime-edit-work";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function browser() {
  vi.useFakeTimers();
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
}
it("yields only after the cooperative target and resumes after a rendering opportunity", async () => {
  browser();
  const work = runtimeEditWork();
  expect(work()).toBeUndefined();
  await vi.advanceTimersByTimeAsync(5);
  let completed = false;
  const pending = work()!.then(() => {
    completed = true;
  });
  await vi.advanceTimersByTimeAsync(15);
  expect(completed).toBe(false);
  await vi.advanceTimersByTimeAsync(2);
  await pending;
  expect(work()).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});
it("cleans up frame and timeout callbacks on cancellation", async () => {
  browser();
  const work = runtimeEditWork(),
    controller = new AbortController();
  await vi.advanceTimersByTimeAsync(5);
  const pending = work(controller.signal)!;
  controller.abort("cancelled");
  await expect(pending).rejects.toBe("cancelled");
  // Do not retain callbacks from a discarded transaction.
  expect(vi.getTimerCount()).toBe(0);
});
it("continues if a scheduled frame is suppressed after the page becomes hidden", async () => {
  browser();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  const work = runtimeEditWork();
  await vi.advanceTimersByTimeAsync(5);
  const pending = work();
  await vi.advanceTimersByTimeAsync(50);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
