import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { PUGC_UNSUPPORTED_ASSET_EXTENSIONS } from "./project-assets.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const worldDirectory = resolve(scriptDirectory, "..");
const repoRoot = resolve(worldDirectory, "..");
const outputDirectory = resolve(worldDirectory, "dist/seed-world-flash-app");
const seedWorldProjectRelative = "packages/terrain/src/data/seed-world/project.json";
const seedWorldCatalogRelative = "packages/terrain/src/data/seed-world/public/production-catalog.json";
const plantSpeciesRelative =
  "packages/vegetation/src/asset-assembly/generated/procedural-trees/plant-project-plant-species.json";
const plantCatalogRelative =
  "packages/vegetation/src/asset-assembly/generated/procedural-trees/plant-project-production-catalog.json";

const requiredClassicWorkers = Object.freeze([
  { label: "WorldPlanning", pattern: /^WorldPlanning\.worker-[a-f0-9]+\.js$/u },
  { label: "BuildingWorker", pattern: /^BuildingWorker-[a-f0-9]+\.js$/u },
  { label: "PlanningRaster", pattern: /^PlanningRaster\.worker-[a-f0-9]+\.js$/u },
  { label: "RiverCompileWorker", pattern: /^RiverCompileWorker-[a-f0-9]+\.js$/u },
  { label: "RuntimeScriptCompiler", pattern: /^RuntimeScriptCompiler\.worker-[a-f0-9]+\.js$/u },
  { label: "AgentChecker", pattern: /^AgentChecker\.worker-[a-f0-9]+\.js$/u },
  { label: "AgentScript", pattern: /^AgentScript\.worker-[a-f0-9]+\.js$/u },
  { label: "ProjectRegex", pattern: /^ProjectRegex\.worker-[a-f0-9]+\.js$/u },
  { label: "Retrieval", pattern: /^Retrieval\.worker-[a-f0-9]+\.js$/u }
]);

ensurePreparedEngine();

run(
  process.execPath,
  [resolve(worldDirectory, "node_modules/vite/bin/vite.js"), "build", "--config", "vite.config.mjs"],
  worldDirectory,
  {
    ...process.env,
    WORLD_FLASH_APP: "1",
    WORLD_OUT_DIR: outputDirectory
  }
);

const inspection = inspectFlashAppBuild(outputDirectory);
console.log(
  `Seed World Flash App ready at ${outputDirectory} ` +
    `(${inspection.fileCount} files, ${formatBytes(inspection.totalBytes)})`
);

function ensurePreparedEngine() {
  const shaderEntry = resolve(repoRoot, "packages/modify/.cache/shaders.ts");
  if (!existsSync(shaderEntry)) {
    throw new Error("Missing packages/modify/.cache/shaders.ts. Run `pnpm --dir world prepare:engine` first.");
  }
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function inspectFlashAppBuild(outputRoot) {
  const indexPath = resolve(outputRoot, "index.html");
  if (!existsSync(indexPath)) throw new Error(`Flash App build is missing ${indexPath}`);

  const indexHtml = readFileSync(indexPath, "utf8");
  if (/\b(?:src|href)=["']\/assets\//u.test(indexHtml)) {
    throw new Error("Flash App index.html contains root-absolute asset URLs");
  }
  if (/\b(?:src|href)=["']\.\.\//u.test(indexHtml)) {
    throw new Error("Flash App index.html contains parent-escaping asset URLs; entry HTML must sit at output root");
  }
  if (!/\bsrc=["']\.\/assets\/[^"']+\.js["']/u.test(indexHtml)) {
    throw new Error("Flash App index.html does not reference a ./assets/*.js entry module");
  }

  const assetsRoot = resolve(outputRoot, "assets");
  if (!existsSync(assetsRoot)) throw new Error(`Flash App build is missing ${assetsRoot}`);
  const assetNames = readdirSync(assetsRoot).filter((name) => statSync(resolve(assetsRoot, name)).isFile());
  assertClassicWorkerPayloads(assetsRoot, assetNames);

  const grasslandsOutput = resolve(outputRoot, "packages/terrain/src/data/grasslands");
  if (existsSync(grasslandsOutput)) {
    throw new Error(`Flash App build unexpectedly includes unrelated Grasslands data: ${grasslandsOutput}`);
  }

  const emittedProjectPath = resolve(outputRoot, seedWorldProjectRelative);
  if (!existsSync(emittedProjectPath)) {
    throw new Error(`Flash App build is missing Seed World Project manifest: ${seedWorldProjectRelative}`);
  }
  const sourceProject = JSON.parse(readFileSync(resolve(repoRoot, seedWorldProjectRelative), "utf8"));
  const emittedProject = JSON.parse(readFileSync(emittedProjectPath, "utf8"));
  if (emittedProject.scene !== sourceProject.scene) {
    throw new Error(`Seed World Project scene mismatch: ${emittedProject.scene} !== ${sourceProject.scene}`);
  }
  assertManifestFiles(dirname(emittedProjectPath), emittedProject.files, outputRoot, "Seed World Project");
  for (const entry of emittedProject.files) {
    if (typeof entry.virtualPath === "string" && entry.virtualPath.endsWith(".treewind.wasm")) {
      throw new Error(`Seed World Project rewrote virtualPath instead of physical path: ${entry.virtualPath}`);
    }
  }

  const emittedCatalogPath = resolve(outputRoot, seedWorldCatalogRelative);
  if (!existsSync(emittedCatalogPath)) {
    throw new Error(`Flash App build is missing production catalog: ${seedWorldCatalogRelative}`);
  }
  const emittedCatalog = JSON.parse(readFileSync(emittedCatalogPath, "utf8"));
  assertManifestFiles(
    dirname(emittedCatalogPath),
    emittedCatalog.generatedResources,
    outputRoot,
    "production asset catalog"
  );

  for (const { relative: requiredRelative, virtualPath } of [
    { relative: plantSpeciesRelative, virtualPath: "World/Vegetation/plant-species.json" },
    { relative: plantCatalogRelative, virtualPath: "World/Vegetation/production-catalog.json" }
  ]) {
    const mappedEntry = emittedProject.files.find((entry) => entry?.virtualPath === virtualPath);
    if (mappedEntry && typeof mappedEntry.path === "string" && /^https:\/\//i.test(mappedEntry.path)) {
      continue;
    }
    const target = resolve(outputRoot, requiredRelative);
    if (!existsSync(target) || !statSync(target).isFile() || statSync(target).size === 0) {
      throw new Error(`Flash App build is missing procedural plant manifest: ${requiredRelative}`);
    }
  }

  let fileCount = 0;
  let totalBytes = 0;
  const unoffloadedCdnWarnings = [];
  walkFiles(outputRoot, (filePath) => {
    const extension = extname(filePath).toLowerCase();
    if (PUGC_UNSUPPORTED_ASSET_EXTENSIONS.has(extension)) {
      throw new Error(`Flash App build contains an asset extension that PUGC will not publish: ${filePath}`);
    }
    const rel = filePath.slice(outputRoot.length + 1).split(sep).join("/");
    if (
      /^assets\/seed-world-project-text-bundle-[a-f0-9]+\.json$/u.test(rel) ||
      /^assets\/esbuild-[a-f0-9]+\.wasm$/u.test(rel)
    ) {
      unoffloadedCdnWarnings.push(rel);
    }
    fileCount += 1;
    totalBytes += statSync(filePath).size;
  });
  if (unoffloadedCdnWarnings.length > 0) {
    console.warn(
      `[seed-world-flash-app] Local CDN-eligible asset(s) not yet in flash-app-cdn-manifest.json: ` +
        `${unoffloadedCdnWarnings.join(", ")}. Run \`sync-flash-app-cdn-assets.py --apply\` and rebuild to serve them from mdn.alipayobjects.com.`
    );
  }
  return { fileCount, totalBytes };
}

function assertClassicWorkerPayloads(assetsRoot, assetNames) {
  const jsAssetNames = assetNames.filter((name) => name.endsWith(".js"));
  const referencedWorkers = new Set();
  for (const assetName of jsAssetNames) {
    const source = readFileSync(resolve(assetsRoot, assetName), "utf8");
    if (/new Worker\([^;]*\{\s*type:\s*["']module["']\s*\}/u.test(source)) {
      throw new Error(`Flash App build still contains a module Worker constructor in ${assetName}`);
    }
    if (source.includes("__SEED_WORLD_PROJECT_TEXT_BUNDLE_URL__")) {
      throw new Error(`Flash App build did not replace __SEED_WORLD_PROJECT_TEXT_BUNDLE_URL__ in ${assetName}`);
    }
    const relativeSelfLocationMatch = source.match(
      /new URL\(\s*["'](?![a-z]+:)[^"']+["']\s*,\s*self\.location(?:\.href)?\s*\)/u
    );
    if (relativeSelfLocationMatch) {
      throw new Error(
        `Flash App chunk ${assetName} resolves a relative URL against self.location (${relativeSelfLocationMatch[0]}), which fails in about:srcdoc and split-origin CDN deployments`
      );
    }
    for (const match of source.matchAll(
      /__flashAppCreateClassicWorker\(\s*new URL\(\s*(["'])([^"']+)\1\s*,\s*import\.meta\.url\s*\)\.href\s*\)/gu
    )) {
      referencedWorkers.add(match[2]);
    }
  }
  if (referencedWorkers.size === 0) {
    throw new Error("Flash App build contains no classic-shimmed Worker references");
  }
  for (const workerFile of referencedWorkers) {
    const workerPath = resolve(assetsRoot, workerFile);
    if (!existsSync(workerPath) || !statSync(workerPath).isFile()) {
      throw new Error(`Flash App build references missing Worker file: ${workerFile}`);
    }
    const payload = readFileSync(workerPath, "utf8");
    try {
      new Script(payload, { filename: workerFile });
    } catch (error) {
      throw new Error(`Flash App Worker ${workerFile} is not valid classic JavaScript`, { cause: error });
    }
    if (/,\s*self\.location\.href\s*\)/u.test(payload)) {
      throw new Error(`Flash App Worker ${workerFile} still resolves relative URLs against bare self.location.href`);
    }
  }
  const missingWorkers = requiredClassicWorkers
    .filter(({ pattern }) => ![...referencedWorkers].some((name) => pattern.test(name)))
    .map(({ label }) => label);
  if (missingWorkers.length > 0) {
    throw new Error(`Flash App build is missing required classic Workers: ${missingWorkers.join(", ")}`);
  }
}

function assertManifestFiles(manifestDirectory, entries, outputRoot, label) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`Flash App ${label} requires a non-empty array`);
  }
  for (const entry of entries) {
    if (!entry || typeof entry.path !== "string" || entry.path.length === 0) {
      throw new Error(`Flash App ${label} contains an invalid asset path`);
    }
    if (/^[a-z]+:/i.test(entry.path)) continue;
    const resolved = resolve(manifestDirectory, entry.path);
    if (!resolved.startsWith(`${outputRoot}${sep}`) || !existsSync(resolved) || !statSync(resolved).isFile()) {
      throw new Error(`Flash App build is missing ${label} asset: ${entry.path}`);
    }
    if (statSync(resolved).size === 0) {
      throw new Error(`Flash App build emitted an empty ${label} asset: ${entry.path}`);
    }
  }
}

function walkFiles(directory, visit) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, visit);
    else if (entry.isFile()) visit(fullPath);
  }
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
