import type { CompiledRuntimeScripts } from "./runtime-script-compiler";

const hostKey = Symbol.for("galacean.runtime-script-hosts");
const hosts = (): Map<string, Readonly<Record<string, unknown>>> => {
  const scope = globalThis as unknown as Record<symbol, Map<string, Readonly<Record<string, unknown>>>>;
  return (scope[hostKey] ??= new Map());
};
type ModuleFile = {
  location: string;
  code: string;
  url: string;
  dependencies: ModuleFile[];
  pending?: Promise<unknown>;
};

/** Native ESM only; unchanged output plus dependency URLs retains module identity. */
export class RuntimeScriptModules {
  private cache = new Map<string, ModuleFile>();
  private retired = new Set<ModuleFile>();
  // Published namespaces may perform dynamic imports long after load() returns.
  private roots = new Map<string, ModuleFile>();
  private readonly errors: { id: string; occurredAt: string; message: string }[] = [];
  private readonly onError = (event: ErrorEvent) =>
    this.recordError(event.error ?? `${event.message}\n${event.filename}:${event.lineno}:${event.colno}`);
  private readonly onRejection = (event: PromiseRejectionEvent) => this.recordError(event.reason);
  runtimeDiagnostics() {
    return this.errors.map((error) => ({ ...error }));
  }

  private recordError(error: unknown): void {
    if (this.disposed) return;
    const detail = error instanceof Error ? error.stack || error.message : String(error);
    const files = [...this.cache.values(), ...this.retired];
    const matches = files.filter((file) => detail.includes(file.url));
    if (!matches.length) return; // Never attribute another project's or the host's error to this project.
    const locations = [...new Set(matches.map((file) => `${file.url} -> ${file.location} (generated code)`))];
    const message = `${detail.slice(0, 4096)}\nModule locations:\n${locations.join("\n")}`.slice(0, 8192);
    if (this.errors.some((error) => error.message === message)) return;
    this.errors.push({ id: crypto.randomUUID(), occurredAt: new Date().toISOString(), message });
    if (this.errors.length > 20) this.errors.shift();
  }

  private disposed = false;
  private loading = 0;
  constructor(
    private compiled: CompiledRuntimeScripts,
    private externals: Readonly<Record<string, unknown>>
  ) {
    if (typeof window !== "undefined") {
      window.addEventListener("error", this.onError);
      window.addEventListener("unhandledrejection", this.onRejection);
    }
  }

  update(compiled: CompiledRuntimeScripts, externals: Readonly<Record<string, unknown>>): void {
    if (this.disposed) throw new Error("Runtime script modules disposed");
    const externalChanged =
      Object.keys(this.externals).length !== Object.keys(externals).length ||
      Object.keys(this.externals).some((key) => this.externals[key] !== externals[key]);
    this.compiled = compiled;
    this.externals = externals;
    for (const path of this.roots.keys()) if (!compiled.entries[path]) this.roots.delete(path);
    if (externalChanged) {
      for (const file of this.cache.values()) this.retired.add(file);
      this.cache.clear();
    }
    // Reconcile existing outputs so unchanged chunks keep their URLs. Changed
    // dependency URLs propagate naturally through every importing module.
    for (const path of [...this.cache.keys()]) {
      if (compiled.files[path]) this.file(path);
      else {
        this.retired.add(this.cache.get(path)!);
        this.cache.delete(path);
      }
    }
    this.releaseRetired();
  }

  private file(path: string): ModuleFile {
    const source = this.compiled.files[path];
    if (!source) throw new Error(`Unknown output module '${path}'`);
    let code = source.code;
    const dependencies: ModuleFile[] = [];
    for (const reference of [...source.imports].sort((a, b) => b.start - a.start)) {
      const dependency = this.file(reference.path);
      dependencies.push(dependency);
      const url = dependency.url;
      code = code.slice(0, reference.start) + JSON.stringify(url) + code.slice(reference.end);
    }
    const previous = this.cache.get(path);
    if (previous?.code === code) return previous;
    const asset = Object.entries(this.compiled.entries).find(([, entry]) => entry === path)?.[0];
    const file: ModuleFile = {
      location: asset ?? path,
      code,
      dependencies,
      url: URL.createObjectURL(new Blob([code], { type: "text/javascript" }))
    };
    hosts().set(file.url, this.externals);
    this.cache.set(path, file);
    if (previous) this.retired.add(previous);
    return file;
  }

  async load(path: string): Promise<unknown> {
    if (this.disposed) throw new Error("Runtime script modules disposed");
    const entry = this.compiled.entries[path];
    if (!entry) throw new Error(`Unknown project script '${path}'`);
    const file = this.file(entry);
    const attempted = new Map<string, ModuleFile>();
    const capture = (path: string) => {
      if (attempted.has(path)) return;
      attempted.set(path, this.cache.get(path)!);
      for (const dependency of this.compiled.files[path].imports) capture(dependency.path);
    };
    capture(entry);
    this.loading++;
    try {
      const result = await (file.pending ??= import(/* @vite-ignore */ file.url));
      if (this.disposed) throw new Error("Runtime script modules disposed");
      this.roots.set(path, file);
      return result;
    } catch (error) {
      // Keep the import entry and module URLs before cleanup removes their identity.
      // Stack coordinates refer to emitted code, not original TS source lines.
      const detail = error instanceof Error ? error.stack || error.message : String(error);
      const locations = [...attempted]
        .filter(([, module]) => detail.includes(module.url))
        .map(([output, module]) => {
          const asset = Object.entries(this.compiled.entries).find(([, entry]) => entry === output)?.[0];
          return `${module.url} -> ${asset ?? output} (generated code)`;
        });
      const diagnostic = new Error(
        `Loading script asset ${path}:\n${detail}` +
          (locations.length ? `\nModule locations:\n${locations.join("\n")}` : "")
      );
      // Retry unpublished graph nodes; another healthy root still owns its graph.
      const retained = this.reachable(this.roots.values());
      for (const [path, cached] of attempted) {
        if (this.cache.get(path) === cached && !retained.has(cached)) {
          this.retired.add(cached);
          this.cache.delete(path);
        }
      }
      throw diagnostic;
    } finally {
      this.loading = Math.max(0, this.loading - 1);
      this.releaseRetired();
    }
  }

  private reachable(roots: Iterable<ModuleFile>): Set<ModuleFile> {
    const result = new Set<ModuleFile>();
    const visit = (file: ModuleFile) => {
      if (result.has(file)) return;
      result.add(file);
      for (const dependency of file.dependencies) visit(dependency);
    };
    for (const root of roots) visit(root);
    return result;
  }

  private releaseRetired(): void {
    if (this.loading) return;
    const retained = this.reachable([...this.roots.values(), ...this.cache.values()]);
    for (const file of this.retired) {
      if (retained.has(file)) continue;
      hosts().delete(file.url);
      URL.revokeObjectURL(file.url);
      this.retired.delete(file);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("error", this.onError);
      window.removeEventListener("unhandledrejection", this.onRejection);
    }
    this.errors.length = 0;
    for (const file of this.cache.values()) this.retired.add(file);
    this.cache.clear();
    this.roots.clear();
    // Pending user awaits may never settle; release our references on disposal.
    this.loading = 0;
    this.releaseRetired();
  }
}
