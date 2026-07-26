import { GraphicsResource } from "../asset/GraphicsResource";
import { Engine } from "../Engine";
import type { IPlatformBufferReadback } from "../renderingHardwareInterface";
import { Buffer } from "./Buffer";

/**
 * @internal
 */
export class BufferReadback extends GraphicsResource {
  /** Readback buffer capacity in bytes. */
  readonly byteLength: number;

  private _platformReadback: IPlatformBufferReadback;

  constructor(engine: Engine, byteLength: number) {
    super(engine);
    this.byteLength = byteLength;
    this.isGCIgnored = true;
    if (!engine._isDeviceLost) {
      this._platformReadback = this._createPlatformReadback();
    }
  }

  copyFromBuffer(srcBuffer: Buffer, srcByteOffset: number, dstByteOffset: number, byteLength: number): void {
    const platformReadback = (this._platformReadback ||= this._createPlatformReadback());
    platformReadback.copyFromBuffer(srcBuffer._platformBuffer, srcByteOffset, dstByteOffset, byteLength);
    this._isContentLost = false;
  }

  submit(): void {
    this._platformReadback.submit();
  }

  isReady(): boolean {
    return this._platformReadback?.isReady() ?? false;
  }

  getData(data: ArrayBufferView, bufferByteOffset?: number, dataOffset?: number, dataLength?: number): void {
    this._platformReadback.getData(data, bufferByteOffset, dataOffset, dataLength);
  }

  reset(): void {
    this._platformReadback?.reset();
  }

  override _rebuild(): void {
    this._platformReadback = null;
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    if (this._platformReadback && !this._engine._isDeviceLost) {
      this._engine._renderingStatistics._bufferMemory -= this.byteLength;
    }
    this._platformReadback?.destroy();
    this._platformReadback = null;
  }

  private _createPlatformReadback(): IPlatformBufferReadback {
    const readback = this._engine._hardwareRenderer.createPlatformBufferReadback(this.byteLength);
    if (!this._engine._isDeviceLost) {
      this._engine._renderingStatistics._bufferMemory += this.byteLength;
    }
    return readback;
  }
}
