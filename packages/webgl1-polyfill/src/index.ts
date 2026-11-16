import "./overrides";
import { bindOverrides, type Bindings, type Registry } from "@/override";
import type { WebCanvas, WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";

/**
 * Bind the polyfill to the engine classes supplied by the caller.
 * @param bindings - Classes used by the calling engine build
 * @param registry - Shared installation state for the CDN output
 * @returns A function that prepares a device with its WebGL1 context
 */
export function bind(bindings: Bindings, registry?: Registry): (device: WebGLGraphicDevice, canvas: WebCanvas) => void {
  let registerDevice: ((device: WebGLGraphicDevice) => void) | undefined;

  return (device, canvas) => {
    const nativeCanvas = canvas._webCanvas;
    const gl =
      nativeCanvas.getContext("webgl", device["_webGLOptions"]) ||
      (!canvas._isOffscreenCanvas() && nativeCanvas.getContext("experimental-webgl", device["_webGLOptions"]));
    if (!gl) throw new Error("Get GL Context FAILED.");
    registerDevice ??= bindOverrides(bindings, registry);
    device._setContext(nativeCanvas, gl as WebGL2RenderingContext, false);
    registerDevice(device);
    bindings.Logger.warn("WebGL1 compatibility mode enabled.");
  };
}
