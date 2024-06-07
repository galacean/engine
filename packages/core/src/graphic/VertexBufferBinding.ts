import { Buffer } from "./Buffer";

/**
 * Vertex buffer binding.
 */
export class VertexBufferBinding {
  /** @internal */
  _buffer: Buffer;
  /** @internal */
  _stride: number;
  /** @internal */
  _offset: number;
  /** @internal */
  _size: number;

  /**
   * Vertex buffer.
   */
  get buffer(): Buffer {
    return this._buffer;
  }

  /**
   * Vertex buffer stride.
   */
  get stride(): number {
    return this._stride;
  }

  /**
   * Vertex start offset of buffer.
   */
  get offset(): number {
    return this._offset;
  }

  /**
   * Vertex size. (in Float32)
   */
  get size(): number {
    return this._size;
  }

  /**
   * Create vertex buffer.
   * @param buffer - Vertex buffer
   * @param stride - Vertex buffer stride
   * @param offset - Vertex start offset of buffer
   * @param size - Vertex size
   */
  constructor(buffer: Buffer, stride: number, offset: number = 0, size: number = 0) {
    this._buffer = buffer;
    this._stride = stride;
    this._offset = offset;
    this._size = size;
  }
}
