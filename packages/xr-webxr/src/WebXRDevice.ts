import { Engine, XRSessionType, IXRDevice, XRFeatureType } from "@galacean/engine";
import { IXRFeatureDescriptor, IXRPlatformFeature } from "@galacean/engine-design";
import { parseFeature, parseXRMode } from "./util";
import { WebXRSession } from "./WebXRSession";

type PlatformFeatureConstructor = new (engine: Engine) => IXRPlatformFeature;
export class WebXRDevice implements IXRDevice {
  // @internal
  static _platformFeatureMap: PlatformFeatureConstructor[] = [];

  isSupported(mode: XRSessionType): Promise<void> {
    return new Promise((resolve, reject: (reason: Error) => void) => {
      if (window.isSecureContext === false) {
        reject(new Error("WebXR is available only in secure contexts (HTTPS)."));
        return;
      }
      if (!navigator.xr) {
        reject(new Error("WebXR isn't available"));
        return;
      }
      const sessionMode = parseXRMode(mode);
      if (!sessionMode) {
        reject(new Error("mode must be a value from the XRMode."));
        return;
      }
      navigator.xr.isSessionSupported(sessionMode).then((isSupported: boolean) => {
        isSupported ? resolve() : reject(new Error("The current context doesn't support WebXR."));
      });
    });
  }

  createPlatformFeature(engine: Engine, type: XRFeatureType): IXRPlatformFeature {
    const platformFeatureConstructor = WebXRDevice._platformFeatureMap[type];
    return platformFeatureConstructor ? new platformFeatureConstructor(engine) : null;
  }

  requestSession(engine: Engine, mode: XRSessionType, requestFeatures: IXRFeatureDescriptor[]): Promise<WebXRSession> {
    return new Promise((resolve, reject) => {
      const sessionMode = parseXRMode(mode);
      const options: XRSessionInit = { requiredFeatures: ["local"] };
      const promiseArr = [];
      for (let i = 0, n = requestFeatures.length; i < n; i++) {
        const promise = parseFeature(requestFeatures[i], options);
        promise && promiseArr.push(promise);
      }
      Promise.all(promiseArr).then(() => {
        navigator.xr.requestSession(sessionMode, options).then((session) => {
          // @ts-ignore
          const rhi = <WebGLGraphicDevice>engine._hardwareRenderer;
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

export function registerXRPlatformFeature(type: XRFeatureType) {
  return (platformFeatureConstructor: PlatformFeatureConstructor) => {
    WebXRDevice._platformFeatureMap[type] = platformFeatureConstructor;
  };
}
