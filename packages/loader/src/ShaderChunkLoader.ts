import {
  AssetPromise,
  LoadItem,
  Loader,
  ResourceManager,
  ShaderFactory,
  resourceLoader,
  // @ts-ignore
  ShaderLib
} from "@galacean/engine-core";
import { PathUtils } from "./PathUtils";

@resourceLoader("ShaderChunk", ["glsl"])
class ShaderChunkLoader extends Loader<void[]> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<void[]> {
    const { virtualPath, url } = item;
    const shaderVirtualPath = item.params?.shaderVirtualPath ?? "/";
    const chunkPath = virtualPath ?? new URL(url).pathname;

    return this.request<string>(url, { ...item, type: "text" }).then((code: string) => {
      ShaderFactory.registerInclude(chunkPath.substring(1), code);

      const matches = code.matchAll(PathUtils.shaderIncludeRegex);
      const shaderChunkPaths: string[] = [];
      for (const match of matches) {
        const chunkPath = PathUtils.pathResolve(match[1], shaderVirtualPath);
        if (!ShaderLib[chunkPath.substring(1)]) {
          shaderChunkPaths.push(chunkPath);
        }
      }

      return Promise.all(
        shaderChunkPaths.map((chunkPath) => {
          return resourceManager.load<void>({
            type: "ShaderChunk",
            url: chunkPath,
            virtualPath: chunkPath,
            params: { shaderVirtualPath }
          });
        })
      );
    });
  }
}
