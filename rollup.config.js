const fs = require("fs");
const path = require("path");

import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { shaderLab } from "@galacean/engine-shaderlab/bundler";
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

const shaderLabPkg = pkgs.find((item) => item.pkgJson.name === "@galacean/engine-shaderlab");
pkgs.push({ ...shaderLabPkg, verboseMode: true });

// toGlobalName
const extensions = [".js", ".jsx", ".ts", ".tsx"];
const mainFields = NODE_ENV === "development" ? ["debug", "module", "main"] : undefined;

const shaderLabPlugin = shaderLab({
  precompile: {
    input: path.join(__dirname, "packages/shader/src/Shaders"),
    output: path.join(__dirname, "packages/shader/libs"),
    library: path.join(__dirname, "packages/shader/src/ShaderLibrary")
  }
});

const commonPlugins = [
  resolve({ extensions, preferBuiltins: true, mainFields }),
  shaderLabPlugin,
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

      if (compress) {
        curPlugins.push(minify({ sourceMap: true }));
      }

      if (verboseMode) {
        file = path.join(location, "dist", compress ? "browser.verbose.min.js" : "browser.verbose.js");
      } else {
        file = path.join(location, "dist", compress ? "browser.min.js" : "browser.js");
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
    },
    sources: () => {
      // Build the "sources" subpath entry for @galacean/engine-shader.
      // Exports raw .shader source strings (for editor use).
      const sourcesInput = path.join(location, "src", "sources.ts");
      return {
        input: sourcesInput,
        external,
        output: [
          {
            file: path.join(location, "dist", "sources.module.js"),
            format: "es",
            sourcemap: true
          },
          {
            file: path.join(location, "dist", "sources.main.js"),
            format: "commonjs",
            sourcemap: true
          }
        ],
        plugins: curPlugins
      };
    },
    bundled: (compress) => {
      // ES module format with no external dependencies (bundled)
      const bundledFile = path.join(location, "dist", compress ? "bundled.module.min.js" : "bundled.module.js");

      const bundledPlugins = Array.from(curPlugins);

      if (compress) {
        bundledPlugins.push(minify({
          sourceMap: true,
          module: true // Indicate this is an ES module
        }));
      }

      return {
        input,
        external: [], // No external dependencies - bundle everything
        output: [
          {
            file: bundledFile,
            format: "es",
            sourcemap: true
          }
        ],
        plugins: bundledPlugins
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
  case "BUNDLED":
    promises.push(...getBundled());
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
  const result = configs.map((config) => makeRollupConfig({ ...config, type: "module" }));

  // Build shader package "sources" subpath entry (raw .shader strings for editor)
  const shaderPkg = pkgs.find((pkg) => pkg.pkgJson.name === "@galacean/engine-shader");
  if (shaderPkg) {
    result.push(makeRollupConfig({ ...shaderPkg, type: "sources" }));
  }

  return result;
}

function getBundled() {
  // Only build bundled version for @galacean/engine package
  const galaceanConfig = pkgs.find((pkg) => pkg.pkgJson.name === "@galacean/engine");
  if (galaceanConfig) {
    return [
      makeRollupConfig({ ...galaceanConfig, type: "bundled", compress: false }),
      makeRollupConfig({ ...galaceanConfig, type: "bundled", compress: true })
    ];
  }
  return [];
}

function getAll() {
  return [...getModule(), ...getUMD(), ...getBundled()];
}

export default Promise.all(promises);
