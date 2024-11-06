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
import { Utils } from "./Utils";

@resourceLoader("ShaderChunk", ["glsl"])
export class ShaderChunkLoader extends Loader<void[]> {
  /**
   * @internal
   */
  static _loadChunksInCode(code: string, basePath: string, resourceManager: ResourceManager): Promise<void[]> {
    const shaderChunkPaths: string[] = [];
    const matches = code.matchAll(Utils.shaderIncludeRegex);
    for (const match of matches) {
      const chunkPath = Utils.pathResolve(match[1], basePath);
      if (!ShaderLib[chunkPath.substring(1)]) {
        shaderChunkPaths.push(chunkPath);
      }
    }

    return Promise.all(
      shaderChunkPaths.map((chunkPath) => {
        return resourceManager.load<void>({
          type: "ShaderChunk",
          url: chunkPath
        });
      })
    );
  }

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<void[]> {
    const { url } = item;

    return this.request<string>(url, resourceManager, { ...item, type: "text" }).then((code) => {
      ShaderFactory.registerInclude(url.substring(1), code);

      return ShaderChunkLoader._loadChunksInCode(code, url, resourceManager);
    });
  }
}
