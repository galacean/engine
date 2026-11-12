import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { waitForSnapshotWarmup } from "../../demos/seed-world/src/SeedWorldSnapshotWarmup";

// Exercise the Demo's actual capture callback, including the warm-up join, without booting WebGL.
const source = ts.createSourceFile(
  "SeedWorldDemo.ts",
  readFileSync(new URL("../../demos/seed-world/SeedWorldDemo.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true
);
const callbacks: ts.Expression[] = [];
function visit(node: ts.Node): void {
  if (ts.isNewExpression(node) && node.expression.getText(source) === "SeedWorldViewSnapshots") {
    callbacks.push(node.arguments![0]);
  }
  ts.forEachChild(node, visit);
}
visit(source);
if (callbacks.length !== 1) throw new Error("Expected one production snapshot capture callback");
const callbackCode = ts.transpileModule(`return (${callbacks[0].getText(source)});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;

function deferred() {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const warmup = deferred();
  const frame = {};
  const state = {
    // Production lets a real capture retry after a failed warm-up.
    snapshotWarmup: warmup.promise.then(
      () => {},
      () => {}
    ),
    waitForSnapshotWarmup,
    pickPreparation: { flush: vi.fn(async (signal?: AbortSignal) => signal?.throwIfAborted()), ready: true },
    worldPicker: { capture: vi.fn(async () => frame) },
    snapshotPicks: { visit: vi.fn() },
    inspection: { target: vi.fn() }
  };
  const capture = new Function(...Object.keys(state), callbackCode)(...Object.values(state)) as (
    signal?: AbortSignal
  ) => Promise<unknown>;
  return { ...state, warmup, frame, capture };
}

describe("snapshot warm-up cancellation", () => {
  it("cancels one capture before warm-up settles while another capture keeps waiting", async () => {
    const f = fixture(),
      controller = new AbortController(),
      reason = new Error("task stopped");
    const cancelled = f.capture(controller.signal);
    const rejected = expect(cancelled).rejects.toBe(reason);
    const waiting = f.capture(new AbortController().signal);
    try {
      controller.abort(reason);
      await rejected;
      expect(f.pickPreparation.flush).not.toHaveBeenCalled();
      expect(f.worldPicker.capture).not.toHaveBeenCalled();
      f.warmup.resolve();
      await expect(waiting).resolves.toBe(f.frame);
      expect(f.worldPicker.capture).toHaveBeenCalledOnce();
    } finally {
      f.warmup.resolve();
      await Promise.allSettled([cancelled, waiting]);
    }
  });

  it("rejects an already cancelled capture without waiting for warm-up", async () => {
    const f = fixture(),
      controller = new AbortController();
    controller.abort();
    try {
      await expect(f.capture(controller.signal)).rejects.toBe(controller.signal.reason);
      expect(f.worldPicker.capture).not.toHaveBeenCalled();
    } finally {
      f.warmup.resolve();
    }
  });

  it("lets captures retry after a failed warm-up", async () => {
    const f = fixture(),
      capture = f.capture();
    f.warmup.reject(new Error("warm-up failed"));
    await expect(capture).resolves.toBe(f.frame);
    expect(f.worldPicker.capture).toHaveBeenCalledOnce();
  });

  it("does not capture when cancellation and warm-up completion occur in the same turn", async () => {
    const f = fixture(),
      controller = new AbortController(),
      reason = new Error("task stopped");
    const capture = f.capture(controller.signal);
    const rejected = expect(capture).rejects.toBe(reason);
    f.warmup.resolve();
    controller.abort(reason);
    await rejected;
    expect(f.worldPicker.capture).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject", "abort"] as const)("removes the abort listener on %s", async (outcome) => {
    const warmup = deferred(),
      controller = new AbortController(),
      reason = new Error(outcome);
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const wait = waitForSnapshotWarmup(warmup.promise, controller.signal);
    const result = wait.then(
      () => undefined,
      (error) => error
    );
    if (outcome === "resolve") warmup.resolve();
    else if (outcome === "reject") warmup.reject(reason);
    else controller.abort(reason);
    expect(await result).toBe(outcome === "resolve" ? undefined : reason);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    // A later failure of the shared work remains handled after cancellation.
    if (outcome === "abort") warmup.reject(new Error("late failure"));
    await Promise.resolve();
  });
});
