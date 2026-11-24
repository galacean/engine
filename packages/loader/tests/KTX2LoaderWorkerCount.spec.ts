import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KTX2Loader } from "../src/ktx2/KTX2Loader";

afterEach(() => {
  KTX2Loader.release();
  vi.unstubAllGlobals();
});

describe("KTX2Loader mobile worker cap", () => {
  it("caps default KTX2 worker count to 2 on mobile UA or <=4-core devices and keeps 4 on desktop", () => {
    vi.stubGlobal("navigator", {
      hardwareConcurrency: 4,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
    });
    expect(KTX2Loader._defaultWorkerCount()).toBe(2);

    vi.stubGlobal("navigator", {
      hardwareConcurrency: 8,
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36"
    });
    expect(KTX2Loader._defaultWorkerCount()).toBe(2);

    vi.stubGlobal("navigator", {
      hardwareConcurrency: 6,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      maxTouchPoints: 5
    });
    expect(KTX2Loader._defaultWorkerCount()).toBe(2);

    vi.stubGlobal("navigator", {
      hardwareConcurrency: 4,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    });
    expect(KTX2Loader._defaultWorkerCount()).toBe(2);

    vi.stubGlobal("navigator", {
      hardwareConcurrency: 8,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      maxTouchPoints: 0
    });
    expect(KTX2Loader._defaultWorkerCount()).toBe(4);
  });

  it("keeps packages/modify KTX2Loader override in sync with packages/loader _defaultWorkerCount (P1-4)", () => {
    const loaderSrc = fs.readFileSync(new URL("../src/ktx2/KTX2Loader.ts", import.meta.url), "utf8");
    const modifySrc = fs.readFileSync(
      new URL("../../modify/src/native/loader/src/ktx2/KTX2Loader.ts", import.meta.url),
      "utf8"
    );
    const extractBlock = (src: string) => {
      const match = src.match(
        /static _defaultWorkerCount\(\): number \{[\s\S]*?private static _getBinomialLLCTranscoder\([^)]*\)/
      );
      expect(match).not.toBeNull();
      return match![0];
    };
    const loaderBlock = extractBlock(loaderSrc);
    const modifyBlock = extractBlock(modifySrc);
    expect(modifyBlock).toBe(loaderBlock);
    expect(modifyBlock).toContain("workerCount: number = KTX2Loader._defaultWorkerCount()");
  });
});
