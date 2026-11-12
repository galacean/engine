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
      const sourceFile = sourceFileForShader(url, resourceManager.baseUrl);
      // Source and precompiled assets share the same content identity boundary.
      // A project asset may legitimately reuse a built-in runtime program's name.
      // Source includes resolve relative to the asset URL; identical text in a
      // different namespace is not necessarily the same program.
      const bytes = new TextEncoder().encode(
        source.startsWith("{") ? source : `${resourceManager._getRemoteUrl(url)}\n${sourceFile}\n${source}`
      );
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const key = "asset/" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      const existing = ShaderLoader._loadedPrograms.get(key);
      if (existing && !existing.destroyed) return existing;
      if (source.startsWith("{")) {
        // Keep content sharing and authored names; native Shader permits independent namesakes.
        // Materials with explicit references choose the corresponding asset instance.
        const data = JSON.parse(source);
        const shader = Shader._createFromPrecompiled(data);
        if (!shader) throw new Error(`ShaderLoader: failed to create shader "${url}".`);
        ShaderLoader._loadedPrograms.set(key, shader);
        return shader;
      }
      const shader = Shader._createFromSource(code, undefined, sourceFile);

      if (!shader) {
        throw new Error(`ShaderLoader: failed to create shader "${url}".`);
      }
      ShaderLoader._loadedPrograms.set(key, shader);
      return shader;
    });
  }
}
