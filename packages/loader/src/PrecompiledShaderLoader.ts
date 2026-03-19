import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  resourceLoader
} from "@galacean/engine-core";

@resourceLoader(AssetType.ShaderPrecompiled, ["gsp"])
class PrecompiledShaderLoader extends Loader<Shader> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    // @ts-ignore
    return resourceManager._request(item.url, { ...item, type: "json" }).then((data) => {
      return Shader.createFromPrecompiled(data);
    });
  }
}

export { PrecompiledShaderLoader };
