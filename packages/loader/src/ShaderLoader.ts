import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  ShaderLanguage,
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
      const engine = resourceManager.engine;
      const builtinShaders = engine?._builtinShaders?.byName;
      if (source.startsWith("{")) return Shader._createFromPrecompiled(JSON.parse(source), builtinShaders);
      const language = engine?._hardwareRenderer.backend === "webgpu" ? ShaderLanguage.WGSL : ShaderLanguage.GLSLES300;
      return Shader._createFromSource(
        code,
        language,
        sourceFileForShader(url, resourceManager.baseUrl),
        engine?._shaderCompiler,
        builtinShaders,
        ShaderLanguage.GLSLES300
      );
    });
  }
}
