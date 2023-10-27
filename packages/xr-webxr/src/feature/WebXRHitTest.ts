import {
  Engine,
  EnumXRFeature,
  EnumXRFeatureChangeFlag,
  EnumXRInputSource,
  IXRHitTestDescriptor,
  registerXRPlatformFeature,
  Matrix,
  XRPlatformFeature
} from "@galacean/engine";
import { IXRFeatureDescriptor, IXRHitTest } from "@galacean/engine-design";
import { WebXRSessionManager } from "../session/WebXRSessionManager";

@registerXRPlatformFeature(EnumXRFeature.HitTest)
export class WebXRHitTest extends XRPlatformFeature {
  private _sessionManager: WebXRSessionManager;
  private _screenX: number;
  private _screenY: number;
  private _hitTestSource: XRHitTestSource;
  private _hitTestFrameCount: number = 3;

  private _localReferenceSpace: XRReferenceSpace;
  private _viewerReferenceSpace: XRReferenceSpace;

  hitTest(screenX: number, screenY: number): Promise<void> {
    let origin: DOMPointReadOnly;
    let direction: DOMPointReadOnly;
    const controller = this._engine.xrModule.inputManager.getInput(EnumXRInputSource.Controller);
    const xrRay = new XRRay(origin, direction);
    if (this._hitTestSource) {
    }
    if (!this._hitTestSource || this._screenX !== screenX || this._screenY !== screenY) {
      this._clearHitTestSource();
      return this._requestHitTestSource(screenX, screenY);
    }
  }

  _onUpdate(): void {
    const { _hitTestSource: hitTestSource } = this;
    if (!this._hitTestSource) {
      return;
    }
    const { _platformFrame: platformFrame, _platformSpace: platformSpace } = this._sessionManager;
    const hitTestResults = platformFrame.getHitTestResults(hitTestSource);
    const resLength = hitTestResults.length;
    if (resLength <= 0) {
      return;
    }
    const results = [];
    for (let i = 0; i < resLength; i++) {
      const pose = hitTestResults[i].getPose(platformSpace);
      results.push(new Matrix().copyFromArray(pose.transform.matrix));
    }
    // const listeners = this._hitTestManager.listeners;
    // for (let i = listeners.length - 1; i >= 0; i--) {
    //   listeners[i](results);
    // }
  }

  _initialize(descriptor: IXRHitTestDescriptor): Promise<void> {
    return new Promise((resolve, reject) => {
      this.descriptor = descriptor;
      const { _platformSession: platformSession } = this._sessionManager;
      Promise.all([
        platformSession.requestReferenceSpace("local"),
        platformSession.requestReferenceSpace("viewer")
      ]).then(([localReferenceSpace, viewerReferenceSpace]) => {
        this._localReferenceSpace = localReferenceSpace;
        this._viewerReferenceSpace = viewerReferenceSpace;
        resolve();
      }, reject);
    });
  }

  _onFlagChange(flag: EnumXRFeatureChangeFlag, ...param): void {
    switch (flag) {
      case EnumXRFeatureChangeFlag.Enable:
        break;

      default:
        break;
    }
  }

  _onDestroy(): void {
    this._clearHitTestSource();
  }

  private _requestHitTestSource(x: number, y: number): Promise<void> {
    const { _platformSession: platformSession } = this._sessionManager;
    const option = { space: this._viewerReferenceSpace, offsetRay: this._createXRRay(x, y) };
    return platformSession.requestHitTestSource(option).then((hitTestSource) => {
      this._hitTestSource = hitTestSource;
      this._screenX = x;
      this._screenY = y;
    });
  }

  private _createXRRay(x: number, y: number): XRRay {
    const origin = new DOMPointReadOnly();
    const direction = new DOMPointReadOnly();
    return new XRRay(origin, direction);
  }

  private _clearHitTestSource() {
    if (this._hitTestSource) {
      this._hitTestSource.cancel();
      this._hitTestSource = null;
    }
  }

  constructor(engine: Engine) {
    super(engine);
    this._sessionManager = <WebXRSessionManager>engine.xrModule.sessionManager;
  }
}
