// Bundler-only rollup config.
//
// The runtime ShaderLab compiler (src/index.ts → dist/main.js, dist/module.js)
// is normally built by the root rollup.config.js as part of the workspace-wide
// build. This config builds the build-tooling subpath (src/bundler/*) which is
// Node-only and intentionally kept separate so it never gets pulled into the
// browser-safe runtime bundle.
//
// It also exposes `build:runtime` outputs so the package can be bootstrapped
// stand-alone (e.g. before running `precompile`, where the bundler CLI needs
// the runtime's `dist/main.js` to be present).
import swc from "rollup-plugin-swc3";

const bundlerExternal = [
  // Pulled in dynamically by precompile.ts (`await import("../main.js")`); kept
  // out of the bundler output so the runtime compiler is loaded at runtime
  // from the parent dist/ directory rather than re-bundled here.
  "../main.js",
  "@galacean/engine-shaderlab",
  "@rollup/pluginutils",
  "rollup",
  "node:fs",
  "node:path",
  "node:url",
  "node:util"
];

const swcPlugin = swc({ jsc: { target: "es2020" } });

export default [
  {
    input: "src/bundler/index.ts",
    output: [
      { file: "dist/bundler/index.cjs.js", format: "cjs" },
      { file: "dist/bundler/index.js", format: "es" }
    ],
    external: bundlerExternal,
    plugins: [swcPlugin]
  },
  {
    input: "src/bundler/cli.ts",
    output: { file: "dist/bundler/cli.js", format: "es", banner: "#!/usr/bin/env node" },
    external: bundlerExternal,
    plugins: [swcPlugin]
  }
];
