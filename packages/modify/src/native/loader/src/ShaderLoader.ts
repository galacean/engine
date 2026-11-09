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
      // Source and precompiled assets share the same content identity boundary.
      // A project asset may legitimately reuse a built-in runtime program's name.
      // Source includes resolve relative to the asset URL; identical text in a
      // different namespace is not necessarily the same program.
      const bytes = new TextEncoder().encode(
        source.startsWith("{") ? source : `${resourceManager._getRemoteUrl(url)}\n${source}`
      );
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const key = "asset/" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      const existing = ShaderLoader._loadedPrograms.get(key);
      if (existing && !existing.destroyed) return existing;
      if (source.startsWith("{")) {
        // Keep authored names: existing consumers use them as shader contracts.
        // Only a different program colliding with an existing name needs a
        // content-qualified variant; repeated loads share their exact program.
        const data = JSON.parse(source);
        if (Shader.find(data.name)) data.name = data.name + "/" + key;
        const shader = Shader._createFromPrecompiled(data);
        if (!shader) throw new Error(`ShaderLoader: failed to create shader "${url}".`);
        ShaderLoader._loadedPrograms.set(key, shader);
        return shader;
      }
      const qualified = source.replace(
        /^((?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\n|$))*Shader\s+")([^"\n]+)(")/,
        (declaration, prefix, name, suffix) => (Shader.find(name) ? `${prefix}${name}/${key}${suffix}` : declaration)
      );
      const shader = Shader.create(qualified, undefined, url);

      if (!shader) {
        throw new Error(`ShaderLoader: failed to create shader "${url}".`);
      }
      ShaderLoader._loadedPrograms.set(key, shader);
      return shader;
    });
  }
}
