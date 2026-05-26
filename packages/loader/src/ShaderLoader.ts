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
    const url = item.url!;

    if (url.endsWith(".shaderc")) {
      // @ts-ignore
      return resourceManager._request(url, { ...item, type: "json" }).then((data) => {
        // @ts-ignore - _createFromPrecompiled is @internal
        return Shader._createFromPrecompiled(data);
      });
    }

    // @ts-ignore
    return resourceManager._request<string>(url, { ...item, type: "text" }).then((code: string) => {
      return Shader.create(code, undefined, url);
    });
  }
}
