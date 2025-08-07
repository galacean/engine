import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  resourceLoader
} from "@galacean/engine-core";
import { ShaderChunkLoader } from "./ShaderChunkLoader";

@resourceLoader(AssetType.Shader, ["gs", "gsl"])
class ShaderLoader extends Loader<Shader> {
  private static _builtinRegex = /^\s*\/\/\s*@builtin\s+(\w+)/;

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const { url } = item;

    // @ts-ignore
    return resourceManager._request<string>(url, { ...item, type: "text" }).then((code: string) => {
      const builtinShader = this._getBuiltinShader(code);
      if (builtinShader) {
        return Shader.find(builtinShader);
      }

      return ShaderChunkLoader._loadChunksInCode(code, url, resourceManager).then(() => {
        const shader = Shader.create(code, undefined, url);
        return shader;
      });
    });
  }

  private _getBuiltinShader(code: string) {
    const match = code.match(ShaderLoader._builtinRegex);
    if (match && match[1]) return match[1];
  }
}
