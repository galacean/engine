import { Engine } from "../Engine";
import { RebuildInfo } from "./RebuildInfo";
import { ReferResource } from "./ReferResource";

export abstract class GraphicsResource extends ReferResource {
  /** @internal */
  _rebuildInfo: RebuildInfo;

  protected constructor(engine: Engine) {
    super(engine);
    engine.resourceManager._addGraphicResource(this.instanceId, this);
  }

  /**
   * @internal
   */
  _rebuild(): void {}

  // destroy(force: boolean = false): boolean {
  //   const success= super.destroy(force);
  //   return success;
  // }
}
