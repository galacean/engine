import { AssetPromise, LoadItem, Loader, ResourceManager, ShaderFactory, resourceLoader } from "@galacean/engine-core";

@resourceLoader("ShaderChunk", ["glsl"])
class ShaderChunkLoader extends Loader<void> {
  private static _includeRegex = /^[ \t]*#include +"([^$\\"]+)"/gm;

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<void> {
    return this.request<string>(item.url, { ...item, type: "text" }).then(async (code: string) => {
      const { includeKey } = item.params;
      ShaderFactory.registerInclude(includeKey, code);

      const matches = code.matchAll(ShaderChunkLoader._includeRegex);
      await Promise.all(
        Array.from(matches).map((m) => {
          const path = m[1];
          if (path) {
            // @ts-ignore
            const resource = resourceManager._virtualPathMap[path];
            if (!resource) return;
            return resourceManager.load({ type: "ShaderChunk", url: resource, params: { includeKey: path } });
          }
        })
      );
    });
  }
}
