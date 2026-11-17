import { AssetPromise, request } from "@galacean/engine-core";
import { describe, expect, it, vi } from "vitest";

describe("Asset Promise test", function () {
  it("constructor", () => {
    const assetPromise = new AssetPromise((resolve) => {
      resolve();
    });
    expect(assetPromise).not.to.be.undefined;
  });

  it("resolve", async () => {
    const assetPromise = new AssetPromise((resolve) => {
      resolve(1);
    });
    const value = await assetPromise;
    expect(value).to.be.equal(1);
  });

  it("reject", async () => {
    const assetPromise = new AssetPromise((resolve, reject) => {
      reject(1);
    });
    try {
      await assetPromise;
    } catch (e) {
      expect(e).to.eq(1);
    }
  });

  it("then", async () => {
    const assetPromise = new AssetPromise<number>((resolve) => {
      resolve(1);
    });
    const value = await assetPromise
      .then((value) => {
        return value + 1;
      })
      .then((value) => {
        expect(value).to.eq(2);
        return value + 1;
      });

    expect(value).to.eq(3);
  });

  it("catch", async () => {
    const assetPromise = new AssetPromise<number>((resolve, reject) => {
      reject(1);
    });
    const value = await assetPromise.catch((reason) => reason + 1);
    expect(value).to.eq(2);
  });

  it("finally", async () => {
    const assetPromise = new AssetPromise<number>((resolve, reject) => {
      reject(1);
    })
      .finally(() => {
        expect(true).to.be.true;
      })
      .catch((reason) => reason + 1);
    const value = await assetPromise;
    expect(value).to.eq(2);
  });

  it("cancel", async () => {
    const assetPromise = new AssetPromise<number>((resolve, reject) => {
      setTimeout(() => {
        resolve(1);
      });
    });
    assetPromise.cancel();
    await assetPromise
      .then((result) => {
        expect(result).to.eq(222);
      })
      .catch((e) => {
        expect(e).to.eq("canceled");
      });
  });

  it("progress", async () => {
    const assetPromise = new AssetPromise<number>((resolve, reject, setTaskCompleteProgress) => {
      let i = 0;
      let timeoutId = setInterval(() => {
        i++;
        setTaskCompleteProgress(i, 10);
        if (i === 10) {
          clearInterval(timeoutId);
          resolve(i);
        }
      }, 20);
    });

    let currentItemsLoaded;
    let currentItemsTotal;
    assetPromise.onProgress((loaded, total) => {
      currentItemsLoaded = loaded;
      currentItemsTotal = total;
    });

    await assetPromise.then((e) => {
      expect(currentItemsLoaded).to.eq(10);
      expect(currentItemsTotal).to.eq(10);
      expect(e).to.eq(10);
    });
  });

  it("promise immediately", async () => {
    let currentItemsLoaded;
    let currentItemsTotal;
    const assetPromise = new AssetPromise<number>((resolve, reject, setTaskCompleteProgress) => {
      setTaskCompleteProgress(10, 10);
      resolve(1);
    });

    assetPromise.onProgress((loaded, total) => {
      currentItemsLoaded = loaded;
      currentItemsTotal = total;
    });

    await assetPromise.then((e) => {
      expect(currentItemsLoaded).to.eq(10);
      expect(currentItemsTotal).to.eq(10);
      expect(e).to.eq(1);
    });
  });

  it("allows either progress callback to be omitted when replaying progress", async () => {
    const assetPromise = new AssetPromise<number>((resolve, reject, complete, detail) => {
      complete(1, 2);
      detail("asset", 1, 2);
      resolve(1);
    });

    expect(() => assetPromise.onProgress()).not.to.throw();
    expect(() => assetPromise.onProgress(() => {})).not.to.throw();
    expect(await assetPromise).to.eq(1);

    const details: [string, number, number][] = [];
    assetPromise.onProgress(undefined, (url, loaded, total) => details.push([url, loaded, total]));
    expect(details).to.deep.eq([["asset", 1, 2]]);
  });

  it("promise all basic", async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const promise = new Promise((resolve) => {
        resolve(null);
      });
      promises.push(promise);
    }

    let currentLoaded = 0;
    await AssetPromise.all(promises).onProgress((loaded, total) => {
      currentLoaded++;
      expect(loaded).to.eq(currentLoaded);
      expect(total).to.eq(10);
    });
  });

  it("promise all mixed", async () => {
    const promises = [];
    for (let i = 0; i < 2; i++) {
      const promise = new Promise((resolve) => {
        resolve(null);
      });
      promises.push(promise);
    }
    for (let i = 0; i < 2; i++) {
      promises.push(i);
    }

    const expects = [null, null, 0, 1];
    let currentLoaded = 0;

    await AssetPromise.all(promises)
      .onProgress((loaded, total) => {
        currentLoaded++;
        expect(loaded).to.eq(currentLoaded);
        expect(total).to.eq(4);
      })
      .then((value) => {
        expect(value).to.eql(expects);
      });

    await AssetPromise.all([]).then((value) => {
      expect(value.length).to.equal(0);
    });
  });

  it("manages fetch timeout, retryable timeout, in-flight and backoff cancellation cleanly", async () => {
    const savedXHR = globalThis.XMLHttpRequest;
    vi.useFakeTimers();
    (globalThis as any).XMLHttpRequest = undefined;
    try {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Unlimited timeout (`timeout: 0` / `Infinity`) creates no timer
      fetchSpy.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            expect(vi.getTimerCount()).toBe(0);
            resolve(new Response("unlimited"));
          })
      );
      await expect(Promise.resolve(request("https://example.test/ok.txt", { timeout: 0 }))).resolves.toBe("unlimited");
      expect(vi.getTimerCount()).toBe(0);

      // Positive timeout aborts single attempt and retries
      let attempts = 0;
      fetchSpy.mockImplementation((_url, options) => {
        if (++attempts === 1) {
          return new Promise((_resolve, reject) => {
            options!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          });
        }
        return Promise.resolve(new Response('{"ok":true}'));
      });
      const retryPromise = Promise.resolve(
        request("https://example.test/retry.json", { timeout: 20, retryCount: 2, retryInterval: 50 })
      );
      await vi.advanceTimersByTimeAsync(75);
      expect(await retryPromise).toEqual({ ok: true });
      expect(attempts).toBe(2);
      expect(vi.getTimerCount()).toBe(0);

      // External AbortSignal cancels immediately during retry backoff and cleans up timers/listeners
      let backoffCalls = 0;
      fetchSpy.mockImplementation(() => {
        backoffCalls++;
        return Promise.reject(new Error("503"));
      });
      const backoffController = new AbortController();
      const backoffTask = Promise.resolve(
        request("https://example.test/backoff.txt", {
          retryCount: 3,
          retryInterval: 250,
          signal: backoffController.signal
        })
      ).catch((e) => e);
      await vi.advanceTimersByTimeAsync(40);
      expect(backoffCalls).toBe(1);
      expect(vi.getTimerCount()).toBe(1);
      backoffController.abort(new Error("cancelled-in-backoff"));
      expect(vi.getTimerCount()).toBe(0);
      expect((await backoffTask).message).toBe("cancelled-in-backoff");
      await vi.advanceTimersByTimeAsync(500);
      expect(backoffCalls).toBe(1);

      // In-flight cancel() clears timeout timer synchronously
      fetchSpy.mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          })
      );
      const inFlight = request("https://example.test/inflight.txt", {
        timeout: 500,
        retryCount: 3,
        retryInterval: 250
      });
      const inFlightSettled = Promise.resolve(inFlight).catch((e) => e);
      expect(vi.getTimerCount()).toBe(1);
      inFlight.cancel();
      expect(vi.getTimerCount()).toBe(0);
      expect(await inFlightSettled).toBe("canceled");
    } finally {
      (globalThis as any).XMLHttpRequest = savedXHR;
      vi.restoreAllMocks();
      vi.useRealTimers();
    }

    // Browser XHR path also honors external AbortSignal immediately across retries
    const abortSpy = vi.spyOn(XMLHttpRequest.prototype, "abort");
    vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(function () {});
    try {
      const xhrController = new AbortController();
      const xhrTask = Promise.resolve(
        request("https://example.test/xhr.txt", { retryCount: 3, retryInterval: 250, signal: xhrController.signal })
      ).catch((e) => e);
      xhrController.abort(new Error("xhr-aborted"));
      expect(abortSpy).toHaveBeenCalledOnce();
      expect((await xhrTask).message).toBe("xhr-aborted");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
