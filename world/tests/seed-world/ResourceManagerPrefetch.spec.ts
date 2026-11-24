import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetPromise, Engine, EngineObject, ResourceManager } from "@galacean/engine";

function createTestEngine(): Engine {
  return {
    _hardwareRenderer: {},
    _isDeviceLost: false
  } as unknown as Engine;
}

describe("ResourceManager asset requests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shares a download URL while caching each material's resource independently", async () => {
    const engine = createTestEngine();
    const rm = new ResourceManager(engine);
    const projectUrl = "https://example.test/project/bark.png";
    const templateUrl = "https://example.test/assets/bark-12345678.png";
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("texture bytes"));
    rm.setDownloadUrls(new Map([[projectUrl, templateUrl]]));

    await Promise.all([projectUrl, templateUrl].map((url) => rm._request(url, { type: "arraybuffer" })));
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([templateUrl, templateUrl]);

    const projectResource = new EngineObject(engine);
    const templateResource = new EngineObject(engine);
    rm.replaceCachedResource(projectUrl, projectResource);
    rm.replaceCachedResource(templateUrl, templateResource);
    expect(rm.getFromCache(projectUrl)).toBe(projectResource);
    expect(rm.getFromCache(templateUrl)).toBe(templateResource);
  });

  it("rejects immediately when config.signal is already aborted before checking prefetched caches", async () => {
    const rm = new ResourceManager(createTestEngine());
    rm.setPrefetchedTextAssets(new Map([["https://cdn.example.com/a.json", '{"ok":true}']]));
    rm.setPrefetchedBinaryAssets(new Map([["https://cdn.example.com/b.bin", new Uint8Array([1, 2, 3])]]));

    const customAbort = new AbortController();
    customAbort.abort(new Error("cancelled-by-caller"));
    await expect(
      rm._requestByRemoteUrl("https://cdn.example.com/b.bin", { type: "arraybuffer", signal: customAbort.signal })
    ).rejects.toThrow("cancelled-by-caller");

    const defaultAbort = new AbortController();
    defaultAbort.abort();
    await expect(
      rm._requestByRemoteUrl("https://cdn.example.com/a.json", { type: "json", signal: defaultAbort.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("serves defensive arraybuffer copies and decoded text/json from prefetched binary cache", async () => {
    const rm = new ResourceManager(createTestEngine());
    const backing = new Uint8Array([10, 20, 30, 40]);
    const textBytes = new TextEncoder().encode('{"hello":"world"}');
    rm.setPrefetchedBinaryAssets(
      new Map([
        ["https://cdn.example.com/mesh.bin", backing],
        ["https://cdn.example.com/data.json", textBytes]
      ])
    );

    const p1 = rm._requestByRemoteUrl<ArrayBuffer>("https://cdn.example.com/mesh.bin", { type: "arraybuffer" });
    expect(p1).toBeInstanceOf(AssetPromise);
    const buf1 = await p1;
    expect(buf1).not.toBe(backing.buffer);
    new Uint8Array(buf1).fill(0);
    expect(Array.from(backing)).toEqual([10, 20, 30, 40]);

    const txt = await rm._requestByRemoteUrl<string>("https://cdn.example.com/data.json", { type: "text" });
    expect(txt).toBe('{"hello":"world"}');
    const obj = await rm._requestByRemoteUrl<{ hello: string }>("https://cdn.example.com/data.json", { type: "json" });
    expect(obj).toEqual({ hello: "world" });
  });
});
