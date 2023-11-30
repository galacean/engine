import { IXRFrame } from "./IXRFrame";
import { IXRInputEvent } from "./IXRInputEvent";

/**
 * The base interface of XR session.
 * Can be understood as an XR context.
 */
export interface IXRSession {
  /**
   * Fixed foveation for XR.
   */
  fixedFoveation: number;

  /**
   * Returns the XR information of this frame.
   */
  get frame(): IXRFrame;

  /**
   * Return the event received in this frame.
   */
  get events(): IXRInputEvent[];

  /**
   * Returns the current frame rate.
   */
  get frameRate(): number;

  /**
   * Returns the frame rate supported by the device.
   */
  get supportedFrameRates(): Float32Array;

  /**
   * Returns the device's default main framebuffer.
   */
  get framebuffer(): WebGLFramebuffer;

  /**
   * Returns the width of the device's default main framebuffer.
   */
  get framebufferWidth(): number;

  /**
   * Returns the height of the device's default main framebuffer.
   */
  get framebufferHeight(): number;

  /**
   * Add event listener for XR session.
   */
  addEventListener(): void;

  /**
   * Remove event listener for XR session.
   */
  removeEventListener(): void;

  /**
   * Add unexpected exit event listener for XR session.
   */
  addUnexpectedExitListener(): void;

  /**
   * Reset event flow.
   */
  resetEvents(): void;

  /**
   * Ends the xr session. Returns a promise which resolves when the
   * session has been start.
   */
  start(): void;

  /**
   * Ends the xr session. Returns a promise which resolves when the
   * session has been start.
   */
  stop(): void;

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

  /**
   * Removes a callback from the animation frame painting callback from
   * XRSession's set of animation frame rendering callbacks, given the
   * identifying handle returned by a previous call to requestAnimationFrame().
   */
  cancelAnimationFrame(id: number): void;
}
