import {
  resourceLoader,
  Loader,
  AssetType,
  Font,
  LoadItem,
  ResourceManager,
  AssetPromise
} from "@oasis-engine/core";

@resourceLoader(AssetType.Font, ["font"], false)
class FontLoader extends Loader<Font> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Font> {
    return new AssetPromise((resolve, reject) => {
      // const { url } = item;
      // const name = Font.getFontNameFromTTF(url);
      // if (name) {
      //   TextUtils.registerTTF(name, url)
      //     .then(() => {
      //       const font = new Font(resourceManager.engine, name);
      //       resolve(font);
      //     })
      //     .catch((e) => {
      //       reject(e);
      //     });
      // } else {
      //   reject(new Error(`the ttf url is illegal ${url}`));
      // }
    });
  }
}
