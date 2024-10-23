import { Material } from "../material/Material";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Texture2D } from "../texture";
import { PostProcess } from "./PostProcess";

/**
 * The base class for post process effect.
 */
export class PostProcessEffect {
  private _enabled: boolean = true;

  /**
   * The Uber material used to render the post process effect.
   */
  get uberMaterial(): Material {
    return this.postProcess.scene._postProcessManager._uberMaterial;
  }

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
   * Create a post process effect.
   * @param postProcess - The post process being used
   */
  constructor(public postProcess: PostProcess) {}

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
   */
  onRender(context: RenderContext, srcTexture: Texture2D): void {}
}
