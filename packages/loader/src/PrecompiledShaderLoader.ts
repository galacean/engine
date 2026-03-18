import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Shader,
  resourceLoader
} from "@galacean/engine-core";

/** Magic bytes: "GSB\0" */
const MAGIC = 0x00425347;
/** Header size in bytes */
const HEADER_SIZE = 8;
/** Maximum supported format version */
const MAX_SUPPORTED_VERSION = 1;

@resourceLoader(AssetType.Shader, ["gsb"])
class PrecompiledShaderLoader extends Loader<Shader> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Shader> {
    const { url } = item;

    // @ts-ignore
    return resourceManager._request<ArrayBuffer>(url, { ...item, type: "arraybuffer" }).then(
      (buffer: ArrayBuffer) => {
        const data = PrecompiledShaderLoader._decode(buffer);
        return Shader.createFromPrecompiled(data);
      }
    );
  }

  /** @internal */
  static _decode(buffer: ArrayBuffer): any {
    if (buffer.byteLength < HEADER_SIZE) {
      throw new Error("Invalid .gsb file: buffer too small.");
    }

    const view = new DataView(buffer);

    const magic = view.getUint32(0, true);
    if (magic !== MAGIC) {
      throw new Error(`Invalid .gsb file: bad magic 0x${magic.toString(16)}.`);
    }

    const version = view.getUint16(4, true);
    if (version > MAX_SUPPORTED_VERSION) {
      throw new Error(
        `Incompatible .gsb version ${version}, max supported is ${MAX_SUPPORTED_VERSION}. Please update the engine.`
      );
    }

    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(new Uint8Array(buffer, HEADER_SIZE));
    return JSON.parse(jsonStr);
  }
}

export { PrecompiledShaderLoader };
