import { Engine } from "../Engine";
import { RefResource } from "./RefResource";

export class GraphicsResource extends RefResource {
  protected constructor(engine: Engine) {
    super(engine);
    engine.resourceManager._addGraphicResource(this.instanceId, this);
  }
  protected _onDestroy(): void {
    throw new Error("Method not implemented.");
  }
}
