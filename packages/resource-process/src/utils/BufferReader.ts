import { ab2str } from "./Utils";

class ImageData {
  type: "image/png" | "image/jpg" | "image/webp" | "ktx";
  buffer: ArrayBuffer;
}

const textDecode = new TextDecoder();

export class BufferReader {
  private _dataView: DataView;
  private _littleEndian: boolean;
  private _offset: number;

  public static imageMapping = {
    0: "image/png",
    1: "image/jpg",
    2: "image/webp",
    3: "ktx"
  };

  constructor(private _buffer: ArrayBuffer, byteOffset: number = 0, byteLength?: number, littleEndian: boolean = true) {
    // byteLength = byteLength ?? _buffer.byteLength;
    this._dataView = new DataView(_buffer);
    this._littleEndian = littleEndian;
    this._offset = byteOffset;
  }

  get offset() {
    return this._offset;
  }

  nextUint8() {
    const value = this._dataView.getUint8(this._offset);
    this._offset += 1;
    return value;
  }

  nextUint16() {
    const value = this._dataView.getUint16(this._offset, this._littleEndian);
    this._offset += 2;
    return value;
  }

  nextUint32() {
    const value = this._dataView.getUint32(this._offset, this._littleEndian);
    this._offset += 4;
    return value;
  }

  nextInt32() {
    const value = this._dataView.getInt32(this._offset, this._littleEndian);
    this._offset += 4;
    return value;
  }

  nextInt32Array(len: number) {
    const value = new Int32Array(this._buffer, this._offset, len);
    this._offset += 4 * len;
    return value;
  }

  nextFloat32() {
    const value = this._dataView.getFloat32(this._offset, this._littleEndian);
    this._offset += 4;
    return value;
  }

  nextFloat32Array(len: number) {
    const value = new Float32Array(this._buffer, this._offset, len);
    this._offset += 4 * len;
    return value;
  }

  nextUint32Array(len: number) {
    const value = new Uint32Array(this._buffer, this._offset, len);
    this._offset += 4 * len;
    return value;
  }

  nextUint8Array(len: number) {
    const value = new Uint8Array(this._buffer, this._offset, len);
    this._offset += len;
    return value;
  }

  nextUint64() {
    const left = this._dataView.getUint32(this._offset, this._littleEndian);
    const right = this._dataView.getUint32(this._offset + 4, this._littleEndian);
    const value = left + 2 ** 32 * right;
    this._offset += 8;
    return value;
  }

  nextStr(): string {
    const strByteLength = this.nextUint16();
    const uint8Array = new Uint8Array(this._buffer, this._offset, strByteLength);
    this._offset += strByteLength;
    return textDecode.decode(uint8Array);
  }

  /**
   * image data 放在最后
   */
  nextImageData(count: number = 0): ImageData {
    const imageData = new ImageData();
    imageData.type = BufferReader.imageMapping[this.nextUint8()];
    imageData.buffer = this._buffer.slice(this._offset);
    return imageData;
  }

  nextImagesData(count: number): ImageData[] {
    const imagesLen = this.nextUint32Array(count);
    const imagesType = this.nextUint8Array(count);
    const imagesData: ImageData[] = [];

    for (let i = 0; i < count; i++) {
      const len = imagesLen[i];
      const imageData = new ImageData();
      imageData.type = BufferReader.imageMapping[imagesType[i]];
      imageData.buffer = this._buffer.slice(this._offset, this._offset + len);
      this._offset += len;
      imagesData.push(imageData);
    }
    return imagesData;
  }

  skip(bytes: number) {
    this._offset += bytes;
    return this;
  }

  scan(maxByteLength: number, term: number = 0x00): Uint8Array {
    const byteOffset = this._offset;
    let byteLength = 0;
    while (this._dataView.getUint8(this._offset) !== term && byteLength < maxByteLength) {
      byteLength++;
      this._offset++;
    }

    if (byteLength < maxByteLength) this._offset++;

    return new Uint8Array(this._dataView.buffer, this._dataView.byteOffset + byteOffset, byteLength);
  }
}
