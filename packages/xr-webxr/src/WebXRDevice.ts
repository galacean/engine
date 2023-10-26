import { IXRFeature } from "@galacean/engine-design";
import { Engine, EnumXRMode, EnumXRFeature, IXRDevice } from "@galacean/engine";
import { WebXRSessionManager } from "./session/WebXRSessionManager";
import { parseXRMode } from "./util";
import { WebXRInputManager } from "./input/WebXRInputManager";

type FeatureConstructor = new (engine: Engine, type: EnumXRFeature) => IXRFeature;
export class WebXRDevice implements IXRDevice {
  // @internal
  static _platformFeatureMap: FeatureConstructor[] = [];

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

  createInputManager(engine: Engine): WebXRInputManager {
    return new WebXRInputManager(engine);
  }

  createSessionManager(engine: Engine): WebXRSessionManager {
    return new WebXRSessionManager(engine);
  }
}
