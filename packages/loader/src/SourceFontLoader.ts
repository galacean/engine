import {
  AssetPromise,
  AssetType,
  Font,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";

@resourceLoader(AssetType.SourceFont, ["ttf", "otf", "woff"])
class SourceFontLoader extends Loader<Font> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Font> {
    return new AssetPromise((resolve, reject) => {
      this._registerFontFace(item.url, item.url, resourceManager)
        .then(() => {
          const font = new Font(resourceManager.engine, item.url);
          resolve(font);
        })
        .catch((e) => {
          reject(`load font ${item.url} fail`);
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
