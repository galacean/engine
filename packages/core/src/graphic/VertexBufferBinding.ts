import { VertexBuffer } from "./VertexBuffer";

/**
 * 顶点缓冲绑定。
 */
export class VertexBufferBinding {
  /** @internal */
  _buffer: VertexBuffer;
  /** @internal */
  _stride: number;

  /**
   * 顶点缓冲。
   */
  get buffer(): VertexBuffer {
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
  constructor(buffer: VertexBuffer, stride: number) {
    this._buffer = buffer;
    this._stride = stride;
  }
}
