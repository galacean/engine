import { Engine } from "../Engine";
import { RefResource } from "./RefResource";

export abstract class GraphicsResource extends RefResource {
  protected constructor(engine: Engine) {
    super(engine);
    engine.resourceManager._addGraphicResource(this.instanceId, this);
  }

  // destroy(force: boolean = false): boolean {
  //   const success= super.destroy(force);
  //   return success;
  // }
}
