import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const output = path.join(root, "packages/modify/.cache/engine");
const names = [
  "core",
  "design",
  "galacean",
  "loader",
  "math",
  "physics-physx",
  "rhi-webgl",
  "shader",
  "shader-compiler",
  "ui"
];
// Only this script-owned staging directory is replaced. Never build in the native checkout.
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of ["package.json", "rollup.config.js", "tsconfig.base.json"]) {
  fs.copyFileSync(path.join(root, name), path.join(output, name));
}
fs.writeFileSync(path.join(output, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
for (const name of names) {
  fs.cpSync(path.join(root, "packages", name), path.join(output, "packages", name), {
    recursive: true,
    filter: (source) =>
      !["node_modules", "dist", "types", "compiledShaders", "bundler"].includes(
        path.relative(path.join(root, "packages", name), source).split(path.sep)[0]
      )
  });
}
for (const { original, replacement } of JSON.parse(
  fs.readFileSync(path.join(root, "packages/modify/native-overrides.json"))
)) {
  if (!names.includes(original.split("/")[1])) continue;
  const target = path.join(output, original);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, replacement), target);
}
// Replacement particle exports intentionally omit newer native-only modules. Emit declarations
// from the same public entry graph as Rollup, rather than orphaned implementation files.
const coreConfigPath = path.join(output, "packages/core/tsconfig.json");
const coreConfig = JSON.parse(fs.readFileSync(coreConfigPath));
coreConfig.include = ["src/index.ts"];
fs.writeFileSync(coreConfigPath, JSON.stringify(coreConfig, null, 2));
// Reuse installed tooling without installing or accidentally resolving workspace packages to native sources.
function linkDependencies(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source)) {
    if (entry === "@galacean") continue;
    fs.symlinkSync(path.join(source, entry), path.join(target, entry));
  }
  fs.mkdirSync(path.join(target, "@galacean"), { recursive: true });
  for (const name of names) {
    const pkg = JSON.parse(fs.readFileSync(path.join(output, "packages", name, "package.json")));
    fs.symlinkSync(path.join(output, "packages", name), path.join(target, pkg.name));
  }
}
linkDependencies(path.join(root, "node_modules"), path.join(output, "node_modules"));
for (const name of names) {
  const source = path.join(root, "packages", name, "node_modules");
  linkDependencies(
    fs.existsSync(source) ? source : path.join(root, "node_modules"),
    path.join(output, "packages", name, "node_modules")
  );
}
for (const script of ["b:module", "b:types"]) execFileSync("pnpm", ["run", script], { cwd: output, stdio: "inherit" });
fs.writeFileSync(path.join(output, "local-engine.json"), JSON.stringify({ source: root, packages: names }, null, 2));
console.log(`Local Engine ready: ${output}`);
