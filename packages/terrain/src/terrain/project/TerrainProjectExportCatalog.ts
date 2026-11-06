import { compareTerrainStableValues } from "../TerrainStableOrder";
import { requireTerrainArtifactRelativePath } from "./TerrainArtifactPath";
import { sha256TerrainBytes } from "./TerrainProjectCodec";
import type { TerrainProjectFile, TerrainProjectRef } from "./TerrainProjectContract";

export {
  collectTerrainProjectRegionDependencies,
  type TerrainProjectRegionDependency,
  type TerrainProjectRegionDependencyType
} from "./TerrainProjectRegionDependencies";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/** Typed standard Project dependency emitted by an editor export recipe. */
export interface TerrainProjectExportDependency extends TerrainProjectRef {
  /** Stock Project loader type required for the target resource. */
  type: string;
}

/** Private-build evidence and public Project fields for one output asset. */
export interface TerrainProjectExportAsset {
  /** Standard Project declaration written to `project.json`. */
  file: TerrainProjectFile["files"][number];
  /** Full SHA-256 of the stable authoring identity; the raw identity is never persisted. */
  authoringIdentitySha256: string;
  /** Full SHA-256 of copied source bytes, when the output is source-derived. */
  sourceContentSha256?: string;
  /** Full SHA-256 of the exact bytes written at `file.virtualPath`. */
  outputContentSha256: string;
  /** Complete direct dependency list used to prove the Scene-rooted closure. */
  dependencies: TerrainProjectExportDependency[];
}

/** Build-only catalog used to generate a standard Project declaration. */
export interface TerrainProjectExportCatalog {
  version: "1";
  engineVersion?: string;
  scene: string;
  assets: TerrainProjectExportAsset[];
}

/**
 * Verifies an output catalog and produces the ordinary Project file metadata.
 * @param catalog Build-only resource identities and explicit dependencies.
 * @param entries Exact output bytes keyed by Project virtual path.
 * @param sourceEntries Optional source bytes keyed by full authoring identity SHA-256.
 * @returns Standard Project metadata sorted by virtual path.
 * @throws If identity, content, path, dependency, or reachability evidence is incomplete.
 */
export async function createTerrainProjectFileFromCatalog(
  catalog: TerrainProjectExportCatalog,
  entries: ReadonlyMap<string, Uint8Array>,
  sourceEntries: ReadonlyMap<string, Uint8Array> = new Map()
): Promise<TerrainProjectFile> {
  if (catalog.version !== "1") throw new Error(`Unsupported Terrain Project export catalog version`);
  requireTerrainArtifactRelativePath(catalog.scene, "Export catalog Scene");
  const byPath = new Map<string, TerrainProjectExportAsset>();
  const ids = new Set<string>();
  const outputPaths = new Set<string>();
  const outputPathsIgnoringCase = new Set<string>();
  for (const asset of catalog.assets) {
    validateProjectFile(asset.file);
    validateDigest(asset.authoringIdentitySha256, `authoring identity for "${asset.file.virtualPath}"`);
    if (asset.sourceContentSha256 !== undefined) {
      validateDigest(asset.sourceContentSha256, `source content for "${asset.file.virtualPath}"`);
      const sourceBytes = sourceEntries.get(asset.authoringIdentitySha256);
      if (!sourceBytes) throw new Error(`Export catalog asset "${asset.file.virtualPath}" has no source bytes`);
      const receivedSourceHash = await sha256TerrainBytes(sourceBytes);
      if (receivedSourceHash !== asset.sourceContentSha256) {
        throw new Error(`Export catalog asset "${asset.file.virtualPath}" source SHA-256 mismatch`);
      }
    }
    validateDigest(asset.outputContentSha256, `output content for "${asset.file.virtualPath}"`);
    if (ids.has(asset.file.id)) throw new Error(`Duplicate Project file id "${asset.file.id}"`);
    if (byPath.has(asset.file.virtualPath)) {
      throw new Error(`Duplicate Project virtual path "${asset.file.virtualPath}"`);
    }
    const foldedOutputPath = asset.file.path.toLowerCase();
    if (outputPaths.has(asset.file.path) || outputPathsIgnoringCase.has(foldedOutputPath)) {
      throw new Error(`Duplicate Project output path "${asset.file.path}"`);
    }
    outputPaths.add(asset.file.path);
    outputPathsIgnoringCase.add(foldedOutputPath);
    ids.add(asset.file.id);
    byPath.set(asset.file.virtualPath, asset);
  }
  const scene = byPath.get(catalog.scene);
  if (!scene || scene.file.type !== "Scene") {
    throw new Error(`Export catalog Scene "${catalog.scene}" must resolve to a standard Scene asset`);
  }
  if (entries.size !== byPath.size) throw new Error(`Export entries do not match the catalog asset count`);
  for (const [virtualPath, asset] of byPath) {
    const bytes = entries.get(virtualPath);
    if (!bytes) throw new Error(`Export catalog asset "${virtualPath}" has no output bytes`);
    const received = await sha256TerrainBytes(bytes);
    if (received !== asset.outputContentSha256) {
      throw new Error(`Export catalog asset "${virtualPath}" content SHA-256 mismatch`);
    }
    for (const dependency of asset.dependencies) {
      if (!dependency?.url || !dependency.type) {
        throw new Error(`Export asset "${virtualPath}" has an invalid typed dependency`);
      }
      requireTerrainArtifactRelativePath(dependency.url, `Export asset "${virtualPath}" dependency`);
      const target = byPath.get(dependency.url);
      if (!target) throw new Error(`Export asset "${virtualPath}" has an undeclared dependency "${dependency.url}"`);
      if (target.file.type !== dependency.type) {
        throw new Error(
          `Export asset "${virtualPath}" dependency "${dependency.url}" is ${target.file.type}; expected ${dependency.type}`
        );
      }
    }
  }
  for (const virtualPath of entries.keys()) {
    requireTerrainArtifactRelativePath(virtualPath, "Export entry");
    if (!byPath.has(virtualPath)) throw new Error(`Export contains uncataloged entry "${virtualPath}"`);
  }
  const reachable = new Set<string>();
  const pending = [catalog.scene];
  while (pending.length) {
    const virtualPath = pending.pop()!;
    if (reachable.has(virtualPath)) continue;
    reachable.add(virtualPath);
    for (const dependency of byPath.get(virtualPath)!.dependencies) pending.push(dependency.url);
  }
  const orphan = [...byPath.keys()].find((virtualPath) => !reachable.has(virtualPath));
  if (orphan) throw new Error(`Export catalog asset "${orphan}" is unreachable from the Scene`);
  return {
    ...(catalog.engineVersion ? { engineVersion: catalog.engineVersion } : {}),
    scene: catalog.scene,
    files: [...byPath.values()]
      .map((asset) => asset.file)
      .sort((left, right) => compareTerrainStableValues(left.virtualPath, right.virtualPath))
  };
}

function validateProjectFile(file: TerrainProjectFile["files"][number]): void {
  if (
    typeof file?.id !== "string" ||
    !file.id ||
    typeof file.type !== "string" ||
    !file.type ||
    typeof file.virtualPath !== "string" ||
    typeof file.path !== "string"
  ) {
    throw new Error(`Export catalog Project fields must be nonempty strings`);
  }
  requireTerrainArtifactRelativePath(file.virtualPath, "Export catalog virtual path");
  requireTerrainArtifactRelativePath(file.path, "Export catalog output path");
  if (!file.path.startsWith("public/")) {
    throw new Error(`Export catalog output path must stay inside public/`);
  }
}

function validateDigest(value: string, label: string): void {
  if (!SHA256_PATTERN.test(value)) throw new Error(`Export catalog ${label} must be a lowercase SHA-256 digest`);
}
