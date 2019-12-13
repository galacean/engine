const fs = require("fs");
const path = require("path");
import { promisify } from "util";

import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import babel from "rollup-plugin-babel";
import string from "@ali/rollup-plugin-string";
import { terser } from "rollup-plugin-terser";
import miniProgramPlugin from "./rollup.miniprogram.plugin";

const readFile = promisify(fs.readFile);

const { LERNA_PACKAGE_NAME, PWD, NODE_ENV } = process.env;
const isMiniProgram = NODE_ENV === "MINIPROGRAM";

let fileDirs;
let excludeDirs = ["o3-examples", "component-miniprogram"];
if (!LERNA_PACKAGE_NAME) {
  console.log("build all");
  const pkgDir = path.join(__dirname, "packages");

  fileDirs = fs
    .readdirSync(pkgDir)
    .filter(
      f =>
        fs.statSync(path.join(pkgDir, f)).isDirectory() &&
        excludeDirs.indexOf(f) === -1
    );
} else {
  const dirname = path.basename(PWD);
  fileDirs = [dirname];
}

const pkg = (name, type) => {
  const location = path.resolve(__dirname, "packages", name);
  let main = path.join("src", "index.ts");
  return makeRollupConfig({ location, main, name, type });
};

fileDirs = fileDirs.filter(name => name !== "o3-plus");
if (!isMiniProgram) {
  fileDirs.push("o3-plus")
}

let promises = [...fileDirs.map(name => pkg(name, "module"))];

if (NODE_ENV === "BUILD") {
  const compressDir = ["o3", "o3-plus"];
  promises = [...compressDir.map(name => pkg(name, "compress"))];
}

// Promise.all(promises).then(res => {
//   console.log(res);
// });

export default Promise.all(promises);

async function makeRollupConfig({ location, main, name, type }) {
  const extensions = [".js", ".jsx", ".ts", ".tsx"];

  const pkg = JSON.parse(
    await readFile(path.resolve(location, "package.json"), {
      encoding: "utf-8"
    })
  );

  const commonPlugins = [
    resolve({ extensions, preferBuiltins: true }),
    string({
      include: /\.glsl$/
    }),
    babel({
      extensions,
      exclude: ["node_modules/**", "packages/**/node_modules/**"],
      presets: [["@babel/env"], ["@babel/preset-typescript"]],
      plugins: [
        "@babel/plugin-proposal-export-namespace-from",
        "@babel/proposal-class-properties",
        "@babel/proposal-object-rest-spread",
        "@babel/plugin-proposal-optional-chaining"
      ]
    }),
    commonjs()
  ];

  let input = path.join(location, main);
  if (!fs.existsSync(input)) {
    input = path.join(location, "src", "index.js");
  }

  if (type === "compress") {
    return {
      input,
      output: [
        {
          name: "o3",
          file: path.join(location, pkg.browser),
          format: "umd",
          sourcemap: true
        }
      ],
      plugins: [...commonPlugins, terser()]
    };
  }
  if (isMiniProgram) {
    return {
      input,
      output: [
        {
          format: "cjs",
          file: path.join(location, "dist/miniprogram.js"),
          sourcemap: true
        }
      ],
      external: Object.keys(pkg.dependencies || {})
        .concat("@alipay/o3-adapter-miniprogram")
        .map(name => `${name}/dist/miniprogram`),
      plugins: [...commonPlugins, ...miniProgramPlugin]
    };
  }
  const external = name === "o3-plus" ? {} : Object.keys(pkg.dependencies || {});
  // const external = Object.keys(pkg.dependencies || {});

  return {
    input,
    external,
    output: [
      {
        format: "cjs",
        file: path.join(location, pkg.main),
        sourcemap: true
      },
      {
        file: path.join(location, pkg.module),
        format: "es",
        sourcemap: true
      }
    ],
    plugins: [...commonPlugins]
  };
}
