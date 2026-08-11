import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  BufferAsset
} from "@galacean/engine-core";

const base64Regex = /^data:(.+?);base64,/;

@resourceLoader(AssetType.Buffer, ["bin"])
class BufferLoader extends Loader<BufferAsset> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<BufferAsset> {
    const assetPath = item.url;
    const base64Match = base64Regex.exec(assetPath);
    const bufferPromise = base64Match
      ? Promise.resolve(
          Uint8Array.from(atob(assetPath.slice(13 + base64Match[1].length)), (c) => c.charCodeAt(0)).buffer
        )
      : // @ts-ignore
        resourceManager._request<ArrayBuffer>(assetPath, { ...item, type: "arraybuffer" });

    return AssetPromise.resolve(bufferPromise).then((buffer) => {
      const asset = new BufferAsset(resourceManager.engine);
      asset.buffer = buffer;
      return asset;
    });
  }
}
