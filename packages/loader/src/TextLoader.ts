import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  TextAsset
} from "@galacean/engine-core";

@resourceLoader(AssetType.Text, ["txt"])
class TextLoader extends Loader<TextAsset> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextAsset> {
    return resourceManager._request<string>(item.url, { ...item, type: "text" }).then((text) => {
      const asset = new TextAsset(resourceManager.engine);
      asset.text = text;
      return asset;
    });
  }
}
