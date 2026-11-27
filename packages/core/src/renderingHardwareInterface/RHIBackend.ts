/** Active graphics backend implemented by an {@link IHardwareRenderer}. */
export enum RHIBackend {
  /** WebGL2 graphics backend. */
  WebGL2 = "webgl2",
  /** WebGPU graphics backend. */
  WebGPU = "webgpu",
  /** Headless null graphics backend with no GPU context. */
  Null = "null"
}
