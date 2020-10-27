const fs = require("fs");
const path = require("path");

import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import babel from "@rollup/plugin-babel";
import string from "@ali/rollup-plugin-string";
import { terser } from "rollup-plugin-terser";
import miniProgramPlugin from "./rollup.miniprogram.plugin";
import visualizerFunc from "rollup-plugin-visualizer";
const camelCase = require("camelcase");

const { NODE_ENV } = process.env;

const pkgsRoot = path.join(__dirname, "packages");
const pkgs = fs
  .readdirSync(pkgsRoot)
  .map((dir) => path.join(pkgsRoot, dir))
  .map((location) => {
    return { location: location, pkgJson: require(path.resolve(location, "package.json")) };
  });

function toGlobalName(pkgName) {
  return camelCase(pkgName.replace("@alipay/", ""));
}

const extensions = [".js", ".jsx", ".ts", ".tsx"];

const commonPlugins = [
  resolve({ extensions, preferBuiltins: true }),
  string({
    include: [/\.glsl$/, "packages/**/worker/**/*.js"]
  }),
  babel({
    extensions,
    babelHelpers: 'bundled',
    exclude: ["node_modules/**", "packages/**/node_modules/**"]
  }),
  commonjs()
];

function config({location, pkgJson}) {
  const input = path.join(location, "src", "index.ts");
  const external = Object.keys(pkgJson.dependencies || {});
  const name = pkgJson.name;

  return {
    umd: (compress, visualizer) => {
      let file = path.join(location, "dist", "browser.js");
      const plugins = [...commonPlugins];
      if (compress) {
        plugins.push(terser());
        file = path.join(location, "dist", "browser.min.js");
      }
      if (visualizer) plugins.push(visualizerFunc());

      const globalName = toGlobalName(pkgJson.name);

      return {
        input,
        external: name === "@alipay/o3" ? {} : external,
        output: [
          {
            file,
            name: globalName,
            format: "umd",
            sourcemap: false,
            globals: {
              "@alipay/o3": "o3"
            }
          }
        ],
        plugins
      };
    },
    mini: () => {
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
          .concat("@alipay/o3-adapter-miniprogram")
          .map((name) => `${name}/dist/miniprogram`),
        plugins: [...commonPlugins, ...miniProgramPlugin]
      };
    },
    module: () => {
      return {
        input,
        external,
        output: [
          {
            file: path.join(location, pkgJson.module),
            format: "es",
            sourcemap: true
          }
        ],
        plugins: [...commonPlugins]
      };
    }
  };
}

async function makeRollupConfig({type, compress = true, visualizer = true, ..._}) {
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
        makeRollupConfig({ ...config, type: "umd", compress: false, visualizer: false })
      )
    );
}

function getModule() {
  const configs = [...pkgs];
  return configs.map(config=>makeRollupConfig({...config, type: "module"}))
}

function getMini() {
  const configs = [...pkgs];
  return configs.map(config=>makeRollupConfig({...config, type: "mini"}))
}

function getAll() {
  return [...getModule(), ...getMini(), ...getUMD()]
}

export default Promise.all(promises);
