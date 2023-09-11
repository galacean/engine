import { Engine, EnumXRFeature, Matrix, XRHitTestManager } from "@galacean/engine";
import { IXRFeatureDescriptor, IXRHitTest } from "@galacean/engine-design";
import { WebXRSessionManager } from "../session/WebXRSessionManager";
import { registerXRPlatformFeature } from "../WebXRDevice";

@registerXRPlatformFeature(EnumXRFeature.HitTest)
export class WebXRHitTest implements IXRHitTest {
  descriptor: IXRFeatureDescriptor;

  private _engine: Engine;
  private _space: XRReferenceSpace;
  private _sessionManager: WebXRSessionManager;
  private _hitTestManager: XRHitTestManager;
  private _x: number;
  private _y: number;
  private _hitTestSource: XRHitTestSource;

  startHitTest(x: number, y: number): Promise<void> {
    if (!this._hitTestSource || this._x !== x || this._y !== y) {
      this._destroyHitTestSource();
      if (this._space) {
        return this._requestHitTestSource(x, y);
      } else {
        return this._requestViewerSpace().then(() => this._requestHitTestSource(x, y));
      }
    }
  }

  stopHitTest(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._destroyHitTestSource();
      resolve();
    });
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
    const listeners = this._hitTestManager.listeners;
    for (let i = listeners.length - 1; i >= 0; i--) {
      listeners[i](results);
    }
  }

  _initialize(descriptor: IXRFeatureDescriptor): Promise<void> {
    return new Promise((resolve, reject) => {
      this.descriptor = descriptor;
      resolve();
    });
  }

  _onDestroy(): void {
    this._destroyHitTestSource();
  }

  private _requestHitTestSource(x: number, y: number): Promise<void> {
    const { _space: space } = this;
    const { _platformSession: platformSession } = this._sessionManager;
    //const option: XRHitTestOptionsInit = { space, offsetRay: new XRRay({ x, y }) };
    const option: XRHitTestOptionsInit = { space };
    return platformSession.requestHitTestSource(option).then((hitTestSource) => {
      this._hitTestSource = hitTestSource;
      this._x = x;
      this._y = y;
    });
  }

  private _requestViewerSpace(): Promise<void> {
    const { _platformSession: platformSession } = this._sessionManager;
    return platformSession.requestReferenceSpace("viewer").then((space) => {
      this._space = space;
    });
  }

  private _destroyHitTestSource() {
    if (this._hitTestSource) {
      this._hitTestSource.cancel();
      this._hitTestSource = null;
    }
  }

  constructor(engine: Engine) {
    this._engine = engine;
    const { xrModule } = engine;
    this._sessionManager = <WebXRSessionManager>xrModule.sessionManager;
    this._hitTestManager = xrModule.getFeature(XRHitTestManager);
  }
}
