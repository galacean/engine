import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
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
  override _prepareRender(context: RenderContext): void {}

  // /**
  //  * @internal
  //  */
  // protected override _render(context: RenderContext): void {
  //   console.log(`render ui ${this.entity.name}`);
  // }

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
