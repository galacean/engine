import { ab2str } from "./Utils";

export class FileHeader {
  totalLength: number = 0;
  version: number = 0;
  type: number = 0;
  name: string = "";
  headerLength: number = 0;

  static decode(arrayBuffer: ArrayBuffer): FileHeader {
    const dataView = new DataView(arrayBuffer);
    const totalLen = dataView.getUint32(0, true);
    const fileVersion = dataView.getUint8(4);
    const type = dataView.getUint8(5);
    const nameLen = dataView.getUint16(6, true);
    const nameBuffer = dataView.buffer.slice(8, 8 + nameLen);

    const name = ab2str(nameBuffer);
    const header = new FileHeader();
    header.totalLength = totalLen;
    header.name = name;
    header.type = type;
    header.version = fileVersion;
    header.headerLength = nameBuffer.byteLength + 8;
    return header;
  }

  public get dataLength() {
    return this.totalLength - this.headerLength;
  }
}
