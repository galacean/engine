import { Engine } from "../Engine";
import { ReferResource } from "./ReferResource";

export abstract class GraphicsResource extends ReferResource {
  protected constructor(engine: Engine) {
    super(engine);
    engine.resourceManager._addGraphicResource(this);
  }

  /**
   * @internal
   */
  abstract _rebuild(): void;

  /**
   * @override
   */
  protected _onDestroy(): void {
    super._onDestroy();
    this.engine.resourceManager._deleteGraphicResource(this);
  }
}
