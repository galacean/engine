import { VertexBuffer } from "./VertexBuffer";

/**
 * 顶点缓冲绑定。
 */
export class VertexBufferBinding {
  /** 顶点缓冲。*/
  buffer: VertexBuffer;
  /** 顶点跨度。 */
  stride: number;

  /**
   * 创建顶点缓冲绑定。
   * @param buffer - 顶点缓冲
   * @param stride - 顶点跨度
   */
  constructor(buffer: VertexBuffer, stride: number) {
    this.buffer = buffer;
    this.stride = stride;
  }
}
