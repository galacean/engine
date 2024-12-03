const fs = require("fs");
const path = require("path");

import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import glslify from "rollup-plugin-glslify";
import serve from "rollup-plugin-serve";
import replace from "@rollup/plugin-replace";
import { swc, defineRollupSwcOption, minify } from "rollup-plugin-swc3";
import jscc from "rollup-plugin-jscc";

const { BUILD_TYPE, NODE_ENV } = process.env;

const pkgsRoot = path.join(__dirname, "packages");
const pkgs = fs
  .readdirSync(pkgsRoot)
  .filter((dir) => dir !== "design")
  .map((dir) => path.join(pkgsRoot, dir))
  .filter((dir) => fs.statSync(dir).isDirectory())
  .map((location) => {
    return {
      location: location,
      pkgJson: require(path.resolve(location, "package.json"))
    };
  });

const shaderLabPkg = pkgs.find((item) => item.pkgJson.name === "@galacean/engine-shader-lab");
pkgs.push({ ...shaderLabPkg, verboseMode: true });

// toGlobalName

const extensions = [".js", ".jsx", ".ts", ".tsx"];
const mainFields = NODE_ENV === "development" ? ["debug", "module", "main"] : undefined;

const commonPlugins = [
  resolve({ extensions, preferBuiltins: true, mainFields }),
  glslify({
    include: [/\.glsl$/]
  }),
  swc(
    defineRollupSwcOption({
      include: /\.[mc]?[jt]sx?$/,
      exclude: /node_modules/,
      jsc: {
        loose: true,
        externalHelpers: true,
        target: "es5"
      },
      sourceMaps: true
    })
  ),
  commonjs(),
  NODE_ENV === "development"
    ? serve({
        contentBase: "packages",
        port: 9999
      })
    : null
];

function config({ location, pkgJson, verboseMode }) {
  const input = path.join(location, "src", "index.ts");
  const dependencies = Object.assign({}, pkgJson.dependencies ?? {}, pkgJson.peerDependencies ?? {});
  const curPlugins = Array.from(commonPlugins);

  curPlugins.push(
    jscc({
      values: { _VERBOSE: verboseMode }
    })
  );

  const external = Object.keys(dependencies);
  curPlugins.push(
    replace({
      preventAssignment: true,
      __buildVersion: pkgJson.version
    })
  );

  return {
    umd: (compress) => {
      const umdConfig = pkgJson.umd;
      let file = path.join(location, "dist", "browser.js");

      if (verboseMode) {
        if (compress) {
          curPlugins.push(minify({ sourceMap: true }));
          file = path.join(location, "dist", "browser.verbose.min.js");
        } else {
          file = path.join(location, "dist", "browser.verbose.js");
        }
      } else {
        if (compress) {
          curPlugins.push(minify({ sourceMap: true }));
          file = path.join(location, "dist", "browser.min.js");
        } else {
          file = path.join(location, "dist", "browser.js");
        }
      }

      const umdExternal = Object.keys(umdConfig.globals ?? {});

      return {
        input,
        external: umdExternal,
        output: [
          {
            file,
            name: umdConfig.name,
            format: "umd",
            sourcemap: true,
            globals: umdConfig.globals
          }
        ],
        plugins: curPlugins
      };
    },
    module: () => {
      let esFile = path.join(location, pkgJson.module);
      let mainFile = path.join(location, pkgJson.main);
      if (verboseMode) {
        esFile = path.join(location, "dist", "module.verbose.js");
        mainFile = path.join(location, "dist", "main.verbose.js");
      }
      return {
        input,
        external,
        output: [
          {
            file: esFile,
            format: "es",
            sourcemap: true
          },
          {
            file: mainFile,
            sourcemap: true,
            format: "commonjs"
          }
        ],
        plugins: curPlugins
      };
    }
  };
}

async function makeRollupConfig({ type, compress = true, visualizer = true, ..._ }) {
  return config({ ..._ })[type](compress, visualizer);
}

let promises = [];

switch (BUILD_TYPE) {
  case "UMD":
    promises.push(...getUMD());
    break;
  case "MODULE":
    promises.push(...getModule());
    break;
  case "ALL":
    promises.push(...getAll());
    break;
  default:
    break;
}

function getUMD() {
  const configs = pkgs.filter((pkg) => pkg.pkgJson.umd);
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

function getAll() {
  return [...getModule(), ...getUMD()];
}

export default Promise.all(promises);
