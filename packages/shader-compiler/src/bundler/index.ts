import type { Plugin } from "rollup";
import { runFull, startWatcher } from "./precompile";
import { transform } from "./transform";
import { normalizePath } from "./utils";

export interface ShaderPrecompileOptions {
  /** Directory containing `.shader` source files. */
  input: string;
  /** Directory where `.gsp` outputs are written. */
  output: string;
  /**
   * Optional directory of `.glsl` include fragments. In watch mode, changes to
   * `.glsl` here trigger a full recompile (since includes affect every `.shader`).
   */
  library?: string;
  /** Remove `.gsp` whose source no longer exists. Default `true`. */
  clean?: boolean;
  /** Emit an aggregated `<output>/index.ts`. Default `true`. */
  emitIndex?: boolean;
  /** Shader platform target. Default `0`. */
  platformTarget?: number;
}

export interface ShaderPluginOptions {
  /**
   * Override the default include pattern.
   *
   * The plugin always matches `.glsl`, `.shader`, and `.gsp` extensions; this
   * option exists for advanced cases where the host bundler needs to gate by
   * additional path constraints. Returning `false` skips a file.
   */
  filter?: (id: string) => boolean;

  /**
   * When set, the plugin runs an initial full precompile in `buildStart` and,
   * in watch mode, starts a background file watcher that incrementally
   * regenerates `.gsp` outputs when `.shader` / `.glsl` files change. Without
   * this option the plugin only does file-extension transforms — pre-compile
   * must be triggered separately via the `shader-precompile` CLI.
   */
  precompile?: ShaderPrecompileOptions;
}

/**
 * Rollup plugin that transforms shader assets into JS modules.
 *
 * - Always: transforms `.glsl` / `.shader` / `.gsp` files.
 * - When `precompile` option is set: runs a full precompile in buildStart and,
 *   in watch mode, starts a background watcher that mirrors `.shader` source
 *   changes into `.gsp` outputs and refreshes the aggregated index.
 */
export function shaderCompiler(options: ShaderPluginOptions = {}): Plugin {
  const { filter, precompile } = options;
  const precompileOptions: ShaderPrecompileOptions | undefined = precompile && {
    clean: true,
    emitIndex: true,
    ...precompile
  };
  let initialDone = false;
  let watcherStarted = false;

  return {
    name: "shader-compiler",

    async buildStart() {
      if (!precompileOptions || initialDone) return;
      initialDone = true;
      await runFull(precompileOptions);

      if (this.meta.watchMode && !watcherStarted) {
        watcherStarted = true;
        startWatcher(precompileOptions).catch((e) =>
          this.warn(`[shader-compiler] watcher failed: ${(e as Error).message}`)
        );
      }
    },

    transform(code: string, id: string) {
      const normalized = normalizePath(id);
      if (!normalized.match(/\.(glsl|shader|gsp)$/)) return null;
      if (filter && !filter(normalized)) return null;
      // We omit `map` here (Rollup's `SourceDescription.map` is optional) — the
      // emitted source is a single literal so there's nothing meaningful to
      // map. The standalone `transform()` export still returns the
      // `{ mappings: "" }` shape for callers that want it.
      return { code: transform(code, normalized).code };
    }
  };
}

export { transform } from "./transform";
export { normalizePath } from "./utils";
export type { TransformResult } from "./transform";
