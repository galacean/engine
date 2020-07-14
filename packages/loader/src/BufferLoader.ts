import { resourceLoader, Loader, AssetPromise, AssetType, LoadItem } from "@alipay/o3-core";

@resourceLoader(AssetType.Buffer, ["bin", "r3bin"])
class BufferLoader extends Loader<string> {
  load(item: LoadItem): AssetPromise<string> {
    return this.request(item.url, {
      ...item,
      type: "arraybuffer"
    });
  }
}
