import { SetDataOptions, type IPlatformBuffer } from "@galacean/engine";

/** Device buffer whose storage remains in host memory. */
export class NullBuffer implements IPlatformBuffer {
  private _data: Uint8Array;

  get byteLength(): number {
    return this._data.byteLength;
  }

  constructor(byteLength: number, data?: ArrayBuffer | ArrayBufferView) {
    this._data = new Uint8Array(byteLength);
    if (data) this.setData(byteLength, data);
  }

  bind(): void {}

  setData(
    byteLength: number,
    data: ArrayBuffer | ArrayBufferView,
    bufferByteOffset = 0,
    dataOffset = 0,
    dataLength?: number,
    options: SetDataOptions = SetDataOptions.None
  ): void {
    if (options === SetDataOptions.Discard || this._data.byteLength !== byteLength)
      this._data = new Uint8Array(byteLength);
    const view = ArrayBuffer.isView(data);
    const elementSize = view && "BYTES_PER_ELEMENT" in data ? Number(data.BYTES_PER_ELEMENT) : 1;
    const byteOffset = dataOffset * elementSize;
    // Match WebGL2 bufferSubData/getBufferSubData where a 0 length defaults to the remaining elements.
    const length = !dataLength ? data.byteLength - byteOffset : dataLength * elementSize;
    this._data.set(
      new Uint8Array(view ? data.buffer : data, (view ? data.byteOffset : 0) + byteOffset, length),
      bufferByteOffset
    );
  }

  getData(data: ArrayBufferView, bufferByteOffset = 0, dataOffset = 0, dataLength?: number): void {
    const elementSize = "BYTES_PER_ELEMENT" in data ? Number(data.BYTES_PER_ELEMENT) : 1;
    const byteOffset = dataOffset * elementSize;
    const length = !dataLength ? data.byteLength - byteOffset : dataLength * elementSize;
    const destination = new Uint8Array(data.buffer, data.byteOffset + byteOffset, length);
    destination.set(new Uint8Array(this._data.buffer, bufferByteOffset, length));
  }

  copyFromBuffer(
    source: NullBuffer,
    sourceByteOffset: number,
    destinationByteOffset: number,
    byteLength: number
  ): void {
    this._data.set(new Uint8Array(source._data.buffer, sourceByteOffset, byteLength), destinationByteOffset);
  }

  destroy(): void {
    this._data = null!;
  }
}
