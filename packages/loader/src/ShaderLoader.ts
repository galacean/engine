import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  resourceLoader,
  // @ts-ignore
  ShaderLib
} from "@galacean/engine-core";
import { PathUtils } from "./PathUtils";

@resourceLoader(AssetType.Shader, ["gs", "gsl"])
class ShaderLoader extends Loader<Shader> {
  private static _builtinRegex = /^\s*\/\/\s*@builtin\s+(\w+)/;

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const { virtualPath, url } = item;
    const shaderVirtualPath = virtualPath ?? "/";

    return this.request<string>(url, { ...item, type: "text" }).then((code: string) => {
      const builtinShader = this.getBuiltinShader(code);
      if (builtinShader) {
        return Shader.find(builtinShader);
      }

      const shaderChunkPaths: string[] = [];
      const matches = code.matchAll(PathUtils.shaderIncludeRegex);
      for (const match of matches) {
        const chunkPath = PathUtils.pathResolve(match[1], shaderVirtualPath);
        if (!ShaderLib[chunkPath.substring(1)]) {
          shaderChunkPaths.push(chunkPath);
        }
      }

      return Promise.all(
        shaderChunkPaths.map((chunkPath) => {
          return resourceManager.load({
            type: "ShaderChunk",
            url: chunkPath,
            virtualPath: chunkPath,
            params: { shaderVirtualPath }
          });
        })
      ).then(() => {
        return Shader.create(code);
      });
    });
  }

  private getBuiltinShader(code: string) {
    const match = code.match(ShaderLoader._builtinRegex);
    if (match && match[1]) return match[1];
  }
}
