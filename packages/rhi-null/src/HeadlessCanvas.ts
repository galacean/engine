import { Canvas } from "@galacean/engine-core";

/** Canvas dimensions without a display or DOM input target. */
export class HeadlessCanvas extends Canvas {
  /**
   * Create a canvas with fixed dimensions.
   * @param width - Width in pixels
   * @param height - Height in pixels
   */
  constructor(width: number = 1, height: number = 1) {
    super();
    this.setResolution(width, height);
  }

  /** Keep the explicit resolution because there is no display size to follow. */
  override setAutoResolution(): void {}

  /** @internal */
  override _destroy(): void {}

  protected override _onResolutionChanged(): void {}
}
