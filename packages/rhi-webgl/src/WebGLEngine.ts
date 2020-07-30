import { Engine } from "@alipay/o3-core";
import { WebCanvas } from "./WebCanvas";
import { WebGLRenderer, WebGLRendererOptions } from "./WebGLRenderer";

/**
 * Web 端引擎
 */
export class WebGLEngine extends Engine {
  constructor(canvas: string | HTMLCanvasElement | OffscreenCanvas, webGLRendererOptions?: WebGLRendererOptions) {
    const webCanvas = new WebCanvas(
      <HTMLCanvasElement | OffscreenCanvas>(typeof canvas === "string" ? document.getElementById(canvas) : canvas)
    );
    const hardwareRenderer = new WebGLRenderer(webGLRendererOptions);

    super(webCanvas, hardwareRenderer);
  }
}
