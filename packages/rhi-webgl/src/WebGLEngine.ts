import { Engine, type EngineConfiguration, Scene } from "@galacean/engine-core";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";
import type { WebGLGraphicDeviceOptions } from "./WebGLGraphicDevice";
import { WebCanvas } from "./WebCanvas";

/**
 * WebGL platform engine, supports WebGL 1.0 and WebGL 2.0.
 */
export class WebGLEngine extends Engine {
  /**
   * Create a WebGL engine.
   * @param configuration - WebGL engine configuration
   * @returns A promise that will resolve when the engine is created
   */
  static create(configuration: WebGLEngineConfiguration): Promise<WebGLEngine> {
    try {
      const canvas = configuration.canvas;
      const webCanvas = new WebCanvas(typeof canvas === "string" ? document.getElementById(canvas) : canvas);
      const device = new WebGLGraphicDevice(configuration.graphicDeviceOptions);
      const gl = device._getWebGL2Context(webCanvas);
      if (gl?.deleteQuery) {
        device._setContext(webCanvas._webCanvas, gl);
        return WebGLEngine._createWithContext(webCanvas, device, configuration);
      }
      return import("@galacean/engine-webgl1-polyfill").then(
        ({ installWebGL1 }) => {
          installWebGL1(device, webCanvas);
          return WebGLEngine._createWithContext(webCanvas, device, configuration);
        },
        (cause: unknown) => {
          throw new Error("Could not load renderer fallback.", { cause });
        }
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private static _createWithContext(
    canvas: WebCanvas,
    device: WebGLGraphicDevice,
    configuration: WebGLEngineConfiguration
  ): Promise<WebGLEngine> {
    let engine: WebGLEngine | undefined;
    try {
      const created = (engine = new WebGLEngine(canvas, device, configuration));
      canvas.setAutoResolution();
      return created
        ._initialize(configuration)
        .then(() => {
          created.sceneManager.addScene(new Scene(created, "DefaultScene"));
          return created;
        })
        .catch((error) => {
          created.destroy();
          throw error;
        });
    } catch (error) {
      if (engine) {
        engine.destroy();
      } else {
        device.destroy();
      }
      return Promise.reject(error);
    }
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
