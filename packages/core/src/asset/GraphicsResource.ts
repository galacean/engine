import { Engine } from "../Engine";
import { ReferResource } from "./ReferResource";

export abstract class GraphicsResource extends ReferResource {
  /** @internal */
  _isContentLost: boolean = false;

  /**
   * Whether the content of the resource is lost.
   */
  get isContentLost(): boolean {
    return this._isContentLost;
  }

  protected constructor(engine: Engine) {
    super(engine);
    engine.resourceManager._addGraphicResource(this);
  }

  /**
   * @internal
   */
  abstract _rebuild(): void;

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this.engine.resourceManager._deleteGraphicResource(this);
  }
}
