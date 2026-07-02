import { Engine, EngineConfiguration, EngineEventType, Scene } from "@galacean/engine-core";
import { WebGLGraphicDevice, WebGLGraphicDeviceOptions } from "./";
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
    const canvas = configuration.canvas;
    const webCanvas = new WebCanvas(typeof canvas === "string" ? document.getElementById(canvas) : canvas);
    const webGLGraphicDevice = new WebGLGraphicDevice(configuration.graphicDeviceOptions);
    const engine = new WebGLEngine(webCanvas, webGLGraphicDevice, configuration);
    engine.once(EngineEventType.Shutdown, WebGLEngine._releaseCanvas);
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

  // Core Engine never destroys the canvas; the platform engine owns teardown.
  private static _releaseCanvas(engine: WebGLEngine): void {
    engine.canvas._destroy();
  }

  /**
   * The canvas the engine renders to; call `setResolution()` or `setAutoResolution()` on it to control
   * the render-buffer resolution.
   */
  override get canvas(): WebCanvas {
    // @ts-ignore
    return this._canvas as WebCanvas;
  }

  /**
   * Enable automatic canvas resizing.
   * @deprecated Use `engine.canvas.setAutoResolution()` instead.
   * @param pixelRatio - Ignored; the device pixel ratio is applied automatically. For a custom multiplier
   * on top of it, use `engine.canvas.setAutoResolution(scale)`
   */
  enableAutoResize(pixelRatio?: number): void {
    this.canvas.setAutoResolution();
  }

  /**
   * Lock the render buffer at its current size; it stops following the display size.
   * @deprecated Use `engine.canvas.setResolution(width, height)` to lock a fixed resolution instead.
   */
  disableAutoResize(): void {
    const canvas = this.canvas;
    canvas.setResolution(canvas.width, canvas.height);
  }

  override update(): void {
    // Must run before super.update() — see Canvas._pumpPendingResize for why.
    this.canvas._pumpPendingResize();
    super.update();
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
  /** Whether the render buffer automatically follows the canvas display size. Defaults to `true`. */
  autoResize?: boolean;
}
