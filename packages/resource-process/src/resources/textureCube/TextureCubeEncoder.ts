import { encoder } from "../..";
import { BufferWriter } from "../../utils/BufferWriter";

@encoder("TextureCube")
export class Texture2DEncoder {
  static encode(bufferWriter: BufferWriter, data: ArrayBuffer[][], meta: any) {
    const {
      type,
      objectId,
      mipmap = 1,
      filterMode = 1,
      anisoLevel = 1,
      wrapModeU = 1,
      wrapModeV = 1,
      format = 1,
      size
    } = meta;

    // write data
    bufferWriter.writeStr(objectId);
    bufferWriter.writeUint8(mipmap);
    bufferWriter.writeUint8(filterMode);
    bufferWriter.writeUint8(anisoLevel);
    bufferWriter.writeUint8(wrapModeU);
    bufferWriter.writeUint8(wrapModeV);
    bufferWriter.writeUint8(format);
    bufferWriter.writeUint16(size);

    // flat and convert to ImageData
    const flatData: ArrayBuffer[] = [];
    data.forEach((mipData) => {
      flatData.push(...mipData);
    });
    const imagesData = flatData.map((buffer) => ({ type, buffer }));
    bufferWriter.writeUint8(imagesData.length);
    bufferWriter.writeImagesData(imagesData);

    return bufferWriter.buffer;
  }
}
