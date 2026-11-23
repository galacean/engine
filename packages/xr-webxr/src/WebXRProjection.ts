/** The WebXR WebGPU binding is still an optional browser feature. Keep the GL adapter independently usable. */
interface XRTexture {
  readonly width: number;
  readonly height: number;
}

export interface XRProjectionTarget {
  color: XRTexture;
  depthStencil?: XRTexture;
  viewDescriptor: object;
}

export interface XRProjectionDevice {
  readonly backend: "webgpu";
  readonly device: object;
  readonly _options: { depth?: boolean; stencil?: boolean };
  setExternalProjectionTarget(target: XRProjectionTarget | null): void;
}

interface XRGPUSubImage {
  readonly colorTexture: XRTexture;
  readonly depthStencilTexture: XRTexture | null;
  readonly viewport: XRViewport;
  getViewDescriptor(): object;
}

export interface WebXRGPUBinding {
  getPreferredColorFormat(): string;
  createProjectionLayer(init: {
    colorFormat: string;
    depthStencilFormat?: string;
    textureUsage: number;
  }): XRProjectionLayer;
  getViewSubImage(layer: XRProjectionLayer, view: XRView): XRGPUSubImage;
}

export function getXRGPUBinding(): (new (session: XRSession, device: object) => WebXRGPUBinding) | undefined {
  return (globalThis as { XRGPUBinding?: new (session: XRSession, device: object) => WebXRGPUBinding }).XRGPUBinding;
}
