import { Engine } from "../Engine";
import { ReferenceResource } from "./ReferenceResource";

export abstract class GraphicsResource extends ReferenceResource {
  protected constructor(engine: Engine) {
    super(engine);
    engine.resourceManager._addGraphicResource(this.instanceId, this);
  }

  // destroy(force: boolean = false): boolean {
  //   const success= super.destroy(force);
  //   return success;
  // }
}
