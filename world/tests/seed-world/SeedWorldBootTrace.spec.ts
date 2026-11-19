import { describe, expect, it } from "vitest";
import { seedWorldBootTrace } from "../../demos/seed-world/src/SeedWorldBootTrace";
import { parsePreloadedJson } from "../../demos/seed-world/src/SeedWorldProjectTextBundle";

describe("SeedWorldBootTrace lifecycle", () => {
  it("clears canvas reference on dispose and resets cleanly on a subsequent configure", () => {
    seedWorldBootTrace.reset();
    const firstCanvas = { dataset: {} } as unknown as HTMLCanvasElement;
    seedWorldBootTrace.configure({ url: "http://localhost/?seed=1" });
    seedWorldBootTrace.attachCanvas(firstCanvas);
    seedWorldBootTrace.phase("loadingScene", 0.1);
    seedWorldBootTrace.finish();

    expect(seedWorldBootTrace.snapshot().status).toBe("ready");
    seedWorldBootTrace.dispose(false);
    expect((seedWorldBootTrace as unknown as { canvas?: HTMLCanvasElement }).canvas).toBeUndefined();

    seedWorldBootTrace.configure({ url: "http://localhost/?seed=2" });
    const nextSnap = seedWorldBootTrace.snapshot();
    expect(nextSnap.status).toBe("loading");
    expect(nextSnap.url).toBe("http://localhost/?seed=2");
    expect(nextSnap.spans).toEqual([]);
    expect(nextSnap.phases).toEqual([]);
    seedWorldBootTrace.dispose(false);
  });
});

describe("parsePreloadedJson", () => {
  it("parses valid JSON and returns undefined on corrupt text so callers fall back to fetch", () => {
    expect(parsePreloadedJson<{ scene: string }>('{"scene":"Main"}')).toEqual({ scene: "Main" });
    expect(parsePreloadedJson(undefined)).toBeUndefined();
    expect(parsePreloadedJson("{corrupt")).toBeUndefined();
  });
});
