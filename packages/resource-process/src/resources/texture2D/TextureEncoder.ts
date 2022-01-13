import { encoder } from "../..";
import { BufferWriter } from "../../utils/BufferWriter";

@encoder("Texture2D")
export class Texture2DEncoder {
  static encode(bufferWriter: BufferWriter, data: ArrayBuffer[], meta: any) {
    const {
      type,
      objectId,
      mipmap = 1,
      filterMode = 1,
      anisoLevel = 1,
      wrapModeU = 1,
      wrapModeV = 1,
      format = 1,
      width,
      height
    } = meta;

    // write data
    bufferWriter.writeStr(objectId);
    bufferWriter.writeUint8(mipmap);
    bufferWriter.writeUint8(filterMode);
    bufferWriter.writeUint8(anisoLevel);
    bufferWriter.writeUint8(wrapModeU);
    bufferWriter.writeUint8(wrapModeV);
    bufferWriter.writeUint8(format);
    bufferWriter.writeUint16(width);
    bufferWriter.writeUint16(height);

    // convert to ImageData
    const imagesData = data.map((buffer) => ({ type, buffer }));
    bufferWriter.writeUint8(imagesData.length);
    bufferWriter.writeImagesData(imagesData);

    return bufferWriter.buffer;
  }
}
