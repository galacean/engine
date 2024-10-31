import {
  AssetPromise,
  LoadItem,
  Loader,
  ResourceManager,
  ShaderFactory,
  resourceLoader,
  // @ts-ignore
  ShaderLib
} from "@galacean/engine-core";
import { PathUtils } from "./PathUtils";

@resourceLoader("ShaderChunk", ["glsl"])
class ShaderChunkLoader extends Loader<void[]> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<void[]> {
    return this.request<string>(item.url, { ...item, type: "text" }).then((code: string) => {
      const { includeKey, shaderPath } = item.params;
      ShaderFactory.registerInclude((<string>includeKey).substring(1), code);

      const matches = code.matchAll(PathUtils.shaderIncludeRegex);
      const shaderChunkPaths: string[] = [];
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
          return resourceManager.load<void>({
            type: "ShaderChunk",
            url: resource,
            params: { includeKey: path, shaderPath }
          });
        })
      );
    });
  }
}
