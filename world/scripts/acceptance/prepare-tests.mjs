import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = path.resolve(process.env.ENGINE_NEXT_SOURCE || path.join(root, "../engine-next"));
const gallery = path.join(source, "world/gallery");
const output = path.join(root, "world/.acceptance/tests");
fs.mkdirSync(output, { recursive: true });
const mapping = JSON.parse(fs.readFileSync(path.join(root, "world/migration/files.json"), "utf8"));
for (const [old, current] of Object.entries(mapping)) {
  const destination = path.join(output, old);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination) || fs.lstatSync(destination, { throwIfNoEntry: false })) fs.unlinkSync(destination);
  fs.symlinkSync(path.join(root, current), destination);
}
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else {
      const relative = path.relative(gallery, file);
      if (
        relative
          .split(path.sep)
          .some((part) => ["tests", "project-tests", "fixtures", "__tests__", "e2e"].includes(part)) ||
        /vitest.*\.config\.[cm]?[jt]s$/.test(relative)
      ) {
        if (relative in mapping) continue;
        const destination = path.join(output, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(file, destination);
      }
    }
  }
}
walk(gallery);
// Data used only as unit-test reference measurements, not runtime code.
for (const relative of [
  "shared/farming/procedural/tools/farmlands/profiles.json",
  "shared/farming/procedural/tools/farmlands/conversion-report.json"
]) {
  const destination = path.join(output, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(gallery, relative), destination);
}
// Captured building data is a test fixture only; it is not a runtime dependency.
fs.cpSync(
  path.join(gallery, "shared/tiny-glade/assets/original"),
  path.join(output, "shared/tiny-glade/assets/original"),
  { recursive: true }
);
const packageLink = path.resolve(output, "../packages");
if (!fs.existsSync(packageLink)) fs.symlinkSync(path.join(root, "packages"), packageLink, "dir");

fs.writeFileSync(
  path.join(output, "package.json"),
  JSON.stringify({ name: "world-migration-test-view", private: true, type: "module" })
);
// This is a test-only view: implementation files point to the migrated packages,
// while old tests and fixtures retain their relative paths. Missing excluded code
// must fail explicitly; never fall back to the source implementation.
console.log(output);

// Native override tests must resolve direct relative package imports in the target checkout.
fs.cpSync(
  path.join(source, "world/.materialized/engine/tests/src"),
  path.join(root, "world/.acceptance/engine-tests/src"),
  { recursive: true }
);
// Source-contract tests read the effective Engine too, including newly added modules.
const nativeView = path.join(root, "world/.acceptance/packages");
if (fs.lstatSync(nativeView).isSymbolicLink()) fs.unlinkSync(nativeView);
fs.mkdirSync(nativeView, { recursive: true });
const nativeNames = new Set(["core", "loader", "rhi-webgl", "shader", "galacean"]);
function mirror(sourcePath, targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
  for (const e of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    const a = path.join(sourcePath, e.name),
      b = path.join(targetPath, e.name);
    if (e.isDirectory()) mirror(a, b);
    else if (!fs.existsSync(b)) fs.symlinkSync(a, b);
  }
}
for (const name of fs.readdirSync(path.join(root, "packages"))) {
  const a = path.join(root, "packages", name),
    b = path.join(nativeView, name);
  if (!nativeNames.has(name)) {
    if (!fs.existsSync(b)) fs.symlinkSync(a, b);
    continue;
  }
  fs.mkdirSync(b, { recursive: true });
  mirror(path.join(a, "src"), path.join(b, "src"));
  for (const entry of ["package.json", "dist", "types", "libs"])
    if (fs.existsSync(path.join(a, entry)) && !fs.existsSync(path.join(b, entry)))
      fs.symlinkSync(path.join(a, entry), path.join(b, entry));
}
for (const { original, replacement } of JSON.parse(
  fs.readFileSync(path.join(root, "packages/modify/native-overrides.json"))
)) {
  const dest = path.join(nativeView, original.slice("packages/".length));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.symlinkSync(path.join(root, replacement), dest);
}
// Node compiler subprocesses cannot use the Vite resolver. Publish the effective
// raw shader inputs into the test view so CLI compilation exercises engine-modify.
const shaderPackage = path.join(root, "world/.acceptance/node_modules/@galacean/engine-shader");
fs.mkdirSync(shaderPackage, { recursive: true });
const shaderInputs = path.join(root, "packages/modify/.cache/shader-src");
const shaderLibrary = [],
  shaders = [];
function collectRaw(directory) {
  for (const e of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, e.name);
    if (e.isDirectory()) collectRaw(file);
    else if (/\.(glsl|shader)$/.test(e.name))
      (e.name.endsWith(".glsl") ? shaderLibrary : shaders).push({
        path: path.relative(shaderInputs, file).split(path.sep).join("/"),
        source: fs.readFileSync(file, "utf8")
      });
  }
}
collectRaw(shaderInputs);
fs.writeFileSync(
  path.join(shaderPackage, "package.json"),
  JSON.stringify({ name: "@galacean/engine-shader", type: "module", exports: { "./sources": "./sources.mjs" } })
);
fs.writeFileSync(
  path.join(shaderPackage, "sources.mjs"),
  "export const shaderLibrary=" +
    JSON.stringify(shaderLibrary) +
    ";\nexport const shaders=" +
    JSON.stringify(shaders) +
    ";\n"
);

// Vitest browser helpers are peer dependencies of Vitest, not product dependencies.
const requireFromVitest = createRequire(createRequire(import.meta.url).resolve("vitest/package.json"));
const browserPackage = path.dirname(requireFromVitest.resolve("@vitest/browser/package.json"));
const browserLink = path.join(root, "world/.acceptance/node_modules/@vitest/browser");
fs.mkdirSync(path.dirname(browserLink), { recursive: true });
if (!fs.existsSync(browserLink)) fs.symlinkSync(browserPackage, browserLink);
