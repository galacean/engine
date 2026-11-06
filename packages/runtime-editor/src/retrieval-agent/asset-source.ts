import type { RetrievalClient } from "@galacean/engine-retrieval/retrieval/index";
import { configuredProjectFiles } from "@galacean/engine-project/project-files/virtual-project-files";
import { projectFileType } from "@galacean/engine-project/project-files/project-file-types";
import type { RuntimeAssetSource } from "../project/runtime-asset-import";
import { createHttpStorage, type ResourceStorage } from "@galacean/engine-retrieval/retrieval/src/storage";

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_IMPORT_BYTES = 256 * 1024 * 1024;

/** Search stays outside the project VFS. Only import resolves and downloads selected material. */
export function createRetrievalAssetSource(
  library: Pick<RetrievalClient, "resourceSet">,
  storage: ResourceStorage = createHttpStorage()
): RuntimeAssetSource {
  return {
    paths: () => [],
    read: () => undefined,
    async resolveImport(source, signal) {
      if (!source.startsWith("/oss/")) return undefined;
      const set = await library.resourceSet(source, { signal });
      signal.throwIfAborted();
      const declared = new Set(set.resources.map((resource) => resource.path));
      if (source !== set.root && !declared.has(source)) throw new Error(`Undeclared import source '${source}'`);
      if (set.resources.length > 10_000) throw new Error("Asset exceeds the import file budget");
      let loadedBytes = 0;
      const files = configuredProjectFiles({
        files: set.resources.map((resource) => {
          const path = resource.path.slice(1);
          return {
            path,
            summary: set.candidate.descriptionExcerpt ?? set.candidate.name ?? path,
            usage: set.candidate.usageExcerpt ?? "查看同目录 README.md 或 describe.json。",
            load: async (loadSignal?: AbortSignal) => {
              const bytes = await storage.read(resource.url, {
                signal: loadSignal,
                maxBytes: Math.min(MAX_FILE_BYTES, MAX_IMPORT_BYTES - loadedBytes)
              });
              loadedBytes += bytes.byteLength;
              if (loadedBytes > MAX_IMPORT_BYTES) throw new Error("Asset exceeds the import byte budget");
              const type = projectFileType(path);
              if (["GLTF", "Texture"].includes(type)) return bytes;
              const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
              if (!path.endsWith(".meta")) return text;
              const metadata = JSON.parse(text);
              return JSON.stringify({
                ...metadata,
                summary: typeof metadata.summary === "string" ? metadata.summary : (set.candidate.name ?? path)
              });
            }
          };
        })
      });
      return { source: source.slice(1), files };
    }
  };
}
