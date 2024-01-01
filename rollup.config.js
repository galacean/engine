const fs = require("fs");
const path = require("path");

import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import glslify from "rollup-plugin-glslify";
import serve from "rollup-plugin-serve";
import miniProgramPlugin from "./rollup.miniprogram.plugin";
import replace from "@rollup/plugin-replace";
import { swc, defineRollupSwcOption, minify } from "rollup-plugin-swc3";
import modify from "rollup-plugin-modify";

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

function config({ location, pkgJson }) {
  const input = path.join(location, "src", "index.ts");
  const dependencies = Object.assign({}, pkgJson.dependencies ?? {}, pkgJson.peerDependencies ?? {});
  const external = Object.keys(dependencies);
  commonPlugins.push(
    replace({
      preventAssignment: true,
      __buildVersion: pkgJson.version
    })
  );

  return {
    umd: (compress) => {
      const umdConfig = pkgJson.umd;
      let file = path.join(location, "dist", "browser.js");

      const plugins = [
        modify({
          find: "chevrotain",
          replace: path.join(process.cwd(), "packages", "shader-lab", `./node_modules/chevrotain/lib/chevrotain.js`)
        }),
        ...commonPlugins
      ];
      if (compress) {
        plugins.push(minify());
        file = path.join(location, "dist", "browser.min.js");
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
            sourcemap: false,
            globals: umdConfig.globals
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
        external: external.concat("@galacean/engine-miniprogram-adapter").map((name) => `${name}/dist/miniprogram`),
        plugins
      };
    },
    module: () => {
      const plugins = [
        modify({
          find: "chevrotain",
          replace: path.join(process.cwd(), "packages", "shader-lab", `./node_modules/chevrotain/lib/chevrotain.js`)
        }),
        ...commonPlugins
      ];
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
            sourcemap: true,
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

switch (BUILD_TYPE) {
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

function getMini() {
  const configs = [...pkgs];
  return configs.map((config) => makeRollupConfig({ ...config, type: "mini" }));
}

function getAll() {
  return [...getModule(), ...getMini(), ...getUMD()];
}

export default Promise.all(promises);
