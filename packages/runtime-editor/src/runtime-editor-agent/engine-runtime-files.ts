import { type ProjectFileProvider } from "@galacean/engine-project/project-files/virtual-project-files";
import index from "../runtime-editor/generated/engine-runtime-index.json";
import { runtimeHostDeclarations } from "../runtime-editor/scripts/runtime-host-declarations";

const RUNTIME_MODULES_PATH = "skills/scripting/references/runtime-modules.md";

const runtimeModules = `# 运行时模块

These are the declarations emitted from the Engine source used by this application. They describe APIs available to Script assets running in the game. The execute Worker uses the separately declared editing APIs.

- [Package entry](declare/engine/node_modules/@galacean/engine/types/index.d.ts)
- [Script lifecycle](declare/engine/node_modules/@galacean/engine-core/types/Script.d.ts)
- [Entity and component access](declare/engine/node_modules/@galacean/engine-core/types/Entity.d.ts)
- [Transform](declare/engine/node_modules/@galacean/engine-core/types/Transform.d.ts)
- [Scene](declare/engine/node_modules/@galacean/engine-core/types/Scene.d.ts)
- [Vector3](declare/engine/node_modules/@galacean/engine-math/types/Vector3.d.ts)
- [Project asset path resolution](declare/engine/node_modules/@galacean/editor-assets/index.d.ts)

Follow relative imports within each package. Bare imports resolve under declare/engine/node_modules, using each package.json types entry. API comments, units and lifecycle semantics are preserved from the engine source.
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
  const readRuntimeModules = () =>
    runtimeModules +
    (environment
      ? "\nHost modules available in this project:\n" +
        Object.keys(environment.declarations)
          .filter((path) => /node_modules\/(?:@[^/]+\/)?[^/]+\/index\.d\.ts$/.test(path))
          .map((path) => `- [${path.slice("declare/engine/node_modules/".length, -"/index.d.ts".length)}](${path})`)
          .join("\n") +
        "\n"
      : "");
  return {
    *paths() {
      yield RUNTIME_MODULES_PATH;
      yield "declare/engine/manifest.json";
      yield* paths;
    },
    read(path) {
      if (path === RUNTIME_MODULES_PATH) return readRuntimeModules();
      if (path === "declare/engine/manifest.json")
        return JSON.stringify({ ...index, paths: [...paths], hostModules }, null, 2);
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
  };
}
