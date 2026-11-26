import { afterEach, describe, expect, it, vi } from "vitest";
import { KTX2Loader } from "../src/ktx2/KTX2Loader";

afterEach(() => {
  KTX2Loader.release();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  it("detects the default worker count only when creating the transcoder", () => {
    const detectWorkerCount = vi.spyOn(KTX2Loader, "_defaultWorkerCount");
    const loader = KTX2Loader as unknown as { _getBinomialLLCTranscoder(): { destroy(): void } };
    const transcoder = loader._getBinomialLLCTranscoder();
    vi.spyOn(transcoder, "destroy").mockImplementation(() => {});

    expect(loader._getBinomialLLCTranscoder()).toBe(transcoder);
    expect(detectWorkerCount).toHaveBeenCalledTimes(1);
  });
});
