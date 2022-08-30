import { resourceLoader, Loader, AssetType, Font, LoadItem, ResourceManager, AssetPromise } from "@oasis-engine/core";

@resourceLoader(AssetType.Font, ["ttf"], false)
class FontLoader extends Loader<Font> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Font> {
    return new AssetPromise((resolve, reject) => {
      
    });
  }
}
