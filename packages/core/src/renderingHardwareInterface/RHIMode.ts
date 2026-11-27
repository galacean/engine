/** Rendering backend preference used when starting a web application. */
export enum RHIMode {
  /** Prefer WebGPU and allow WebGL2 fallback. */
  Auto = "auto",
  /** Select the WebGL2 backend. */
  WebGL2 = "webgl2",
  /** Select the WebGPU backend. */
  WebGPU = "webgpu"
}
