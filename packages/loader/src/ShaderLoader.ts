import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  resourceLoader
} from "@galacean/engine-core";

@resourceLoader(AssetType.Shader, ["shader"])
class ShaderLoader extends Loader<Shader> {
  private static _builtinRegex = /^\s*\/\/\s*@builtin\s+(\w+)/;

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const url = item.url!;

    if (url.endsWith(".gsp")) {
      // @ts-ignore
      return resourceManager._request(url, { ...item, type: "json" }).then((data) => {
        // @ts-ignore - _createFromPrecompiled is @internal
        return Shader._createFromPrecompiled(data);
      });
    }

    // @ts-ignore
    return resourceManager._request<string>(url, { ...item, type: "text" }).then((code: string) => {
      const builtinShader = this._getBuiltinShader(code);
      if (builtinShader) {
        return Shader.find(builtinShader);
      }

      return Shader.create(code);
    });
  }

  private _getBuiltinShader(code: string) {
    const match = code.match(ShaderLoader._builtinRegex);
    if (match && match[1]) return match[1];
  }
}
