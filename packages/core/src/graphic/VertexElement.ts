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
  private _bindingIndex: number;
  private _instanceStepRate: number;

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
   * 顶点缓冲绑定索引。
   */
  get bindingIndex(): number {
    return this._bindingIndex;
  }

  /**
   * 实例步频，在缓冲中每前进一个顶点绘制的实例数量，非实例元素必须为 0。
   */
  get instanceStepRate(): number {
    return this._instanceStepRate;
  }

  /**
   * 构造顶点元素。
   * @param semantic - 顶点着色器输入签名
   * @param offset - 顶点的偏移，以字节为单位
   * @param format - 顶点元素格式
   * @param bindingIndex - 顶点缓冲绑定索引
   * @param instanceStepRate - 实例步频，在缓冲中每前进一个顶点绘制的实例数量，非实例元素必须为 0
   */
  constructor(
    semantic: string,
    offset: number,
    format: VertexElementFormat,
    bindingIndex: number,
    instanceStepRate: number = 0
  ) {
    this._semantic = semantic;
    this._offset = offset;
    this._format = format;
    this._bindingIndex = bindingIndex;
    this._glElementInfo = BufferUtil._getElementInfo(this.format);
    this._instanceStepRate = Math.floor(instanceStepRate);
  }

  /**
   * @deprecated
   */
  get elementInfo(): ElementInfo {
    return this._glElementInfo;
  }
}
