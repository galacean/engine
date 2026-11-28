import type {
  RuntimeProjectManifest,
  RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { sameRuntimeProjectContent } from "@galacean/engine-project/runtime-editor/project/runtime-project-content";
import { importRuntimeHierarchy } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-hierarchy-source";

type File = RuntimeProjectManifest["files"][number];
type Content = string | Uint8Array;

/** Only omit bytes that the project can obtain again from the exact published URL. */
export class PublishedWorldAssets {
  private readonly reads = new Map<string, Content>();

  constructor(
    private readonly bundledText: ReadonlyMap<string, string> | undefined,
    private readonly isRegisteredComponent: (name: string) => boolean
  ) {}

  recordRead(file: File, content: Content): void {
    if (!/^https?:\/\//i.test(file.path)) return;
    this.reads.set(file.path, typeof content === "string" ? content : new Uint8Array(content));
  }

  overrides(pack: RuntimeProjectPackage): RuntimeProjectPackage["contents"] {
    const contents = { ...pack.contents };
    for (const file of pack.project.files) {
      const content = contents[file.virtualPath];
      if (content === undefined || !/^https?:\/\//i.test(file.path)) continue;
      const source = this.reads.get(file.path) ?? this.bundledText?.get(file.path);
      if (source === undefined) continue;
      if (sameRuntimeProjectContent(source, content)) {
        delete contents[file.virtualPath];
      } else if (
        typeof source === "string" &&
        typeof content === "string" &&
        /^(Scene|Prefab)$/i.test(file.type) &&
        file.params?.editableSource !== true
      ) {
        // Reopening imports legacy published hierarchies into the editor's authoring format.
        // Compare with the current manifest because imports resolve references through it.
        try {
          const original = JSON.parse(source);
          if (
            !original.asset &&
            content ===
              JSON.stringify(
                importRuntimeHierarchy(original, file.virtualPath, pack.project.files, this.isRegisteredComponent)
              )
          )
            delete contents[file.virtualPath];
        } catch {
          // A custom replacement can be valid even when the published source is no longer importable.
        }
      }
    }
    return contents;
  }
}
