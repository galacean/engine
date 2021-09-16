class ImageData {
  type: string;
  buffer: ArrayBuffer;
}

const textEncoder = new TextEncoder();
export class BufferWriter {
  private _dataView: DataView;
  private _littleEndian: boolean;
  private _offset: number;
  private _uint8Array: Uint8Array;

  public static imageMapping = {
    "image/png": 0,
    "image/jpg": 1,
    "image/webp": 2,
    ktx: 3,
    "image/jpeg": 4
  };

  constructor(buffer: ArrayBuffer, byteOffset: number = 0, byteLength?: number, littleEndian: boolean = true) {
    byteLength = byteLength ?? buffer.byteLength;
    this._uint8Array = new Uint8Array(buffer);
    this._dataView = new DataView(buffer, byteOffset, byteLength);
    this._littleEndian = littleEndian;
    this._offset = byteOffset;
  }

  get totalLen() {
    return this._offset + this._dataView.byteOffset;
  }

  get validBuffer() {
    return this._uint8Array.buffer.slice(0, this.totalLen);
  }

  get buffer(): ArrayBuffer {
    return this._uint8Array.buffer;
  }

  get offset() {
    return this._offset;
  }

  writeUint8(value: number) {
    this._dynamicExplansion(1);
    this._dataView.setUint8(this.offset, value);
    this._offset += 1;
  }

  writeUint16(value: number) {
    this._dynamicExplansion(2);
    this._dataView.setUint16(this._offset, value, this._littleEndian);
    this._offset += 2;
  }

  writeUint32(value: number) {
    this._dynamicExplansion(4);
    this._dataView.setUint32(this._offset, value, this._littleEndian);
    this._offset += 4;
  }

  writeInt32(value: number) {
    this._dynamicExplansion(4);
    this._dataView.setInt32(this._offset, value, this._littleEndian);
    this._offset += 4;
  }

  writeFloat32(value: number) {
    this._dynamicExplansion(4);
    this._dataView.setFloat32(this._offset, value, this._littleEndian);
    this._offset += 4;
  }

  writeUint8Array(value: Uint8Array) {
    for (let i = 0, len = value.length; i < len; i++) {
      this.writeUint8(value[i]);
    }
  }

  writeFloat32Array(nums: ArrayLike<number>) {
    const len = nums.length;
    for (let i = 0; i < len; i++) {
      this.writeFloat32(nums[i]);
    }
  }

  writeInt32Array(nums: ArrayLike<number>) {
    const len = nums.length;
    for (let i = 0; i < len; i++) {
      this.writeInt32(nums[i]);
    }
  }

  writeStr(value: string) {
    const uint8Array = textEncoder.encode(value);
    const byteLength = uint8Array.byteLength;
    this.writeUint16(byteLength);
    this._dynamicExplansion(uint8Array.byteLength);
    this._uint8Array.set(uint8Array, this._offset);
    this._offset += uint8Array.byteLength;
  }

  writeArrayBuffer(buffer: ArrayBuffer) {
    this._dynamicExplansion(buffer.byteLength);
    this._uint8Array.set(new Uint8Array(buffer), this._offset);
    this._offset += buffer.byteLength;
  }

  /**
   * Image data at last.
   */
  writeImageData({ type, buffer }: ImageData) {
    this.writeUint8(BufferWriter.imageMapping[type]);
    this.writeArrayBuffer(buffer);
  }

  writeImagesData(imagesData: ImageData[]) {
    const len = imagesData.length;
    let size = 0;
    for (let i = 0; i < len; i++) {
      const imageData = imagesData[i];
      const byteLen = imageData.buffer.byteLength;
      this.writeUint32(byteLen);
      this.writeUint8(BufferWriter.imageMapping[imageData.type]);
      size += byteLen;
    }
    const temp = new Uint8Array(size);
    let tempOffset = 0;
    for (let i = 0; i < len; i++) {
      const { buffer } = imagesData[i];
      temp.set(new Uint8Array(buffer), tempOffset);
      tempOffset += buffer.byteLength;
    }
    this._uint8Array.set(temp, this._offset);
  }

  public writeLen(len: number) {
    this._dataView.setUint32(0, len, this._littleEndian);
  }

  /**
   * Dynamic Explansion.
   * @param byteLength - byteLength
   */
  private _dynamicExplansion(byteLength: number) {
    const estimateLen = byteLength + this._dataView.byteOffset + this._offset;
    if (estimateLen > this._dataView.byteLength) {
      const temp = new Uint8Array(estimateLen);
      temp.set(this._uint8Array);
      this._uint8Array = temp;
      this._dataView = new DataView(temp.buffer);
    }
  }
}
