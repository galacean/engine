import { IHardwareRenderer, IXRDevice } from "@galacean/engine-design";
import { XRFeatureType, XRSessionMode } from "@galacean/engine-xr";
import { parseXRMode } from "./Util";
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
      navigator.xr.isSessionSupported(parseXRMode(mode)).then((isSupported: boolean) => {
        isSupported ? resolve() : reject(new Error("The current context doesn't support WebXR."));
      });
    });
  }

  isSupportedFeature(type: XRFeatureType): boolean {
    switch (type) {
      case XRFeatureType.HitTest:
      case XRFeatureType.PlaneTracking:
        // @ts-ignore
        return !!window.XRPlane;
      case XRFeatureType.AnchorTracking:
        // @ts-ignore
        return !!window.XRAnchor;
      case XRFeatureType.ImageTracking:
        // @ts-ignore
        return !!window.XRImageTrackingResult;
    }
  }

  createPlatformFeature(type: XRFeatureType, ...args: any[]): WebXRFeature {
    const platformFeatureConstructor = WebXRDevice._platformFeatureMap[type];
    return platformFeatureConstructor ? new platformFeatureConstructor(...args) : null;
  }

  requestSession(rhi: IHardwareRenderer, mode: XRSessionMode, platformFeatures: WebXRFeature[]): Promise<WebXRSession> {
    return new Promise((resolve, reject) => {
      const sessionMode = parseXRMode(mode);
      const options: XRSessionInit = { requiredFeatures: ["local"] };
      const promiseArr = [];
      for (let i = 0, n = platformFeatures.length; i < n; i++) {
        const promise = platformFeatures[i]._assembleOptions(options);
        promise && promiseArr.push(promise);
      }
      Promise.all(promiseArr).then(() => {
        navigator.xr.requestSession(sessionMode, options).then((session) => {
          const { gl } = rhi;
          const attributes = gl.getContextAttributes();
          if (!attributes) {
            reject(Error("GetContextAttributes Error!"));
          }
          gl.makeXRCompatible().then(() => {
            const scaleFactor = XRWebGLLayer.getNativeFramebufferScaleFactor(session);
            let layer: XRWebGLLayer;
            if (session.renderState.layers === undefined || !!!rhi.isWebGL2) {
              const layerInit = {
                antialias: session.renderState.layers === undefined ? attributes.antialias : true,
                alpha: true,
                depth: attributes.depth,
                stencil: attributes.stencil,
                framebufferScaleFactor: scaleFactor
              };
              layer = new XRWebGLLayer(session, gl, layerInit);
              session.updateRenderState({
                baseLayer: layer
              });
            } else {
              layer = new XRWebGLLayer(session, gl);
              session.updateRenderState({
                layers: [layer]
              });
            }
            session.requestReferenceSpace("local").then((referenceSpace: XRReferenceSpace) => {
              resolve(new WebXRSession(session, layer, referenceSpace));
            }, reject);
          }, reject);
        }, reject);
      }, reject);
    });
  }
}

type PlatformFeatureConstructor = new (...args: any[]) => WebXRFeature;
export function registerXRPlatformFeature(type: XRFeatureType) {
  return (platformFeatureConstructor: PlatformFeatureConstructor) => {
    WebXRDevice._platformFeatureMap[type] = platformFeatureConstructor;
  };
}
