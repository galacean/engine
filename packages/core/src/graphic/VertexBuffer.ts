import { Engine } from "../Engine";
import { HardwareRenderer } from "../HardwareRenderer";
import { BufferUtil } from "./BufferUtil";
import { BufferUsage } from "./enums/BufferUsage";
import { SetDataOptions } from "./enums/SetDataOptions";

/**
 * 顶点缓冲。
 */
export class VertexBuffer {
  _glBufferUsage: number;
  _nativeBuffer: WebGLBuffer;

  private _hardwareRenderer: HardwareRenderer;
  private _engine: Engine;
  private _byteLength: number;
  private _bufferUsage: BufferUsage;

  /**
   * 引擎。
   */
  get engine(): Engine {
    return this._engine;
  }

  /**
   * 长度,以字节为单位。
   */
  get byteLength(): number {
    return this._byteLength;
  }

  /**
   * 顶点缓冲用途
   */
  get bufferUsage(): BufferUsage {
    return this._bufferUsage;
  }

  /**
   * 创建顶点缓冲。
   * @param engine - 引擎
   * @param byteLength - 长度，字节为单位
   * @param bufferUsage - 顶点缓冲用途
   */
  constructor(engine: Engine, byteLength: number, bufferUsage?: BufferUsage);

  /**
   * 创建顶点缓冲。
   * @param engine - 引擎
   * @param data - 数据
   * @param bufferUsage - 顶点缓冲用途
   */
  constructor(engine: Engine, data: ArrayBuffer | ArrayBufferView, bufferUsage?: BufferUsage);

  constructor(
    engine: Engine,
    byteLengthOrData: number | ArrayBuffer | ArrayBufferView,
    bufferUsage: BufferUsage = BufferUsage.Static
  ) {
    this._engine = engine;
    this._bufferUsage = bufferUsage;

    const hardwareRenderer = engine._hardwareRenderer;
    const gl: WebGLRenderingContext & WebGL2RenderingContext = hardwareRenderer.gl;
    const glBufferUsage = BufferUtil._getGLBufferUsage(gl, bufferUsage);

    this._nativeBuffer = gl.createBuffer();
    this._hardwareRenderer = hardwareRenderer;
    this._glBufferUsage = glBufferUsage;

    this.bind();
    if (typeof byteLengthOrData === "number") {
      this._byteLength = byteLengthOrData;
      gl.bufferData(gl.ARRAY_BUFFER, byteLengthOrData, glBufferUsage);
    } else {
      this._byteLength = byteLengthOrData.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, byteLengthOrData, glBufferUsage);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * 绑定。
   */
  bind(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._nativeBuffer);
  }

  /**
   * 设置顶点数据。
   * @param data - 顶点数据
   */
  setData(data: ArrayBuffer | ArrayBufferView): void;

  /**
   * 设置顶点数据。
   * @param data - 顶点数据
   * @param bufferByteOffset - 缓冲偏移，以字节为单位
   */
  setData(data: ArrayBuffer | ArrayBufferView, bufferByteOffset: number): void;

  /**
   * 设置顶点数据。
   * @param data - 顶点数据
   * @param bufferByteOffset - 缓冲偏移，以字节为单位
   * @param dataOffset - 数据偏移
   * @param dataLength - 数据长度
   */
  setData(data: ArrayBuffer | ArrayBufferView, bufferByteOffset: number, dataOffset: number, dataLength: number): void;

  /**
   * 设置顶点数据。
   * @param data - 顶点数据
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
    this.bind();

    if (options === SetDataOptions.Discard) {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._byteLength, this._glBufferUsage);
    }

    const byteSize = (<Uint8Array>data).BYTES_PER_ELEMENT || 1; //TypeArray is BYTES_PER_ELEMENT , unTypeArray is 1
    const dataByteLength = byteSize * dataLength;
    if (dataOffset !== 0 || dataByteLength < data.byteLength) {
      const isArrayBufferView = (<ArrayBufferView>data).byteOffset !== undefined;
      if (isWebGL2 && isArrayBufferView) {
        gl.bufferSubData(gl.ARRAY_BUFFER, bufferByteOffset, <ArrayBufferView>data, dataOffset, dataLength);
      } else {
        const subData = new Uint8Array(
          isArrayBufferView ? (<ArrayBufferView>data).buffer : <ArrayBuffer>data,
          dataOffset * byteSize,
          dataByteLength
        );
        gl.bufferSubData(gl.ARRAY_BUFFER, bufferByteOffset, subData);
      }
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, bufferByteOffset, data);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * 获取顶点数据。
   * @param data - 顶点输出数据
   */
  getData(data: ArrayBufferView): void;

  /**
   * 获取顶点数据。
   * @param data - 顶点输出数据
   * @param bufferByteOffset - 缓冲读取偏移，以字节为单位
   */
  getData(data: ArrayBufferView, bufferByteOffset: number): void;

  /**
   * 获取顶点数据。
   * @param data - 顶点输出数据
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
      gl.getBufferSubData(gl.ARRAY_BUFFER, bufferByteOffset, data, dataOffset, dataLength);
    } else {
      throw "IndexBuffer is write-only on WebGL1.0 platforms.";
    }
  }

  /**
   * 销毁。
   */
  destroy(): void {
    if (this._nativeBuffer) {
      const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
      gl.deleteBuffer(this._nativeBuffer);
      this._nativeBuffer = null;
      this._engine = null;
      this._hardwareRenderer = null;
    }
  }

  /**
   * @deprecated
   */
  resize(dataLength: number) {
    this.bind();
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
    gl.bufferData(gl.ARRAY_BUFFER, dataLength, this._glBufferUsage);
    this._byteLength = dataLength;
  }
}
