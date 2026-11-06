import { projectWorkCheckpoint } from "@galacean/engine-project/project-files/virtual-project-files";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import type { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import {
  assertRuntimeHierarchyEquivalent,
  importRuntimeHierarchy
} from "../runtime-editor/scene/runtime-hierarchy-source.ts";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";

/** Shared binary identity and hierarchy conversion for loose folders and resource packages. */
export async function prepareImportedEntries(
  entries: Parameters<RuntimeProjectEdit["createBundle"]>[0],
  current: RuntimeProjectPackage,
  signal?: AbortSignal
) {
  const checkpoint = projectWorkCheckpoint(signal);
  for (const entry of entries) {
    await checkpoint();
    if (entry.file.type === "GLTF" && entry.content instanceof Uint8Array) {
      const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(entry.content).buffer);
      entry.file.params = {
        ...entry.file.params,
        sourceContentRevision: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")
      };
    }
  }
  const importFiles = [...current.project.files, ...entries.map((entry) => entry.file)];
  const originals = new Map<string, Record<string, any>>();
  for (const entry of entries) {
    await checkpoint();
    if (/^(Scene|Prefab)$/.test(entry.file.type) && typeof entry.content === "string") {
      const original = JSON.parse(entry.content);
      if (original.asset) continue;
      entry.content = JSON.stringify(
        importRuntimeHierarchy(original, entry.file.virtualPath, importFiles, () => false)
      );
      originals.set(entry.file.virtualPath, original);
    }
  }
  const imported = {
    ...current,
    project: { ...current.project, files: importFiles },
    contents: {
      ...current.contents,
      ...Object.fromEntries(entries.map((entry) => [entry.file.virtualPath, entry.content]))
    }
  };
  for (const [path, original] of originals) {
    await checkpoint();
    assertRuntimeHierarchyEquivalent(original, JSON.parse(compileProjectResource(imported, path) as string));
  }
  signal?.throwIfAborted();
}
