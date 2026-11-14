import type { TerrainProjectArtifactEntries } from "../project/TerrainProjectArtifactAssembler";
import { encodeTerrainCanonicalJson } from "../project/TerrainProjectCodec";
import type { TerrainProjectFile } from "../project/TerrainProjectContract";
import { decodeTerrainCompressedAsset } from "./TerrainCompressionDecoder";
import { TerrainCompressionAssetType } from "./TerrainCompressionAssetType";

const PROJECT_ROOT_PATH = "project.json";
const BROTLI_SUFFIX = ".br";
const textDecoder = new TextDecoder();

/**
 * Restores a compressed runtime Project into the canonical raw artifact consumed by Terrain authoring.
 * @param artifactEntries Physical Project entries whose manifest may declare Demo-private compression asset types.
 * @returns A detached artifact with canonical paths, standard asset types, and decoded bytes.
 * @throws If the Project is malformed, a compressed declaration is invalid, or decoding fails.
 */
export async function normalizeTerrainCompressedProjectArtifact(
  artifactEntries: ReadonlyMap<string, Uint8Array>
): Promise<TerrainProjectArtifactEntries> {
  const rootBytes = artifactEntries.get(PROJECT_ROOT_PATH);
  if (!rootBytes) throw new Error("Terrain compressed Project requires root project.json");
  const project = parseProject(rootBytes);
  if (!project.files.some((file) => isTerrainCompressionAssetType(file.type))) {
    return new Map(artifactEntries) as TerrainProjectArtifactEntries;
  }
  const normalizedEntries = new Map<string, Uint8Array>();
  const normalizedFiles: TerrainProjectFile["files"] = [];

  for (const file of project.files) {
    if (!isTerrainCompressionAssetType(file.type)) {
      addEntry(normalizedEntries, file.path, requireBytes(artifactEntries, file.path));
      normalizedFiles.push({ ...file });
      continue;
    }
    if (!file.path.endsWith(BROTLI_SUFFIX)) {
      throw new Error(`Terrain compressed Project path must end in .br: "${file.path}"`);
    }
    const decoded = await decodeTerrainCompressedAsset(
      file.type,
      file.params,
      requireBytes(artifactEntries, file.path)
    );
    const path = file.path.slice(0, -BROTLI_SUFFIX.length);
    addEntry(normalizedEntries, path, decoded.bytes);
    const { params: _params, ...declaration } = file;
    normalizedFiles.push({ ...declaration, path, type: decoded.resultType });
  }

  addEntry(normalizedEntries, PROJECT_ROOT_PATH, encodeTerrainCanonicalJson({ ...project, files: normalizedFiles }));
  if (normalizedEntries.size !== project.files.length + 1) {
    throw new Error("Terrain compressed Project does not have a one-to-one physical file mapping");
  }
  return normalizedEntries as TerrainProjectArtifactEntries;
}

function parseProject(bytes: Uint8Array): TerrainProjectFile {
  let project: unknown;
  try {
    project = JSON.parse(textDecoder.decode(bytes));
  } catch (error) {
    throw new Error("Terrain compressed Project project.json is invalid JSON", { cause: error });
  }
  if (!project || typeof project !== "object" || !Array.isArray((project as TerrainProjectFile).files)) {
    throw new Error("Terrain compressed Project project.json requires a standard files array");
  }
  return project as TerrainProjectFile;
}

function isTerrainCompressionAssetType(type: string): boolean {
  return type === TerrainCompressionAssetType.Brotli || type === TerrainCompressionAssetType.BrotliHeightmap;
}

function requireBytes(artifactEntries: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const bytes = artifactEntries.get(path);
  if (!(bytes instanceof Uint8Array)) {
    throw new Error(`Terrain compressed Project is missing physical file "${path}"`);
  }
  return bytes;
}

function addEntry(entries: Map<string, Uint8Array>, path: string, bytes: Uint8Array): void {
  if (entries.has(path)) throw new Error(`Terrain compressed Project contains duplicate physical path "${path}"`);
  entries.set(path, bytes);
}
