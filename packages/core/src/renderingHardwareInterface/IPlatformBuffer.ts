import { SetDataOptions } from "../graphic";

export interface IPlatformBuffer {
  bind(): void;

  setData(
    byteLength: number,
    data: ArrayBuffer | ArrayBufferView,
    bufferByteOffset?: number,
    dataOffset?: number,
    dataLength?: number,
    options?: SetDataOptions
  ): void;

  getData(data: ArrayBufferView, bufferByteOffset?: number, dataOffset?: number, dataLength?: number): void;

  copyFromBuffer(srcBuffer: IPlatformBuffer, srcByteOffset: number, dstByteOffset: number, byteLength: number): void;

  destroy(): void;
}
