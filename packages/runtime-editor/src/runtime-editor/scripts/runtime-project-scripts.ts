import { visitSourceComponents } from "@galacean/engine-project/runtime-editor/scene/runtime-source-components";
import { projectScriptInputs } from "@galacean/engine-project/runtime-editor/scripts/runtime-script-inputs";
import type { ProjectFileProvider } from "@galacean/engine-project/project-files/virtual-project-files";
import type { CompiledRuntimeScripts } from "./runtime-script-compiler";
import { runtimeScriptExternals } from "./runtime-script-host";
import { createRuntimeScriptEnvironment, type RuntimeScriptModule } from "./runtime-script-environment";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeScriptModules } from "./runtime-script-modules";
import { RuntimeScriptWorker } from "./runtime-script-worker";

// Retain only reference strings from one source per current hierarchy. Namespace
// resolution remains live, including duplicate paths and changed asset types.
const componentScriptReferences = new Map<string, { source: string; references: readonly string[] }>();

/** Find component scripts by the same source identity used by the Editor serializer. */
export function projectComponentScripts(pack: RuntimeProjectPackage): string[] {
  const entries = new Set<string>();
  const files = new Map<string, typeof pack.project.files>();
  const hierarchies = new Set<string>();
  for (const file of pack.project.files) {
    const list = files.get(file.virtualPath);
    if (list) list.push(file);
    else files.set(file.virtualPath, [file]);
    if (/^(Scene|Prefab)$/i.test(file.type)) hierarchies.add(file.virtualPath);
  }
  for (const path of componentScriptReferences.keys())
    if (!hierarchies.has(path)) componentScriptReferences.delete(path);
  for (const path of hierarchies) {
    const content = pack.contents[path];
    if (typeof content !== "string") {
      componentScriptReferences.delete(path);
      continue;
    }
    let cached = componentScriptReferences.get(path);
    if (!cached || cached.source !== content) {
      const source = JSON.parse(content),
        references: string[] = [];
      if (source?.asset)
        visitSourceComponents(source, (component) => {
          if (component.type !== "Script") return;
          const id = component.script?.$ref ?? component.refId;
          if (typeof id !== "string") throw new Error(`Invalid component script reference '${id}'`);
          references.push(id);
        });
      cached = { source: content, references };
      componentScriptReferences.set(path, cached);
    }
    for (const id of cached.references) {
      const matches = files.get(id);
      if (matches?.length !== 1 || matches[0].type.toLowerCase() !== "script")
        throw new Error(`Invalid component script reference '${id}'`);
      entries.add(matches[0].virtualPath);
    }
  }
  return [...entries];
}

/** Exact content comparison; never retains caller-owned mutable maps or hashes text. */
function sameTextFiles(previous: Readonly<Record<string, string>>, next: Readonly<Record<string, string>>): boolean {
  const keys = Object.keys(next);
  return (
    Object.keys(previous).length === keys.length &&
    keys.every((key) => Object.hasOwn(previous, key) && previous[key] === next[key])
  );
}

export class RuntimeProjectScripts {
  readonly host: ReturnType<typeof createRuntimeScriptEnvironment>;
  constructor(modules: readonly RuntimeScriptModule[] = []) {
    this.host = createRuntimeScriptEnvironment(runtimeScriptExternals, modules);
  }
  environment(pack: RuntimeProjectPackage) {
    const project = projectScriptInputs(pack);
    return { declarations: { ...this.host.declarations, ...project.declarations } };
  }
  async resolveEnvironment(pack: RuntimeProjectPackage) {
    const [hostDeclarations, project] = await Promise.all([
      this.host.loadDeclarations(),
      Promise.resolve(projectScriptInputs(pack))
    ]);
    return { declarations: { ...hostDeclarations, ...project.declarations } };
  }
  private readonly compiler = new RuntimeScriptWorker();
  private modules?: RuntimeScriptModules;
  private built?: {
    sources: Record<string, string>;
    declarations: Record<string, string>;
    result: CompiledRuntimeScripts;
  };

  async compile(
    sources: Record<string, string>,
    signal?: AbortSignal,
    analyzeOnly = false,
    environment?: ReturnType<typeof projectScriptInputs>
  ): Promise<CompiledRuntimeScripts> {
    signal?.throwIfAborted();
    if (Object.keys(sources).length === 0) {
      if (!analyzeOnly) this.built = undefined;
      return { entries: {}, files: {}, dependencies: {}, resolutions: {} };
    }
    const hostDeclarations = await this.host.loadDeclarations();
    signal?.throwIfAborted();
    const resolvedDeclarations = environment
      ? { ...hostDeclarations, ...environment.declarations }
      : { ...hostDeclarations };
    if (
      this.built &&
      sameTextFiles(this.built.sources, sources) &&
      sameTextFiles(this.built.declarations, resolvedDeclarations)
    )
      return this.built.result;
    const inputs = { sources: { ...sources }, declarations: resolvedDeclarations };
    const result = await this.compiler.compile(
      inputs.sources,
      signal,
      undefined,
      analyzeOnly,
      Object.fromEntries(
        Object.entries(this.host.externals).map(([name, value]) => [name, Object.keys(value as object)])
      ),
      inputs.declarations
    );
    signal?.throwIfAborted();
    if (!analyzeOnly) this.built = { ...inputs, result };
    return result;
  }

  private preparedCompilation?: CompiledRuntimeScripts;
  private preparedExternals?: Readonly<Record<string, unknown>>;

  async prepare(
    pack: RuntimeProjectPackage,
    provider: ProjectFileProvider,
    externals: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
    onUnavailable?: (path: string, error: unknown) => void
  ) {
    const entries = projectComponentScripts(pack);
    const modules = await this.loadModules(pack, provider, externals, entries, signal, onUnavailable);
    return new Map([...modules].map(([path, module]) => [path, (module as { default?: unknown }).default]));
  }

  /** Scene scripts share this session's compiled module graph. */
  async loadModules(
    pack: RuntimeProjectPackage,
    provider: ProjectFileProvider,
    externals: Readonly<Record<string, unknown>>,
    entries: readonly string[],
    signal?: AbortSignal,
    onUnavailable?: (path: string, error: unknown) => void
  ) {
    if (!entries.length) {
      this.modules?.dispose();
      this.modules = undefined;
      this.preparedCompilation = undefined;
      this.preparedExternals = undefined;
      return new Map<string, unknown>();
    }
    const sources: Record<string, string> = {};
    for (const file of pack.project.files) {
      if (file.type.toLowerCase() !== "script") continue;
      await provider.prepare?.(file.virtualPath, signal);
      signal?.throwIfAborted();
      const source = pack.contents[file.virtualPath];
      if (typeof source !== "string") throw new Error(`Missing script source '${file.virtualPath}'`);
      sources[file.virtualPath] = source;
    }
    const environment = await this.resolveEnvironment(pack);
    const sameExternals =
      this.preparedExternals &&
      Object.keys(externals).length === Object.keys(this.preparedExternals).length &&
      Object.keys(externals).every((key) => externals[key] === this.preparedExternals![key]);
    const compiled = await this.compile(sources, signal, false, environment);
    if (compiled !== this.preparedCompilation || !sameExternals) {
      signal?.throwIfAborted();
      if (this.modules) this.modules.update(compiled, externals);
      else this.modules = new RuntimeScriptModules(compiled, externals);
    }
    const classes = new Map<string, unknown>();
    for (const entry of entries) {
      signal?.throwIfAborted();
      try {
        classes.set(entry, await this.modules!.load(entry));
      } catch (error) {
        signal?.throwIfAborted();
        if (!onUnavailable) throw error;
        onUnavailable(entry, error);
      }
    }
    this.preparedCompilation = compiled;
    this.preparedExternals = { ...externals };
    return classes;
  }

  runtimeDiagnostics() {
    return this.modules?.runtimeDiagnostics() ?? [];
  }

  dispose(): void {
    this.compiler.dispose();
    this.modules?.dispose();
    this.modules = undefined;
    this.built = undefined;
    this.preparedCompilation = undefined;
    this.preparedExternals = undefined;
  }
}
