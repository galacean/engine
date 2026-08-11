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
            // Resolve the embedded path in the editor's virtual file system before crossing the
            // final browser request boundary used by FontFace.
            // @ts-ignore
            const fontVirtualPath = resourceManager._resolveVirtualPath(item.url, fontUrl);
            // @ts-ignore
            const fontRemoteUrl = resourceManager._getRemoteUrl(fontVirtualPath);
            this._registerFont(fontName, fontRemoteUrl)
              .then(() => {
                const font = new Font(resourceManager.engine, fontName);
                resolve(font);
              })
              .catch((e) => {
                reject(`load font ${fontVirtualPath} fail`);
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

  private async _registerFont(fontName: string, fontUrl: string): Promise<void> {
    const fontFace = new FontFace(fontName, `url(${fontUrl})`);
    await fontFace.load();
    document.fonts.add(fontFace);
  }
}
