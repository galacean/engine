import { VertexElementFormat, getElementInfo } from "./VertexElementFormat";
import { UpdateType } from "../../base/Constant";

export class VertexElement {
  private _semantic: string;
  private _offset: number;
  private _format: VertexElementFormat;
  private _instanced: number;
  private _normalized: boolean;
  vertexBufferIndex: number;
  stride: number;
  updateType: UpdateType = UpdateType.UPDATE_ALL;

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
   * 顶点签名。
   */
  get semantic(): string {
    return this._semantic;
  }

  /**
   * 是否归一化
   */
  get normalized(): boolean {
    return this._normalized;
  }

  /**
   * instanced
   */
  get instanced(): number {
    return this._instanced;
  }

  get elementInfo() {
    return getElementInfo(this.format);
  }

  /**
   * 构造顶点元素。
   * @param usage - 顶点着色器输入签名。
   * @param offset - 顶点的偏移，以字节为单位
   * @param format - 顶点元素格式
   */
  constructor(
    semantic: string,
    offset: number = 0,
    format: VertexElementFormat,
    instanced: number = 0,
    normalized: boolean = false
  ) {
    this._semantic = semantic;
    this._offset = offset;
    this._format = format;
    this._normalized = normalized;
    this._instanced = instanced;
  }
}
