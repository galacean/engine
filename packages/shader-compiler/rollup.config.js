// Self-contained build for the shader compiler package.
//
// The root engine rollup also builds shader-compiler (with full _VERBOSE /
// release split for downstream consumers), but cannot do so before precompile
// runs — and precompile relies on `dist/bundler/cli.js` (which itself loads
// `dist/main.js` at run time). So this config produces a minimal runtime
// (`dist/main.js`) plus the bundler plumbing (`dist/bundler/index.{cjs.js,js}`,
// `dist/bundler/cli.js`) standalone, breaking the chicken-and-egg on a cold CI
// checkout. The root rollup later overwrites `dist/main.js` with its proper
// release / verbose builds.
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import swc from "rollup-plugin-swc3";
import jscc from "rollup-plugin-jscc";

const bundlerExternal = [
  // Pulled in dynamically by precompile.ts (`await import("../main.js")`); kept
  // out of the bundler output so the runtime compiler is loaded at runtime
  // from the parent dist/ directory rather than re-bundled here.
  "../main.js",
  "@galacean/engine",
  "@galacean/engine-shader-compiler",
  "@rollup/pluginutils",
  "rollup",
  "node:fs",
  "node:path",
  "node:url",
  "node:util"
];

const swcPluginBundler = swc({ jsc: { target: "es2020" } });

// Match the root rollup's transpile target so the bootstrap runtime behaves
// identically to the rebuilt-by-root version (es5 + loose + externalHelpers).
const swcPluginRuntime = swc({
  jsc: { loose: true, externalHelpers: true, target: "es5" },
  sourceMaps: true
});

// Strip `// #if _VERBOSE` … `// #endif` blocks for the bootstrap runtime —
// matches the root rollup's release-mode behaviour. The root rollup will
// later rebuild this file with verbose support if needed.
const jsccPlugin = jscc({ values: { _VERBOSE: false } });

const runtimeExternal = ["@galacean/engine", "@galacean/engine-design"];

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
    plugins: [resolve({ extensions: [".js", ".ts"] }), swcPluginRuntime, commonjs(), jsccPlugin]
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
