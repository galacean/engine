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
  private static _shaderIncludeRegex = /\s#include\s+"([./][^\\"]+)"/;

  /**
   * @internal
   */
  static _loadChunksInCode(code: string, basePath: string, resourceManager: ResourceManager): Promise<void[]> {
    const shaderChunkPaths = new Array<string>();
    const matches = ShaderChunkLoader._matchAll(ShaderChunkLoader._shaderIncludeRegex, code);
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

  private static _matchAll(pattern: RegExp, haystack: string) {
    var regex = new RegExp(pattern, "g");
    var matches = [];

    var match_result = haystack.match(regex);

    for (let index in match_result) {
      var item = match_result[index];
      matches[index] = item.match(pattern);
    }
    return matches;
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
