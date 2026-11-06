import { projectFileType } from "./project-file-types";
import { searchProjectFiles, type ProjectFileSearchInput } from "./project-file-search";
import { contentView, openProjectFile, resolveProjectFile, type ProjectFileView } from "./project-file-view";

export type ProjectFileContent = string | Uint8Array;

/** Read-only virtual file view. Providers own their content and loading lifetime. */
export interface ProjectFileProvider {
  paths(): Iterable<string>;
  /** Report expiry for a previously published path without enumerating tombstones. */
  missing?(path: string): void;
  /** Explicit directory registrations, including empty directories. */
  directories?(): Iterable<string>;
  read(path: string): ProjectFileContent | undefined;
  /** Same canonical text as read/prepare, opened for one operation. Remote providers
   * stream without retaining loaded files; binary descriptors need not load bytes. */
  open?(path: string, signal?: AbortSignal): Promise<ProjectFileView | undefined>;
  prepare?(path: string, signal?: AbortSignal): Promise<void>;
}

export class ProjectPathConflictError extends Error {
  readonly code = "PATH_ALREADY_EXISTS";
  constructor(
    readonly path: string,
    readonly existingPath: string,
    readonly existingKind: "file" | "directory"
  ) {
    super(
      `Path already exists: '${path}' conflicts with ${existingKind} '${existingPath}'; choose another destination path`
    );
  }
}

/** Agents read these host mounts. Only the host changes them. */
const READ_ONLY_PROJECT_ROOTS = Object.freeze(["project.json", "skills", "declare", ".ai", "remote"]);

export class ProjectPathReadOnlyError extends Error {
  readonly code = "READ_ONLY_PATH";
  constructor(readonly path: string) {
    super(`Read-only path '${path}': write project files outside skills/, declare/, .ai/, remote/ and project.json`);
  }
}

export function isProjectPathReadOnly(path: string): boolean {
  return READ_ONLY_PROJECT_ROOTS.some(
    (root) => path === root || path === `${root}.meta` || path.startsWith(`${root}/`)
  );
}

export function assertProjectPathWritable(path: string): void {
  if (isProjectPathReadOnly(path)) throw new ProjectPathReadOnlyError(path);
}

export function parentDirectories(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

/** Mount a provider without changing its physical storage or loading behavior. */
export function mountProjectFiles(root: string, provider: ProjectFileProvider): ProjectFileProvider {
  assertProjectPath(root);
  return {
    missing: (path) => {
      if (path.startsWith(`${root}/`)) provider.missing?.(path.slice(root.length + 1));
    },
    *paths() {
      for (const path of provider.paths()) yield `${root}/${path}`;
    },
    directories: () => [root, ...[...(provider.directories?.() ?? [])].map((path) => `${root}/${path}`)],
    read: (path) => (path.startsWith(`${root}/`) ? provider.read(path.slice(root.length + 1)) : undefined),
    open: (path, signal) =>
      path.startsWith(`${root}/`)
        ? resolveProjectFile(provider, path.slice(root.length + 1), signal)
        : Promise.resolve(undefined),
    prepare: async (path, signal) => {
      if (path.startsWith(`${root}/`)) await provider.prepare?.(path.slice(root.length + 1), signal);
    }
  };
}

/** A source catalog can register folders before loading any file bytes. */
export function configuredProjectFiles(config: {
  directories?: readonly string[];
  files: readonly {
    path: string;
    type?: string;
    summary?: string;
    usage?: string;
    content?: ProjectFileContent;
    load?: (signal?: AbortSignal) => Promise<ProjectFileContent>;
  }[];
}): ProjectFileProvider {
  const files = new Map<string, (typeof config.files)[number]>();
  for (const file of config.files) {
    assertProjectPath(file.path);
    if (files.has(file.path)) throw new ProjectPathConflictError(file.path, file.path, "file");
    files.set(file.path, { ...file });
  }
  const directories = new Set(config.directories ?? []);
  for (const path of [...files.keys(), ...directories])
    for (const parent of parentDirectories(path)) directories.add(parent);
  for (const path of [...files.keys()].filter(
    (path) => !path.endsWith(".meta") && projectFileType(path, files.get(path)?.type) !== "Document"
  )) {
    if (!files.has(`${path}.meta`))
      files.set(`${path}.meta`, {
        path: `${path}.meta`,
        content: JSON.stringify({
          summary: files.get(path)?.summary ?? "",
          usage: files.get(path)?.usage ?? ""
        })
      });
  }
  const provider: ProjectFileProvider = {
    paths: () => files.keys(),
    directories: () => directories,
    read(path) {
      return canonical(path, files.get(path)?.content);
    },
    async open(path, signal) {
      signal?.throwIfAborted();
      const file = files.get(path);
      if (!file) return undefined;
      // Catalog types describe binary resources before downloading their bodies.
      if (file.content === undefined && ["GLTF", "Texture"].includes(projectFileType(path, file.type)))
        return { kind: "binary" };
      const content = canonical(path, file.content ?? (await file.load?.(signal)));
      signal?.throwIfAborted();
      return content === undefined ? undefined : contentView(content, signal);
    },
    async prepare(path, signal) {
      signal?.throwIfAborted();
      const file = files.get(path);
      if (!file || file.content !== undefined || !file.load) return;
      const content = await file.load(signal);
      signal?.throwIfAborted();
      file.content = content;
    }
  };
  function canonical(path: string, content: ProjectFileContent | undefined): ProjectFileContent | undefined {
    if (!path.endsWith(".meta") || content === undefined) return content;
    if (typeof content !== "string") throw new Error(`Metadata must be JSON text: '${path}'`);
    const metadata = JSON.parse(content),
      target = path.slice(0, -5);
    if (typeof metadata?.summary !== "string") throw new Error(`Metadata requires a summary: '${path}'`);
    return JSON.stringify(
      {
        summary: metadata.summary,
        ...(typeof metadata.usage === "string" ? { usage: metadata.usage } : {}),
        name: target.slice(target.lastIndexOf("/") + 1),
        type: directories.has(target) ? "Folder" : projectFileType(target, files.get(target)?.type ?? metadata.type)
      },
      null,
      2
    );
  }
  new VirtualProjectFiles([provider]); // Reject invalid catalog trees at initialization.
  return provider;
}

type ProjectNodes = Map<string, { kind: "file" | "directory"; provider?: ProjectFileProvider }>;

export class VirtualProjectFiles {
  constructor(private readonly providers: readonly ProjectFileProvider[]) {
    this.index();
  }

  /** One namespace snapshot per operation. A subsequent operation observes provider changes. */
  private index(): ProjectNodes {
    const nodes: ProjectNodes = new Map();
    const directory = (path: string) => {
      assertProjectPath(path);
      if (nodes.get(path)?.kind === "file") throw new ProjectPathConflictError(path, path, "file");
      nodes.set(path, { kind: "directory" });
    };
    for (const provider of this.providers) {
      for (const path of provider.directories?.() ?? []) {
        for (const parent of parentDirectories(path)) directory(parent);
        directory(path);
      }
      for (const path of provider.paths()) {
        assertProjectPath(path);
        const previous = nodes.get(path);
        if (previous) throw new ProjectPathConflictError(path, path, previous.kind);
        for (const parent of parentDirectories(path)) directory(parent);
        nodes.set(path, { kind: "file", provider });
      }
    }
    return nodes;
  }

  snapshot(): ProjectFileSnapshot {
    return new ProjectFileSnapshot(this.index(), this.providers);
  }
  /** Search streams the validated providers; it does not build another namespace or content index. */
  search(input: ProjectFileSearchInput, signal?: AbortSignal, includePath?: (path: string) => boolean) {
    return searchProjectFiles(this.providers, input, signal, includePath);
  }
  directories() {
    return this.snapshot().directories();
  }
  kind(path: string) {
    return this.snapshot().kind(path);
  }
  assertVacant(path: string) {
    return this.snapshot().assertVacant(path);
  }
  list() {
    return this.snapshot().list();
  }
  readContent(path: string) {
    return this.snapshot().readContent(path);
  }
  read(path: string) {
    return this.snapshot().read(path);
  }
  open(path: string, signal?: AbortSignal) {
    return this.snapshot().open(path, signal);
  }
  async prepare(paths: readonly string[], signal?: AbortSignal) {
    return this.snapshot().prepare(paths, signal);
  }
  async inspectFiles(paths: readonly string[], signal?: AbortSignal) {
    return this.snapshot().inspectFiles(paths, signal);
  }
  async listDirectory(input: { path: string; query?: string; offset?: number; limit?: number }, signal?: AbortSignal) {
    return this.snapshot().listDirectory(input, signal);
  }
  async readFilesAsync(paths: readonly string[], signal?: AbortSignal) {
    return this.snapshot().readFilesAsync(paths, signal);
  }
  readFiles(paths: readonly string[]) {
    return this.snapshot().readFiles(paths);
  }
}

/** An operation's namespace and provider ownership. File bytes still belong to their provider. */
export class ProjectFileSnapshot {
  constructor(
    private readonly nodes: ProjectNodes,
    private readonly providers: readonly ProjectFileProvider[] = []
  ) {}

  private unknown(path: string): never {
    for (const provider of this.providers) provider.missing?.(path);
    throw new Error(`Unknown project path '${path}'`);
  }

  directories(): string[] {
    return [...this.nodes]
      .filter(([, node]) => node.kind === "directory")
      .map(([path]) => path)
      .sort();
  }
  kind(path: string): "file" | "directory" | undefined {
    return this.nodes.get(path)?.kind;
  }
  assertVacant(path: string): void {
    assertProjectPath(path);
    const nodes = this.nodes;
    for (const target of [path, `${path}.meta`]) {
      const existing = nodes.get(target);
      if (existing) throw new ProjectPathConflictError(path, target, existing.kind);
    }
    for (const parent of parentDirectories(path))
      if (nodes.get(parent)?.kind === "file") {
        throw new ProjectPathConflictError(path, parent, "file");
      }
  }

  list(): string[] {
    return [...this.nodes]
      .filter(([, node]) => node.kind === "file")
      .map(([path]) => path)
      .sort();
  }

  private content(nodes: ProjectNodes, path: string): ProjectFileContent {
    assertProjectPath(path);
    const content = nodes.get(path)?.provider?.read(path);
    if (content === undefined) this.unknown(path);
    return content;
  }

  private text(nodes: ProjectNodes, path: string): string {
    const content = this.content(nodes, path);
    if (typeof content !== "string") throw new Error(`File is binary: '${path}'; read '${path}.meta' for usage`);
    return content;
  }

  readContent(path: string): ProjectFileContent {
    return this.content(this.nodes, path);
  }
  read(path: string): string {
    return this.text(this.nodes, path);
  }
  open(path: string, signal?: AbortSignal): Promise<ProjectFileView> {
    assertProjectPath(path);
    const provider = this.nodes.get(path)?.provider;
    if (!provider) this.unknown(path);
    return openProjectFile(provider, path, signal);
  }

  private async prepareNodes(nodes: ProjectNodes, paths: readonly string[], signal?: AbortSignal): Promise<void> {
    const checkpoint = projectWorkCheckpoint(signal);
    for (const path of paths) {
      await checkpoint();
      assertProjectPath(path);
      signal?.throwIfAborted();
      const provider = nodes.get(path)?.provider;
      if (!provider) this.unknown(path);
      await provider.prepare?.(path, signal);
    }
    signal?.throwIfAborted();
  }

  async prepare(paths: readonly string[], signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.prepareNodes(this.nodes, paths, signal);
  }

  async inspectFiles(paths: readonly string[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    const nodes = this.nodes;
    await this.prepareNodes(nodes, paths, signal);
    return paths.map((path) => {
      const value = this.content(nodes, path);
      return typeof value === "string"
        ? { path, content: value }
        : {
            path,
            kind: "binary" as const,
            byteLength: value.byteLength,
            metadataPath: nodes.get(`${path}.meta`)?.kind === "file" ? `${path}.meta` : null
          };
    });
  }

  async listDirectory(input: { path: string; query?: string; offset?: number; limit?: number }, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const path = input.path.replace(/\/$/, "");
    if (path) assertProjectPath(path);
    const offset = input.offset ?? 0,
      limit = input.limit ?? 20;
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("Invalid listing pagination");
    const nodes = this.nodes,
      prefix = path ? `${path}/` : "";
    if (path && nodes.get(path)?.kind !== "directory") throw new Error(`Unknown directory '${path}'`);
    const query = input.query?.trim().toLocaleLowerCase();
    const entries: { path: string; kind: "file" | "directory"; summary?: string }[] = [];
    for (const [file, node] of nodes) {
      if (!file.startsWith(prefix)) continue;
      if (!query && file.slice(prefix.length).includes("/")) continue;
      entries.push({ path: file, kind: node.kind });
    }
    entries.sort((a, b) => a.path.localeCompare(b.path));
    // Plain listing can page before loading summaries; search needs summaries for its exact total.
    const candidates = query ? entries : entries.slice(offset, offset + limit);
    const matches: typeof entries = [];
    const checkpoint = projectWorkCheckpoint(signal);
    for (const entry of candidates) {
      signal?.throwIfAborted();
      const meta = `${entry.path}.meta`;
      if (nodes.get(meta)?.kind === "file") {
        await this.prepareNodes(nodes, [meta], signal);
        const value = JSON.parse(this.text(nodes, meta));
        if (!value || typeof value.summary !== "string") throw new Error(`Invalid metadata '${meta}'`);
        entry.summary = value.summary;
      }
      if (!query || `${entry.path} ${entry.summary ?? ""}`.toLocaleLowerCase().includes(query)) matches.push(entry);
      await checkpoint();
    }
    signal?.throwIfAborted();
    const total = query ? matches.length : entries.length;
    return {
      entries: query ? matches.slice(offset, offset + limit) : matches,
      total,
      nextOffset: offset + limit < total ? offset + limit : null
    };
  }

  async readFilesAsync(paths: readonly string[], signal?: AbortSignal): Promise<{ path: string; content: string }[]> {
    signal?.throwIfAborted();
    const nodes = this.nodes;
    await this.prepareNodes(nodes, paths, signal);
    return paths.map((path) => ({ path, content: this.text(nodes, path) }));
  }

  readFiles(paths: readonly string[]): { path: string; content: string }[] {
    const nodes = this.nodes;
    return paths.map((path) => ({ path, content: this.text(nodes, path) }));
  }
}

export function assertProjectPath(path: string): void {
  if (!path || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid project path '${path}'`);
  }
}

/** Resolved promises do not let rendering or cancellation run; bound batches by wall time. */
export function projectWorkCheckpoint(signal?: AbortSignal): () => Promise<void> {
  let yieldAt = performance.now() + 8;
  return async () => {
    signal?.throwIfAborted();
    if (performance.now() >= yieldAt) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      yieldAt = performance.now() + 8;
      signal?.throwIfAborted();
    }
  };
}
