import { AssetPromise, LoadItem, Loader, ResourceManager, ShaderFactory, resourceLoader } from "@galacean/engine-core";

@resourceLoader("ShaderChunk", ["glsl"])
class ShaderChunkLoader extends Loader<void[]> {
  private static _includeRegex = /^[ \t]*#include\s+"([^\\"]+)"/gm;

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<void[]> {
    return this.request<string>(item.url, { ...item, type: "text" }).then((code: string) => {
      const { includeKey } = item.params;
      ShaderFactory.registerInclude(includeKey, code);

      const matches = code.matchAll(ShaderChunkLoader._includeRegex);
      return Promise.all(
        matches.map((m) => {
          const path = m[1];
          if (path) {
            // @ts-ignore
            const resource = resourceManager._virtualPathMap[path];
            if (!resource) return;
            return resourceManager.load<void>({ type: "ShaderChunk", url: resource, params: { includeKey: path } });
          }
        })
      );
    });
  }
}
