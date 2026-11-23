/** Platform capability queries on web engine entry points. */
export interface EngineGraphicsCapabilities {
  /** Probe a temporary WebGL2 context without binding an application's canvas. */
  isWebGL2Supported(): boolean;

  /** Query for a WebGPU adapter without allocating a device or binding a canvas. */
  isWebGPUSupported(): Promise<boolean>;
}
