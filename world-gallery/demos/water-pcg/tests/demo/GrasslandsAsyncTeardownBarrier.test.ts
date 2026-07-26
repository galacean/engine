import { describe, expect, it, vi } from "vitest";
import { GrasslandsAsyncTeardownBarrier } from "../../demo/grasslands/GrasslandsAsyncTeardownBarrier";

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("GrasslandsAsyncTeardownBarrier", () => {
  it("finalizes synchronously when no asynchronous operation is pending", () => {
    const finalize = vi.fn();
    const barrier = new GrasslandsAsyncTeardownBarrier(finalize);

    barrier.requestFinalize();
    barrier.requestFinalize();

    expect(finalize).toHaveBeenCalledTimes(1);
    expect(barrier.pendingCount).toBe(0);
    expect(barrier.finalized).toBe(true);
  });

  it("waits for both resolved and rejected operations before finalizing exactly once", async () => {
    const finalize = vi.fn();
    const barrier = new GrasslandsAsyncTeardownBarrier(finalize);
    const first = deferred<number>();
    const second = deferred<number>();
    const trackedFirst = barrier.track(first.promise);
    const trackedSecond = barrier.track(second.promise);

    barrier.requestFinalize();
    expect(finalize).not.toHaveBeenCalled();
    expect(barrier.pendingCount).toBe(2);
    expect(() => barrier.track(Promise.resolve(3))).toThrow(
      "Grasslands teardown cannot track new work after finalization was requested."
    );

    first.resolve(1);
    await expect(trackedFirst).resolves.toBe(1);
    expect(finalize).not.toHaveBeenCalled();
    expect(barrier.pendingCount).toBe(1);

    second.reject(new Error("cancelled"));
    await expect(trackedSecond).rejects.toThrow("cancelled");
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(barrier.pendingCount).toBe(0);
    expect(barrier.finalized).toBe(true);
  });

  it("lets a tracked continuation register a created resource before finalization", async () => {
    const creation = deferred<{ readonly id: string }>();
    let registered: { readonly id: string } | undefined;
    const finalizedResources: string[] = [];
    const barrier = new GrasslandsAsyncTeardownBarrier(() => {
      if (registered) finalizedResources.push(registered.id);
    });
    const tracked = barrier.track(
      creation.promise.then((resource) => {
        registered = resource;
        return resource;
      })
    );

    barrier.requestFinalize();
    creation.resolve({ id: "created-engine" });

    await expect(tracked).resolves.toEqual({ id: "created-engine" });
    expect(finalizedResources).toEqual(["created-engine"]);
    expect(barrier.finalized).toBe(true);
  });

  it("runs borrowed-texture release only after a hidden Runtime activation settles", async () => {
    const activation = deferred<void>();
    const order: string[] = [];
    const barrier = new GrasslandsAsyncTeardownBarrier(() => {
      order.push("release-runtime-borrow", "destroy-caller-texture");
    });
    const tracked = barrier.track(
      activation.promise.finally(() => {
        order.push("destroy-hidden-runtime-material");
      })
    );

    barrier.requestFinalize();
    expect(order).toEqual([]);

    activation.resolve();
    await expect(tracked).resolves.toBeUndefined();
    expect(order).toEqual(["destroy-hidden-runtime-material", "release-runtime-borrow", "destroy-caller-texture"]);
  });
});
