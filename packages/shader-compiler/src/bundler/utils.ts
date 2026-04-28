import path from "node:path";
import fs from "node:fs";

/**
 * Normalize a filesystem path to forward slashes.
 *
 * Critical on Windows: every result from `path.relative` / `path.join` may use
 * backslashes; downstream code (regex matching, import paths, glob keys) all
 * assume `/`, so callers must normalize at the boundary.
 */
export function normalizePath(p: string): string {
  return p.split(path.sep).join("/");
}

/**
 * Recursively find all files with a given extension in a directory.
 *
 * Returns absolute paths normalized to forward slashes. Returns an empty array
 * if the directory does not exist.
 */
export function findFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(normalizePath(fullPath));
    }
  }
  return results;
}

/**
 * Convert a relative .gsp path into a PascalCase variable name suffixed with `Source`.
 *
 * `PBR.gsp`              → `PBRSource`
 * `PostProcess/Uber.gsp` → `UberSource`
 * `2D/Sprite.gsp`        → `SpriteSource`
 *
 * Only the basename is used; nesting is ignored. The basename's first character
 * is upper-cased so kebab/snake basenames produce a valid identifier prefix.
 */
export function gspPathToVarName(relPath: string): string {
  const normalized = normalizePath(relPath).replace(/\.gsp$/, "");
  const base = normalized.split("/").pop() ?? normalized;
  const cleaned = base.replace(/[^A-Za-z0-9]/g, "");
  if (cleaned.length === 0) return "Source";
  const head = cleaned[0].toUpperCase();
  return `${head}${cleaned.slice(1)}Source`;
}

/**
 * Remove empty parent directories upward from `startDir` until `stopDir` is hit.
 *
 * Both paths must be absolute. The function is a no-op once a non-empty
 * directory is encountered.
 */
export function pruneEmptyDirs(startDir: string, stopDir: string): void {
  let dir = startDir;
  while (dir !== stopDir && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}
