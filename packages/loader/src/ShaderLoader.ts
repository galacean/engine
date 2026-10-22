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
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const url = item.url!;
    return resourceManager._request<string>(url, { ...item, type: "text" }).then((code) => {
      const source = code.trimStart();
      const shader = source.startsWith("{")
        ? Shader._createFromPrecompiled(JSON.parse(source))
        : Shader._createFromSource(code, undefined, sourceFileForShader(url, resourceManager.baseUrl));

      if (!shader) {
        throw new Error(`ShaderLoader: failed to create shader "${url}".`);
      }
      return shader;
    });
  }
}
