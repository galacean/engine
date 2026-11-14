import { compareTerrainStableValues } from "../TerrainStableOrder";
import { requireTerrainArtifactRelativePath } from "./TerrainArtifactPath";
import { encodeTerrainCanonicalJson, type TerrainProjectEntries } from "./TerrainProjectCodec";
import { createTerrainProjectFileFromCatalog, type TerrainProjectExportCatalog } from "./TerrainProjectExportCatalog";
import type { TerrainProjectFile } from "./TerrainProjectContract";

const PROJECT_ROOT_PATH = "project.json";
const PUBLIC_ROOT_PREFIX = "public/";
const textDecoder = new TextDecoder();

/**
 * Immutable snapshot of one standard Project artifact keyed by physical build path.
 * @remarks Resource bytes returned by accessors and iterators are defensive copies.
 */
export interface TerrainProjectArtifactEntries extends ReadonlyMap<string, Uint8Array> {}

/**
 * Verifies and assembles one standard Project artifact from exact build outputs.
 * @param catalog Scene-rooted build catalog with explicit typed dependencies and content hashes.
 * @param outputEntries Exact resource bytes excluding the generated `project.json` root.
 * @param sourceEntries Source bytes keyed by their full authoring-identity SHA-256.
 * @returns Immutable physical artifact entries containing root `project.json` and declared `public/` files.
 * @throws If the catalog, paths, hashes, dependency closure, or exact output set is invalid.
 */
export async function assembleTerrainProjectArtifact(
  catalog: TerrainProjectExportCatalog,
  outputEntries: TerrainProjectEntries,
  sourceEntries: TerrainProjectEntries = new Map()
): Promise<TerrainProjectArtifactEntries> {
  const catalogSnapshot = cloneCatalog(catalog);
  const outputSnapshot = cloneByteEntries(outputEntries, "Project output entry", true);
  const sourceSnapshot = cloneByteEntries(sourceEntries, "Project source entry", false);

  if (outputSnapshot.has(PROJECT_ROOT_PATH)) {
    throw new Error("Terrain Project output entries must not contain a prebuilt project.json");
  }
  for (const asset of catalogSnapshot.assets) {
    if (asset.file.virtualPath === PROJECT_ROOT_PATH || asset.file.path === PROJECT_ROOT_PATH) {
      throw new Error("Terrain Project export catalog must not declare project.json as an asset");
    }
  }

  const project = await createTerrainProjectFileFromCatalog(catalogSnapshot, outputSnapshot, sourceSnapshot);
  const artifactEntries = new Map<string, Uint8Array>([[PROJECT_ROOT_PATH, encodeTerrainCanonicalJson(project)]]);
  for (const file of project.files) artifactEntries.set(file.path, outputSnapshot.get(file.virtualPath)!);
  return new ImmutableTerrainProjectArtifactEntries(artifactEntries);
}

/**
 * Resolves one physical Project artifact back to its declared virtual resource tree.
 * @param artifactEntries Root `project.json` plus physical files keyed by declared `file.path`.
 * @returns Immutable entries keyed by Project virtual path for offline import and content hashing.
 * @throws If declarations, physical paths, bytes, or the exact artifact set are incomplete.
 */
export function indexTerrainProjectArtifact(artifactEntries: ReadonlyMap<string, Uint8Array>): TerrainProjectEntries {
  const artifactSnapshot = cloneByteEntries(artifactEntries, "Project artifact entry", true);
  const rootBytes = artifactSnapshot.get(PROJECT_ROOT_PATH);
  if (!rootBytes) throw new Error("Terrain Project artifact requires root project.json");
  let project: TerrainProjectFile;
  try {
    project = JSON.parse(textDecoder.decode(rootBytes)) as TerrainProjectFile;
  } catch (error) {
    throw new Error("Terrain Project artifact project.json is invalid JSON", { cause: error });
  }
  if (!project || !Array.isArray(project.files)) {
    throw new Error("Terrain Project artifact project.json requires a standard files array");
  }

  const virtualEntries = new Map<string, Uint8Array>([[PROJECT_ROOT_PATH, rootBytes]]);
  const physicalPaths = new Set<string>([PROJECT_ROOT_PATH]);
  const physicalPathsIgnoringCase = new Set<string>([PROJECT_ROOT_PATH]);
  for (const file of project.files) {
    const virtualPath = requireTerrainArtifactRelativePath(file?.virtualPath, "Project artifact virtual path");
    const physicalPath = requirePublicOutputPath(file?.path, "Project artifact physical path");
    if (virtualPath === PROJECT_ROOT_PATH || virtualEntries.has(virtualPath)) {
      throw new Error(`Terrain Project artifact contains duplicate virtual path "${virtualPath}"`);
    }
    const foldedPhysicalPath = physicalPath.toLowerCase();
    if (physicalPaths.has(physicalPath) || physicalPathsIgnoringCase.has(foldedPhysicalPath)) {
      throw new Error(`Terrain Project artifact contains duplicate physical path "${physicalPath}"`);
    }
    physicalPaths.add(physicalPath);
    physicalPathsIgnoringCase.add(foldedPhysicalPath);
    const bytes = artifactSnapshot.get(physicalPath);
    if (!bytes) throw new Error(`Terrain Project artifact is missing physical file "${physicalPath}"`);
    virtualEntries.set(virtualPath, bytes);
  }
  if (artifactSnapshot.size !== physicalPaths.size) {
    throw new Error("Terrain Project artifact contains an undeclared physical file");
  }
  return new ImmutableTerrainProjectArtifactEntries(virtualEntries);
}

function cloneCatalog(catalog: TerrainProjectExportCatalog): TerrainProjectExportCatalog {
  const bytes = encodeTerrainCanonicalJson(catalog);
  return JSON.parse(textDecoder.decode(bytes)) as TerrainProjectExportCatalog;
}

function cloneByteEntries(
  entries: TerrainProjectEntries,
  label: string,
  validateArtifactPaths: boolean
): Map<string, Uint8Array> {
  const snapshot = new Map<string, Uint8Array>();
  for (const [path, bytes] of entries) {
    if (validateArtifactPaths) requireTerrainArtifactRelativePath(path, label);
    if (!(bytes instanceof Uint8Array)) throw new Error(`${label} "${path}" must contain Uint8Array bytes`);
    snapshot.set(path, bytes.slice());
  }
  return snapshot;
}

function requirePublicOutputPath(path: string, label: string): string {
  const validated = requireTerrainArtifactRelativePath(path, label);
  if (!validated.startsWith(PUBLIC_ROOT_PREFIX)) throw new Error(`${label} must stay inside public/`);
  return validated;
}

class ImmutableTerrainProjectArtifactEntries implements TerrainProjectArtifactEntries {
  private readonly _entries: ReadonlyMap<string, Uint8Array>;

  constructor(entries: ReadonlyMap<string, Uint8Array>) {
    this._entries = new Map<string, Uint8Array>(
      [...entries]
        .sort(([left], [right]) => compareTerrainStableValues(left, right))
        .map(([path, bytes]) => [path, bytes.slice()] as const)
    );
  }

  get size(): number {
    return this._entries.size;
  }

  get(path: string): Uint8Array | undefined {
    return this._entries.get(path)?.slice();
  }

  has(path: string): boolean {
    return this._entries.has(path);
  }

  entries(): MapIterator<[string, Uint8Array]> {
    return this._copyEntries().entries();
  }

  keys(): MapIterator<string> {
    return this._entries.keys();
  }

  values(): MapIterator<Uint8Array> {
    return this._copyEntries().values();
  }

  forEach(
    callback: (value: Uint8Array, key: string, map: ReadonlyMap<string, Uint8Array>) => void,
    thisArg?: unknown
  ): void {
    for (const [path, bytes] of this._entries) callback.call(thisArg, bytes.slice(), path, this);
  }

  [Symbol.iterator](): MapIterator<[string, Uint8Array]> {
    return this.entries();
  }

  private _copyEntries(): Map<string, Uint8Array> {
    return new Map([...this._entries].map(([path, bytes]) => [path, bytes.slice()] as const));
  }
}
