const fs = require("fs");
const path = require("path");
import { promisify } from "util";

import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import babel from "rollup-plugin-babel";
import string from "@ali/rollup-plugin-string";
import { terser } from "rollup-plugin-terser";
import miniProgramPlugin from "./rollup.miniprogram.plugin";
import visualizer from "rollup-plugin-visualizer";
const readFile = promisify(fs.readFile);
const camelCase = require("camelcase");

const { LERNA_PACKAGE_NAME, PWD, NODE_ENV } = process.env;
const isMiniProgram = NODE_ENV === "MINIPROGRAM";

let fileDirs;
let excludeDirs = ["o3-examples", "component-miniprogram", "o3-plus"];
if (!LERNA_PACKAGE_NAME) {
  console.log("build all");
  const pkgDir = path.join(__dirname, "packages");

  fileDirs = fs
    .readdirSync(pkgDir)
    .filter((f) => fs.statSync(path.join(pkgDir, f)).isDirectory() && excludeDirs.indexOf(f) === -1);
} else {
  const dirname = path.basename(PWD);
  fileDirs = [dirname];
}

const pkg = (name, type) => {
  const location = path.resolve(__dirname, "packages", name);
  let main = path.join("src", "index.ts");
  return makeRollupConfig({ location, main, name, type });
};

let promises = [...fileDirs.map((name) => pkg(name, "module"))];

if (NODE_ENV === "BUILD") {
  const compressDir = ["o3", "framebuffer-picker", "free-controls", "orbit-controls", "post-processing", "tween"];
  promises = [...compressDir.map((name) => pkg(name, "compress"))];
}

function toGlobalName(pkgName) {
  return camelCase(pkgName.replace("@alipay/", ""));
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
      include: [/\.glsl$/, "packages/**/worker/**/*.js"]
    }),
    babel({
      extensions,
      runtimeHelpers: true,
      exclude: ["node_modules/**", "packages/**/node_modules/**"]
    }),
    commonjs()
  ];

  let input = path.join(location, main);
  if (!fs.existsSync(input)) {
    input = path.join(location, "src", "index.js");
  }

  if (type === "compress") {
    let external = name === "o3" ? {} : Object.keys(pkg.dependencies || {});
    const globalName = toGlobalName(pkg.name);
    console.log(globalName);
    console.log(pkg.browser);
    return {
      input,
      external,
      output: [
        {
          name: globalName,
          file: path.join(location, pkg.browser),
          format: "umd",
          sourcemap: false,
          globals: {
            "@alipay/o3": "o3"
          }
        }
      ],
      plugins: [...commonPlugins, terser(), visualizer()]
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
        .map((name) => `${name}/dist/miniprogram`),
      plugins: [...commonPlugins, ...miniProgramPlugin]
    };
  }
  // const external = name === "o3-plus" ? {} : Object.keys(pkg.dependencies || {});
  const external = Object.keys(pkg.dependencies || {});
  const output = [
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
  ];

  return {
    input,
    external,
    output,
    plugins: [...commonPlugins]
  };
}
