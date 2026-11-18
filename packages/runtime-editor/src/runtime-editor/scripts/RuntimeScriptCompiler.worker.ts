import * as esbuild from "esbuild-wasm";
import wasmURL from "esbuild-wasm/esbuild.wasm?url";
import { buildRuntimeScripts } from "./runtime-script-builder";
import { RuntimeScriptPreparationError } from "./runtime-script-errors";
import { checkRuntimeScripts } from "./runtime-script-compiler";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries";
import declarations from "../generated/engine-runtime-files.json";
import { runtimeHostDeclarations } from "./runtime-host-declarations";
import dom from "typescript/lib/lib.dom.d.ts?raw";
import domIterable from "typescript/lib/lib.dom.iterable.d.ts?raw";

const libraries = { ...agentTypecheckLibraries, "/lib.dom.d.ts": dom, "/lib.dom.iterable.d.ts": domIterable };
let initialized: Promise<void> | undefined;
globalThis.onmessage = async ({
  data
}: MessageEvent<{
  id: number;
  sources: Record<string, string>;
  entries?: string[];
  analyzeOnly?: boolean;
  externals: Record<string, string[]>;
  declarations?: Record<string, string>;
}>) => {
  try {
    const checked = checkRuntimeScripts(
      data.sources,
      { ...declarations, ...runtimeHostDeclarations(Object.keys(data.externals)), ...data.declarations },
      libraries,
      data.entries,
      data.analyzeOnly
    );
    if (data.analyzeOnly) {
      globalThis.postMessage({
        id: data.id,
        result: { entries: {}, files: {}, dependencies: checked.dependencies, resolutions: checked.resolutions }
      });
      return;
    }
    let result;
    try {
      if (Object.keys(checked.sources).length)
        await (initialized ??= esbuild.initialize({ wasmURL, worker: false }).catch((error) => {
          initialized = undefined;
          throw error;
        }));
      result = await buildRuntimeScripts(checked, data.externals, esbuild.build);
    } catch (error) {
      throw error instanceof RuntimeScriptPreparationError
        ? error
        : new RuntimeScriptPreparationError("build", String(error));
    }
    globalThis.postMessage({ id: data.id, result: { ...result, resolutions: checked.resolutions } });
  } catch (error) {
    globalThis.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
      phase: error instanceof RuntimeScriptPreparationError ? error.phase : "check"
    });
  }
};
