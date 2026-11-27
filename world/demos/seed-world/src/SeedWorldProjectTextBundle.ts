import {
  clearSeedWorldPrefetchedFetchTextAssets,
  registerSeedWorldPrefetchedFetchTextAssets
} from "./SeedWorldCommonBinaryBundle.ts";

// Replaced at build time in WORLD_FLASH_APP=1 builds with the emitted single-request JSON bundle URL.
const FLASH_APP_TEXT_BUNDLE_URL: string | undefined = "__SEED_WORLD_PROJECT_TEXT_BUNDLE_URL__";
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

let cachedBundlePromise: Promise<ReadonlyMap<string, string> | undefined> | undefined;
let releaseEpoch = 0;

export interface LoadSeedWorldProjectTextBundleOptions {
  /** Override bundle URL (primarily for deterministic unit testing). */
  readonly url?: string;
  /** Override base URL used to resolve relative bundle paths. */
  readonly moduleBaseUrl?: string;
  /** Override dist root URL used to resolve relative text entry keys. */
  readonly distRootUrl?: string;
  /** Optional custom fetch implementation (primarily for deterministic unit testing). */
  readonly fetchImpl?: typeof fetch;
  /** Bounded retry attempts on transient HTTP/network failures (defaults to 2). */
  readonly maxRetries?: number;
  /** Base retry backoff in milliseconds, multiplied by `(attempt + 1)` (defaults to 250ms). */
  readonly retryDelayMs?: number;
  /** Optional custom delay implementation (primarily for fast deterministic unit testing). */
  readonly delayImpl?: (ms: number) => Promise<void>;
}

/**
 * Loads the build-time consolidated small project text bundle (.prefab/.mat/.scene/.json)
 * when running in a production build. Returns undefined in dev builds (unreplaced placeholder)
 * so RuntimeProjectSession fetches per file. In Flash App builds where bundled loose text files
 * are pruned from dist, performs bounded retries on transient CDN/network failures and guards
 * late settlement against `releaseSeedWorldProjectTextBundle()` via a monotonic release epoch.
 */
export function loadSeedWorldProjectTextBundle(
  options?: LoadSeedWorldProjectTextBundleOptions
): Promise<ReadonlyMap<string, string> | undefined> {
  const effectiveUrl = options?.url ?? FLASH_APP_TEXT_BUNDLE_URL;
  if (!effectiveUrl || effectiveUrl.startsWith("__SEED_WORLD_")) {
    return Promise.resolve(undefined);
  }
  if (!cachedBundlePromise) {
    const epoch = releaseEpoch;
    let promise: Promise<ReadonlyMap<string, string> | undefined> | undefined;
    const isStale = () => epoch !== releaseEpoch || (promise !== undefined && cachedBundlePromise !== promise);
    const clearIfCurrent = () => {
      if (promise !== undefined && cachedBundlePromise === promise) {
        cachedBundlePromise = undefined;
      }
    };
    const fetchFn = options?.fetchImpl ?? fetch;
    const maxRetries = Math.max(0, Math.floor(options?.maxRetries ?? DEFAULT_MAX_RETRIES));
    const retryDelayMs = Math.max(0, options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    const delayFn =
      options?.delayImpl ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    promise = (async () => {
      // Keep `import.meta.url` in a local binding so Vite's `vite:asset-import-meta-url` plugin
      // does not rewrite `new URL("../", import.meta.url)` to `new URL("../", self.location)`
      // (which throws `TypeError: Invalid URL` in `about:srcdoc` Flash App iframes and resolves
      // against the wrong origin when HTML and assets live on separate hosts).
      const moduleBaseUrl = options?.moduleBaseUrl ?? import.meta.url;
      const bundleUrl = new URL(effectiveUrl, moduleBaseUrl).href;
      // Bundle entries are keyed by repository-relative path (e.g. "packages/terrain/...").
      // Resolve each key relative to the dist root (one directory above assets/).
      const distRootUrl = options?.distRootUrl ?? new URL("../", moduleBaseUrl).href;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (isStale()) return undefined;
        try {
          const response = await fetchFn(bundleUrl);
          if (isStale()) return undefined;
          if (!response.ok) {
            if (attempt < maxRetries) {
              if (retryDelayMs > 0) await delayFn(retryDelayMs * (attempt + 1));
              continue;
            }
            console.warn(
              `[SeedWorld] Project text bundle request failed after ${attempt + 1} attempt(s) (HTTP ${response.status}): ${bundleUrl}`
            );
            clearIfCurrent();
            return undefined;
          }
          const entries = (await response.json()) as Record<string, string>;
          if (isStale()) return undefined;
          const map = new Map<string, string>();
          for (const [relativePath, content] of Object.entries(entries)) {
            if (typeof content !== "string") continue;
            const resolvedUrl = new URL(relativePath, distRootUrl).href;
            map.set(resolvedUrl, content);
          }
          if (isStale()) return undefined;
          registerSeedWorldPrefetchedFetchTextAssets(map);
          return map;
        } catch (error) {
          if (isStale()) return undefined;
          if (attempt < maxRetries) {
            if (retryDelayMs > 0) await delayFn(retryDelayMs * (attempt + 1));
            continue;
          }
          console.warn(
            `[SeedWorld] Project text bundle load failed after ${attempt + 1} attempt(s): ${bundleUrl}`,
            error
          );
          clearIfCurrent();
          return undefined;
        }
      }
      clearIfCurrent();
      return undefined;
    })();
    cachedBundlePromise = promise;
  }
  return cachedBundlePromise;
}

/** Releases cached project text bundle state, invalidates in-flight loads, and removes its `fetch()` interception entries. */
export function releaseSeedWorldProjectTextBundle(): void {
  releaseEpoch++;
  cachedBundlePromise = undefined;
  clearSeedWorldPrefetchedFetchTextAssets();
}

/** Parses preloaded JSON text safely so corrupt entries fall back transparently to network fetch. */
export function parsePreloadedJson<T>(text: string | undefined): T | undefined {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}
