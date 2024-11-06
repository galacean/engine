import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  resourceLoader
} from "@galacean/engine-core";
import { _loadChunksInCode } from "./ShaderChunkLoader";

@resourceLoader(AssetType.Shader, ["gs", "gsl"])
class ShaderLoader extends Loader<Shader> {
  private static _builtinRegex = /^\s*\/\/\s*@builtin\s+(\w+)/;

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const { url } = item;

    return this.request<string>(url, resourceManager, { ...item, type: "text" }).then((code: string) => {
      const builtinShader = this.getBuiltinShader(code);
      if (builtinShader) {
        return Shader.find(builtinShader);
      }

      return _loadChunksInCode(code, url, resourceManager).then(() => {
        return Shader.create(code);
      });
    });
  }

  private getBuiltinShader(code: string) {
    const match = code.match(ShaderLoader._builtinRegex);
    if (match && match[1]) return match[1];
  }
}
