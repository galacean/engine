import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  JSONAsset
} from "@galacean/engine-core";

@resourceLoader(AssetType.JSON, ["json"])
class JSONLoader extends Loader<JSONAsset> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<JSONAsset> {
    return resourceManager._request<object>(item.url, { ...item, type: "json" }).then((data) => {
      const asset = new JSONAsset(resourceManager.engine);
      asset.data = data;
      return asset;
    });
  }
}
