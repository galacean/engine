import { SetDataOptions } from "../graphic";

/** @internal */
export interface IPlatformBufferReadback {
  isReady(): boolean;
  destroy(): void;
}

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

  createReadback(): IPlatformBufferReadback;

  destroy(): void;
}
