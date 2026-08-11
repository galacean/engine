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
      // @ts-ignore
      const remoteUrl = resourceManager._getRemoteUrl(item.url);
      this._registerFont(item.url, remoteUrl)
        .then(() => {
          const font = new Font(resourceManager.engine, item.url);
          resolve(font);
        })
        .catch((e) => {
          reject(`load font ${item.url} fail`);
        });
    });
  }

  private async _registerFont(fontName: string, fontUrl: string): Promise<void> {
    const fontFace = new FontFace(fontName, `url(${fontUrl})`);
    await fontFace.load();
    document.fonts.add(fontFace);
  }
}
