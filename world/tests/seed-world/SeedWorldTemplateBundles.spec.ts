import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  EXCLUDED_TERRAIN_LEGACY_TEXTURES,
  LUSH_ONLY_TERRAIN_TEXTURES,
  SEED_WORLD_TEMPLATE_IDS,
  TEMPLATE_MEDIA_MAX_SHARD_BYTES,
  WORLD_TEMPLATE_ONLY_TERRAIN_TEXTURES,
  buildGzippedSwb1Pack,
  buildUncompressedSwb1Pack,
  classifySeedWorldTemplateMediaAsset,
  isSeedWorldBuildingTextureAsset,
  isSeedWorldCommonRockLodAsset,
  isSeedWorldExcludedCommonBinShader,
  previewCacheControlForPath,
  shardTemplateBundleEntries,
  stripPugcWasmSuffix,
  templatesForSeedWorldJsonAsset,
  templatesForSeedWorldMediaAsset
} from "../../scripts/seed-world-template-bundles.mjs";
import {
  loadSeedWorldBuildingBinaryBundle,
  loadSeedWorldTemplateBinaryBundles,
  parseSeedWorldCommonBinaryBundle,
  registerSeedWorldPrefetchedFetchAssets,
  releaseSeedWorldCommonBinaryBundle,
  resolveSeedWorldTemplateBinaryBundleUrls,
  uninstallSeedWorldFetchPrefetchInterceptor
} from "../../demos/seed-world/src/SeedWorldCommonBinaryBundle";
import {
  loadSeedWorldProjectTextBundle,
  releaseSeedWorldProjectTextBundle
} from "../../demos/seed-world/src/SeedWorldProjectTextBundle";
import { loadPlantJSON } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantResources";

describe("seed-world-template-bundles", () => {
  afterEach(() => {
    releaseSeedWorldCommonBinaryBundle();
    releaseSeedWorldProjectTextBundle();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("isolates template-specific media and excludes lazy/unused/audio/polaroid assets from all templates", () => {
    // Always excluded from template SWB1 (lazy / unused pre-reveal / audio / fallback duplicates / common-bin rocks)
    for (const excluded of [
      "assets/polaroid-camera-f043b585.glb",
      "assets/polaroid-photo-c16ee9bd.glb",
      "assets/rake-85f1096d.glb",
      "assets/thumbtack-64247222.glb",
      "assets/splash-2x2-97d015c4.ktx2",
      "assets/precipitation-ring-50c4f4d0.ktx2",
      "assets/T_VFX_Snowflake_01_O-ecfdbb32.ktx2",
      "assets/grass-mud-albedo-smoothness-1024-ab6fd132.png",
      "assets/grass-mud-albedo-smoothness-1024-dd0430ef.ktx2",
      "assets/grass-mud-normal-1024-f0174437.ktx2",
      "assets/grass-color-detail-12d949f4.r8",
      "assets/meadow-birch-bark-256-3f517792.png",
      "assets/dead-tree-leaves-c4ae35ca.png",
      "assets/basecolor-7d0d05bf.jpg",
      "assets/grass-71dfcb7b.wav",
      // Lazy crop atlases (6.07 MiB) & river waterfall drops (1.57 MiB)
      "packages/farming/src/farming/assets/plant-textures/tomato-farmlands.ktx2",
      "packages/farming/src/farming/assets/plant-textures/potato-farmlands.ktx2",
      "packages/water/src/water/native/assets/Water/Textures/farmlands-drop-cloud.ktx2",
      // Legacy unused terrain files (2.84 MiB) + rock-clif-1 (0.49 MiB)
      "packages/terrain/src/data/seed-world/public/textures/terrain-grass-2.png",
      "packages/terrain/src/data/seed-world/public/textures/terrain-mud-2-normal.ktx2",
      "packages/terrain/src/data/seed-world/public/Models/1adfe9392d9a2aac.treewind",
      "packages/terrain/src/data/seed-world/public/Texture/5dcc6789bfb6b312.ktx2",
      "packages/terrain/src/data/seed-world/public/atoms/stone-1-lod0.glb",
      "packages/terrain/src/data/seed-world/public/atoms/rock-clif-1-lod0.glb",
      // Unused procedural vegetation PNGs & low-poly duplicate
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-coverplants_01_summer-part-07-packed-256.png",
      "packages/world-planning/src/assets/low-poly/meadow-blocks.jpg",
      // Rock LOD1/2 moved to common-bin-bundle
      "packages/world-planning/src/integrations/terrain/rock-formation/lod-meshes/rock-15/lod1.glb"
    ]) {
      expect(templatesForSeedWorldMediaAsset(excluded), excluded).toEqual([]);
    }

    // Shared rock LOD1/2 GLBs route into `seed-world-common-bin-bundle` (not template SWB1)
    expect(
      isSeedWorldCommonRockLodAsset(
        "packages/world-planning/src/integrations/terrain/rock-formation/lod-meshes/rock-15/lod1.glb"
      )
    ).toBe(true);
    expect(isSeedWorldCommonRockLodAsset("assets/hoe-077dcce8.glb")).toBe(false);

    // Raw editor water `.shader` text files (398.9 KiB) are excluded from `seed-world-common-bin-bundle`
    // because runtime uses precompiled `.shaderc` AOT binaries; VFX `.shader` files stay bundled.
    for (const rawWaterShader of [
      "packages/water/src/water/native/assets/Water/Shaders/lake.shader",
      "packages/water/src/water/native/assets/Water/Shaders/river.shader",
      "packages/water/src/water/native/assets/Water/Shaders/ocean.shader"
    ]) {
      expect(isSeedWorldExcludedCommonBinShader(rawWaterShader), rawWaterShader).toBe(true);
    }
    expect(
      isSeedWorldExcludedCommonBinShader(
        "packages/water/src/water/native/assets/Water/Shaders/S_VFX_TransparentAlpha_01.shader"
      )
    ).toBe(false);
    expect(
      isSeedWorldExcludedCommonBinShader("packages/water/src/water/native/assets/Water/Shaders/lake-heightfield.shaderc")
    ).toBe(false);

    // Deferred starter farm props (6 GLBs + 16 prop-textures KTX2s, ~4.66 MiB) are excluded from startup SWB1
    // across ALL templates because `deferOffscreenProps: true` loads them on demand only when visible/approached.
    const farmingAssetsRoot = path.resolve(__dirname, "../../../packages/farming/src/farming/assets");
    const propTextureDir = path.join(farmingAssetsRoot, "prop-textures");
    const propTextureFiles = fs
      .readdirSync(propTextureDir)
      .filter((name) => name.endsWith(".ktx2"))
      .sort();
    expect(propTextureFiles.length).toBe(16);
    for (const relGlb of [
      "storage/cart.glb",
      "storage/basket.glb",
      "harvest/basket.glb",
      "watering/watering-can.glb",
      "tilling/hoe.glb",
      "sowing/seed-sack.glb"
    ]) {
      expect(fs.existsSync(path.join(farmingAssetsRoot, relGlb)), `missing deferred source ${relGlb}`).toBe(true);
    }
    for (const deferredFarmStarterAsset of [
      "assets/cart-ef2df4e4.glb",
      "assets/watering-can-e0c3b6ee.glb",
      "assets/basket-4a677216.glb",
      "assets/basket-8f5b162f.glb",
      "assets/hoe-077dcce8.glb",
      "assets/seed-sack-ce1ad85e.glb",
      "assets/prop-textures/T_Farm_Tools_A_C.ktx2",
      "assets/prop-textures/T_SeedSack_C.ktx2",
      ...propTextureFiles.map((name) => `packages/farming/src/farming/assets/prop-textures/${name}`)
    ]) {
      expect(classifySeedWorldTemplateMediaAsset(deferredFarmStarterAsset), deferredFarmStarterAsset).toBe(
        "exclude_lazy"
      );
      expect(templatesForSeedWorldMediaAsset(deferredFarmStarterAsset), deferredFarmStarterAsset).toEqual([]);
    }

    // Farming core soil textures stay in all 3 lush templates (loaded at startup by SoilVisualProvider)
    expect(templatesForSeedWorldMediaAsset("assets/basecolor-614fb0dc.ktx2")).toEqual([
      "original",
      "sakura-pearl",
      "emerald-forest"
    ]);
    expect(templatesForSeedWorldMediaAsset("assets/normalogl-a791def9.ktx2")).toEqual([
      "original",
      "sakura-pearl",
      "emerald-forest"
    ]);

    // `989ee6ee7600c0e4.ktx2` (`Material/Vegetation/birch-leaves.mat`) is loaded only by WorldTemplateRuntime
    // presets (`sakura-pearl`, `emerald-forest`, `low-poly`, `titan-wasteland`, `oil-paint`) and excluded from `original`.
    const worldTemplateLeafTex = "packages/terrain/src/data/seed-world/public/Texture/989ee6ee7600c0e4.ktx2";
    expect(classifySeedWorldTemplateMediaAsset(worldTemplateLeafTex)).toBe("core_terrain_world_template");
    expect(templatesForSeedWorldMediaAsset(worldTemplateLeafTex)).toEqual([
      "sakura-pearl",
      "emerald-forest",
      "low-poly",
      "titan-wasteland",
      "oil-paint"
    ]);

    // Procedural tree PNGs loaded via project virtual paths stay keyed under `packages/vegetation/...` because
    // `ResourceManager._requestByRemoteUrl` serves `_prefetchedBinaryAssets` before `textureDownloadPaths` aliases.
    for (const sharedVegPng of [
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/dead-tree/dead-tree-bark-albedo.png",
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/dead-tree/dead-tree-bark-normal.png",
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/dead-tree/dead-tree-leaves.png",
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-flowers_01-part-01-256.png",
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-flowers_02-part-05-256.png"
    ]) {
      expect(classifySeedWorldTemplateMediaAsset(sharedVegPng), sharedVegPng).toBe("veg_proc_shared");
      expect(templatesForSeedWorldMediaAsset(sharedVegPng), sharedVegPng).toEqual([...SEED_WORLD_TEMPLATE_IDS]);
    }
    for (const birchVegPng of [
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-birch-bark-256.png",
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-birchtree_leaf_01_summer-part-01-256.png"
    ]) {
      expect(classifySeedWorldTemplateMediaAsset(birchVegPng), birchVegPng).toBe("veg_proc_birch");
      expect(templatesForSeedWorldMediaAsset(birchVegPng), birchVegPng).toEqual([
        "original",
        "sakura-pearl",
        "emerald-forest",
        "titan-wasteland",
        "oil-paint"
      ]);
    }
    expect(
      classifySeedWorldTemplateMediaAsset(
        "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-grass_02_summer-part-01-256.png"
      )
    ).toBe("veg_proc_template_grass");
    expect(
      templatesForSeedWorldMediaAsset(
        "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-grass_02_summer-part-01-256.png"
      )
    ).toEqual(["low-poly", "titan-wasteland"]);
    expect(
      classifySeedWorldTemplateMediaAsset(
        "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-flowers_03-part-01-256.png"
      )
    ).toBe("veg_proc_desert_plume");
    expect(
      templatesForSeedWorldMediaAsset(
        "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-flowers_03-part-01-256.png"
      )
    ).toEqual(["titan-wasteland"]);

    // Template-exclusive assets stay strictly in their owning template
    expect(templatesForSeedWorldMediaAsset("assets/pink-tree-4a81847b.glb")).toEqual(["sakura-pearl"]);
    expect(templatesForSeedWorldMediaAsset("assets/sakura-petal-c816b9a7.png")).toEqual(["sakura-pearl"]);
    expect(templatesForSeedWorldMediaAsset("assets/forest-giant-oak-05ab6df4.glb")).toEqual(["emerald-forest"]);
    expect(templatesForSeedWorldMediaAsset("assets/forest-luminous-mushroom-677e97ae.glb")).toEqual(["emerald-forest"]);
    expect(templatesForSeedWorldMediaAsset("packages/world-planning/src/assets/low-poly/cottage.glb")).toEqual([
      "low-poly"
    ]);
    expect(templatesForSeedWorldMediaAsset("assets/meadow-blocks-49000b14.jpg")).toEqual(["low-poly"]);
    expect(templatesForSeedWorldMediaAsset("assets/dead-tree-bark-albedo-4c6e1244.png")).toEqual(["titan-wasteland"]);
    expect(templatesForSeedWorldMediaAsset("assets/oasis-butterflies-510c9f29.png")).toEqual(["titan-wasteland"]);
    expect(templatesForSeedWorldMediaAsset("assets/oil-paint-water-swirl-color-512-1d82cae4.ktx2")).toEqual([
      "oil-paint"
    ]);
    expect(templatesForSeedWorldMediaAsset("assets/oil-paint-water-swirl-normal-512-d072ab7d.ktx2")).toEqual([
      "oil-paint"
    ]);

    // Building textures are deduplicated into `seed-world-building-tex-bundle` (excluded from per-template SWB1);
    // broadleaf-bark stays in lush/oil-paint templates; bridges only in original.
    const buildingTexPath = "packages/building/src/building/assets/native/Textures/plaster_colors-neutral.ktx2";
    expect(isSeedWorldBuildingTextureAsset(buildingTexPath)).toBe(true);
    expect(isSeedWorldBuildingTextureAsset("packages/building/src/building/assets/native/Meshes/wall.mesh")).toBe(
      false
    );
    expect(classifySeedWorldTemplateMediaAsset(buildingTexPath)).toBe("exclude_building_tex");
    expect(templatesForSeedWorldMediaAsset(buildingTexPath)).toEqual([]);
    expect(
      templatesForSeedWorldMediaAsset("packages/terrain/src/data/seed-world/public/Texture/ead4b76b302d6762.ktx2")
    ).toEqual(["original", "sakura-pearl", "emerald-forest", "oil-paint"]);
    expect(templatesForSeedWorldMediaAsset("assets/farmlands-bridge-parts-dd5de3d3.glb")).toEqual(["original"]);

    // Ocean textures excluded from continuous templates (`low-poly`, `titan-wasteland`, `oil-paint`)
    expect(
      templatesForSeedWorldMediaAsset("packages/water/src/water/native/assets/Water/Textures/ocean-roughWaves.ktx2")
    ).toEqual(["original", "sakura-pearl", "emerald-forest"]);
    // River water textures only in original & sakura-pearl; pond normal in original/sakura/low-poly/titan/oil-paint
    expect(
      templatesForSeedWorldMediaAsset(
        "packages/water/src/water/native/assets/Water/Textures/farmlands-caustics-color.ktx2"
      )
    ).toEqual(["original", "sakura-pearl"]);
    expect(
      templatesForSeedWorldMediaAsset(
        "packages/water/src/water/native/assets/Water/Textures/grasslands-water-normal-1024.ktx2"
      )
    ).toEqual(["original", "sakura-pearl", "low-poly", "titan-wasteland", "oil-paint"]);

    // Shared core environment included in all 5 templates
    expect(classifySeedWorldTemplateMediaAsset("assets/cloud-blue-noise-df6f9a6e.png")).toBe("core_env");
    expect(templatesForSeedWorldMediaAsset("assets/cloud-blue-noise-df6f9a6e.png")).toEqual([
      ...SEED_WORLD_TEMPLATE_IDS
    ]);
  });

  it("shards uncompressed SWB1 packs deterministically under maxShardBytes and round-trips through parser", async () => {
    const cap = 4096;
    const entries = [
      { key: "packages/building/src/a.ktx2", buf: Buffer.alloc(1800, 0x11) },
      { key: "https://mdn.alipayobjects.com/asap_serivce/uri/file/as/seed-world-flash/b.glb", buf: Buffer.alloc(1700, 0x22) },
      { key: "assets/cloud-blue-noise-12345678.png", buf: Buffer.alloc(1600, 0x33) },
      { key: "packages/water/src/c.ktx2", buf: Buffer.alloc(1500, 0x44) }
    ];
    const shardsA = shardTemplateBundleEntries(entries, cap);
    const shardsB = shardTemplateBundleEntries([...entries].reverse(), cap);

    expect(shardsA.length).toBeGreaterThanOrEqual(2);
    expect(shardsA.map((s) => s.map((e) => e.key))).toEqual(shardsB.map((s) => s.map((e) => e.key)));

    const reconstructed = new Map<string, Uint8Array>();
    for (const shard of shardsA) {
      const pack = buildUncompressedSwb1Pack(shard);
      // Must be raw SWB1 (not gzipped) and strictly within shard byte ceiling
      expect(pack.subarray(0, 4).toString("ascii")).toBe("SWB1");
      expect(pack[0] === 0x1f && pack[1] === 0x8b).toBe(false);
      expect(pack.byteLength).toBeLessThanOrEqual(cap);

      const ab = pack.buffer.slice(pack.byteOffset, pack.byteOffset + pack.byteLength);
      const parsed = await parseSeedWorldCommonBinaryBundle(ab, "https://example.test/app/");
      expect(parsed).toBeDefined();
      for (const [k, v] of parsed!) reconstructed.set(k, v);
    }

    expect(reconstructed.size).toBe(4);
    expect(reconstructed.get("https://example.test/app/packages/building/src/a.ktx2")?.[0]).toBe(0x11);
    expect(
      reconstructed.get("https://mdn.alipayobjects.com/asap_serivce/uri/file/as/seed-world-flash/b.glb")?.[0]
    ).toBe(0x22);
    expect(reconstructed.get("https://example.test/app/assets/cloud-blue-noise-12345678.png")?.[0]).toBe(0x33);
    expect(reconstructed.get("https://example.test/app/packages/water/src/c.ktx2")?.[0]).toBe(0x44);
    expect(TEMPLATE_MEDIA_MAX_SHARD_BYTES).toBe(10 * 1024 * 1024);
  });

  it("matches Flash App CDN bundle naming contract and resolves template manifests safely", () => {
    const flashAppBundleRe = /^assets\/seed-world-[a-z0-9-]+-bundle-[a-f0-9]+\.(?:bin|json)$/u;
    expect(flashAppBundleRe.test("assets/seed-world-building-tex-bundle-deadbeef.bin")).toBe(true);
    for (const templateId of SEED_WORLD_TEMPLATE_IDS) {
      expect(flashAppBundleRe.test(`assets/seed-world-tpl-${templateId}-s0-bundle-deadbeef.bin`)).toBe(true);
    }

    // Dev placeholder returns empty array
    expect(resolveSeedWorldTemplateBinaryBundleUrls("original", "__SEED_WORLD_TEMPLATE_BIN_BUNDLES_JSON__")).toEqual(
      []
    );
    expect(resolveSeedWorldTemplateBinaryBundleUrls("original", "{invalid")).toEqual([]);

    const manifest = JSON.stringify({
      original: ["./seed-world-tpl-original-s0-bundle-11111111.bin", "./seed-world-tpl-original-s1-bundle-22222222.bin"],
      "low-poly": ["./seed-world-tpl-low-poly-s0-bundle-33333333.bin"]
    });
    expect(resolveSeedWorldTemplateBinaryBundleUrls("low-poly", manifest)).toEqual([
      "./seed-world-tpl-low-poly-s0-bundle-33333333.bin"
    ]);
    // Unknown template falls back to original
    expect(resolveSeedWorldTemplateBinaryBundleUrls("unknown-template", manifest)).toEqual([
      "./seed-world-tpl-original-s0-bundle-11111111.bin",
      "./seed-world-tpl-original-s1-bundle-22222222.bin"
    ]);
  });

  it("returns undefined cleanly in dev mode (unreplaced placeholder) when calling loadSeedWorldTemplateBinaryBundles", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await loadSeedWorldTemplateBinaryBundles("original");
    expect(result).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("packs per-template large procedural tree structure JSONs & species catalog into gzipped SWB1 shards", async () => {
    expect(
      templatesForSeedWorldJsonAsset(
        "packages/vegetation/src/asset-assembly/generated/procedural-trees/plant-project-plant-species.json"
      )
    ).toEqual([...SEED_WORLD_TEMPLATE_IDS]);
    // Unused pre-reveal JSONs stay excluded from SWB1
    expect(templatesForSeedWorldJsonAsset("packages/water/src/water/native/assets/conversion.json")).toEqual([]);
    expect(
      templatesForSeedWorldJsonAsset(
        "packages/vegetation/src/asset-assembly/generated/procedural-trees/highlands-fir-3-tree-structure.json"
      )
    ).toEqual([]);
    // `birchtree_07` is excluded from `emerald-forest` (uses SM_BirchTree_01 + replacePopulation)
    expect(
      templatesForSeedWorldJsonAsset(
        "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-sm_birchtree_07-structure.json"
      )
    ).toEqual(["original", "sakura-pearl", "oil-paint"]);
    for (const lushTreeJson of [
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-sm_birchtree_01-structure.json",
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-sm_birchtree_02-structure.json"
    ]) {
      expect(templatesForSeedWorldJsonAsset(lushTreeJson), lushTreeJson).toEqual([
        "original",
        "sakura-pearl",
        "emerald-forest",
        "oil-paint"
      ]);
    }
    for (const birchBushJson of [
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-sm_birchbush_04-structure.json",
      "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-sm_birchbush_03-structure.json"
    ]) {
      expect(templatesForSeedWorldJsonAsset(birchBushJson), birchBushJson).toEqual([
        "original",
        "sakura-pearl",
        "emerald-forest",
        "titan-wasteland",
        "oil-paint"
      ]);
    }
    // Gallery-only plant-species.json stays excluded from Seed World templates
    expect(
      templatesForSeedWorldJsonAsset(
        "packages/vegetation/src/asset-assembly/generated/procedural-trees/plant-species.json"
      )
    ).toEqual([]);

    // Verify gzipped SWB1 pack round-trips through parseSeedWorldCommonBinaryBundle & matches Flash App naming
    const flashAppBundleRe = /^assets\/seed-world-[a-z0-9-]+-bundle-[a-f0-9]+\.(?:bin|json)$/u;
    for (const templateId of SEED_WORLD_TEMPLATE_IDS) {
      expect(flashAppBundleRe.test(`assets/seed-world-tpl-${templateId}-json-bundle-1234abcd.bin`)).toBe(true);
    }

    const sampleJson = JSON.stringify({ version: 1, treeRecipes: [{ id: "birch", branches: Array(200).fill(1) }] });
    const gz = buildGzippedSwb1Pack([
      {
        key: "packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-sm_birchtree_07-structure.json",
        buf: Buffer.from(sampleJson, "utf8")
      }
    ]);
    expect(gz[0]).toBe(0x1f);
    expect(gz[1]).toBe(0x8b);
    expect(gz[9]).toBe(0xff);
    expect(gz.byteLength).toBeLessThan(sampleJson.length);

    const ab = gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength);
    const parsed = await parseSeedWorldCommonBinaryBundle(ab, "https://example.test/app/");
    expect(parsed).toBeDefined();
    const decoded = new TextDecoder().decode(
      parsed!.get(
        "https://example.test/app/packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-sm_birchtree_07-structure.json"
      )!
    );
    expect(decoded).toBe(sampleJson);
  });

  it("keeps finished shards and aborts a stalled response body at the template bundle deadline", async () => {
    vi.useFakeTimers();
    const baseUrl = "https://example.test/";
    const key = "assets/tree.glb";
    const pack = buildUncompressedSwb1Pack([{ key, buf: Buffer.from([7]) }]);
    const listener = vi.fn();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = loadSeedWorldTemplateBinaryBundles("original", listener, {
      urls: ["ready.wasm", "stalled.wasm"],
      moduleBaseUrl: baseUrl,
      distRootUrl: baseUrl,
      fetchImpl: async (url, init) => {
        if (String(url).endsWith("ready.wasm")) return new Response(new Uint8Array(pack));
        const response = new Response();
        response.arrayBuffer = () =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
          });
        return response;
      }
    });
    let settled = false;
    void load.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(44_999);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toBe(true);
    expect((await load)?.get(baseUrl + key)).toEqual(new Uint8Array([7]));
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("aborts a template shard in flight when its bundle is released", async () => {
    let signal: AbortSignal | null | undefined;
    const listener = vi.fn();
    const load = loadSeedWorldTemplateBinaryBundles("original", listener, {
      urls: ["stalled.wasm"],
      moduleBaseUrl: "https://example.test/",
      fetchImpl: (_url, init) => {
        signal = init?.signal;
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal!.reason), { once: true });
        });
      }
    });

    releaseSeedWorldCommonBinaryBundle();

    expect(signal?.aborted).toBe(true);
    await expect(load).resolves.toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  it("intercepts direct GET fetch() calls for SWB1-prefetched assets and restores fetch on release", async () => {
    const baseFetch = vi.fn(async () => new Response("network", { status: 200 }));
    const savedGlobalFetch = globalThis.fetch;
    globalThis.fetch = baseFetch as unknown as typeof globalThis.fetch;
    try {
      const ktxBytes = new Uint8Array([0xab, 0x4b, 0x54, 0x58]);
      const jsonBytes = new TextEncoder().encode('{"ok":true}');
      registerSeedWorldPrefetchedFetchAssets(
        new Map<string, Uint8Array>([
          ["https://example.test/packages/water/ocean-roughWaves.ktx2", ktxBytes],
          ["https://example.test/packages/water/conversion.json", jsonBytes]
        ])
      );

      // Exact GET matches are served from memory with zero network calls
      const ktxRes = await fetch("https://example.test/packages/water/ocean-roughWaves.ktx2");
      expect(ktxRes.ok).toBe(true);
      expect(ktxRes.headers.get("content-type")).toContain("application/octet-stream");
      expect(Array.from(new Uint8Array(await ktxRes.arrayBuffer()))).toEqual([0xab, 0x4b, 0x54, 0x58]);

      const jsonRes = await fetch(new URL("https://example.test/packages/water/conversion.json"));
      expect(jsonRes.headers.get("content-type")).toContain("application/json");
      expect(await jsonRes.json()).toEqual({ ok: true });
      expect(baseFetch).not.toHaveBeenCalled();

      // Aborted signal rejects instead of returning cached bytes
      const ac = new AbortController();
      ac.abort(new DOMException("aborted", "AbortError"));
      await expect(
        fetch("https://example.test/packages/water/ocean-roughWaves.ktx2", { signal: ac.signal })
      ).rejects.toThrow(/aborted/i);

      // Non-matching URL and POST requests pass through to original fetch
      await fetch("https://example.test/other.json");
      await fetch("https://example.test/packages/water/conversion.json", { method: "POST" });
      expect(baseFetch).toHaveBeenCalledTimes(2);

      // Release cleanly restores original fetch
      releaseSeedWorldCommonBinaryBundle();
      expect(globalThis.fetch).toBe(baseFetch);
      await fetch("https://example.test/packages/water/ocean-roughWaves.ktx2");
      expect(baseFetch).toHaveBeenCalledTimes(3);
    } finally {
      uninstallSeedWorldFetchPrefetchInterceptor();
      globalThis.fetch = savedGlobalFetch;
    }
  });

  it("loads deduplicated building binary and building texture SWB1 bundles in parallel and merges entries", async () => {
    const baseUrl = "https://example.test/assets/";
    const distRootUrl = "https://example.test/";
    const binPack = buildGzippedSwb1Pack([
      { key: "packages/building/src/building/assets/native/Meshes/wall.mesh", buf: Buffer.from([1, 2, 3]) }
    ]);
    const texPack = buildUncompressedSwb1Pack([
      {
        key: "https://mdn.alipayobjects.com/asap_serivce/uri/file/as/seed-world-flash/plaster.ktx2",
        buf: Buffer.from([4, 5, 6, 7])
      }
    ]);
    const fetchedUrls: string[] = [];
    const merged = await loadSeedWorldBuildingBinaryBundle({
      url: "./seed-world-building-bin-bundle-11111111.bin",
      textureUrl: "./seed-world-building-tex-bundle-22222222.bin",
      moduleBaseUrl: baseUrl,
      distRootUrl,
      fetchImpl: async (url) => {
        const href = String(url);
        fetchedUrls.push(href);
        if (href.includes("building-bin-bundle")) return new Response(new Uint8Array(binPack));
        if (href.includes("building-tex-bundle")) return new Response(new Uint8Array(texPack));
        return new Response(null, { status: 404 });
      }
    });

    expect(fetchedUrls).toEqual([
      "https://example.test/assets/seed-world-building-bin-bundle-11111111.bin",
      "https://example.test/assets/seed-world-building-tex-bundle-22222222.bin"
    ]);
    expect(merged?.get("https://example.test/packages/building/src/building/assets/native/Meshes/wall.mesh")).toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(
      merged?.get("https://mdn.alipayobjects.com/asap_serivce/uri/file/as/seed-world-flash/plaster.ktx2")
    ).toEqual(new Uint8Array([4, 5, 6, 7]));
  });

  it("serves pruned project text bundle files through persistent fetch() interception across binary bundle release", async () => {
    const baseFetch = vi.fn(async () => new Response("network", { status: 200 }));
    const savedGlobalFetch = globalThis.fetch;
    globalThis.fetch = baseFetch as unknown as typeof globalThis.fetch;
    try {
      const textBundlePayload = JSON.stringify({
        "packages/terrain/src/data/seed-world/project.json": '{"scene":"main"}',
        "packages/water/src/water/native/assets/conversion.json": '{"water":true}'
      });
      const loaded = await loadSeedWorldProjectTextBundle({
        url: "./seed-world-project-text-bundle-deadbeef.json",
        moduleBaseUrl: "https://example.test/assets/chunk.js",
        distRootUrl: "https://example.test/",
        fetchImpl: async () => new Response(textBundlePayload, { status: 200 })
      });
      expect(loaded?.size).toBe(2);

      // Register a binary asset too, then release binary bundles as happens after scene reveal.
      registerSeedWorldPrefetchedFetchAssets(
        new Map<string, Uint8Array>([["https://example.test/assets/sample.ktx2", new Uint8Array([9, 8])]])
      );
      releaseSeedWorldCommonBinaryBundle();

      // Binary entry was cleared (passes through to network), while text-bundle entries remain intercepted!
      await fetch("https://example.test/assets/sample.ktx2");
      expect(baseFetch).toHaveBeenCalledTimes(1);

      const conversionRes = await fetch("https://example.test/packages/water/src/water/native/assets/conversion.json");
      expect(conversionRes.headers.get("content-type")).toContain("application/json");
      expect(await conversionRes.json()).toEqual({ water: true });
      expect(baseFetch).toHaveBeenCalledTimes(1);

      // Releasing the project text bundle restores the original globalThis.fetch cleanly.
      releaseSeedWorldProjectTextBundle();
      expect(globalThis.fetch).toBe(baseFetch);
    } finally {
      releaseSeedWorldCommonBinaryBundle();
      releaseSeedWorldProjectTextBundle();
      globalThis.fetch = savedGlobalFetch;
    }
  });

  it("caches resolved loadPlantJSON views per live JSONAsset and auto-invalidates on resource replacement or error", async () => {
    const assetV1 = { data: { version: "v1", assets: [] } };
    const assetV2 = { data: { version: "v2-replaced", assets: [] } };
    let currentAsset = assetV1;
    let failOnce = false;
    const load = vi.fn(async () => {
      if (failOnce) {
        failOnce = false;
        throw new Error("transient network error");
      }
      return currentAsset;
    });
    const fakeEngine = {
      resourceManager: { load }
    } as unknown as Parameters<typeof loadPlantJSON>[0];

    // Repeated/concurrent loads returning the same live JSONAsset reuse the WeakMap-cached resolved view
    const [a, b] = await Promise.all([
      loadPlantJSON<{ version: string }>(fakeEngine, "World/Vegetation/plant-species.json"),
      loadPlantJSON<{ version: string }>(fakeEngine, "World/Vegetation/plant-species.json")
    ]);
    expect(a.version).toBe("v1");
    expect(b).toBe(a);
    expect(load).toHaveBeenCalledTimes(2);

    // Replacing/destroying the cached JSONAsset at the SAME URL automatically returns a fresh resolved view
    currentAsset = assetV2;
    const c = await loadPlantJSON<{ version: string }>(fakeEngine, "World/Vegetation/plant-species.json");
    expect(c.version).toBe("v2-replaced");
    expect(c).not.toBe(a);

    // Rejected load does not poison subsequent retries
    failOnce = true;
    await expect(loadPlantJSON(fakeEngine, "World/Vegetation/plant-species.json")).rejects.toThrow("transient");
    const d = await loadPlantJSON<{ version: string }>(fakeEngine, "World/Vegetation/plant-species.json");
    expect(d).toBe(c);
  });

  it("strips PUGC .wasm suffix for unsupported asset extensions while leaving genuine .wasm binaries excluded", () => {
    // Supported PUGC-rewritten assets classify identically to their logical paths
    expect(stripPugcWasmSuffix("assets/cloud-detail-3d-9a9b5cdf.asset.wasm")).toBe(
      "assets/cloud-detail-3d-9a9b5cdf.asset"
    );
    expect(classifySeedWorldTemplateMediaAsset("assets/cloud-detail-3d-9a9b5cdf.asset.wasm")).toBe("core_env");
    expect(templatesForSeedWorldMediaAsset("assets/cloud-detail-3d-9a9b5cdf.asset.wasm")).toEqual([
      ...SEED_WORLD_TEMPLATE_IDS
    ]);

    expect(
      classifySeedWorldTemplateMediaAsset("packages/terrain/src/data/seed-world/public/textures/grass-surface-normal.rgb8.wasm")
    ).toBe("core_terrain_shared");
    expect(
      templatesForSeedWorldMediaAsset("packages/terrain/src/data/seed-world/public/textures/grass-surface-normal.rgb8.wasm")
    ).toEqual([...SEED_WORLD_TEMPLATE_IDS]);

    expect(
      classifySeedWorldTemplateMediaAsset("packages/terrain/src/data/seed-world/public/textures/grass-color-detail.r8.wasm")
    ).toBe("core_terrain_shared");
    expect(classifySeedWorldTemplateMediaAsset("assets/grass-color-detail-12d949f4.r8.wasm")).toBe("exclude_unused");
    expect(templatesForSeedWorldMediaAsset("assets/grass-color-detail-12d949f4.r8.wasm")).toEqual([]);

    expect(
      classifySeedWorldTemplateMediaAsset("packages/terrain/src/data/seed-world/public/textures/height.r16.wasm")
    ).toBe("core_terrain_shared");
    expect(
      classifySeedWorldTemplateMediaAsset("packages/terrain/src/data/seed-world/public/textures/weights.f32le.wasm")
    ).toBe("core_terrain_shared");

    expect(
      classifySeedWorldTemplateMediaAsset("packages/terrain/src/data/seed-world/public/Models/1adfe9392d9a2aac.treewind.wasm")
    ).toBe("exclude_unused");
    expect(
      templatesForSeedWorldMediaAsset("packages/terrain/src/data/seed-world/public/Models/1adfe9392d9a2aac.treewind.wasm")
    ).toEqual([]);

    // Genuine .wasm binaries must NEVER be stripped or classified into media bundles
    for (const realWasm of [
      "assets/esbuild-12345678.wasm",
      "assets/physx.release.wasm",
      "packages/physics/physx.release.simd.wasm"
    ]) {
      expect(stripPugcWasmSuffix(realWasm), realWasm).toBe(realWasm);
      expect(classifySeedWorldTemplateMediaAsset(realWasm), realWasm).toBeNull();
      expect(templatesForSeedWorldMediaAsset(realWasm), realWasm).toEqual([]);
    }
  });

  it("computes preview Cache-Control headers without marking non-hashed /packages/*/assets/ files immutable", () => {
    // 1. Non-hashed /packages/*/assets/** files must NOT be immutable
    expect(
      previewCacheControlForPath("/packages/building/src/building/assets/native/Textures/plaster_colors-neutral.ktx2")
    ).toBe("public, max-age=3600");
    expect(
      previewCacheControlForPath("/packages/farming/src/farming/assets/prop-textures/T_Farm_Tools_A_C.ktx2")
    ).toBe("public, max-age=3600");
    expect(
      previewCacheControlForPath("/packages/water/src/water/native/assets/Water/Textures/ocean-roughWaves.ktx2")
    ).toBe("public, max-age=3600");

    // 2. Content-hashed 16-hex /packages/.../<16hex>.ext files stay immutable
    expect(
      previewCacheControlForPath("/packages/terrain/src/data/seed-world/public/Texture/ead4b76b302d6762.ktx2")
    ).toBe("public, max-age=31536000, immutable");
    expect(previewCacheControlForPath("/packages/foo/bar.0123456789abcdef.bin")).toBe(
      "public, max-age=31536000, immutable"
    );

    // 3. Vite-emitted hashed /assets/* files stay immutable
    expect(previewCacheControlForPath("/assets/index-deadbeef.js")).toBe("public, max-age=31536000, immutable");
    expect(previewCacheControlForPath("/assets/seed-world-tpl-original-s0-bundle-82a341cc.bin")).toBe(
      "public, max-age=31536000, immutable"
    );

    // 4. HTML entries and non-root paths stay no-cache (even if a nested path contains "/assets/")
    expect(previewCacheControlForPath("/world/demos/seed-world/index.html")).toBe("no-cache");
    expect(previewCacheControlForPath("/index.html")).toBe("no-cache");
    expect(previewCacheControlForPath("/world/demos/seed-world/assets/preview.png")).toBe("no-cache");
  });

  it("keeps terrain legacy, lush-only, and world-template-only texture hash sets synchronized with packages/terrain/src/data/seed-world", () => {
    const terrainRoot = path.resolve(__dirname, "../../../packages/terrain/src/data/seed-world");
    const textureDir = path.join(terrainRoot, "public/Texture");
    const materialDir = path.join(terrainRoot, "public/Material");
    const existingTextures = new Set(fs.readdirSync(textureDir).filter((name) => name.endsWith(".ktx2")));

    const extractKtx2Names = (value: unknown, out: Set<string>) => {
      if (typeof value === "string" && value.endsWith(".ktx2")) {
        out.add(path.posix.basename(value));
      } else if (Array.isArray(value)) {
        for (const item of value) extractKtx2Names(item, out);
      } else if (value && typeof value === "object") {
        for (const child of Object.values(value)) extractKtx2Names(child, out);
      }
    };

    const matTextures = new Map<string, Set<string>>();
    const walkMats = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkMats(full);
        else if (entry.name.endsWith(".mat")) {
          const rel = path.relative(materialDir, full).split(path.sep).join("/");
          const refs = new Set<string>();
          extractKtx2Names(JSON.parse(fs.readFileSync(full, "utf8")), refs);
          matTextures.set(rel, refs);
        }
      }
    };
    walkMats(materialDir);

    const legacyMatKeys = new Set([
      "Surface/small-stones.mat",
      "Surface/birch-bark.mat",
      "Vegetation/broadleaf-branches.mat"
    ]);
    const broadleafBarkMatKey = "Surface/broadleaf-bark.mat";
    const worldTemplateLeafMatKeys = new Set([
      "Vegetation/birch-leaves.mat",
      "Vegetation/broadleaf-leaves.mat"
    ]);

    const otherMatRefs = new Set<string>();
    const legacyOnlyRefs = new Set<string>();
    const broadleafBarkOnlyRefs = new Set<string>();
    const worldTemplateLeafOnlyRefs = new Set<string>();
    for (const [matRel, refs] of matTextures) {
      if (!legacyMatKeys.has(matRel) && matRel !== broadleafBarkMatKey && !worldTemplateLeafMatKeys.has(matRel)) {
        for (const r of refs) otherMatRefs.add(r);
      }
    }
    // Also account for procedural vegetation `.mat` files in `packages/vegetation` (e.g. smoothness/dither textures
    // shared with `birch-leaves.mat` / `broadleaf-leaves.mat`).
    const vegMaterialDir = path.resolve(
      __dirname,
      "../../../packages/vegetation/src/asset-assembly/generated/procedural-trees"
    );
    const walkVegMats = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkVegMats(full);
        else if (entry.name.endsWith(".mat")) {
          const refs = new Set<string>();
          extractKtx2Names(JSON.parse(fs.readFileSync(full, "utf8")), refs);
          for (const r of refs) {
            // `plant-project-material-fe1cf6...` is lush broadleaf bark (tracked in broadleafBarkMatKey).
            if (!matTextures.get(broadleafBarkMatKey)?.has(r) || r === "140c55bd97c21b9b.ktx2") {
              otherMatRefs.add(r);
            }
          }
        }
      }
    };
    walkVegMats(vegMaterialDir);

    for (const matRel of legacyMatKeys) {
      expect(matTextures.has(matRel), `missing ${matRel}`).toBe(true);
      for (const r of matTextures.get(matRel)!) {
        if (!otherMatRefs.has(r) && !matTextures.get(broadleafBarkMatKey)?.has(r)) legacyOnlyRefs.add(r);
      }
    }
    expect(matTextures.has(broadleafBarkMatKey), `missing ${broadleafBarkMatKey}`).toBe(true);
    for (const r of matTextures.get(broadleafBarkMatKey)!) {
      if (!otherMatRefs.has(r) && !legacyOnlyRefs.has(r)) broadleafBarkOnlyRefs.add(r);
    }
    for (const matRel of worldTemplateLeafMatKeys) {
      expect(matTextures.has(matRel), `missing ${matRel}`).toBe(true);
      for (const r of matTextures.get(matRel)!) {
        if (!otherMatRefs.has(r) && !legacyOnlyRefs.has(r) && !broadleafBarkOnlyRefs.has(r)) {
          worldTemplateLeafOnlyRefs.add(r);
        }
      }
    }

    // Every tracked hash must exist on disk in public/Texture/
    for (const hash of EXCLUDED_TERRAIN_LEGACY_TEXTURES) {
      expect(existingTextures.has(hash), `stale legacy hash ${hash}`).toBe(true);
    }
    const lushKtx2Hashes = [...LUSH_ONLY_TERRAIN_TEXTURES].filter((name) => name.endsWith(".ktx2"));
    for (const hash of lushKtx2Hashes) {
      expect(existingTextures.has(hash), `stale lush-only hash ${hash}`).toBe(true);
    }
    for (const hash of WORLD_TEMPLATE_ONLY_TERRAIN_TEXTURES) {
      expect(existingTextures.has(hash), `stale world-template-only hash ${hash}`).toBe(true);
    }

    // Exact sync with the source .mat files (8 legacy + 4 lush-only broadleaf-bark + 1 world-template-only leaf base)
    expect([...EXCLUDED_TERRAIN_LEGACY_TEXTURES].sort()).toEqual([...legacyOnlyRefs].sort());
    expect(EXCLUDED_TERRAIN_LEGACY_TEXTURES.size).toBe(8);
    expect(lushKtx2Hashes.sort()).toEqual([...broadleafBarkOnlyRefs].sort());
    expect(lushKtx2Hashes.length).toBe(4);
    expect([...WORLD_TEMPLATE_ONLY_TERRAIN_TEXTURES].sort()).toEqual([...worldTemplateLeafOnlyRefs].sort());
    expect(WORLD_TEMPLATE_ONLY_TERRAIN_TEXTURES.size).toBe(1);
  });
});
