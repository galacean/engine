import { GraphicsResource } from "../asset/GraphicsResource";
import { Engine } from "../Engine";
import { IPlatformBuffer } from "../renderingHardwareInterface";
import { BufferBindFlag } from "./enums/BufferBindFlag";
import { BufferUsage } from "./enums/BufferUsage";
import { SetDataOptions } from "./enums/SetDataOptions";

/**
 * Buffer.
 */
export class Buffer extends GraphicsResource {
  private _type: BufferBindFlag;
  private _byteLength: number;
  private _bufferUsage: BufferUsage;
  private _platformBuffer: IPlatformBuffer;
  private _readable: boolean;
  private _data: Uint8Array;

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
   * @param data - Byte
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
        const dataBuffer = data.constructor === ArrayBuffer ? data.slice(0) : (<ArrayBufferView>data).buffer.slice(0);
        this._data = new Uint8Array(dataBuffer);
      }
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
    dataLength: number,
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
    if (this._readable) {
      let arrayBuffer = data.constructor === ArrayBuffer ? data : (<ArrayBufferView>data).buffer;
      const srcData = new Uint8Array(arrayBuffer, dataOffset, dataLength);
      this._data.set(srcData, bufferByteOffset);
    }
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
    this._platformBuffer.getData(data, bufferByteOffset, dataOffset, dataLength);
  }

  override _rebuild(): void {
    const platformBuffer = this._engine._hardwareRenderer.createPlatformBuffer(
      this._type,
      this._byteLength,
      this._bufferUsage
    );
    this._platformBuffer = platformBuffer;
  }

  /**
   * @internal
   */
  protected override _onDestroy() {
    super._onDestroy();
    this._platformBuffer.destroy();
  }

  /**
   * @deprecated
   */
  resize(byteLength: number) {
    this._platformBuffer.resize(byteLength);
    this._byteLength = byteLength;
  }
}
