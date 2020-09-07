import { Engine } from "../../Engine";
import { BufferUsage } from "./enums/BufferUsage";
import { VertexDeclaration } from "./VertexDeclaration";
import { HardwareRenderer } from "../../HardwareRenderer";
import { BufferUtil } from "./BufferUtil";

/**
 * 顶点缓冲。
 */
export class VertexBuffer {
  /** 顶点声明。*/
  public declaration: VertexDeclaration;

  private _hardwareRenderer: HardwareRenderer;
  private _nativeBuffer: WebGLBuffer;
  private _engine: Engine;
  private _length: number;
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
  get length(): number {
    return this._length;
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
   * @param length - 长度，字节为单位
   * @param bufferUsage - 顶点缓冲用途
   */
  constructor(engine: Engine, length: number, bufferUsage: BufferUsage) {
    this._engine = engine;
    this._length = length;
    this._bufferUsage = bufferUsage;

    const hardwareRenderer = engine._hardwareRenderer;
    const gl: WebGLRenderingContext & WebGL2RenderingContext = hardwareRenderer.gl;

    this._nativeBuffer = gl.createBuffer();
    this._hardwareRenderer = hardwareRenderer;

    this.bind();
    gl.bufferData(gl.ARRAY_BUFFER, length, BufferUtil._getGLBufferUsage(gl, bufferUsage));
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
  setData(data: ArrayBuffer): void;

  /**
   * 设置顶点数据。
   * @param data - 顶点数据
   * @param bufferByteOffset - 缓冲偏移，以字节为单位
   */
  setData(data: ArrayBuffer, bufferByteOffset: number): void;

  /**
   * 设置顶点数据。
   * @param data - 顶点数据
   * @param bufferByteOffset - 缓冲偏移，以字节为单位
   * @param dataByteOffset - 数据偏移
   * @param dataByteLength - 数据长度
   */
  setData(data: ArrayBuffer, bufferByteOffset: number, dataByteOffset: number, dataByteLength: number): void;

  setData(data: ArrayBuffer, bufferByteOffset: number = 0, dataByteOffset: number = 0, dataByteLength?: number): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
    const isWebGL2: boolean = this._hardwareRenderer.isWebGL2;
    this.bind();
    if (dataByteOffset !== 0 || dataByteLength < data.byteLength) {
      if (isWebGL2) {
        gl.bufferSubData(gl.ARRAY_BUFFER, bufferByteOffset, new Uint8Array(data), dataByteOffset, dataByteLength); //CM:测试一下性能对比
      } else {
        const subData = new Uint8Array(data, dataByteOffset, dataByteLength);
        gl.bufferSubData(gl.ARRAY_BUFFER, bufferByteOffset, subData);
      }
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, bufferByteOffset, data);
    }
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
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._hardwareRenderer.gl;
    gl.deleteBuffer(this._nativeBuffer);
    this._nativeBuffer = null;
    this._engine = null;
    this._hardwareRenderer = null;
  }
}
