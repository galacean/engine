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
  const colorImage = { width: 16, height: 12, dispose() {} };
  const resolvedIdentities = {
    identityBits: 14,
    byteLength: 16 * 12 * 4,
    estimatedPosition: () => undefined,
    read: () => new Uint8Array(4),
    resolve: () => ({ entityId: 1, componentId: 1, componentType: "MeshRenderer" }),
    dispose: vi.fn()
  };
  const state = {
    // Production lets a real capture retry after a failed warm-up.
    snapshotWarmup: warmup.promise.then(
      () => {},
      () => {}
    ),
    waitForSnapshotWarmup,
    disposed: false,
    pickPreparation: { flush: vi.fn(async (signal?: AbortSignal) => signal?.throwIfAborted()), ready: true },
    worldPicker: {
      captureColorOnly: vi.fn(async (signal?: AbortSignal) => {
        signal?.throwIfAborted();
        return {
          image: colorImage,
          metadata: { capturedAt: "2026-01-01T00:00:00.000Z", viewer: { position: [0, 0, 0], forward: [0, 0, -1] } },
          width: 16,
          height: 12
        };
      }),
      captureIdentityBuffer: vi.fn(() => ({
        image: colorImage,
        width: 16,
        height: 12,
        identities: resolvedIdentities
      }))
    },
    snapshotPicks: { visit: vi.fn() },
    inspection: { target: vi.fn() }
  };
  const capture = new Function(...Object.keys(state), callbackCode)(...Object.values(state)) as (
    signal?: AbortSignal
  ) => Promise<{
    image: unknown;
    identities: { dispose(): void; resolve(id: number): unknown };
    ensureIdentities(): Promise<void>;
    hasIdentities(): boolean;
  }>;
  return { ...state, warmup, resolvedIdentities, capture };
}

describe("snapshot warm-up cancellation", () => {
  it("cancels one deferred identity capture before warm-up settles while another capture keeps waiting", async () => {
    const f = fixture();
    const cancelledFrame = await f.capture(new AbortController().signal);
    const waitingFrame = await f.capture(new AbortController().signal);
    const cancelledId = cancelledFrame.ensureIdentities();
    const waitingId = waitingFrame.ensureIdentities();
    try {
      expect(cancelledFrame.hasIdentities()).toBe(false);
      expect(waitingFrame.hasIdentities()).toBe(false);

      cancelledFrame.identities.dispose();
      await cancelledId;
      expect(cancelledFrame.hasIdentities()).toBe(true);
      expect(f.pickPreparation.flush).not.toHaveBeenCalled();
      expect(f.worldPicker.captureIdentityBuffer).not.toHaveBeenCalled();

      f.warmup.resolve();
      await waitingId;
      expect(waitingFrame.hasIdentities()).toBe(true);
      expect(f.worldPicker.captureIdentityBuffer).toHaveBeenCalledOnce();
      expect(waitingFrame.identities.resolve(1)).toMatchObject({ entityId: 1 });
    } finally {
      f.warmup.resolve();
      waitingFrame.identities.dispose();
      await Promise.allSettled([cancelledId, waitingId]);
    }
  });

  it("rejects an already cancelled capture without waiting for warm-up or calling captureColorOnly", async () => {
    const f = fixture(),
      controller = new AbortController();
    controller.abort();
    try {
      await expect(f.capture(controller.signal)).rejects.toBe(controller.signal.reason);
      expect(f.worldPicker.captureColorOnly).not.toHaveBeenCalled();
      expect(f.worldPicker.captureIdentityBuffer).not.toHaveBeenCalled();
    } finally {
      f.warmup.resolve();
    }
  });

  it("lets deferred identity capture retry after a failed warm-up", async () => {
    const f = fixture();
    const frame = await f.capture();
    const populate = frame.ensureIdentities();
    try {
      f.warmup.reject(new Error("warm-up failed"));
      await populate;
      expect(frame.hasIdentities()).toBe(true);
      expect(f.worldPicker.captureIdentityBuffer).toHaveBeenCalledOnce();
    } finally {
      frame.identities.dispose();
    }
  });

  it("does not capture identities when disposal and warm-up completion occur in the same turn", async () => {
    const f = fixture();
    const frame = await f.capture();
    const populate = frame.ensureIdentities();
    f.warmup.resolve();
    frame.identities.dispose();
    await populate;
    expect(f.worldPicker.captureIdentityBuffer).not.toHaveBeenCalled();
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
