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
    // @ts-expect-error _request is @internal
    return resourceManager._request<string>(url, { ...item, type: "text" }).then((code) => {
      const source = code.trimStart();
      const shader = source.startsWith("{")
        ? // @ts-expect-error _createFromPrecompiled is @internal
          Shader._createFromPrecompiled(JSON.parse(source))
        : Shader.create(code, undefined, url);

      if (!shader) {
        throw new Error(`ShaderLoader: failed to create shader "${url}".`);
      }
      return shader;
    });
  }
}
