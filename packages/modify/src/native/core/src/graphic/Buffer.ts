import { GraphicsResource } from "../asset/GraphicsResource";
import { TypedArray } from "../base";
import { Engine } from "../Engine";
import { IPlatformBuffer } from "../renderingHardwareInterface";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { BufferBindFlag } from "./enums/BufferBindFlag";
import { BufferUsage } from "./enums/BufferUsage";
import { SetDataOptions } from "./enums/SetDataOptions";

/**
 * Buffer.
 */
export class Buffer extends GraphicsResource {
  /** @internal */
  _dataUpdateManager: UpdateFlagManager = new UpdateFlagManager();
  /** @internal */
  _platformBuffer: IPlatformBuffer;

  private _type: BufferBindFlag;
  private _byteLength: number;
  private _bufferUsage: BufferUsage;
  private _readable: boolean;
  private _cpuDataValid = true;
  private _cpuShaderWriteRevision = 0;
  private _vertexSource?: WeakRef<ArrayBufferView>;
  private _vertexSourceRevision?: number;
  private _data: Uint8Array | null;

  /**
   * Buffer binding flag.
   */
  get type(): BufferBindFlag {
    return this._type;
  }

  /**
   * Byte length.
   */
  get byteLength(): number {
    return this._byteLength;
  }

  /**
   * Buffer usage.
   */
  get bufferUsage(): BufferUsage {
    return this._bufferUsage;
  }

  /**
   * If buffer is readable.
   */
  get readable(): boolean {
    return this._readable;
  }

  /**
   * Buffer data cache.
   *
   * @remarks
   * Buffer must be readable.
   * If the data you get is modified, must call `setData()` to update buffer to GPU.
   */
  get data(): Uint8Array | null {
    if (this._readable) {
      return this._data;
    } else {
      throw "Buffer is not readable.";
    }
  }

  /** @internal Current CPU-side contents, if available without a GPU readback. */
  get _readableData(): Uint8Array | null {
    return this._readable &&
      this._cpuDataValid &&
      this._cpuShaderWriteRevision === (this._platformBuffer.shaderWriteRevision ?? 0)
      ? this._data
      : null;
  }

  /** @internal Remember immutable loader-owned vertex data while its original allocation is still alive. */
  _rememberVertexSource(data: ArrayBufferView): void {
    if (!this._readable && typeof WeakRef !== "undefined") {
      this._vertexSource = new WeakRef(data);
      this._vertexSourceRevision = this._platformBuffer.shaderWriteRevision;
    }
  }

  /** @internal Synchronous emission data when the mesh or its loader still has the uploaded bytes. */
  _getVertexSource(): Uint8Array | null {
    const readable = this._readableData;
    if (readable) return readable;
    const source =
      this._vertexSourceRevision === this._platformBuffer.shaderWriteRevision && this._vertexSource?.deref();
    return source ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : null;
  }

  /**
   * Create Buffer.
   * @param engine - Engine
   * @param type - Buffer binding flag
   * @param byteLength - Byte length
   * @param bufferUsage - Buffer usage
   * @param readable - If buffer is readable
   */
  constructor(engine: Engine, type: BufferBindFlag, byteLength: number, bufferUsage?: BufferUsage, readable?: boolean);

  /**
   * Create Buffer.
   * @param engine - Engine
   * @param type - Buffer binding flag
   * @param data - Buffer data, if `readable` is true, the`data` property will store a copy of this
   * @param bufferUsage - Buffer usage
   * @param readable - If buffer is readable
   */
  constructor(
    engine: Engine,
    type: BufferBindFlag,
    data: ArrayBuffer | ArrayBufferView,
    bufferUsage?: BufferUsage,
    readable?: boolean
  );

  constructor(
    engine: Engine,
    type: BufferBindFlag,
    byteLengthOrData: number | ArrayBuffer | ArrayBufferView,
    bufferUsage: BufferUsage = BufferUsage.Static,
    readable: boolean = false
  ) {
    super(engine);
    this._engine = engine;
    this._type = type;
    this._bufferUsage = bufferUsage;
    this._readable = readable;

    try {
      if (typeof byteLengthOrData === "number") {
        this._byteLength = byteLengthOrData;
        this._platformBuffer = engine._hardwareRenderer.createPlatformBuffer(type, byteLengthOrData, bufferUsage);
        if (readable) {
          this._data = new Uint8Array(byteLengthOrData);
        }
      } else {
        const data = byteLengthOrData;
        const byteLength = data.byteLength;
        this._byteLength = byteLength;
        this._platformBuffer = engine._hardwareRenderer.createPlatformBuffer(type, byteLength, bufferUsage, data);
        if (readable) {
          const buffer =
            data.constructor === ArrayBuffer
              ? data.slice(0)
              : (<ArrayBufferView>data).buffer.slice(
                  (<ArrayBufferView>data).byteOffset,
                  (<ArrayBufferView>data).byteOffset + byteLength
                );
          this._data = new Uint8Array(buffer);
        }
      }
    } catch (error) {
      // The constructor registered this resource, but memory has not been accounted yet.
      // A failed platform allocation has no owner that could release it later.
      this._byteLength = 0;
      this.destroy(true);
      throw error;
    }

    if (!engine._isDeviceLost) {
      engine._renderingStatistics._bufferMemory += this._byteLength;
    }
  }

  /**
   * Bind buffer.
   */
  bind(): void {
    this._platformBuffer.bind();
  }

  /**
   * Set buffer data.
   * @param data - Input buffer data
   */
  setData(data: ArrayBuffer | ArrayBufferView): void;

  /**
   * Set buffer data.
   * @param data - Input buffer data
   * @param bufferByteOffset - buffer byte offset
   */
  setData(data: ArrayBuffer | ArrayBufferView, bufferByteOffset: number): void;

  /**
   * Set buffer data.
   * @param data - Input buffer data
   * @param bufferByteOffset - Buffer byte offset
   * @param dataOffset - Buffer byte offset
   * @param dataLength - Data length
   */
  setData(data: ArrayBuffer | ArrayBufferView, bufferByteOffset: number, dataOffset: number, dataLength?: number): void;

  /**
   * Set buffer data.
   * @param data - Input buffer data
   * @param bufferByteOffset - Buffer byte offset
   * @param dataOffset - Buffer byte offset
   * @param dataLength - Data length
   * @param options - Update strategy: None/Discard/NoOverwrite
   */
  setData(
    data: ArrayBuffer | ArrayBufferView,
    bufferByteOffset: number,
    dataOffset: number,
    dataLength: number | undefined,
    options: SetDataOptions
  ): void;

  setData(
    data: ArrayBuffer | ArrayBufferView,
    bufferByteOffset: number = 0,
    dataOffset: number = 0,
    dataLength?: number,
    options: SetDataOptions = SetDataOptions.None
  ): void {
    this._platformBuffer.setData(this._byteLength, data, bufferByteOffset, dataOffset, dataLength, options);
    this._onDataUploaded(data, bufferByteOffset, dataOffset, dataLength, options === SetDataOptions.Discard);
  }

  /** @internal Bind a uniform range and optionally upload the complete contents of that slice. */
  _bindUniformRange(
    binding: number,
    offset: number,
    size: number,
    data?: ArrayBufferView,
    discard?: boolean,
    zeroStart = 0,
    zeroEnd = 0
  ): void {
    const rhi = this._engine._hardwareRenderer;
    const platform = this._platformBuffer;
    if (zeroEnd && platform.writeUniformArrayRange && data instanceof Uint32Array && !discard) {
      platform.writeUniformArrayRange(offset, data, zeroStart, zeroEnd);
      rhi.bindUniformBufferRange(binding, platform, offset, size);
    } else {
      rhi.bindUniformBufferRange(binding, platform, offset, size, data, discard);
    }
    if (data) this._onDataUploaded(data, offset, 0, undefined, discard);
  }

  private _onDataUploaded(
    data: ArrayBuffer | ArrayBufferView,
    bufferByteOffset: number,
    dataOffset: number,
    dataLength?: number,
    discard = false
  ): void {
    this._vertexSource = undefined;
    if (this._readable) {
      const view = ArrayBuffer.isView(data) ? data : undefined;
      const buffer = view ? view.buffer : (data as ArrayBuffer);
      const bytes = (data as TypedArray).BYTES_PER_ELEMENT || 1;
      const start = dataOffset * bytes;
      const length = dataLength === undefined ? data.byteLength - start : dataLength * bytes;
      const src = new Uint8Array(buffer, (view?.byteOffset ?? 0) + start, length);
      const snapshot = this._data!;
      snapshot.set(src, bufferByteOffset);
      if (discard) {
        // The source may alias the CPU snapshot. Copy its range before clearing the rest of the orphaned store.
        snapshot.fill(0, 0, bufferByteOffset);
        snapshot.fill(0, bufferByteOffset + length);
      }
      if (discard || (bufferByteOffset === 0 && length === this._byteLength)) {
        this._cpuDataValid = true;
        this._cpuShaderWriteRevision = this._platformBuffer.shaderWriteRevision ?? 0;
      }
    }
    this._isContentLost = false;
    this._dataUpdateManager.dispatch();
  }

  /**
   * Get buffer data.
   * @param data - Output buffer data
   */
  getData(data: ArrayBufferView): void;

  /**
   * Get buffer data.
   * @param data - Output buffer data
   * @param bufferByteOffset - Buffer byte offset
   */
  getData(data: ArrayBufferView, bufferByteOffset: number): void;

  /**
   * Get buffer data.
   * @param data - Output buffer data
   * @param bufferByteOffset - Buffer byte offset
   * @param dataOffset - Output data offset
   * @param dataLength - Output data length
   */
  getData(data: ArrayBufferView, bufferByteOffset: number, dataOffset: number, dataLength: number): void;

  getData(data: ArrayBufferView, bufferByteOffset: number = 0, dataOffset: number = 0, dataLength?: number): void {
    if (this._platformBuffer.supportsSynchronousReadback === false && this._readableData) {
      const bytes = (data as TypedArray).BYTES_PER_ELEMENT || 1;
      const size = dataLength === undefined ? data.byteLength - dataOffset * bytes : dataLength * bytes;
      if (
        bufferByteOffset < 0 ||
        dataOffset < 0 ||
        size < 0 ||
        bufferByteOffset + size > this._byteLength ||
        dataOffset * bytes + size > data.byteLength
      ) {
        throw new RangeError("Buffer read exceeds the source or destination range.");
      }
      new Uint8Array(data.buffer, data.byteOffset + dataOffset * bytes, size).set(
        this._data!.subarray(bufferByteOffset, bufferByteOffset + size)
      );
      return;
    }
    this._platformBuffer.getData(data, bufferByteOffset, dataOffset, dataLength);
  }

  /** Read the GPU contents, including earlier writes in the current frame. */
  async getDataAsync(data: ArrayBufferView, bufferByteOffset = 0, dataOffset = 0, dataLength?: number): Promise<void> {
    const platform = this._platformBuffer;
    if (platform.getDataAsync) return platform.getDataAsync(data, bufferByteOffset, dataOffset, dataLength);
    platform.getData(data, bufferByteOffset, dataOffset, dataLength);
  }

  /**
   * Copy data from another buffer on the GPU.
   * @param srcBuffer - Source buffer
   * @param srcByteOffset - Byte offset in the source buffer
   * @param dstByteOffset - Byte offset in this buffer
   * @param byteLength - Number of bytes to copy
   */
  copyFromBuffer(srcBuffer: Buffer, srcByteOffset: number, dstByteOffset: number, byteLength: number): void {
    this._platformBuffer.copyFromBuffer(srcBuffer._platformBuffer, srcByteOffset, dstByteOffset, byteLength);
    this._vertexSource = undefined;
    if (this._readable) {
      if (srcBuffer._readableData) {
        this._data!.set(srcBuffer._data!.subarray(srcByteOffset, srcByteOffset + byteLength), dstByteOffset);
        if (dstByteOffset === 0 && byteLength === this._byteLength) {
          this._cpuDataValid = true;
          this._cpuShaderWriteRevision = this._platformBuffer.shaderWriteRevision ?? 0;
        }
      } else {
        this._cpuDataValid = false;
      }
    }
  }

  /**
   * Mark buffer as readable, the `data` property will be not accessible anymore.
   */
  markAsUnreadable(): void {
    this._data = null;
    this._readable = false;
  }

  /**
   * @internal
   */
  override _rebuild(): void {
    const snapshot = this._readableData;
    this._vertexSource = undefined;
    const platformBuffer = this._engine._hardwareRenderer.createPlatformBuffer(
      this._type,
      this._byteLength,
      this._bufferUsage,
      snapshot ?? undefined
    );
    this._platformBuffer = platformBuffer;
    this._cpuShaderWriteRevision = platformBuffer.shaderWriteRevision ?? 0;
    this._cpuDataValid = !!snapshot;
    if (snapshot) this._isContentLost = false;
    this._engine._renderingStatistics._bufferMemory += this._byteLength;
  }

  /**
   * @internal
   */
  protected override _onDestroy() {
    super._onDestroy();
    if (!this._engine._isDeviceLost) {
      this._engine._renderingStatistics._bufferMemory -= this._byteLength;
    }
    this._platformBuffer?.destroy();
  }
}
