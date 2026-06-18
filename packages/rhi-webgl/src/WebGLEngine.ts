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
    // @ts-ignore
    const promise = engine._initialize(configuration) as Promise<WebGLEngine>;
    return promise.then(() => {
      engine.sceneManager.addScene(new Scene(engine, "DefaultScene"));
      return engine;
    });
  }

  /**
   * Web canvas.
   */
  override get canvas(): WebCanvas {
    // @ts-ignore
    return this._canvas as WebCanvas;
  }

  private _resizeObserver?: ResizeObserver;

  private static _cleanupResizeObserver(engine: WebGLEngine): void {
    if (engine._resizeObserver) {
      engine._resizeObserver.disconnect();
      engine._resizeObserver = undefined;
    }
  }

  /**
   * Enable automatic canvas resizing via ResizeObserver.
   * @param pixelRatio - Optional custom pixel ratio; falls back to device pixel ratio if omitted
   */
  enableAutoResize(pixelRatio?: number): void {
    const webCanvas = this.canvas._webCanvas;

    if (!this.canvas.isOffscreenCanvas()) {
      if (!this._resizeObserver) {
        this.once(EngineEventType.Shutdown, WebGLEngine._cleanupResizeObserver);
      }

      // Disconnect previous observer to avoid duplicate observation
      this._resizeObserver?.disconnect();

      // Always create a new ResizeObserver to capture the latest pixelRatio parameter,
      // avoiding stale closure values when enableAutoResize is called again.
      this._resizeObserver = new ResizeObserver(() => {
        this.canvas.resizeByClientSize(pixelRatio);
      });

      // Start observing the canvas element for size changes.
      // Note: ResizeObserver callbacks fire after the current frame's rAF,
      // so the canvas resize only takes effect in the following frame.
      // The current frame may render with stale dimensions (e.g. a flash of
      // incorrect sizing / blank area), and will recover on the next frame.
      this._resizeObserver.observe(webCanvas);
    }
  }

  /**
   * Disable automatic canvas resizing and clean up the observer.
   */
  disableAutoResize(): void {
    if (this._resizeObserver) {
      this.off(EngineEventType.Shutdown, WebGLEngine._cleanupResizeObserver);
      WebGLEngine._cleanupResizeObserver(this);
    }
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
}
