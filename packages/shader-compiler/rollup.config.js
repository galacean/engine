// Self-contained build for the shader compiler package.
//
// Produces a self-contained runtime + bundler plumbing for the
// `shader-precompile` CLI. shader-compiler is a standalone offline compiler —
// at runtime it only needs `Color` from
// `@galacean/engine-math`, which we bundle in directly from math's `src/`
// (via `mainFields: ["debug"]`) so this build has zero workspace dist
// prerequisites and works on a cold checkout.
//
// The root rollup later rebuilds the runtime entry with `external: math`
// (sharing the math package at runtime instead of inlining) and adds the
// UMD/browser formats. Both products are correct; this one only has to live
// long enough for `pnpm precompile` to run.
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import swc from "rollup-plugin-swc3";
import { fileURLToPath } from "node:url";

const bundlerExternal = [
  // Pulled in dynamically by precompile.ts (`await import("../dist/main.js")`);
  // kept out of the bundler output so the runtime compiler is loaded at
  // runtime from the sibling `dist/` directory rather than re-bundled here.
  // Bundler files live at the package root (`<pkg>/bundler/`) so the CDN sync
  // (which recursively walks `dist/`) doesn't try to upload Node-only code.
  "../dist/main.js",
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
// identically to the final shipped runtime.
const swcPluginRuntime = swc({
  jsc: { loose: true, externalHelpers: true, target: "es5" },
  sourceMaps: true
});

// Nothing externalized at the runtime entry: `@galacean/engine-math` is
// resolved to its `src/index.ts` via `mainFields: ["debug"]` and bundled
// inline (no workspace dist prerequisite). The shared preprocessor-expression
// parser in `@galacean/engine-design` resolves through the same debug entry.
const runtimeExternal = [];
const shaderParserRuntimeEntry = fileURLToPath(new URL("../shader-parser/src/runtime.ts", import.meta.url));
const workspaceShaderParserSource = {
  name: "workspace-shader-parser-source",
  resolveId(id) {
    if (id === "@galacean/engine-shader-parser/internal") return shaderParserRuntimeEntry;
  }
};

export default [
  // Bootstrap runtime (release-mode). Lets the bundler CLI's
  // `await import("../main.js")` resolve on a fresh checkout.
  {
    input: "src/index.ts",
    output: [
      { file: "dist/main.js", format: "cjs", sourcemap: true },
      { file: "dist/module.js", format: "es", sourcemap: true }
    ],
    external: runtimeExternal,
    plugins: [
      // The parser root is intentionally unresolvable, so cold builds bind its runtime subpath
      // directly to workspace source instead of publishing a source-only package condition.
      workspaceShaderParserSource,
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
    output: { file: "bundler/cli.js", format: "es", banner: "#!/usr/bin/env node" },
    external: bundlerExternal,
    plugins: [swcPluginBundler]
  }
];
