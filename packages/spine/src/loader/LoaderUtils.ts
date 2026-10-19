import { AssetType, ResourceManager, Texture2D } from "@galacean/engine";

/** @internal */
type SpineAtlasData = {
  text: string;
  textures: Texture2D[];
};

/** @internal */
export class LoaderUtils {
  static async loadAtlas(
    atlasPath: string,
    extraPaths: string[],
    resourceManager: ResourceManager
  ): Promise<SpineAtlasData> {
    const text = await resourceManager._request<string>(atlasPath, { type: "text" });
    const virtualResources = resourceManager._virtualPathResourceMap;
    let imagePaths = extraPaths.filter((path) => /\.(png|jpg|webp|jpeg|ktx|ktx2)(?:\?|$)/.test(path));
    if (extraPaths.length === 0) {
      const dependencies = virtualResources[atlasPath]?.dependentAssetMap;
      if (dependencies) imagePaths = Object.values(dependencies);
    }
    if (imagePaths.length === 0) {
      const baseUrl = LoaderUtils.getBaseUrl(atlasPath);
      imagePaths = LoaderUtils.readAtlasPageNames(text).map((name) => baseUrl + name);
    }
    const textures = await Promise.all(
      imagePaths.map((url) => {
        const extension = /\.(\w+)(?:\?|$)/.exec(url)?.[1];
        const type =
          virtualResources[url]?.type ??
          (extension === "ktx" ? AssetType.KTX : extension === "ktx2" ? AssetType.KTX2 : AssetType.Texture);
        return resourceManager.load<Texture2D>({ url, type });
      })
    );
    return { text, textures };
  }

  /** Atlas pages begin a block; regions and their properties remain in the same block. */
  static readAtlasPageNames(text: string): string[] {
    const pages: string[] = [];
    let pageStart = true;
    for (const line of text.split(/\r?\n/)) {
      const value = line.trim();
      if (!value) {
        pageStart = true;
      } else if (pageStart) {
        // Optional atlas-level properties precede the first page in newer exports.
        if (value.includes(":")) continue;
        pages.push(value);
        pageStart = false;
      }
    }
    return pages;
  }

  static getBaseUrl(url: string): string {
    const isLocalPath = !/^(http|https|ftp):\/\/.*/i.test(url);
    if (isLocalPath) {
      const lastSlashIndex = url.lastIndexOf("/");
      if (lastSlashIndex === -1) {
        return "";
      }
      return url.substring(0, lastSlashIndex + 1);
    } else {
      const parsedUrl = new URL(url);
      const basePath = parsedUrl.origin + parsedUrl.pathname;
      return basePath.endsWith("/") ? basePath : basePath.substring(0, basePath.lastIndexOf("/") + 1);
    }
  }
}
