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
    const atlas = LoaderUtils._readAtlas(text);
    const virtualResources = resourceManager._virtualPathResourceMap;
    let imagePaths = extraPaths.filter((url) => /\.(png|jpg|webp|jpeg|ktx|ktx2)$/.test(url.split(/[?#]/, 1)[0]));
    if (extraPaths.length === 0) {
      const dependencies = virtualResources[atlasPath]?.dependentAssetMap;
      if (dependencies) imagePaths = Object.values(dependencies);
    }
    if (imagePaths.length === 0) {
      const baseUrl = LoaderUtils.getBaseUrl(atlasPath);
      imagePaths = atlas.pages.map((page) => baseUrl + page.name);
    }
    const imageSources = imagePaths.map((url) => ({ url, path: url.split(/[?#]/, 1)[0] }));
    const pagePaths = atlas.pages.map((page, index) => {
      const source = imageSources.find(({ path }) => path === page.name || path.endsWith("/" + page.name));
      // Renamed replacement images and exported dependencies can be supplied in atlas page order.
      const url = (source ?? imageSources[index])?.url;
      if (!url) throw new Error(`Spine atlas page "${page.name}" has no texture.`);
      return url;
    });
    for (const page of atlas.pages) {
      if (page.pma) {
        throw new Error(
          `Spine atlas page "${page.name}" uses premultiplied alpha, which is not supported by the linear rendering workflow. ` +
            'Re-export with "Premultiply alpha" disabled and "Bleed" enabled.'
        );
      }
    }
    const textures = await Promise.all(
      pagePaths.map(async (url, index) => {
        const extension = /\.(\w+)$/.exec(url.split(/[?#]/, 1)[0])?.[1];
        const type =
          virtualResources[url]?.type ??
          (extension === "ktx" ? AssetType.KTX : extension === "ktx2" ? AssetType.KTX2 : AssetType.Texture);
        const texture = await resourceManager.load<Texture2D>({ url, type });
        if (!texture.isSRGBColorSpace) {
          throw new Error(
            `Spine atlas page "${atlas.pages[index].name}" requires an sRGB texture. ` +
              "Set isSRGBColorSpace=true before its first load, or enable sRGB in the exported texture."
          );
        }
        return texture;
      })
    );
    return { text: atlas.text, textures };
  }

  /** Atlas pages begin a block; regions and their properties remain in the same block. */
  static readAtlasPageNames(text: string): string[] {
    return LoaderUtils._readAtlas(text).pages.map((page) => page.name);
  }

  private static _readAtlas(text: string) {
    const pages: { name: string; pma: boolean }[] = [];
    const lines: string[] = [];
    let pageStart = true;
    let pageHeader = false;
    for (const line of text.split(/\r?\n/)) {
      const value = line.trim();
      if (!value) {
        pageStart = true;
        pageHeader = false;
      } else if (pageStart) {
        if (!value.includes(":")) {
          pages.push({ name: value, pma: false });
          pageStart = false;
          pageHeader = true;
        }
      } else if (pageHeader) {
        const separator = value.indexOf(":");
        if (separator < 0) {
          pageHeader = false;
        } else if (value.substring(0, separator).trim() === "pma") {
          pages[pages.length - 1].pma = value.substring(separator + 1).trim() === "true";
          // Validate alpha encoding before loading textures; 3.8 cannot parse this newer page property.
          continue;
        }
      }
      lines.push(line);
    }
    return { pages, text: lines.join("\n") };
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
