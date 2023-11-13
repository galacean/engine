import { IXRFrame } from "./IXRFrame";
import { IXRInputEvent } from "./IXRInputEvent";

export interface IXRSession {
  fixedFoveation: number;
  get frame(): IXRFrame;
  get frameRate(): number;
  get supportedFrameRates(): Float32Array;
  get framebuffer(): WebGLFramebuffer;
  get framebufferWidth(): number;
  get framebufferHeight(): number;

  addEventListener(): void;
  removeEventListener(): void;
  getEvents(): IXRInputEvent[];
  resetEvents(): void;

  /**
   * Removes a callback from the animation frame painting callback from
   * XRSession's set of animation frame rendering callbacks, given the
   * identifying handle returned by a previous call to requestAnimationFrame().
   */
  cancelAnimationFrame(id: number): void;

  /**
   * Ends the xr session. Returns a promise which resolves when the
   * session has been start.
   */
  start(): Promise<void>;

  /**
   * Ends the xr session. Returns a promise which resolves when the
   * session has been start.
   */
  stop(): Promise<void>;

  /**
   * Ends the xr session. Returns a promise which resolves when the
   * session has been shut down.
   */
  end(): Promise<void>;

  /**
   * Schedules the specified method to be called the next time the user agent
   * is working on rendering an animation frame for the WebXR device. Returns an
   * integer value which can be used to identify the request for the purposes of
   * canceling the callback using cancelAnimationFrame(). This method is comparable
   * to the Window.requestAnimationFrame() method.
   */
  requestAnimationFrame(callback: FrameRequestCallback): number;
}
