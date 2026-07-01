import { Engine, EngineConfiguration, EngineEventType, Scene } from "@galacean/engine-core";
import { WebGLGraphicDevice, WebGLGraphicDeviceOptions } from "./";
import { WebCanvas } from "./WebCanvas";

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
    const webGLGraphicDevice = new WebGLGraphicDevice(configuration.graphicDeviceOptions);
    const engine = new WebGLEngine(webCanvas, webGLGraphicDevice, configuration);
    // Release the canvas resize observer when the engine shuts down.
    engine.once(EngineEventType.Shutdown, WebGLEngine._releaseCanvas);
    // Follow the display size by default; the first resize is deferred to update() and skipped while
    // the canvas has no layout size, so an unmounted canvas never gets a 0x0 buffer.
    if (configuration.autoResize ?? true) {
      webCanvas.setAutoResolution();
    }
    // @ts-ignore
    const promise = engine._initialize(configuration) as Promise<WebGLEngine>;
    return promise.then(() => {
      engine.sceneManager.addScene(new Scene(engine, "DefaultScene"));
      return engine;
    });
  }

  private static _releaseCanvas(engine: WebGLEngine): void {
    engine.canvas._destroy();
  }

  /**
   * Web canvas.
   */
  override get canvas(): WebCanvas {
    // @ts-ignore
    return this._canvas as WebCanvas;
  }

  /**
   * Enable automatic canvas resizing.
   * @deprecated Use `engine.canvas.setAutoResolution()` instead. Auto-resolution is a canvas capability.
   * @param pixelRatio - Deprecated; the device pixel ratio is applied automatically
   */
  enableAutoResize(pixelRatio?: number): void {
    // The old pixelRatio replaced dpr; the new model applies dpr automatically, so drop the argument.
    this.canvas.setAutoResolution();
  }

  /**
   * Disable automatic canvas resizing.
   * @deprecated Use `engine.canvas.setResolution(width, height)` to lock a fixed resolution instead.
   */
  disableAutoResize(): void {
    const canvas = this.canvas;
    canvas.setResolution(canvas.width, canvas.height);
  }

  override update(): void {
    // Apply pending resize before rendering so both land in the same frame (no white flash).
    this.canvas._pumpPendingResize();
    super.update();
  }
}

/**
 * WebGL engine configuration.
 */
export interface WebGLEngineConfiguration extends EngineConfiguration {
  /** Canvas element or canvas id. */
  canvas: HTMLCanvasElement | OffscreenCanvas | string;
  /** Graphic device options. */
  graphicDeviceOptions?: WebGLGraphicDeviceOptions;
  /** Whether the render buffer automatically follows the canvas display size. Defaults to `true`. */
  autoResize?: boolean;
}
