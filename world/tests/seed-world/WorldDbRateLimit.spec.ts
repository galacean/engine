import { afterEach, expect, it, vi } from "vitest";
import { resolveStorageHost } from "../../demos/seed-world/storage/SeedWorldStorageHost";
import type { WorldDb } from "../../demos/seed-world/storage/SharedWorldStorage";

const request = { sql: "", binds: [], timeoutMs: 30000 };
const result = { success: true };
function sdk() {
  return {
    role: async () => ({ role: "MANAGER" }),
    query: vi.fn(async () => result),
    execute: vi.fn(async () => result)
  };
}
async function open(db: WorldDb) {
  return (await resolveStorageHost({ lingguang: { db } })).db;
}
function throttle() {
  return Object.assign(new Error("[window.lingguang._call] rate limit exceeded: lingguang.db.execute"), {
    code: "RATE_LIMIT"
  });
}
afterEach(() => vi.useRealTimers());

it("shares a rolling query budget across keys, gives writes a separate budget and preserves concurrent reads", async () => {
  vi.useFakeTimers();
  const api = sdk();
  let complete!: () => void;
  api.query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = () => resolve(result);
      })
  );
  const db = await open(api);
  const queries = Array.from({ length: 6 }, (_, i) => db.query({ ...request, binds: [i] }));
  await vi.advanceTimersByTimeAsync(300);
  queries.push(...Array.from({ length: 9 }, (_, i) => db.query({ ...request, binds: [i + 6] })));
  const writes = Array.from({ length: 11 }, () => db.execute(request));
  await vi.advanceTimersByTimeAsync(700);
  expect(api.query).toHaveBeenCalledTimes(10);
  expect(api.execute).toHaveBeenCalledTimes(10);
  await vi.advanceTimersByTimeAsync(1);
  expect(api.query).toHaveBeenCalledTimes(15);
  expect(api.execute).toHaveBeenCalledTimes(10);
  await vi.advanceTimersByTimeAsync(300);
  expect(api.execute).toHaveBeenCalledTimes(11);
  complete();
  await Promise.all([...queries, ...writes]);
});

it("retries a scaffold refusal before dispatch only once and never replays an ambiguous write", async () => {
  vi.useFakeTimers();
  const api = sdk();
  const db = await open(api);
  api.execute.mockRejectedValueOnce(throttle()).mockRejectedValueOnce(throttle());
  const denied = expect(db.execute(request)).rejects.toMatchObject({ code: "RATE_LIMIT" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(api.execute).toHaveBeenCalledTimes(1);
  await vi.runAllTimersAsync();
  await denied;
  expect(api.execute).toHaveBeenCalledTimes(2);
  api.execute.mockRejectedValueOnce(new Error("response timed out"));
  const timeout = expect(db.execute(request)).rejects.toThrow("response timed out");
  await vi.runAllTimersAsync();
  await timeout;
  expect(api.execute).toHaveBeenCalledTimes(3);
});

it("skips a cancelled queued read without spending the next query slot", async () => {
  vi.useFakeTimers();
  const api = sdk();
  const db = await open(api);
  await Promise.all(Array.from({ length: 10 }, () => db.query(request)));
  const attempt = new AbortController();
  const skipped = expect(db.query({ ...request, binds: ["old"] }, attempt.signal)).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(100);
  attempt.abort();
  const next = db.query({ ...request, binds: ["new"] });
  await vi.advanceTimersByTimeAsync(901);
  await Promise.all([skipped, next]);
  expect(api.query).toHaveBeenCalledTimes(11);
  expect(api.query).toHaveBeenLastCalledWith({ ...request, binds: ["new"] });
});
