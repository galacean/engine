import type { RuntimeProjectPackage } from "./runtime-project";
import { sameRuntimeProjectContent, snapshotRuntimeProjectContent } from "./runtime-project-content";

/** Type scopes retain the full asset namespace. Root scopes include root/dependency
 * metadata and content; unknown edges conservatively include every asset. Package
 * settings and domain sidecars always participate; unrelated asset descriptions do not. */
export type RuntimeProjectInputScope =
  | { contentTypes: readonly string[]; rootTypes?: never }
  | { rootTypes: readonly string[]; contentTypes?: never };

function paths(pack: RuntimeProjectPackage, scope?: RuntimeProjectInputScope): Set<string> {
  const files = pack.project.files;
  if (!scope) return new Set(files.map((file) => file.virtualPath));
  if (scope.contentTypes) {
    const types = new Set(scope.contentTypes.map((type) => type.toLowerCase()));
    return new Set(files.filter((file) => types.has(file.type.toLowerCase())).map((file) => file.virtualPath));
  }
  const types = new Set(scope.rootTypes.map((type) => type.toLowerCase()));
  const byPath = new Map(files.map((file) => [file.virtualPath, file]));
  const pending = files.filter((file) => types.has(file.type.toLowerCase())).map((file) => file.virtualPath);
  const selected = new Set(pending);
  for (let i = 0; i < pending.length; i++) {
    const file = byPath.get(pending[i]);
    if (!file || file.dependencies === undefined) return new Set(files.map((file) => file.virtualPath));
    for (const dependency of file.dependencies)
      if (!selected.has(dependency)) {
        selected.add(dependency);
        pending.push(dependency);
      }
  }
  return selected;
}

function metadata(pack: RuntimeProjectPackage, scope?: RuntimeProjectInputScope): string {
  const selected = scope?.rootTypes ? paths(pack, scope) : undefined;
  return JSON.stringify({
    version: pack.version,
    project: {
      ...pack.project,
      files: pack.project.files
        .filter((file) => !selected || selected.has(file.virtualPath))
        .map(({ dependencies: _, ...file }) => file)
    },
    // Asset descriptions are not inputs to unrelated roots. Domain sidecars remain
    // conservative inputs (including migration markers and deletion tombstones).
    documents:
      pack.documents &&
      Object.fromEntries(
        Object.entries(pack.documents).filter(
          ([path]) => !selected || !path.endsWith(".meta") || selected.has(path.slice(0, -5))
        )
      )
  });
}

/** A bounded, detached input snapshot, not a record of successful validation. */
export class RuntimeProjectInputs {
  private readonly metadata: string;
  private readonly contents: Map<string, string | Uint8Array | undefined>;
  private readonly scope?: RuntimeProjectInputScope;

  constructor(pack: RuntimeProjectPackage, scope?: RuntimeProjectInputScope) {
    this.scope = scope && structuredClone(scope);
    this.metadata = metadata(pack, this.scope);
    this.contents = new Map(
      [...paths(pack, this.scope)].map((path) => [path, snapshotRuntimeProjectContent(pack.contents[path])])
    );
  }

  matches(pack: RuntimeProjectPackage): boolean {
    if (this.metadata !== metadata(pack, this.scope)) return false;
    const selected = paths(pack, this.scope);
    if (selected.size !== this.contents.size) return false;
    for (const path of selected)
      if (!this.contents.has(path) || !sameRuntimeProjectContent(this.contents.get(path), pack.contents[path]))
        return false;
    return true;
  }
}
