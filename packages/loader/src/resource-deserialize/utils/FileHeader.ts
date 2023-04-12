import { Utils } from "@galacean/engine-core";

export class FileHeader {
  totalLength: number = 0;
  version: number = 0;
  type: string = "";
  name: string = "";
  headerLength: number = 0;

  static decode(arrayBuffer: ArrayBuffer): FileHeader {
    const dataView = new DataView(arrayBuffer);
    const totalLen = dataView.getUint32(0, true);
    const fileVersion = dataView.getUint8(4);
    const typeLen = dataView.getUint16(5, true);
    const typeUint8Array = new Uint8Array(arrayBuffer, 7, typeLen);
    const nameLen = dataView.getUint16(7 + typeLen, true);
    const nameUint8Array = new Uint8Array(arrayBuffer, 9 + typeLen, nameLen);

    const name = Utils.decodeText(nameUint8Array);
    const type = Utils.decodeText(typeUint8Array);
    const header = new FileHeader();
    header.totalLength = totalLen;
    header.name = name;
    header.type = type;
    header.version = fileVersion;
    header.headerLength = nameUint8Array.byteLength + typeUint8Array.byteLength + 9;
    return header;
  }

  public get dataLength() {
    return this.totalLength - this.headerLength;
  }
}
