import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  resourceLoader
} from "@galacean/engine-core";

@resourceLoader(AssetType.Shader, ["gs", "gsl"], false)
class ShaderLoader extends Loader<Shader> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    return this.request<any>(item.url, { ...item, type: "text" }).then((code: string) => {
      const builtinShader = this.getBuiltinShader(code);
      if (builtinShader) {
        return Shader.find(builtinShader);
      }

      const matches = code.matchAll(/^[ \t]*#include +"([^$\\"]+)"/gm);
      return Promise.all(
        Array.from(matches).map((m) => {
          const path = m[1];
          if (path) {
            // @ts-ignore
            const resource = resourceManager._virtualPathMap[path];
            if (!resource) return;
            return resourceManager.load({ type: "ShaderChunk", url: resource, params: { includeKey: path } });
          }
        })
      ).then(() => {
        return Shader.create(code);
      });
    });
  }

  private getBuiltinShader(code: string) {
    const match = code.match(/^\s*\/\/\s*@builtin\s+(\w+)/);
    if (match && match[1]) return match[1];
  }
}
