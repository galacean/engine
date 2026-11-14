import {
  AssetPromise,
  BufferAsset,
  JSONAsset,
  Loader,
  type LoadItem,
  type ResourceManager,
  resourceLoader
} from "@galacean/engine";
import { loadOfficialBrotliDecoder } from "./OfficialBrotliDecoder";
import { decodeTerrainCompressedAsset } from "./TerrainCompressionDecoder";
import { TerrainBrotliResultType, TerrainCompressionAssetType } from "./TerrainCompressionAssetType";

@resourceLoader(TerrainCompressionAssetType.Brotli, [])
class TerrainBrotliLoader extends Loader<BufferAsset | JSONAsset> {
  /**
   * Restores a pure Brotli stream into the standard asset representation declared by Project params.
   * @param item Virtual Project request resolved to one physical `.br` file.
   * @param resourceManager Resource manager that owns requests and returned assets.
   * @returns Standard `BufferAsset` or `JSONAsset`.
   */
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<BufferAsset | JSONAsset> {
    return loadCompressedBytes(item, resourceManager).then(async (encoded) => {
      const decoded = await decodeTerrainCompressedAsset(
        TerrainCompressionAssetType.Brotli,
        item.params,
        encoded,
        await loadOfficialBrotliDecoder()
      );
      if (decoded.resultType === TerrainBrotliResultType.JSON) {
        const asset = new JSONAsset(resourceManager.engine);
        asset.data = JSON.parse(new TextDecoder().decode(decoded.bytes));
        return asset;
      }
      const asset = new BufferAsset(resourceManager.engine);
      asset.buffer = toArrayBuffer(decoded.bytes);
      return asset;
    });
  }
}

@resourceLoader(TerrainCompressionAssetType.BrotliHeightmap, [])
class TerrainBrotliHeightmapLoader extends Loader<BufferAsset> {
  /**
   * Restores a Brotli-compressed Height delta stream into a canonical Height R16 `BufferAsset`.
   * @param item Virtual Project request resolved to one physical `.br` file.
   * @param resourceManager Resource manager that owns requests and returned assets.
   * @returns Canonical Height R16 buffer.
   */
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<BufferAsset> {
    return loadCompressedBytes(item, resourceManager).then(async (encoded) => {
      const decoded = await decodeTerrainCompressedAsset(
        TerrainCompressionAssetType.BrotliHeightmap,
        item.params,
        encoded,
        await loadOfficialBrotliDecoder()
      );
      const asset = new BufferAsset(resourceManager.engine);
      asset.buffer = toArrayBuffer(decoded.bytes);
      return asset;
    });
  }
}

function loadCompressedBytes(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Uint8Array> {
  const url = requireResourceUrl(item.url);
  // The Demo loader keeps ResourceManager retry, timeout, and request accounting semantics.
  // @ts-ignore ResourceManager loaders use the internal request transport by design.
  const request = resourceManager._request<ArrayBuffer>(url, { ...item, type: "arraybuffer" });
  return AssetPromise.resolve(request).then((buffer) => new Uint8Array(buffer));
}

function requireResourceUrl(url: string | undefined): string {
  if (!url) throw new Error("Brotli resource URL is required");
  return url;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes.buffer as ArrayBuffer;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
