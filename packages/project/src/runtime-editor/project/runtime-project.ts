import { validateProjectDependencies } from "./runtime-project-dependencies";
import {
  parentDirectories,
  ProjectPathConflictError,
  type ProjectFileProvider
} from "../../project-files/virtual-project-files";

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
export const RUNTIME_PROJECT_SAVE_VERSION = 5 as const;

/** Binary files remain binary; only authored/overridden content needs to be embedded. */
export interface RuntimeProjectPackage {
  version: typeof RUNTIME_PROJECT_SAVE_VERSION;
  project: RuntimeProjectManifest;
  contents: Record<string, string | Uint8Array>;
  /** Asset-relative documentation paths; these are not Engine assets. */
  documents?: Record<string, string>;
}

/** Text is immutable. Copy only containers and mutable bytes at ownership boundaries. */
export function cloneRuntimeProjectContent(content: string | Uint8Array): string | Uint8Array {
  if (typeof content === "string") return content;
  if (!(content instanceof Uint8Array)) throw new Error("Invalid runtime asset content");
  return new Uint8Array(content);
}

/** Detached package without serializing unchanged text assets into new strings. */
export function cloneRuntimeProjectPackage(pack: RuntimeProjectPackage): RuntimeProjectPackage {
  const { contents, documents, ...metadata } = pack;
  return {
    ...structuredClone(metadata),
    contents: Object.fromEntries(
      Object.entries(contents).map(([path, content]) => [path, cloneRuntimeProjectContent(content)])
    ),
    ...(documents === undefined ? {} : { documents: { ...documents } })
  };
}

/** Validate project structure; direct dependency completeness is checked before persistence. */
export function validateRuntimeProject(value: RuntimeProjectPackage): void {
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
  const paths = new Set<string>();
  const scenes = new Set<string>();
  for (const file of value.project.files) {
    if (!file || typeof file.type !== "string" || !file.type || typeof file.path !== "string" || !file.path) {
      throw new Error("Invalid or duplicate runtime asset identity");
    }
    if (Object.hasOwn(file, "id")) throw new Error("Asset IDs are not supported; use virtualPath");
    if (file.dependencies !== undefined) {
      if (!Array.isArray(file.dependencies) || new Set(file.dependencies).size !== file.dependencies.length)
        throw new Error(`Invalid asset dependencies: '${file.virtualPath}'`);
      for (const dependency of file.dependencies) assertAssetPath(dependency);
    }
    assertAssetPath(file.virtualPath);
    if (file.virtualPath.endsWith(".meta")) throw new Error("Metadata sidecars are documents, not Engine assets");
    if (paths.has(file.virtualPath)) throw new ProjectPathConflictError(file.virtualPath, file.virtualPath, "file");
    paths.add(file.virtualPath);
    if (file.type === "Scene") scenes.add(file.virtualPath);
  }
  for (const scene of [value.project.scene, ...(value.project.scenes ?? [])]) {
    if (!scenes.has(scene)) throw new Error(`Unregistered runtime Scene '${scene}'`);
  }
  if (
    value.documents !== undefined &&
    (!value.documents || typeof value.documents !== "object" || Array.isArray(value.documents))
  )
    throw new Error("Invalid project documents");
  const filePaths = new Set([...paths, ...Object.keys(value.documents ?? {})]);
  const directories = new Set<string>();
  if (
    value.project.directories !== undefined &&
    (!Array.isArray(value.project.directories) ||
      new Set(value.project.directories).size !== value.project.directories.length)
  )
    throw new Error("Invalid project directories");
  for (const directory of value.project.directories ?? []) {
    assertAssetPath(directory);
    if (directory.endsWith(".meta")) throw new Error("Directory names cannot use the .meta suffix");
    for (const path of [...parentDirectories(directory), directory]) directories.add(path);
  }
  for (const path of filePaths) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join("/"));
  }
  for (const [path, content] of Object.entries(value.documents ?? {})) {
    assertAssetPath(path);
    if (paths.has(path)) throw new ProjectPathConflictError(path, path, "file");
    if (typeof content !== "string") throw new Error(`Invalid project document '${path}'`);
    if (path.endsWith(".meta")) {
      const meta = JSON.parse(content);
      if (!meta || typeof meta.summary !== "string" || (meta.usage !== undefined && typeof meta.usage !== "string"))
        throw new Error(`Invalid metadata '${path}'`);
      const target = path.slice(0, -5);
      if (!filePaths.has(target) && !directories.has(target)) throw new Error(`Orphan metadata '${path}'`);
    }
  }
  for (const path of directories) if (filePaths.has(path)) throw new ProjectPathConflictError(path, path, "file");
  for (const [path, content] of Object.entries(value.contents)) {
    if (!paths.has(path)) throw new Error(`Unregistered runtime asset content '${path}'`);
    if (typeof content !== "string" && !(content instanceof Uint8Array)) {
      throw new Error(`Invalid runtime asset content '${path}'`);
    }
  }
}

export function assertAssetPath(path: string): void {
  if (
    typeof path !== "string" ||
    !path ||
    path.includes("\\") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) ||
    path.includes("?") ||
    path.includes("#") ||
    ["project.json", "editor", "remote"].some(
      (reserved) => path === reserved || path === `${reserved}.meta` || path.startsWith(`${reserved}/`)
    ) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Invalid runtime asset path '${path}'`);
  }
}

export function assetMetadata(path: string, type: string, description?: { summary: string; usage?: string }) {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    type,
    summary: description?.summary ?? `${path} (${type})`,
    usage: description?.usage ?? "通过虚拟路径读取和引用；使用说明见 README.md。"
  };
}

/** Enumerate metadata identities without serializing every description during directory discovery. */
function projectMetadataTargets(pack: RuntimeProjectPackage): Map<string, string> {
  const targets = new Map<string, string>();
  const directories = new Set(pack.project.directories ?? []);
  for (const file of pack.project.files) targets.set(file.virtualPath, file.type);
  for (const path of Object.keys(pack.documents ?? {})) if (!path.endsWith(".meta")) targets.set(path, "Document");
  for (const path of [
    ...pack.project.files.map((file) => file.virtualPath),
    ...Object.keys(pack.documents ?? {}),
    ...directories
  ]) {
    for (const directory of parentDirectories(path)) directories.add(directory);
  }
  for (const directory of directories) targets.set(directory, "Folder");
  return targets;
}

function projectMetadata(pack: RuntimeProjectPackage, path: string, type: string): string {
  const existing = pack.documents?.[`${path}.meta`];
  return JSON.stringify(
    assetMetadata(
      path,
      type,
      existing === undefined
        ? { summary: type === "Folder" ? `${path} 资产目录` : `${path} (${type})` }
        : JSON.parse(existing)
    ),
    null,
    2
  );
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
      yield "project.json.meta";
      for (const file of pack.project.files) yield file.virtualPath;
      yield* new Set([
        ...Object.keys(pack.documents ?? {}),
        ...[...projectMetadataTargets(pack).keys()].map((path) => `${path}.meta`)
      ]);
    },
    read(path) {
      const pack = getPackage();
      if (path === "project.json") return JSON.stringify(pack.project, null, 2);
      if (path === "project.json.meta")
        return JSON.stringify(
          assetMetadata("project.json", "Project", {
            summary: "项目清单，记录场景、资产虚拟路径与加载地址的映射，以及显式目录。",
            usage:
              "此清单只枚举资产，不是运行时对象清单。使用 read 读取资产的同名 .meta 了解数据含义，使用 list 浏览虚拟目录；空作者数据或空覆盖不能证明场景中没有对象，实例数量和运行状态应通过所属组件的查询接口核实。此清单由 Editor 管理，不直接写入；通过 editor.asset.create/import/delete 等 API 管理资产，通过对应的 Scene、Entity、Component API 编辑场景。"
          }),
          null,
          2
        );
      if (path.endsWith(".meta")) {
        const target = path.slice(0, -5);
        const type =
          pack.project.files.find((file) => file.virtualPath === target)?.type ??
          (!target.endsWith(".meta") && Object.hasOwn(pack.documents ?? {}, target) ? "Document" : undefined) ??
          (pack.project.directories?.some((dir) => dir === target || dir.startsWith(`${target}/`)) ||
          pack.project.files.some((file) => file.virtualPath.startsWith(`${target}/`)) ||
          Object.keys(pack.documents ?? {}).some((doc) => doc.startsWith(`${target}/`))
            ? "Folder"
            : undefined);
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

/** Storage layout/version metadata is independent of the exported package format. */
type LegacyStoredProject = RuntimeProjectPackage & { storageRevision?: string };
type StoredProjectHeader = Omit<RuntimeProjectPackage, "contents" | "documents"> & {
  storageFormat: "files";
  storageRevision: string;
  contentPaths: string[];
  documentPaths?: string[];
};
type StoredProject = LegacyStoredProject | StoredProjectHeader;
type StorageSnapshot = {
  revision?: string;
  split: boolean;
  contents: RuntimeProjectPackage["contents"];
  documents?: RuntimeProjectPackage["documents"];
};

function sameStoredContent(a: string | Uint8Array | undefined, b: string | Uint8Array): boolean {
  return (
    a === b ||
    (a instanceof Uint8Array &&
      b instanceof Uint8Array &&
      a.length === b.length &&
      a.every((byte, index) => byte === b[index]))
  );
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
      const request = factory.open("galacean-runtime-projects", 4);
      let blocked = false;
      request.onupgradeneeded = (event) => {
        const database = request.result;
        // Preserve the pre-v2 incompatible-format reset. Later upgrades retain all records.
        if (event.oldVersion < 2 && database.objectStoreNames.contains("projects"))
          database.deleteObjectStore("projects");
        const store = database.objectStoreNames.contains("projects")
          ? request.transaction!.objectStore("projects")
          : database.createObjectStore("projects");
        if (event.oldVersion < 3) store.createIndex("storageRevision", "storageRevision", { unique: true });
        // Legacy packages are split only on their first successful save, in that save's transaction.
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
      let stored: StoredProject | undefined;
      const result = await new Promise<RuntimeProjectPackage | undefined>((resolve, reject) => {
        // A reader sees one committed revision across header and file records.
        const transaction = this.database.transaction(["projects", "projectFiles"], "readonly");
        const request = transaction.objectStore("projects").get(id);
        let result: RuntimeProjectPackage | undefined, failure: unknown;
        request.onsuccess = () => {
          try {
            stored = request.result;
            if (stored === undefined) return;
            if ("contents" in stored) {
              const { storageRevision: _, ...pack } = stored;
              result = pack;
              return;
            }
            const { storageRevision: _, storageFormat, contentPaths, documentPaths, ...metadata } = stored;
            if (
              storageFormat !== "files" ||
              !Array.isArray(contentPaths) ||
              (documentPaths !== undefined && !Array.isArray(documentPaths))
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
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Project load aborted"));
      });
      if (result === undefined) {
        this.snapshots.delete(id);
        return undefined;
      }
      if (result.version !== RUNTIME_PROJECT_SAVE_VERSION)
        throw new Error(`Unsupported saved project version '${result.version}'`);
      validateRuntimeProject(result);
      validateProjectDependencies(result);
      if (!this.closed)
        this.snapshots.set(id, {
          revision: stored!.storageRevision,
          split: !("contents" in stored!),
          contents: Object.fromEntries(
            Object.entries(result.contents).map(([path, content]) => [path, cloneRuntimeProjectContent(content)])
          ),
          documents: result.documents && { ...result.documents }
        });
      return result;
    });
  }

  async save(id: string, value: RuntimeProjectPackage): Promise<void> {
    validateRuntimeProject(value);
    validateProjectDependencies(value);
    // Capture before queuing. Mutable bytes/metadata stay isolated; immutable text is shared.
    const candidate = cloneRuntimeProjectPackage(value);
    const { contents, documents, ...metadata } = candidate;
    const header: StoredProjectHeader = {
      ...metadata,
      storageFormat: "files",
      storageRevision: crypto.randomUUID(),
      contentPaths: Object.keys(contents),
      ...(documents === undefined ? {} : { documentPaths: Object.keys(documents) })
    };
    await this.enqueue(id, async () => {
      const expected = this.snapshots.get(id);
      await new Promise<void>((resolve, reject) => {
        const transaction = this.database.transaction(["projects", "projectFiles"], "readwrite");
        const store = transaction.objectStore("projects"),
          files = transaction.objectStore("projectFiles");
        const request = expected?.split ? store.index("storageRevision").getKey(expected.revision!) : store.getKey(id);
        let failure: unknown;
        request.onsuccess = () => {
          try {
            const baseline = expected?.split && request.result === id ? expected : undefined;
            if (!baseline) {
              // All second key components are strings; an array is a strict upper bound.
              // Another writer, legacy data or a recreated project requires a complete
              // replacement: comparing with this owner's stale files would mix snapshots.
              files.delete(IDBKeyRange.bound([id], [id, []]));
            }
            const write = (
              kind: string,
              next: RuntimeProjectPackage["contents"],
              previous: RuntimeProjectPackage["contents"] = {}
            ) => {
              for (const [path, content] of Object.entries(next)) {
                if (!baseline || !Object.hasOwn(previous, path) || !sameStoredContent(previous[path], content)) {
                  files.put(content, [id, kind, path]);
                }
              }
              if (baseline)
                for (const path of Object.keys(previous)) {
                  if (!Object.hasOwn(next, path)) files.delete([id, kind, path]);
                }
            };
            write("asset", contents, baseline?.contents);
            write("document", documents ?? {}, baseline?.documents);
            store.put(header, id);
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Project save aborted"));
      });
      // Failed/aborted transactions must never advance the diff baseline or expected revision.
      if (!this.closed) this.snapshots.set(id, { revision: header.storageRevision, split: true, contents, documents });
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
