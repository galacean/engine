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
  private static readonly _loadedPrograms = new Map<string, Shader>();
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const url = item.url!;
    return resourceManager._request<string>(url, { ...item, type: "text" }).then(async (code) => {
      const source = code.trimStart();
      if (source.startsWith("{")) {
        // Keep authored names: existing consumers use them as shader contracts.
        // Only a different program colliding with an existing name needs a
        // content-qualified variant; repeated loads share their exact program.
        const bytes = new TextEncoder().encode(source);
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const key = "asset/" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
        const existing = ShaderLoader._loadedPrograms.get(key);
        if (existing && !existing.destroyed) return existing;
        const data = JSON.parse(source);
        if (Shader.find(data.name)) data.name = data.name + "/" + key;
        const shader = Shader._createFromPrecompiled(data);
        if (!shader) throw new Error(`ShaderLoader: failed to create shader "${url}".`);
        ShaderLoader._loadedPrograms.set(key, shader);
        return shader;
      }
      const shader = Shader.create(code, undefined, url);

      if (!shader) {
        throw new Error(`ShaderLoader: failed to create shader "${url}".`);
      }
      return shader;
    });
  }
}
