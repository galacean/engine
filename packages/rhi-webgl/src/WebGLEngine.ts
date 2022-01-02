import { Engine } from "@oasis-engine/core";
import { WebCanvas } from "./WebCanvas";
import { WebGLRenderer, WebGLRendererOptions } from "./WebGLRenderer";

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
    // TODO:实例化图形API，抽离图形API，方便适配不同的图形API接口
    const hardwareRenderer = new WebGLRenderer(webGLRendererOptions);
    // TODO: 实例化Engin
    super(webCanvas, hardwareRenderer);
  }

  /**
   * Web canvas.
   */
  get canvas(): WebCanvas {
    //TODO: 经过包裹的Canvas 实现了 width height scale接口
    return this._canvas as WebCanvas;
  }
}
