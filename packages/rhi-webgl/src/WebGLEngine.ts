import { Engine } from "@galacean/engine-core";
import { WebCanvas } from "./WebCanvas";
import { WebGLRenderer, WebGLRendererOptions } from "./WebGLRenderer";

type OffscreenCanvas = any;

/**
 * WebGL platform engine,support includes WebGL1.0 and WebGL2.0.
 */
export class WebGLEngine extends Engine {
  /**
   * Create an engine suitable for the WebGL platform.
   * @param canvas - Native web canvas
   * @param webGLRendererOptions - WebGL renderer options
   */
  constructor(canvas: string | HTMLCanvasElement | OffscreenCanvas, webGLRendererOptions?: WebGLRendererOptions) {
    const webCanvas = new WebCanvas(
      <HTMLCanvasElement | OffscreenCanvas>(typeof canvas === "string" ? document.getElementById(canvas) : canvas)
    );
    const hardwareRenderer = new WebGLRenderer(webGLRendererOptions);
    super(webCanvas, hardwareRenderer);
  }

  /**
   * Web canvas.
   */
  get canvas(): WebCanvas {
    return this._canvas as WebCanvas;
  }
}
