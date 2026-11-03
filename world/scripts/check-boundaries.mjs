import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const names = ["terrain", "water", "animals", "building", "farming", "vegetation", "environment", "ai-chat", "project", "runtime-editor", "world-planning", "modify"];
const packages = new Map(names.map(name => [`@galacean/engine-${name}`, path.join(root, "packages", name)]));
const errors = [];
const manifests = new Map([...packages].map(([name, directory]) => [name, JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"))]));
const demoRoot = path.join(root, "world/demos") + path.sep;
const demoOwner = file => file.startsWith(demoRoot) ? path.relative(demoRoot, file).split(path.sep)[0] : undefined;
const graph = new Map(names.map(name => [name, new Set()]));
function* files(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", ".cache"].includes(entry.name) || entry.name === "native" && directory.endsWith("/modify/src")) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) yield file;
  }
}
function resolve(stem) {
  return [stem, ...[".ts", ".tsx", ".d.ts", ".js", ".json", "/index.ts", "/index.js"].map(ext => stem + ext)]
    .find(file => fs.existsSync(file) && fs.statSync(file).isFile());
}
for (const directory of [...packages.values(), path.join(root, "world/demos")]) {
  for (const file of files(directory)) {
    const owner = names.find(name => file.startsWith(path.join(root, "packages", name) + path.sep));
    for (const { fileName: raw } of ts.preProcessFile(fs.readFileSync(file, "utf8"), true, true).importedFiles) {
      const specifier = raw.split("?")[0];
      let target;
      if (specifier.startsWith(".")) target = resolve(path.resolve(path.dirname(file), specifier));
      else {
        const packageName = [...packages.keys()].find(name => specifier === name || specifier.startsWith(name + "/"));
        if (!packageName) continue;
        const dependency = packageName.slice("@galacean/engine-".length);
        if (owner && dependency !== owner) {
          graph.get(owner).add(dependency);
          const manifest = manifests.get(`@galacean/engine-${owner}`);
          if (!manifest.dependencies?.[packageName] && !manifest.devDependencies?.[packageName]) errors.push(`${owner}: undeclared dependency ${packageName}`);
        }
        target = resolve(path.join(packages.get(packageName), "src", specifier === packageName ? "index" : specifier.slice(packageName.length + 1)));
      }
      if (!target) errors.push(`${path.relative(root, file)}: cannot resolve ${raw}`);
      else if (owner && target.startsWith(path.join(root, "world") + path.sep)) errors.push(`${owner} imports a Demo: ${raw}`);
      else if (demoOwner(file) && demoOwner(target) && demoOwner(file) !== demoOwner(target)) errors.push(`${path.relative(root, file)} imports another Demo: ${raw}`);
    }
  }
}
function visit(name, chain = []) {
  if (chain.includes(name)) { errors.push(`Package cycle: ${[...chain, name].join(" -> ")}`); return; }
  for (const next of graph.get(name)) visit(next, [...chain, name]);
}
for (const name of names) visit(name);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exitCode = 1;
} else console.log("Package imports resolve; declared dependencies match; no package or other Demo imports a Demo; package graph is acyclic.");
