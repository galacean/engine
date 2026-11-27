import {
  clearSeedWorldPrefetchedFetchTextAssets,
  registerSeedWorldPrefetchedFetchTextAssets
} from "./SeedWorldCommonBinaryBundle.ts";

// Replaced at build time in WORLD_FLASH_APP=1 builds with the emitted single-request JSON bundle URL.
const FLASH_APP_TEXT_BUNDLE_URL: string | undefined = "__SEED_WORLD_PROJECT_TEXT_BUNDLE_URL__";

let cachedBundlePromise: Promise<ReadonlyMap<string, string> | undefined> | undefined;

export interface LoadSeedWorldProjectTextBundleOptions {
  /** Override bundle URL (primarily for deterministic unit testing). */
  readonly url?: string;
  /** Override base URL used to resolve relative bundle paths. */
  readonly moduleBaseUrl?: string;
  /** Override dist root URL used to resolve relative text entry keys. */
  readonly distRootUrl?: string;
  /** Optional custom fetch implementation (primarily for deterministic unit testing). */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Loads the build-time consolidated small project text bundle (.prefab/.mat/.scene/.json)
 * when running in a Flash App production build. Returns undefined in dev/non-flash builds or on fetch miss,
 * allowing RuntimeProjectSession to fall back transparently to per-file fetches.
 */
export function loadSeedWorldProjectTextBundle(
  options?: LoadSeedWorldProjectTextBundleOptions
): Promise<ReadonlyMap<string, string> | undefined> {
  const effectiveUrl = options?.url ?? FLASH_APP_TEXT_BUNDLE_URL;
  if (!effectiveUrl || effectiveUrl.startsWith("__SEED_WORLD_")) {
    return Promise.resolve(undefined);
  }
  if (!cachedBundlePromise) {
    const fetchFn = options?.fetchImpl ?? fetch;
    cachedBundlePromise = (async () => {
      try {
        // Keep `import.meta.url` in a local binding so Vite's `vite:asset-import-meta-url` plugin
        // does not rewrite `new URL("../", import.meta.url)` to `new URL("../", self.location)`
        // (which throws `TypeError: Invalid URL` in `about:srcdoc` Flash App iframes and resolves
        // against the wrong origin when HTML and assets live on separate hosts).
        const moduleBaseUrl = options?.moduleBaseUrl ?? import.meta.url;
        const bundleUrl = new URL(effectiveUrl, moduleBaseUrl).href;
        // Bundle entries are keyed by repository-relative path (e.g. "packages/terrain/...").
        // Resolve each key relative to the dist root (one directory above assets/).
        const distRootUrl = options?.distRootUrl ?? new URL("../", moduleBaseUrl).href;
        const response = await fetchFn(bundleUrl);
        if (!response.ok) {
          console.warn(`[SeedWorld] Project text bundle request failed (${response.status}): ${bundleUrl}`);
          cachedBundlePromise = undefined;
          return undefined;
        }
        const entries = (await response.json()) as Record<string, string>;
        const map = new Map<string, string>();
        for (const [relativePath, content] of Object.entries(entries)) {
          if (typeof content !== "string") continue;
          const resolvedUrl = new URL(relativePath, distRootUrl).href;
          map.set(resolvedUrl, content);
        }
        registerSeedWorldPrefetchedFetchTextAssets(map);
        return map;
      } catch (error) {
        console.warn("[SeedWorld] Project text bundle load failed, falling back to per-file fetches", error);
        cachedBundlePromise = undefined;
        return undefined;
      }
    })();
  }
  return cachedBundlePromise;
}

/** Releases cached project text bundle state and removes its `fetch()` interception entries. */
export function releaseSeedWorldProjectTextBundle(): void {
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
