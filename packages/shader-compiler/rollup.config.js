// Self-contained build for the shader compiler package.
//
// `@galacean/engine-shader-compiler` is a standalone offline compiler — see
// `src/enums/README.md`. It depends on no engine runtime package, so this
// build runs on a fresh checkout without any other workspace dist present.
// The root rollup later rebuilds the runtime entry to add the `_VERBOSE`
// split (`dist/main.verbose.js`) and UMD/browser formats; what we produce
// here is just enough for the `shader-precompile` CLI to run.
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import swc from "rollup-plugin-swc3";
import jscc from "rollup-plugin-jscc";

const bundlerExternal = [
  // Pulled in dynamically by precompile.ts (`await import("../main.js")`); kept
  // out of the bundler output so the runtime compiler is loaded at runtime
  // from the parent dist/ directory rather than re-bundled here.
  "../main.js",
  "@galacean/engine-shader-compiler",
  "@galacean/engine-math",
  "@rollup/pluginutils",
  "rollup",
  "node:fs",
  "node:path",
  "node:url",
  "node:util"
];

const swcPluginBundler = swc({ jsc: { target: "es2020" } });

// Match the root rollup's runtime transpile target so reusing this dist as-is
// (when the root rollup hasn't rebuilt yet, e.g. mid-`b:all`) behaves the same.
const swcPluginRuntime = swc({
  jsc: { loose: true, externalHelpers: true, target: "es5" },
  sourceMaps: true
});

// Strip `// #if _VERBOSE` … `// #endif` blocks. The root rollup later
// rebuilds with `_VERBOSE: true` as a sibling `*.verbose.js` output.
const jsccPlugin = jscc({ values: { _VERBOSE: false } });

// `@galacean/engine-design` is type-only (all imports use `import type`) and
// erased by swc. `@galacean/engine-math`'s `Color` is the only runtime symbol
// we touch — bundled into the dist so shader-compiler stays self-contained
// (no `pnpm b:compiler` prerequisite on math's dist) and the precompile CLI
// can run on a fresh checkout. The single source of truth for `Color` is
// still `@galacean/engine-math`, so engine-core's deserialized `.shaderc`
// shares the same nominal type with what shader-compiler produces.
const runtimeExternal = [];

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
      // `mainFields` includes `debug` so workspace packages without a built
      // dist (e.g. `@galacean/engine-math` on a fresh checkout) still resolve
      // — `debug` points to `src/index.ts` and rollup transpiles it via swc.
      resolve({ extensions: [".js", ".ts"], mainFields: ["debug", "module", "main"] }),
      swcPluginRuntime,
      commonjs(),
      jsccPlugin
    ]
  },
  {
    input: "src/bundler/index.ts",
    output: [
      { file: "dist/bundler/index.cjs.js", format: "cjs" },
      { file: "dist/bundler/index.js", format: "es" }
    ],
    external: bundlerExternal,
    plugins: [swcPluginBundler]
  },
  {
    input: "src/bundler/cli.ts",
    output: { file: "dist/bundler/cli.js", format: "es", banner: "#!/usr/bin/env node" },
    external: bundlerExternal,
    plugins: [swcPluginBundler]
  }
];
