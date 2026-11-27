import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { workspaceEngine } from "../packages/project/build/vite.mjs";
import { PUGC_UNSUPPORTED_ASSET_EXTENSIONS, projectAssets } from "./scripts/project-assets.mjs";
import { createMobileDiagMiddleware } from "./scripts/mobile-diag-middleware.mjs";
import { meshBrotliPlugin } from "./scripts/mesh-brotli.mjs";
import { seedWorldPlantTextureDownloads } from "./scripts/seed-world-plant-texture-downloads.mjs";
import {
  SEED_WORLD_TEMPLATE_IDS,
  buildGzippedSwb1Pack,
  buildUncompressedSwb1Pack,
  isSeedWorldBuildingTextureAsset,
  isSeedWorldCommonRockLodAsset,
  isSeedWorldExcludedCommonBinShader,
  previewCacheControlForPath,
  shardTemplateBundleEntries,
  templatesForSeedWorldJsonAsset,
  templatesForSeedWorldMediaAsset
} from "./scripts/seed-world-template-bundles.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const plantBuild = require("../packages/farming/src/farming/tools/plant-shader-precompile.cjs");
const treeBuild = require("../packages/vegetation/src/asset-assembly/offline/tree-reconstruction-service.cjs");
const waterBuild = require("../packages/water/src/water/build/WaterShaderProductionAssetPlugin.cjs");

const world = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(world);
function shaderLibrary(directory, prefix = "ShaderLibrary") {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name),
      name = `${prefix}/${entry.name}`;
    return entry.isDirectory()
      ? shaderLibrary(file, name)
      : entry.name.endsWith(".glsl")
        ? [{ path: name, source: fs.readFileSync(file, "utf8") }]
        : [];
  });
}
const flashApp = process.env.WORLD_FLASH_APP === "1";
const demo = flashApp ? "seed-world" : process.env.WORLD_DEMO || "seed-world";
if (!/^[a-z0-9/-]+$/.test(demo) || demo.includes("..")) throw new Error("Invalid WORLD_DEMO path");
const entry = path.join(world, "demos", demo, "index.html");
if (demo !== "all" && !fs.existsSync(entry)) throw new Error(`Unknown World demo: ${demo}`);
const entries =
  demo === "all"
    ? JSON.parse(fs.readFileSync(path.join(world, "demos.json"), "utf8"))
        .filter((item) => item.mode === "static")
        .map((item) => path.join(world, item.entry))
    : !flashApp && demo === "seed-world"
      ? SEED_WORLD_TEMPLATE_IDS.map((id) =>
          path.join(world, "demos/seed-world", id === "original" ? "index.html" : `${id}.html`)
        )
      : [entry];
const outDir = process.env.WORLD_OUT_DIR
  ? path.resolve(process.env.WORLD_OUT_DIR)
  : path.join(world, "dist", flashApp ? "seed-world-flash-app" : demo);

function flashAppAssetFileName(assetInfo) {
  const extension = path.extname(assetInfo.name || "").toLowerCase();
  const suffix = PUGC_UNSUPPORTED_ASSET_EXTENSIONS.has(extension) ? "[extname].wasm" : "[extname]";
  return `assets/[name]-[hash]${suffix}`;
}

const VITE_MODULE_WORKER_PATTERN =
  /new Worker\(\s*new URL\(\s*""\s*\+\s*new URL\(\s*(["'])([^"']+)\1\s*,\s*import\.meta\.url\s*\)\.href\s*,\s*self\.location\s*\)\s*,\s*\{\s*type:\s*["']module["']\s*\}\s*\)/gu;
const FLASH_APP_CLASSIC_WORKER_HELPER =
  'function __flashAppCreateClassicWorker(u){var t=typeof window!=="undefined"&&window.__seedWorldBootTrace;if(t)t.event("info","worker","spawn",u);var w=new Worker(URL.createObjectURL(new Blob(["self.__FLASH_APP_WORKER_BASE_URL__="+JSON.stringify(u)+";try{importScripts("+JSON.stringify(u)+");}catch(e){setTimeout(function(){throw e;},0);}"],{type:"text/javascript"})));w.addEventListener("error",function(e){var tr=typeof window!=="undefined"&&window.__seedWorldBootTrace;if(tr)tr.event("error","worker","load/runtime error: "+(e.message||"unknown"),u);});return w;}\n';

/**
 * Flash App production runs inside an `about:srcdoc` iframe with static assets potentially on a
 * separate CDN origin, and mobile WebViews such as DingTalk UWS do not support `{ type: "module" }`
 * Workers. Since `worker.format` is already classic IIFE, boot emitted Worker files through a
 * same-origin classic Blob `importScripts(...)` shim and pass the real CDN base URL for relative
 * `new URL(..., self.location.href)` lookups inside those Workers.
 */
function flashAppClassicWorkers() {
  return {
    name: "flash-app-classic-workers",
    generateBundle(_options, bundle) {
      const workerFiles = new Set();
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue;
        let replaced = false;
        const nextCode = item.code.replace(VITE_MODULE_WORKER_PATTERN, (_match, quote, fileName) => {
          replaced = true;
          workerFiles.add(fileName);
          return `__flashAppCreateClassicWorker(new URL(${quote}${fileName}${quote},import.meta.url).href)`;
        });
        if (replaced) {
          item.code = FLASH_APP_CLASSIC_WORKER_HELPER + nextCode;
        }
      }
      for (const fileName of workerFiles) {
        const assetKey = `assets/${fileName}`;
        const asset = bundle[assetKey];
        if (!asset || asset.type !== "asset") continue;
        const source = typeof asset.source === "string" ? asset.source : Buffer.from(asset.source).toString("utf8");
        asset.source = source.replace(
          /,\s*self\.location\.href\s*\)/gu,
          ",(self.__FLASH_APP_WORKER_BASE_URL__||self.location.href))"
        );
      }
    }
  };
}

const FLASH_APP_CDN_MANIFEST_PATH = path.join(world, "demos/seed-world/flash-app-cdn-manifest.json");
const FLASH_APP_CDN_LEAF_EXTENSIONS = new Set([
  ".ktx2",
  ".tex",
  ".mesh",
  ".glb",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".wav",
  ".mp3",
  ".ogg",
  ".shaderc",
  ".shader",
  ".animctrl",
  ".wasm",
  ".bin",
  ".r8",
  ".r16",
  ".rgb8",
  ".f32le",
  ".treewind",
  ".asset",
  ".br"
]);
const FLASH_APP_TEXT_BUNDLE_EXTENSIONS = new Set([".prefab", ".mat", ".scene", ".json"]);
const FLASH_APP_COMMON_BIN_BUNDLE_EXTENSIONS = new Set([".mesh", ".shaderc", ".tex", ".shader"]);
const FLASH_APP_CDN_JSON_URL_KEYS = new Set(["path", "url"]);
const FLASH_APP_TEXT_BUNDLE_MAX_BYTES = 128 * 1024;
const FLASH_APP_CDN_LARGE_JSON_EXCLUDED_BASENAMES = new Set([
  "project.json",
  "production-catalog.json",
  "plant-project-production-catalog.json",
  "plant-species.json"
]);
const UNUSED_FLASH_APP_PLANT_SPECIES =
  "packages/vegetation/src/asset-assembly/generated/procedural-trees/plant-species.json";
const PROJECT_PLANT_SPECIES =
  "packages/vegetation/src/asset-assembly/generated/procedural-trees/plant-project-plant-species.json";

function isFlashAppCdnLargeJson(fileName, size) {
  return (
    fileName.startsWith("packages/") &&
    path.extname(fileName).toLowerCase() === ".json" &&
    size > FLASH_APP_TEXT_BUNDLE_MAX_BYTES &&
    !FLASH_APP_CDN_LARGE_JSON_EXCLUDED_BASENAMES.has(path.posix.basename(fileName))
  );
}

function loadFlashAppCdnManifest() {
  if (!fs.existsSync(FLASH_APP_CDN_MANIFEST_PATH)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(FLASH_APP_CDN_MANIFEST_PATH, "utf8"));
    return parsed && typeof parsed.bySha256 === "object" && parsed.bySha256 ? parsed.bySha256 : {};
  } catch {
    return {};
  }
}

function sha256Buffer(source) {
  const buf = typeof source === "string" ? Buffer.from(source, "utf8") : Buffer.from(source);
  return { sha256: crypto.createHash("sha256").update(buf).digest("hex"), size: buf.length };
}

/**
 * Emits consolidated startup bundles for `seed-world` production builds (both normal preview and
 * WORLD_FLASH_APP=1):
 * 1. (Flash App only) Rewrites references to content-hash-matched binary/leaf assets in
 *    flash-app-cdn-manifest.json to their immutable mdn.alipayobjects.com URLs and omits duplicate copies.
 * 2. Emits split gzipped SWB1 binary bundles (.mesh/.shaderc/.tex/.shader):
 *    - `seed-world-common-bin-bundle`: shared core binaries (non-building) loaded by all templates.
 *    - `seed-world-building-bin-bundle`: `packages/building/` binaries loaded only when a template uses buildings.
 * 3. Consolidates small project text files (.prefab/.mat/.scene/.json <= 128 KiB)
 *    into a single gzip-friendly JSON bundle fetched once at startup.
 */
function seedWorldAssetBundles({ offloadCdn = false } = {}) {
  return {
    name: "seed-world-asset-bundles",
    generateBundle(_options, bundle) {
      const cdnBySha256 = offloadCdn ? loadFlashAppCdnManifest() : {};
      const cdnUrlByFileName = new Map();

      if (offloadCdn) {
        // 1. Identify emitted leaf binary assets and large (> 128 KiB) leaf package JSONs
        // whose exact sha256 + size exist on mdn.alipayobjects.com.
        for (const [fileName, item] of Object.entries(bundle)) {
          if (item.type !== "asset") continue;
          const ext = path.extname(fileName).toLowerCase();
          // Skip physx JS/WASM sidecars resolved via Emscripten locateFile relative to physx.release*.js.
          if (/(?:^|\/)physx\.release(?:\.simd)?(?:\.[a-f0-9]+)?\.wasm$/i.test(fileName)) continue;
          const isLeafBinary = FLASH_APP_CDN_LEAF_EXTENSIONS.has(ext);
          if (!isLeafBinary && !(fileName.startsWith("packages/") && ext === ".json")) continue;
          const { sha256, size } = sha256Buffer(item.source);
          if (!isLeafBinary && !isFlashAppCdnLargeJson(fileName, size)) continue;
          const entry = cdnBySha256[sha256];
          if (entry && typeof entry.url === "string" && entry.url.startsWith("https://") && entry.size === size) {
            cdnUrlByFileName.set(fileName, entry.url);
          }
        }
        // In Flash App builds, Seed World always loads `plant-project-plant-species.json` via the runtime project
        // (`useProjectPlantResources`), so the 497 KiB standalone gallery `plant-species.json` is never fetched.
        // Alias its dead JS `new URL(...)` reference to the CDN-hosted project species JSON and drop the local copy.
        const projectPlantSpeciesCdnUrl = cdnUrlByFileName.get(PROJECT_PLANT_SPECIES);
        if (projectPlantSpeciesCdnUrl && bundle[UNUSED_FLASH_APP_PLANT_SPECIES]) {
          cdnUrlByFileName.set(UNUSED_FLASH_APP_PLANT_SPECIES, projectPlantSpeciesCdnUrl);
        }

        // 2. Rewrite references inside emitted JSON/material/prefab/scene manifests to CDN URLs.
        if (cdnUrlByFileName.size > 0) {
          const rewriteJsonObject = (value, baseDir, key) => {
            if (typeof value === "string" && value.length < 1024 && !/^(?:[a-z]+:|\/|#)/i.test(value)) {
              if (!FLASH_APP_CDN_JSON_URL_KEYS.has(key)) return value;
              const [rawPath, suffix = ""] = value.split(/(?=[?#])/);
              const normalized = path.posix.normalize(path.posix.join(baseDir, rawPath));
              const cdnUrl = cdnUrlByFileName.get(normalized);
              if (cdnUrl) return `${cdnUrl}${suffix}`;
              return value;
            }
            if (Array.isArray(value)) {
              for (let i = 0; i < value.length; i++) {
                const next = rewriteJsonObject(value[i], baseDir, key);
                if (next !== value[i]) value[i] = next;
              }
              return value;
            }
            if (value && typeof value === "object") {
              for (const [k, v] of Object.entries(value)) {
                const next = rewriteJsonObject(v, baseDir, k);
                if (next !== v) value[k] = next;
              }
            }
            return value;
          };

          for (const [fileName, item] of Object.entries(bundle)) {
            if (item.type !== "asset") continue;
            const ext = path.extname(fileName).toLowerCase();
            if (!FLASH_APP_TEXT_BUNDLE_EXTENSIONS.has(ext)) continue;
            const text = typeof item.source === "string" ? item.source : Buffer.from(item.source).toString("utf8");
            let parsed;
            try {
              parsed = JSON.parse(text);
            } catch {
              continue;
            }
            if (!parsed || typeof parsed !== "object") continue;
            const baseDir = path.posix.dirname(fileName);
            const before = JSON.stringify(parsed);
            rewriteJsonObject(parsed, baseDir, "");
            const after = JSON.stringify(parsed);
            if (after !== before) {
              item.source = after;
            }
          }

          // Rewrite `new URL("<rel>", import.meta.url)`, bare worker `new URL("<rel>", self.location.href)`,
          // and classic-worker `new URL("<rel>", (self.__FLASH_APP_WORKER_BASE_URL__||self.location.href))`
          // inside JS chunks & classic worker scripts so CDN URL rewriting is order-independent.
          const rewriteJsUrls = (code, baseDir) =>
            code.replace(
              /new URL\(\s*(["'])([^"']+)\1\s*,\s*(import\.meta\.url|self\.location\.href|\(self\.__FLASH_APP_WORKER_BASE_URL__\|\|self\.location\.href\))\s*\)/gu,
              (match, quote, rel, baseExpr) => {
                if (/^(?:[a-z]+:|\/|#)/i.test(rel)) return match;
                const [rawPath, suffix = ""] = rel.split(/(?=[?#])/);
                const normalized = path.posix.normalize(path.posix.join(baseDir, rawPath));
                const cdnUrl = cdnUrlByFileName.get(normalized);
                if (!cdnUrl) return match;
                return `new URL(${JSON.stringify(`${cdnUrl}${suffix}`)},${baseExpr})`;
              }
            );

          for (const [fileName, item] of Object.entries(bundle)) {
            const baseDir = path.posix.dirname(fileName);
            if (item.type === "chunk" && fileName.endsWith(".js")) {
              item.code = rewriteJsUrls(item.code, baseDir);
            } else if (item.type === "asset" && fileName.endsWith(".js")) {
              const source = typeof item.source === "string" ? item.source : Buffer.from(item.source).toString("utf8");
              item.source = rewriteJsUrls(source, baseDir);
            }
          }
        }
      }

      // 2.5 Emit split SWB1 binary bundles BEFORE deleting CDN-offloaded files from dist, keyed by each entry's final
      // runtime URL (CDN URL when offloaded, else dist-relative path):
      // - `seed-world-common-bin-bundle` (gzipped): shared core `.mesh/.shaderc/.tex/.shader` + shared rock LOD1/2 `.glb`
      //   (excluding unused raw editor water `.shader` text files).
      // - `seed-world-building-bin-bundle` (gzipped): `packages/building/` `.mesh/.shaderc/.tex/.shader`.
      // - `seed-world-building-tex-bundle` (uncompressed): deduplicated `packages/building/` KTX2 textures (5.61 MiB),
      //   loaded in parallel with `building-bin-bundle` only on building-bearing templates instead of duplicated in 4
      //   template shards.
      const commonBinEntries = [];
      const buildingBinEntries = [];
      const buildingTexEntries = [];
      const seenCommonBinKeys = new Set();
      const seenBuildingBinKeys = new Set();
      const seenBuildingTexKeys = new Set();
      for (const fileName of Object.keys(bundle).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
        const item = bundle[fileName];
        if (!item || item.type !== "asset") continue;
        const ext = path.extname(fileName).toLowerCase();
        const isBuildingTex = isSeedWorldBuildingTextureAsset(fileName);
        if (isBuildingTex) {
          const buf = typeof item.source === "string" ? Buffer.from(item.source, "utf8") : Buffer.from(item.source);
          if (buf.length > 0) {
            const key = cdnUrlByFileName.get(fileName) ?? fileName;
            if (!seenBuildingTexKeys.has(key)) {
              seenBuildingTexKeys.add(key);
              buildingTexEntries.push({ key, buf });
            }
          }
          continue;
        }
        const isCommonRockLod = isSeedWorldCommonRockLodAsset(fileName);
        if (!FLASH_APP_COMMON_BIN_BUNDLE_EXTENSIONS.has(ext) && !isCommonRockLod) continue;
        if (!isCommonRockLod && isSeedWorldExcludedCommonBinShader(fileName)) continue;
        const buf = typeof item.source === "string" ? Buffer.from(item.source, "utf8") : Buffer.from(item.source);
        if (buf.length === 0) continue;
        const key = cdnUrlByFileName.get(fileName) ?? fileName;
        const isBuildingAsset = !isCommonRockLod && fileName.startsWith("packages/building/");
        const seen = isBuildingAsset ? seenBuildingBinKeys : seenCommonBinKeys;
        const targetList = isBuildingAsset ? buildingBinEntries : commonBinEntries;
        if (seen.has(key)) continue;
        seen.add(key);
        targetList.push({ key, buf });
      }
      const emitSwb1Bundle = (entries, namePrefix, placeholder, { compress = true } = {}) => {
        if (entries.length === 0) return;
        const payload = compress ? buildGzippedSwb1Pack(entries) : buildUncompressedSwb1Pack(entries);
        const { sha256, size } = sha256Buffer(payload);
        const bundleFileName = `assets/${namePrefix}-${sha256.slice(0, 8)}.bin`;
        const cdnEntry = cdnBySha256[sha256];
        const runtimeUrl =
          cdnEntry && typeof cdnEntry.url === "string" && cdnEntry.url.startsWith("https://") && cdnEntry.size === size
            ? cdnEntry.url
            : `./${namePrefix}-${sha256.slice(0, 8)}.bin`;
        if (runtimeUrl.startsWith("./")) {
          this.emitFile({ type: "asset", fileName: bundleFileName, source: payload });
        }
        for (const item of Object.values(bundle)) {
          if (item.type === "chunk" && item.code.includes(placeholder)) {
            item.code = item.code.replaceAll(placeholder, runtimeUrl);
          }
        }
      };
      emitSwb1Bundle(commonBinEntries, "seed-world-common-bin-bundle", "__SEED_WORLD_COMMON_BIN_BUNDLE_URL__");
      emitSwb1Bundle(buildingBinEntries, "seed-world-building-bin-bundle", "__SEED_WORLD_BUILDING_BIN_BUNDLE_URL__");
      emitSwb1Bundle(
        buildingTexEntries,
        "seed-world-building-tex-bundle",
        "__SEED_WORLD_BUILDING_TEX_BUNDLE_URL__",
        { compress: false }
      );

      // 2.6 Emit per-template SWB1 bundles BEFORE deleting CDN-offloaded leaf copies:
      // - Gzipped per-template JSON SWB1 shard (`seed-world-tpl-<id>-json-bundle-<hash>.bin`) for >128 KiB
      //   procedural tree `*-structure.json`, `plant-project-plant-species.json`, and water `conversion.json`
      //   (compresses ~5 MB raw JSON -> ~0.7 MB).
      // - Uncompressed per-template media SWB1 shards (`seed-world-tpl-<id>-s<N>-bundle-<hash>.bin`, <= 10 MiB/shard)
      //   for already-compressed `.ktx2/.glb/.png/.treewind/.asset/.r8/.rgb8` (avoids double-decompression & 2x iOS RAM).
      const templateEntriesById = new Map(SEED_WORLD_TEMPLATE_IDS.map((id) => [id, []]));
      const seenKeysByTemplate = new Map(SEED_WORLD_TEMPLATE_IDS.map((id) => [id, new Set()]));
      const templateJsonEntriesById = new Map(SEED_WORLD_TEMPLATE_IDS.map((id) => [id, []]));
      const seenJsonKeysByTemplate = new Map(SEED_WORLD_TEMPLATE_IDS.map((id) => [id, new Set()]));
      for (const fileName of Object.keys(bundle).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
        const item = bundle[fileName];
        if (!item || item.type !== "asset") continue;
        const matchedJsonTemplates = templatesForSeedWorldJsonAsset(fileName);
        if (matchedJsonTemplates.length > 0) {
          const buf = typeof item.source === "string" ? Buffer.from(item.source, "utf8") : Buffer.from(item.source);
          if (buf.length > 0) {
            const key = cdnUrlByFileName.get(fileName) ?? fileName;
            for (const templateId of matchedJsonTemplates) {
              const seen = seenJsonKeysByTemplate.get(templateId);
              if (seen.has(key)) continue;
              seen.add(key);
              templateJsonEntriesById.get(templateId).push({ key, buf });
            }
          }
        }
        const matchedTemplates = templatesForSeedWorldMediaAsset(fileName);
        if (matchedTemplates.length === 0) continue;
        const buf = typeof item.source === "string" ? Buffer.from(item.source, "utf8") : Buffer.from(item.source);
        if (buf.length === 0) continue;
        const key = cdnUrlByFileName.get(fileName) ?? fileName;
        for (const templateId of matchedTemplates) {
          const seen = seenKeysByTemplate.get(templateId);
          if (seen.has(key)) continue;
          seen.add(key);
          templateEntriesById.get(templateId).push({ key, buf });
        }
      }
      const templateBundleManifest = {};
      for (const templateId of SEED_WORLD_TEMPLATE_IDS) {
        const urls = [];
        const jsonEntries = templateJsonEntriesById.get(templateId);
        if (jsonEntries.length > 0) {
          jsonEntries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
          const gzJsonPack = buildGzippedSwb1Pack(jsonEntries);
          const { sha256, size } = sha256Buffer(gzJsonPack);
          const namePrefix = `seed-world-tpl-${templateId}-json-bundle`;
          const bundleFileName = `assets/${namePrefix}-${sha256.slice(0, 8)}.bin`;
          const cdnEntry = cdnBySha256[sha256];
          const runtimeUrl =
            cdnEntry && typeof cdnEntry.url === "string" && cdnEntry.url.startsWith("https://") && cdnEntry.size === size
              ? cdnEntry.url
              : `./${namePrefix}-${sha256.slice(0, 8)}.bin`;
          if (runtimeUrl.startsWith("./")) {
            this.emitFile({ type: "asset", fileName: bundleFileName, source: gzJsonPack });
          }
          urls.push(runtimeUrl);
        }
        const entries = templateEntriesById.get(templateId);
        const shards = shardTemplateBundleEntries(entries);
        for (let shardIndex = 0; shardIndex < shards.length; shardIndex++) {
          const rawPack = buildUncompressedSwb1Pack(shards[shardIndex]);
          const { sha256, size } = sha256Buffer(rawPack);
          const namePrefix = `seed-world-tpl-${templateId}-s${shardIndex}-bundle`;
          const bundleFileName = `assets/${namePrefix}-${sha256.slice(0, 8)}.bin`;
          const cdnEntry = cdnBySha256[sha256];
          const runtimeUrl =
            cdnEntry && typeof cdnEntry.url === "string" && cdnEntry.url.startsWith("https://") && cdnEntry.size === size
              ? cdnEntry.url
              : `./${namePrefix}-${sha256.slice(0, 8)}.bin`;
          if (runtimeUrl.startsWith("./")) {
            this.emitFile({ type: "asset", fileName: bundleFileName, source: rawPack });
          }
          urls.push(runtimeUrl);
        }
        if (urls.length > 0) {
          templateBundleManifest[templateId] = urls;
        }
      }
      const templateManifestLiteral = JSON.stringify(JSON.stringify(templateBundleManifest));
      for (const item of Object.values(bundle)) {
        if (item.type === "chunk" && item.code.includes("__SEED_WORLD_TEMPLATE_BIN_BUNDLES_JSON__")) {
          item.code = item.code.replace(/["']__SEED_WORLD_TEMPLATE_BIN_BUNDLES_JSON__["']/gu, templateManifestLiteral);
        }
      }

      // Remove redundant local copies of CDN-hosted binaries from dist (Flash App only).
      if (offloadCdn) {
        for (const fileName of cdnUrlByFileName.keys()) {
          delete bundle[fileName];
        }
      }

      // 3. Emit single consolidated project text bundle for small project manifests/prefabs/materials/scenes.
      const textBundleEntries = {};
      let bundledCount = 0;
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== "asset") continue;
        const ext = path.extname(fileName).toLowerCase();
        if (!FLASH_APP_TEXT_BUNDLE_EXTENSIONS.has(ext)) continue;
        const inPackages = fileName.startsWith("packages/");
        const inAssetsText = fileName.startsWith("assets/") && ext !== ".json";
        if (!inPackages && !inAssetsText) continue;
        const buf = typeof item.source === "string" ? Buffer.from(item.source, "utf8") : Buffer.from(item.source);
        if (buf.length === 0 || buf.length > FLASH_APP_TEXT_BUNDLE_MAX_BYTES) continue;
        textBundleEntries[fileName] = buf.toString("utf8");
        bundledCount++;
      }
      if (bundledCount > 0) {
        const sortedBundle = Object.fromEntries(
          Object.entries(textBundleEntries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        );
        const payload = JSON.stringify(sortedBundle);
        const { sha256, size } = sha256Buffer(payload);
        const bundleFileName = `assets/seed-world-project-text-bundle-${sha256.slice(0, 8)}.json`;
        const cdnEntry = cdnBySha256[sha256];
        const runtimeUrl =
          cdnEntry && typeof cdnEntry.url === "string" && cdnEntry.url.startsWith("https://") && cdnEntry.size === size
            ? cdnEntry.url
            : `./seed-world-project-text-bundle-${sha256.slice(0, 8)}.json`;
        if (runtimeUrl.startsWith("./")) {
          this.emitFile({ type: "asset", fileName: bundleFileName, source: payload });
        }
        for (const item of Object.values(bundle)) {
          if (item.type === "chunk" && item.code.includes("__SEED_WORLD_PROJECT_TEXT_BUNDLE_URL__")) {
            item.code = item.code.replaceAll("__SEED_WORLD_PROJECT_TEXT_BUNDLE_URL__", runtimeUrl);
          }
        }
        if (offloadCdn) {
          // Classic Workers run in an isolated global scope without the main-thread fetch() interceptor.
          // Preserve any text-bundle file directly referenced via `new URL(<rel>, ...)` inside an emitted Worker asset
          // (e.g., `IntegratedWorldLightingProfile.json` and `SeedWorldLightingProfile.json` in `WorldPlanning.worker`).
          const workerReferencedFiles = new Set();
          for (const [assetName, item] of Object.entries(bundle)) {
            if (item.type !== "asset" || !assetName.endsWith(".js")) continue;
            const source = typeof item.source === "string" ? item.source : Buffer.from(item.source).toString("utf8");
            const baseDir = path.posix.dirname(assetName);
            for (const match of source.matchAll(
              /new URL\(\s*(["'])([^"']+)\1\s*,\s*(?:import\.meta\.url|self\.location\.href|\(self\.__FLASH_APP_WORKER_BASE_URL__\|\|self\.location\.href\))\s*\)/gu
            )) {
              const rel = match[2];
              if (/^(?:[a-z]+:|\/|#)/i.test(rel)) continue;
              const [rawPath] = rel.split(/[?#]/);
              if (!rawPath || rawPath === "." || rawPath === ".." || rawPath.endsWith("/")) continue;
              workerReferencedFiles.add(path.posix.normalize(path.posix.join(baseDir, rawPath)));
            }
          }
          const prunedFiles = Object.keys(sortedBundle).filter((fileName) => !workerReferencedFiles.has(fileName));
          const manifestPath = process.env.WORLD_FLASH_APP_TEXT_BUNDLE_MANIFEST;
          if (manifestPath) {
            fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
            fs.writeFileSync(
              manifestPath,
              JSON.stringify({
                textBundleUrl: runtimeUrl,
                prunedFiles,
                projectJson: sortedBundle["packages/terrain/src/data/seed-world/project.json"],
                productionCatalogJson: sortedBundle["packages/terrain/src/data/seed-world/public/production-catalog.json"]
              }),
              "utf8"
            );
          }
          // Every non-worker text entry is served from `seed-world-project-text-bundle-*.json` via both
          // `ResourceManager.setPrefetchedTextAssets` and the persistent main-thread `fetch()` interceptor,
          // so omit the redundant ~296 loose text files from Flash App dist.
          for (const fileName of prunedFiles) {
            delete bundle[fileName];
          }
        }
      }
    }
  };
}

const PREVIEW_GZIP_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".svg",
  ".wasm",
  ".shader",
  ".shaderc",
  ".prefab",
  ".mat",
  ".scene",
  ".animctrl",
  ".asset",
  ".txt",
  ".xml"
]);

const PREVIEW_MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".cjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".shader": "text/plain; charset=utf-8",
  ".shaderc": "application/json; charset=utf-8",
  ".prefab": "application/json; charset=utf-8",
  ".mat": "application/json; charset=utf-8",
  ".scene": "application/json; charset=utf-8",
  ".animctrl": "application/json; charset=utf-8",
  ".asset": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

function previewGzipPlugin() {
  const gzipCache = new Map();
  return {
    name: "world-preview-gzip",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.method !== "GET" && req.method !== "HEAD") || !req.url) return next();
        let pathname;
        try {
          pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        } catch {
          return next();
        }
        const ext = path.extname(pathname).toLowerCase();
        if (!PREVIEW_GZIP_EXTENSIONS.has(ext)) {
          if (pathname.startsWith("/assets/") || pathname.startsWith("/packages/")) {
            res.setHeader("Cache-Control", previewCacheControlForPath(pathname));
          }
          return next();
        }
        const acceptEncoding = String(req.headers["accept-encoding"] || "");
        if (!/\bgzip\b/i.test(acceptEncoding)) return next();
        const resolved = path.resolve(outDir, "." + pathname);
        if (!resolved.startsWith(outDir + path.sep)) return next();
        let stat;
        try {
          stat = fs.statSync(resolved);
          if (!stat.isFile() || stat.size < 1024) return next();
        } catch {
          return next();
        }
        const cacheKey = `${resolved}:${stat.mtimeMs}:${stat.size}`;
        let compressed = gzipCache.get(cacheKey);
        if (!compressed) {
          compressed = zlib.gzipSync(fs.readFileSync(resolved), { level: 6 });
          gzipCache.set(cacheKey, compressed);
        }
        const etag = `W/"gz-${stat.size}-${Math.floor(stat.mtimeMs)}"`;
        res.setHeader("Vary", "Accept-Encoding");
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", previewCacheControlForPath(pathname));
        if (req.headers["if-none-match"] === etag) {
          res.statusCode = 304;
          res.end();
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", PREVIEW_MIME_TYPES[ext] || "application/octet-stream");
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Content-Length", compressed.byteLength);
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        res.end(compressed);
      });
    }
  };
}

/**
 * Local dev/preview receiver for Seed World's opt-in perf frame capture (?debug=1&panel=1).
 * Writes JSONL into the gitignored repo `tmp/` directory by default (overridable via `WORLD_PERF_DIAG_LOG`)
 * so any developer can capture mobile/desktop frame breakdowns out of the box without editing config.
 */
function mobileDiagPlugin() {
  const diagLog = process.env.WORLD_PERF_DIAG_LOG
    ? path.resolve(process.env.WORLD_PERF_DIAG_LOG)
    : path.join(root, "tmp/seed-world-perf-diag.jsonl");
  const handler = createMobileDiagMiddleware({ diagLog, root });
  const attach = (server) => {
    server.middlewares.use("/__mobile-diag", handler);
  };
  return {
    name: "mobile-diag-receiver",
    configureServer: attach,
    configurePreviewServer: attach
  };
}

export default {
  root: flashApp ? path.join(world, "demos", demo) : root,
  base: "./",
  plugins: [
    ...(!flashApp ? [mobileDiagPlugin(), previewGzipPlugin()] : []),
    workspaceEngine(),
    projectAssets(root, { pugcCompatible: flashApp }),
    treeBuild.createTreeReconstructionServer(),
    plantBuild.plantShaderPrecompile({
      shaderLibrary: shaderLibrary(path.join(root, "packages/shader/src/ShaderLibrary"))
    }),
    waterBuild.createWaterShaderProductionAssetPlugin(path.join(root, "packages/water/src/water/shaders")),
    ...(!flashApp && (demo === "seed-world" || demo === "all") ? [seedWorldPlantTextureDownloads()] : []),
    ...(flashApp ? [flashAppClassicWorkers()] : []),
    ...(demo === "seed-world" ? [seedWorldAssetBundles({ offloadCdn: flashApp })] : []),
    ...(!flashApp && (demo === "seed-world" || demo === "all") ? [meshBrotliPlugin()] : [])
  ],
  server: { host: "127.0.0.1", port: 5193, open: `/world/demos/${demo}/index.html`, fs: { allow: [root] } },
  resolve: {
    dedupe: ["@galacean/engine", "@galacean/engine-core"],
    // Vite's root is the repository, but these browser dependencies belong to World.
    alias: [
      { find: /^esbuild-wasm$/, replacement: path.dirname(require.resolve("esbuild-wasm/package.json")) },
      { find: /^re2js$/, replacement: path.dirname(path.dirname(require.resolve("re2js"))) }
    ]
  },
  esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } } },
  // Inline Workers must remain classic-script compatible, as in engine-next.
  worker: {
    format: "iife",
    plugins: [workspaceEngine(), projectAssets(root, { pugcCompatible: flashApp })],
    // WASM loaders may contain conditional imports; classic workers need one chunk.
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        ...(flashApp ? { assetFileNames: flashAppAssetFileName } : {})
      }
    }
  },
  optimizeDeps: { include: ["typescript", "esbuild-wasm", "re2js"] },
  build: {
    target: "esnext",
    outDir,
    emptyOutDir: true,
    ...(flashApp ? { assetsInlineLimit: 0 } : {}),
    ...(process.env.WORLD_MINIFY === "0" ? { minify: false } : {}),
    rollupOptions: {
      input: entries,
      ...(flashApp ? { output: { assetFileNames: flashAppAssetFileName } } : {})
    }
  }
};
