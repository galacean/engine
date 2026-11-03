import {
  mountProjectFiles,
  type ProjectFileProvider
} from "@galacean/engine-project/project-files/virtual-project-files";
import index from "../runtime-editor/generated/engine-runtime-index.json";
import { runtimeHostDeclarations } from "../runtime-editor/scripts/runtime-host-declarations";
import configuredAssets from "./configured-assets.md?raw";

const knowledge = `# Engine runtime development

These are the declarations emitted from the Engine source used by this application. They describe APIs available to Script assets running in the game. The execute Worker uses the separately declared editing APIs.

- [Package entry](../../declare/runtime/node_modules/@galacean/engine/types/index.d.ts)
- [Script lifecycle](../../declare/runtime/node_modules/@galacean/engine-core/types/Script.d.ts)
- [Entity and component access](../../declare/runtime/node_modules/@galacean/engine-core/types/Entity.d.ts)
- [Transform](../../declare/runtime/node_modules/@galacean/engine-core/types/Transform.d.ts)
- [Scene](../../declare/runtime/node_modules/@galacean/engine-core/types/Scene.d.ts)
- [Vector3](../../declare/runtime/node_modules/@galacean/engine-math/types/Vector3.d.ts)
- [Project asset path resolution](../../declare/runtime/node_modules/@galacean/editor-assets/index.d.ts)
- [Declare candidate assets in component or JSON configuration](configured-assets.md)

Follow relative imports within each package. Bare imports resolve under editor/declare/runtime/node_modules, using each package.json types entry. API comments, units and lifecycle semantics are preserved from the engine source.
`;

/** Runtime declarations are readable project files, not execute Worker permissions. */
export function engineRuntimeFiles(environment?: {
  readonly declarations: Readonly<Record<string, string>>;
  readonly externals: Readonly<Record<string, unknown>>;
}): ProjectFileProvider {
  const hostModules = environment ? Object.keys(environment.externals) : ["@galacean/editor-assets", "zod"];
  const hostFiles: Readonly<Record<string, string>> = {
    ...runtimeHostDeclarations(hostModules),
    ...environment?.declarations
  };
  const paths = new Set([...index.paths, ...Object.keys(hostFiles)]);
  let contents: Record<string, string> | undefined;
  let loading: Promise<Record<string, string>> | undefined;
  const readKnowledge = () =>
    knowledge +
    (environment
      ? "\nHost modules available in this project:\n" +
        Object.keys(environment.declarations)
          .filter((path) => /node_modules\/(?:@[^/]+\/)?[^/]+\/index\.d\.ts$/.test(path))
          .map(
            (path) => `- [${path.slice("declare/runtime/node_modules/".length, -"/index.d.ts".length)}](../../${path})`
          )
          .join("\n") +
        "\n"
      : "");
  return mountProjectFiles("editor", {
    *paths() {
      yield "knowledge/runtime/README.md";
      yield "knowledge/runtime/configured-assets.md";
      yield "declare/runtime/manifest.json";
      yield* paths;
    },
    read(path) {
      if (path === "knowledge/runtime/configured-assets.md") return configuredAssets;
      if (path === "knowledge/runtime/README.md") return readKnowledge();
      if (path === "declare/runtime/manifest.json")
        return JSON.stringify({ ...index, paths: [...paths].map((path) => `editor/${path}`), hostModules }, null, 2);
      if (Object.hasOwn(hostFiles, path)) return hostFiles[path];
      if (!paths.has(path)) return undefined;
      if (!contents) throw new Error(`Prepare runtime declaration '${path}' before reading`);
      return contents[path];
    },
    async prepare(path, signal) {
      if (!paths.has(path) || Object.hasOwn(hostFiles, path)) return;
      signal?.throwIfAborted();
      loading ??= import("../runtime-editor/generated/engine-runtime-files.json").then((module) => module.default);
      try {
        contents = await loading;
      } catch (error) {
        loading = undefined;
        throw error;
      }
      signal?.throwIfAborted();
    }
  });
}
