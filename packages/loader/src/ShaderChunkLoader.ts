import {
  AssetPromise,
  LoadItem,
  Loader,
  ResourceManager,
  ShaderFactory,
  resourceLoader,
  // @ts-ignore
  ShaderLib,
  Utils
} from "@galacean/engine-core";

@resourceLoader("ShaderChunk", ["glsl"])
export class ShaderChunkLoader extends Loader<void[]> {
  private static _shaderIncludeRegex = /#include\s+"([./][^\\"]+)"/gm;

  /**
   * @internal
   */
  static _loadChunksInCode(code: string, basePath: string, resourceManager: ResourceManager): Promise<void[]> {
    const shaderChunkPaths = new Array<string>();
    const matches = code.matchAll(ShaderChunkLoader._shaderIncludeRegex);
    for (const match of matches) {
      const chunkPath = Utils.resolveAbsoluteUrl(basePath, match[1]);
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

    // @ts-ignore
    return resourceManager._request<string>(url, { ...item, type: "text" }).then((code) => {
      ShaderFactory.registerInclude(url.substring(1), code);

      return ShaderChunkLoader._loadChunksInCode(code, url, resourceManager);
    });
  }
}
