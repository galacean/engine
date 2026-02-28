import { EngineObject } from "../base/EngineObject";

/**
 * Buffer asset for storing binary data.
 */
export class BufferAsset extends EngineObject {
  /** The binary buffer data. */
  buffer: ArrayBuffer;

  protected override _onDestroy(): void {
    super._onDestroy();
    this.buffer = null;
  }
}
