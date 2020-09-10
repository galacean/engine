import { VertexElementFormat } from "./enums/VertexElementFormat";
import { ElementInfo, BufferUtil } from "./BufferUtil";

/**
 * 顶点元素。
 */
export class VertexElement {
  public readonly normalized = false;

  _glElementInfo: ElementInfo;

  private _semantic: string;
  private _offset: number;
  private _format: VertexElementFormat;
  private _vertexBufferSlot: number;
  private _instanceDivisor: number;

  /**
   * 顶点输入签名。
   */
  get semantic(): string {
    return this._semantic;
  }

  /**
   * 顶点的偏移，以字节为单位。
   */
  get offset(): number {
    return this._offset;
  }

  /**
   * 顶点元素格式。
   */
  get format(): VertexElementFormat {
    return this._format;
  }

  /**
   * 顶点缓冲插槽。
   */
  get vertexBufferSlot(): number {
    return this._vertexBufferSlot;
  }

  /**
   * 实例除数，0表示不开启实例，大于1表示开启。
   */
  get instanceDivisor(): number {
    return this._instanceDivisor;
  }

  /**
   * 构造顶点元素。
   * @param semantic - 顶点着色器输入签名。
   * @param offset - 顶点的偏移，以字节为单位
   * @param format - 顶点元素格式
   * @param vertexbufferSlot - 顶点缓冲插槽
   * @param instanceDivisor - 实例除数，0表示不开启实例，大于1表示开启
   */
  constructor(
    semantic: string,
    offset: number,
    format: VertexElementFormat,
    vertexbufferSlot: number,
    instanceDivisor: number = 0
  ) {
    this._semantic = semantic;
    this._offset = offset;
    this._format = format;
    this._vertexBufferSlot = vertexbufferSlot;
    this._glElementInfo = BufferUtil._getElementInfo(this.format);
    this._instanceDivisor = Math.floor(instanceDivisor);
  }

  /**
   * @deprecated
   */
  get elementInfo(): ElementInfo {
    return this._glElementInfo;
  }
}

/**
 * @deprecated
 */
export interface VertexElements {
  [x: string]: VertexElement;
}
