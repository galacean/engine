import {
  AssetPromise,
  Loader,
  Shader,
  resourceLoader,
  type LoadItem,
  type ResourceManager
} from "@galacean/engine-core";
import { compareTerrainStableValues } from "@galacean/engine-terrain/terrain/TerrainStableOrder";
import { normalizeTerrainCompressedProjectArtifact } from "@galacean/engine-terrain/terrain/compression/TerrainCompressedProjectArtifact";
import { requireTerrainArtifactRelativePath } from "@galacean/engine-terrain/terrain/project/TerrainArtifactPath";
import type { TerrainProjectArtifactEntries } from "@galacean/engine-terrain/terrain/project/TerrainProjectArtifactAssembler";
import { importTerrainProject } from "@galacean/engine-terrain/terrain/project/TerrainProjectCodec";
import type { TerrainProjectFile } from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import { isLegacyTerrainEditorArtifact, migrateLegacyTerrainEditorArtifact } from "./TerrainLegacyArtifactMigration.ts";

const PROJECT_ROOT_PATH = "project.json";
const PUBLIC_ROOT_PREFIX = "public/";
const HTTP_FETCH_CONCURRENCY = 6;
const IGNORED_DIRECTORY_METADATA_FILE_NAMES = new Set([".DS_Store"]);
const TERRAIN_EDITOR_SHADER_ASSET_TYPE = "TerrainEditorShader";
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

interface TerrainEditorPrecompiledShader {
  readonly name: string;
}

@resourceLoader(TERRAIN_EDITOR_SHADER_ASSET_TYPE, [])
class TerrainEditorShaderLoader extends Loader<Shader> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const url = item.url;
    if (!url) throw new Error("Terrain editor Shader URL is required");

    const request = resourceManager._request<string>(url, { ...item, type: "text" });
    return AssetPromise.resolve(request).then((source) => {
      const data = parsePrecompiledShader(source, url);
      Shader.find(data.name)?.destroy(true);

      // @ts-expect-error Precompiled Shader construction is the stock ShaderLoader's internal contract.
      const shader = Shader._createFromPrecompiled(data);
      if (!shader) throw new Error(`Terrain editor Shader "${data.name}" could not be created`);
      return shader;
    });
  }
}

/** Stable phase emitted while a physical Project artifact is written to a browser directory. */
export type TerrainProjectDirectoryWritePhase = "validation" | "destination" | "writing" | "verification" | "complete";

/** One monotonic, byte-backed browser-directory export update. */
export interface TerrainProjectDirectoryWriteProgress {
  /** Overall completion in the inclusive `[0,100]` range. */
  readonly percent: number;
  /** Export phase responsible for the update. */
  readonly phase: TerrainProjectDirectoryWritePhase;
  /** Bytes already verified in place or committed by this export. */
  readonly completedBytes: number;
  /** Total bytes in the current verified artifact. */
  readonly totalBytes: number;
  /** Files already verified in place or committed by this export. */
  readonly completedFiles: number;
  /** Total files in the current verified artifact. */
  readonly fileCount: number;
}

/** Receives monotonic progress while a physical Project artifact is exported. */
export type TerrainProjectDirectoryWriteProgressHandler = (progress: TerrainProjectDirectoryWriteProgress) => void;

/** Minimal readable file surface shared by browser file and directory handles. */
export interface TerrainProjectReadableFile {
  /**
   * Reads the complete file body.
   * @returns A promise resolving to an immutable snapshot of the file bytes.
   */
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Minimal writable stream required to publish one browser Project file. */
export interface TerrainProjectWritableFileStream {
  /**
   * Replaces the file body with the supplied bytes.
   * @param bytes Complete replacement body.
   * @returns A promise resolving after the bytes have been accepted by the browser stream.
   * @throws If the browser cannot stage the replacement body.
   */
  write(bytes: Uint8Array): Promise<void>;
  /**
   * Commits the written file body.
   * @returns A promise resolving after the browser commits the file.
   * @throws If the browser cannot commit the staged body.
   */
  close(): Promise<void>;
  /**
   * Abandons an incomplete write when the browser implementation supports it.
   * @param reason Original failure that caused the write to be abandoned.
   * @returns A promise resolving after the browser abandons the staged body.
   * @throws If the browser cannot abandon the staged write.
   */
  abort?(reason?: unknown): Promise<void>;
}

/** Minimal browser file handle used by Terrain Project folder import and export. */
export interface TerrainProjectFileHandle {
  /** Browser handle discriminator. */
  readonly kind: "file";
  /** Exact file-system entry name. */
  readonly name: string;
  /**
   * Opens the current readable file snapshot.
   * @returns A promise resolving to the current file body.
   * @throws If the browser can no longer read the selected file.
   */
  getFile(): Promise<TerrainProjectReadableFile>;
  /**
   * Opens a writable stream for a verified export file.
   * @returns A promise resolving to a browser writable stream.
   * @throws If write permission is unavailable or the file can no longer be opened.
   */
  createWritable(): Promise<TerrainProjectWritableFileStream>;
}

/** Minimal browser directory handle used by Terrain Project folder import and export. */
export interface TerrainProjectDirectoryHandle {
  /** Browser handle discriminator. */
  readonly kind: "directory";
  /** Exact file-system entry name. */
  readonly name: string;
  /**
   * Iterates the directory's immediate entries.
   * @returns An asynchronous iterator over exact entry names and handles.
   */
  entries(): AsyncIterableIterator<[string, TerrainProjectFileSystemHandle]>;
  /**
   * Opens or creates one immediate child directory.
   * @param name Exact single-segment child name.
   * @param options Browser create options.
   * @returns A promise resolving to the child directory handle.
   * @throws If the entry is missing, has another kind, or cannot be created.
   */
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<TerrainProjectDirectoryHandle>;
  /**
   * Opens or creates one immediate child file.
   * @param name Exact single-segment child name.
   * @param options Browser create options.
   * @returns A promise resolving to the child file handle.
   * @throws If the entry is missing, has another kind, or cannot be created.
   */
  getFileHandle(name: string, options?: { create?: boolean }): Promise<TerrainProjectFileHandle>;
  /**
   * Removes one immediate child created by an incomplete export attempt.
   * @param name Exact single-segment child name.
   * @param options Browser recursive-removal options.
   * @returns A promise resolving after the child is removed.
   * @throws If the child cannot be removed.
   */
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

/** Browser file-system handle shapes consumed by recursive Project folder import. */
export type TerrainProjectFileSystemHandle = TerrainProjectDirectoryHandle | TerrainProjectFileHandle;

/** Temporary Project root URL and its idempotent object-URL cleanup operation. */
export interface TerrainProjectObjectUrlTransport {
  /** Object URL containing a standard Project manifest whose physical file paths are temporary object URLs. */
  readonly projectUrl: string;
  /**
   * Revokes the Project URL and every resource URL created with it.
   * @returns Nothing after every owned URL has been processed.
   */
  revoke(): void;
}

/**
 * Loads an exact physical Project artifact from an HTTP(S) `project.json` and its declared files.
 * @param projectUrl Absolute HTTP(S) URL of the root `project.json`.
 * @returns Physical artifact entries keyed by root-relative `project.json` and `public/...` paths.
 * @throws If a request fails or the complete artifact fails physical indexing or canonical Terrain import.
 */
export async function loadTerrainProjectArtifactFromUrl(
  projectUrl: string | URL
): Promise<TerrainProjectArtifactEntries> {
  const rootUrl = requireHttpProjectUrl(projectUrl);
  const rootBytes = await fetchBytes(rootUrl, PROJECT_ROOT_PATH);
  const project = parseProjectManifest(rootBytes);
  const physicalPaths = validateProjectPhysicalPaths(project);
  const artifactEntries = new Map<string, Uint8Array>([[PROJECT_ROOT_PATH, rootBytes]]);
  const artifactBaseUrl = new URL("./", rootUrl);
  const resourceBytes = await fetchDeclaredProjectFiles(physicalPaths, artifactBaseUrl);
  for (let index = 0; index < physicalPaths.length; index++) {
    artifactEntries.set(physicalPaths[index], resourceBytes[index]);
  }
  return validateArtifactEntries(artifactEntries);
}

/**
 * Creates a Project manifest transport whose declared physical paths are absolute HTTP(S) URLs.
 * @remarks The stock Project loader resolves declared paths against `document.baseURI`; this transport preserves the
 * standard manifest while making that resolution independent of the editor page location. Resource bytes stay remote.
 * @param projectUrl Absolute HTTP(S) URL of the source root `project.json`.
 * @returns A temporary Project object URL and an idempotent cleanup operation for that URL.
 * @throws If the manifest request fails, physical declarations are unsafe, or object URLs are unavailable.
 */
export async function createTerrainProjectHttpTransport(
  projectUrl: string | URL
): Promise<TerrainProjectObjectUrlTransport> {
  const rootUrl = requireHttpProjectUrl(projectUrl);
  const project = parseProjectManifest(await fetchBytes(rootUrl, PROJECT_ROOT_PATH));
  const physicalPaths = validateProjectPhysicalPaths(project);
  const artifactBaseUrl = new URL("./", rootUrl);
  const transportProject: TerrainProjectFile = {
    ...project,
    files: project.files.map((file, index) =>
      createTerrainEditorPreviewFile(file, new URL(physicalPaths[index], artifactBaseUrl).href)
    )
  };
  return createManifestObjectUrlTransport(transportProject);
}

/**
 * Recursively reads a browser directory as one exact physical Project artifact.
 * @param root Directory selected as the artifact root containing `project.json` and `public/`.
 * @returns Physical artifact entries after standard indexing and canonical Terrain import validation.
 * @throws If entry names alias, Project files are missing or undeclared, or canonical validation fails. Platform
 * directory metadata is excluded from the physical artifact.
 */
export async function readTerrainProjectDirectory(
  root: TerrainProjectDirectoryHandle
): Promise<TerrainProjectArtifactEntries> {
  requireDirectoryHandle(root);
  const artifactEntries = new Map<string, Uint8Array>();
  const physicalAliases = new Map<string, string>();
  await collectDirectoryFiles(root, "", artifactEntries, physicalAliases);
  return validateArtifactEntries(artifactEntries);
}

/**
 * Reads files selected by `<input type="file" webkitdirectory multiple>` as one Project artifact.
 * @param files Browser files whose `webkitRelativePath` values share one selected root directory.
 * @param legacyTemplate Optional current single-Region Project used only to migrate the recognized prior editor output.
 * @returns Physical artifact entries after removing the common root and validating the complete Project.
 * @throws If relative paths are absent, roots differ, names alias, or canonical validation fails.
 */
export async function readTerrainProjectFiles(
  files: Iterable<File>,
  legacyTemplate?: TerrainProjectArtifactEntries
): Promise<TerrainProjectArtifactEntries> {
  const selectedFiles = [...files];
  if (selectedFiles.length === 0) throw new Error("Terrain Project file import requires at least one file");

  const artifactEntries = new Map<string, Uint8Array>();
  let commonRoot: string | undefined;
  for (const file of selectedFiles) {
    if (!file || typeof file.arrayBuffer !== "function") {
      throw new Error("Terrain Project file import contains an unreadable file");
    }
    const browserPath = requireTerrainArtifactRelativePath(
      file.webkitRelativePath,
      "Terrain Project webkitRelativePath"
    );
    const segments = browserPath.split("/");
    if (segments.length < 2) {
      throw new Error("Terrain Project webkitRelativePath must include the selected root directory");
    }
    if (commonRoot === undefined) commonRoot = segments[0];
    if (segments[0] !== commonRoot) {
      throw new Error("Terrain Project files must share one exact selected root directory");
    }
    if (file.name !== segments[segments.length - 1]) {
      throw new Error(`Terrain Project file name does not match webkitRelativePath "${browserPath}"`);
    }
    if (IGNORED_DIRECTORY_METADATA_FILE_NAMES.has(file.name)) continue;
    const physicalPath = segments.slice(1).join("/");
    if (artifactEntries.has(physicalPath)) {
      throw new Error(`Terrain Project file import contains duplicate physical path "${physicalPath}"`);
    }
    artifactEntries.set(physicalPath, new Uint8Array(await file.arrayBuffer()));
  }
  if (legacyTemplate && isLegacyTerrainEditorArtifact(artifactEntries)) {
    return migrateLegacyTerrainEditorArtifact(artifactEntries, legacyTemplate);
  }
  return validateArtifactEntries(artifactEntries);
}

/**
 * Publishes one verified Project artifact to a browser directory.
 * @remarks A new export accepts an empty destination, a partial destination containing only current artifact paths,
 * or a complete verified Project. Existing declared files are overwritten, while unrelated files are never touched.
 * Platform directory metadata is ignored. Passing `previousArtifactEntries` permits an atomic best-effort update of
 * the exact directory that supplied that verified artifact. Declared resources are committed before root
 * `project.json`; interrupted fresh exports remain resumable and failed updates restore every touched entry.
 * @param root Empty, resumable, or complete Project destination.
 * @param artifactEntries Physical root `project.json` and declared `public/` files. The caller must not mutate these
 * bytes until the returned promise settles.
 * @param previousArtifactEntries Last verified artifact read from or successfully written to `root`.
 * @param onProgress Optional callback backed by verified and committed artifact bytes.
 * @returns A promise that resolves after every verified byte has been committed.
 * @throws If an artifact is invalid, the directory no longer matches the previous artifact, a browser write fails,
 * or rollback is incomplete. Rollback failures are reported with the original failure through `AggregateError`.
 */
export async function writeTerrainProjectDirectory(
  root: TerrainProjectDirectoryHandle,
  artifactEntries: TerrainProjectArtifactEntries,
  previousArtifactEntries?: TerrainProjectArtifactEntries,
  onProgress?: TerrainProjectDirectoryWriteProgressHandler
): Promise<void> {
  requireWritableDirectoryHandle(root);
  const snapshot = await validateArtifactEntries(artifactEntries);
  const orderedEntries = orderedArtifactEntries(snapshot);
  const totalBytes = orderedEntries.reduce((sum, [, bytes]) => sum + bytes.byteLength, 0);
  reportDirectoryWriteProgress(onProgress, "validation", 0, totalBytes, 0, orderedEntries.length);
  if (previousArtifactEntries) {
    const previousSnapshot = await validateArtifactEntries(previousArtifactEntries);
    await requireDirectoryMatchesArtifact(root, previousSnapshot);
    await replaceTerrainProjectDirectory(root, previousSnapshot, snapshot, onProgress);
    reportDirectoryWriteProgress(
      onProgress,
      "complete",
      totalBytes,
      totalBytes,
      orderedEntries.length,
      orderedEntries.length
    );
    return;
  }

  const existingEntries = await readDirectoryExportEntries(root);
  if (existingEntries.has(PROJECT_ROOT_PATH)) {
    const existingSnapshot = await validateArtifactEntries(existingEntries);
    await replaceTerrainProjectDirectory(root, existingSnapshot, snapshot, onProgress);
    reportDirectoryWriteProgress(
      onProgress,
      "complete",
      totalBytes,
      totalBytes,
      orderedEntries.length,
      orderedEntries.length
    );
    return;
  }
  requirePartialDirectoryPaths(existingEntries, snapshot);
  const matchingPaths = new Set(
    orderedEntries.filter(([path, bytes]) => equalBytes(existingEntries.get(path), bytes)).map(([path]) => path)
  );
  let completedFiles = matchingPaths.size;
  let completedBytes = orderedEntries.reduce(
    (sum, [path, bytes]) => sum + (matchingPaths.has(path) ? bytes.byteLength : 0),
    0
  );
  reportDirectoryWriteProgress(
    onProgress,
    "destination",
    completedBytes,
    totalBytes,
    completedFiles,
    orderedEntries.length
  );
  for (const [path, bytes] of orderedEntries) {
    if (matchingPaths.has(path)) continue;
    try {
      await writeDirectoryFile(root, path, bytes);
    } catch (writeError) {
      try {
        const previousBytes = existingEntries.get(path);
        if (previousBytes) await writeDirectoryFile(root, path, previousBytes);
        else await removeDirectoryFile(root, path);
      } catch (cleanupError) {
        throw new AggregateError(
          [writeError, cleanupError],
          "Terrain Project export failed and cleanup was incomplete",
          { cause: writeError }
        );
      }
      throw writeError;
    }
    completedFiles++;
    completedBytes += bytes.byteLength;
    reportDirectoryWriteProgress(
      onProgress,
      "writing",
      completedBytes,
      totalBytes,
      completedFiles,
      orderedEntries.length
    );
  }
  reportDirectoryWriteProgress(
    onProgress,
    "verification",
    completedBytes,
    totalBytes,
    completedFiles,
    orderedEntries.length
  );
  await requireDirectoryPathSet(root, snapshot);
  reportDirectoryWriteProgress(
    onProgress,
    "complete",
    totalBytes,
    totalBytes,
    orderedEntries.length,
    orderedEntries.length
  );
}

/**
 * Creates a temporary browser transport for loading a physical artifact through the stock Project loader.
 * @param artifactEntries Physical root `project.json` and declared `public/` files.
 * @returns A Project object URL plus an idempotent cleanup operation for every generated URL.
 * @throws If the physical artifact is invalid or the browser does not support Blob object URLs.
 */
export function createTerrainProjectObjectUrlTransport(
  artifactEntries: TerrainProjectArtifactEntries
): TerrainProjectObjectUrlTransport {
  validateArtifactPathKeys(artifactEntries);
  const rootBytes = requireArtifactBytes(artifactEntries, PROJECT_ROOT_PATH);
  const project = parseProjectManifest(rootBytes);
  const physicalPaths = validateProjectPhysicalPaths(project);
  const urlConstructor = globalThis.URL;
  if (
    typeof Blob === "undefined" ||
    typeof urlConstructor?.createObjectURL !== "function" ||
    typeof urlConstructor.revokeObjectURL !== "function"
  ) {
    throw new Error("Terrain Project preview requires browser Blob object-URL support");
  }

  const createObjectURL = urlConstructor.createObjectURL.bind(urlConstructor);
  const revokeObjectURL = urlConstructor.revokeObjectURL.bind(urlConstructor);
  const objectUrls: string[] = [];
  const revokeAll = (): void => {
    for (const url of objectUrls.splice(0)) {
      try {
        revokeObjectURL(url);
      } catch {
        // Cleanup is best-effort and idempotent; one browser failure must not leak the remaining URLs.
      }
    }
  };

  try {
    const transportFiles: TerrainProjectFile["files"] = [];
    visitDeclaredProjectFiles(artifactEntries, project, physicalPaths, (file, physicalPath, bytes) => {
      const resourceUrl = createObjectURL(new Blob([bytes], { type: inferMimeType(physicalPath, file.type) }));
      objectUrls.push(resourceUrl);
      transportFiles.push(createTerrainEditorPreviewFile(file, resourceUrl));
    });
    const transportProjectBytes = textEncoder.encode(JSON.stringify({ ...project, files: transportFiles }));
    const projectUrl = createObjectURL(new Blob([transportProjectBytes], { type: "application/json" }));
    objectUrls.push(projectUrl);
    return {
      projectUrl,
      revoke: revokeAll
    };
  } catch (error) {
    revokeAll();
    throw error;
  }
}

function createTerrainEditorPreviewFile(
  file: TerrainProjectFile["files"][number],
  path: string
): TerrainProjectFile["files"][number] {
  return {
    ...file,
    path,
    type: file.type === "Shader" && file.path.endsWith(".shaderc") ? TERRAIN_EDITOR_SHADER_ASSET_TYPE : file.type
  };
}

function parsePrecompiledShader(source: string, url: string): TerrainEditorPrecompiledShader {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch (error) {
    throw new Error(`Terrain editor Shader "${url}" is not valid precompiled JSON`, { cause: error });
  }
  if (!data || typeof data !== "object" || typeof (data as TerrainEditorPrecompiledShader).name !== "string") {
    throw new Error(`Terrain editor Shader "${url}" requires a precompiled name`);
  }
  return data as TerrainEditorPrecompiledShader;
}

async function validateArtifactEntries(
  artifactEntries: ReadonlyMap<string, Uint8Array>
): Promise<TerrainProjectArtifactEntries> {
  const snapshot = snapshotArtifactEntries(artifactEntries);
  const normalized = await normalizeTerrainCompressedProjectArtifact(snapshot);
  const virtualEntries = createBorrowedVirtualEntries(normalized);
  await importTerrainProject(virtualEntries);
  return normalized;
}

function snapshotArtifactEntries(artifactEntries: ReadonlyMap<string, Uint8Array>): TerrainProjectArtifactEntries {
  const snapshot = new Map<string, Uint8Array>();
  const physicalAliases = new Map<string, string>();
  for (const [path, bytes] of artifactEntries) {
    const physicalPath = requireTerrainArtifactRelativePath(path, "Terrain Project physical artifact path");
    registerPhysicalAlias(physicalAliases, physicalPath, "Terrain Project physical artifact");
    if (!(bytes instanceof Uint8Array)) {
      throw new Error(`Terrain Project physical artifact "${physicalPath}" must contain Uint8Array bytes`);
    }
    snapshot.set(physicalPath, bytes);
  }
  const rootBytes = snapshot.get(PROJECT_ROOT_PATH);
  if (!rootBytes) throw new Error("Terrain Project physical artifact requires root project.json");
  return new Map(
    [...snapshot].sort(([left], [right]) => compareTerrainStableValues(left, right))
  ) as TerrainProjectArtifactEntries;
}

function createBorrowedVirtualEntries(
  artifactEntries: ReadonlyMap<string, Uint8Array>
): ReadonlyMap<string, Uint8Array> {
  validateArtifactPathKeys(artifactEntries);
  const rootBytes = requireArtifactBytes(artifactEntries, PROJECT_ROOT_PATH);
  const project = parseProjectManifest(rootBytes);
  const physicalPaths = validateProjectPhysicalPaths(project);
  const virtualEntries = new Map<string, Uint8Array>([[PROJECT_ROOT_PATH, rootBytes]]);
  visitDeclaredProjectFiles(artifactEntries, project, physicalPaths, (_file, _physicalPath, bytes, virtualPath) =>
    virtualEntries.set(virtualPath, bytes)
  );
  return virtualEntries;
}

function validateArtifactPathKeys(artifactEntries: ReadonlyMap<string, Uint8Array>): void {
  const aliases = new Map<string, string>();
  for (const path of artifactEntries.keys()) {
    const physicalPath = requireTerrainArtifactRelativePath(path, "Terrain Project physical artifact path");
    registerPhysicalAlias(aliases, physicalPath, "Terrain Project physical artifact");
  }
}

function visitDeclaredProjectFiles(
  artifactEntries: ReadonlyMap<string, Uint8Array>,
  project: TerrainProjectFile,
  physicalPaths: readonly string[],
  visitor: (
    file: TerrainProjectFile["files"][number],
    physicalPath: string,
    bytes: Uint8Array,
    virtualPath: string
  ) => void
): void {
  const declaredPhysicalPaths = new Set<string>([PROJECT_ROOT_PATH]);
  const virtualPaths = new Set<string>([PROJECT_ROOT_PATH]);
  for (let index = 0; index < project.files.length; index++) {
    const file = project.files[index];
    const virtualPath = requireTerrainArtifactRelativePath(file?.virtualPath, "Terrain Project virtual path");
    if (virtualPaths.has(virtualPath)) {
      throw new Error(`Terrain Project artifact contains duplicate virtual path "${virtualPath}"`);
    }
    virtualPaths.add(virtualPath);
    const physicalPath = physicalPaths[index];
    declaredPhysicalPaths.add(physicalPath);
    visitor(file, physicalPath, requireArtifactBytes(artifactEntries, physicalPath), virtualPath);
  }
  if (artifactEntries.size !== declaredPhysicalPaths.size) {
    throw new Error("Terrain Project artifact contains an undeclared physical file");
  }
}

function requireArtifactBytes(artifactEntries: ReadonlyMap<string, Uint8Array>, physicalPath: string): Uint8Array {
  const bytes = artifactEntries.get(physicalPath);
  if (!bytes) throw new Error(`Terrain Project artifact is missing physical file "${physicalPath}"`);
  if (!(bytes instanceof Uint8Array)) {
    throw new Error(`Terrain Project physical artifact "${physicalPath}" must contain Uint8Array bytes`);
  }
  return bytes;
}

function parseProjectManifest(bytes: Uint8Array): TerrainProjectFile {
  let project: unknown;
  try {
    project = JSON.parse(textDecoder.decode(bytes));
  } catch (error) {
    throw new Error("Terrain Project physical artifact project.json is invalid JSON", { cause: error });
  }
  if (!project || typeof project !== "object" || !Array.isArray((project as TerrainProjectFile).files)) {
    throw new Error("Terrain Project physical artifact project.json requires a standard files array");
  }
  return project as TerrainProjectFile;
}

function validateProjectPhysicalPaths(project: TerrainProjectFile): string[] {
  const physicalPaths: string[] = [];
  const aliases = new Map<string, string>([[pathAliasKey(PROJECT_ROOT_PATH), PROJECT_ROOT_PATH]]);
  for (const file of project.files) {
    const physicalPath = requirePublicPhysicalPath(file?.path, "Terrain Project declared physical path");
    registerPhysicalAlias(aliases, physicalPath, "Terrain Project declaration");
    physicalPaths.push(physicalPath);
  }
  return physicalPaths;
}

function requirePublicPhysicalPath(value: unknown, label: string): string {
  const path = requireTerrainArtifactRelativePath(value, label);
  if (!path.startsWith(PUBLIC_ROOT_PREFIX)) throw new Error(`${label} must stay inside public/`);
  return path;
}

function registerPhysicalAlias(aliases: Map<string, string>, path: string, label: string): void {
  const key = pathAliasKey(path);
  const existing = aliases.get(key);
  if (existing !== undefined) {
    throw new Error(`${label} contains physical path aliases "${existing}" and "${path}"`);
  }
  aliases.set(key, path);
}

function pathAliasKey(path: string): string {
  return path.normalize("NFC").toLowerCase().normalize("NFC");
}

function requireHttpProjectUrl(projectUrl: string | URL): URL {
  let url: URL;
  try {
    url = new URL(typeof projectUrl === "string" ? projectUrl : projectUrl.href);
  } catch (error) {
    throw new Error("Terrain Project URL must be an absolute HTTP(S) project.json URL", { cause: error });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Terrain Project URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Terrain Project URL must not embed credentials");
  }
  const pathSegments = url.pathname.split("/");
  if (pathSegments[pathSegments.length - 1] !== PROJECT_ROOT_PATH || url.hash) {
    throw new Error("Terrain Project URL must identify exact root project.json without a fragment");
  }
  return url;
}

async function fetchBytes(url: URL, label: string): Promise<Uint8Array> {
  if (typeof globalThis.fetch !== "function") throw new Error("Terrain Project HTTP import requires fetch support");
  let response: Response;
  try {
    response = await globalThis.fetch(url.href);
  } catch (error) {
    throw new Error(`Terrain Project HTTP request failed for "${label}"`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`Terrain Project HTTP request failed for "${label}" with status ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchDeclaredProjectFiles(paths: readonly string[], baseUrl: URL): Promise<Uint8Array[]> {
  const results = new Array<Uint8Array>(paths.length);
  let nextIndex = 0;
  const workerCount = Math.min(HTTP_FETCH_CONCURRENCY, paths.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < paths.length) {
      const index = nextIndex++;
      results[index] = await fetchBytes(new URL(paths[index], baseUrl), paths[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function collectDirectoryFiles(
  directory: TerrainProjectDirectoryHandle,
  parentPath: string,
  files: Map<string, Uint8Array>,
  aliases: Map<string, string>
): Promise<void> {
  for await (const [entryName, handle] of directory.entries()) {
    const name = requireFileSystemEntryName(entryName);
    if (!handle || handle.name !== name) {
      throw new Error(`Terrain Project directory entry "${name}" does not match its browser handle`);
    }
    if (handle.kind === "file" && IGNORED_DIRECTORY_METADATA_FILE_NAMES.has(name)) continue;
    const path = parentPath ? `${parentPath}/${name}` : name;
    registerPhysicalAlias(aliases, path, "Terrain Project directory");
    if (handle.kind === "directory") {
      await collectDirectoryFiles(handle, path, files, aliases);
    } else if (handle.kind === "file") {
      const file = await handle.getFile();
      if (!file || typeof file.arrayBuffer !== "function") {
        throw new Error(`Terrain Project directory file "${path}" is unreadable`);
      }
      files.set(path, new Uint8Array(await file.arrayBuffer()));
    } else {
      throw new Error(`Terrain Project directory entry "${path}" has an unsupported handle kind`);
    }
  }
}

function requireFileSystemEntryName(value: unknown): string {
  const name = requireTerrainArtifactRelativePath(value, "Terrain Project directory entry name");
  if (name.includes("/")) throw new Error(`Terrain Project directory entry name "${name}" must be one path segment`);
  return name;
}

function requireDirectoryHandle(root: TerrainProjectDirectoryHandle): void {
  if (!root || root.kind !== "directory" || typeof root.entries !== "function") {
    throw new Error("Terrain Project folder I/O requires a browser directory handle");
  }
}

function requireWritableDirectoryHandle(root: TerrainProjectDirectoryHandle): void {
  requireDirectoryHandle(root);
  if (
    typeof root.getDirectoryHandle !== "function" ||
    typeof root.getFileHandle !== "function" ||
    typeof root.removeEntry !== "function"
  ) {
    throw new Error("Terrain Project export requires a writable browser directory handle");
  }
}

async function readDirectoryExportEntries(root: TerrainProjectDirectoryHandle): Promise<TerrainProjectArtifactEntries> {
  const existingEntries = new Map<string, Uint8Array>();
  await collectDirectoryFiles(root, "", existingEntries, new Map());
  return existingEntries;
}

function requirePartialDirectoryPaths(
  existingEntries: TerrainProjectArtifactEntries,
  artifactEntries: TerrainProjectArtifactEntries
): void {
  for (const path of existingEntries.keys()) {
    if (!artifactEntries.has(path)) {
      throw new Error("Terrain Project export directory contains files outside the current Project artifact");
    }
  }
}

async function requireDirectoryMatchesArtifact(
  root: TerrainProjectDirectoryHandle,
  artifactEntries: TerrainProjectArtifactEntries
): Promise<void> {
  const actualPaths = await collectDirectoryPhysicalPaths(root);
  const expectedPaths = new Set(artifactEntries.keys());
  if (actualPaths.size !== expectedPaths.size || [...expectedPaths].some((path) => !actualPaths.has(path))) {
    throw new Error("Terrain Project directory changed after import; import it again before exporting");
  }
  const projectHandle = await root.getFileHandle(PROJECT_ROOT_PATH);
  const projectFile = await projectHandle.getFile();
  const actualProjectBytes = new Uint8Array(await projectFile.arrayBuffer());
  if (!equalBytes(actualProjectBytes, artifactEntries.get(PROJECT_ROOT_PATH)!)) {
    throw new Error("Terrain Project root project.json changed after import; import it again before exporting");
  }
}

async function replaceTerrainProjectDirectory(
  root: TerrainProjectDirectoryHandle,
  previousArtifactEntries: TerrainProjectArtifactEntries,
  nextArtifactEntries: TerrainProjectArtifactEntries,
  onProgress?: TerrainProjectDirectoryWriteProgressHandler
): Promise<void> {
  const touchedPaths = new Set<string>();
  const orderedEntries = orderedArtifactEntries(nextArtifactEntries);
  const changedEntries = orderedEntries.filter(
    ([path, bytes]) => !equalBytes(previousArtifactEntries.get(path), bytes)
  );
  const changedPaths = new Set(changedEntries.map(([path]) => path));
  const totalBytes = orderedEntries.reduce((sum, [, bytes]) => sum + bytes.byteLength, 0);
  let completedFiles = orderedEntries.length - changedEntries.length;
  let completedBytes = orderedEntries.reduce(
    (sum, [path, bytes]) => sum + (changedPaths.has(path) ? 0 : bytes.byteLength),
    0
  );
  const removedPaths = [...previousArtifactEntries.keys()]
    .filter((path) => !nextArtifactEntries.has(path))
    .sort(comparePathsDeepestFirst);

  reportDirectoryWriteProgress(
    onProgress,
    "destination",
    completedBytes,
    totalBytes,
    completedFiles,
    orderedEntries.length
  );

  try {
    for (const [path, bytes] of changedEntries) {
      touchedPaths.add(path);
      await writeDirectoryFile(root, path, bytes);
      completedFiles++;
      completedBytes += bytes.byteLength;
      reportDirectoryWriteProgress(
        onProgress,
        "writing",
        completedBytes,
        totalBytes,
        completedFiles,
        orderedEntries.length
      );
    }
    for (const path of removedPaths) {
      touchedPaths.add(path);
      await removeDirectoryFile(root, path);
    }
    reportDirectoryWriteProgress(
      onProgress,
      "verification",
      completedBytes,
      totalBytes,
      completedFiles,
      orderedEntries.length
    );
    await requireDirectoryPathSet(root, nextArtifactEntries);
  } catch (writeError) {
    const rollbackErrors = await restoreTerrainProjectDirectory(root, previousArtifactEntries, touchedPaths);
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [writeError, ...rollbackErrors],
        "Terrain Project export failed and rollback was incomplete",
        { cause: writeError }
      );
    }
    throw writeError;
  }
}

function reportDirectoryWriteProgress(
  onProgress: TerrainProjectDirectoryWriteProgressHandler | undefined,
  phase: TerrainProjectDirectoryWritePhase,
  completedBytes: number,
  totalBytes: number,
  completedFiles: number,
  fileCount: number
): void {
  if (!onProgress) return;
  const percent =
    phase === "complete" ? 100 : Math.min(99, totalBytes > 0 ? Math.floor((completedBytes / totalBytes) * 100) : 0);
  onProgress({ percent, phase, completedBytes, totalBytes, completedFiles, fileCount });
}

async function restoreTerrainProjectDirectory(
  root: TerrainProjectDirectoryHandle,
  previousArtifactEntries: TerrainProjectArtifactEntries,
  touchedPaths: ReadonlySet<string>
): Promise<unknown[]> {
  const rollbackErrors: unknown[] = [];
  const touchedResourcePaths = [...touchedPaths]
    .filter((path) => path !== PROJECT_ROOT_PATH)
    .sort(compareTerrainStableValues);
  for (const path of touchedResourcePaths) {
    try {
      const previousBytes = previousArtifactEntries.get(path);
      if (previousBytes) await writeDirectoryFile(root, path, previousBytes);
      else await removeDirectoryFile(root, path);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  if (touchedPaths.has(PROJECT_ROOT_PATH)) {
    try {
      await writeDirectoryFile(root, PROJECT_ROOT_PATH, previousArtifactEntries.get(PROJECT_ROOT_PATH)!);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  try {
    await requireDirectoryPathSet(root, previousArtifactEntries);
  } catch (error) {
    rollbackErrors.push(error);
  }
  return rollbackErrors;
}

function orderedArtifactEntries(artifactEntries: TerrainProjectArtifactEntries): Array<readonly [string, Uint8Array]> {
  return [
    ...[...artifactEntries].filter(([path]) => path !== PROJECT_ROOT_PATH),
    [PROJECT_ROOT_PATH, artifactEntries.get(PROJECT_ROOT_PATH)!] as const
  ];
}

async function requireDirectoryPathSet(
  root: TerrainProjectDirectoryHandle,
  artifactEntries: TerrainProjectArtifactEntries
): Promise<void> {
  const actualPaths = await collectDirectoryPhysicalPaths(root);
  const expectedPaths = new Set(artifactEntries.keys());
  if (actualPaths.size !== expectedPaths.size || [...expectedPaths].some((path) => !actualPaths.has(path))) {
    throw new Error("Terrain Project export did not produce the verified physical file set");
  }
}

async function collectDirectoryPhysicalPaths(root: TerrainProjectDirectoryHandle): Promise<Set<string>> {
  const paths = new Set<string>();
  const aliases = new Map<string, string>();
  await collectDirectoryPaths(root, "", paths, aliases);
  return paths;
}

async function collectDirectoryPaths(
  directory: TerrainProjectDirectoryHandle,
  parentPath: string,
  paths: Set<string>,
  aliases: Map<string, string>
): Promise<void> {
  for await (const [entryName, handle] of directory.entries()) {
    const name = requireFileSystemEntryName(entryName);
    if (!handle || handle.name !== name) {
      throw new Error(`Terrain Project directory entry "${name}" does not match its browser handle`);
    }
    if (handle.kind === "file" && IGNORED_DIRECTORY_METADATA_FILE_NAMES.has(name)) continue;
    const path = parentPath ? `${parentPath}/${name}` : name;
    registerPhysicalAlias(aliases, path, "Terrain Project directory");
    if (handle.kind === "directory") await collectDirectoryPaths(handle, path, paths, aliases);
    else if (handle.kind === "file") paths.add(path);
    else throw new Error(`Terrain Project directory entry "${path}" has an unsupported handle kind`);
  }
}

async function removeDirectoryFile(root: TerrainProjectDirectoryHandle, physicalPath: string): Promise<void> {
  const segments = physicalPath.split("/");
  const fileName = segments.pop()!;
  let directory = root;
  const ancestors: Array<{
    parent: TerrainProjectDirectoryHandle;
    name: string;
    directory: TerrainProjectDirectoryHandle;
  }> = [];
  for (const segment of segments) {
    const handle = await findDirectoryEntry(directory, segment);
    if (!handle) return;
    if (handle.kind !== "directory") throw new Error(`Terrain Project path "${physicalPath}" is not a file`);
    ancestors.push({ parent: directory, name: segment, directory: handle });
    directory = handle;
  }
  const fileHandle = await findDirectoryEntry(directory, fileName);
  if (!fileHandle) return;
  if (fileHandle.kind !== "file") throw new Error(`Terrain Project path "${physicalPath}" is not a file`);
  await directory.removeEntry(fileName);
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const ancestor = ancestors[index];
    if (await directoryHasEntries(ancestor.directory)) break;
    await ancestor.parent.removeEntry(ancestor.name);
  }
}

async function findDirectoryEntry(
  directory: TerrainProjectDirectoryHandle,
  name: string
): Promise<TerrainProjectFileSystemHandle | undefined> {
  for await (const [entryName, handle] of directory.entries()) {
    if (entryName === name) return handle;
  }
  return undefined;
}

async function directoryHasEntries(directory: TerrainProjectDirectoryHandle): Promise<boolean> {
  for await (const _entry of directory.entries()) return true;
  return false;
}

function comparePathsDeepestFirst(left: string, right: string): number {
  return right.split("/").length - left.split("/").length || compareTerrainStableValues(left, right);
}

function equalBytes(left: Uint8Array | undefined, right: Uint8Array): boolean {
  if (!left || left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < right.byteLength; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function writeDirectoryFile(
  root: TerrainProjectDirectoryHandle,
  physicalPath: string,
  bytes: Uint8Array
): Promise<void> {
  const segments = physicalPath.split("/");
  const fileName = segments.pop()!;
  let directory = root;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort?.(error);
    } catch (abortError) {
      throw new AggregateError([error, abortError], "Terrain Project export could not abandon the current file", {
        cause: error
      });
    }
    throw error;
  }
}

function inferMimeType(path: string, type: string): string {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  switch (extension) {
    case ".json":
    case ".scene":
    case ".prefab":
    case ".mat":
    case ".shaderc":
      return "application/json";
    case ".shader":
    case ".glsl":
      return "text/plain";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ktx":
      return "image/ktx";
    case ".ktx2":
      return "image/ktx2";
    case ".gltf":
      return "model/gltf+json";
    case ".glb":
      return "model/gltf-binary";
    case ".mp3":
      return "audio/mpeg";
    case ".ogg":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    default:
      return type === "JSON" ? "application/json" : "application/octet-stream";
  }
}

function createManifestObjectUrlTransport(project: TerrainProjectFile): TerrainProjectObjectUrlTransport {
  const urlConstructor = globalThis.URL;
  if (
    typeof Blob === "undefined" ||
    typeof urlConstructor?.createObjectURL !== "function" ||
    typeof urlConstructor.revokeObjectURL !== "function"
  ) {
    throw new Error("Terrain Project preview requires browser Blob object-URL support");
  }
  const projectBytes = textEncoder.encode(JSON.stringify(project));
  const projectUrl = urlConstructor.createObjectURL(new Blob([projectBytes], { type: "application/json" }));
  let revoked = false;
  return {
    projectUrl,
    revoke: () => {
      if (revoked) return;
      revoked = true;
      urlConstructor.revokeObjectURL(projectUrl);
    }
  };
}
