import { Utils } from "@galacean/engine-core";

class ImageData {
  type: "image/png" | "image/jpg" | "image/webp" | "ktx";
  buffer: ArrayBuffer;
}

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

  constructor(public buffer: ArrayBuffer, byteOffset: number = 0, byteLength?: number, littleEndian: boolean = true) {
    // byteLength = byteLength ?? _buffer.byteLength;
    this._dataView = new DataView(buffer);
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
    const value = new Int32Array(this.buffer, this._offset, len);
    this._offset += 4 * len;
    return value;
  }

  nextFloat32() {
    const value = this._dataView.getFloat32(this._offset, this._littleEndian);
    this._offset += 4;
    return value;
  }

  nextFloat32Array(len: number) {
    const value = new Float32Array(this.buffer, this._offset, len);
    this._offset += 4 * len;
    return value;
  }

  nextUint32Array(len: number) {
    const value = new Uint32Array(this.buffer, this._offset, len);
    this._offset += 4 * len;
    return value;
  }

  nextUint8Array(len: number) {
    const value = new Uint8Array(this.buffer, this._offset, len);
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
    const uint8Array = new Uint8Array(this.buffer, this._offset, strByteLength);
    this._offset += strByteLength;
    return Utils.decodeText(uint8Array);
  }

  /**
   * image data 放在最后
   */
  nextImageData(count: number = 0): ArrayBuffer {
    return this.buffer.slice(this._offset);
  }

  nextImagesData(count: number): ArrayBuffer[] {
    const imagesLen = new Array(count);
    // Start offset of Uint32Array should be a multiple of 4. ref: https://stackoverflow.com/questions/15417310/why-typed-array-constructors-require-offset-to-be-multiple-of-underlying-type-si
    for (let i = 0; i < count; i++) {
      const len = this._dataView.getUint32(this._offset, this._littleEndian);
      imagesLen[i] = len;
      this._offset += 4;
    }
    const imagesData: ArrayBuffer[] = [];

    for (let i = 0; i < count; i++) {
      const len = imagesLen[i];
      const buffer = this.buffer.slice(this._offset, this._offset + len);
      this._offset += len;
      imagesData.push(buffer);
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
