// Replaced at build time in seed-world production builds with the emitted single-request gzipped binary bundle URLs.
const COMMON_BIN_BUNDLE_URL: string | undefined = "__SEED_WORLD_COMMON_BIN_BUNDLE_URL__";
const BUILDING_BIN_BUNDLE_URL: string | undefined = "__SEED_WORLD_BUILDING_BIN_BUNDLE_URL__";

const BUNDLE_MAGIC = "SWB1";

let cachedCommonBundlePromise: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined;
let cachedBuildingBundlePromise: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined;

async function maybeGunzip(buffer: ArrayBuffer): Promise<Uint8Array | undefined> {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream !== "function") {
      console.warn("[SeedWorld] DecompressionStream unavailable; falling back to per-file common asset fetches");
      return undefined;
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const decompressed = await new Response(stream).arrayBuffer();
    return new Uint8Array(decompressed);
  }
  return bytes;
}

/**
 * Decodes a build-time SWB1 (optionally gzip-compressed) common binary bundle into a URL -> Uint8Array map.
 * Returns undefined on malformed or unsupported payloads so callers fall back transparently to per-file fetches.
 */
export async function parseSeedWorldCommonBinaryBundle(
  buffer: ArrayBuffer,
  distRootUrl: string
): Promise<ReadonlyMap<string, Uint8Array> | undefined> {
  try {
    const bytes = await maybeGunzip(buffer);
    if (!bytes || bytes.byteLength < 8) return undefined;
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== BUNDLE_MAGIC) return undefined;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLength = view.getUint32(4, true);
    const dataStart = 8 + headerLength;
    if (headerLength === 0 || dataStart > bytes.byteLength) return undefined;
    const headerText = new TextDecoder().decode(bytes.subarray(8, dataStart));
    const entries = JSON.parse(headerText) as unknown;
    if (!Array.isArray(entries)) return undefined;
    const map = new Map<string, Uint8Array>();
    for (const item of entries) {
      if (!Array.isArray(item) || item.length !== 3) continue;
      const [key, offset, length] = item;
      if (
        typeof key !== "string" ||
        typeof offset !== "number" ||
        typeof length !== "number" ||
        offset < 0 ||
        length < 0 ||
        dataStart + offset + length > bytes.byteLength
      ) {
        continue;
      }
      const resolvedUrl = /^https?:\/\//i.test(key) ? key : new URL(key, distRootUrl).href;
      map.set(resolvedUrl, bytes.subarray(dataStart + offset, dataStart + offset + length));
    }
    return map.size > 0 ? map : undefined;
  } catch (error) {
    console.warn("[SeedWorld] Common binary bundle decode failed, falling back to per-file fetches", error);
    return undefined;
  }
}

function fetchSwb1Bundle(
  bundleRelOrUrl: string | undefined,
  label: string,
  getCached: () => Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined,
  setCached: (next: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined) => void
): Promise<ReadonlyMap<string, Uint8Array> | undefined> {
  if (!bundleRelOrUrl || bundleRelOrUrl.startsWith("__SEED_WORLD_")) {
    return Promise.resolve(undefined);
  }
  const existing = getCached();
  if (existing) return existing;
  let promise: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined;
  const clearIfCurrent = () => {
    if (promise && getCached() === promise) setCached(undefined);
  };
  promise = (async () => {
    try {
      // Keep `import.meta.url` in a local binding so Vite's `vite:asset-import-meta-url` plugin
      // does not rewrite `new URL("../", import.meta.url)` to `new URL("../", self.location)`.
      const moduleBaseUrl = import.meta.url;
      const bundleUrl = new URL(bundleRelOrUrl, moduleBaseUrl).href;
      const distRootUrl = new URL("../", moduleBaseUrl).href;
      const response = await fetch(bundleUrl);
      if (!response.ok) {
        console.warn(`[SeedWorld] ${label} request failed (${response.status}): ${bundleUrl}`);
        clearIfCurrent();
        return undefined;
      }
      const buffer = await response.arrayBuffer();
      const parsed = await parseSeedWorldCommonBinaryBundle(buffer, distRootUrl);
      if (!parsed) clearIfCurrent();
      return parsed;
    } catch (error) {
      console.warn(`[SeedWorld] ${label} load failed, falling back to per-file fetches`, error);
      clearIfCurrent();
      return undefined;
    }
  })();
  setCached(promise);
  return promise;
}

/**
 * Loads the build-time consolidated gzipped core common binary bundle (non-building .mesh/.shaderc/.tex/.shader).
 * Returns undefined in dev builds or on fetch/decode miss so ResourceManager falls back transparently.
 */
export function loadSeedWorldCommonBinaryBundle(): Promise<ReadonlyMap<string, Uint8Array> | undefined> {
  return fetchSwb1Bundle(
    COMMON_BIN_BUNDLE_URL,
    "Common binary bundle",
    () => cachedCommonBundlePromise,
    (next) => {
      cachedCommonBundlePromise = next;
    }
  );
}

/**
 * Loads the build-time consolidated gzipped building-kit binary bundle (`packages/building/` .mesh/.shaderc/.tex/.shader).
 * Loaded only for templates/scenes that actually use authored buildings so non-building templates pay zero bytes.
 */
export function loadSeedWorldBuildingBinaryBundle(): Promise<ReadonlyMap<string, Uint8Array> | undefined> {
  return fetchSwb1Bundle(
    BUILDING_BIN_BUNDLE_URL,
    "Building binary bundle",
    () => cachedBuildingBundlePromise,
    (next) => {
      cachedBuildingBundlePromise = next;
    }
  );
}

/** Combines one or more prefetched binary bundle maps into a single lookup table for ResourceManager. */
export function mergeSeedWorldBinaryAssetMaps(
  ...maps: readonly (ReadonlyMap<string, Uint8Array> | undefined)[]
): ReadonlyMap<string, Uint8Array> | undefined {
  const nonEmpty = maps.filter((m): m is ReadonlyMap<string, Uint8Array> => Boolean(m && m.size > 0));
  if (nonEmpty.length === 0) return undefined;
  if (nonEmpty.length === 1) return nonEmpty[0];
  const merged = new Map<string, Uint8Array>();
  for (const map of nonEmpty) {
    for (const [key, value] of map) merged.set(key, value);
  }
  return merged;
}

/**
 * Releases module-level references to decompressed SWB1 binary bundles so their ArrayBuffers
 * can be garbage collected after startup loading completes or on dispose.
 */
export function releaseSeedWorldCommonBinaryBundle(): void {
  cachedCommonBundlePromise = undefined;
  cachedBuildingBundlePromise = undefined;
}
