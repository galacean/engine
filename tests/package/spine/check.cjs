// Run after `npm run build`. Uses actual packed artifacts in a clean directory, outside the workspace.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const { rollup } = require("rollup");
const resolve = require("@rollup/plugin-node-resolve").default;
const commonjs = require("@rollup/plugin-commonjs");
const { chromium } = require("@playwright/test");

const root = path.resolve(__dirname, "../../..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "galacean-spine-packages-"));
const packs = path.join(temp, "packs");
fs.mkdirSync(packs);
const workspace = new Map();
for (const directory of fs.readdirSync(path.join(root, "packages"))) {
  const location = path.join(root, "packages", directory);
  const file = path.join(location, "package.json");
  if (fs.existsSync(file)) {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    workspace.set(manifest.name, { location, manifest });
  }
}
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: "pipe", shell: process.platform === "win32" });
const tarballs = new Map();
function dependenciesFor(names, result = new Set()) {
  for (const name of names) {
    if (result.has(name) || !workspace.has(name)) continue;
    result.add(name);
    const { manifest } = workspace.get(name);
    dependenciesFor(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }), result);
  }
  return result;
}
function pack(name) {
  if (tarballs.has(name)) return tarballs.get(name);
  const { location, manifest } = workspace.get(name);
  run("pnpm", ["pack", "--pack-destination", packs], location);
  const file = path.join(packs, `${name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`);
  assert(fs.existsSync(file));
  tarballs.set(name, file);
  return file;
}
function install(versions, directory) {
  const names = dependenciesFor(["@galacean/engine-spine", ...versions.map((v) => `@galacean/engine-spine-core-${v}`)]);
  const dependencies = Object.fromEntries([...names].map((name) => [name, `file:${pack(name)}`]));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "spine-package-consumer", private: true, version: "1.0.0", dependencies })
  );
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], directory);
}
function diagnostics(file) {
  const program = ts.createProgram([file], {
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    types: []
  });
  return ts.getPreEmitDiagnostics(program).map((d) => ({
    file: d.file?.fileName,
    code: d.code,
    start: d.start,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n")
  }));
}
function checkTypes(directory, versions) {
  const consumer = path.join(directory, "consumer.ts");
  fs.writeFileSync(
    consumer,
    versions
      .map(
        (v) => `import { Spine${v.replace(".", "")}Runtime } from "@galacean/engine-spine-core-${v}";
registerSpineRuntime(new Spine${v.replace(".", "")}Runtime());
// @ts-expect-error Native classes are not exported by backend packages.
import { Skeleton as Native${v.replace(".", "")} } from "@galacean/engine-spine-core-${v}";`
      )
      .join("\n") +
      "\n" +
      fs.readFileSync(path.join(__dirname, "consumer.ts"), "utf8")
  );
  assert.deepEqual(diagnostics(consumer), [], "Published Spine types must compile without errors");
  console.log(`Types ${versions.join("+") || "shared"}: PASS (strict, skipLibCheck=false)`);
}

async function checkSingleBackendBundle(directory, version) {
  const other = version === "3.8" ? "4.2" : "3.8";
  const entry = path.join(directory, "single-backend.js");
  fs.writeFileSync(
    entry,
    `import { registerSpineRuntime } from '@galacean/engine-spine';
import { Spine${version.replace(".", "")}Runtime } from '@galacean/engine-spine-core-${version}';
registerSpineRuntime(new Spine${version.replace(".", "")}Runtime());`
  );
  const bundle = await rollup({
    input: entry,
    plugins: [resolve({ mainFields: ["module", "main"] }), commonjs()],
    onwarn(warning, warn) {
      if (warning.code === "UNRESOLVED_IMPORT") throw new Error(warning.message);
      if (warning.code !== "CIRCULAR_DEPENDENCY") warn(warning);
    }
  });
  const { output } = await bundle.generate({ format: "es" });
  assert(!bundle.cache.modules.some((module) => module.id.includes(`engine-spine-core-${other}`)));
  assert(
    !bundle.cache.modules.some((module) => /node_modules[\\/]@galacean[\\/]engine-design[\\/]/.test(module.id)),
    "Type-only contracts must not introduce engine-design runtime imports"
  );
  assert(
    !output.some((chunk) => chunk.type === "chunk" && chunk.code.includes(`Spine${other.replace(".", "")}Runtime`))
  );
  await bundle.close();
  console.log(`Bundle ${version}: PASS (unused backend absent)`);
}

async function checkWorkspaceBundle() {
  // Resolve from an actual workspace consumer so symlink realpaths are exercised.
  const entry = path.join(root, "examples", "spine-package-consumer.js");
  for (const mainFields of [["module", "main"], ["main"]]) {
    const bundle = await rollup({
      input: entry,
      external: ["@galacean/engine"],
      plugins: [
        {
          name: "spine-workspace-consumer",
          resolveId(id) {
            if (id === entry) return id;
          },
          load(id) {
            if (id === entry)
              return `import { registerSpineRuntime } from '@galacean/engine-spine';
import { Spine38Runtime } from '@galacean/engine-spine-core-3.8';
import { Spine42Runtime } from '@galacean/engine-spine-core-4.2';
registerSpineRuntime(new Spine38Runtime());
registerSpineRuntime(new Spine42Runtime());`;
          }
        },
        resolve({ mainFields }),
        commonjs()
      ],
      onwarn(warning, warn) {
        if (warning.code === "UNRESOLVED_IMPORT") throw new Error(warning.message);
        if (warning.code !== "CIRCULAR_DEPENDENCY") warn(warning);
      }
    });
    await bundle.generate({ format: "es" });
    await bundle.close();
    console.log(`Workspace ${mainFields[0]}: PASS`);
  }
}

async function checkBrowser(directory, first, format, baseURL) {
  const second = first === "3.8" ? "4.2" : "3.8";
  const entry = path.join(directory, `entry-${first}-${format}.js`);
  const output = path.join(directory, `bundle-${first}-${format}`);
  const source = fs
    .readFileSync(path.join(__dirname, "browser.js"), "utf8")
    .replaceAll("__FIRST__", first)
    .replaceAll("__SECOND__", second);
  fs.writeFileSync(entry, source);
  const bundle = await rollup({
    input: entry,
    preserveEntrySignatures: false,
    plugins: [resolve({ mainFields: format === "esm" ? ["module", "main"] : ["main"] }), commonjs()],
    onwarn(warning, warn) {
      if (warning.code !== "CIRCULAR_DEPENDENCY") warn(warning);
    }
  });
  await bundle.write({ dir: output, format: "es", entryFileNames: "entry.js" });
  await bundle.close();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(baseURL);
    await page.addScriptTag({
      type: "module",
      url: `${baseURL}/${path.relative(temp, output).split(path.sep).join("/")}/entry.js`
    });
    await page.waitForFunction(() => window.result, null, { timeout: 30000 });
    const result = await page.evaluate(() => window.result);
    assert(!result.error, result.error);
    console.log(`Browser ${format} ${first}->${second}: PASS ${JSON.stringify(result)}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  await checkWorkspaceBundle();
  const shared = path.join(temp, "shared");
  install([], shared);
  checkTypes(shared, []);
  for (const version of ["3.8", "4.2"]) {
    const directory = path.join(temp, version);
    install([version], directory);
    checkTypes(directory, [version]);
    await checkSingleBackendBundle(directory, version);
    const lock = JSON.parse(fs.readFileSync(path.join(directory, "package-lock.json"), "utf8"));
    const installed = Object.keys(lock.packages);
    const other = version === "3.8" ? "4.2" : "3.8";
    assert(!installed.some((name) => name.endsWith(`engine-spine-core-${other}`)));
    if (version === "3.8") assert(!installed.some((name) => name.endsWith("@esotericsoftware/spine-core")));
    console.log(`Install ${version}: PASS (unused backend absent)`);
  }
  const both = path.join(temp, "both");
  install(["3.8", "4.2"], both);
  checkTypes(both, ["3.8", "4.2"]);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end("<body></body>");
      return;
    }
    const file = url.pathname.startsWith("/fixtures/")
      ? path.join(root, "tests/src/spine", url.pathname.slice(1))
      : path.join(temp, url.pathname.slice(1));
    if (!fs.existsSync(file)) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : file.endsWith(".png") ? "image/png" : "text/plain"
    );
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const first of ["3.8", "4.2"])
      for (const format of ["esm", "cjs"]) {
        await checkBrowser(both, first, format, `http://127.0.0.1:${server.address().port}`);
      }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  fs.rmSync(temp, { recursive: true, force: true });
})().catch((error) => {
  console.error(error);
  console.error(`Failed consumer artifacts retained at ${temp}`);
  process.exitCode = 1;
});
