import { resourceLoader, Loader, AssetType, Font, LoadItem, ResourceManager, AssetPromise } from "@oasis-engine/core";

@resourceLoader(AssetType.Font, ["fnt"], false)
class FontLoader extends Loader<Font> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Font> {
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, { type: "json" })
        .then((data) => {
          const { fontName, fontUrl } = data;
          Font.create(resourceManager.engine, fontName, fontUrl)
            .then((ret) => {
              resolve(ret);
            })
            .catch((e) => {
              reject(e);
            });
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
