import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  ShaderFactory,
  resourceLoader
} from "@galacean/engine-core";

@resourceLoader("ShaderChunk", ["glsl"], false)
class ShaderChunkLoader extends Loader<void> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<void> {
    return this.request<any>(item.url, { ...item, type: "text" }).then(async (code) => {
      const { includeKey } = item.params;
      ShaderFactory.registerInclude(includeKey, code);

      const matches = code.matchAll(/^[ \t]*#include +"([^$\\"]+)"/gm);
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
