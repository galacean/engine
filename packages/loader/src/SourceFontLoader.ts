import {
  AssetPromise,
  AssetType,
  Font,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";

@resourceLoader(AssetType.SourceFont, ["ttf", "otf", "woff"], false)
class SourceFontLoader extends Loader<Font> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Font> {
    return new AssetPromise((resolve, reject) => {
      const { url } = item;
      this._registerFont(url, url)
        .then(() => {
          const font = new Font(resourceManager.engine, url);
          resolve(font);
        })
        .catch((e) => {
          reject(`load font ${url} fail`);
        });
    });
  }

  private async _registerFont(fontName: string, fontUrl: string): Promise<void> {
    const fontFace = new FontFace(fontName, `url(${fontUrl})`);
    await fontFace.load();
    document.fonts.add(fontFace);
  }
}
