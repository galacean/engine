import { Engine } from "@oasis-engine/core";
import { Canvas2dCanvas } from "./Canvas2dCanvas";
import { CanvasRenderer } from "./CanvasRenderer";

/**
 * Canvas 2d platform engine.
 */
export class CanvasEngine extends Engine {
  /**
   * Create an engine suitable for the canvas 2d platform.
   * @param canvas - Native web canvas
   */
  constructor(canvas: string | HTMLCanvasElement | OffscreenCanvas) {
    const webCanvas = new Canvas2dCanvas(
      <HTMLCanvasElement | OffscreenCanvas>(typeof canvas === "string" ? document.getElementById(canvas) : canvas)
    );
    const hardwareRenderer = new CanvasRenderer();
    super(webCanvas, hardwareRenderer);
  }

  /**
   * Canvas 2d canvas.
   */
  get canvas(): Canvas2dCanvas {
    return this._canvas as Canvas2dCanvas;
  }

  /**
   * Whether batch 2D.
   */
  get canBatch2D(): boolean {
    return false;
  }

  /**
   * Whether support primitive.
   */
  get canSupportPrimitive(): boolean {
    return false;
  }

  get supportTintColor(): boolean {
    return false;
  }
}
