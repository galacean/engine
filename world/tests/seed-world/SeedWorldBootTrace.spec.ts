import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { seedWorldBootTrace } from "../../demos/seed-world/src/SeedWorldBootTrace";
import {
  parseSeedWorldCommonBinaryBundle,
  releaseSeedWorldCommonBinaryBundle
} from "../../demos/seed-world/src/SeedWorldCommonBinaryBundle";
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

function buildSwb1Pack(entries: ReadonlyArray<readonly [string, Uint8Array]>): Buffer {
  const index: Array<[string, number, number]> = [];
  let offset = 0;
  for (const [key, bytes] of entries) {
    index.push([key, offset, bytes.byteLength]);
    offset += bytes.byteLength;
  }
  const header = Buffer.from(JSON.stringify(index), "utf8");
  const prefix = Buffer.alloc(8);
  prefix.write("SWB1", 0, 4, "ascii");
  prefix.writeUInt32LE(header.length, 4);
  return Buffer.concat([prefix, header, ...entries.map(([, bytes]) => Buffer.from(bytes))]);
}

describe("parseSeedWorldCommonBinaryBundle", () => {
  it("decodes gzipped SWB1 bundles into CDN and dist-relative URL slices", async () => {
    const meshBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const shaderBytes = new TextEncoder().encode('{"name":"TestShader"}');
    const raw = buildSwb1Pack([
      ["https://mdn.alipayobjects.com/asap_serivce/uri/file/as/seed-world-flash/abc-wall.mesh", meshBytes],
      ["packages/terrain/src/data/seed-world/public/Shader/Terrain.shaderc", shaderBytes]
    ]);
    const gz = zlib.gzipSync(raw);
    const arrayBuffer = gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength);

    const parsed = await parseSeedWorldCommonBinaryBundle(arrayBuffer, "https://example.test/app/");
    expect(parsed).toBeDefined();
    expect(parsed!.size).toBe(2);
    expect(
      Array.from(parsed!.get("https://mdn.alipayobjects.com/asap_serivce/uri/file/as/seed-world-flash/abc-wall.mesh")!)
    ).toEqual([1, 2, 3, 4, 5]);
    expect(
      new TextDecoder().decode(
        parsed!.get("https://example.test/app/packages/terrain/src/data/seed-world/public/Shader/Terrain.shaderc")!
      )
    ).toBe('{"name":"TestShader"}');
  });

  it("returns undefined on corrupt or truncated payloads so callers fall back to fetch", async () => {
    const bad = new TextEncoder().encode("NOT_A_BUNDLE").buffer;
    expect(await parseSeedWorldCommonBinaryBundle(bad, "https://example.test/")).toBeUndefined();
    expect(await parseSeedWorldCommonBinaryBundle(new ArrayBuffer(0), "https://example.test/")).toBeUndefined();
    expect(() => releaseSeedWorldCommonBinaryBundle()).not.toThrow();
  });
});
