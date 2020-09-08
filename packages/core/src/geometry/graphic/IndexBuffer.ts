import { Engine } from "../../Engine";
import { HardwareRenderer } from "../../HardwareRenderer";
import { BufferUsage } from "./enums/BufferUsage";
import { IndexFormat } from "./enums/IndexFormat";
import { BufferUtil } from "./BufferUtil";
import { SetDataOptions } from "./enums/SetDataOptions";

/**
 * 索引缓冲。
 */
export class IndexBuffer {
  _glIndexType: number;
  _glBufferUsage: number;

  private _hardwareRenderer: HardwareRenderer;
  private _nativeBuffer: WebGLBuffer;
  private _engine: Engine;
  private _indexCount: number;
  private _bufferUsage: BufferUsage;
  private _indexFormat: IndexFormat;
  private _elementByteCount: number;
  private _bufferByteSize: number;

  /**
   * 引擎。
   */
  get engine(): Engine {
    return this._engine;
  }

  /**
   * 索引缓冲用途。
   */
  get bufferUsage(): BufferUsage {
    return this._bufferUsage;
  }

  /**
   * 索引格式。
   */
  get indexFormat(): IndexFormat {
    return this._indexFormat;
  }

  /**
   * 索引数量。
   */
  get indexCount(): number {
    return this._indexCount;
  }

  /**
   * 创建索引缓冲。
   * @param engine - 引擎
   * @param indexFormat - 索引格式
   * @param byteSize - 索引缓冲尺寸，以字节为单位
   * @param bufferUsage - 索引缓冲用途
   */
  constructor(
    indexCount: number,
    indexFormat: IndexFormat = IndexFormat.UInt16,
    bufferUsage: BufferUsage = BufferUsage.Static,
    engine: Engine
  ) {
    engine = engine || Engine._getDefaultEngine();
    this._engine = engine;
    this._indexCount = indexCount;
    this._bufferUsage = bufferUsage;
    this._indexFormat = indexFormat;

    const hardwareRenderer = engine._hardwareRenderer;
    const gl: WebGLRenderingContext & WebGL2RenderingContext = hardwareRenderer.gl;
    const elementByteCount = indexFormat === IndexFormat.UInt32 ? 4 : indexFormat === IndexFormat.UInt16 ? 2 : 1;
    const bufferByteSize = indexCount * elementByteCount;
    const glBufferUsage = BufferUtil._getGLBufferUsage(gl, bufferUsage);

    this._nativeBuffer = gl.createBuffer();
    this._hardwareRenderer = hardwareRenderer;
    this._elementByteCount = elementByteCount;
    this._bufferByteSize = bufferByteSize;
    this._glBufferUsage = glBufferUsage;
    this._glIndexType = BufferUtil._getGLIndexType(gl, indexFormat);

    this.bind();
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, bufferByteSize, glBufferUsage);
  }

  /**
   * 绑定。
   */
  bind(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._nativeBuffer);
  }

  /**
   * 设置索引数据。
   * @param data - 索引数据
   */
  setData(data: Uint8Array | Uint16Array | Uint32Array): void;

  /**
   * 设置索引数据。
   * @param data - 索引数据
   * @param bufferOffset - 缓冲偏移
   */
  setData(data: Uint8Array | Uint16Array | Uint32Array, bufferOffset: number): void;

  /**
   * 设置索引数据。
   * @param data - 索引数据
   * @param bufferOffset - 缓冲读取偏移，以字节为单位
   * @param dataOffset - 数据偏移
   * @param dataLength - 数据长度
   */
  setData(
    data: Uint8Array | Uint16Array | Uint32Array,
    bufferOffset: number,
    dataOffset: number,
    dataLength: number
  ): void;

  /**
   * 设置索引数据。
   * @param data - 索引数据
   * @param bufferOffset - 缓冲读取偏移，以字节为单位
   * @param dataOffset - 数据偏移
   * @param dataLength - 数据长度
   * @param options - 操作选项
   */
  setData(
    data: Uint8Array | Uint16Array | Uint32Array,
    bufferOffset: number,
    dataOffset: number,
    dataLength: number,
    options: SetDataOptions
  ): void;

  setData(
    data: Uint8Array | Uint16Array | Uint32Array,
    bufferOffset: number = 0,
    dataOffset: number = 0,
    dataLength?: number,
    options: SetDataOptions = SetDataOptions.None
  ): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
    const isWebGL2: boolean = this._hardwareRenderer.isWebGL2;
    const elementByteCount: number = this._elementByteCount;
    const bufferByteOffset = bufferOffset * elementByteCount;
    this.bind();

    if (options === SetDataOptions.Discard) {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._bufferByteSize, this._glBufferUsage);
    }

    if (dataOffset !== 0 || dataLength < data.length) {
      if (isWebGL2) {
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, bufferByteOffset, data, dataOffset, dataLength);
      } else {
        const subData = data.subarray(dataOffset, dataLength);
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, bufferByteOffset, subData);
      }
    } else {
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, bufferByteOffset, data);
    }
  }

  /**
   * 获取索引数据。
   * @param data - 索引输出数据
   */
  getData(data: Uint8Array | Uint16Array | Uint32Array): void;

  /**
   * 获取索引数据。
   * @param data - 索引输出数据
   * @param bufferOffset - 缓冲读取偏移
   */
  getData(data: Uint8Array | Uint16Array | Uint32Array, bufferOffset: number): void;

  /**
   * 获取索引数据。
   * @param data - 索引输出数据
   * @param bufferOffset - 缓冲读取偏移
   * @param dataOffset - 输出偏移
   * @param dataLength - 输出长度
   */
  getData(
    data: Uint8Array | Uint16Array | Uint32Array,
    bufferOffset: number,
    dataOffset: number,
    dataLength: number
  ): void;

  getData(
    data: Uint8Array | Uint16Array | Uint32Array,
    bufferOffset: number = 0,
    dataOffset: number = 0,
    dataLength?: number
  ): void {
    const isWebGL2: boolean = this._hardwareRenderer.isWebGL2;

    if (isWebGL2) {
      const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
      const elementByteCount: number = this._elementByteCount;
      const bufferByteOffset = bufferOffset * elementByteCount;
      this.bind();
      gl.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER, bufferByteOffset, data, dataOffset, dataLength);
    } else {
      throw "IndexBuffer is write-only on WebGL1.0 platforms.";
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
  get elementByteCount() {
    return this._elementByteCount;
  }

  /**
   * @deprecated
   */
  resize(dataLength: number) {
    this.bind();
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, dataLength, this._glBufferUsage);
  }
}
