import { Material } from "../material/Material";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Texture2D } from "../texture";

/**
 * The base class for post process effect.
 */
export class PostProcessEffect {
  private _enabled: boolean = true;

  /**
   * Indicates whether the post process effect is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;

      if (value) {
        this.onEnable();
      } else {
        this.onDisable();
      }
    }
  }

  /**
   * Called when be enabled.
   */
  onEnable(): void {}

  /**
   * Called when be disabled.
   */
  onDisable(): void {}

  /**
   * Called when the post process effect is rendered.
   * @param context - The render context
   * @param srcTexture - The source texture from last render target
   * @param blitMaterial - The material used to render the post process effect
   */
  onRender(context: RenderContext, srcTexture: Texture2D, blitMaterial: Material): void {}
}
