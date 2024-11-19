import { resourceLoader, Loader, AssetPromise, AssetType, LoadItem, ResourceManager } from "@galacean/engine-core";

@resourceLoader(AssetType.JSON, ["json"], false)
class JSONLoader extends Loader<string> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<string> {
    // @ts-ignore
    return resourceManager._request(item.url, {
      ...item,
      type: "json"
    });
  }
}
