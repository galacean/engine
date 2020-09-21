import { Buffer } from "./Buffer";

/**
 * 顶点缓冲绑定。
 */
export class VertexBufferBinding {
  /** @internal */
  _buffer: Buffer;
  /** @internal */
  _stride: number;

  /**
   * 顶点缓冲。
   */
  get buffer(): Buffer {
    return this._buffer;
  }

  /**
   * 顶点跨度。
   */
  get stride(): number {
    return this._stride;
  }

  /**
   * 创建顶点缓冲绑定。
   * @param buffer - 顶点缓冲
   * @param stride - 顶点跨度
   */
  constructor(buffer: Buffer, stride: number) {
    this._buffer = buffer;
    this._stride = stride;
  }
}
