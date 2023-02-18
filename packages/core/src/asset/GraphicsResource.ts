import { Engine } from "../Engine";
import { ReferResource } from "./ReferResource";

export abstract class GraphicsResource extends ReferResource {
  protected constructor(engine: Engine) {
    super(engine);
    engine.resourceManager._addGraphicResource(this.instanceId, this);
  }

  /**
   * @internal
   */
  abstract _rebuild(): void;

  // destroy(force: boolean = false): boolean {
  //   const success= super.destroy(force);
  //   return success;
  // }
}
