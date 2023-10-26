import { Engine, IXRImageTrackingDescriptor } from "@galacean/engine";
import { WebXRSessionManager } from "../session/WebXRSessionManager";

export class WebXRImageTracking {
  private _engine: Engine;
  private _sessionManager: WebXRSessionManager;

  _initialize(descriptor: IXRImageTrackingDescriptor): Promise<void> {
    return new Promise((resolve, reject) => {
      resolve();
    });
  }

  constructor(engine: Engine) {
    this._engine = engine;
    this._sessionManager = <WebXRSessionManager>engine.xrModule.sessionManager;
  }
}
