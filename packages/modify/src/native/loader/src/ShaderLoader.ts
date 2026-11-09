import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  resourceLoader
} from "@galacean/engine-core";

const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:/;

function sourceFileForShader(url: string, baseUrl: string | null): string {
  if (!ABSOLUTE_URL_PATTERN.test(url)) {
    return url.split(/[?#]/, 1)[0].replace(/^\/+/, "");
  }
  const sourceURL = new URL(url);
  sourceURL.search = "";
  sourceURL.hash = "";
  // Relative bases do not identify an absolute source's project root without a host context.
  if (baseUrl && ABSOLUTE_URL_PATTERN.test(baseUrl)) {
    const resolvedBase = new URL(baseUrl);
    const baseDirectory = resolvedBase.href.endsWith("/") ? resolvedBase : new URL(".", resolvedBase);
    if (sourceURL.origin === baseDirectory.origin && sourceURL.href.startsWith(baseDirectory.href)) {
      return decodeURI(sourceURL.href.slice(baseDirectory.href.length));
    }
  }
  return sourceURL.href;
}

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
      return Shader._createFromSource(code, undefined, sourceFileForShader(url, resourceManager.baseUrl));
    });
  }
}
