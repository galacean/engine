import { Engine, EngineConfiguration } from "@galacean/engine-core";
import { WebGLGraphicDevice, WebGLGraphicDeviceOptions } from "./";
import { WebCanvas } from "./WebCanvas";

/**
 * WebGL platform engine, supports WebGL 2.0.
 */
export class WebGLEngine extends Engine {
  declare _hardwareRenderer: WebGLGraphicDevice;
  /**
   * Create a WebGL engine.
   * @param configuration - WebGL engine configuration
   * @returns A promise that will resolve when the engine is created
   */
  static create(configuration: WebGLEngineConfiguration): Promise<WebGLEngine> {
    const canvas = configuration.canvas;
    const webCanvas = new WebCanvas(typeof canvas === "string" ? document.getElementById(canvas) : canvas);
    const webGLGraphicDevice = new WebGLGraphicDevice(configuration.graphicDeviceOptions);
    const engine = new WebGLEngine(webCanvas, webGLGraphicDevice, configuration);
    webCanvas.setAutoResolution();
    return engine._initialize(configuration);
  }

  /**
   * The web canvas the engine renders to.
   */
  override get canvas(): WebCanvas {
    return this._canvas as WebCanvas;
  }
}

/**
 * Options for `WebGLEngine.create()`.
 */
export interface WebGLEngineConfiguration extends EngineConfiguration {
  /** Canvas element or canvas id. */
  canvas: HTMLCanvasElement | OffscreenCanvas | string;
  /** Graphic device options. */
  graphicDeviceOptions?: WebGLGraphicDeviceOptions;
}
