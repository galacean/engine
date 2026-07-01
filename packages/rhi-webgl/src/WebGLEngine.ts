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

  private _resizeObserver?: ResizeObserver;
  private _pendingResize: boolean = false;
  private _pendingResizePixelRatio?: number;

  /**
   * Web canvas.
   */
  override get canvas(): WebCanvas {
    // @ts-ignore
    return this._canvas as WebCanvas;
  }

  private static _cleanupAutoResize(engine: WebGLEngine): void {
    if (engine._resizeObserver) {
      engine._resizeObserver.disconnect();
      engine._resizeObserver = undefined;
    }
    engine._pendingResize = false;
    engine._pendingResizePixelRatio = undefined;
  }

  /**
   * Enable automatic canvas resizing via ResizeObserver.
   * @param pixelRatio - Optional custom pixel ratio; lazily reads window.devicePixelRatio on resize when omitted
   */
  enableAutoResize(pixelRatio?: number): void {
    const webCanvas = this.canvas._webCanvas;

    if (!this.canvas.isOffscreenCanvas()) {
      if (!this._resizeObserver) {
        this.once(EngineEventType.Shutdown, WebGLEngine._cleanupAutoResize);
      }

      // Disconnect previous observer to avoid duplicate observation
      this._resizeObserver?.disconnect();

      // Re-create the observer each call so the closure always captures the
      // latest pixelRatio. The actual resize is deferred to update(), keeping
      // it in the same frame as rendering to prevent a blank flash.
      // When pixelRatio is undefined, resizeByClientSize falls back to
      // window.devicePixelRatio on each invocation, naturally tracking DPR changes.
      this._resizeObserver = new ResizeObserver(() => {
        this._pendingResize = true;
        this._pendingResizePixelRatio = pixelRatio;
      });

      // Start observing the canvas element for size changes.
      this._resizeObserver.observe(webCanvas);
    }
  }

  /**
   * Disable automatic canvas resizing and clean up the observer.
   */
  disableAutoResize(): void {
    if (this._resizeObserver) {
      this.off(EngineEventType.Shutdown, WebGLEngine._cleanupAutoResize);
      WebGLEngine._cleanupAutoResize(this);
    }
  }

  /**
   * @override
   * Apply any pending canvas resize before the rendering pipeline runs,
   * ensuring that resize and render occur within the same frame to avoid white flickering.
   */
  override update(): void {
    if (this._pendingResize) {
      this.canvas.resizeByClientSize(this._pendingResizePixelRatio);
      this._pendingResize = false;
      this._pendingResizePixelRatio = undefined;
    }
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
}
