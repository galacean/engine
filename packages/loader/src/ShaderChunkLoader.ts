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

@resourceLoader(AssetType.ShaderChunk, ["glsl"], false)
class ShaderLoader extends Loader<void> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<void> {
    return this.request<any>(item.url, { ...item, type: "text" }).then((code) => {
      const { includeKey } = item.params;
      ShaderFactory.registerInclude(includeKey, code);
    });
  }
}
