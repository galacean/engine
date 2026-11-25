import path from "node:path";
import zlib from "node:zlib";
import { PUGC_UNSUPPORTED_ASSET_EXTENSIONS } from "./project-assets.mjs";

/**
 * Strips the transparent `.wasm` suffix appended by `projectAssets({ pugcCompatible: true })` in Flash App builds
 * only when the underlying logical extension is in `PUGC_UNSUPPORTED_ASSET_EXTENSIONS`. Genuine `.wasm` binaries
 * (e.g. `assets/esbuild-*.wasm`, `physx.release.wasm`) are returned unchanged.
 */
export function stripPugcWasmSuffix(fileName) {
  const normalized = fileName.split(path.sep).join("/");
  if (!normalized.endsWith(".wasm")) return normalized;
  const stripped = normalized.slice(0, -".wasm".length);
  const innerExt = path.extname(stripped).toLowerCase();
  return PUGC_UNSUPPORTED_ASSET_EXTENSIONS.has(innerExt) ? stripped : normalized;
}

/**
 * Computes `Cache-Control` for local `vite preview` responses.
 * Checks `/packages/` BEFORE `/assets/` so non-hashed `/packages/<pkg>/assets/...` files get `max-age=3600`,
 * while genuinely content-hashed `/assets/...` and 16-hex `/packages/.../<16hex>.ext` keep `immutable`.
 */
export function previewCacheControlForPath(pathname) {
  if (pathname.startsWith("/packages/")) {
    return /(?:^|[/.])[a-f0-9]{16,}\.[a-z0-9]+$/i.test(pathname)
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600";
  }
  if (pathname.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

/** Canonical Seed World template IDs that receive dedicated startup SWB1 media bundles. */
export const SEED_WORLD_TEMPLATE_IDS = Object.freeze([
  "original",
  "sakura-pearl",
  "emerald-forest",
  "low-poly",
  "titan-wasteland"
]);

/** Already-compressed or binary media extensions consolidated into uncompressed per-template SWB1 shards. */
export const TEMPLATE_MEDIA_BUNDLE_EXTENSIONS = new Set([
  ".ktx2",
  ".glb",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".treewind",
  ".asset",
  ".r8",
  ".r16",
  ".rgb8",
  ".f32le"
]);

/** Strict 10 MiB ceiling per SWB1 shard (including SWB1 prefix + JSON index header) for bounded iOS RAM & parallel fetch. */
export const TEMPLATE_MEDIA_MAX_SHARD_BYTES = 10 * 1024 * 1024;

const VEGETATION_PROCEDURAL_TREES_PREFIX = "packages/vegetation/src/asset-assembly/generated/procedural-trees/";
const ROCK_FORMATION_LOD_PREFIX = "packages/world-planning/src/integrations/terrain/rock-formation/lod-meshes/";

/**
 * Shared rock LOD1/LOD2 GLBs (`24` files, ~409 KB raw / ~264 KB gz) placed in `seed-world-common-bin-bundle`
 * so `rockFormations.prepare` can run immediately alongside `raster.run` before template SWB1 arrives with 0 dup fetches.
 */
export function isSeedWorldCommonRockLodAsset(fileName) {
  const normalized = fileName.split(path.sep).join("/");
  return normalized.startsWith(ROCK_FORMATION_LOD_PREFIX) && path.extname(normalized).toLowerCase() === ".glb";
}

const LUSH_ALL_TREE_STRUCTURE_JSONS = new Set([
  `${VEGETATION_PROCEDURAL_TREES_PREFIX}meadow-sm_birchtree_01-structure.json`,
  `${VEGETATION_PROCEDURAL_TREES_PREFIX}meadow-sm_birchtree_02-structure.json`,
  `${VEGETATION_PROCEDURAL_TREES_PREFIX}meadow-sm_birchbush_03-structure.json`,
  `${VEGETATION_PROCEDURAL_TREES_PREFIX}meadow-sm_birchbush_04-structure.json`
]);
// `emerald-forest` uses `treeAssetId: "SM_BirchTree_01"` + `replacePopulation: true`, so `birchtree_07` is not used there.
const BIRCHTREE_07_STRUCTURE_JSON = `${VEGETATION_PROCEDURAL_TREES_PREFIX}meadow-sm_birchtree_07-structure.json`;
const CORE_TEMPLATE_JSON_FILES = new Set([`${VEGETATION_PROCEDURAL_TREES_PREFIX}plant-project-plant-species.json`]);

const LAZY_ASSET_PATTERN = /^(?:polaroid-|rake-|thumbtack-|splash-|precipitation-|T_VFX_Snowflake)/u;
const FALLBACK_TEXTURE_PATTERN = /^(?:grass-mud-.*\.png|basecolor-.*\.jpg|normalogl-.*\.jpg)$/u;
// Measured 0-hit pre-reveal assets under `assets/`: perimeter grass-mud soil, duplicate grass-color-detail,
// Vite-hashed meadow-* PNG duplicates (runtime loads packages/vegetation/... paths), and unused dead-tree-leaves.
const EXCLUDED_DIST_ASSET_PATTERN = /^(?:grass-mud-.*\.ktx2|grass-color-detail-|meadow-(?!blocks-)|dead-tree-leaves-)/u;
const CORE_ENV_ASSET_PATTERN = /^(?:cloud-|dirt-flat-color-)/u;
const FARMING_SOIL_CORE_PATTERN = /^(?:basecolor-.*\.ktx2|normalogl-.*\.ktx2)$/u;
const FARMING_STARTER_PROP_GLB_PATTERN = /^(?:cart-|basket-|seed-sack-|hoe-|watering-can-)/u;
const BRIDGES_ASSET_PATTERN = /^farmlands-bridge-/u;
const LOW_POLY_MEADOW_BLOCKS_PATTERN = /^meadow-blocks-/u;
const SAKURA_ASSET_PATTERN = /^(?:pink-tree-|sakura-petal-)/u;
const EMERALD_ASSET_PATTERN = /^forest-/u;
const DESERT_ASSET_PATTERN = /^(?:dead-tree-bark-|oasis-butterflies-)/u;

// Legacy retired `packages/terrain/src/data/seed-world/public/Texture/` hashes (small-stones.mat, birch-bark.mat,
// broadleaf-branches.mat) — 0% pre-reveal hits across all 5 templates.
export const EXCLUDED_TERRAIN_LEGACY_TEXTURES = new Set([
  "5dcc6789bfb6b312.ktx2",
  "4ca0ebd82cca607a.ktx2",
  "16aebaa24d830251.ktx2",
  "de856599baa49d24.ktx2",
  "4d38d602ec3ad9a6.ktx2",
  "e488e7b7f0fd2970.ktx2",
  "99437d6e68062de5.ktx2",
  "b439ea33e8b410b7.ktx2"
]);

// Broadleaf-bark textures (`Material/Surface/broadleaf-bark.mat`) + fir leaf mask — used ONLY by lush templates.
export const LUSH_ONLY_TERRAIN_TEXTURES = new Set([
  "ead4b76b302d6762.ktx2",
  "9ac46b6e4e795289.ktx2",
  "49af75b3cd28134b.ktx2",
  "c7dba986e975bc38.ktx2",
  "procedural-leaf-mask-fir.png"
]);

// Leaf base texture referenced only by `Material/Vegetation/{birch-leaves,broadleaf-leaves}.mat` — loaded exclusively
// by `WorldTemplateRuntime` (`sakura-pearl`, `emerald-forest`, `low-poly`, `titan-wasteland`) and 0-hit on `original`.
export const WORLD_TEMPLATE_ONLY_TERRAIN_TEXTURES = new Set(["989ee6ee7600c0e4.ktx2"]);

// Active terrain atoms actually consumed by Seed World pre-reveal (`World.scene`); legacy stone-1..4 / small-stone /
// stones / grass-2 / grass-3 / grass-2-authored / rock-clif-1 are excluded.
const ACTIVE_TERRAIN_ATOMS = new Set([
  "bush-large-lod0.glb",
  "bush-large-lod1.glb",
  "cartoon-tree-impostor.glb",
  "flower-1-lod1.glb",
  "flowers-1.glb",
  "flowers-2.glb",
  "grass.glb"
]);

// Procedural vegetation PNGs actively loaded pre-reveal across ALL 5 templates (`preparePlanningPopulationResources`).
// Note: even when non-Flash builds alias byte-identical PNGs via `project.json.textureDownloadPaths`,
// `ResourceManager._requestByRemoteUrl` serves `_prefetchedBinaryAssets` BEFORE `_downloadUrls`, so these
// `packages/vegetation/...` keys are 100% SWB1 hits in both normal and Flash App builds (0 extra HTTP requests).
const VEG_PROC_SHARED_FILES = new Set([
  "dead-tree/dead-tree-bark-albedo.png",
  "dead-tree/dead-tree-bark-normal.png",
  "dead-tree/dead-tree-leaves.png",
  "meadow-flowers_01-part-01-256.png",
  "meadow-flowers_01-part-02-256.png",
  "meadow-flowers_02-part-01-256.png",
  "meadow-flowers_02-part-05-256.png"
]);

// Procedural vegetation PNGs actively loaded pre-reveal ONLY by lush templates (original, sakura-pearl, emerald-forest).
const VEG_PROC_LUSH_FILES = new Set([
  "highlands-fir-3-bark-albedo.png",
  "highlands-fir-3-bark-normal.png",
  "highlands-bush-2-leaves.png",
  "meadow-birch-bark-256.png",
  "meadow-birchtree_leaf_01_summer-part-01-256.png"
]);

/**
 * Classifies a built dist asset path (POSIX-normalized) into a template media category.
 * Returns `null` (or `exclude_*`) when the file is excluded from per-template uncompressed SWB1 sharding.
 * Pruned files ALWAYS remain on disk / CDN so post-reveal lazy loading works transparently.
 */
export function classifySeedWorldTemplateMediaAsset(fileName) {
  const normalized = stripPugcWasmSuffix(fileName);
  const ext = path.extname(normalized).toLowerCase();
  if (!TEMPLATE_MEDIA_BUNDLE_EXTENSIONS.has(ext)) return null;

  const base = path.posix.basename(normalized);
  if (normalized.startsWith("assets/")) {
    // Offscreen starter farm props & prop textures are deferred at spawn (`deferOffscreenProps: true`); keep them
    // out of startup SWB1 shards while leaving emitted dist/CDN assets intact for on-demand deferred fetch.
    if (normalized.startsWith("assets/prop-textures/") && (base.startsWith("T_Farm_") || base.startsWith("T_SeedSack_"))) {
      return "exclude_lazy";
    }
    if (LAZY_ASSET_PATTERN.test(base)) return "exclude_lazy";
    if (FARMING_STARTER_PROP_GLB_PATTERN.test(base)) return "exclude_lazy";
    if (FALLBACK_TEXTURE_PATTERN.test(base)) return "exclude_fallback";
    if (EXCLUDED_DIST_ASSET_PATTERN.test(base)) return "exclude_unused";
    if (CORE_ENV_ASSET_PATTERN.test(base)) return "core_env";
    if (FARMING_SOIL_CORE_PATTERN.test(base)) return "farming_soil_core";
    if (BRIDGES_ASSET_PATTERN.test(base)) return "bridges";
    if (LOW_POLY_MEADOW_BLOCKS_PATTERN.test(base)) return "low_poly_extra";
    if (SAKURA_ASSET_PATTERN.test(base)) return "tpl_sakura";
    if (EMERALD_ASSET_PATTERN.test(base)) return "tpl_emerald";
    if (DESERT_ASSET_PATTERN.test(base)) return "tpl_desert";
    return null;
  }

  if (normalized.startsWith("packages/terrain/src/data/seed-world/")) {
    // Legacy static .treewind meshes, rock-clif-1, and terrain-{grass,mud}-2* are 0-hit across all 5 templates.
    if (ext === ".treewind") return "exclude_unused";
    if (/(?:^|\/)rock-clif-1-/u.test(normalized)) return "exclude_unused";
    if (/^(?:terrain-grass-2|terrain-mud-2)/u.test(base)) return "exclude_unused";
    if (/(?:^|\/)(?:lotus|mushroom)-/u.test(normalized)) return "terrain_lush_props";
    if (normalized.includes("/public/Models/")) return "exclude_unused";
    if (normalized.includes("/public/atoms/")) {
      return ACTIVE_TERRAIN_ATOMS.has(base) ? "core_terrain_shared" : "exclude_unused";
    }
    if (EXCLUDED_TERRAIN_LEGACY_TEXTURES.has(base)) return "exclude_unused";
    if (LUSH_ONLY_TERRAIN_TEXTURES.has(base)) return "core_terrain_lush";
    if (WORLD_TEMPLATE_ONLY_TERRAIN_TEXTURES.has(base)) return "core_terrain_world_template";
    return "core_terrain_shared";
  }

  if (normalized.startsWith("packages/building/")) {
    return "building_tex";
  }

  if (normalized.startsWith("packages/water/")) {
    if (base.includes("ocean-")) return "water_ocean";
    // River waterfall drop textures (`farmlands-drop-*.ktx2`, 1.57 MiB) are 0-hit pre-reveal across all templates.
    if (base.includes("farmlands-drop-")) return "exclude_lazy";
    if (base.startsWith("farmlands-")) return "water_river";
    if (base === "grasslands-water-normal-1024.ktx2") return "water_pond";
    return "exclude_unused";
  }

  if (normalized.startsWith(VEGETATION_PROCEDURAL_TREES_PREFIX)) {
    const rel = normalized.slice(VEGETATION_PROCEDURAL_TREES_PREFIX.length);
    if (VEG_PROC_SHARED_FILES.has(rel)) return "veg_proc_shared";
    if (VEG_PROC_LUSH_FILES.has(rel)) return "veg_proc_lush";
    return "exclude_unused";
  }

  if (normalized.startsWith("packages/world-planning/src/integrations/terrain/rock-formation/")) {
    // Packed into gzipped `seed-world-common-bin-bundle` (264 KB gz) so `rockFormations.prepare` runs pre-template-SWB1.
    return "exclude_common_bin";
  }

  if (normalized.startsWith("packages/world-planning/src/assets/low-poly/")) {
    // Runtime loads Vite-hashed `assets/meadow-blocks-*.jpg`; skip the unhashed duplicate copy.
    if (base === "meadow-blocks.jpg") return "exclude_unused";
    return "low_poly_extra";
  }

  if (normalized.startsWith("packages/farming/src/farming/assets/plant-textures/")) {
    // Crop textures (6.07 MiB) load lazily only when a player plants a crop.
    return "exclude_lazy";
  }

  if (normalized.startsWith("packages/farming/src/farming/assets/prop-textures/")) {
    // Starter farm prop textures (16 KTX2s, ~4.16 MiB) are deferred at spawn when farm props are offscreen.
    return "exclude_lazy";
  }

  return null;
}

const TEMPLATE_CATEGORY_SETS = Object.freeze({
  original: new Set([
    "core_env",
    "core_terrain_shared",
    "core_terrain_lush",
    "terrain_lush_props",
    "veg_proc_shared",
    "veg_proc_lush",
    "water_pond",
    "water_river",
    "water_ocean",
    "building_tex",
    "bridges",
    "farming_soil_core"
  ]),
  "sakura-pearl": new Set([
    "core_env",
    "core_terrain_shared",
    "core_terrain_lush",
    "core_terrain_world_template",
    "terrain_lush_props",
    "veg_proc_shared",
    "veg_proc_lush",
    "water_pond",
    "water_river",
    "water_ocean",
    "building_tex",
    "farming_soil_core",
    "tpl_sakura"
  ]),
  "emerald-forest": new Set([
    "core_env",
    "core_terrain_shared",
    "core_terrain_lush",
    "core_terrain_world_template",
    "terrain_lush_props",
    "veg_proc_shared",
    "veg_proc_lush",
    "water_ocean",
    "building_tex",
    "farming_soil_core",
    "tpl_emerald"
  ]),
  "low-poly": new Set([
    "core_env",
    "core_terrain_shared",
    "core_terrain_world_template",
    "terrain_lush_props",
    "veg_proc_shared",
    "water_pond",
    "low_poly_extra"
  ]),
  "titan-wasteland": new Set([
    "core_env",
    "core_terrain_shared",
    "core_terrain_world_template",
    "terrain_lush_props",
    "veg_proc_shared",
    "water_pond",
    "tpl_desert"
  ])
});

/** Returns the ordered list of template IDs whose startup SWB1 bundle should contain `fileName`. */
export function templatesForSeedWorldMediaAsset(fileName) {
  const category = classifySeedWorldTemplateMediaAsset(fileName);
  if (!category || category.startsWith("exclude_")) return [];
  const matched = [];
  for (const templateId of SEED_WORLD_TEMPLATE_IDS) {
    if (TEMPLATE_CATEGORY_SETS[templateId].has(category)) {
      matched.push(templateId);
    }
  }
  return matched;
}

/**
 * Classifies large pre-reveal JSON assets (> 128 KiB, skipped by the small text bundle) into per-template gzipped SWB1
 * JSON shard membership. Keeps lush procedural tree structure JSONs strictly scoped to templates that actually use them.
 */
export function templatesForSeedWorldJsonAsset(fileName) {
  const normalized = fileName.split(path.sep).join("/");
  if (CORE_TEMPLATE_JSON_FILES.has(normalized)) {
    return [...SEED_WORLD_TEMPLATE_IDS];
  }
  if (LUSH_ALL_TREE_STRUCTURE_JSONS.has(normalized)) {
    return ["original", "sakura-pearl", "emerald-forest"];
  }
  if (normalized === BIRCHTREE_07_STRUCTURE_JSON) {
    return ["original", "sakura-pearl"];
  }
  return [];
}

/**
 * Packs `{ key, buf }` entries into an uncompressed SWB1 binary payload.
 * Uncompressed SWB1 avoids double-decompression CPU (for Zstd KTX2 / PNG / GLB) and halves peak iOS RAM.
 */
export function buildUncompressedSwb1Pack(entries) {
  const index = [];
  let offset = 0;
  for (const entry of entries) {
    index.push([entry.key, offset, entry.buf.length]);
    offset += entry.buf.length;
  }
  const headerBytes = Buffer.from(JSON.stringify(index), "utf8");
  const prefix = Buffer.alloc(8);
  prefix.write("SWB1", 0, 4, "ascii");
  prefix.writeUInt32LE(headerBytes.length, 4);
  return Buffer.concat([prefix, headerBytes, ...entries.map((entry) => entry.buf)]);
}

/**
 * Packs `{ key, buf }` entries into a gzip-compressed SWB1 payload (ideal for large JSON manifests/tree structures,
 * decoding transparently via `parseSeedWorldCommonBinaryBundle`).
 */
export function buildGzippedSwb1Pack(entries) {
  const rawPack = buildUncompressedSwb1Pack(entries);
  const gzPack = zlib.gzipSync(rawPack, { level: 9 });
  // Normalize RFC 1952 OS byte (offset 9) to 0xff (unknown) for cross-platform bit-identical builds.
  if (gzPack.length >= 10) gzPack[9] = 0xff;
  return gzPack;
}

function estimateSwb1PackBytes(entries) {
  let payloadBytes = 0;
  let indexJsonBytes = 2; // "[]"
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const rowBytes = JSON.stringify([entry.key, payloadBytes, entry.buf.length]).length + (i > 0 ? 1 : 0);
    indexJsonBytes += rowBytes;
    payloadBytes += entry.buf.length;
  }
  return 8 + indexJsonBytes + payloadBytes;
}

/**
 * Deterministically partitions `{ key, buf }` entries into balanced shards, each strictly `<= maxShardBytes`
 * (including SWB1 prefix + JSON index header), unless a single entry itself exceeds `maxShardBytes`.
 */
export function shardTemplateBundleEntries(entries, maxShardBytes = TEMPLATE_MEDIA_MAX_SHARD_BYTES) {
  if (!entries || entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => {
    if (b.buf.length !== a.buf.length) return b.buf.length - a.buf.length;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const totalEstimate = estimateSwb1PackBytes(sorted);
  const minShards = Math.max(1, Math.ceil(totalEstimate / maxShardBytes));

  // Balance shard sizes across `shardCount` bins using Longest-Processing-Time-first (LPT),
  // incrementing `shardCount` only if an entry cannot fit within `maxShardBytes`.
  for (let shardCount = minShards; shardCount <= sorted.length; shardCount++) {
    const shards = Array.from({ length: shardCount }, () => []);
    const shardBytes = new Array(shardCount).fill(10); // 8-byte SWB1 prefix + "[]"
    let fits = true;

    for (const entry of sorted) {
      // Pick the lightest shard that can still stay <= maxShardBytes after adding `entry`.
      let bestIdx = -1;
      let bestSize = Infinity;
      for (let i = 0; i < shardCount; i++) {
        const candidateSize = estimateSwb1PackBytes([...shards[i], entry]);
        const canPlace = candidateSize <= maxShardBytes || shards[i].length === 0;
        if (canPlace && shardBytes[i] < bestSize) {
          bestSize = shardBytes[i];
          bestIdx = i;
        }
      }
      if (bestIdx === -1) {
        fits = false;
        break;
      }
      shards[bestIdx].push(entry);
      shardBytes[bestIdx] = estimateSwb1PackBytes(shards[bestIdx]);
    }

    if (fits) {
      return shards
        .filter((shard) => shard.length > 0)
        .map((shard) => shard.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)));
    }
  }

  return sorted.map((entry) => [entry]);
}
