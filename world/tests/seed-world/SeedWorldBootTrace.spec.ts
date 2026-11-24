import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { seedWorldBootTrace } from "../../demos/seed-world/src/SeedWorldBootTrace";
import { summarizeSeedWorldShaderAudit } from "../../demos/seed-world/src/SeedWorldShaderAudit";
import { PlanningWorkerClient } from "../../demos/seed-world/src/planning/semantic-study/PlanningWorkerClient";
import {
  loadSeedWorldBuildingBinaryBundle,
  loadSeedWorldCommonBinaryBundle,
  loadSeedWorldTemplateBinaryBundles,
  mergeSeedWorldBinaryAssetMaps,
  parseSeedWorldCommonBinaryBundle,
  releaseSeedWorldCommonBinaryBundle,
  type SeedWorldTemplateBundleShardProgress
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

describe("SeedWorldBootTrace resource category classification", () => {
  it("classifies all seed-world-*-bundle artifacts (common, building, text, future splits) under bundle", () => {
    const originalGetEntries = performance.getEntriesByType;
    performance.getEntriesByType = ((type: string) => {
      if (type !== "resource") return [];
      return [
        {
          name: "https://example.test/assets/seed-world-common-bin-bundle-aaaaaaaa.bin",
          initiatorType: "fetch",
          startTime: 10,
          duration: 20,
          transferSize: 500_000,
          decodedBodySize: 500_000
        },
        {
          name: "https://example.test/assets/seed-world-building-bin-bundle-bbbbbbbb.bin",
          initiatorType: "fetch",
          startTime: 15,
          duration: 25,
          transferSize: 1_350_000,
          decodedBodySize: 1_350_000
        },
        {
          name: "https://example.test/assets/seed-world-project-text-bundle-cccccccc.json",
          initiatorType: "fetch",
          startTime: 20,
          duration: 10,
          transferSize: 250_000,
          decodedBodySize: 900_000
        }
      ];
    }) as typeof performance.getEntriesByType;
    try {
      seedWorldBootTrace.reset();
      const snap = seedWorldBootTrace.snapshot();
      expect(snap.resourceStats.byCategory.bundle?.count).toBe(3);
      expect(snap.resourceStats.byCategory.bundle?.transferBytes).toBe(2_100_000);
      expect(snap.resourceStats.byCategory.mesh).toBeUndefined();
    } finally {
      performance.getEntriesByType = originalGetEntries;
      seedWorldBootTrace.dispose(false);
    }
  });
});

describe("PlanningWorkerClient.prewarm ownership and failure recovery", () => {
  it("recovers cleanly if a prewarmed worker fails before initialize(), isolates instances, and terminates on dispose()", async () => {
    const instances: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: ((e: { message?: string }) => void) | null = null;
      terminated = false;
      posted: unknown[] = [];
      constructor() {
        instances.push(this);
      }
      postMessage(msg: unknown) {
        this.posted.push(msg);
      }
      terminate() {
        this.terminated = true;
      }
    }
    const originalWorker = globalThis.Worker;
    (globalThis as unknown as { Worker: typeof Worker }).Worker = FakeWorker as unknown as typeof Worker;
    try {
      const clientA = new PlanningWorkerClient();
      const clientB = new PlanningWorkerClient();
      clientA.prewarm();
      expect(instances).toHaveLength(1);
      const firstWorker = instances[0]!;
      expect(firstWorker.onerror).not.toBeNull();

      // Another client must never steal clientA's prewarmed worker.
      const pendingB = clientB.initialize(7);
      expect(instances).toHaveLength(2);
      expect(firstWorker.posted).toHaveLength(0);
      instances[1]!.onerror?.({ message: "worker-b error" });
      await expect(pendingB).rejects.toThrow("worker-b error");
      clientB.dispose();

      // Pre-adoption failure terminates and discards the dead prewarmed worker;
      // subsequent initialize() spawns a fresh Worker instead of hanging forever.
      firstWorker.onerror?.({ message: "early fetch failure" });
      expect(firstWorker.terminated).toBe(true);

      const pendingA = clientA.initialize(42);
      expect(instances).toHaveLength(3);
      const freshWorker = instances[2]!;
      expect(freshWorker.posted).toHaveLength(1);
      freshWorker.onmessage?.({
        data: { type: "initialized", requestId: (freshWorker.posted[0] as { requestId: number }).requestId, document: { version: 2 } }
      });
      await expect(pendingA).resolves.toEqual({ version: 2 });
      clientA.dispose();

      // Disposing an unadopted prewarmed client terminates its Worker cleanly.
      const clientC = new PlanningWorkerClient();
      clientC.prewarm();
      expect(instances).toHaveLength(4);
      clientC.dispose();
      expect(instances[3]!.terminated).toBe(true);
    } finally {
      (globalThis as unknown as { Worker: typeof Worker }).Worker = originalWorker;
    }
  });
});

describe("progressive SWB1 shard registration and non-blocking cold-start order", () => {
  it("registers each SWB1 shard into onShardLoaded and fetch() immediately as it arrives, replays to late subscribers, and drops late shards after release", async () => {
    releaseSeedWorldCommonBinaryBundle();
    const originalFetch = globalThis.fetch;
    const baseFetch = (async () => new Response("fallback", { status: 404 })) as typeof fetch;
    globalThis.fetch = baseFetch;
    try {
      const shard0Buf = buildSwb1Pack([
        ["packages/vegetation/src/asset-assembly/generated/procedural-trees/a.json", new TextEncoder().encode('{"ok":1}')]
      ]);
      const shard1Buf = buildSwb1Pack([
        ["packages/terrain/src/data/seed-world/public/tex.ktx2", new Uint8Array([9, 8, 7, 6])]
      ]);
      let resolveShard0!: (resp: Response) => void;
      let resolveShard1!: (resp: Response) => void;
      const customFetch = ((url: string | URL | Request) => {
        const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (href.endsWith("shard-0.bin")) {
          return new Promise<Response>((resolve) => {
            resolveShard0 = resolve;
          });
        }
        return new Promise<Response>((resolve) => {
          resolveShard1 = resolve;
        });
      }) as typeof fetch;

      const eventsA: Array<{ keys: string[]; progress: SeedWorldTemplateBundleShardProgress }> = [];
      const task = loadSeedWorldTemplateBinaryBundles(
        "original",
        (assets, progress) => {
          eventsA.push({ keys: [...assets.keys()], progress });
        },
        {
          urls: ["shard-0.bin", "shard-1.bin"],
          moduleBaseUrl: "https://example.test/assets/SeedWorldDemo.js",
          distRootUrl: "https://example.test/",
          fetchImpl: customFetch
        }
      );

      // Shard 0 completes while shard 1 is still pending on slow Wi-Fi.
      resolveShard0(new Response(shard0Buf.buffer.slice(shard0Buf.byteOffset, shard0Buf.byteOffset + shard0Buf.byteLength), { status: 200 }));
      await new Promise((r) => setTimeout(r, 10));

      expect(eventsA).toHaveLength(1);
      expect(eventsA[0]!.progress).toMatchObject({ shardIndex: 0, completedShards: 1, totalShards: 2 });
      // Fetch interceptor must already serve shard 0's entry from memory before shard 1 finishes!
      const hitResp = await globalThis.fetch(
        "https://example.test/packages/vegetation/src/asset-assembly/generated/procedural-trees/a.json"
      );
      expect(hitResp.status).toBe(200);
      expect(await hitResp.text()).toBe('{"ok":1}');

      // Late subscriber immediately receives already-arrived shard 0 AND later receives shard 1.
      const eventsB: Array<{ keys: string[]; progress: SeedWorldTemplateBundleShardProgress }> = [];
      const taskB = loadSeedWorldTemplateBinaryBundles(
        "original",
        (assets, progress) => {
          eventsB.push({ keys: [...assets.keys()], progress });
        },
        {
          urls: ["shard-0.bin", "shard-1.bin"],
          moduleBaseUrl: "https://example.test/assets/SeedWorldDemo.js",
          distRootUrl: "https://example.test/",
          fetchImpl: customFetch
        }
      );
      expect(taskB).toBe(task);
      expect(eventsB).toHaveLength(1);
      expect(eventsB[0]!.keys).toContain(
        "https://example.test/packages/vegetation/src/asset-assembly/generated/procedural-trees/a.json"
      );

      // Now shard 1 arrives.
      resolveShard1(new Response(shard1Buf.buffer.slice(shard1Buf.byteOffset, shard1Buf.byteOffset + shard1Buf.byteLength), { status: 200 }));
      const merged = await task;
      expect(merged?.size).toBe(2);
      expect(eventsA).toHaveLength(2);
      expect(eventsA[1]!.progress).toMatchObject({ shardIndex: 1, completedShards: 2, totalShards: 2 });
      expect(eventsB).toHaveLength(2);

      // Releasing uninstalls fetch wrapper and clears all state cleanly.
      releaseSeedWorldCommonBinaryBundle();
      expect(globalThis.fetch).toBe(baseFetch);
      const missAfterRelease = await globalThis.fetch(
        "https://example.test/packages/vegetation/src/asset-assembly/generated/procedural-trees/a.json"
      );
      expect(missAfterRelease.status).toBe(404);

      // A shard completing AFTER releaseSeedWorldCommonBinaryBundle() must be dropped without re-installing fetch wrapper.
      let resolveLate!: (resp: Response) => void;
      const lateTask = loadSeedWorldTemplateBinaryBundles(
        "sakura-pearl",
        () => {
          throw new Error("listener should not fire after release");
        },
        {
          urls: ["late.bin"],
          moduleBaseUrl: "https://example.test/assets/SeedWorldDemo.js",
          distRootUrl: "https://example.test/",
          fetchImpl: (() => new Promise<Response>((resolve) => {
            resolveLate = resolve;
          })) as typeof fetch
        }
      );
      releaseSeedWorldCommonBinaryBundle();
      resolveLate(new Response(shard0Buf.buffer.slice(shard0Buf.byteOffset, shard0Buf.byteOffset + shard0Buf.byteLength), { status: 200 }));
      expect(await lateTask).toBeUndefined();
      expect(globalThis.fetch).toBe(baseFetch);
    } finally {
      releaseSeedWorldCommonBinaryBundle();
      globalThis.fetch = originalFetch;
    }
  });

  it("launches raster.run, rockFormations.prepare, and project migration before awaiting template binary bundles in SeedWorldDemo", () => {
    const source = readFileSync(new URL("../../demos/seed-world/SeedWorldDemo.ts", import.meta.url), "utf8");
    const rasterIdx = source.indexOf('timed("raster.run"');
    const rocksIdx = source.indexOf('timed("rockFormations.prepare"');
    const migrateIdx = source.indexOf('timed("planningStorage.migrateToSource"');
    const awaitTemplateIdx = source.indexOf('timed("await template binary bundles"');
    const loadSceneIdx = source.indexOf('timed("loadSeedWorldScene"');
    expect(rasterIdx).toBeGreaterThan(-1);
    expect(rocksIdx).toBeGreaterThan(-1);
    expect(migrateIdx).toBeGreaterThan(-1);
    expect(awaitTemplateIdx).toBeGreaterThan(-1);
    expect(loadSceneIdx).toBeGreaterThan(-1);
    expect(rasterIdx).toBeLessThan(awaitTemplateIdx);
    expect(rocksIdx).toBeLessThan(awaitTemplateIdx);
    expect(migrateIdx).toBeLessThan(awaitTemplateIdx);
    expect(awaitTemplateIdx).toBeLessThan(loadSceneIdx);
  });

  it("P1-17: drops in-flight common and building SWB1 bundles that complete after releaseSeedWorldCommonBinaryBundle without resurrecting globalThis.fetch", async () => {
    releaseSeedWorldCommonBinaryBundle();
    const originalFetch = globalThis.fetch;
    const baseFetch = (async () => new Response("fallback", { status: 404 })) as typeof fetch;
    globalThis.fetch = baseFetch;
    try {
      const commonBuf = buildSwb1Pack([
        ["packages/terrain/src/data/seed-world/public/Shader/Terrain.shaderc", new TextEncoder().encode("{}")]
      ]);
      const buildingBuf = buildSwb1Pack([
        ["packages/building/src/assets/wall.mesh", new Uint8Array([1, 2, 3, 4])]
      ]);
      let resolveCommon!: (resp: Response) => void;
      let resolveBuilding!: (resp: Response) => void;
      const commonTask = loadSeedWorldCommonBinaryBundle({
        url: "common.bin",
        moduleBaseUrl: "https://example.test/assets/SeedWorldDemo.js",
        distRootUrl: "https://example.test/",
        fetchImpl: (() =>
          new Promise<Response>((resolve) => {
            resolveCommon = resolve;
          })) as typeof fetch
      });
      const buildingTask = loadSeedWorldBuildingBinaryBundle({
        url: "building.bin",
        moduleBaseUrl: "https://example.test/assets/SeedWorldDemo.js",
        distRootUrl: "https://example.test/",
        fetchImpl: (() =>
          new Promise<Response>((resolve) => {
            resolveBuilding = resolve;
          })) as typeof fetch
      });

      // Dispose/release while both SWB1 bundles are still in flight.
      releaseSeedWorldCommonBinaryBundle();
      expect(globalThis.fetch).toBe(baseFetch);

      resolveCommon(
        new Response(commonBuf.buffer.slice(commonBuf.byteOffset, commonBuf.byteOffset + commonBuf.byteLength), {
          status: 200
        })
      );
      resolveBuilding(
        new Response(buildingBuf.buffer.slice(buildingBuf.byteOffset, buildingBuf.byteOffset + buildingBuf.byteLength), {
          status: 200
        })
      );

      expect(await commonTask).toBeUndefined();
      expect(await buildingTask).toBeUndefined();
      // globalThis.fetch must remain uninstalled (not resurrected by stale bundles).
      expect(globalThis.fetch).toBe(baseFetch);
    } finally {
      releaseSeedWorldCommonBinaryBundle();
      globalThis.fetch = originalFetch;
    }
  });
});
