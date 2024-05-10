import { Entity } from "../Entity";
import { Renderer } from "../Renderer";

export class UIRenderer extends Renderer {
  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    // const componentsManager = this.scene._componentsManager;
    // if (this._overrideUpdate) {
    //   componentsManager.addOnUpdateRenderers(this);
    // }
    // componentsManager.addRenderer(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    // const componentsManager = this.scene._componentsManager;
    // if (this._overrideUpdate) {
    //   componentsManager.removeOnUpdateRenderers(this);
    // }
    // componentsManager.removeRenderer(this);
  }
}
