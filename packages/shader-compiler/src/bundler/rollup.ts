import type { Plugin } from "rollup";
import { runFull, startWatcher, normalizePath } from "./precompile";

export interface ShaderPrecompileOptions {
  /** Directory containing `.shader` source files. */
  input: string;
  /** Directory where `.shaderc` outputs are written. */
  output: string;
  /** Remove `.shaderc` whose source no longer exists. Default `true`. */
  clean?: boolean;
  /** Emit an aggregated `<output>/index.ts`. Default `true`. */
  emitIndex?: boolean;
  /** Emit raw-source indexes (`.shader` + `.glsl`) into the input tree. */
  emitSources?: boolean;
  /** Shader platform target. Default `0`. */
  platformTarget?: number;
}

export interface ShaderPluginOptions {
  /**
   * Override the default include pattern. The plugin always matches `.glsl`,
   * `.shader`, and `.shaderc` extensions; this option exists for advanced
   * cases where the host bundler needs to gate by additional path constraints.
   * Returning `false` skips a file.
   */
  filter?: (id: string) => boolean;

  /**
   * When set, the plugin runs an initial full precompile in `buildStart` and,
   * in watch mode, starts a background file watcher that incrementally
   * regenerates `.shaderc` outputs when `.shader` / `.glsl` files change.
   * Without this option the plugin only does file-extension transforms —
   * pre-compile must be triggered separately via the `shader-precompile` CLI.
   */
  precompile?: ShaderPrecompileOptions;
}

/**
 * Pure transformer: take a file's id + source and emit JS module source.
 *
 * - `.shaderc`        → exports the embedded JSON literal as the default export.
 * - `.shader`/`.glsl` → exports the raw source as a string literal.
 */
function transformAsModule(code: string, id: string): { code: string; map: { mappings: string } } {
  if (id.endsWith(".shaderc")) {
    return { code: `export default ${code};`, map: { mappings: "" } };
  }
  return { code: `export default ${JSON.stringify(code)};`, map: { mappings: "" } };
}

/**
 * Rollup plugin that transforms shader assets into JS modules.
 *
 * - Always: transforms `.glsl` / `.shader` / `.shaderc` files.
 * - When `precompile` option is set: runs a full precompile in buildStart and,
 *   in watch mode, starts a background watcher that mirrors `.shader` source
 *   changes into `.shaderc` outputs and refreshes the aggregated index.
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
      if (!normalized.match(/\.(glsl|shader|shaderc)$/)) return null;
      if (filter && !filter(normalized)) return null;
      return { code: transformAsModule(code, normalized).code };
    }
  };
}
