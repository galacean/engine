import { affectedProjectAssets } from "@galacean/engine-project/runtime-editor/project/runtime-project-dependencies";
import type {
  RuntimeProjectManifest,
  RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";

type File = RuntimeProjectManifest["files"][number];
type Content = string | Uint8Array | undefined;

/** Dependency metadata is derived; URL, loader type and parameters identify the resource. */
export function resourceSignature(file: File | undefined): string | undefined {
  if (!file) return undefined;
  const { dependencies: _, ...resource } = file;
  return JSON.stringify(resource);
}

export function sameResourceContent(a: Content, b: Content): boolean {
  return (
    a === b ||
    (a instanceof Uint8Array &&
      b instanceof Uint8Array &&
      a.byteLength === b.byteLength &&
      a.every((byte, index) => byte === b[index]))
  );
}

/** One change definition for resource loading and Scene rebinding. Reads fill missing
 * baseline bytes; they never overwrite authored contents or count as edits. */
export class RuntimeAssetChanges {
  private files = new Map<string, File>();
  private contents: RuntimeProjectPackage["contents"] = {};
  private readonly reads = new Map<string, { signature: string; content: Exclude<Content, undefined> }>();

  constructor(pack?: RuntimeProjectPackage) {
    if (pack) this.accept(pack);
  }

  recordRead(file: File, content: Exclude<Content, undefined>): void {
    this.reads.set(file.virtualPath, { signature: resourceSignature(file)!, content });
  }

  private read(file: File | undefined): Content {
    if (!file) return undefined;
    const read = this.reads.get(file.virtualPath);
    return read?.signature === resourceSignature(file) ? read?.content : undefined;
  }

  affected(pack: RuntimeProjectPackage): Set<string> {
    const changed = pack.project.files
      .filter((file) => {
        const previous = this.files.get(file.virtualPath);
        return (
          resourceSignature(previous) !== resourceSignature(file) ||
          !sameResourceContent(
            this.contents[file.virtualPath] ?? this.read(previous),
            pack.contents[file.virtualPath] ?? this.read(file)
          )
        );
      })
      .map((file) => file.virtualPath);
    return affectedProjectAssets(pack.project.files, changed);
  }

  accept(pack: RuntimeProjectPackage): void {
    this.files = new Map(pack.project.files.map((file) => [file.virtualPath, structuredClone(file)]));
    this.contents = { ...pack.contents };
    for (const path of this.reads.keys()) {
      if (this.contents[path] !== undefined || this.read(this.files.get(path)) === undefined) this.reads.delete(path);
    }
  }

  clear(): void {
    this.files.clear();
    this.contents = {};
    this.reads.clear();
  }
}
