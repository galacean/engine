import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { seedWorldBootTrace } from "../../demos/seed-world/src/SeedWorldBootTrace";
import { summarizeSeedWorldShaderAudit } from "../../demos/seed-world/src/SeedWorldShaderAudit";
import {
  mergeSeedWorldBinaryAssetMaps,
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

  it("summarizes shader audit misses, reveal hits, and wasted startup compiles", () => {
    const summary = summarizeSeedWorldShaderAudit({
      parallelCompile: false,
      warmupRequested: 2,
      warmupDeferred: 1,
      compiled: [
        {
          programId: 1,
          shader: "Terrain/Terrain",
          si: 0,
          pi: 0,
          stage: "Forward",
          macros: ["A"],
          phase: "startup-warmup",
          caller: "warmup",
          stack: [],
          compiledAtMs: 1000,
          elapsedMs: 120
        },
        {
          programId: 2,
          shader: "Masonry/Wall",
          si: 0,
          pi: 0,
          stage: "Forward",
          macros: ["B"],
          phase: "startup-warmup",
          caller: "warmup",
          stack: [],
          compiledAtMs: 1120,
          elapsedMs: 240
        },
        {
          programId: 3,
          shader: "Water/Surface",
          si: 0,
          pi: 0,
          stage: "Forward",
          macros: ["C"],
          phase: "reveal",
          caller: "render-loop",
          stack: [],
          compiledAtMs: 2100,
          elapsedMs: 85
        }
      ],
      boundProgramIds: [1, 3],
      boundByPhase: { reveal: [1, 3] }
    });

    expect(summary.compiledTotal).toBe(3);
    expect(summary.compiledInStartupCount).toBe(2);
    expect(summary.startupBoundInRevealCount).toBe(1);
    expect(summary.startupWastedInRevealCount).toBe(1);
    expect(summary.startupWastedInReveal[0]?.shader).toBe("Masonry/Wall");
    expect(summary.revealCompileMissCount).toBe(1);
    expect(summary.revealCompileMisses[0]?.shader).toBe("Water/Surface");
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
    const merged = mergeSeedWorldBinaryAssetMaps(
      new Map([["a", new Uint8Array([1])]]),
      undefined,
      new Map([["b", new Uint8Array([2])]])
    );
    expect(merged?.size).toBe(2);
    expect(Array.from(merged!.get("b")!)).toEqual([2]);
    expect(() => releaseSeedWorldCommonBinaryBundle()).not.toThrow();
  });
});
