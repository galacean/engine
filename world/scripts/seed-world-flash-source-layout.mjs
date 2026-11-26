import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const FLASH_SOURCE_TEMPLATE_FILE = "seed-world-template.json";
const preparedEngineDirectory = "seed-world-prepared-engine";
const shaderCache = "packages/modify/.cache";
const snapshotShaderCache = `${preparedEngineDirectory}/shader-cache`;
const preparedModules = {
  core: ["main.js"],
  design: ["main.js"],
  math: ["main.js"],
  "shader-compiler": ["module.js", "precompile.main.js"],
  "shader-parser": ["main.js", "main.analyzer.js", "module.js", "shared/GLESShaderInfo.main.js", "shared/GLESShaderInfo.module.js"]
};
const preparedModuleEntries = Object.entries(preparedModules).flatMap(([pkg, files]) =>
  files.map((file) => [`packages/${pkg}/dist/${file}`, `${preparedEngineDirectory}/modules/${pkg}/${file}`])
);
const preparedEngineEntries = [[shaderCache, snapshotShaderCache], ...preparedModuleEntries];

// The ASAP importer strips .cache and dist directories anywhere in the uploaded snapshot.
export function stageFlashSourceEngine(repoRoot, snapshotRoot) {
  for (const [buildPath, snapshotPath] of preparedEngineEntries) {
    copyPreparedEntry(repoRoot, buildPath, snapshotRoot, snapshotPath);
  }
}

export function hasFlashSourceEngine(root) {
  return existsSync(resolve(root, preparedEngineDirectory));
}

export function assertFlashSourceEngine(root) {
  for (const path of [
    `${snapshotShaderCache}/shaders.ts`,
    ...preparedModuleEntries.map(([, snapshotPath]) => snapshotPath)
  ]) {
    if (!existsSync(resolve(root, path))) {
      throw new Error(`Seed World source snapshot is missing ${path}. Rebuild the source snapshot before publishing.`);
    }
  }
}

export function restoreFlashSourceEngine(root) {
  assertFlashSourceEngine(root);
  for (const [buildPath, snapshotPath] of preparedEngineEntries) {
    copyPreparedEntry(root, snapshotPath, root, buildPath);
  }
  return [shaderCache, ...Object.keys(preparedModules).map((pkg) => `packages/${pkg}/dist`)];
}

function copyPreparedEntry(sourceRoot, sourcePath, targetRoot, targetPath) {
  const target = resolve(targetRoot, targetPath);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(resolve(sourceRoot, sourcePath), target, { recursive: true });
}

export function resolveFlashSourceTemplate(root, localTemplate) {
  const path = resolve(root, FLASH_SOURCE_TEMPLATE_FILE);
  if (!existsSync(path)) return localTemplate?.trim() || "original";
  const templateId = JSON.parse(readFileSync(path, "utf8"))?.templateId;
  if (typeof templateId !== "string" || !templateId) throw new Error(`Invalid templateId in ${path}`);
  return templateId;
}
