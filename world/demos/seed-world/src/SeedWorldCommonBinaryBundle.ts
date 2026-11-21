// Replaced at build time in WORLD_FLASH_APP=1 builds with the emitted single-request gzipped binary bundle URL.
const FLASH_APP_COMMON_BIN_BUNDLE_URL: string | undefined = "__SEED_WORLD_COMMON_BIN_BUNDLE_URL__";

const BUNDLE_MAGIC = "SWB1";

let cachedBundlePromise: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined;

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

/**
 * Loads the build-time consolidated gzipped common binary bundle (.mesh/.shaderc/.tex/.shader)
 * when running in a Flash App production build. Returns undefined in dev/non-flash builds or on fetch/decode miss,
 * allowing ResourceManager to fall back transparently to per-file CDN fetches.
 */
export function loadSeedWorldCommonBinaryBundle(): Promise<ReadonlyMap<string, Uint8Array> | undefined> {
  if (!FLASH_APP_COMMON_BIN_BUNDLE_URL || FLASH_APP_COMMON_BIN_BUNDLE_URL.startsWith("__SEED_WORLD_")) {
    return Promise.resolve(undefined);
  }
  if (!cachedBundlePromise) {
    let promise: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined;
    const clearIfCurrent = () => {
      if (promise && cachedBundlePromise === promise) cachedBundlePromise = undefined;
    };
    promise = (async () => {
      try {
        // Keep `import.meta.url` in a local binding so Vite's `vite:asset-import-meta-url` plugin
        // does not rewrite `new URL("../", import.meta.url)` to `new URL("../", self.location)`.
        const moduleBaseUrl = import.meta.url;
        const bundleUrl = new URL(FLASH_APP_COMMON_BIN_BUNDLE_URL, moduleBaseUrl).href;
        const distRootUrl = new URL("../", moduleBaseUrl).href;
        const response = await fetch(bundleUrl);
        if (!response.ok) {
          console.warn(`[SeedWorld] Common binary bundle request failed (${response.status}): ${bundleUrl}`);
          clearIfCurrent();
          return undefined;
        }
        const buffer = await response.arrayBuffer();
        const parsed = await parseSeedWorldCommonBinaryBundle(buffer, distRootUrl);
        if (!parsed) clearIfCurrent();
        return parsed;
      } catch (error) {
        console.warn("[SeedWorld] Common binary bundle load failed, falling back to per-file fetches", error);
        clearIfCurrent();
        return undefined;
      }
    })();
    cachedBundlePromise = promise;
  }
  return cachedBundlePromise;
}

/**
 * Releases the module-level reference to the decompressed SWB1 binary bundle so the ~10.9 MiB
 * uncompressed ArrayBuffer can be garbage collected after startup loading completes or on dispose.
 */
export function releaseSeedWorldCommonBinaryBundle(): void {
  cachedBundlePromise = undefined;
}
