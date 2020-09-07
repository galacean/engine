import { VertexElementFormat } from "./enums/VertexElementFormat";
import { ElementInfo, BufferUtil } from "./BufferUtil";

export interface VertexElements {
  [x: string]: VertexElement;
}

/**
 * 顶点元素。
 */
export class VertexElement {
  private _semantic: string;
  private _offset: number;
  private _format: VertexElementFormat;
  private _instanced: number;
  private _elementInfo: ElementInfo;

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

  get instanced(): number {
    return this._instanced;
  }

  /**
   * 顶点元素信息 类型/大小
   */
  get elementInfo(): ElementInfo {
    return this._elementInfo;
  }

  /**
   * 构造顶点元素。
   * @param usage - 顶点着色器输入签名。
   * @param offset - 顶点的偏移，以字节为单位
   * @param format - 顶点元素格式
   */
  constructor(semantic: string, offset: number, format: VertexElementFormat, instanced: number = 0) {
    this._semantic = semantic;
    this._offset = offset;
    this._format = format;
    this._elementInfo = BufferUtil._getElementInfo(this.format);
    this._instanced = instanced;
  }
}
