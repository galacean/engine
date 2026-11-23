import { sameRuntimeProjectContent } from "./runtime-project-content";
import { validateProjectDependenciesWithPaths } from "./runtime-project-dependencies";
import {
  ProjectPathConflictError,
  READ_ONLY_PROJECT_ROOTS,
  type ProjectFileProvider
} from "../../project-files/virtual-project-files";

const SCHEME_PREFIX_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const BLOCKED_ASSET_ROOTS = new Set<string>([...READ_ONLY_PROJECT_ROOTS, "editor", "engine"]);
const BLOCKED_ASSET_METAS = new Set<string>([...BLOCKED_ASSET_ROOTS].map((root) => `${root}.meta`));

/** Same resource identity and virtual-path mapping used by the engine ProjectLoader. */
export interface RuntimeProjectManifest {
  engineVersion?: string;
  scene: string;
  scenes?: string[];
  files: Array<{
    virtualPath: string;
    path: string;
    type: string;
    params?: Record<string, unknown>;
    /** Direct virtual-path references maintained with the asset content. Missing means unknown, not empty. */
    dependencies?: string[];
  }>;
  /** Explicit author-owned folders, including empty imported folders. */
  directories?: string[];
}

/** Bump for incompatible saved-project changes, including embedded asset schemas. */
export const RUNTIME_PROJECT_SAVE_VERSION = 7 as const;

/** Binary files remain binary; only authored/overridden content needs to be embedded. */
export interface RuntimeProjectPackage {
  version: typeof RUNTIME_PROJECT_SAVE_VERSION;
  project: RuntimeProjectManifest;
  contents: Record<string, string | Uint8Array>;
  /** Asset-relative documentation paths; these are not Engine assets. */
  documents?: Record<string, string>;
}

/** Asset identity and embedded text for source resolvers. Binary payloads stay with the package owner. */
export function lookupRuntimeProjectTextAsset(
  pack: RuntimeProjectPackage,
  path: string
): { readonly type: string; readonly text?: string } | undefined {
  const file = pack.project.files.find((entry) => entry.virtualPath === path);
  if (!file) return undefined;
  const content = pack.contents[path];
  return { type: file.type, text: typeof content === "string" ? content : undefined };
}

/** Text is immutable. Copy only containers and mutable bytes at ownership boundaries. */
export function cloneRuntimeProjectContent(content: string | Uint8Array): string | Uint8Array {
  if (typeof content === "string") return content;
  if (!(content instanceof Uint8Array)) throw new Error("Invalid runtime asset content");
  return new Uint8Array(content);
}

function clonePlainValue<T>(value: T, depth = 0): T {
  if (value === null || typeof value !== "object") return value;
  if (depth > 16) return structuredClone(value);
  if (Array.isArray(value)) {
    const len = value.length;
    const out = new Array(len);
    for (let i = 0; i < len; i++) {
      if (Object.hasOwn(value, i)) out[i] = clonePlainValue(value[i], depth + 1);
    }
    return out as unknown as T;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return structuredClone(value);
  const out: Record<string, unknown> = proto === null ? Object.create(null) : {};
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    const cloned = clonePlainValue((value as Record<string, unknown>)[key], depth + 1);
    if (key === "__proto__") {
      Object.defineProperty(out, key, { value: cloned, enumerable: true, writable: true, configurable: true });
    } else {
      out[key] = cloned;
    }
  }
  return out as T;
}

/** Clone a runtime manifest without invoking full structuredClone over every descriptor. */
export function cloneRuntimeProjectManifest(manifest: RuntimeProjectManifest): RuntimeProjectManifest {
  const srcFiles = manifest.files;
  const files: RuntimeProjectManifest["files"] = new Array(srcFiles.length);
  for (let i = 0; i < srcFiles.length; i++) {
    const file = srcFiles[i];
    const copy: Record<string, unknown> = {};
    for (const key in file) {
      if (!Object.hasOwn(file, key)) continue;
      const val = (file as Record<string, unknown>)[key];
      const cloned = key === "virtualPath" || key === "path" || key === "type" ? val : clonePlainValue(val);
      if (key === "__proto__") {
        Object.defineProperty(copy, key, { value: cloned, enumerable: true, writable: true, configurable: true });
      } else {
        copy[key] = cloned;
      }
    }
    files[i] = copy as RuntimeProjectManifest["files"][number];
  }
  const out: Record<string, unknown> = {};
  for (const key in manifest) {
    if (!Object.hasOwn(manifest, key)) continue;
    const val = (manifest as unknown as Record<string, unknown>)[key];
    const cloned = key === "files" ? files : key === "scene" || key === "engineVersion" ? val : clonePlainValue(val);
    if (key === "__proto__") {
      Object.defineProperty(out, key, { value: cloned, enumerable: true, writable: true, configurable: true });
    } else {
      out[key] = cloned;
    }
  }
  return out as unknown as RuntimeProjectManifest;
}

/** Detached package without serializing unchanged text assets into new strings. */
export function cloneRuntimeProjectPackage(pack: RuntimeProjectPackage): RuntimeProjectPackage {
  const srcContents = pack.contents;
  if (!srcContents || typeof srcContents !== "object") {
    throw new TypeError("Invalid runtime project contents");
  }
  const nextContents: Record<string, string | Uint8Array> = {};
  for (const path in srcContents) {
    if (!Object.hasOwn(srcContents, path)) continue;
    const cloned = cloneRuntimeProjectContent(srcContents[path]);
    if (path === "__proto__") {
      Object.defineProperty(nextContents, path, {
        value: cloned,
        enumerable: true,
        writable: true,
        configurable: true
      });
    } else {
      nextContents[path] = cloned;
    }
  }
  const nextProject =
    pack.project && typeof pack.project === "object" && Array.isArray(pack.project.files)
      ? cloneRuntimeProjectManifest(pack.project)
      : clonePlainValue(pack.project);
  const out: Record<string, unknown> = {};
  for (const key in pack) {
    if (!Object.hasOwn(pack, key)) continue;
    if (key === "project") out.project = nextProject;
    else if (key === "contents") out.contents = nextContents;
    else if (key === "documents") {
      if (pack.documents !== undefined) {
        out.documents =
          typeof pack.documents === "object" && pack.documents !== null && !Array.isArray(pack.documents)
            ? { ...pack.documents }
            : clonePlainValue(pack.documents);
      }
    } else {
      out[key] = clonePlainValue((pack as unknown as Record<string, unknown>)[key]);
    }
  }
  return out as unknown as RuntimeProjectPackage;
}

function addParentDirectories(directories: Set<string>, path: string): void {
  // All paths entering here are already validated (non-empty segments, no leading/trailing slash).
  for (let end = path.lastIndexOf("/"); end !== -1; end = path.lastIndexOf("/", end - 1)) {
    const dir = path.slice(0, end);
    // Invariant: every addition adds parent dirs before itself, so an existing entry guarantees its ancestors exist.
    if (directories.has(dir)) break;
    directories.add(dir);
  }
}

function hasDuplicateStrings(items: readonly string[]): boolean {
  const len = items.length;
  if (len <= 1) return false;
  if (len <= 8) {
    for (let i = 0; i < len - 1; i++) {
      const a = items[i];
      for (let j = i + 1; j < len; j++) {
        if (a === items[j]) return true;
      }
    }
    return false;
  }
  return new Set(items).size !== len;
}

function validateRuntimeProjectInternal(value: RuntimeProjectPackage): Set<string> {
  if (
    value?.version !== RUNTIME_PROJECT_SAVE_VERSION ||
    !value.project ||
    !Array.isArray(value.project.files) ||
    typeof value.project.scene !== "string" ||
    (value.project.scenes !== undefined &&
      (!Array.isArray(value.project.scenes) || value.project.scenes.some((scene) => typeof scene !== "string"))) ||
    !value.contents ||
    typeof value.contents !== "object" ||
    Array.isArray(value.contents)
  ) {
    throw new Error("Invalid runtime project package");
  }
  const files = value.project.files;
  const paths = new Set<string>();
  const scenes = new Set<string>();
  const directories = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file || typeof file.type !== "string" || !file.type || typeof file.path !== "string" || !file.path) {
      throw new Error("Invalid or duplicate runtime asset identity");
    }
    if (Object.hasOwn(file, "id")) throw new Error("Asset IDs are not supported; use virtualPath");
    if (file.dependencies !== undefined) {
      if (!Array.isArray(file.dependencies) || hasDuplicateStrings(file.dependencies)) {
        throw new Error(`Invalid asset dependencies: '${file.virtualPath}'`);
      }
    }
    assertAssetPath(file.virtualPath);
    if (file.virtualPath.endsWith(".meta")) throw new Error("Metadata sidecars are documents, not Engine assets");
    if (paths.has(file.virtualPath)) throw new ProjectPathConflictError(file.virtualPath, file.virtualPath, "file");
    paths.add(file.virtualPath);
    if (file.type === "Scene") scenes.add(file.virtualPath);
    addParentDirectories(directories, file.virtualPath);
  }
  for (let i = 0; i < files.length; i++) {
    const dependencies = files[i].dependencies;
    if (dependencies === undefined) continue;
    for (let j = 0; j < dependencies.length; j++) {
      const dependency = dependencies[j];
      if (!paths.has(dependency)) assertAssetPath(dependency);
    }
  }
  if (!scenes.has(value.project.scene)) throw new Error(`Unregistered runtime Scene '${value.project.scene}'`);
  const extraScenes = value.project.scenes;
  if (extraScenes !== undefined) {
    for (let i = 0; i < extraScenes.length; i++) {
      const scene = extraScenes[i];
      if (!scenes.has(scene)) throw new Error(`Unregistered runtime Scene '${scene}'`);
    }
  }
  const documents = value.documents;
  if (documents !== undefined && (!documents || typeof documents !== "object" || Array.isArray(documents))) {
    throw new Error("Invalid project documents");
  }
  const projectDirs = value.project.directories;
  if (projectDirs !== undefined) {
    if (!Array.isArray(projectDirs) || hasDuplicateStrings(projectDirs)) {
      throw new Error("Invalid project directories");
    }
    for (let i = 0; i < projectDirs.length; i++) {
      const directory = projectDirs[i];
      assertAssetPath(directory);
      if (directory.endsWith(".meta")) throw new Error("Directory names cannot use the .meta suffix");
      addParentDirectories(directories, directory);
      directories.add(directory);
    }
  }
  if (documents !== undefined) {
    for (const path in documents) {
      if (!Object.hasOwn(documents, path)) continue;
      assertAssetPath(path);
      if (paths.has(path)) throw new ProjectPathConflictError(path, path, "file");
      const content = documents[path];
      if (typeof content !== "string") throw new Error(`Invalid project document '${path}'`);
      if (path.endsWith(".meta")) {
        const meta = JSON.parse(content);
        if (!meta || typeof meta.summary !== "string" || (meta.usage !== undefined && typeof meta.usage !== "string"))
          throw new Error(`Invalid metadata '${path}'`);
        const target = path.slice(0, -5);
        if (!paths.has(target)) throw new Error(`Orphan metadata '${path}'`);
      }
      addParentDirectories(directories, path);
    }
  }
  for (const dir of directories) {
    if (paths.has(dir) || (documents !== undefined && Object.hasOwn(documents, dir))) {
      throw new ProjectPathConflictError(dir, dir, "file");
    }
  }
  const contents = value.contents;
  for (const path in contents) {
    if (!Object.hasOwn(contents, path)) continue;
    if (!paths.has(path)) throw new Error(`Unregistered runtime asset content '${path}'`);
    const content = contents[path];
    if (typeof content !== "string" && !(content instanceof Uint8Array)) {
      throw new Error(`Invalid runtime asset content '${path}'`);
    }
  }
  return paths;
}

/** Validate project structure; direct dependency completeness is checked before persistence. */
export function validateRuntimeProject(value: RuntimeProjectPackage): void {
  validateRuntimeProjectInternal(value);
}

export function assertAssetPath(path: string): void {
  if (typeof path !== "string") throw new Error(`Invalid runtime asset path '${path}'`);
  const len = path.length;
  if (len === 0) throw new Error(`Invalid runtime asset path '${path}'`);
  let segStart = 0;
  let firstSlash = -1;
  let hasColon = false;
  for (let i = 0; i < len; i++) {
    const code = path.charCodeAt(i);
    if (code === 92 /* \ */ || code === 63 /* ? */ || code === 35 /* # */) {
      throw new Error(`Invalid runtime asset path '${path}'`);
    }
    if (code === 58 /* : */) {
      hasColon = true;
    } else if (code === 47 /* / */) {
      const segLen = i - segStart;
      if (
        segLen === 0 ||
        (segLen === 1 && path.charCodeAt(segStart) === 46) /* . */ ||
        (segLen === 2 && path.charCodeAt(segStart) === 46 && path.charCodeAt(segStart + 1) === 46)
      ) {
        throw new Error(`Invalid runtime asset path '${path}'`);
      }
      if (firstSlash === -1) firstSlash = i;
      segStart = i + 1;
    }
  }
  const tailLen = len - segStart;
  if (
    tailLen === 0 ||
    (tailLen === 1 && path.charCodeAt(segStart) === 46) ||
    (tailLen === 2 && path.charCodeAt(segStart) === 46 && path.charCodeAt(segStart + 1) === 46)
  ) {
    throw new Error(`Invalid runtime asset path '${path}'`);
  }
  if (hasColon && SCHEME_PREFIX_RE.test(path)) {
    throw new Error(`Invalid runtime asset path '${path}'`);
  }
  if (firstSlash === -1) {
    if (BLOCKED_ASSET_ROOTS.has(path) || BLOCKED_ASSET_METAS.has(path)) {
      throw new Error(`Invalid runtime asset path '${path}'`);
    }
  } else if (BLOCKED_ASSET_ROOTS.has(path.slice(0, firstSlash))) {
    throw new Error(`Invalid runtime asset path '${path}'`);
  }
}

export function assetMetadata(path: string, type: string, description?: { summary: string; usage?: string }) {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    type,
    summary: description?.summary ?? "",
    usage: description?.usage ?? ""
  };
}

/** Enumerate metadata identities without serializing every description during directory discovery. */
function projectMetadataTargets(pack: RuntimeProjectPackage): Map<string, string> {
  return new Map(pack.project.files.map((file) => [file.virtualPath, file.type]));
}

function projectMetadata(pack: RuntimeProjectPackage, path: string, type: string): string {
  const existing = pack.documents?.[`${path}.meta`];
  return JSON.stringify(assetMetadata(path, type, existing === undefined ? undefined : JSON.parse(existing)), null, 2);
}

/** Identity fields are always derived from the current project path/type, never copied from a source name. */
export function projectDocuments(pack: RuntimeProjectPackage): Record<string, string> {
  const result = { ...pack.documents };
  for (const [path, type] of projectMetadataTargets(pack)) result[`${path}.meta`] = projectMetadata(pack, path, type);
  return result;
}

/** Read-through adapter: package remains the single owner of project and asset data. */
export function runtimeProjectFiles(getPackage: () => RuntimeProjectPackage): ProjectFileProvider {
  // Existing URL-backed assets must be discoverable without downloading their contents.
  // Authored sidecars override these identity-based descriptions and remain persisted documents.
  return {
    directories: () => getPackage().project.directories ?? [],
    *paths() {
      const pack = getPackage();
      yield "project.json";
      for (const file of pack.project.files) yield file.virtualPath;
      yield* new Set([
        ...Object.keys(pack.documents ?? {}),
        ...[...projectMetadataTargets(pack).keys()].map((path) => `${path}.meta`)
      ]);
    },
    read(path) {
      const pack = getPackage();
      if (path === "project.json") return JSON.stringify(pack.project, null, 2);
      if (path.endsWith(".meta")) {
        const target = path.slice(0, -5);
        const type = pack.project.files.find((file) => file.virtualPath === target)?.type;
        if (type) return projectMetadata(pack, target, type);
      }
      if (Object.hasOwn(pack.documents ?? {}, path)) return pack.documents![path];
      if (!pack.project.files.some((file) => file.virtualPath === path)) return undefined;
      const content = pack.contents[path];
      if (content === undefined) throw new Error(`Asset content is not loaded: '${path}'`);
      return content;
    }
  };
}

const RUNTIME_PROJECT_DB_VERSION = 5;

/** Storage layout/version metadata is independent of the exported package format. */
type StoredProjectHeader = Omit<RuntimeProjectPackage, "contents" | "documents"> & {
  storageFormat: "files";
  contentPaths: string[];
  documentPaths?: string[];
};
type StoredProjectRevision = {
  storageRevision: string;
};
type StorageSnapshot = {
  revision: string;
  version: RuntimeProjectPackage["version"];
  project?: RuntimeProjectManifest;
  contents: RuntimeProjectPackage["contents"];
  documents?: RuntimeProjectPackage["documents"];
};

// Never exposed outside this module: callers hold only an opaque RuntimeProjectSnapshot token.
const snapshotPacks = new WeakMap<RuntimeProjectSnapshot, RuntimeProjectPackage>();

/** Validated, caller-isolated snapshot that can evolve content-only updates without re-cloning manifests. */
export class RuntimeProjectSnapshot {
  readonly #paths: ReadonlySet<string>;

  private constructor(pack: RuntimeProjectPackage, paths: ReadonlySet<string>) {
    this.#paths = paths;
    snapshotPacks.set(this, pack);
  }

  static create(value: RuntimeProjectPackage): RuntimeProjectSnapshot {
    const paths = validateRuntimeProjectInternal(value);
    validateProjectDependenciesWithPaths(value, paths);
    return new RuntimeProjectSnapshot(cloneRuntimeProjectPackage(value), paths);
  }

  hasPath(path: string): boolean {
    return this.#paths.has(path);
  }

  private writeContentEntry(
    nextContents: Record<string, string | Uint8Array>,
    path: string,
    content: string | Uint8Array
  ): void {
    if (!this.#paths.has(path)) throw new Error(`Unregistered runtime asset content '${path}'`);
    if (typeof content !== "string" && !(content instanceof Uint8Array)) {
      throw new Error(`Invalid runtime asset content '${path}'`);
    }
    const cloned = cloneRuntimeProjectContent(content);
    if (path === "__proto__") {
      Object.defineProperty(nextContents, path, {
        value: cloned,
        enumerable: true,
        writable: true,
        configurable: true
      });
    } else {
      nextContents[path] = cloned;
    }
  }

  withUpdatedContent(path: string, content: string | Uint8Array): RuntimeProjectSnapshot {
    const pack = snapshotPacks.get(this)!;
    const nextContents = { ...pack.contents };
    this.writeContentEntry(nextContents, path, content);
    return new RuntimeProjectSnapshot({ ...pack, contents: nextContents }, this.#paths);
  }

  withUpdatedContents(entries: ReadonlyArray<readonly [string, string | Uint8Array]>): RuntimeProjectSnapshot {
    if (entries.length === 0) return this;
    const pack = snapshotPacks.get(this)!;
    const nextContents = { ...pack.contents };
    for (let i = 0; i < entries.length; i++) {
      this.writeContentEntry(nextContents, entries[i][0], entries[i][1]);
    }
    return new RuntimeProjectSnapshot({ ...pack, contents: nextContents }, this.#paths);
  }
}

/** Each save atomically replaces the complete project; the last write transaction wins.
 * A matching private revision permits differential writes. Other writers invalidate
 * that optimization, never the right to save the caller's complete snapshot.
 */
export class RuntimeProjectStorage {
  // Private snapshots are exact comparison baselines, never exposed as mutable author data.
  private readonly snapshots = new Map<string, StorageSnapshot>();
  private readonly operations = new Map<string, Promise<unknown>>();
  private closed = false;
  constructor(private readonly database: IDBDatabase) {
    database.onversionchange = () => this.close();
  }

  static async open(factory: IDBFactory = indexedDB): Promise<RuntimeProjectStorage> {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open("galacean-runtime-projects", RUNTIME_PROJECT_DB_VERSION);
      let blocked = false;
      request.onupgradeneeded = () => {
        const database = request.result;
        // Single storage format: rebuild stores cleanly rather than migrating legacy records.
        for (const name of ["projects", "projectRevisions", "projectFiles"]) {
          if (database.objectStoreNames.contains(name)) database.deleteObjectStore(name);
        }
        database.createObjectStore("projects");
        const revisions = database.createObjectStore("projectRevisions");
        revisions.createIndex("storageRevision", "storageRevision", { unique: true });
        database.createObjectStore("projectFiles");
      };
      request.onblocked = () => {
        blocked = true;
        reject(new Error("请关闭其他工程页面后重试，以升级工程存储。"));
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (blocked) {
          request.result.close();
          return;
        }
        resolve(request.result);
      };
    });
    return new RuntimeProjectStorage(database);
  }

  load(id: string): Promise<RuntimeProjectPackage | undefined> {
    return this.enqueue(id, async () => {
      let stored: StoredProjectHeader | undefined;
      let revRecord: StoredProjectRevision | undefined;
      const result = await new Promise<RuntimeProjectPackage | undefined>((resolve, reject) => {
        // A reader sees one committed revision across header, revision, and file records.
        const transaction = this.database.transaction(["projects", "projectRevisions", "projectFiles"], "readonly");
        const headerRequest = transaction.objectStore("projects").get(id);
        const revRequest = transaction.objectStore("projectRevisions").get(id);
        let headerLoaded = false;
        let revLoaded = false;
        let result: RuntimeProjectPackage | undefined, failure: unknown;
        const onLoaded = () => {
          if (!headerLoaded || !revLoaded || failure) return;
          try {
            if (stored === undefined) {
              if (revRecord !== undefined) throw new Error("Invalid stored project header");
              return;
            }
            const { storageFormat, contentPaths, documentPaths, ...metadata } = stored;
            if (
              storageFormat !== "files" ||
              !Array.isArray(contentPaths) ||
              (documentPaths !== undefined && !Array.isArray(documentPaths)) ||
              typeof revRecord?.storageRevision !== "string" ||
              !revRecord.storageRevision
            )
              throw new Error("Invalid stored project header");
            result = { ...metadata, contents: {}, ...(documentPaths === undefined ? {} : { documents: {} }) };
            const files = transaction.objectStore("projectFiles");
            const read = (kind: string, paths: string[], target: Record<string, unknown>) => {
              if (new Set(paths).size !== paths.length) throw new Error("Duplicate stored project paths");
              for (const path of paths) {
                assertAssetPath(path);
                const reading = files.get([id, kind, path]);
                reading.onsuccess = () => {
                  if (failure) return;
                  if (reading.result === undefined) {
                    failure = new Error(`Missing stored project file '${path}'`);
                    transaction.abort();
                  } else
                    Object.defineProperty(target, path, {
                      value: reading.result,
                      enumerable: true,
                      writable: true,
                      configurable: true
                    });
                };
              }
            };
            read("asset", contentPaths, result.contents);
            read("document", documentPaths ?? [], result.documents ?? {});
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
        headerRequest.onsuccess = () => {
          stored = headerRequest.result;
          headerLoaded = true;
          onLoaded();
        };
        revRequest.onsuccess = () => {
          revRecord = revRequest.result;
          revLoaded = true;
          onLoaded();
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Project load aborted"));
      });
      if (result === undefined) {
        this.snapshots.delete(id);
        return undefined;
      }
      if (result.version !== RUNTIME_PROJECT_SAVE_VERSION)
        throw new Error(`Unsupported saved project version '${result.version}'`);
      const paths = validateRuntimeProjectInternal(result);
      validateProjectDependenciesWithPaths(result, paths);
      if (!this.closed) {
        const snapshotContents: RuntimeProjectPackage["contents"] = {};
        for (const path in result.contents) {
          if (!Object.hasOwn(result.contents, path)) continue;
          const cloned = cloneRuntimeProjectContent(result.contents[path]);
          if (path === "__proto__") {
            Object.defineProperty(snapshotContents, path, {
              value: cloned,
              enumerable: true,
              writable: true,
              configurable: true
            });
          } else {
            snapshotContents[path] = cloned;
          }
        }
        // Leave baseline project unset on load() so caller mutations to the returned
        // object cannot bypass the first save header write.
        this.snapshots.set(id, {
          revision: revRecord!.storageRevision,
          version: result.version,
          contents: snapshotContents,
          documents: result.documents && { ...result.documents }
        });
      }
      return result;
    });
  }

  async save(id: string, value: RuntimeProjectPackage): Promise<void> {
    const paths = validateRuntimeProjectInternal(value);
    validateProjectDependenciesWithPaths(value, paths);
    // Capture before queuing. Mutable bytes/metadata stay isolated; immutable text is shared.
    const candidate = cloneRuntimeProjectPackage(value);
    await this.savePrepared(id, candidate);
  }

  /** Save a pre-validated, caller-isolated snapshot owned by RuntimeProjectSession. */
  async saveSnapshot(id: string, snapshot: RuntimeProjectSnapshot): Promise<void> {
    const candidate = snapshotPacks.get(snapshot);
    if (!candidate) throw new TypeError("Invalid runtime project snapshot");
    await this.savePrepared(id, candidate);
  }

  private async savePrepared(id: string, candidate: RuntimeProjectPackage): Promise<void> {
    const { contents, documents } = candidate;
    const storageRevision = crypto.randomUUID();
    await this.enqueue(id, async () => {
      const expected = this.snapshots.get(id);
      await new Promise<void>((resolve, reject) => {
        const transaction = this.database.transaction(["projects", "projectRevisions", "projectFiles"], "readwrite");
        const projects = transaction.objectStore("projects"),
          revisions = transaction.objectStore("projectRevisions"),
          files = transaction.objectStore("projectFiles");
        const request = expected ? revisions.index("storageRevision").getKey(expected.revision) : revisions.getKey(id);
        let failure: unknown;
        request.onsuccess = () => {
          try {
            const baseline = expected && request.result === id ? expected : undefined;
            if (!baseline) {
              // All second key components are strings; an array is a strict upper bound.
              // Another writer or a recreated project requires a complete replacement:
              // comparing with this owner's stale files would mix snapshots.
              files.delete(IDBKeyRange.bound([id], [id, []]));
            }
            const write = (
              kind: string,
              next: RuntimeProjectPackage["contents"],
              previous: RuntimeProjectPackage["contents"] = {}
            ): boolean => {
              let pathsChanged = !baseline;
              for (const path in next) {
                if (!Object.hasOwn(next, path)) continue;
                const content = next[path];
                const existed = baseline !== undefined && Object.hasOwn(previous, path);
                if (!existed) pathsChanged = true;
                if (!existed || !sameRuntimeProjectContent(previous[path], content)) {
                  files.put(content, [id, kind, path]);
                }
              }
              if (baseline) {
                for (const path in previous) {
                  if (!Object.hasOwn(previous, path) || Object.hasOwn(next, path)) continue;
                  pathsChanged = true;
                  files.delete([id, kind, path]);
                }
              }
              return pathsChanged;
            };
            const contentPathsChanged = write("asset", contents, baseline?.contents);
            let documentPathsChanged = false;
            if (!baseline || baseline.documents !== documents) {
              documentPathsChanged =
                write("document", documents ?? {}, baseline?.documents) ||
                (baseline?.documents === undefined) !== (documents === undefined);
            }
            const headerUnchanged =
              Boolean(baseline) &&
              baseline!.version === candidate.version &&
              baseline!.project === candidate.project &&
              !contentPathsChanged &&
              !documentPathsChanged;
            if (!headerUnchanged) {
              const { contents: _contents, documents: _documents, ...metadata } = candidate;
              const header: StoredProjectHeader = {
                ...metadata,
                storageFormat: "files",
                contentPaths: Object.keys(contents),
                ...(documents === undefined ? {} : { documentPaths: Object.keys(documents) })
              };
              projects.put(header, id);
            }
            revisions.put({ storageRevision } satisfies StoredProjectRevision, id);
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Project save aborted"));
      });
      // Failed/aborted transactions must never advance the diff baseline or expected revision.
      if (!this.closed) {
        this.snapshots.set(id, {
          revision: storageRevision,
          version: candidate.version,
          project: candidate.project,
          contents,
          documents
        });
      }
    });
  }

  /**
   * Removes every matching project, with its header, revision, and file records, in one transaction.
   * @param matches - Selects the project ids to remove.
   * @returns The removed project ids.
   */
  deleteMatching(matches: (id: string) => boolean): Promise<string[]> {
    if (this.closed) return Promise.reject(new Error("Project storage is closed"));
    return new Promise<string[]>((resolve, reject) => {
      const transaction = this.database.transaction(["projects", "projectRevisions", "projectFiles"], "readwrite");
      const projects = transaction.objectStore("projects"),
        revisions = transaction.objectStore("projectRevisions"),
        files = transaction.objectStore("projectFiles");
      const request = projects.getAllKeys();
      const removed: string[] = [];
      let failure: unknown;
      request.onsuccess = () => {
        try {
          for (const id of request.result) {
            if (typeof id !== "string" || !matches(id)) continue;
            projects.delete(id);
            revisions.delete(id);
            // All second key components are strings; an array is a strict upper bound.
            files.delete(IDBKeyRange.bound([id], [id, []]));
            removed.push(id);
          }
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => {
        for (const id of removed) this.snapshots.delete(id);
        resolve(removed);
      };
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Project deletion aborted"));
    });
  }

  private async enqueue<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const task = (this.operations.get(id) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => {
        if (this.closed) throw new Error("Project storage is closed");
        return operation();
      });
    this.operations.set(id, task);
    try {
      return await task;
    } finally {
      if (this.operations.get(id) === task) this.operations.delete(id);
    }
  }

  close(): void {
    this.closed = true;
    this.snapshots.clear();
    this.database.close();
  }
}
