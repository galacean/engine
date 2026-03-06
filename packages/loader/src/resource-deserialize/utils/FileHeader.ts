import { Utils } from "@galacean/engine-core";

/**
 * Binary format: [MAGIC(4B)] [totalLength(4B)] [version(1B)] [typeLen(2B)] [type] [nameLen(2B)] [name] [data...]
 */
export class FileHeader {
  static readonly MAGIC = 0x4e434c47; // "GLCN" in little-endian

  totalLength: number = 0;
  version: number = 0;
  type: string = "";
  name: string = "";
  headerLength: number = 0;

  static checkMagic(arrayBuffer: ArrayBuffer): boolean {
    if (arrayBuffer.byteLength < 4) return false;
    const view = new DataView(arrayBuffer);
    return view.getUint32(0, true) === FileHeader.MAGIC;
  }

  static decode(arrayBuffer: ArrayBuffer): FileHeader {
    const dataView = new DataView(arrayBuffer);
    let offset = 0;

    const hasMagic = dataView.getUint32(0, true) === FileHeader.MAGIC;
    if (hasMagic) {
      offset = 4;
    }

    const totalLen = dataView.getUint32(offset, true);
    const fileVersion = dataView.getUint8(offset + 4);
    const typeLen = dataView.getUint16(offset + 5, true);
    const typeUint8Array = new Uint8Array(arrayBuffer, offset + 7, typeLen);
    const nameLen = dataView.getUint16(offset + 7 + typeLen, true);
    const nameUint8Array = new Uint8Array(arrayBuffer, offset + 9 + typeLen, nameLen);

    const name = Utils.decodeText(nameUint8Array);
    const type = Utils.decodeText(typeUint8Array);
    const header = new FileHeader();
    header.totalLength = totalLen;
    header.name = name;
    header.type = type;
    header.version = fileVersion;
    header.headerLength = offset + nameUint8Array.byteLength + typeUint8Array.byteLength + 9;
    return header;
  }

  public get dataLength() {
    return this.totalLength - this.headerLength;
  }
}
