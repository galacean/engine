import { resourceLoader, Loader, AssetPromise, LoaderType, LoadItem } from "@alipay/o3-core";

@resourceLoader(LoaderType.Text, ["txt"], false)
class TextLoader extends Loader<string> {
  load(item: LoadItem): AssetPromise<string> {
    return this.request(item.url, {
      ...item,
      type: "text"
    });
  }
}
