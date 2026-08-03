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
  private static _shaderNameRegex = /^(?:(?:\s+)|(?:\/\/[^\r\n]*(?:\r?\n|$))|(?:\/\*[\s\S]*?\*\/))*Shader\s+"([^"]+)"/;

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const url = item.url!;
    // @ts-expect-error _request is @internal
    return resourceManager._request<string>(url, { ...item, type: "text" }).then((code) => {
      const source = code.trimStart();
      if (source.startsWith("{")) {
        const data = JSON.parse(source);
        // @ts-expect-error _createFromPrecompiled is @internal
        return Shader.find(data.name) ?? Shader._createFromPrecompiled(data);
      }

      const shaderName = ShaderLoader._shaderNameRegex.exec(source)?.[1];
      const existingShader = shaderName && Shader.find(shaderName);
      if (existingShader) {
        return existingShader;
      }
      return Shader.create(code, undefined, url);
    });
  }
}
