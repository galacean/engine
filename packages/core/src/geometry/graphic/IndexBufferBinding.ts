import { IndexFormat } from "./enums/IndexFormat";
import { IndexBuffer } from "./IndexBuffer";

/**
 * 索引缓冲绑定。
 */
export class IndexBufferBinding {
  /** @internal */
  _buffer: IndexBuffer;
  /** @internal */
  _format: IndexFormat;

  /**
   * 索引缓冲。
   */
  get buffer(): IndexBuffer {
    return this._buffer;
  }

  /**
   * 索引格式。
   */
  get format(): IndexFormat {
    return this._format;
  }

  /**
   * 创建索引缓冲绑定。
   * @param buffer - 索引缓冲
   * @param format - 索引格式
   */
  constructor(buffer: IndexBuffer, format: IndexFormat) {
    this._buffer = buffer;
    this._format = format;
  }
}
