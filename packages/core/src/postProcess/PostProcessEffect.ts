import { RenderContext } from "../RenderPipeline/RenderContext";

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

  abstract onRender(context: RenderContext): void;
}
