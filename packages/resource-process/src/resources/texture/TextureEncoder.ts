import { encoder } from "../..";
import { BufferWriter } from "../../utils/BufferWriter";

const textureDefaultOptions = {
  mipmap: 1,
  filterMode: 1,
  format: 1,
  anisoLevel: 0,
  wrapModeU: 1,
  wrapModeV: 1
};

@encoder("Texture2D")
export class Texture2DEncoder {
  static encode(bufferWriter: BufferWriter, data: ArrayBuffer, meta: any) {
    meta = { ...textureDefaultOptions, ...meta };

    const { width, height, type, objectId } = meta;

    // write data
    bufferWriter.writeStr(objectId);
    bufferWriter.writeUint8(meta.mipmap);
    bufferWriter.writeUint8(meta.filterMode);
    bufferWriter.writeUint8(meta.anisoLevel);
    bufferWriter.writeUint8(meta.wrapModeU);
    bufferWriter.writeUint8(meta.wrapModeV);
    bufferWriter.writeUint8(meta.format);
    bufferWriter.writeUint16(width);
    bufferWriter.writeUint16(height);
    bufferWriter.writeImageData({ type, buffer: data });

    return bufferWriter.buffer;
  }
}
