import { Engine } from "../Engine";
import { HardwareRenderer } from "../HardwareRenderer";
import { BufferUtil } from "./BufferUtil";
import { BufferBindFlag } from "./enums/BufferBindFlag";
import { BufferUsage } from "./enums/BufferUsage";
import { SetDataOptions } from "./enums/SetDataOptions";

/**
 * 缓冲。
 */
export class Buffer {
  _glBindTarget: number;
  _glBufferUsage: number;
  _nativeBuffer: WebGLBuffer;

  private _hardwareRenderer: HardwareRenderer;
  private _engine: Engine;
  private _type: BufferBindFlag;
  private _byteLength: number;
  private _bufferUsage: BufferUsage;

  /**
   * 引擎。
   */
  get engine(): Engine {
    return this._engine;
  }

  /**
   * 缓冲类型。
   */
  get type(): BufferBindFlag {
    return this._type;
  }

  /**
   * 长度,以字节为单位。
   */
  get byteLength(): number {
    return this._byteLength;
  }

  /**
   * 缓冲用途
   */
  get bufferUsage(): BufferUsage {
    return this._bufferUsage;
  }

  /**
   * 创建缓冲。
   * @param engine - 引擎
   * @param type - 缓冲类型
   * @param byteLength - 长度，字节为单位
   * @param bufferUsage - 缓冲用途
   */
  constructor(engine: Engine, type: BufferBindFlag, byteLength: number, bufferUsage?: BufferUsage);

  /**
   * 创建缓冲。
   * @param engine - 引擎
   * @param type - 缓冲类型
   * @param data - 数据
   * @param bufferUsage - 缓冲用途
   */
  constructor(engine: Engine, type: BufferBindFlag, data: ArrayBuffer | ArrayBufferView, bufferUsage?: BufferUsage);

  constructor(
    engine: Engine,
    type: BufferBindFlag,
    byteLengthOrData: number | ArrayBuffer | ArrayBufferView,
    bufferUsage: BufferUsage = BufferUsage.Static
  ) {
    this._engine = engine;
    this._type = type;
    this._bufferUsage = bufferUsage;

    const hardwareRenderer = engine._hardwareRenderer;
    const gl: WebGLRenderingContext & WebGL2RenderingContext = hardwareRenderer.gl;
    const glBufferUsage = BufferUtil._getGLBufferUsage(gl, bufferUsage);
    const glBindTarget = type === BufferBindFlag.VertexBuffer ? gl.ARRAY_BUFFER : gl.ELEMENT_ARRAY_BUFFER;

    this._nativeBuffer = gl.createBuffer();
    this._hardwareRenderer = hardwareRenderer;
    this._glBufferUsage = glBufferUsage;
    this._glBindTarget = glBindTarget;

    this.bind();
    if (typeof byteLengthOrData === "number") {
      this._byteLength = byteLengthOrData;
      gl.bufferData(glBindTarget, byteLengthOrData, glBufferUsage);
    } else {
      this._byteLength = byteLengthOrData.byteLength;
      gl.bufferData(glBindTarget, byteLengthOrData, glBufferUsage);
    }
    gl.bindBuffer(glBindTarget, null);
  }

  /**
   * 绑定。
   */
  bind(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
    gl.bindBuffer(this._glBindTarget, this._nativeBuffer);
  }

  /**
   * 设置缓冲数据。
   * @param data - 缓冲数据
   */
  setData(data: ArrayBuffer | ArrayBufferView): void;

  /**
   * 设置缓冲数据。
   * @param data - 缓冲数据
   * @param bufferByteOffset - 缓冲偏移，以字节为单位
   */
  setData(data: ArrayBuffer | ArrayBufferView, bufferByteOffset: number): void;

  /**
   * 设置缓冲数据。
   * @param data - 缓冲数据
   * @param bufferByteOffset - 缓冲偏移，以字节为单位
   * @param dataOffset - 数据偏移
   * @param dataLength - 数据长度
   */
  setData(data: ArrayBuffer | ArrayBufferView, bufferByteOffset: number, dataOffset: number, dataLength?: number): void;

  /**
   * 设置缓冲数据。
   * @param data - 数据
   * @param bufferByteOffset - 缓冲偏移，以字节为单位
   * @param dataOffset - 数据偏移
   * @param dataLength - 数据长度
   * @param options - 操作选项
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
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
    const isWebGL2: boolean = this._hardwareRenderer.isWebGL2;
    const glBindTarget: number = this._glBindTarget;
    this.bind();

    if (options === SetDataOptions.Discard) {
      gl.bufferData(glBindTarget, this._byteLength, this._glBufferUsage);
    }

    // TypeArray is BYTES_PER_ELEMENT, unTypeArray is 1
    const byteSize = (<Uint8Array>data).BYTES_PER_ELEMENT || 1;
    const dataByteLength = dataLength ? byteSize * dataLength : data.byteLength;

    if (dataOffset !== 0 || dataByteLength < data.byteLength) {
      const isArrayBufferView = (<ArrayBufferView>data).byteOffset !== undefined;
      if (isWebGL2 && isArrayBufferView) {
        gl.bufferSubData(glBindTarget, bufferByteOffset, <ArrayBufferView>data, dataOffset, dataByteLength / byteSize);
      } else {
        const subData = new Uint8Array(
          isArrayBufferView ? (<ArrayBufferView>data).buffer : <ArrayBuffer>data,
          dataOffset * byteSize,
          dataByteLength
        );
        gl.bufferSubData(glBindTarget, bufferByteOffset, subData);
      }
    } else {
      gl.bufferSubData(glBindTarget, bufferByteOffset, data);
    }
    gl.bindBuffer(glBindTarget, null);
  }

  /**
   * 获取缓冲数据。
   * @param data - 缓冲输出数据
   */
  getData(data: ArrayBufferView): void;

  /**
   * 获取缓冲数据。
   * @param data - 缓冲输出数据
   * @param bufferByteOffset - 缓冲读取偏移，以字节为单位
   */
  getData(data: ArrayBufferView, bufferByteOffset: number): void;

  /**
   * 获取缓冲数据。
   * @param data - 缓冲输出数据
   * @param bufferByteOffset - 缓冲读取偏移，以字节为单位
   * @param dataOffset - 输出偏移
   * @param dataLength - 输出长度
   */
  getData(data: ArrayBufferView, bufferByteOffset: number, dataOffset: number, dataLength: number): void;

  getData(data: ArrayBufferView, bufferByteOffset: number = 0, dataOffset: number = 0, dataLength?: number): void {
    const isWebGL2: boolean = this._hardwareRenderer.isWebGL2;

    if (isWebGL2) {
      const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
      this.bind();
      gl.getBufferSubData(this._glBindTarget, bufferByteOffset, data, dataOffset, dataLength);
    } else {
      throw "Buffer is write-only on WebGL1.0 platforms.";
    }
  }

  /**
   * 销毁。
   */
  destroy(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
    gl.deleteBuffer(this._nativeBuffer);
    this._nativeBuffer = null;
    this._engine = null;
    this._hardwareRenderer = null;
  }

  /**
   * @deprecated
   */
  resize(dataLength: number) {
    this.bind();
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
    gl.bufferData(this._glBindTarget, dataLength, this._glBufferUsage);
    this._byteLength = dataLength;
  }
}
