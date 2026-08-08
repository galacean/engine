import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  resourceLoader
} from "@galacean/engine-core";

function sourceFileForShader(url: string, baseUrl: string | null): string {
  try {
    const sourceURL = new URL(url);
    sourceURL.search = "";
    sourceURL.hash = "";
    if (baseUrl) {
      const resolvedBase = new URL(baseUrl);
      const baseDirectory = resolvedBase.href.endsWith("/") ? resolvedBase : new URL(".", resolvedBase);
      if (sourceURL.origin === baseDirectory.origin && sourceURL.href.startsWith(baseDirectory.href)) {
        return decodeURIComponent(sourceURL.href.slice(baseDirectory.href.length));
      }
    }
    return sourceURL.href;
  } catch {
    return url.split(/[?#]/, 1)[0].replace(/^\/+/, "");
  }
}

@resourceLoader(AssetType.Shader, ["shader", "shaderc"])
class ShaderLoader extends Loader<Shader> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const url = item.url!;
    // @ts-expect-error _request is @internal
    return resourceManager._request<string>(url, { ...item, type: "text" }).then((code) => {
      const source = code.trimStart();
      if (source.startsWith("{")) {
        // @ts-expect-error _createFromPrecompiled is @internal
        return Shader._createFromPrecompiled(JSON.parse(source));
      }

      // @ts-expect-error _createFromSource is @internal loader metadata plumbing.
      return Shader._createFromSource(code, undefined, sourceFileForShader(url, resourceManager.baseUrl));
    });
  }
}
