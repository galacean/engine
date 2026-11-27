import { RHIBackend, type WebGLGraphicDevice } from "@galacean/engine";
import { IXRDevice } from "@galacean/engine-design";
import { XRFeatureType, XRSessionMode } from "@galacean/engine-xr";
import { parseXRMode } from "./Util";
import { getXRGPUBinding, type XRProjectionDevice } from "./WebXRProjection";
import { WebXRSession } from "./WebXRSession";
import { WebXRFeature } from "./feature/WebXRFeature";

export class WebXRDevice implements IXRDevice {
  /** @internal */
  static _platformFeatureMap: PlatformFeatureConstructor[] = [];

  isSupportedSessionMode(mode: XRSessionMode): Promise<void> {
    return new Promise((resolve, reject: (reason: Error) => void) => {
      if (!window.isSecureContext) {
        reject(new Error("WebXR is available only in secure contexts (HTTPS)."));
        return;
      }
      if (!navigator.xr) {
        reject(new Error("WebXR isn't available"));
        return;
      }
      navigator.xr.isSessionSupported(parseXRMode(mode)!).then((isSupported: boolean) => {
        isSupported ? resolve() : reject(new Error("The current context doesn't support WebXR."));
      });
    });
  }

  isSupportedFeature(type: XRFeatureType): boolean {
    switch (type) {
      case XRFeatureType.HitTest:
      case XRFeatureType.PlaneTracking:
        return typeof XRPlane !== "undefined";
      case XRFeatureType.AnchorTracking:
        return typeof XRAnchor !== "undefined";
      case XRFeatureType.ImageTracking:
        // @ts-ignore
        return typeof XRImageTrackingResult !== "undefined";
      default:
        return false;
    }
  }

  createPlatformFeature(type: XRFeatureType, ...args: any[]): WebXRFeature | null {
    const platformFeatureConstructor = WebXRDevice._platformFeatureMap[type];
    return platformFeatureConstructor ? new platformFeatureConstructor(...args) : null;
  }

  requestSession(
    graphicsDevice: unknown,
    mode: XRSessionMode,
    platformFeatures: WebXRFeature[]
  ): Promise<WebXRSession> {
    const rhi = graphicsDevice as WebGLGraphicDevice | XRProjectionDevice | null;
    const gpu = rhi?.backend === RHIBackend.WebGPU;
    const Binding = getXRGPUBinding();
    if (gpu && !Binding)
      return Promise.reject(new Error("WebXR with WebGPU requires browser support for XRGPUBinding."));
    if (!rhi || (!gpu && rhi.backend !== RHIBackend.WebGL2))
      return Promise.reject(new Error("WebXR requires a WebGL2 or WebGPU graphics device."));
    const options: XRSessionInit = { requiredFeatures: gpu ? ["local", "webgpu"] : ["local"], optionalFeatures: [] };
    const featuresReady = new Promise<void[]>((resolve) => {
      resolve(Promise.all(platformFeatures.map((feature) => feature._assembleOptions(options))));
    });
    return featuresReady
      .then(() =>
        navigator.xr!.requestSession(parseXRMode(mode)!, options).catch((error) => {
          if (gpu && error?.name === "NotSupportedError")
            throw new Error("The XR runtime does not support the required WebGPU session feature.");
          throw error;
        })
      )
      .then((session) =>
        Promise.resolve()
          .then(() => this._createSession(rhi, session, Binding))
          .catch((error) =>
            session
              .end()
              .catch(() => {})
              .then(() => {
                throw error;
              })
          )
      );
  }

  private _createSession(
    rhi: WebGLGraphicDevice | XRProjectionDevice,
    session: XRSession,
    Binding: ReturnType<typeof getXRGPUBinding>
  ): Promise<WebXRSession> {
    if (rhi.backend === RHIBackend.WebGPU) {
      const binding = new Binding!(session, rhi.device);
      const { depth, stencil } = rhi._options;
      const layer = binding.createProjectionLayer({
        colorFormat: binding.getPreferredColorFormat(),
        depthStencilFormat: stencil ? "depth24plus-stencil8" : depth ? "depth24plus" : undefined,
        // RENDER_ATTACHMENT | TEXTURE_BINDING | COPY_SRC allows overlay and opaque-copy passes to read the eye.
        textureUsage: 0x10 | 0x04 | 0x01
      });
      session.updateRenderState({ layers: [layer] });
      return session
        .requestReferenceSpace("local")
        .then((space) => new WebXRSession(rhi, session, layer, space, binding));
    }
    const { gl } = rhi;
    const attributes = gl.getContextAttributes();
    if (!attributes) throw new Error("WebXR could not access the WebGL2 context attributes.");
    return gl.makeXRCompatible().then(() => {
      let layer: XRWebGLLayer;
      if (session.renderState.layers === undefined) {
        layer = new XRWebGLLayer(session, gl, {
          antialias: attributes.antialias,
          alpha: true,
          depth: attributes.depth,
          stencil: attributes.stencil,
          framebufferScaleFactor: XRWebGLLayer.getNativeFramebufferScaleFactor(session)
        });
        session.updateRenderState({ baseLayer: layer });
      } else {
        layer = new XRWebGLLayer(session, gl);
        session.updateRenderState({ layers: [layer] });
      }
      return session.requestReferenceSpace("local").then((space) => new WebXRSession(rhi, session, layer, space));
    });
  }
}

type PlatformFeatureConstructor = new (...args: any[]) => WebXRFeature;
export function registerXRPlatformFeature(type: XRFeatureType) {
  return (platformFeatureConstructor: PlatformFeatureConstructor) => {
    WebXRDevice._platformFeatureMap[type] = platformFeatureConstructor;
  };
}
