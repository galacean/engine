import { IXRPlatform, Engine, EnumXRMode, IXRFeatureDescriptor, IXRSessionDescriptor } from "@galacean/engine";
import { WebXRSession } from "./WebXRSession";
import { parseXRMode } from "./util";
import { WebXRInputProvider } from "./provider/WebXRInputProvider";
import { IXRSession } from "@galacean/engine-design";

export class WebXRPlatform implements IXRPlatform {
  get inputProvider(): new (engine: Engine) => WebXRInputProvider {
    return WebXRInputProvider;
  }

  isSupported(mode: EnumXRMode): Promise<void> {
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

  isSupportedFeature(descriptor: IXRFeatureDescriptor): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason: Error) => void) => {
      resolve();
    });
  }

  createSession(engine: Engine, descriptor: IXRSessionDescriptor): Promise<IXRSession> {
    const session = new WebXRSession(engine);
    return new Promise((resolve, reject) => {
      session.initialize(descriptor).then(() => {
        resolve(session);
      }, reject);
    });
  }

  destroySession(session: WebXRSession): Promise<void> {
    return session.destroy();
  }
}
