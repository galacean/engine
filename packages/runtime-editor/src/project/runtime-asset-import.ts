import {
  VirtualProjectFiles,
  projectWorkCheckpoint,
  type ProjectFileProvider
} from "@galacean/engine-project/project-files/virtual-project-files";
import { projectFileType } from "@galacean/engine-project/project-files/project-file-types";
import { resolveAssetPath } from "@galacean/engine-project/runtime-editor/project/runtime-asset-path";
import { rewriteAssetReferences } from "@galacean/engine-project/runtime-editor/project/runtime-asset-references";
import { prepareImportedEntries } from "./runtime-import-entries.ts";
import type { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";

/** A source can resolve a selected external locator to an operation-scoped file view.
 * The view and downloaded content are released with the import operation. */
export interface RuntimeAssetSource extends ProjectFileProvider {
  resolveImport?(
    source: string,
    signal: AbortSignal
  ): Promise<{ source: string; files: ProjectFileProvider } | undefined>;
}

/** Import bytes and documentation through one editor transaction; sources remain read-only. */
export async function importRuntimeAsset(
  draft: RuntimeProjectEdit,
  providers: readonly RuntimeAssetSource[],
  input: { source: string; path: string; type?: string },
  signal: AbortSignal
) {
  signal.throwIfAborted();
  draft.assertDestination(input.path);
  for (const provider of providers) {
    const resolved = await provider.resolveImport?.(input.source, signal);
    signal.throwIfAborted();
    if (resolved) {
      providers = [resolved.files];
      input = { ...input, source: resolved.source };
      break;
    }
  }
  const files = new VirtualProjectFiles(providers).snapshot();
  const checkpoint = projectWorkCheckpoint(signal);
  const kind = files.kind(input.source);
  if (!kind) throw new Error(`Unknown project path '${input.source}'`);
  const folder = kind === "directory";
  if (folder && input.type) throw new Error("Folder imports determine each file type; omit type");
  const sources = folder
    ? files.list().filter((path) => path.startsWith(`${input.source}/`))
    : [input.source, ...(files.kind(`${input.source}.meta`) ? [`${input.source}.meta`] : [])];
  await files.prepare(sources, signal);
  const target = (path: string) => input.path + path.slice(input.source.length);
  const documents: Record<string, string> = {};
  const entries: Parameters<RuntimeProjectEdit["createBundle"]>[0][number][] = [];
  for (const source of sources) {
    await checkpoint();
    if (source.endsWith(".meta")) {
      const content = files.read(source),
        metadata = JSON.parse(content);
      if (!metadata || typeof metadata.summary !== "string")
        throw new Error(`Metadata requires a summary: '${source}'`);
      const asset = source.slice(0, -5);
      if (files.kind(asset) === "file" && projectFileType(asset, metadata.type) !== "Document")
        documents[target(source)] = content;
      continue;
    }
    const metadata = files.kind(`${source}.meta`) ? JSON.parse(files.read(`${source}.meta`)) : undefined;
    const type = projectFileType(source, (!folder ? input.type : undefined) ?? metadata?.type);
    const content = files.readContent(source),
      path = target(source);
    if (!type || type === "Document") {
      if (typeof content !== "string")
        throw new Error(`Unsupported binary asset '${source}'; supply a supported asset type in its .meta`);
      documents[path] = content;
    } else {
      entries.push({
        file: { virtualPath: path, path: `runtime-asset:${path}`, type },
        content,
        metadata: metadata ?? { summary: "" }
      });
    }
  }
  const available = new Set([
    ...draft.list().map((file) => file.virtualPath),
    ...entries.map((entry) => entry.file.virtualPath)
  ]);
  for (const entry of entries) {
    await checkpoint();
    if (
      typeof entry.content !== "string" ||
      !["Scene", "Prefab", "Material", "AnimatorController", "JSON"].includes(entry.file.type)
    )
      continue;
    const sourcePath = input.source + entry.file.virtualPath.slice(input.path.length);
    entry.content = JSON.stringify(
      rewriteAssetReferences(entry.file.type, JSON.parse(entry.content), (reference) => {
        const resolved = resolveAssetPath(
          reference,
          sourcePath.includes("/") ? sourcePath.slice(0, sourcePath.lastIndexOf("/")) : ""
        );
        const mapped = folder && resolved.startsWith(`${input.source}/`) ? target(resolved) : resolved;
        if (!available.has(mapped))
          throw new Error(
            `Missing import dependency '${reference}' in '${sourcePath}'; import a folder containing its dependencies`
          );
        return mapped;
      })
    );
  }
  await prepareImportedEntries(entries, draft.preview(), signal);
  const directories = folder
    ? [
        input.path,
        ...files
          .directories()
          .filter((path) => path.startsWith(`${input.source}/`))
          .map(target)
      ]
    : [];
  signal.throwIfAborted();
  draft.createBundle(entries, documents, directories);
  return { path: input.path };
}
