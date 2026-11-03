import { projectScriptInputs } from "../scripts/runtime-script-inputs";
import type { RuntimeAssetFormat } from "./runtime-project-edit";
import type { RuntimeProjectManifest, RuntimeProjectPackage } from "./runtime-project";

type AssetFile = RuntimeProjectManifest["files"][number];

/** Invalidate resource consumers transitively; the VFS stores only direct edges.
 * Iteration also handles legal cyclic script dependencies without recursion. */
export function affectedProjectAssets(files: readonly AssetFile[], changed: Iterable<string>): Set<string> {
  const consumers = new Map<string, string[]>();
  for (const file of files)
    for (const dependency of file.dependencies ?? []) {
      const list = consumers.get(dependency) ?? [];
      list.push(file.virtualPath);
      consumers.set(dependency, list);
    }
  const affected = new Set(changed),
    pending = [...affected];
  for (let i = 0; i < pending.length; i++)
    for (const path of consumers.get(pending[i]) ?? []) {
      if (!affected.has(path)) {
        affected.add(path);
        pending.push(path);
      }
    }
  return affected;
}

/** Unknown is deliberately different from an inspected, empty dependency list. */
export function extractAssetDependencies(
  file: AssetFile,
  content: RuntimeProjectPackage["contents"][string] | undefined,
  format: RuntimeAssetFormat | undefined
): string[] | undefined {
  if (!format) return undefined;
  if (format.referenceTypes?.length === 0) return [];
  if (content === undefined) return undefined;
  if (content instanceof Uint8Array && format.contentEncoding === "utf8")
    content = new TextDecoder("utf-8", { fatal: true }).decode(content);
  return [...new Set(format.references(content, file))].sort();
}

/** Derived indexes only. The manifest owns direct edges; no transitive edges are persisted. */
export class RuntimeProjectDependencies {
  private readonly outgoing = new Map<string, readonly string[]>();
  private readonly incoming = new Map<string, Set<string>>();
  private readonly unknown = new Set<string>();

  constructor(files: readonly AssetFile[]) {
    for (const file of files) this.set(file);
  }

  set(file: AssetFile): void {
    const current = this.outgoing.get(file.virtualPath);
    if (
      file.dependencies === undefined
        ? this.unknown.has(file.virtualPath)
        : current?.length === file.dependencies.length && current.every((path, i) => path === file.dependencies![i])
    )
      return;
    this.remove(file.virtualPath);
    if (file.dependencies === undefined) {
      this.unknown.add(file.virtualPath);
      return;
    }
    this.outgoing.set(file.virtualPath, [...file.dependencies]);
    for (const target of file.dependencies) {
      let callers = this.incoming.get(target);
      if (!callers) this.incoming.set(target, (callers = new Set()));
      callers.add(file.virtualPath);
    }
  }

  remove(path: string): void {
    for (const target of this.outgoing.get(path) ?? []) {
      const callers = this.incoming.get(target)!;
      callers.delete(path);
      if (!callers.size) this.incoming.delete(target);
    }
    this.outgoing.delete(path);
    this.unknown.delete(path);
  }

  references(path: string): string[] {
    const unknown = [...this.unknown];
    if (unknown.length)
      throw new Error(
        `Dependency information unavailable for: ${unknown.join(", ")}; prepare asset dependencies before reference inspection`
      );
    return [...(this.incoming.get(path) ?? [])].sort();
  }
}

type Content = RuntimeProjectPackage["contents"][string];
function sameContent(a: Content | undefined, b: Content | undefined): boolean {
  if (a === b) return true;
  return a instanceof Uint8Array && b instanceof Uint8Array && a.length === b.length && a.every((v, i) => v === b[i]);
}
function assetKey(file: AssetFile): string {
  return JSON.stringify([file.virtualPath, file.type, file.path, file.params]);
}
function scriptEnvironmentKey(pack: RuntimeProjectPackage): string {
  const environment = projectScriptInputs(pack);
  return JSON.stringify(environment.declarations);
}
type ScriptSnapshot = {
  environment: string;
  files: Map<string, { key: string; content: Content | undefined; dependencies: string[] }>;
};

/** Called only at a write boundary. Hydrating bytes through read() never invalidates metadata. */
export function invalidateChangedDependencies(
  previous: RuntimeProjectPackage,
  candidate: RuntimeProjectPackage,
  formats: ReadonlyMap<string, RuntimeAssetFormat>
): void {
  const files = new Map(previous.project.files.map((file) => [file.virtualPath, file]));
  for (const file of candidate.project.files) {
    if (formats.get(file.type)?.referenceTypes?.length === 0) {
      file.dependencies = [];
      continue;
    }
    const old = files.get(file.virtualPath);
    if (
      !old ||
      assetKey(old) !== assetKey(file) ||
      !sameContent(previous.contents[file.virtualPath], candidate.contents[file.virtualPath])
    )
      delete file.dependencies;
  }
}

/** One calculation owner shared by drafts and final merged publications. Cache entries
 * describe inputs, never acceptance: a failed save cannot publish project state. */
export class RuntimeDependencyMaintenance {
  private readonly assets = new Map<
    string,
    { key: string; content: Content | undefined; format: RuntimeAssetFormat | undefined; dependencies: string[] }
  >();
  private scripts?: ScriptSnapshot;
  private acceptedScripts?: ScriptSnapshot;

  constructor(
    pack: RuntimeProjectPackage,
    private readonly formats: ReadonlyMap<string, RuntimeAssetFormat>
  ) {
    for (const file of pack.project.files)
      if (file.dependencies !== undefined && file.type !== "script") {
        if (formats.get(file.type)?.referenceTypes?.length !== 0) this.remember(pack, file, file.dependencies);
      }
    if (pack.project.files.filter((f) => f.type === "script").every((f) => f.dependencies !== undefined))
      this.accept(pack);
  }

  private remember(pack: RuntimeProjectPackage, file: AssetFile, dependencies: readonly string[]): void {
    this.assets.set(file.virtualPath, {
      key: assetKey(file),
      content: structuredClone(pack.contents[file.virtualPath]),
      format: this.formats.get(file.type),
      dependencies: [...dependencies]
    });
  }

  private rememberScripts(pack: RuntimeProjectPackage): void {
    this.scripts = {
      environment: scriptEnvironmentKey(pack),
      files: new Map(
        pack.project.files
          .filter((f) => f.type === "script")
          .map((file) => [
            file.virtualPath,
            {
              key: assetKey(file),
              content: structuredClone(pack.contents[file.virtualPath]),
              dependencies: [...file.dependencies!]
            }
          ])
      )
    };
  }

  /** Keep the accepted graph available when an unrelated detached draft fails or is discarded. */
  accept(pack: RuntimeProjectPackage): void {
    this.rememberScripts(pack);
    this.acceptedScripts = this.scripts;
  }

  private matchingScripts(pack: RuntimeProjectPackage): ScriptSnapshot | undefined {
    const files = pack.project.files.filter((f) => f.type === "script"),
      environment = scriptEnvironmentKey(pack);
    return [this.scripts, this.acceptedScripts].find(
      (previous) =>
        previous &&
        previous.environment === environment &&
        previous.files.size === files.length &&
        files.every((file) => {
          const cached = previous.files.get(file.virtualPath),
            content = pack.contents[file.virtualPath];
          if (!cached || cached.key !== assetKey(file)) return false;
          if (sameContent(cached.content, content) && (content !== undefined || file.dependencies !== undefined))
            return true;
          // A complete cold record can be hydrated by read(). Writes clear its metadata first.
          return (
            (cached.content === undefined || content === undefined) &&
            file.dependencies !== undefined &&
            JSON.stringify(file.dependencies) === JSON.stringify(cached.dependencies)
          );
        })
    );
  }

  needsScriptAnalysis(pack: RuntimeProjectPackage): boolean {
    return pack.project.files.some((f) => f.type === "script") && !this.matchingScripts(pack);
  }

  /** Called after analysis, or before a query/commit. Missing content is never fetched here. */
  refresh(pack: RuntimeProjectPackage, analyzedScripts?: Readonly<Record<string, readonly string[]>>): void {
    const scripts = pack.project.files.filter((f) => f.type === "script");
    if (analyzedScripts) {
      for (const file of scripts) {
        const refs = analyzedScripts[file.virtualPath];
        if (!refs) throw new Error(`Missing analyzed Script dependencies: '${file.virtualPath}'`);
        file.dependencies = [...new Set(refs)];
      }
      this.rememberScripts(pack);
    } else if (this.needsScriptAnalysis(pack)) {
      // Direct draft users can supply an analyzer-backed Script format.
      const dependencies: Record<string, readonly string[]> = {};
      for (const file of scripts) {
        const refs = extractAssetDependencies(file, pack.contents[file.virtualPath], this.formats.get(file.type));
        if (refs === undefined) throw new Error(`Analyze script imports before inspecting '${file.virtualPath}'`);
        dependencies[file.virtualPath] = refs;
      }
      this.refresh(pack, dependencies);
      return;
    } else {
      const snapshot = this.matchingScripts(pack);
      for (const file of scripts) file.dependencies = [...snapshot!.files.get(file.virtualPath)!.dependencies];
      this.rememberScripts(pack);
    }
    for (const file of pack.project.files) {
      if (file.type === "script") continue;
      const cached = this.assets.get(file.virtualPath),
        content = pack.contents[file.virtualPath],
        format = this.formats.get(file.type);
      if (format?.referenceTypes?.length === 0) {
        file.dependencies = [];
        this.assets.delete(file.virtualPath);
        continue;
      }
      const hydrated =
        cached?.content === undefined &&
        content !== undefined &&
        file.dependencies !== undefined &&
        JSON.stringify(file.dependencies) === JSON.stringify(cached?.dependencies);
      if (
        cached &&
        cached.key === assetKey(file) &&
        cached.format === format &&
        ((sameContent(cached.content, content) && (content !== undefined || file.dependencies !== undefined)) ||
          hydrated)
      ) {
        file.dependencies = [...cached.dependencies];
        if (hydrated) this.remember(pack, file, cached.dependencies);
      } else {
        const refs = extractAssetDependencies(file, content, format);
        if (refs !== undefined) {
          file.dependencies = refs;
          this.remember(pack, file, refs);
        } else if (content !== undefined || file.dependencies === undefined) delete file.dependencies;
      }
    }
    const paths = new Set(pack.project.files.map((f) => f.virtualPath));
    for (const path of this.assets.keys()) if (!paths.has(path)) this.assets.delete(path);
  }
}

/** Accepted projects have complete direct edges. Drafts can be temporarily incomplete. */
export function validateProjectDependencies(pack: RuntimeProjectPackage): void {
  const paths = new Set(pack.project.files.map((f) => f.virtualPath));
  for (const file of pack.project.files) {
    if (file.dependencies === undefined) throw new Error(`Dependency information unavailable for: ${file.virtualPath}`);
    for (const dependency of file.dependencies)
      if (!paths.has(dependency))
        throw new Error(`Asset '${file.virtualPath}' references missing asset '${dependency}'`);
  }
}
