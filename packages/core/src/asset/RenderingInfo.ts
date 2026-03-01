/**
 * Rendering statistics.
 */
export class RenderingInfo {
  /** @internal */
  _textureMemory: number = 0;
  /** @internal */
  _bufferMemory: number = 0;

  /**
   * Memory used by all textures, in bytes.
   */
  get textureMemory(): number {
    return this._textureMemory;
  }

  /**
   * Memory used by all buffers, in bytes.
   */
  get bufferMemory(): number {
    return this._bufferMemory;
  }

  /**
   * Total memory used, in bytes.
   */
  get totalMemory(): number {
    return this._textureMemory + this._bufferMemory;
  }

  /**
   * @internal
   */
  _reset(): void {
    this._textureMemory = 0;
    this._bufferMemory = 0;
  }
}
