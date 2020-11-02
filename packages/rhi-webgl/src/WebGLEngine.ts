import { Engine } from "@oasis-engine/core";
import { WebCanvas } from "./WebCanvas";
import { WebGLRenderer, WebGLRendererOptions } from "./WebGLRenderer";

/**
 * WebGL 平台引擎，渲染器包含 WebGL1.0 和 WebGL2.0。
 */
export class WebGLEngine extends Engine {
  /**
   * 创建适用于 WebGL 平台的引擎。
   * @param canvas - Web 画布
   * @param webGLRendererOptions - WebGL渲染器参数
   */
  constructor(canvas: string | HTMLCanvasElement | OffscreenCanvas, webGLRendererOptions?: WebGLRendererOptions) {
    const webCanvas = new WebCanvas(
      <HTMLCanvasElement | OffscreenCanvas>(typeof canvas === "string" ? document.getElementById(canvas) : canvas)
    );
    const hardwareRenderer = new WebGLRenderer(webGLRendererOptions);

    super(webCanvas, hardwareRenderer);
  }

  /**
   * Web 画布。
   */
  get canvas(): WebCanvas {
    return this._canvas as WebCanvas;
  }
}
