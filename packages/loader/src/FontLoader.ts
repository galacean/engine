import {
  AssetPromise,
  AssetType,
  Font,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";

@resourceLoader(AssetType.Font, ["font"])
class FontLoader extends Loader<Font> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Font> {
    return new AssetPromise((resolve, reject) => {
      resourceManager
        // @ts-ignore
        ._request<any>(item.url, { ...item, type: "json" })
        .then((data) => {
          const { fontName, fontUrl } = data;

          if (fontUrl) {
            // @ts-ignore
            const fontAssetPath = resourceManager._resolveAssetPath(item.url, fontUrl);
            this._registerFontFace(fontName, fontAssetPath, resourceManager)
              .then(() => {
                const font = new Font(resourceManager.engine, fontName);
                resolve(font);
              })
              .catch((e) => {
                reject(`load font ${fontAssetPath} fail`);
              });
          } else {
            const font = new Font(resourceManager.engine, fontName);
            resolve(font);
          }
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  private async _registerFontFace(
    fontName: string,
    fontAssetPath: string,
    resourceManager: ResourceManager
  ): Promise<void> {
    // FontFace performs its own request, so convert the asset path at this browser boundary.
    // @ts-ignore
    const requestUrl = resourceManager._getRequestUrl(fontAssetPath);
    const fontFace = new FontFace(fontName, `url(${requestUrl})`);
    await fontFace.load();
    document.fonts.add(fontFace);
  }
}
