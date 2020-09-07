import { VertexElementFormat } from "./enums/VertexElementForamt";

/**
 * 顶点元素。
 */
export class VertexElement {
  private _usage: string;
  private _offset: number;
  private _format: VertexElementFormat;

  /**
   * 顶点输入签名。
   */
  get usage(): string {
    return this._usage;
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
   * 构造顶点元素。
   * @param usage - 顶点着色器输入签名。
   * @param offset - 顶点的偏移，以字节为单位
   * @param format - 顶点元素格式
   */
  constructor(usage: string, offset: number, format: VertexElementFormat) {
    this._usage = usage;
    this._offset = offset;
    this._format = format;
  }
}
