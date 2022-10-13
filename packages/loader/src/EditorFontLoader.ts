import { resourceLoader, Loader, AssetType, Font, LoadItem, ResourceManager, AssetPromise } from "@oasis-engine/core";

@resourceLoader(AssetType.EditorFont, ["fnt"], false)
class EditorFontLoader extends Loader<Font> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Font> {
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, { type: "json" })
        .then((data) => {
          const { fontName, fontUrl } = data;

          if (fontUrl) {
            this._registerFont(fontName, fontUrl)
              .then((isSuccess) => {
                if (isSuccess) {
                  const font = new Font(resourceManager.engine, fontName);
                  resolve(font);
                }
              })
              .catch((e) => {
                reject(`load font ${fontUrl} fail`);
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

  private async _registerFont(fontName: string, fontUrl: string): Promise<boolean> {
    const fontFace = new FontFace(fontName, `url(${fontUrl})`);
    await fontFace.load();
    document.fonts.add(fontFace);
    return true;
  }
}
