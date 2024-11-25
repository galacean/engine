import { resourceLoader, Loader, AssetPromise, AssetType, LoadItem, ResourceManager } from "@galacean/engine-core";

@resourceLoader(AssetType.Text, ["txt"], false)
class TextLoader extends Loader<string> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<string> {
    // @ts-ignore
    return resourceManager._request(item.url, {
      ...item,
      type: "text"
    });
  }
}
