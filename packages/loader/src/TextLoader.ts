import { resourceLoader, Loader, AssetPromise, AssetType, LoadItem } from "@galacean/engine-core";

@resourceLoader(AssetType.Text, ["txt"], false)
class TextLoader extends Loader<string> {
  load(item: LoadItem): AssetPromise<string> {
    return this.request(item.url, {
      ...item,
      type: "text"
    });
  }
}
