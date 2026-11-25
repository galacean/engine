import { runtimeEditWork } from "../runtime-editor/runtime-edit-work";
import { RuntimeProjectHistory, projectHistoryPatches, type HistoryMove } from "./runtime-project-history.ts";
import { RuntimeAssetChanges, resourceSignature, sameResourceContent } from "./runtime-asset-changes.ts";
import type { RuntimeScriptModule } from "../runtime-editor/scripts/runtime-script-environment.ts";
import type { ProjectFileProvider } from "@galacean/engine-project/project-files/virtual-project-files";
import { contentView, responseBytes, utf8Chunks } from "@galacean/engine-project/project-files/project-file-view";
import {
  importRuntimeHierarchy,
  assertRuntimeHierarchyEquivalent
} from "../runtime-editor/scene/runtime-hierarchy-source.ts";
import { RuntimeProjectScripts } from "../runtime-editor/scripts/runtime-project-scripts.ts";
import {
  compileProjectResource,
  compileProjectResources,
  prepareProjectSources
} from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";
import {
  cloneRuntimeProjectContent,
  cloneRuntimeProjectManifest,
  cloneRuntimeProjectPackage,
  isRuntimeProjectStorageUnavailableError,
  RUNTIME_PROJECT_SAVE_VERSION,
  RuntimeProjectSnapshot,
  RuntimeProjectStorage,
  RuntimeProjectStorageUnavailableError,
  runtimeProjectFiles,
  validateRuntimeProject,
  type RuntimeProjectBackend,
  type RuntimeProjectManifest,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { snapshotRuntimeProjectContent } from "@galacean/engine-project/runtime-editor/project/runtime-project-content";
import { nativeAssetFormats } from "./runtime-native-formats.ts";
import type {
  RuntimeAssetFormat,
  RuntimeProjectUndo,
  RuntimeSceneChangeSet
} from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import {
  RuntimeDependencyMaintenance,
  extractAssetDependencies,
  invalidateChangedDependencies,
  validateProjectDependencies
} from "@galacean/engine-project/runtime-editor/project/runtime-project-dependencies";
import {
  RuntimeProjectPersistence,
  type RuntimeProjectPersistenceOptions
} from "@galacean/engine-project/runtime-editor/project/runtime-project-persistence";

function sameStringArray(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface RuntimeProjectAssetSnapshot {
  readonly file: RuntimeProjectManifest["files"][number] | undefined;
  readonly content: string | Uint8Array | undefined;
  /** Same validity check as assertCurrent, without using exceptions for cache misses. */
  isCurrent(): boolean;
  assertCurrent(): void;
}

export interface RuntimeActivationParticipant {
  before(signal: AbortSignal): Promise<void>;
  after(signal: AbortSignal): Promise<void>;
  /** Apply authored resource consumers after Scene inputs, before releasing runtime batches. */
  apply?(signal: AbortSignal): Promise<void>;
  /** Release input batching even when projection or a consumer fails. */
  finish?(): void;
  diagnostics?(): readonly { id: string; occurredAt: string; message: string }[];
}

type PrepareRuntimeAssetEdit = (
  content: string | Uint8Array,
  current: string | Uint8Array | undefined
) => {
  content: string | Uint8Array;
  /** Finalize owner-validated runtime facts at acceptance. Asset references must stay fixed. */
  finalizeContent?: () => string | Uint8Array;
  accept: () => void;
  finish?: () => void;
};

type RuntimeProjectValidator = (
  candidate: Readonly<RuntimeProjectPackage>,
  signal: AbortSignal
) => void | Promise<void>;

/** Owns project restoration and the lifetime of resource URLs in one game session. */
export class RuntimeProjectSession {
  readonly history = new RuntimeProjectHistory();
  private readonly pendingReads = new Set<{ path: string; fileSignature: string; invalidated: boolean }>();
  private readonly assetReadListeners = new Set<
    (file: RuntimeProjectManifest["files"][number], content: string | Uint8Array) => void
  >();
  private publicationTail: Promise<unknown> = Promise.resolve();
  private readonly runtimeAssets = new Set<string>();
  private readonly textAssetTypes = new Map<string, number>();
  private readonly runtimeAssetOwners = new Set<string>();
  private readonly runtimeAssetEditors = new Map<string, PrepareRuntimeAssetEdit>();
  private readonly projectValidators = new Set<RuntimeProjectValidator>();
  private readonly nativeFormats = nativeAssetFormats(() => ({}));
  private readonly referenceFormats = new Map(this.nativeFormats);
  readonly dependencyMaintenance: RuntimeDependencyMaintenance;

  private readonly formatRegistrations = new Map<string, { format: RuntimeAssetFormat; count: number }>();
  private validatedManifest?: RuntimeProjectManifest;
  private validatedFilesLength = -1;
  private validatedDocuments?: RuntimeProjectPackage["documents"];

  private markManifestValidated(): void {
    this.validatedManifest = this.projectPackage.project;
    this.validatedFilesLength = this.projectPackage.project.files.length;
    this.validatedDocuments = this.projectPackage.documents;
  }

  private clearManifestValidation(): void {
    this.validatedManifest = undefined;
    this.validatedFilesLength = -1;
    this.validatedDocuments = undefined;
  }

  private isManifestValidated(pack: RuntimeProjectPackage): boolean {
    return (
      !this.needsInitialization &&
      this.validatedManifest === pack.project &&
      this.validatedFilesLength === pack.project.files.length &&
      this.validatedDocuments === pack.documents
    );
  }

  /** Same reference extractors serve editor drafts and direct domain publications. */
  registerAssetFormats(formats: ReadonlyMap<string, RuntimeAssetFormat>): () => void {
    this.lifetime.signal.throwIfAborted();
    const entries = [...formats];
    for (const [type, format] of entries) {
      const registered = this.formatRegistrations.get(type);
      if (registered && registered.format !== format) throw new Error(`Conflicting asset format '${type}'`);
    }
    let formatChanged = false;
    for (const [type, format] of entries) {
      const existing = this.formatRegistrations.get(type);
      this.formatRegistrations.set(type, { format, count: (existing?.count ?? 0) + 1 });
      if (this.referenceFormats.get(type) !== format) {
        this.referenceFormats.set(type, format);
        formatChanged = true;
      }
    }
    if (formatChanged) this.clearManifestValidation();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      let releaseChanged = false;
      for (const [type] of entries) {
        const registered = this.formatRegistrations.get(type);
        if (!registered) continue;
        if (--registered.count > 0) continue;
        this.formatRegistrations.delete(type);
        const native = this.nativeFormats.get(type);
        if (native) {
          if (this.referenceFormats.get(type) !== native) {
            this.referenceFormats.set(type, native);
            releaseChanged = true;
          }
        } else if (this.referenceFormats.delete(type)) {
          releaseChanged = true;
        }
      }
      if (releaseChanged) this.clearManifestValidation();
    };
  }

  /** Inspect a detached, read-only candidate before publication. Throw to reject it.
   * Use edit preparation to amend the proposed project. Validator mutations are discarded. */
  registerProjectValidator(validate: RuntimeProjectValidator): () => void {
    this.lifetime.signal.throwIfAborted();
    this.projectValidators.add(validate);
    return () => this.projectValidators.delete(validate);
  }
  validateCandidate(candidate: RuntimeProjectPackage, signal = this.lifetime.signal): void | Promise<void> {
    if (this.projectValidators.size === 0) return;
    const detached = cloneRuntimeProjectPackage(candidate);
    let pending: Promise<void> | undefined;
    for (const validate of this.projectValidators) {
      const run = () => {
        signal.throwIfAborted();
        return validate(detached, signal);
      };
      if (pending) pending = pending.then(run);
      else {
        const result = run();
        if (result) pending = Promise.resolve(result);
      }
    }
    return pending?.then(() => {
      signal.throwIfAborted();
    });
  }

  private readonly activationParticipants = new Set<RuntimeActivationParticipant>();
  private activationTail: Promise<unknown> = Promise.resolve();

  registerRuntimeActivation(participant: RuntimeActivationParticipant): () => void {
    this.lifetime.signal.throwIfAborted();
    this.activationParticipants.add(participant);
    return () => this.activationParticipants.delete(participant);
  }

  /** Stop affected system owners before replacing modules, then bind the new owners. */
  activateRuntime(
    updateScene: () => Promise<void>,
    signal: AbortSignal,
    adopt?: () => void | Promise<void>
  ): Promise<void> {
    const task = this.activationTail.then(async () => {
      const operation = AbortSignal.any([signal, this.lifetime.signal]);
      operation.throwIfAborted();
      await adopt?.();
      const entered: RuntimeActivationParticipant[] = [];
      const errors: unknown[] = [];
      try {
        for (const participant of this.activationParticipants) {
          entered.push(participant);
          await participant.before(operation);
          operation.throwIfAborted();
        }
        operation.throwIfAborted();
        await updateScene();
        operation.throwIfAborted();
        for (const participant of entered) {
          await participant.apply?.(operation);
          operation.throwIfAborted();
        }
      } catch (error) {
        errors.push(error);
      }
      // Always release batching before awaiting completion, including partial Apply.
      for (const participant of entered) {
        try {
          participant.finish?.();
        } catch (error) {
          errors.push(error);
        }
      }
      for (const participant of entered) {
        try {
          operation.throwIfAborted();
          await participant.after(operation);
          operation.throwIfAborted();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length)
        throw new AggregateError(
          errors,
          errors.map((error) => (error instanceof Error ? error.message : String(error))).join("\n")
        );
    });
    this.activationTail = task.catch(() => undefined);
    return task;
  }

  private readonly urls = new Set<string>();
  private readonly resourceChanges = new RuntimeAssetChanges();
  private hasProjectedResources = false;
  private readonly resourceUrls = new Map<string, { content: string | Uint8Array; type: string; path: string }>();
  private readonly scripts: RuntimeProjectScripts;
  private readonly lifetime = new AbortController();
  private readonly persistence: RuntimeProjectPersistence;
  private persistenceSnapshot?: RuntimeProjectSnapshot;
  private _userEditSeq = 0;
  readonly restoredFromStorage: boolean;

  private syncSnapshotContent(path: string, content: string | Uint8Array): void {
    const snapshot = this.persistenceSnapshot;
    if (!snapshot) return;
    this.persistenceSnapshot = snapshot.hasPath(path) ? snapshot.withUpdatedContent(path, content) : undefined;
  }

  private syncSnapshotContents(entries: ReadonlyArray<readonly [string, string | Uint8Array]>): void {
    const snapshot = this.persistenceSnapshot;
    if (!snapshot || entries.length === 0) return;
    if (entries.length === 1) {
      this.syncSnapshotContent(entries[0][0], entries[0][1]);
      return;
    }
    for (let i = 0; i < entries.length; i++) {
      if (!snapshot.hasPath(entries[i][0])) {
        this.persistenceSnapshot = undefined;
        return;
      }
    }
    this.persistenceSnapshot = snapshot.withUpdatedContents(entries);
  }
  private constructor(
    readonly id: string,
    readonly projectPackage: RuntimeProjectPackage,
    private readonly storage: RuntimeProjectBackend,
    modules: readonly RuntimeScriptModule[] = [],
    private needsInitialization = false,
    persistenceOptions?: RuntimeProjectPersistenceOptions,
    private readonly prefetchedTextAssets?: ReadonlyMap<string, string>
  ) {
    this.restoredFromStorage = !needsInitialization;
    this.scripts = new RuntimeProjectScripts(modules);
    this.dependencyMaintenance = new RuntimeDependencyMaintenance(projectPackage, this.referenceFormats);
    // Storage captures immutable text references and copies mutable data only when
    // a checkpoint starts. Pending edits live solely in projectPackage.
    this.persistence = new RuntimeProjectPersistence(
      () =>
        this.persistenceSnapshot && typeof this.storage.saveSnapshot === "function"
          ? this.storage.saveSnapshot(this.id, this.persistenceSnapshot)
          : this.storage.save(this.id, this.projectPackage),
      persistenceOptions
    );
  }

  /** Runtime declarations and exports are fixed together when opening the project. */
  get scriptEnvironment() {
    return this.scripts.host;
  }

  /** False when IndexedDB was unavailable and this session fell back to ephemeral in-memory storage. */
  get isPersistent(): boolean {
    return !this.storage.isInMemory;
  }

  /** Package support is opt-in host configuration, never a flag loaded from project data. */
  static async open(
    id: string,
    initial: RuntimeProjectManifest,
    baseUrl: string,
    options: {
      storage?: RuntimeProjectBackend;
      scriptModules?: readonly RuntimeScriptModule[];
      persistence?: RuntimeProjectPersistenceOptions;
      prefetchedTextAssets?: ReadonlyMap<string, string>;
    } = {}
  ): Promise<RuntimeProjectSession> {
    let storage = options.storage;
    if (!storage) {
      try {
        storage = await RuntimeProjectStorage.open();
      } catch (error) {
        if (!isRecoverableStorageError(error)) {
          throw error;
        }
        console.warn(
          "[RuntimeProjectSession] IndexedDB storage unavailable during open; falling back to in-memory storage.",
          error
        );
        storage = RuntimeProjectStorage.createInMemory();
      }
    }
    try {
      let saved: RuntimeProjectPackage | undefined;
      try {
        saved = await storage.load(id);
      } catch (error) {
        if (options.storage || !isRecoverableStorageError(error)) {
          throw error;
        }
        console.warn(
          "[RuntimeProjectSession] IndexedDB storage unavailable during load; falling back to in-memory storage.",
          error
        );
        storage.close();
        storage = RuntimeProjectStorage.createInMemory();
        saved = undefined;
      }
      const pack: RuntimeProjectPackage = saved ?? {
        version: RUNTIME_PROJECT_SAVE_VERSION,
        project: {
          ...initial,
          files: initial.files.map((file) => ({ ...file, path: new URL(file.path, baseUrl).href }))
        },
        contents: {}
      };
      validateRuntimeProject(pack);
      return new RuntimeProjectSession(
        id,
        pack,
        storage,
        options.scriptModules,
        saved === undefined,
        options.persistence,
        options.prefetchedTextAssets
      );
    } catch (error) {
      storage.close();
      throw error;
    }
  }

  /** Host format declarations decide whether custom remote content is text. */
  registerTextAssetTypes(types: readonly string[]): () => void {
    this.lifetime.signal.throwIfAborted();
    const unique = [...new Set(types)];
    for (const type of unique) this.textAssetTypes.set(type, (this.textAssetTypes.get(type) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const type of unique) {
        const count = this.textAssetTypes.get(type) ?? 0;
        if (count > 1) this.textAssetTypes.set(type, count - 1);
        else this.textAssetTypes.delete(type);
      }
    };
  }

  /** Reports cache fills only; authored publications never emit this notification. */
  observeAssetReads(
    listener: (file: RuntimeProjectManifest["files"][number], content: string | Uint8Array) => void
  ): () => void {
    this.lifetime.signal.throwIfAborted();
    this.assetReadListeners.add(listener);
    return () => {
      this.assetReadListeners.delete(listener);
    };
  }

  fileProvider(): ProjectFileProvider {
    const provider = runtimeProjectFiles(() => this.projectPackage);
    return {
      ...provider,
      open: async (path, signal) => {
        const operationSignal = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
        operationSignal.throwIfAborted();
        const file = this.projectPackage.project.files.find((file) => file.virtualPath === path);
        if (!file) {
          const content = provider.read(path);
          return content === undefined ? undefined : contentView(content, operationSignal);
        }
        const content = this.projectPackage.contents[path];
        if (typeof content === "string") return contentView(content, operationSignal);
        if (!this.isTextAsset(file)) return { kind: "binary", ...(content ? { byteLength: content.byteLength } : {}) };
        if (content)
          return {
            kind: "text",
            chunks: utf8Chunks(
              (async function* () {
                yield content;
              })(),
              operationSignal,
              true
            )
          };
        const preloaded = this.prefetchedTextAssets?.get(file.path);
        if (preloaded !== undefined) return contentView(preloaded, operationSignal);
        const session = this;
        return {
          kind: "text",
          chunks: (async function* () {
            const pending = { path, fileSignature: resourceSignature(file)!, invalidated: false };
            session.pendingReads.add(pending);
            const assertCurrent = () => {
              operationSignal.throwIfAborted();
              if (
                pending.invalidated ||
                session.projectPackage.contents[path] !== undefined ||
                resourceSignature(session.projectPackage.project.files.find((entry) => entry.virtualPath === path)) !==
                  pending.fileSignature
              )
                throw new Error(`Asset changed while reading '${path}'; read it again`);
            };
            try {
              assertCurrent();
              const response = await fetch(file.path, { signal: operationSignal });
              if (!response.ok) {
                await response.body?.cancel();
                throw new Error(`Asset read failed (${response.status}): '${path}'`);
              }
              for await (const chunk of utf8Chunks(responseBytes(response, operationSignal), operationSignal)) {
                assertCurrent();
                yield chunk;
              }
              assertCurrent();
            } finally {
              session.pendingReads.delete(pending);
            }
          })()
        };
      },
      read: (path) => {
        const content = provider.read(path);
        const type = this.projectPackage.project.files.find((file) => file.virtualPath === path)?.type;
        return content instanceof Uint8Array && type && this.isTextAsset({ type })
          ? new TextDecoder("utf-8", { fatal: true }).decode(content)
          : content;
      },
      prepare: async (path, signal) => {
        this.lifetime.signal.throwIfAborted();
        const operationSignal = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
        const virtualPath = path;
        if (
          this.projectPackage.contents[virtualPath] !== undefined ||
          this.projectPackage.documents?.[virtualPath] !== undefined
        )
          return;
        const file = this.projectPackage.project.files.find((file) => file.virtualPath === virtualPath);
        if (!file) return;
        const pending = { path, fileSignature: resourceSignature(file)!, invalidated: false };
        this.pendingReads.add(pending);
        try {
          const content = await this.fetchContent(file, operationSignal);
          // Install decoded bytes in the same queue that replaces the accepted package.
          // Otherwise an unrelated publication preparing dependencies can overwrite this cache
          // after prepare has already returned successfully to its caller.
          await this.enqueuePublication(async () => {
            operationSignal.throwIfAborted();
            const current = this.projectPackage.project.files.find((file) => file.virtualPath === path);
            if (pending.invalidated || resourceSignature(current) !== pending.fileSignature) {
              throw new Error(`Asset changed while reading '${path}'; read it again`);
            }
            if (this.projectPackage.contents[path] === undefined) {
              this.projectPackage.contents[path] = content;
              this.syncSnapshotContent(path, content);
              this.resourceChanges.recordRead(current!, content);
              for (const listener of this.assetReadListeners) listener(current!, content);
            }
          }, []);
        } finally {
          this.pendingReads.delete(pending);
        }
      }
    };
  }

  private isTextAsset(file: Pick<RuntimeProjectManifest["files"][number], "type">): boolean {
    return (
      this.textAssetTypes.has(file.type) ||
      this.referenceFormats.get(file.type)?.contentEncoding === "utf8" ||
      /^(Scene|Prefab|Material|PrimitiveMesh|AnimatorController|JSON|script|Shader|ShaderChunk)$/i.test(file.type)
    );
  }

  private async fetchContent(
    file: RuntimeProjectManifest["files"][number],
    signal = this.lifetime.signal
  ): Promise<string | Uint8Array> {
    if (this.isTextAsset(file)) {
      const preloaded = this.prefetchedTextAssets?.get(file.path);
      if (preloaded !== undefined) return preloaded;
    }
    const response = await fetch(file.path, { signal });
    if (!response.ok) throw new Error(`Asset read failed (${response.status}): '${file.virtualPath}'`);
    const text = this.isTextAsset(file);
    const content = text ? await response.text() : new Uint8Array(await response.arrayBuffer());
    signal.throwIfAborted();
    return content;
  }

  private async prepareFilesParallel(
    files: readonly RuntimeProjectManifest["files"][number][],
    signal?: AbortSignal,
    concurrency = 16
  ): Promise<void> {
    this.lifetime.signal.throwIfAborted();
    const operationSignal = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    const targets: {
      file: RuntimeProjectManifest["files"][number];
      pending: { path: string; fileSignature: string; invalidated: boolean };
    }[] = [];
    const seen = new Set<string>();
    for (const file of files) {
      const virtualPath = file.virtualPath;
      if (
        seen.has(virtualPath) ||
        this.projectPackage.contents[virtualPath] !== undefined ||
        this.projectPackage.documents?.[virtualPath] !== undefined
      )
        continue;
      seen.add(virtualPath);
      const pending = { path: virtualPath, fileSignature: resourceSignature(file)!, invalidated: false };
      this.pendingReads.add(pending);
      targets.push({ file, pending });
    }
    if (!targets.length) return;
    const fetched: {
      file: RuntimeProjectManifest["files"][number];
      pending: { path: string; fileSignature: string; invalidated: boolean };
      content: string | Uint8Array;
    }[] = new Array(targets.length);
    let cursor = 0;
    try {
      const workerCount = Math.min(concurrency, targets.length);
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (cursor < targets.length) {
            const index = cursor++;
            const target = targets[index];
            const content = await this.fetchContent(target.file, operationSignal);
            fetched[index] = { ...target, content };
          }
        })
      );
      await this.enqueuePublication(async () => {
        operationSignal.throwIfAborted();
        const { project, contents } = this.projectPackage;
        const fileByPath = new Map(project.files.map((entry) => [entry.virtualPath, entry]));
        const hydrated: Array<[string, string | Uint8Array]> = [];
        // A stale result rejects the whole batch before any loaded contents become visible.
        for (const item of fetched) {
          const path = item.file.virtualPath;
          const current = fileByPath.get(path);
          if (item.pending.invalidated || resourceSignature(current) !== item.pending.fileSignature) {
            throw new Error(`Asset changed while reading '${path}'; read it again`);
          }
          if (contents[path] === undefined) hydrated.push([path, item.content]);
        }
        this.syncSnapshotContents(hydrated);
        for (const [path, content] of hydrated) {
          contents[path] = content;
          this.resourceChanges.recordRead(fileByPath.get(path)!, content);
        }
        for (const [path, content] of hydrated) {
          const file = fileByPath.get(path)!;
          for (const listener of this.assetReadListeners) listener(file, content);
        }
      }, []);
    } finally {
      for (const target of targets) this.pendingReads.delete(target.pending);
    }
  }

  async prepareEditableHierarchies(isRegisteredComponent: (name: string) => boolean): Promise<void> {
    const hierarchyFiles = this.projectPackage.project.files.filter(
      (file) =>
        /^(Scene|Prefab)$/i.test(file.type) &&
        !(file.params?.editableSource === true && this.projectPackage.contents[file.virtualPath] === undefined)
    );
    await this.prepareFilesParallel(hierarchyFiles);
    const converted: Record<string, string> = {};
    const repairedDependencies = new Map<(typeof hierarchyFiles)[number], string[]>();
    for (const file of hierarchyFiles) {
      let text = this.projectPackage.contents[file.virtualPath];
      if (typeof text !== "string") throw new Error(`Hierarchy '${file.virtualPath}' is not text`);
      const hierarchy = JSON.parse(text);
      if (!hierarchy.asset)
        text = converted[file.virtualPath] = JSON.stringify(
          importRuntimeHierarchy(hierarchy, file.virtualPath, this.projectPackage.project.files, isRegisteredComponent)
        );
      // Older Seed World saves recorded empty edges for built-in prefabs. Use the
      // source already in memory so authored overrides keep their own references.
      if (file.dependencies?.length === 0) {
        const dependencies = extractAssetDependencies(file, text, this.referenceFormats.get(file.type));
        if (dependencies?.length) repairedDependencies.set(file, dependencies);
      }
    }
    const candidate = { ...this.projectPackage, contents: { ...this.projectPackage.contents, ...converted } };
    for (const path of Object.keys(converted)) {
      const compiled = compileProjectResource(candidate, path);
      if (typeof compiled !== "string") throw new Error(`Compilation produced no hierarchy '${path}'`);
      assertRuntimeHierarchyEquivalent(JSON.parse(this.projectPackage.contents[path] as string), JSON.parse(compiled));
    }
    this.lifetime.signal.throwIfAborted();
    Object.assign(this.projectPackage.contents, converted);
    if (repairedDependencies.size) {
      for (const [file, dependencies] of repairedDependencies) {
        file.dependencies = dependencies;
        this.dependencyMaintenance.rememberAcceptedAsset(this.projectPackage, file, dependencies);
      }
      this.clearManifestValidation();
      this.persistenceSnapshot = undefined;
    } else {
      this.syncSnapshotContents(Object.entries(converted));
    }
  }

  async resources(signal?: AbortSignal): Promise<RuntimeProjectManifest["files"]> {
    const operation = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    operation.throwIfAborted();
    const projection = this.projectPackage;
    const editableHierarchyFiles = projection.project.files.filter(
      (file) =>
        file.params?.editableSource === true &&
        /^(Scene|Prefab)$/i.test(file.type) &&
        projection.contents[file.virtualPath] === undefined
    );
    if (editableHierarchyFiles.length > 0) {
      await this.prepareFilesParallel(editableHierarchyFiles, signal);
    }
    const provider = this.fileProvider();
    await prepareProjectSources(this.projectPackage, (path) => provider.prepare!(path, operation));
    operation.throwIfAborted();
    const affected = this.resourceChanges.affected(projection);
    // Native Material/Prefab loaders resolve references once. Reissue their URL
    // when a dependency changes, even when their own serialized text is unchanged.
    const pendingDependentFiles = this.hasProjectedResources
      ? projection.project.files.filter(
          (file) =>
            affected.has(file.virtualPath) &&
            Boolean(file.dependencies?.length) &&
            projection.contents[file.virtualPath] === undefined
        )
      : [];
    if (pendingDependentFiles.length > 0) {
      await this.prepareFilesParallel(pendingDependentFiles, signal);
      for (const file of pendingDependentFiles) {
        projection.contents[file.virtualPath] = this.projectPackage.contents[file.virtualPath];
      }
    }
    const compiled = compileProjectResources(
      projection,
      this.unavailableScripts.size ? (path) => this.unavailableScripts.has(path) : undefined
    );
    const active = new Set<string>();
    const resources = this.projectPackage.project.files.map((file, index) => {
      const content = compiled[index];
      if (content === undefined) return { ...file };
      active.add(file.virtualPath);
      const previous = this.resourceUrls.get(file.virtualPath);
      if (
        !affected.has(file.virtualPath) &&
        previous?.type === file.type &&
        sameResourceContent(previous.content, content)
      ) {
        return { ...file, path: previous.path };
      }
      const snapshot = typeof content === "string" ? content : new Uint8Array(content);
      const bytes = typeof snapshot === "string" ? snapshot : (snapshot.buffer as ArrayBuffer);
      const type = /script/i.test(file.type)
        ? "text/javascript"
        : typeof content === "string"
          ? "application/json"
          : "application/octet-stream";
      const path = URL.createObjectURL(new Blob([bytes], { type }));
      this.urls.add(path);
      this.resourceUrls.set(file.virtualPath, { content: snapshot, type: file.type, path });
      if (previous) this.releaseResourceUrl(previous);
      return { ...file, path };
    });
    for (const [path, resource] of this.resourceUrls) {
      if (!active.has(path)) {
        this.resourceUrls.delete(path);
        this.releaseResourceUrl(resource);
      }
    }
    this.resourceChanges.accept(projection);
    this.hasProjectedResources = true;
    return resources;
  }

  private releaseResourceUrl(resource: { type: string; path: string }): void {
    // These loaders consume their source once; live objects own their parsed data.
    // Other resources may retain URLs for GPU context restoration until disposal.
    if (/^(Scene|Prefab|Material|PrimitiveMesh|JSON|script)$/i.test(resource.type)) {
      URL.revokeObjectURL(resource.path);
      this.urls.delete(resource.path);
    }
  }

  async compileScripts(
    sources: Record<string, string>,
    signal?: AbortSignal,
    analyzeOnly = false,
    pack = this.projectPackage
  ) {
    this.lifetime.signal.throwIfAborted();
    const compiled = await this.scripts.compile(
      sources,
      signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal,
      analyzeOnly,
      this.scripts.environment(pack)
    );
    // Reference inspection must remain available for deleting/repairing invalid source.
    // Publication and module activation validate the completed candidate instead.
    return compiled;
  }

  async scriptModules(entries: readonly string[], externals: Readonly<Record<string, unknown>>, signal?: AbortSignal) {
    this.lifetime.signal.throwIfAborted();
    await this.resources(signal);
    return this.scripts.loadModules(
      this.projectPackage,
      this.fileProvider(),
      this.bindScriptAssets(externals),
      entries,
      signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal
    );
  }

  async scriptClasses(
    externals: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
    onUnavailable?: (path: string, error: unknown) => void
  ) {
    this.lifetime.signal.throwIfAborted();
    signal?.throwIfAborted();
    // With no component scripts there is no module to resolve an asset URL.
    // Still run prepare: it releases a previously active module graph.
    if (this.projectPackage.project.files.some((file) => file.type.toLowerCase() === "script"))
      await this.resources(signal);
    return this.scripts.prepare(
      this.projectPackage,
      this.fileProvider(),
      this.bindScriptAssets(externals),
      signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal,
      onUnavailable
    );
  }

  private scriptHost?: { input: Readonly<Record<string, unknown>>; bound: Readonly<Record<string, unknown>> };
  private bindScriptAssets(externals: Readonly<Record<string, unknown>>) {
    if (this.scriptHost?.input === externals) return this.scriptHost.bound;
    for (const [name, value] of Object.entries(externals)) {
      if (Object.hasOwn(this.scripts.host.externals, name) && this.scripts.host.externals[name] !== value)
        throw new Error(`Cannot replace registered runtime module '${name}'`);
    }
    const bound = {
      ...this.scripts.host.externals,
      ...externals,
      "@galacean/editor-assets": {
        assetUrl: (path: string) => {
          this.lifetime.signal.throwIfAborted();
          const file = this.projectPackage.project.files.find((file) => file.virtualPath === path);
          if (!file) throw new Error(`Unknown project asset '${path}'`);
          return this.resourceUrls.get(path)?.path ?? file.path;
        }
      }
    };
    this.scriptHost = { input: externals, bound };
    return bound;
  }

  private unavailableScripts = new Map<string, { id: string; occurredAt: string; message: string }>();
  setUnavailableScripts(errors: ReadonlyMap<string, string>): void {
    const next = new Map<string, { id: string; occurredAt: string; message: string }>();
    for (const [path, message] of errors) {
      const previous = this.unavailableScripts.get(path);
      next.set(
        path,
        previous?.message === message
          ? previous
          : { id: crypto.randomUUID(), occurredAt: new Date().toISOString(), message }
      );
    }
    this.unavailableScripts = next;
  }
  runtimeDiagnostics() {
    return [
      ...this.unavailableScripts.values(),
      ...this.scripts.runtimeDiagnostics(),
      ...[...this.activationParticipants].flatMap((participant) => participant.diagnostics?.() ?? [])
    ];
  }

  /** Immutable dependency for an asynchronously prepared projection. Validation
   * also rejects queued/in-flight writes: accepted bytes alone cannot prove that
   * the old live view will not publish a newer edit immediately after activation. */
  readAssetSnapshot(virtualPath: string): RuntimeProjectAssetSnapshot {
    const read = () => ({
      files: this.projectPackage.project.files.filter((file) => file.virtualPath === virtualPath),
      content: this.projectPackage.contents[virtualPath]
    });
    const source = structuredClone(read());
    const fileSignature = JSON.stringify(source.files.map(resourceSignature));
    const isCurrent = () => {
      if (
        this.lifetime.signal.aborted ||
        this.pendingProjectPublications ||
        this.pendingAssetPublications.has(virtualPath)
      )
        return false;
      const current = read();
      return (
        JSON.stringify(current.files.map(resourceSignature)) === fileSignature &&
        sameOptionalResourceContent(current.content, source.content)
      );
    };
    return {
      file: structuredClone(source.files[0]),
      content:
        typeof source.content === "string" || source.content === undefined
          ? source.content
          : new Uint8Array(source.content),
      isCurrent,
      assertCurrent: () => {
        this.lifetime.signal.throwIfAborted();
        if (!isCurrent()) {
          throw new Error(`Prepared projection has stale or pending authoring: '${virtualPath}'; prepare it again`);
        }
      }
    };
  }

  private pendingProjectPublications = 0;
  private readonly pendingAssetPublications = new Map<string, number>();
  private acceptedRevision = 0;
  get publicationRevision(): number {
    return this.acceptedRevision;
  }
  get canSave(): boolean {
    return !this.storage.readOnly;
  }
  private checkpoint(): number {
    return this.canSave ? this.persistence.committed() : this.persistence.status.savedSeq;
  }
  get persistenceStatus() {
    return this.persistence.status;
  }
  /** Monotonic count of committed user/gameplay edits (excludes system migrations, bootstrap hydration, clock checkpoints, and explicit save flushes). */
  get userEditSeq(): number {
    return this._userEditSeq;
  }
  subscribePersistence(listener: Parameters<RuntimeProjectPersistence["subscribe"]>[0]): () => void {
    return this.persistence.subscribe(listener);
  }

  /** Explicit checkpoint, including prepared remote content. Does not hold the
   * publication queue while waiting for storage. */
  async save(): Promise<void> {
    if (!this.canSave) return;
    const target = await this.enqueuePublication(async () => {
      const candidate = await this.withDependencies(this.projectPackage);
      const snapshot = RuntimeProjectSnapshot.create(candidate);
      this.lifetime.signal.throwIfAborted();
      this.projectPackage.project = candidate.project;
      this.projectPackage.contents = candidate.contents;
      this.persistenceSnapshot = snapshot;
      this.dependencyMaintenance.accept(candidate);
      this.markManifestValidated();
      return this.checkpoint();
    }, []);
    await this.flush(target);
  }

  /** Flush an already committed version; await the write API before calling this. */
  flush(target = this.persistence.status.commitSeq): Promise<void> {
    return this.persistence.flush(target);
  }

  private async withDependencies(pack: RuntimeProjectPackage, detached = false): Promise<RuntimeProjectPackage> {
    const candidate = detached
      ? pack
      : { ...pack, project: cloneRuntimeProjectManifest(pack.project), contents: { ...pack.contents } };
    let analyzed: Readonly<Record<string, readonly string[]>> | undefined;
    if (this.dependencyMaintenance.needsScriptAnalysis(candidate)) {
      const sources: Record<string, string> = {};
      for (const file of candidate.project.files.filter((f) => f.type === "script")) {
        const content = candidate.contents[file.virtualPath] ?? (await this.fetchContent(file));
        candidate.contents[file.virtualPath] = content;
        if (typeof content !== "string")
          throw new Error(`Load Script '${file.virtualPath}' before updating script dependencies`);
        sources[file.virtualPath] = content;
      }
      analyzed = (await this.compileScripts(sources, undefined, true, candidate)).dependencies;
    }
    this.dependencyMaintenance.refresh(candidate, analyzed);
    validateProjectDependencies(candidate);
    return candidate;
  }

  /** Explicit ingestion of a new source catalog, never a migration of saved data. */
  async initializeDependencies(): Promise<void> {
    if (!this.needsInitialization) {
      this.persistenceSnapshot = RuntimeProjectSnapshot.create(this.projectPackage);
      this.markManifestValidated();
      return;
    }
    const pendingFiles = this.projectPackage.project.files.filter((file) => {
      const format = this.referenceFormats.get(file.type);
      return file.dependencies === undefined && format && format.referenceTypes?.length !== 0;
    });
    await this.prepareFilesParallel(pendingFiles);
    const candidate = await this.withDependencies(this.projectPackage);
    const snapshot = RuntimeProjectSnapshot.create(candidate);
    this.projectPackage.project = candidate.project;
    this.projectPackage.contents = candidate.contents;
    this.persistenceSnapshot = snapshot;
    this.dependencyMaintenance.accept(candidate);
    this.needsInitialization = false;
    this.markManifestValidated();
  }

  async historyPatch(move: HistoryMove, signal: AbortSignal) {
    return this.history.resolve(move, (file) => this.fetchContent(file, signal));
  }

  /** Full-package edits must retain the revision from which their draft was made.
   * A concurrent accepted asset edit makes that draft stale; reject, never erase it. */
  publish(
    candidate: RuntimeProjectPackage,
    expectedRevision = this.publicationRevision,
    deletedAssets: readonly string[] = [],
    history?: { transactionId: string; move?: HistoryMove; sceneChanges?: Record<string, RuntimeSceneChangeSet> },
    options?: { userEdit?: boolean }
  ): Promise<RuntimeProjectUndo> {
    const snapshot = cloneRuntimeProjectPackage(candidate),
      removals = [...deletedAssets];
    return this.enqueuePublication(async () => {
      if (expectedRevision !== this.acceptedRevision)
        throw new Error("Stale runtime project publication; prepare the edit again");
      for (const path of removals) {
        if (this.runtimeAssets.has(path)) {
          throw new Error(
            `Asset '${path}' is owned by a runtime system; release its component before deleting the asset`
          );
        }
      }
      return this.commitPackage(
        snapshot,
        undefined,
        history,
        undefined,
        true,
        undefined,
        true,
        options?.userEdit !== false
      );
    });
  }

  /** Build against the latest committed project, so independent asset owners cannot overwrite each other. */
  update(
    build: (current: RuntimeProjectPackage) => RuntimeProjectPackage,
    options?: { recordHistory?: boolean; userEdit?: boolean }
  ): Promise<void> {
    const recordHistory = options?.recordHistory !== false;
    const userEdit = options?.userEdit ?? recordHistory;
    return this.enqueuePublication(async () => {
      await this.commitPackage(
        build(this.projectPackage),
        undefined,
        undefined,
        undefined,
        recordHistory,
        undefined,
        false,
        userEdit
      );
    });
  }

  /** Rebase remote load locations without persisting unedited remote bytes into `pack.contents`. */
  rebaseRemoteFiles(
    build: (current: RuntimeProjectPackage) => {
      files: RuntimeProjectManifest["files"];
      preservedDependencies?: ReadonlyMap<string, readonly string[]>;
      contents?: Readonly<Record<string, string | Uint8Array>>;
    },
    options?: { recordHistory?: boolean; userEdit?: boolean }
  ): Promise<void> {
    const recordHistory = options?.recordHistory !== false;
    const userEdit = options?.userEdit ?? recordHistory;
    return this.enqueuePublication(async () => {
      const pack = this.projectPackage;
      const next = build(pack);
      const candidate: RuntimeProjectPackage = {
        ...pack,
        project: { ...pack.project, files: next.files },
        contents: next.contents ? { ...next.contents, ...pack.contents } : pack.contents
      };
      await this.commitPackage(
        candidate,
        undefined,
        undefined,
        undefined,
        recordHistory,
        next.preservedDependencies,
        false,
        userEdit
      );
    });
  }

  /** Detached editor drafts retain current domain writes. An owner can prepare
   * explicit replacements through publishAsset and adopt them after commit. */
  ownRuntimeAsset(
    file: RuntimeProjectManifest["files"][number],
    retention: "project" | "owner",
    prepareExplicitEdit?: PrepareRuntimeAssetEdit
  ) {
    const path = file.virtualPath;
    if (this.runtimeAssetOwners.has(path)) throw new Error(`Runtime asset already owned: ${path}`);
    this.runtimeAssetOwners.add(path);
    this.runtimeAssets.add(path);
    if (prepareExplicitEdit) this.runtimeAssetEditors.set(path, prepareExplicitEdit);
    let released = false;
    return {
      update: <T>(
        change: (content: RuntimeProjectPackage["contents"][string] | undefined) => {
          /** Omit content to complete the transaction without publishing. */
          content?: RuntimeProjectPackage["contents"][string];
          value: T;
          /** Set false for deterministic bootstrap hydration or clock-only checkpoints that are not user edits. */
          userEdit?: boolean;
        }
      ): Promise<T> =>
        this.enqueuePublication(async () => {
          if (released) throw new Error("Runtime asset owner disposed");
          const pack = this.projectPackage;
          const existing = pack.project.files.find((entry) => entry.virtualPath === path);
          if (existing && (existing.virtualPath !== path || existing.type !== file.type))
            throw new Error(`Runtime asset identity conflict: ${path}`);
          const result = change(snapshotRuntimeProjectContent(pack.contents[path]));
          if (result.content === undefined) return result.value;
          const userEdit = result.userEdit !== false;
          const content = cloneRuntimeProjectContent(result.content);
          const format = existing ? this.referenceFormats.get(existing.type) : undefined;
          let canFastCommit = false;
          let extractedDeps: string[] | undefined;
          const baseFastReady =
            existing !== undefined &&
            existing.type !== "script" &&
            this.isManifestValidated(pack) &&
            Array.isArray(existing.dependencies);
          if (baseFastReady && format) {
            if (format.referenceTypes?.length === 0 && existing.dependencies!.length === 0) {
              canFastCommit = true;
            } else {
              try {
                const refs = extractAssetDependencies(existing, content, format);
                if (refs !== undefined && sameStringArray(refs, existing.dependencies)) {
                  extractedDeps = refs;
                  canFastCommit = true;
                }
              } catch {
                // Fall back to full package commit validation if fast reference extraction throws.
              }
            }
          }
          if (
            canFastCommit &&
            (await this.tryCommitRuntimeContentUpdate(path, content, existing, extractedDeps, userEdit))
          )
            return result.value;
          const files = pack.project.files;
          await this.commitPackage(
            {
              ...pack,
              project: {
                ...pack.project,
                files: files.some((entry) => entry.virtualPath === path) ? files : [...files, file]
              },
              contents: { ...pack.contents, [path]: content }
            },
            path,
            undefined,
            undefined,
            true,
            undefined,
            false,
            userEdit
          );
          return result.value;
        }, [path]),
      dispose: () => {
        if (released) return;
        released = true;
        this.runtimeAssetOwners.delete(path);
        this.runtimeAssetEditors.delete(path);
        if (retention === "owner") this.runtimeAssets.delete(path);
      }
    };
  }

  private async tryCommitRuntimeContentUpdate(
    path: string,
    content: string | Uint8Array,
    existing?: RuntimeProjectManifest["files"][number],
    extractedDeps?: readonly string[],
    userEdit = true
  ): Promise<boolean> {
    this.lifetime.signal.throwIfAborted();
    const pack = this.projectPackage;
    if (!this.isManifestValidated(pack)) return false;
    const { project, documents, contents } = pack;
    const nextContents = { ...contents, [path]: content };
    const validation = this.validateCandidate({ ...pack, contents: nextContents });
    if (validation) await validation;
    this.lifetime.signal.throwIfAborted();
    // Asset format registration can invalidate the fast path while a validator is pending.
    if (
      !this.isManifestValidated(pack) ||
      pack.project !== project ||
      pack.documents !== documents ||
      pack.contents !== contents
    )
      return false;
    for (const pending of this.pendingReads) {
      if (pending.path === path && !sameOptionalResourceContent(content, contents[path])) {
        pending.invalidated = true;
      }
    }
    this.projectPackage.contents = nextContents;
    this.syncSnapshotContent(path, content);
    if (existing && extractedDeps !== undefined) {
      this.dependencyMaintenance.rememberAcceptedAsset(this.projectPackage, existing, extractedDeps);
    }
    if (userEdit) this._userEditSeq++;
    this.checkpoint();
    return true;
  }

  private enqueuePublication<T>(operation: () => Promise<T>, affectedAssets?: readonly string[]): Promise<T> {
    if (affectedAssets)
      for (const path of affectedAssets)
        this.pendingAssetPublications.set(path, (this.pendingAssetPublications.get(path) ?? 0) + 1);
    else this.pendingProjectPublications++;
    const task = this.publicationTail
      .then(() => {
        this.lifetime.signal.throwIfAborted();
        return operation();
      })
      .finally(() => {
        if (affectedAssets)
          for (const path of affectedAssets) {
            const remaining = this.pendingAssetPublications.get(path)! - 1;
            if (remaining) this.pendingAssetPublications.set(path, remaining);
            else this.pendingAssetPublications.delete(path);
          }
        else this.pendingProjectPublications--;
      });
    this.publicationTail = task.catch(() => undefined);
    return task;
  }

  private async commitPackage(
    candidate: RuntimeProjectPackage,
    runtimeWrite?: string,
    history?: { transactionId: string; move?: HistoryMove; sceneChanges?: Record<string, RuntimeSceneChangeSet> },
    explicitRuntimeEdit?: { path: string; finalizeContent?: () => string | Uint8Array },
    recordHistory = true,
    preservedRemoteDependencies?: ReadonlyMap<string, readonly string[]>,
    alreadyDetached = false,
    userEdit = true
  ): Promise<RuntimeProjectUndo> {
    this.lifetime.signal.throwIfAborted();
    const checkpoint = runtimeEditWork();
    const project = alreadyDetached ? candidate.project : cloneRuntimeProjectManifest(candidate.project);
    const files = project.files;
    const contents = alreadyDetached ? candidate.contents : { ...candidate.contents };
    const documents =
      candidate.documents === undefined
        ? undefined
        : alreadyDetached
          ? candidate.documents
          : { ...candidate.documents };
    for (const path of this.runtimeAssets) {
      if (path === runtimeWrite || path === explicitRuntimeEdit?.path) continue;
      const file = this.projectPackage.project.files.find((file) => file.virtualPath === path);
      if (!file) continue;
      const index = files.findIndex((entry) => entry.virtualPath === path);
      if (index < 0) files.push(structuredClone(file));
      else files[index] = structuredClone(file);
      if (this.projectPackage.contents[path] !== undefined) contents[path] = this.projectPackage.contents[path];
    }
    candidate = {
      ...candidate,
      project,
      contents,
      ...(documents === undefined ? {} : { documents })
    };
    invalidateChangedDependencies(this.projectPackage, candidate, this.referenceFormats);
    if (preservedRemoteDependencies?.size) {
      for (const file of candidate.project.files) {
        if (candidate.contents[file.virtualPath] !== undefined || file.type === "script") continue;
        const preserved = preservedRemoteDependencies.get(file.virtualPath);
        if (!preserved) continue;
        if (this.referenceFormats.get(file.type)?.referenceTypes?.length === 0) continue;
        file.dependencies = [...preserved];
      }
    }
    await this.validateCandidate(candidate);
    const authoredContentPaths = new Set(
      Object.keys(candidate.contents).filter((path) => this.projectPackage.contents[path] === undefined)
    );
    await checkpoint(this.lifetime.signal);
    candidate = await this.withDependencies(candidate, true);
    let snapshot = RuntimeProjectSnapshot.create(candidate);
    await checkpoint(this.lifetime.signal);
    this.lifetime.signal.throwIfAborted();
    if (explicitRuntimeEdit?.finalizeContent) {
      const finalized = explicitRuntimeEdit.finalizeContent();
      candidate = {
        ...candidate,
        contents: { ...candidate.contents, [explicitRuntimeEdit.path]: finalized }
      };
      snapshot = snapshot.withUpdatedContent(explicitRuntimeEdit.path, finalized);
    }
    // Invalidate only affected in-flight reads, including delete/recreate of the same path.
    // Persistence does not control visibility: an accepted edit invalidates the
    // old source even while its checkpoint is pending or has failed.
    const nextFiles = new Map(candidate.project.files.map((file) => [file.virtualPath, file]));
    for (const pending of this.pendingReads) {
      if (
        resourceSignature(nextFiles.get(pending.path)) !== pending.fileSignature ||
        !sameOptionalResourceContent(candidate.contents[pending.path], this.projectPackage.contents[pending.path])
      ) {
        pending.invalidated = true;
      }
    }
    const transactionId = history?.transactionId ?? crypto.randomUUID();
    let undo: RuntimeProjectUndo = [];
    if (!runtimeWrite && recordHistory) {
      if (history?.move) this.history.patch(history.move);
      else this.history.assertNew(transactionId);
      const { before, after } = projectHistoryPatches(
        this.projectPackage,
        candidate,
        this.runtimeAssets,
        authoredContentPaths,
        history?.sceneChanges
      );
      this.history.accept(transactionId, before, after, history?.move);
      undo = before;
    }
    this.projectPackage.project = candidate.project;
    this.projectPackage.contents = candidate.contents;
    this.projectPackage.documents = candidate.documents;
    this.persistenceSnapshot = snapshot;
    this.dependencyMaintenance.accept(candidate);
    this.needsInitialization = false;
    this.markManifestValidated();
    // Runtime-owned state is merged into every editor publication, so it does not stale an author draft.
    if (!runtimeWrite) this.acceptedRevision++;
    if (userEdit) this._userEditSeq++;
    this.checkpoint();
    // Explicit undo and session history share the accepted authoring boundary,
    // including preparation output and excluding runtime-owned progress.
    return undo;
  }

  /** Apply one authored asset against the latest package inside the publication queue. */
  publishAsset(file: RuntimeProjectManifest["files"][number], content: string | Uint8Array): Promise<void> {
    const asset = structuredClone(file),
      value = typeof content === "string" ? content : new Uint8Array(content);
    return this.enqueuePublication(async () => {
      const pack = this.projectPackage;
      const matches = pack.project.files.filter((f) => f.virtualPath === asset.virtualPath);
      if (matches.length > 1 || matches.some((f) => f.virtualPath !== asset.virtualPath || f.type !== asset.type)) {
        throw new Error(`Runtime asset identity conflicts with '${asset.virtualPath}'`);
      }
      const files = matches.length
        ? pack.project.files.map((f) => (f.virtualPath === asset.virtualPath ? asset : f))
        : [...pack.project.files, asset];
      const prepared = this.runtimeAssetEditors.get(asset.virtualPath)?.(value, pack.contents[asset.virtualPath]);
      try {
        await this.commitPackage(
          {
            ...pack,
            project: { ...pack.project, files },
            contents: { ...pack.contents, [asset.virtualPath]: prepared?.content ?? value }
          },
          undefined,
          undefined,
          prepared && { path: asset.virtualPath, finalizeContent: prepared.finalizeContent }
        );
        prepared?.accept();
      } finally {
        prepared?.finish?.();
      }
    }, [asset.virtualPath]);
  }

  dispose(): void {
    this.lifetime.abort();
    this.persistenceSnapshot = undefined;
    this.assetReadListeners.clear();
    this.persistence.dispose();
    this.runtimeAssets.clear();
    this.textAssetTypes.clear();
    this.referenceFormats.clear();
    this.formatRegistrations.clear();
    this.runtimeAssetOwners.clear();
    this.runtimeAssetEditors.clear();
    this.activationParticipants.clear();
    this.projectValidators.clear();
    this.scripts.dispose();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.resourceUrls.clear();
    this.resourceChanges.clear();
    this.hasProjectedResources = false;
    this.storage.close();
  }
}

function isRecoverableStorageError(error: unknown): boolean {
  return (
    isRuntimeProjectStorageUnavailableError(error) &&
    !(error instanceof RuntimeProjectStorageUnavailableError && error.blocked)
  );
}

function sameOptionalResourceContent(a: string | Uint8Array | undefined, b: string | Uint8Array | undefined): boolean {
  return a === undefined || b === undefined ? a === b : sameResourceContent(a, b);
}
