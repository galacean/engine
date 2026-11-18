import type { RuntimeProjectInputs } from "./runtime-project-inputs";
import { sameRuntimeProjectContent } from "./runtime-project-content";
import type { AssetReadValue } from "./runtime-asset-read";
import {
  cloneRuntimeProjectPackage,
  cloneRuntimeProjectContent,
  assertAssetPath,
  assetMetadata,
  projectDocuments,
  lookupRuntimeProjectTextAsset,
  runtimeProjectFiles,
  validateRuntimeProject,
  type RuntimeProjectManifest,
  type RuntimeProjectPackage
} from "./runtime-project";
import { assertProjectPathWritable, VirtualProjectFiles } from "../../project-files/virtual-project-files";
import { RuntimeDependencyMaintenance, RuntimeProjectDependencies } from "./runtime-project-dependencies";

type AssetFile = RuntimeProjectManifest["files"][number];
type Content = RuntimeProjectPackage["contents"][string];

/** IDs touched by a structured Scene writer. Whole-source writes omit this hint. */
export interface RuntimeSceneMutation {
  entities?: readonly string[];
  components?: readonly string[];
  roots?: boolean;
}
/** The journal is valid only for these exact source versions. */
export interface RuntimeSceneChangeSet {
  before: string;
  after: string;
  entities: string[];
  components: string[];
  roots: boolean;
}
export interface RuntimeSceneUndoChanges extends RuntimeSceneMutation {
  fromContent: string;
}
export type RuntimeProjectUndo = (
  | { directories: string[] | undefined }
  | { path: string; file?: AssetFile; content?: Content; document?: never; sceneChanges?: RuntimeSceneUndoChanges }
  | { document: string; content?: string }
)[];
export interface RuntimeProjectUndoParticipant {
  hasEdits(): boolean;
  /** Detached copy of the complete accepted authoring undo. Call after commit,
   * before or after activation; uncommitted edits have no undo receipt. */
  captureUndo(): RuntimeProjectUndo;
  restoreUndo(patch: RuntimeProjectUndo): Promise<void>;
}

/** Asset handlers own format validation and direct-reference extraction. */
export interface RuntimeAssetFormat {
  /** Type-owned, serializable inspection; no runtime instances. */
  read?(content: Content): AssetReadValue;
  /** Explicit encoding for custom text assets loaded through the VFS. */
  contentEncoding?: "utf8";
  /** State belongs to a live domain owner, never to a detached native authoring draft. */
  runtimeOwned?: boolean;
  validate(content: Content): void;
  /** A domain may allow author asset creation while requiring live methods for subsequent edits. */
  validateCreate?(content: Content): void;
  /** Importing an immutable binary does not imply support for editing its representation. */
  validateImport?(content: Content): void;
  references(content: Content, file: AssetFile): readonly string[];
  /** Complete set of referenced asset types, including containers of subresources.
   * Omit when not exhaustive; [] asserts no outgoing asset references. Used to skip inspection. */
  referenceTypes?: readonly string[];
}

/** Detached authoring draft. Runtime activation and storage publication remain host responsibilities. */
export class RuntimeProjectEdit {
  private readonly draft: RuntimeProjectPackage;
  private closed = false;
  private viewRevision = 0;

  /** Invalidates transaction-local read views, including hydration and derived metadata. */
  get revision(): number {
    this.assertOpen();
    return this.viewRevision;
  }
  private readonly changed = new Set<string>();
  private readonly sceneEdits = new Map<string, RuntimeSceneChangeSet | null>();
  private readonly initialPaths: ReadonlySet<string>;
  private readonly dependencyIndex: RuntimeProjectDependencies;

  constructor(
    source: RuntimeProjectPackage,
    private readonly formats: ReadonlyMap<string, RuntimeAssetFormat>,
    private readonly dependencyMaintenance = new RuntimeDependencyMaintenance(source, formats)
  ) {
    validateRuntimeProject(source);
    this.draft = cloneRuntimeProjectPackage(source);
    this.initialPaths = new Set(source.project.files.map((file) => file.virtualPath));
    this.dependencyIndex = new RuntimeProjectDependencies(this.draft.project.files);
  }

  list(): AssetFile[] {
    this.assertOpen();
    return structuredClone(this.draft.project.files);
  }

  fileProvider() {
    this.assertOpen();
    const provider = runtimeProjectFiles(() => {
      this.assertOpen();
      return this.draft;
    });
    return {
      ...provider,
      read: (path: string) => {
        this.assertOpen();
        if (
          this.draft.project.files.some((file) => file.virtualPath === path) &&
          this.draft.contents[path] === undefined
        )
          return undefined;
        return provider.read(path);
      }
    };
  }

  /** Read source resolution inputs from the current draft without exposing mutable project data. */
  lookupTextAsset(path: string): ReturnType<typeof lookupRuntimeProjectTextAsset> {
    this.assertOpen();
    return lookupRuntimeProjectTextAsset(this.draft, path);
  }

  /** Inspect input identity without exporting another copy of mutable resource bytes. */
  matchesInputs(inputs: RuntimeProjectInputs): boolean {
    this.assertOpen();
    return inputs.matches(this.draft);
  }

  hasContent(path: string): boolean {
    this.assertOpen();
    return this.draft.contents[path] !== undefined;
  }

  preview(): RuntimeProjectPackage {
    this.assertOpen();
    return cloneRuntimeProjectPackage(this.draft);
  }

  read(path: string): Content {
    const file = this.asset(path);
    const content = this.draft.contents[file.virtualPath];
    if (content === undefined) throw new Error(`Load asset '${file.virtualPath}' before editing`);
    return typeof content === "string"
      ? content
      : this.formats.get(file.type)?.contentEncoding === "utf8"
        ? new TextDecoder("utf-8", { fatal: true }).decode(content)
        : new Uint8Array(content);
  }

  info(path: string) {
    const file = this.asset(path);
    const metadata = this.draft.documents?.[`${path}.meta`];
    return {
      path,
      ...assetMetadata(path, file.type, metadata ? JSON.parse(metadata) : undefined),
      ...(file.params ? { params: structuredClone(file.params) } : {})
    };
  }

  readAsset(path: string) {
    const file = this.asset(path);
    const reader = this.format(file).read;
    if (!reader)
      throw new Error(`Asset inspection unsupported for type '${file.type}'; use asset.info or raw VFS read`);
    return {
      path,
      type: file.type,
      ...(file.params ? { params: structuredClone(file.params) } : {}),
      ...reader(this.read(path))
    };
  }

  /** Fill lazily loaded sources without replacing authored or imported draft content. */
  provideContents(contents: RuntimeProjectPackage["contents"]): void {
    for (const file of this.draft.project.files) {
      if (
        !this.changed.has(file.virtualPath) &&
        this.draft.contents[file.virtualPath] === undefined &&
        contents[file.virtualPath] !== undefined
      ) {
        this.viewRevision++;
        this.draft.contents[file.virtualPath] = cloneRuntimeProjectContent(contents[file.virtualPath]);
      }
    }
  }

  /** Check the full visible namespace, including generated sidecars and empty folders. */
  assertDestination(path: string): void {
    this.viewRevision++;
    this.assertDestinations([path]);
  }

  private assertDestinations(paths: readonly string[]): void {
    this.assertOpen();
    const files = new VirtualProjectFiles([runtimeProjectFiles(() => this.draft)]).snapshot();
    for (const path of paths) {
      assertProjectPathWritable(path);
      assertAssetPath(path);
      files.assertVacant(path);
    }
  }

  create(file: AssetFile, content: Content, metadata = { summary: "", usage: "" }): void {
    this.assertOpen();
    if (this.format(file).runtimeOwned)
      throw new Error(`Runtime-owned asset '${file.virtualPath}' must be changed through its domain API`);
    this.viewRevision++;
    this.assertDestination(file.virtualPath);
    (this.format(file).validateCreate ?? this.format(file).validate)(content);
    file = { ...file, dependencies: undefined };
    // Validate a candidate before mutating the draft, including path and Scene rules.
    const candidate = {
      ...this.draft,
      project: { ...this.draft.project, files: [...this.draft.project.files, file] },
      contents: { ...this.draft.contents, [file.virtualPath]: content },
      documents: this.describeDocuments(file.virtualPath, metadata, file.type)
    };
    validateRuntimeProject(candidate);
    if (file.type === "Scene") this.sceneEdits.set(file.virtualPath, null);
    this.draft.project.files.push(structuredClone(file));
    this.dependencyIndex.set(file);
    this.draft.contents[file.virtualPath] = cloneRuntimeProjectContent(content);
    this.changed.add(file.virtualPath);
    this.draft.documents = candidate.documents;
  }

  /** Atomically add a batch; final dependency completeness is checked by finish(). */
  createBundle(
    entries: readonly { file: AssetFile; content: Content; metadata: { summary: string; usage?: string } }[],
    documents: Record<string, string>,
    directories: readonly string[] = []
  ): void {
    this.assertOpen();
    this.viewRevision++;
    this.assertDestinations([
      ...entries.map((entry) => entry.file.virtualPath),
      ...Object.keys(documents),
      ...directories
    ]);
    const candidate = cloneRuntimeProjectPackage(this.draft);
    candidate.documents ??= {};
    if (directories.length)
      candidate.project.directories = [...new Set([...(candidate.project.directories ?? []), ...directories])];
    for (const [path, content] of Object.entries(documents)) {
      if (Object.hasOwn(candidate.documents, path)) throw new Error(`Document already exists: '${path}'`);
      candidate.documents[path] = content;
    }
    const assetPaths = new Set(candidate.project.files.map((file) => file.virtualPath));
    for (const { file, content, metadata } of entries) {
      const format = this.format(file);
      if (format.runtimeOwned)
        throw new Error(`Runtime-owned asset '${file.virtualPath}' must be changed through its domain API`);
      if (assetPaths.has(file.virtualPath))
        throw new Error(`Asset identity or path already exists: '${file.virtualPath}'`);
      (format.validateImport ?? format.validate)(content);
      assetPaths.add(file.virtualPath);
      candidate.project.files.push({ ...structuredClone(file), dependencies: undefined });
      candidate.contents[file.virtualPath] = cloneRuntimeProjectContent(content);
      candidate.documents[`${file.virtualPath}.meta`] = JSON.stringify(
        assetMetadata(
          file.virtualPath,
          file.type,
          candidate.documents[`${file.virtualPath}.meta`]
            ? JSON.parse(candidate.documents[`${file.virtualPath}.meta`])
            : metadata
        ),
        null,
        2
      );
    }
    validateRuntimeProject(candidate);
    const metadata = projectDocuments(candidate);
    for (const path of Object.keys(candidate.documents))
      if (path.endsWith(".meta") && !Object.hasOwn(this.draft.documents ?? {}, path)) {
        candidate.documents[path] = metadata[path];
      }
    Object.assign(this.draft, candidate);
    for (const { file } of entries) {
      this.changed.add(file.virtualPath);
      this.dependencyIndex.set(candidate.project.files.find((asset) => asset.virtualPath === file.virtualPath)!);
    }
  }

  describe(path: string, metadata: { summary: string; usage: string }): void {
    this.assertOpen();
    this.asset(path);
    this.viewRevision++;
    const documents = this.describeDocuments(path, metadata);
    validateRuntimeProject({ ...this.draft, documents });
    this.draft.documents = documents;
  }

  /** Read authored project text from this draft, including edits made in the same transaction. */
  readDocument(path: string): string {
    this.assertOpen();
    if (!Object.hasOwn(this.draft.documents ?? {}, path)) throw new Error(`Unknown document '${path}'`);
    return this.draft.documents![path];
  }

  /** Documents share project persistence but are not Engine assets. */
  writeDocument(path: string, content: string): void {
    this.assertOpen();
    this.viewRevision++;
    if (!path.endsWith(".meta") && !Object.hasOwn(this.draft.documents ?? {}, path)) this.assertDestination(path);
    const candidate = { ...this.draft, documents: { ...this.draft.documents, [path]: content } };
    validateRuntimeProject(candidate);
    if (path.endsWith(".meta")) candidate.documents[path] = projectDocuments(candidate)[path];
    this.draft.documents = candidate.documents;
  }

  /** Remove authored text and its sidecar. */
  deleteDocument(path: string): void {
    this.readDocument(path);
    this.viewRevision++;
    const candidate = { ...this.draft, documents: { ...this.draft.documents } };
    delete candidate.documents[path];
    delete candidate.documents[`${path}.meta`];
    validateRuntimeProject(candidate);
    this.draft.documents = candidate.documents;
  }

  private describeDocuments(
    path: string,
    metadata: { summary: string; usage: string },
    type = this.draft.project.files.find((file) => file.virtualPath === path)?.type ?? "Document"
  ): Record<string, string> {
    const documents = {
      ...this.draft.documents,
      [`${path}.meta`]: JSON.stringify(assetMetadata(path, type, metadata), null, 2)
    };
    return documents;
  }

  /** sceneMutation is supplied only by structured writers that enumerate every touched ID.
   * Raw VFS/asset writes invalidate the journal for the rest of this transaction. */
  update(path: string, content: Content, sceneMutation?: RuntimeSceneMutation): void {
    const file = this.asset(path);
    this.viewRevision++;
    if (this.format(file).runtimeOwned)
      throw new Error(`Runtime-owned asset '${file.virtualPath}' must be changed through its domain API`);
    this.format(file).validate(content);
    this.recordSceneWrite(file.virtualPath, file.type, this.draft.contents[file.virtualPath], content, sceneMutation);
    // Never retain dependency metadata for a different content version.
    const dependencies = undefined;
    this.draft.contents[file.virtualPath] = cloneRuntimeProjectContent(content);
    file.dependencies = dependencies;
    this.dependencyIndex.set(file);
    this.changed.add(file.virtualPath);
  }

  /** Reconcile newly imported/restored content and analyzed scripts before any reference query. */
  refreshDependencies(reanalyzedScripts = false): void {
    this.viewRevision++;
    const analyzed = reanalyzedScripts
      ? Object.fromEntries(
          this.draft.project.files
            .filter((f) => f.type === "script")
            .map((file) => [
              file.virtualPath,
              this.format(file).references(this.draft.contents[file.virtualPath], file)
            ])
        )
      : undefined;
    this.dependencyMaintenance.refresh(this.draft, analyzed);
    for (const file of this.draft.project.files) this.dependencyIndex.set(file);
  }

  needsScriptAnalysis(): boolean {
    return this.dependencyMaintenance.needsScriptAnalysis(this.draft);
  }

  references(path: string): string[] {
    const target = this.asset(path);
    this.refreshDependencies();
    return this.dependencyIndex.references(target.virtualPath);
  }

  delete(path: string): void {
    const file = this.asset(path);
    this.viewRevision++;
    if (this.format(file).runtimeOwned)
      throw new Error(`Runtime-owned asset '${file.virtualPath}' must be changed through its domain API`);
    if ([this.draft.project.scene, ...(this.draft.project.scenes ?? [])].includes(file.virtualPath)) {
      throw new Error(`Scene '${file.virtualPath}' is still registered in the project`);
    }
    const references = this.references(path).filter((ref) => ref !== path);
    if (references.length) throw new Error(`Asset '${path}' is referenced by: ${references.join(", ")}`);
    this.draft.project.files = this.draft.project.files.filter((asset) => asset.virtualPath !== path);
    if (file.type === "Scene") this.sceneEdits.set(file.virtualPath, null);
    this.dependencyIndex.remove(path);
    this.changed.add(file.virtualPath);
    delete this.draft.contents[file.virtualPath];
    if (this.draft.documents) {
      delete this.draft.documents[`${file.virtualPath}.meta`];
    }
  }

  /** Explicit removals exclude assets created concurrently by a runtime owner. */
  deletedAssetPaths(): string[] {
    const remaining = new Set(this.draft.project.files.map((file) => file.virtualPath));
    return [...this.initialPaths].filter((path) => !remaining.has(path));
  }

  /** Includes structured edits, whole-asset writes, imports, removals and history restoration. */
  changedAssetPaths(): readonly string[] {
    this.assertOpen();
    return [...this.changed];
  }

  sceneChangeSets(): Record<string, RuntimeSceneChangeSet> {
    this.assertOpen();
    return Object.fromEntries(
      [...this.sceneEdits].flatMap(([path, changes]) => (changes ? [[path, structuredClone(changes)]] : []))
    );
  }

  private recordSceneWrite(
    path: string,
    type: string,
    before: Content | undefined,
    after: Content | undefined,
    mutation?: RuntimeSceneMutation
  ): void {
    if (type !== "Scene" || before === after) return;
    const prior = this.sceneEdits.get(path);
    if (
      !mutation ||
      prior === null ||
      typeof before !== "string" ||
      typeof after !== "string" ||
      (prior && prior.after !== before)
    ) {
      this.sceneEdits.set(path, null);
      return;
    }
    this.sceneEdits.set(path, {
      before: prior?.before ?? before,
      after,
      entities: [...new Set([...(prior?.entities ?? []), ...(mutation.entities ?? [])])],
      components: [...new Set([...(prior?.components ?? []), ...(mutation.components ?? [])])],
      roots: (prior?.roots ?? false) || (mutation.roots ?? false)
    });
  }

  finish(): RuntimeProjectPackage {
    this.assertOpen();
    this.refreshDependencies();
    validateRuntimeProject(this.draft);
    const targets = new Set(this.draft.project.files.map((file) => file.virtualPath));
    for (const file of this.draft.project.files) {
      if (!this.changed.has(file.virtualPath)) continue;
      for (const ref of file.dependencies ?? []) {
        if (!targets.has(ref)) throw new Error(`Asset '${file.virtualPath}' references missing asset '${ref}'`);
      }
    }
    this.closed = true;
    return this.draft;
  }

  /** Restores host-owned history into this draft; normal finish validation still applies. */
  restore(patch: RuntimeProjectUndo): void {
    this.assertOpen();
    this.viewRevision++;
    for (const entry of patch) {
      if ("directories" in entry) {
        if (entry.directories === undefined) delete this.draft.project.directories;
        else this.draft.project.directories = [...entry.directories];
        continue;
      }
      if (entry.document !== undefined) {
        this.draft.documents ??= {};
        if (entry.content === undefined) delete this.draft.documents[entry.document];
        else this.draft.documents[entry.document] = entry.content;
        continue;
      }
      const current = this.draft.project.files.find((file) => file.virtualPath === entry.path);
      const beforeContent = this.draft.contents[entry.path];
      this.recordSceneWrite(
        entry.path,
        entry.file?.type ?? current?.type ?? "",
        beforeContent,
        entry.content,
        entry.sceneChanges?.fromContent === beforeContent ? entry.sceneChanges : undefined
      );
      this.dependencyIndex.remove(entry.path);
      if (current) delete this.draft.contents[current.virtualPath];
      this.draft.project.files = this.draft.project.files.filter((file) => file.virtualPath !== entry.path);
      if (entry.file) {
        this.draft.project.files.push(structuredClone(entry.file));
        this.dependencyIndex.set(entry.file);
        if (entry.content !== undefined)
          this.draft.contents[entry.file.virtualPath] = cloneRuntimeProjectContent(entry.content);
      }
      this.changed.add(entry.path);
    }
  }

  captureUndo(before: RuntimeProjectPackage): RuntimeProjectUndo {
    this.assertOpen();
    const result: RuntimeProjectUndo = [];
    if (JSON.stringify(before.project.directories) !== JSON.stringify(this.draft.project.directories))
      result.push({ directories: before.project.directories?.slice() });
    const previousFiles = new Map(before.project.files.map((file) => [file.virtualPath, file]));
    const nextFiles = new Map(this.draft.project.files.map((file) => [file.virtualPath, file]));
    const ids = new Set([...previousFiles.keys(), ...nextFiles.keys()]);
    for (const path of ids) {
      const old = previousFiles.get(path);
      const next = nextFiles.get(path);
      const content = old && before.contents[old.virtualPath];
      const after = next && this.draft.contents[next.virtualPath];
      const equal = sameRuntimeProjectContent(content, after);
      const changes = this.sceneEdits.get(path);
      const tracked = changes && changes.before === content && changes.after === after;
      if (JSON.stringify(old) !== JSON.stringify(next) || !equal)
        result.push({
          ...(tracked
            ? {
                sceneChanges: {
                  fromContent: changes.after,
                  entities: changes.entities.slice(),
                  components: changes.components.slice(),
                  roots: changes.roots
                }
              }
            : {}),
          path,
          file: old && structuredClone(old),
          content: content === undefined ? undefined : cloneRuntimeProjectContent(content)
        });
    }
    const documents = new Set([...Object.keys(before.documents ?? {}), ...Object.keys(this.draft.documents ?? {})]);
    for (const path of documents)
      if (before.documents?.[path] !== this.draft.documents?.[path])
        result.push({ document: path, content: before.documents?.[path] });
    return result;
  }

  discard(): void {
    this.closed = true;
  }

  private asset(path: string): AssetFile {
    this.assertOpen();
    const file = this.draft.project.files.find((file) => file.virtualPath === path);
    if (!file) throw new Error(`Unknown asset '${path}'`);
    return file;
  }

  private format(file: AssetFile): RuntimeAssetFormat {
    const format = this.formats.get(file.type);
    if (!format) throw new Error(`Editing unsupported for asset type '${file.type}'`);
    return format;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Project edit is closed");
  }
}
