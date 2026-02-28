import { EngineObject } from "../base/EngineObject";

/**
 * JSON asset for storing parsed JSON data.
 */
export class JSONAsset extends EngineObject {
  /** The parsed JSON data. */
  data: Object;

  protected override _onDestroy(): void {
    super._onDestroy();
    this.data = null;
  }
}
