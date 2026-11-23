/// <reference types="@webgpu/types" />
// @ts-check

// Both web distribution entries bundle this module without importing the other backend.
/** @satisfies {import("@galacean/engine-core").EngineGraphicsCapabilities} */
export const graphicsCapabilities = {
  /** Probe a temporary WebGL2 context without binding an application's canvas. */
  isWebGL2Supported() {
    try {
      /** @type {WebGL2RenderingContext | null} */
      let gl;
      if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        gl =
          canvas.getContext("webgl2") ??
          /** @type {WebGL2RenderingContext | null} */ (canvas.getContext("experimental-webgl2"));
      } else if (typeof OffscreenCanvas !== "undefined") {
        gl = new OffscreenCanvas(1, 1).getContext("webgl2");
      } else {
        return false;
      }
      if (!gl) return false;
      const supported = typeof gl.deleteQuery === "function";
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return supported;
    } catch {
      return false;
    }
  },

  /** Query for a WebGPU adapter without allocating a device or binding a canvas. */
  async isWebGPUSupported() {
    try {
      const adapter = await globalThis.navigator?.gpu?.requestAdapter({ xrCompatible: "XRGPUBinding" in globalThis });
      return !!adapter;
    } catch {
      return false;
    }
  }
};
