import { resourceLoader, Loader, AssetPromise, AssetType, LoadItem, ResourceManager } from "@galacean/engine-core";

function isBase64(url) {
  return /^data:(.+?);base64,/.test(url);
}
@resourceLoader(AssetType.Buffer, ["bin", "r3bin"], false)
class BufferLoader extends Loader<ArrayBuffer> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<ArrayBuffer> {
    const url = item.url;
    if (isBase64(url)) {
      return new AssetPromise((resolve) => {
        const base64Str = url.slice(13 + RegExp.$1.length);
        const result = Uint8Array.from(atob(base64Str), (c) => c.charCodeAt(0));
        resolve(result.buffer);
      });
    }
    return resourceManager.request(url, {
      ...item,
      type: "arraybuffer"
    });
  }
}
