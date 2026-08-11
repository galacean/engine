import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  resourceLoader
} from "@galacean/engine-core";

@resourceLoader(AssetType.Shader, ["shader", "shaderc"])
class ShaderLoader extends Loader<Shader> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const assetPath = item.url!;
    // @ts-expect-error _request is @internal
    return resourceManager._request<string>(assetPath, { ...item, type: "text" }).then((code) => {
      const source = code.trimStart();
      if (source.startsWith("{")) {
        // @ts-expect-error _createFromPrecompiled is @internal
        return Shader._createFromPrecompiled(JSON.parse(source));
      }

      return Shader.create(code, undefined, assetPath);
    });
  }
}
