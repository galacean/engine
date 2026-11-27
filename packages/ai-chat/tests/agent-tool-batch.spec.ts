import { expect, it } from "vitest";
import { runToolBatch } from "../src/ai-chat/agent-tool-batch";
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
it("overlaps reads, serializes write/execute barriers and resumes reads against committed state", async () => {
  const gate = deferred(),
    both = deferred();
  const started: string[] = [],
    seen: string[] = [];
  let state = "before";
  const task = runToolBatch(
    ["read-a", "read-b", "write", "execute", "read-c"],
    (c) => c.startsWith("read"),
    async (c) => {
      started.push(c);
      if (started.length === 2) both.resolve();
      if (c === "read-a" || c === "read-b") await gate.promise;
      if (c === "write") state = "written";
      if (c === "execute") state += "-edited";
      seen.push(c + ":" + state);
      return c;
    },
    new AbortController().signal
  );
  await both.promise;
  expect(started).toEqual(["read-a", "read-b"]);
  gate.resolve();
  expect((await task).values).toEqual(["read-a", "read-b", "write", "execute", "read-c"]);
  expect(seen.at(-1)).toBe("read-c:written-edited");
});
it("settles started reads on cancellation and does not admit the next mutation", async () => {
  const gate = deferred(),
    both = deferred(),
    controller = new AbortController();
  const started: string[] = [];
  const task = runToolBatch(
    ["a", "b", "write"],
    (c) => c !== "write",
    async (c) => {
      started.push(c);
      if (c === "b") both.resolve();
      await gate.promise;
      return c;
    },
    controller.signal
  );
  await both.promise;
  controller.abort();
  let done = false;
  void task.then(() => (done = true));
  await Promise.resolve();
  expect(done).toBe(false);
  gate.resolve();
  expect((await task).error).toBeDefined();
  expect(started).toEqual(["a", "b"]);
});
