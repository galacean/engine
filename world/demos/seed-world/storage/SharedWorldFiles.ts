import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { sameRuntimeProjectContent } from "@galacean/engine-project/runtime-editor/project/runtime-project-content";
import type { PublishedWorldAssets } from "./PublishedWorldAssets";

export type Content = string | Uint8Array;
export interface BlockRef {
  revision: string;
  parts: number;
  digest: string;
}
export interface FileRef extends BlockRef {
  encoding: "utf8" | "binary" | "json-string";
}
// Zero means the generation was retired by this publication. Its grace period starts on confirmation.
export type RetiredGeneration = [notBefore: number, revision: string];
export interface FileIndex {
  retired?: RetiredGeneration[];
  version: RuntimeProjectPackage["version"];
  hasDocuments: boolean;
  files: [string, FileRef][];
}

const manifestKey = "project.json";
const documentPrefix = "document:";
function worldPath(virtualPath: string): string {
  return "lingguang://world/files/" + virtualPath.split("/").map(encodeURIComponent).join("/");
}

/** Synchronously detach a checkpoint before DB I/O; published source bytes stay on the CDN. */
export function captureFiles(
  pack: RuntimeProjectPackage,
  previous: ReadonlyMap<string, { content: Content }>,
  published?: PublishedWorldAssets
) {
  const overrides = published?.overrides(pack) ?? pack.contents;
  const files = new Map<string, Content>();
  const manifest = {
    ...pack.project,
    files: pack.project.files.map((file) => {
      const content = Object.hasOwn(overrides, file.virtualPath) ? overrides[file.virtualPath] : undefined;
      if (content === undefined) {
        if (!/^https?:\/\//i.test(file.path)) throw new Error(`世界资源缺少可保存的内容：${file.virtualPath}`);
        return file;
      }
      const path = worldPath(file.virtualPath);
      let snapshot = content;
      if (content instanceof Uint8Array) {
        const old = previous.get(path)?.content;
        snapshot = old instanceof Uint8Array && sameRuntimeProjectContent(old, content) ? old : new Uint8Array(content);
      }
      files.set(path, snapshot);
      return { ...file, path };
    })
  };
  files.set(manifestKey, JSON.stringify(manifest));
  for (const [path, content] of Object.entries(pack.documents ?? {})) files.set(documentPrefix + path, content);
  return files;
}

/** Hydrate before editor startup: compilers and early preloaders can synchronously inspect authored files. */
export function restoreFiles(
  index: FileIndex,
  files: ReadonlyMap<string, Content>,
  readOnly: boolean
): RuntimeProjectPackage {
  const manifest = files.get(manifestKey);
  if (typeof manifest !== "string") throw new Error("世界存档缺少 project.json");
  const project: RuntimeProjectPackage["project"] = JSON.parse(manifest);
  const documents: [string, string][] = [];
  const contents: [string, Content][] = [];
  for (const file of project.files) {
    if (/^https?:\/\//i.test(file.path)) continue;
    const content = files.get(file.path);
    if (file.path !== worldPath(file.virtualPath) || content === undefined)
      throw new Error(`世界存档资源地址无效或正文缺失：${file.virtualPath}`);
    contents.push([file.virtualPath, typeof content === "string" || readOnly ? content : new Uint8Array(content)]);
  }
  for (const [key, value] of files) {
    if (!key.startsWith(documentPrefix)) continue;
    if (!index.hasDocuments || typeof value !== "string") throw new Error("世界存档文档无效");
    documents.push([key.slice(documentPrefix.length), value]);
  }
  if (contents.length + documents.length + 1 !== files.size) throw new Error("世界文件清单与索引不一致");
  return {
    version: index.version,
    project,
    contents: Object.fromEntries(contents),
    ...(index.hasDocuments ? { documents: Object.fromEntries(documents) } : {})
  };
}
