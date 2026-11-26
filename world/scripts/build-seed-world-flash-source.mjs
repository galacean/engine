import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DEFAULT_FLASH_APPS_CATALOG_RELATIVE, loadFlashAppsCatalog } from "./flash-app-variants.mjs";
import { restoreFlashSourceEngine, stageFlashSourceEngine } from "./seed-world-flash-source-layout.mjs";

const vitePackagePath = createRequire(import.meta.url).resolve("vite/package.json");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const worldDirectory = resolve(scriptDirectory, "..");
const repoRoot = resolve(worldDirectory, "..");
const outputDirectory = resolve(worldDirectory, "dist/seed-world-flash-source");
const archivePath = resolve(worldDirectory, "dist/seed-world-flash-source.tar.gz");
const verificationOutput = resolve(worldDirectory, "dist/seed-world-flash-source-verification");
const referenceVerificationOutput = resolve(worldDirectory, "dist/seed-world-flash-reference-verification");
const runtimeBuildDirectory = resolve(worldDirectory, "dist/seed-world-flash-app");
const maximumArchiveBytes = 100 * 1024 * 1024;

const rootWorkspaceFiles = [".npmrc", "package.json", "package-lock.json", "tsconfig.base.json", "tsconfig.json"];

const worldWorkspacePackages = [
  "ai-chat",
  "animals",
  "building",
  "environment",
  "farming",
  "modify",
  "project",
  "retrieval",
  "runtime-editor",
  "terrain",
  "vegetation",
  "water",
  "world-planning"
];

const nativeEnginePackages = [
  "core",
  "design",
  "galacean",
  "loader",
  "math",
  "physics-physx",
  "rhi-null",
  "rhi-webgl",
  "shader",
  "shader-analyzer",
  "shader-compiler",
  "shader-parser",
  "ui"
];

const excludedDirectoryNames = new Set([".acceptance", ".bootstrap", ".cache", "bundler", "dist", "e2e", "node_modules", "tests", "types"]);

// Keep derived runtime KTX2 textures and provenance manifests; retain authoring PNGs and internal CDN upload helpers only in the authoring repo.
const excludedFiles = new Set([
  "packages/water/src/water/resources/lake/assets/grasslands-water-normal-1024.png",
  "packages/water/src/water/resources/river/assets/farmlands-caustics.png",
  "packages/water/src/water/resources/river/assets/farmlands-wave-large.png",
  "packages/water/src/water/resources/ocean/textures/Normals/SmoothWaves.png",
  "packages/water/src/water/resources/ocean/textures/Normals/RoughWaves.png",
  "packages/water/src/water/resources/ocean/textures/Caustics/Caustics_1.png",
  "packages/water/src/water/resources/ocean/textures/Foam/Foam1.png",
  "packages/water/src/water/resources/ocean/textures/IntersectionNoise.png",
  "world/demos/seed-world/assets/terrain-surface/MicroNormal.png",
  "world/demos/seed-world/assets/terrain-surface/RippleNormal.png",
  "world/scripts/deploy-seed-world-flash-app.mjs",
  "world/scripts/publish-seed-world-flash-apps.mjs",
  "world/scripts/seed-world-flash-registry.py",
  "world/scripts/set-flash-app-cdn-secret.sh",
  "world/scripts/sync-flash-app-cdn-assets.py"
]);

// Offline authoring atlases whose runtime KTX2 textures live in packages/farming/src/farming/assets/plant-textures.
const excludedPathPatterns = [
  /^packages\/farming\/src\/farming\/catalog\/plants\/[^/]+\/procedural\/atlas\.png$/u
];

const requiredWaterResources = [
  "packages/water/src/water/resources/lake/assets/grasslands-water-normal-512.ktx2",
  "packages/water/src/water/resources/lake/assets/manifest.json",
  "packages/water/src/water/resources/river/assets/ktx2-manifest.json",
  "packages/water/src/water/resources/river/assets/ktx2/drops/cloud-linear.ktx2",
  "packages/water/src/water/resources/ocean/textures/Normals/RoughWaves.ktx2"
];

const excludedPrefixes = [
  "packages/terrain/src/data/grasslands",
  "packages/terrain/src/data/seed-world/source",
  "packages/farming/src/farming/assets/prop-textures/source",
  "packages/vegetation/src/asset-assembly/source",
  "packages/vegetation/src/asset-assembly/offline",
  "packages/vegetation/src/asset-assembly/generated/procedural-trees/measured-white-birch",
  "packages/water/src/water/resources/river/assets/drops",
  "world/demos",
  "world/migration",
  "world/scripts/acceptance"
];

const selectiveFiles = new Set([
  "packages/terrain/src/data/seed-world/source/stylized-environment/textures/procedural-leaf-mask-fir.png",
  "packages/vegetation/src/asset-assembly/offline/tree-reconstruction-service.cjs"
]);
const selectivePrefixes = new Set(["world/demos/seed-world"]);

const worldRootEntries = [
  ".gitignore",
  "README.md",
  "assets.d.ts",
  "demos.json",
  "package.json",
  "tsconfig.json",
  "vite.config.mjs",
  "scripts",
  "demos/seed-world"
];

requireRuntimeBuild();
rmSync(outputDirectory, { recursive: true, force: true });
rmSync(archivePath, { force: true });
rmSync(verificationOutput, { recursive: true, force: true });
rmSync(referenceVerificationOutput, { recursive: true, force: true });
mkdirSync(resolve(outputDirectory, "packages"), { recursive: true });
mkdirSync(resolve(outputDirectory, "world/demos"), { recursive: true });

for (const name of rootWorkspaceFiles) {
  copyRepoPath(name);
}
for (const entry of worldRootEntries) {
  copyRepoPath(`world/${entry}`);
}
for (const pkg of [...worldWorkspacePackages, ...nativeEnginePackages]) {
  copyRepoPath(`packages/${pkg}`);
}
stageFlashSourceEngine(repoRoot, outputDirectory);
prepareSnapshotWorkspaceManifests();
verifySnapshotWaterResources();

const gitMeta = readGitMetadata();
const flashAppsCatalog = loadFlashAppsCatalog(resolve(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE));
const runtimeIndexPath = resolve(runtimeBuildDirectory, "index.html");
writeFileSync(resolve(outputDirectory, "REBUILD.md"), createRebuildGuide(gitMeta, flashAppsCatalog));
const preManifestInspection = inspectDirectory(outputDirectory);
const snapshotManifest = {
  schemaVersion: 5,
  purpose: "Seed World Flash App self-contained source snapshot (all 6 templates, standalone npm ci && npm run build)",
  baseCommit: gitMeta.headCommit,
  baseBranch: gitMeta.branch,
  nativeEngineBaseline: readNativeEngineBaseline(),
  runtimeIndexSha256: sha256(runtimeIndexPath),
  flashApps: flashAppsCatalog.apps.map(({ templateId, title, artifactId, reuseExisting }) => ({
    templateId,
    title,
    artifactId,
    reuseExisting
  })),
  verification:
    "independent unminified Flash App Vite builds of the repository and source snapshot must be byte-identical",
  sourceFileCount: preManifestInspection.fileCount + 1,
  sourceBytesBeforeManifest: preManifestInspection.totalBytes,
  maximumCompressedBytes: maximumArchiveBytes,
  worldWorkspacePackages,
  nativeEnginePackages,
  excludedDirectoryNames: [...excludedDirectoryNames].sort(),
  excludedFiles: [...excludedFiles].sort(),
  excludedPrefixes,
  selectiveFiles: [...selectiveFiles].sort(),
  selectivePrefixes: [...selectivePrefixes].sort()
};
writeFileSync(resolve(outputDirectory, "SOURCE_SNAPSHOT.json"), `${JSON.stringify(snapshotManifest, null, 2)}\n`);

verifySnapshotBuild();
createArchive();

const archiveBytes = statSync(archivePath).size;
const inspection = inspectDirectory(outputDirectory);
if (archiveBytes > maximumArchiveBytes) {
  throw new Error(
    `Seed World source archive is ${formatBytes(archiveBytes)}; maximum is ${formatBytes(maximumArchiveBytes)}`
  );
}

console.log(
  `Seed World Flash source ready at ${outputDirectory} ` +
    `(${inspection.fileCount} files, ${formatBytes(inspection.totalBytes)} source, ${formatBytes(archiveBytes)} compressed)`
);

function copyRepoPath(relativeTarget) {
  const source = resolve(repoRoot, relativeTarget);
  if (!existsSync(source)) throw new Error(`Seed World source input is missing: ${source}`);
  cpSync(source, resolve(outputDirectory, relativeTarget), {
    recursive: true,
    verbatimSymlinks: true,
    filter: shouldIncludeSourcePath
  });
}

function shouldIncludeSourcePath(sourcePath) {
  const relativePath = normalizePath(relative(repoRoot, sourcePath));
  if (!relativePath) return true;
  if (relativePath.split("/").some((segment) => excludedDirectoryNames.has(segment))) return false;
  if (excludedFiles.has(relativePath)) return false;
  if (excludedPathPatterns.some((pattern) => pattern.test(relativePath))) return false;
  if (isSelectedPathOrAncestor(relativePath)) return true;
  if (excludedPrefixes.some((prefix) => isPathWithin(relativePath, prefix))) return false;
  return true;
}

function prepareSnapshotWorkspaceManifests() {
  const includedPackages = new Set([...worldWorkspacePackages, ...nativeEnginePackages]);
  const rootPkgPath = resolve(outputDirectory, "package.json");
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
  rootPkg.workspaces = ["packages/*", "world"];
  rootPkg.scripts = {
    ...(rootPkg.scripts || {}),
    build: "node world/scripts/build-seed-world-flash-app.mjs --root-dist"
  };
  delete rootPkg.scripts.prepare;
  if (rootPkg.devDependencies?.electron) {
    delete rootPkg.devDependencies.electron;
  }
  writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);

  const lockPath = resolve(outputDirectory, "package-lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  if (lock?.packages && typeof lock.packages === "object") {
    const removedWorkspaces = new Set();
    for (const key of Object.keys(lock.packages)) {
      if (!key || key === "world" || key.startsWith("node_modules/")) continue;
      if (key.startsWith("packages/")) {
        const pkgDir = key.slice("packages/".length);
        if (!pkgDir.includes("/") && !includedPackages.has(pkgDir)) {
          removedWorkspaces.add(key);
        }
        continue;
      }
      if (!key.includes("/")) {
        removedWorkspaces.add(key);
      }
    }
    const isUnderRemovedWorkspace = (key) => {
      for (const ws of removedWorkspaces) {
        if (key === ws || key.startsWith(`${ws}/`)) return true;
      }
      return false;
    };
    for (const key of Object.keys(lock.packages)) {
      const entry = lock.packages[key];
      if (isUnderRemovedWorkspace(key) || (entry?.link && removedWorkspaces.has(entry.resolved))) {
        delete lock.packages[key];
      }
    }
    if (lock.packages[""]?.workspaces) {
      lock.packages[""].workspaces = ["packages/*", "world"];
    }
    if (lock.packages[""]?.devDependencies?.electron) {
      delete lock.packages[""].devDependencies.electron;
    }
    delete lock.packages["node_modules/electron"];
  }
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

function isSelectedPathOrAncestor(relativePath) {
  for (const selectedPrefix of selectivePrefixes) {
    if (isPathWithin(relativePath, selectedPrefix) || isSamePathOrAncestor(relativePath, selectedPrefix)) {
      return true;
    }
  }
  for (const selectedPath of selectiveFiles) {
    if (isSamePathOrAncestor(relativePath, selectedPath)) return true;
  }
  return false;
}

function isPathWithin(relativePath, prefix) {
  return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
}

function isSamePathOrAncestor(relativePath, targetPath) {
  return relativePath === targetPath || targetPath.startsWith(`${relativePath}/`);
}

function verifySnapshotWaterResources() {
  for (const excludedPath of excludedFiles) {
    if (existsSync(resolve(outputDirectory, excludedPath))) {
      throw new Error(`Seed World source snapshot contains an excluded authoring asset: ${excludedPath}`);
    }
  }
  for (const requiredPath of requiredWaterResources) {
    const snapshotPath = resolve(outputDirectory, requiredPath);
    if (!existsSync(snapshotPath) || sha256(snapshotPath) !== sha256(resolve(repoRoot, requiredPath))) {
      throw new Error(`Seed World source snapshot lost or changed a required Water resource: ${requiredPath}`);
    }
  }
  console.log("[seed-world-source-water] Source artwork PNGs excluded; runtime KTX2 and provenance manifests preserved.");
}

function verifySnapshotBuild() {
  const viteBin = resolve(dirname(vitePackagePath), "bin/vite.js");
  const temporaryEntries = [];
  const mirrorNodeModules = (sourceDir, targetDir, recordRoot = true) => {
    if (!existsSync(sourceDir)) return;
    mkdirSync(targetDir, { recursive: true });
    if (recordRoot) temporaryEntries.push(targetDir);
    for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
      const srcPath = resolve(sourceDir, entry.name);
      const dstPath = resolve(targetDir, entry.name);
      if (entry.name.startsWith("@") && entry.isDirectory()) {
        mirrorNodeModules(srcPath, dstPath, false);
        continue;
      }
      const stat = lstatSync(srcPath);
      if (stat.isSymbolicLink()) {
        const realTarget = resolve(sourceDir, readlinkSync(srcPath));
        const relFromRepo = normalizePath(relative(repoRoot, realTarget));
        const snapshotTarget = relFromRepo.startsWith("packages/") ? resolve(outputDirectory, relFromRepo) : "";
        symlinkSync(snapshotTarget && existsSync(snapshotTarget) ? snapshotTarget : realTarget, dstPath, "dir");
      } else {
        symlinkSync(srcPath, dstPath, entry.isDirectory() ? "dir" : "file");
      }
    }
  };

  try {
    temporaryEntries.push(...restoreFlashSourceEngine(outputDirectory).map((path) => resolve(outputDirectory, path)));
    mirrorNodeModules(resolve(repoRoot, "node_modules"), resolve(outputDirectory, "node_modules"));
    mirrorNodeModules(resolve(worldDirectory, "node_modules"), resolve(outputDirectory, "world/node_modules"));
    for (const pkg of [...worldWorkspacePackages, ...nativeEnginePackages]) {
      mirrorNodeModules(
        resolve(repoRoot, "packages", pkg, "node_modules"),
        resolve(outputDirectory, "packages", pkg, "node_modules")
      );
    }

    runVerificationBuild(worldDirectory, viteBin, referenceVerificationOutput);
    runVerificationBuild(resolve(outputDirectory, "world"), viteBin, verificationOutput);
    assertEquivalentBuilds(referenceVerificationOutput, verificationOutput);
  } finally {
    for (const target of temporaryEntries.reverse()) {
      rmSync(target, { recursive: true, force: true });
    }
    rmSync(referenceVerificationOutput, { recursive: true, force: true });
    rmSync(verificationOutput, { recursive: true, force: true });
  }
}

function runVerificationBuild(cwd, viteBin, targetOutDir) {
  run(process.execPath, [viteBin, "build", "--config", "vite.config.mjs"], cwd, {
    ...process.env,
    WORLD_FLASH_APP: "1",
    WORLD_MINIFY: "0",
    WORLD_OUT_DIR: targetOutDir
  });
  if (!existsSync(resolve(targetOutDir, "index.html"))) {
    throw new Error(`Seed World source snapshot verification produced no index.html in ${targetOutDir}`);
  }
}

function assertEquivalentBuilds(expectedRoot, actualRoot) {
  const expectedFiles = indexFilesByRelativePath(expectedRoot);
  const actualFiles = indexFilesByRelativePath(actualRoot);
  const expectedPaths = [...expectedFiles.keys()].sort();
  const actualPaths = [...actualFiles.keys()].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error("Seed World source snapshot build emitted a different file set from the runtime build");
  }
  for (const relativePath of expectedPaths) {
    if (sha256(expectedFiles.get(relativePath)) !== sha256(actualFiles.get(relativePath))) {
      throw new Error(`Seed World source snapshot build differs from the runtime build: ${relativePath}`);
    }
  }
}

function indexFilesByRelativePath(root) {
  const files = new Map();
  walkFiles(root, (filePath) => files.set(normalizePath(relative(root, filePath)), filePath));
  return files;
}

function createArchive() {
  run("tar", ["-czf", archivePath, "-C", outputDirectory, "."], worldDirectory, {
    ...process.env,
    COPYFILE_DISABLE: "1"
  });
}

function requireRuntimeBuild() {
  if (!existsSync(resolve(runtimeBuildDirectory, "index.html"))) {
    throw new Error("Run `npm run build:seed-world-flash-app --workspace world` before building its source snapshot");
  }
}

function readGitMetadata() {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  return {
    headCommit: head.status === 0 ? head.stdout.trim() : "unknown",
    branch: branch.status === 0 ? branch.stdout.trim() : "unknown"
  };
}

function readNativeEngineBaseline() {
  const baselinePath = resolve(worldDirectory, "migration/baseline.json");
  if (!existsSync(baselinePath)) return null;
  try {
    return JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch {
    return null;
  }
}

function inspectDirectory(directory) {
  let fileCount = 0;
  let totalBytes = 0;
  walkFiles(directory, (filePath) => {
    fileCount += 1;
    totalBytes += statSync(filePath).size;
  });
  return { fileCount, totalBytes };
}

function walkFiles(directory, visit) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, visit);
    else if (entry.isFile() || lstatSync(fullPath).isSymbolicLink()) visit(fullPath);
  }
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
  }
}

function normalizePath(filePath) {
  return filePath.split(sep).join("/");
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function createRebuildGuide(gitMeta, flashAppsCatalog) {
  const appLines = flashAppsCatalog.apps
    .map((app) => `- \`${app.templateId}\` -> \`world/dist/seed-world-flash-apps/${app.templateId}\` (${app.title})`)
    .join("\n");
  return `# Seed World Flash App self-contained source snapshot

This self-contained snapshot contains all World and native Engine workspace packages, precompiled engine files under \`seed-world-prepared-engine/\`, and Seed World assets needed to rebuild directly without an external repo checkout. The build restores the precompiled files to their normal package paths.
It intentionally excludes \`node_modules\`, tests, unrelated demos, Grasslands precomputed data, and offline-only source artwork whose runtime KTX2 derivatives are already included.

To rebuild directly from this extracted snapshot (Node.js >= 20.19, npm 10.9.3):

\`\`\`bash
npm ci --no-audit --no-fund
npm run build
\`\`\`

A published app's \`seed-world-template.json\` selects its template for root \`dist/\`. For the shared local snapshot, set \`WORLD_FLASH_APP_TEMPLATE=<templateId>\` to pick a template. It defaults to \`original\`.

Outputs:
- Root runnable app: \`dist/\`
- Shared runtime base: \`world/dist/seed-world-flash-app\`
- Per-template Flash App runtime packages:
${appLines}
`;
}
