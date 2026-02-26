import { EngineObject } from "../base/EngineObject";

/**
 * Text asset for storing plain text data.
 */
export class TextAsset extends EngineObject {
  /** The text content. */
  text: string;

  protected override _onDestroy(): void {
    super._onDestroy();
    this.text = null;
  }
}
