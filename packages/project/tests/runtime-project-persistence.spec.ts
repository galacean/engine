import { afterEach, expect, it, vi } from "vitest";
import { RuntimeProjectPersistence } from "../src/runtime-editor/project/runtime-project-persistence";

afterEach(() => vi.useRealTimers());
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

it("coalesces quiet edits and bounds continuous edits by the original deadline", async () => {
  vi.useFakeTimers();
  const save = vi.fn(async () => {});
  const persistence = new RuntimeProjectPersistence(save, { debounceMs: 100, maxWaitMs: 300 });
  persistence.committed();
  for (let n = 0; n < 3; n++) {
    await vi.advanceTimersByTimeAsync(90);
    persistence.committed();
  }
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(30);
  expect(save).toHaveBeenCalledTimes(1);
  expect(persistence.status).toMatchObject({ state: "saved", commitSeq: 4, savedSeq: 4 });
  persistence.committed();
  await vi.advanceTimersByTimeAsync(99);
  expect(save).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledTimes(2);
  persistence.dispose();
});

it("retains only one in-flight save and checkpoints the latest of arbitrarily many pending edits", async () => {
  vi.useFakeTimers();
  const first = deferred(), writes: number[] = [];
  let current = 1;
  const persistence = new RuntimeProjectPersistence(async () => {
    writes.push(current);
    if (writes.length === 1) await first.promise;
  }, { debounceMs: 100, maxWaitMs: 300 });
  persistence.committed();
  const flushedFirst = persistence.flush();
  await Promise.resolve();
  for (current = 2; current <= 1000; current++) persistence.committed();
  current = 1000;
  await vi.advanceTimersByTimeAsync(2000);
  expect(writes).toEqual([1]);
  first.resolve();
  await flushedFirst;
  expect(persistence.status.savedSeq).toBe(1); // First flush does not chase later edits.
  await vi.advanceTimersByTimeAsync(0);
  expect(writes).toEqual([1, 1000]);
  expect(persistence.status).toMatchObject({ state: "saved", commitSeq: 1000, savedSeq: 1000 });
  persistence.dispose();
});

it("flush joins the in-flight attempt, then saves a newer requested revision without waiting for debounce", async () => {
  const first = deferred(), second = deferred();
  const save = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
  const p = new RuntimeProjectPersistence(save);
  p.committed(); const one = p.flush(); await Promise.resolve();
  p.committed(); const two = p.flush();
  first.resolve(); await one;
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  p.committed(); // This third revision must not be acknowledged by the second save.
  second.resolve(); await two;
  expect(p.status).toMatchObject({ commitSeq: 3, savedSeq: 2, state: "pending" });
  p.dispose();
});

it("failed autosave pauses, retains dirty state, and explicit flush retries the latest state once", async () => {
  vi.useFakeTimers();
  const error = Error("disk full");
  const save = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
  const p = new RuntimeProjectPersistence(save);
  const states: string[] = [];
  p.subscribe(s => states.push(s.state));
  p.committed();
  await vi.advanceTimersByTimeAsync(250);
  expect(p.status).toMatchObject({ state: "failed", commitSeq: 1, savedSeq: 0, error });
  for (let n = 0; n < 100; n++) p.committed();
  await vi.advanceTimersByTimeAsync(10000);
  expect(save).toHaveBeenCalledTimes(1);
  await p.flush();
  expect(save).toHaveBeenCalledTimes(2);
  expect(p.status).toEqual({ state: "saved", commitSeq: 101, savedSeq: 101 });
  expect(states).toContain("failed");
  p.dispose();
});

it("rejects flush on failed attempts and future revisions; disposal cancels timers and does not imply saved", async () => {
  vi.useFakeTimers();
  const gate = deferred(), save = vi.fn(() => gate.promise);
  const p = new RuntimeProjectPersistence(save);
  p.committed();
  const first = expect(p.flush()).rejects.toThrow("disk");
  const second = expect(p.flush()).rejects.toThrow("disk");
  gate.reject(Error("disk"));
  await Promise.all([first, second]);
  expect(save).toHaveBeenCalledTimes(1);
  await expect(p.flush(2)).rejects.toThrow("Unknown");
  p.dispose();
  await vi.advanceTimersByTimeAsync(10000);
  expect(save).toHaveBeenCalledTimes(1);
  await expect(p.flush()).rejects.toThrow("disposed");
  expect(p.status).toMatchObject({ state: "disposed", commitSeq: 1, savedSeq: 0 });
});

it("coalesces observer delivery and preserves ordering when an observer flushes", async () => {
  const gate = deferred();
  const p = new RuntimeProjectPersistence(() => gate.promise);
  const states: string[] = [];
  let flushing: Promise<void> | undefined;
  p.subscribe(status => { if (status.state === "pending") flushing = p.flush(); });
  p.subscribe(status => { states.push(status.state); });
  p.committed(); p.committed();
  await Promise.resolve(); await Promise.resolve();
  expect(states).toEqual(["pending", "saving"]);
  gate.resolve(); await flushing;
  expect(states.at(-1)).toBe("saved");
  p.dispose();
});
