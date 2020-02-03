const fs = require("fs");
const path = require("path");
const rollup = require("rollup");
const ts = require("typescript");

const resolve = require("rollup-plugin-node-resolve");
const commonjs = require("rollup-plugin-commonjs");
const babel = require("rollup-plugin-babel");
const string = require("@ali/rollup-plugin-string");

const extensions = [".js", ".jsx", ".ts", ".tsx"];

const cwd = process.cwd();

function buildPackage(packageName) {
  console.time(`build ${packageName} cost`);
  // create a bundle
  const location = path.join(cwd, "packages", packageName);
  const pkg = require(path.join(location, "package.json"));
  const external = pkg.dependencies ? Object.keys(pkg.dependencies) : [];
  const input = path.join(location, "src", "index.ts");
  if (!fs.existsSync(input)) {
    console.log(`${packageName} doesn't have an input`);
    return;
  }

  const mainFile = pkg.main ? path.join(location, pkg.main) : null;
  const esFile = pkg.module ? path.join(location, pkg.module) : null;

  const inputOptions = {
    input,
    external,
    plugins: [
      resolve({ extensions, preferBuiltins: true }),
      string({
        include: /\.glsl$/
      }),
      babel({
        extensions,
        exclude: ["node_modules/**", "packages/**/node_modules/**"]
      }),
      commonjs()
    ]
  };

  // rollup.rollup(inputOptions);
  return rollup
    .rollup(inputOptions)
    .then(bundle => {
      const promises = [];
      if (mainFile) {
        promises.push(
          bundle.write({
            file: mainFile,
            format: "cjs"
          })
        );
      } else {
        console.log(`${packageName} main is null`);
      }

      if (esFile) {
        promises.push(
          bundle.write({
            file: mainFile,
            format: "cjs"
          })
        );
      } else {
        console.log(`${packageName} module is null`);
      }
      Promise.all(promises);
    })
    .then(() => console.timeEnd(`build ${packageName} cost`))
    .catch(e => {
      console.error(e);
    });
  // or write the bundle to disk
}

const { Worker, isMainThread, parentPort } = require("worker_threads");

if (!isMainThread) {
  parentPort.once("message", pkgs => {
    pkgs.forEach(buildPackage);
  });
} else {
  const dirs = fs.readdirSync(path.join(cwd, "packages"));

  function buildDirs(dirs) {
    const worker = new Worker(__filename);
    worker.postMessage(dirs);
  }

  const parts = 6;
  const partLength = Math.floor(dirs.length / parts);
  for (let i = 0; i < parts - 1; i++) {
    const dirs0 = dirs.splice(0, partLength);
    buildDirs(dirs0);
  }

  dirs.forEach(buildPackage);
}
