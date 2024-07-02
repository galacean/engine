import { RenderContext } from "../RenderPipeline/RenderContext";
import { RenderTarget, Texture2D } from "../texture";

export abstract class PostProcessEffect {
  private _enabled = true;

  /**
   * Indicates whether the post process effect is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
  }

  constructor(public readonly engine) {}

  abstract onRender(context: RenderContext, srcTexture: Texture2D, destRenderTarget: RenderTarget): void;
}
