import { resourceLoader, Loader, AssetType, Font, LoadItem, ResourceManager, AssetPromise } from "@oasis-engine/core";

@resourceLoader(AssetType.Font, ["ttf", "otf", "woff"], false)
class FontLoader extends Loader<Font> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Font> {
    return new AssetPromise((resolve, reject) => {
      const { url } = item;
      this._registerFont(url, url)
        .then((isSuccess) => {
          if (isSuccess) {
            const font = new Font(resourceManager.engine, url);
            resolve(font);
          }
        })
        .catch((e) => {
          reject(`load font ${url} fail`);
        });
    });
  }

  private async _registerFont(fontName: string, fontUrl: string): Promise<boolean> {
    const fontFace = new FontFace(fontName, `url(${fontUrl})`);
    await fontFace.load();
    document.fonts.add(fontFace);
    return true;
  }
}
