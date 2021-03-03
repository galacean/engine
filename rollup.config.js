const fs = require("fs");
const path = require("path");

import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import babel from "@rollup/plugin-babel";
import glslify from "rollup-plugin-glslify";
import { terser } from "rollup-plugin-terser";
import miniProgramPlugin from "./rollup.miniprogram.plugin";
import replace from "@rollup/plugin-replace";
import esbuild from "rollup-plugin-esbuild";

const camelCase = require("camelcase");

const { NODE_ENV, FAST } = process.env;

const pkgsRoot = path.join(__dirname, "packages");
const pkgs = fs
  .readdirSync(pkgsRoot)
  .map((dir) => path.join(pkgsRoot, dir))
  .map((location) => {
    return {
      location: location,
      pkgJson: require(path.resolve(location, "package.json"))
    };
  });

// "oasisEngine" 、 "@oasisEngine/controls" ...
function toGlobalName(pkgName) {
  return camelCase(pkgName);
}

const extensions = [".js", ".jsx", ".ts", ".tsx"];

const esbuildPlugin = esbuild({
  // All options are optional
  include: /\.[t]s?$/, // default, inferred from `loaders` option
  exclude: /node_modules/, // default
  sourceMap: true, // default
  minify: process.env.NODE_ENV === "production",
  target: "es2015", // default, or 'es20XX', 'esnext'
  define: {
    __VERSION__: '"x.y.z"'
  }
});

const babelPlugin = babel({
  extensions,
  babelHelpers: "bundled",
  exclude: ["node_modules/**", "packages/**/node_modules/**"]
});

const commonPlugins = [
  resolve({ extensions, preferBuiltins: true }),
  glslify({
    include: [/\.glsl$/, "packages/**/worker/**/*.js"]
  }),
  FAST ? esbuildPlugin : babelPlugin,
  commonjs()
];

function config({ location, pkgJson }) {
  const input = path.join(location, "src", "index.ts");
  const external = Object.keys(pkgJson.dependencies || {});
  const name = pkgJson.name;
  commonPlugins.push(
    replace({
      __buildVersion: pkgJson.version,
      preventAssignment: true
    })
  );

  return {
    umd: (compress) => {
      let file = path.join(location, "dist", "browser.js");
      const plugins = [...commonPlugins];
      if (compress) {
        plugins.push(terser());
        file = path.join(location, "dist", "browser.min.js");
      }

      const globalName = toGlobalName(pkgJson.name);

      const globals = {};
      external.forEach((pkgName) => {
        globals[pkgName] = toGlobalName(pkgName);
      });

      return {
        input,
        external: name === "oasis-engine" ? {} : external,
        output: [
          {
            file,
            name: globalName,
            format: "umd",
            sourcemap: false,
            globals
          }
        ],
        plugins
      };
    },
    mini: () => {
      const plugins = [...commonPlugins, ...miniProgramPlugin];
      return {
        input,
        output: [
          {
            format: "cjs",
            file: path.join(location, "dist/miniprogram.js"),
            sourcemap: false
          }
        ],
        external: Object.keys(pkgJson.dependencies || {})
          .concat("@oasis-engine/miniprogram-adapter")
          .map((name) => `${name}/dist/miniprogram`),
        plugins
      };
    },
    module: () => {
      const plugins = [...commonPlugins];
      return {
        input,
        external,
        output: [
          {
            file: path.join(location, pkgJson.module),
            format: "es",
            sourcemap: true
          },
          {
            file: path.join(location, pkgJson.main),
            format: "commonjs"
          }
        ],
        plugins
      };
    }
  };
}

async function makeRollupConfig({ type, compress = true, visualizer = true, ..._ }) {
  return config({ ..._ })[type](compress, visualizer);
}

let promises = [];

switch (NODE_ENV) {
  case "UMD":
    promises.push(...getUMD());
    break;
  case "MODULE":
    promises.push(...getModule());
    break;
  case "MINI":
    promises.push(...getMini());
    break;
  case "ALL":
    promises.push(...getAll());
    break;
  default:
    break;
}

function getUMD() {
  const configs = pkgs.filter((pkg) => pkg.pkgJson.browser);
  return configs
    .map((config) => makeRollupConfig({ ...config, type: "umd" }))
    .concat(
      configs.map((config) =>
        makeRollupConfig({
          ...config,
          type: "umd",
          compress: false,
          visualizer: false
        })
      )
    );
}

function getModule() {
  const configs = [...pkgs];
  return configs.map((config) => makeRollupConfig({ ...config, type: "module" }));
}

function getMini() {
  const configs = [...pkgs];
  return configs.map((config) => makeRollupConfig({ ...config, type: "mini" }));
}

function getAll() {
  return [...getModule(), ...getMini(), ...getUMD()];
}

export default Promise.all(promises);
