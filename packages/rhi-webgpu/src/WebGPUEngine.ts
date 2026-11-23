import { Engine, EngineConfiguration, WebCanvas } from "@galacean/engine-core";
import { WebGPUGraphicDevice, WebGPUGraphicDeviceOptions } from "./WebGPUGraphicDevice";

export interface WebGPUEngineConfiguration extends EngineConfiguration {
  canvas: HTMLCanvasElement | OffscreenCanvas | string;
  graphicDeviceOptions?: WebGPUGraphicDeviceOptions;
}

/** Engine running on the browser's native WebGPU device. */
export class WebGPUEngine extends Engine {
  static create(configuration: WebGPUEngineConfiguration): Promise<WebGPUEngine> {
    let device: WebGPUGraphicDevice | undefined;
    let engine: WebGPUEngine | undefined;
    return new Promise<WebGPUEngine>((resolve) => {
      const native = configuration.canvas;
      const canvas = new WebCanvas(typeof native === "string" ? document.getElementById(native) : native);
      resolve(
        WebGPUGraphicDevice.create(canvas, configuration.graphicDeviceOptions).then((hardware) => {
          device = hardware;
          return this._prepareConfiguration(configuration).then((options) => {
            engine = new this(canvas, hardware, options);
            canvas.setAutoResolution();
            return engine._initialize(options);
          });
        })
      );
    }).catch((error) => {
      if (engine) engine.destroy();
      else device?.destroy();
      throw error;
    });
  }

  /** @internal Flavors supply their shader tools before engine initialization. */
  protected static _prepareConfiguration(configuration: WebGPUEngineConfiguration): Promise<WebGPUEngineConfiguration> {
    return Promise.resolve(configuration);
  }

  override get canvas(): WebCanvas {
    return this._canvas as WebCanvas;
  }
}
