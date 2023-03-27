import { Camera } from "../Camera";
import { Entity } from "../Entity";
import { RenderTarget } from "../texture";

export class XRCamera extends Camera {
  constructor(entity: Entity) {
    super(entity);
  }

  setSession(session: XRSession): void {
    this.renderTarget = new RenderTarget(this.engine);
  }
}
