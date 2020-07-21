import { Engine } from "@alipay/o3-core";
import { WebCanvas } from "./WebCanvas";
import { WebGLRenderer, WebGLRendererOptions } from "./WebGLRenderer";

/**
 * Web 端引擎
 */
export class WebEngine extends Engine {
  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, webGLRendererOptions?: WebGLRendererOptions) {
    const webCanvas = new WebCanvas(canvas);
    const hardwareRenderer = new WebGLRenderer(webGLRendererOptions);

    super(webCanvas, hardwareRenderer);
  }
}
