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
    const url = item.url;
    // @ts-ignore
    const remoteUrl = resourceManager._getRemoteUrl(url);
    return this._registerFont(remoteUrl, remoteUrl).then(() => new Font(resourceManager.engine, remoteUrl));
  }

  private _registerFont(fontName: string, fontUrl: string): AssetPromise<void> {
    return new AssetPromise((resolve, reject) => {
      const fontFace = new FontFace(fontName, `url(${fontUrl})`);
      fontFace.load().then(() => {
        document.fonts.add(fontFace);
        resolve();
      }, reject);
    });
  }
}
