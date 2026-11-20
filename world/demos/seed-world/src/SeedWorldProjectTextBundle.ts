// Replaced at build time in WORLD_FLASH_APP=1 builds with the emitted single-request JSON bundle URL.
const FLASH_APP_TEXT_BUNDLE_URL: string | undefined = "__SEED_WORLD_PROJECT_TEXT_BUNDLE_URL__";

let cachedBundlePromise: Promise<ReadonlyMap<string, string> | undefined> | undefined;

/**
 * Loads the build-time consolidated small project text bundle (.prefab/.mat/.tex/.scene/.json)
 * when running in a Flash App production build. Returns undefined in dev/non-flash builds or on fetch miss,
 * allowing RuntimeProjectSession to fall back transparently to per-file fetches.
 */
export function loadSeedWorldProjectTextBundle(): Promise<ReadonlyMap<string, string> | undefined> {
  if (!FLASH_APP_TEXT_BUNDLE_URL || FLASH_APP_TEXT_BUNDLE_URL.startsWith("__SEED_WORLD_")) {
    return Promise.resolve(undefined);
  }
  if (!cachedBundlePromise) {
    cachedBundlePromise = (async () => {
      try {
        // Keep `import.meta.url` in a local binding so Vite's `vite:asset-import-meta-url` plugin
        // does not rewrite `new URL("../", import.meta.url)` to `new URL("../", self.location)`
        // (which throws `TypeError: Invalid URL` in `about:srcdoc` Flash App iframes and resolves
        // against the wrong origin when HTML and assets live on separate hosts).
        const moduleBaseUrl = import.meta.url;
        const bundleUrl = new URL(FLASH_APP_TEXT_BUNDLE_URL, moduleBaseUrl).href;
        // Bundle entries are keyed by repository-relative path (e.g. "packages/terrain/...").
        // Resolve each key relative to the dist root (one directory above assets/).
        const distRootUrl = new URL("../", moduleBaseUrl).href;
        const response = await fetch(bundleUrl);
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

/** Parses preloaded JSON text safely so corrupt entries fall back transparently to network fetch. */
export function parsePreloadedJson<T>(text: string | undefined): T | undefined {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}
