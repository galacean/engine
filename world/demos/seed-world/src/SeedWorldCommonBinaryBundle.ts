// Replaced at build time in seed-world production builds with the emitted binary bundle URLs.
const COMMON_BIN_BUNDLE_URL: string | undefined = "__SEED_WORLD_COMMON_BIN_BUNDLE_URL__";
const BUILDING_BIN_BUNDLE_URL: string | undefined = "__SEED_WORLD_BUILDING_BIN_BUNDLE_URL__";
const BUILDING_TEX_BUNDLE_URL: string | undefined = "__SEED_WORLD_BUILDING_TEX_BUNDLE_URL__";
// Replaced at build time with a JSON-encoded map of templateId -> uncompressed SWB1 shard URLs (<= 10 MiB/shard).
const TEMPLATE_BIN_BUNDLES_JSON: string = "__SEED_WORLD_TEMPLATE_BIN_BUNDLES_JSON__";

const BUNDLE_MAGIC = "SWB1";
const TEMPLATE_BUNDLE_TIMEOUT_MS = 45_000;

export interface SeedWorldTemplateBundleShardProgress {
  readonly shardIndex: number;
  readonly completedShards: number;
  readonly totalShards: number;
  readonly bundleUrl: string;
}

type TemplateShardListener = (
  assets: ReadonlyMap<string, Uint8Array>,
  progress: SeedWorldTemplateBundleShardProgress
) => void;

interface TemplateBundleState {
  readonly promise: Promise<ReadonlyMap<string, Uint8Array> | undefined>;
  readonly accumulated: Map<string, Uint8Array>;
  readonly listeners: Set<TemplateShardListener>;
  readonly controller: AbortController;
  completedShards: number;
  readonly totalShards: number;
  settled: boolean;
}

let cachedCommonBundlePromise: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined;
let cachedBuildingBundlePromise: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined;
let cachedBuildingTexBundlePromise: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined;
let cachedBuildingCombinedPromise: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined;
const cachedTemplateBundleStates = new Map<string, TemplateBundleState>();
let bundleReleaseEpoch = 0;

const prefetchedFetchAssets = new Map<string, Uint8Array>();
const prefetchedFetchTextAssets = new Map<string, string>();
let installedFetchWrapper: typeof globalThis.fetch | undefined;
let originalFetch: typeof globalThis.fetch | undefined;

function contentTypeForAssetUrl(url: string): string {
  const clean = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (
    clean.endsWith(".json") ||
    clean.endsWith(".prefab") ||
    clean.endsWith(".mat") ||
    clean.endsWith(".scene")
  ) {
    return "application/json; charset=utf-8";
  }
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".shader") || clean.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function resolveFetchRequestUrl(input: RequestInfo | URL): string | undefined {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!raw) return undefined;
  try {
    const base = typeof globalThis.location?.href === "string" ? globalThis.location.href : undefined;
    return base ? new URL(raw, base).href : raw;
  } catch {
    return raw;
  }
}

function maybeUninstallFetchWrapperIfEmpty(): void {
  if (prefetchedFetchAssets.size > 0 || prefetchedFetchTextAssets.size > 0) return;
  if (installedFetchWrapper && globalThis.fetch === installedFetchWrapper && originalFetch) {
    globalThis.fetch = originalFetch;
  }
  installedFetchWrapper = undefined;
  originalFetch = undefined;
}

function ensureFetchPrefetchInterceptorInstalled(): void {
  if (installedFetchWrapper || typeof globalThis.fetch !== "function") return;
  const baseFetch = globalThis.fetch;
  originalFetch = baseFetch;
  const wrappedFetch: typeof globalThis.fetch = (input, init) => {
    if (prefetchedFetchAssets.size > 0 || prefetchedFetchTextAssets.size > 0) {
      const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET"))
        .toUpperCase();
      if (method === "GET") {
        const resolvedUrl = resolveFetchRequestUrl(input);
        const bytes = resolvedUrl ? prefetchedFetchAssets.get(resolvedUrl) : undefined;
        const text = bytes === undefined && resolvedUrl ? prefetchedFetchTextAssets.get(resolvedUrl) : undefined;
        if (bytes !== undefined || text !== undefined) {
          const signal = init?.signal ?? (typeof input === "object" && "signal" in input ? input.signal : undefined);
          if (signal?.aborted) {
            const reason =
              signal.reason !== undefined
                ? signal.reason
                : new DOMException("The operation was aborted.", "AbortError");
            return Promise.reject(reason);
          }
          return Promise.resolve(
            new Response(bytes !== undefined ? bytes.slice() : text!, {
              status: 200,
              headers: { "Content-Type": contentTypeForAssetUrl(resolvedUrl!) }
            })
          );
        }
      }
    }
    return baseFetch.call(globalThis, input, init);
  };
  installedFetchWrapper = wrappedFetch;
  globalThis.fetch = wrappedFetch;
}

/**
 * Registers prefetched SWB1 byte slices for direct `fetch()` consumers (e.g., WaterBuiltinAssets KTX2/conversion.json,
 * grass `.r8`/`.rgb8`, cloud `.asset`) so assets already downloaded in SWB1 never trigger duplicate HTTP requests.
 */
export function registerSeedWorldPrefetchedFetchAssets(assets: ReadonlyMap<string, Uint8Array> | undefined): void {
  if (!assets || assets.size === 0) return;
  for (const [url, bytes] of assets) {
    prefetchedFetchAssets.set(url, bytes);
  }
  ensureFetchPrefetchInterceptorInstalled();
}

/**
 * Registers prefetched small project text assets (`.json`/`.mat`/`.prefab`/`.scene` from `seed-world-project-text-bundle`)
 * for direct `fetch()` consumers (e.g., `WaterBuiltinAssets` `conversion.json`, `PlanningLightingParameters`,
 * `PlanningWaterInitialization`) so pruned Flash App builds serve them from memory with zero HTTP requests even after
 * SWB1 binary buffers are released.
 */
export function registerSeedWorldPrefetchedFetchTextAssets(assets: ReadonlyMap<string, string> | undefined): void {
  if (!assets || assets.size === 0) return;
  for (const [url, text] of assets) {
    prefetchedFetchTextAssets.set(url, text);
  }
  ensureFetchPrefetchInterceptorInstalled();
}

/** Clears prefetched project text assets and restores `globalThis.fetch` if no binary prefetch entries remain. */
export function clearSeedWorldPrefetchedFetchTextAssets(): void {
  prefetchedFetchTextAssets.clear();
  maybeUninstallFetchWrapperIfEmpty();
}

/** Releases SWB1 binary byte-slice references and restores `globalThis.fetch` when no text-bundle entries remain. */
export function uninstallSeedWorldFetchPrefetchInterceptor(): void {
  prefetchedFetchAssets.clear();
  maybeUninstallFetchWrapperIfEmpty();
}

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

export interface LoadSeedWorldSingleBinaryBundleOptions {
  /** Override bundle URL (primarily for deterministic unit testing). */
  readonly url?: string;
  /** Override base URL used to resolve relative bundle paths. */
  readonly moduleBaseUrl?: string;
  /** Override dist root URL used to resolve relative SWB1 entry keys. */
  readonly distRootUrl?: string;
  /** Optional custom fetch implementation (primarily for deterministic unit testing). */
  readonly fetchImpl?: typeof fetch;
}

function fetchSwb1Bundle(
  bundleRelOrUrl: string | undefined,
  label: string,
  getCached: () => Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined,
  setCached: (next: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined) => void,
  options?: LoadSeedWorldSingleBinaryBundleOptions
): Promise<ReadonlyMap<string, Uint8Array> | undefined> {
  const effectiveUrl = options?.url ?? bundleRelOrUrl;
  if (!effectiveUrl || effectiveUrl.startsWith("__SEED_WORLD_")) {
    return Promise.resolve(undefined);
  }
  const existing = getCached();
  if (existing) return existing;
  const epoch = bundleReleaseEpoch;
  let promise: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined;
  const isStale = () => epoch !== bundleReleaseEpoch || (promise !== undefined && getCached() !== promise);
  const clearIfCurrent = () => {
    if (promise && getCached() === promise) setCached(undefined);
  };
  const fetchFn = options?.fetchImpl ?? fetch;
  promise = (async () => {
    try {
      // Keep `import.meta.url` in a local binding so Vite's `vite:asset-import-meta-url` plugin
      // does not rewrite `new URL("../", import.meta.url)` to `new URL("../", self.location)`.
      const moduleBaseUrl = options?.moduleBaseUrl ?? import.meta.url;
      const bundleUrl = new URL(effectiveUrl, moduleBaseUrl).href;
      const distRootUrl = options?.distRootUrl ?? new URL("../", moduleBaseUrl).href;
      const response = await fetchFn(bundleUrl);
      if (isStale()) return undefined;
      if (!response.ok) {
        console.warn(`[SeedWorld] ${label} request failed (${response.status}): ${bundleUrl}`);
        clearIfCurrent();
        return undefined;
      }
      const buffer = await response.arrayBuffer();
      if (isStale()) return undefined;
      const parsed = await parseSeedWorldCommonBinaryBundle(buffer, distRootUrl);
      if (isStale()) return undefined;
      if (parsed) registerSeedWorldPrefetchedFetchAssets(parsed);
      else clearIfCurrent();
      return parsed;
    } catch (error) {
      if (isStale()) return undefined;
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
export function loadSeedWorldCommonBinaryBundle(
  options?: LoadSeedWorldSingleBinaryBundleOptions
): Promise<ReadonlyMap<string, Uint8Array> | undefined> {
  return fetchSwb1Bundle(
    COMMON_BIN_BUNDLE_URL,
    "Common binary bundle",
    () => cachedCommonBundlePromise,
    (next) => {
      cachedCommonBundlePromise = next;
    },
    options
  );
}

export interface LoadSeedWorldBuildingBinaryBundleOptions extends LoadSeedWorldSingleBinaryBundleOptions {
  /** Override uncompressed building texture SWB1 bundle URL (primarily for deterministic unit testing). */
  readonly textureUrl?: string;
}

/**
 * Loads the build-time consolidated building-kit binary bundles in parallel:
 * - Gzipped `seed-world-building-bin-bundle` (`packages/building/` `.mesh/.shaderc/.tex/.shader`).
 * - Uncompressed `seed-world-building-tex-bundle` (`packages/building/` `.ktx2` textures, deduplicated across templates).
 * Loaded only for templates/scenes that actually use authored buildings so non-building templates pay zero bytes.
 */
export function loadSeedWorldBuildingBinaryBundle(
  options?: LoadSeedWorldBuildingBinaryBundleOptions
): Promise<ReadonlyMap<string, Uint8Array> | undefined> {
  if (options?.url !== undefined && options.textureUrl === undefined) {
    return fetchSwb1Bundle(
      BUILDING_BIN_BUNDLE_URL,
      "Building binary bundle",
      () => cachedBuildingBundlePromise,
      (next) => {
        cachedBuildingBundlePromise = next;
      },
      options
    );
  }
  if (cachedBuildingCombinedPromise) return cachedBuildingCombinedPromise;
  const epoch = bundleReleaseEpoch;
  let promise: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined;
  const clearIfCurrent = () => {
    if (promise && cachedBuildingCombinedPromise === promise) cachedBuildingCombinedPromise = undefined;
  };
  const binPromise = fetchSwb1Bundle(
    BUILDING_BIN_BUNDLE_URL,
    "Building binary bundle",
    () => cachedBuildingBundlePromise,
    (next) => {
      cachedBuildingBundlePromise = next;
    },
    options
  );
  const texOptions: LoadSeedWorldSingleBinaryBundleOptions | undefined = options
    ? {
        url: options.textureUrl,
        moduleBaseUrl: options.moduleBaseUrl,
        distRootUrl: options.distRootUrl,
        fetchImpl: options.fetchImpl
      }
    : undefined;
  const texPromise = fetchSwb1Bundle(
    BUILDING_TEX_BUNDLE_URL,
    "Building texture bundle",
    () => cachedBuildingTexBundlePromise,
    (next) => {
      cachedBuildingTexBundlePromise = next;
    },
    texOptions
  );
  promise = Promise.all([binPromise, texPromise]).then(([binAssets, texAssets]) => {
    if (epoch !== bundleReleaseEpoch || cachedBuildingCombinedPromise !== promise) return undefined;
    const merged = mergeSeedWorldBinaryAssetMaps(binAssets, texAssets);
    if (!merged) clearIfCurrent();
    return merged;
  });
  cachedBuildingCombinedPromise = promise;
  return promise;
}

/**
 * Resolves the emitted per-template uncompressed SWB1 shard URLs for `templateId`.
 * Returns an empty array in dev mode, on invalid JSON, or for unknown templates.
 */
export function resolveSeedWorldTemplateBinaryBundleUrls(
  templateId: string,
  rawManifest: string = TEMPLATE_BIN_BUNDLES_JSON
): readonly string[] {
  if (!rawManifest || rawManifest.startsWith("__SEED_WORLD_")) return [];
  try {
    const parsed = JSON.parse(rawManifest) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const manifest = parsed as Record<string, unknown>;
    const key = templateId && typeof manifest[templateId] !== "undefined" ? templateId : "original";
    const urls = manifest[key];
    if (!Array.isArray(urls)) return [];
    return urls.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return [];
  }
}

export interface LoadSeedWorldTemplateBinaryBundleOptions {
  /** Override shard URLs (primarily for deterministic unit testing). */
  readonly urls?: readonly string[];
  /** Override base URL used to resolve relative shard paths. */
  readonly moduleBaseUrl?: string;
  /** Override dist root URL used to resolve relative SWB1 entry keys. */
  readonly distRootUrl?: string;
  /** Optional custom fetch implementation (primarily for deterministic unit testing). */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Loads the build-time per-template SWB1 shards (.json.gz + uncompressed .ktx2/.glb/.png/etc.)
 * strictly scoped to `templateId`. Registers each shard progressively into the `fetch()` prefetch
 * interceptor and invokes `onShardLoaded` the moment THAT shard arrives (never waiting for all
 * shards to complete).
 */
export function loadSeedWorldTemplateBinaryBundles(
  templateId: string,
  onShardLoaded?: TemplateShardListener,
  options?: LoadSeedWorldTemplateBinaryBundleOptions
): Promise<ReadonlyMap<string, Uint8Array> | undefined> {
  const urls = options?.urls ?? resolveSeedWorldTemplateBinaryBundleUrls(templateId);
  if (urls.length === 0) return Promise.resolve(undefined);
  const cacheKey = `${templateId}:${urls.join("|")}`;
  const existing = cachedTemplateBundleStates.get(cacheKey);
  if (existing) {
    if (onShardLoaded) {
      if (existing.accumulated.size > 0) {
        onShardLoaded(existing.accumulated, {
          shardIndex: -1,
          completedShards: existing.completedShards,
          totalShards: existing.totalShards,
          bundleUrl: ""
        });
      }
      if (!existing.settled) {
        existing.listeners.add(onShardLoaded);
      }
    }
    return existing.promise;
  }
  const moduleBaseUrl = options?.moduleBaseUrl ?? import.meta.url;
  const distRootUrl = options?.distRootUrl ?? new URL("../", moduleBaseUrl).href;
  const fetchFn = options?.fetchImpl ?? fetch;
  const accumulated = new Map<string, Uint8Array>();
  const listeners = new Set<TemplateShardListener>();
  const controller = new AbortController();
  if (onShardLoaded) listeners.add(onShardLoaded);
  let state!: TemplateBundleState;
  const clearIfCurrent = () => {
    if (state && cachedTemplateBundleStates.get(cacheKey) === state) {
      cachedTemplateBundleStates.delete(cacheKey);
    }
  };
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("Template bundle download timed out", "TimeoutError"));
  }, TEMPLATE_BUNDLE_TIMEOUT_MS);
  const promise = (async () => {
    await Promise.all(
      urls.map(async (relOrUrl, index) => {
        try {
          const bundleUrl = new URL(relOrUrl, moduleBaseUrl).href;
          const response = await fetchFn(bundleUrl, { signal: controller.signal });
          if (cachedTemplateBundleStates.get(cacheKey) !== state) return;
          if (!response.ok) {
            console.warn(
              `[SeedWorld] Template '${templateId}' binary shard ${index} failed (${response.status}): ${bundleUrl}`
            );
            return;
          }
          const buffer = await response.arrayBuffer();
          // If bundles were released while this shard was in-flight, drop it immediately so buffers aren't retained.
          if (cachedTemplateBundleStates.get(cacheKey) !== state) return;
          const parsed = await parseSeedWorldCommonBinaryBundle(buffer, distRootUrl);
          if (cachedTemplateBundleStates.get(cacheKey) !== state) return;
          state.completedShards++;
          if (parsed && parsed.size > 0) {
            for (const [key, bytes] of parsed) {
              accumulated.set(key, bytes);
            }
            registerSeedWorldPrefetchedFetchAssets(parsed);
            const progress: SeedWorldTemplateBundleShardProgress = {
              shardIndex: index,
              completedShards: state.completedShards,
              totalShards: urls.length,
              bundleUrl
            };
            for (const listener of listeners) {
              listener(parsed, progress);
            }
          }
        } catch (error) {
          if (cachedTemplateBundleStates.get(cacheKey) !== state) return;
          console.warn(
            `[SeedWorld] Template '${templateId}' binary shard ${index} load failed, falling back to per-file fetches`,
            error
          );
        }
      })
    );
    state.settled = true;
    listeners.clear();
    if (accumulated.size === 0) {
      clearIfCurrent();
      return undefined;
    }
    return accumulated;
  })().finally(() => clearTimeout(timeout));
  state = {
    promise,
    accumulated,
    listeners,
    controller,
    completedShards: 0,
    totalShards: urls.length,
    settled: false
  };
  cachedTemplateBundleStates.set(cacheKey, state);
  return promise;
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
  bundleReleaseEpoch++;
  cachedCommonBundlePromise = undefined;
  cachedBuildingBundlePromise = undefined;
  cachedBuildingTexBundlePromise = undefined;
  cachedBuildingCombinedPromise = undefined;
  for (const state of cachedTemplateBundleStates.values()) {
    if (!state.settled) state.controller.abort();
    state.listeners.clear();
    state.accumulated.clear();
    state.settled = true;
  }
  cachedTemplateBundleStates.clear();
  uninstallSeedWorldFetchPrefetchInterceptor();
}
