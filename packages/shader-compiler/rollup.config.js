// Build two deliberately separate runtimes:
// - `.bootstrap/main.js` is a repo-local, self-contained compiler used only by
//   `pnpm precompile` on a cold checkout.
// - `dist/*` is the publishable package runtime and must share the installed
//   parser instance with ShaderAnalyzer so opaque parsed-pass handles and AST
//   constructors remain compatible.
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import swc from "rollup-plugin-swc3";
import { fileURLToPath } from "node:url";

const bundlerExternal = [
  // Pulled in dynamically by precompile.ts (`await import("../dist/offline.main.js")`);
  // kept out of the bundler output so the runtime compiler is loaded at
  // runtime from the sibling `dist/` directory rather than re-bundled here.
  // Bundler files live at the package root (`<pkg>/bundler/`) so the CDN sync
  // (which recursively walks `dist/`) doesn't try to upload Node-only code.
  "../dist/offline.main.js",
  "../.bootstrap/main.js",
  "@galacean/engine-shader-compiler",
  "@galacean/engine-shader/sources",
  "@galacean/engine-math",
  "@rollup/pluginutils",
  "rollup",
  "node:fs",
  "node:path",
  "node:module",
  "node:url",
  "node:util"
];

const swcPluginBundler = swc({ jsc: { target: "es2020" } });

// Match the root rollup's runtime transpile target so reusing this dist as-is
// mid-`b:all` (between this build and the root rollup's rebuild) behaves
// identically to the final shipped runtime
const swcPluginRuntime = swc({
  jsc: { loose: true, externalHelpers: true, target: "es5" },
  sourceMaps: true
});

const releaseRuntimeExternal = [
  "@galacean/engine-math",
  "@galacean/engine-core",
  "@galacean/engine-design",
  "@galacean/engine-shader-parser/internal",
  "@galacean/engine-shader-parser/internal/analyzer"
];
const shaderParserRuntimeEntry = fileURLToPath(new URL("../shader-parser/src/runtime.ts", import.meta.url));
const shaderParserAnalyzerEntry = fileURLToPath(new URL("../shader-parser/src/index.ts", import.meta.url));
const workspaceShaderParserSource = {
  name: "workspace-shader-parser-source",
  resolveId(id) {
    if (id === "@galacean/engine-shader-parser/internal") return shaderParserRuntimeEntry;
    if (id === "@galacean/engine-shader-parser/internal/analyzer") return shaderParserAnalyzerEntry;
  }
};

export default [
  // Repo-local bootstrap. Dependencies resolve from workspace source so the
  // first shader precompile does not depend on pre-existing package dist files.
  {
    input: "src/offline.ts",
    output: { file: ".bootstrap/main.js", format: "cjs", sourcemap: true },
    external: [],
    plugins: [
      workspaceShaderParserSource,
      resolve({ extensions: [".js", ".ts"], mainFields: ["debug", "module", "main"] }),
      swcPluginRuntime,
      commonjs()
    ]
  },
  // Publishable runtime. Parser is external so Analyzer and Compiler consume
  // one package-owned IR identity rather than embedding incompatible copies.
  {
    input: "src/index.ts",
    output: [
      { file: "dist/main.js", format: "cjs", sourcemap: true },
      { file: "dist/module.js", format: "es", sourcemap: true }
    ],
    external: releaseRuntimeExternal,
    plugins: [
      resolve({ extensions: [".js", ".ts"], mainFields: ["debug", "module", "main"] }),
      swcPluginRuntime,
      commonjs()
    ]
  },
  // Node-only offline entry consumed by the CLI/bundler. Its analyzer parser
  // dependency is external and therefore never enters the runtime main files.
  {
    input: "src/offline.ts",
    output: [
      { file: "dist/offline.main.js", format: "cjs", sourcemap: true },
      { file: "dist/offline.module.js", format: "es", sourcemap: true }
    ],
    external: releaseRuntimeExternal,
    plugins: [
      resolve({ extensions: [".js", ".ts"], mainFields: ["debug", "module", "main"] }),
      swcPluginRuntime,
      commonjs()
    ]
  },
  {
    input: "src/bundler/rollup.ts",
    output: [
      { file: "bundler/rollup.cjs.js", format: "cjs" },
      { file: "bundler/rollup.js", format: "es" }
    ],
    external: bundlerExternal,
    plugins: [swcPluginBundler]
  },
  // Standalone `precompile(options)` API for consumers that need to drive
  // shader precompilation programmatically (e.g. editor dev server) without
  // spawning the CLI. Same code path as `cli.ts`; just skips arg parsing.
  {
    input: "src/bundler/precompile.ts",
    output: [
      { file: "bundler/precompile.cjs.js", format: "cjs" },
      { file: "bundler/precompile.js", format: "es" }
    ],
    external: bundlerExternal,
    plugins: [swcPluginBundler]
  },
  {
    input: "src/bundler/cli.ts",
    output: { file: "bundler/cli.js", format: "cjs", banner: "#!/usr/bin/env node" },
    external: bundlerExternal,
    plugins: [swcPluginBundler]
  }
];
