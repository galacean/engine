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
    return resourceManager._request<string>(url, { ...item, type: "text" }).then((code) => {
      const source = code.trimStart();
      const shader = source.startsWith("{")
        ? Shader._createFromPrecompiled(JSON.parse(source))
        : Shader.create(code, undefined, url);

      if (!shader) {
        throw new Error(`ShaderLoader: failed to create shader "${url}".`);
      }
      return shader;
    });
  }
}
