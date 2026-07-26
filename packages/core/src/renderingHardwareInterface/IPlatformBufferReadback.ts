import type { IPlatformBuffer } from "./IPlatformBuffer";

/**
 * Reusable asynchronous GPU buffer readback transaction.
 * @internal
 */
export interface IPlatformBufferReadback {
  /**
   * Record a copy from a GPU buffer into the owned staging buffer.
   * @param srcBuffer - Source GPU buffer
   * @param srcByteOffset - Source byte offset
   * @param dstByteOffset - Staging buffer byte offset
   * @param byteLength - Number of bytes to copy
   */
  copyFromBuffer(srcBuffer: IPlatformBuffer, srcByteOffset: number, dstByteOffset: number, byteLength: number): void;

  /** Submit all recorded copies and start tracking their completion. */
  submit(): void;

  /** Check whether the submitted copies have completed without blocking. */
  isReady(): boolean;

  /**
   * Copy completed staging data into a CPU-side array.
   * @param data - Destination CPU-side array
   * @param bufferByteOffset - Staging buffer byte offset
   * @param dataOffset - Destination offset in elements, or bytes for DataView
   * @param dataLength - Number of destination elements, or bytes for DataView
   */
  getData(data: ArrayBufferView, bufferByteOffset?: number, dataOffset?: number, dataLength?: number): void;

  /** Reset the current transaction so the object can be reused. */
  reset(): void;

  /** Destroy the transaction and all owned platform resources. */
  destroy(): void;
}
