import { Engine, EngineConfiguration } from "@oasis-engine/core";
import { WebCanvas } from "./WebCanvas";
import { WebGLRenderer, WebGLRendererOptions } from "./WebGLRenderer";

/**
 * WebGL platform engine,support includes WebGL1.0 and WebGL2.0.
 */
export class WebGLEngine extends Engine {
  /**
   * Create a WebGL engine.
   * @param configuration - WebGL engine configuration
   * @returns A promise that will resolve when the engine is created
   */
  static create(configuration: WebGLEngineConfiguration): Promise<WebGLEngine> {
    const canvas = configuration.canvas;
    const webCanvas = new WebCanvas(typeof canvas === "string" ? document.getElementById(canvas) : canvas);
    const webGLRenderer = new WebGLRenderer(configuration.rendererOptions);
    const engine = new WebGLEngine(webCanvas, webGLRenderer, configuration);
    return engine._initialize(configuration) as Promise<WebGLEngine>;
  }

  /**
   * Web canvas.
   */
  get canvas(): WebCanvas {
    return this._canvas as WebCanvas;
  }
}

/**
 * Engine configuration.
 */
export interface WebGLEngineConfiguration extends EngineConfiguration {
  /** Canvas element or canvas id. */
  canvas: HTMLCanvasElement | string;
  /** Renderer options. */
  rendererOptions?: WebGLRendererOptions;
}
