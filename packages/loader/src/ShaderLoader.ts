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
  private static _shaderSourceMap = new WeakMap<Shader, { url: string; source: string }>();

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const url = item.url!;
    // @ts-expect-error _request is @internal
    return resourceManager._request<string>(url, { ...item, type: "text" }).then((code) => {
      const source = code.trimStart();
      if (source.startsWith("{")) {
        const data = JSON.parse(source);
        return this._getOrCreateShader(data.name, url, code, () => {
          // @ts-expect-error _createFromPrecompiled is @internal
          return Shader._createFromPrecompiled(data);
        });
      }

      const shaderName = ShaderLoader._shaderNameRegex.exec(source)?.[1];
      if (!shaderName) {
        throw new Error(`Unable to parse shader name from "${url}".`);
      }
      return this._getOrCreateShader(shaderName, url, code, () => Shader.create(code, undefined, url));
    });
  }

  private _getOrCreateShader(name: string, url: string, source: string, create: () => Shader): Shader {
    const existingShader = Shader.find(name);
    if (existingShader) {
      const existingSource = ShaderLoader._shaderSourceMap.get(existingShader);
      if (existingSource?.url === url && existingSource.source === source) {
        return existingShader;
      }

      const existingURL = existingSource ? `"${existingSource.url}"` : "an unknown source";
      throw new Error(`Shader named "${name}" from "${url}" conflicts with the shader registered from ${existingURL}.`);
    }

    const shader = create();
    ShaderLoader._shaderSourceMap.set(shader, { url, source });
    return shader;
  }
}
