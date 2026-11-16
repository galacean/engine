import "./overrides";
import { Logger } from "@galacean/engine-core";
import type { WebCanvas, WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";
import { installOverrides } from "./override";

/**
 * Prepare a device with a WebGL1 context and install its compatibility overrides.
 * @param device - Graphics device being initialized
 * @param canvas - Canvas that will own the context
 * @throws If the canvas cannot create a WebGL1 context
 */
export function installWebGL1(device: WebGLGraphicDevice, canvas: WebCanvas): void {
  const nativeCanvas = canvas._webCanvas;
  const gl =
    nativeCanvas.getContext("webgl", device["_webGLOptions"]) ||
    (!canvas._isOffscreenCanvas() && nativeCanvas.getContext("experimental-webgl", device["_webGLOptions"]));
  if (!gl) throw new Error("Get GL Context FAILED.");

  const registerDevice = installOverrides();
  device._setContext(nativeCanvas, gl as WebGL2RenderingContext, false);
  registerDevice(device);
  Logger.warn("WebGL1 compatibility mode enabled.");
}
