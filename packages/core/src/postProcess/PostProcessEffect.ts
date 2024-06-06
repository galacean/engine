import { RenderContext } from "../RenderPipeline/RenderContext";

export class PostProcessEffect {
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

  onRender(context: RenderContext) {}
}
