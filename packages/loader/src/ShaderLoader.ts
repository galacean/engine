import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  resourceLoader,
  // @ts-ignore
  ShaderLib,
  Logger
} from "@galacean/engine-core";
import { PathUtils } from "./PathUtils";

@resourceLoader(AssetType.Shader, ["gs", "gsl"])
class ShaderLoader extends Loader<Shader> {
  private static _builtinRegex = /^\s*\/\/\s*@builtin\s+(\w+)/;

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    return this.request<string>(item.url, { ...item, type: "text" }).then((code: string) => {
      const builtinShader = this.getBuiltinShader(code);
      if (builtinShader) {
        return Shader.find(builtinShader);
      }

      const { uuid } = item;
      // @ts-ignore
      const shaderConfig = resourceManager._editorResourceConfig[uuid];
      if (!shaderConfig) {
        Logger.error("not found shader", uuid);
        return;
      }
      const shaderPath: string = shaderConfig.virtualPath;

      const shaderChunkPaths: string[] = [];
      const matches = code.matchAll(PathUtils.shaderIncludeRegex);
      for (const match of matches) {
        const matchedPath = match[1];
        const path = PathUtils.isRelativePath(matchedPath) ? PathUtils.pathResolve(match[1], shaderPath) : matchedPath;
        if (!ShaderLib[path]) {
          shaderChunkPaths.push(path);
        }
      }

      return Promise.all(
        shaderChunkPaths.map((path) => {
          // @ts-ignore
          const resource = resourceManager._virtualPathMap[path];
          if (!resource) return;
          return resourceManager.load({ type: "ShaderChunk", url: resource, params: { includeKey: path, shaderPath } });
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
