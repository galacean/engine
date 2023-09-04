import { Engine, EnumXRFeature, Matrix } from "@galacean/engine";
import { IXRFeatureDescriptor, IXRHitTest } from "@galacean/engine-design";
import { WebXRSessionManager } from "../session/WebXRSessionManager";
import { registerXRPlatformFeature } from "../WebXRDevice";

@registerXRPlatformFeature(EnumXRFeature.HitTest)
export class WebXRHitTest implements IXRHitTest {
  descriptor: IXRFeatureDescriptor;

  private _engine: Engine;
  private _sessionManager: WebXRSessionManager;
  private _state: HitTestState = HitTestState.Free;
  private _x: number;
  private _y: number;
  private _hitTestSource: XRHitTestSource;
  private _hitTestList: IHitTestItem[] = [];

  hitTest(x: number, y: number): Promise<readonly Matrix[]> {
    return new Promise((resolve, reject) => {
      const { _hitTestList: waitingList } = this;
      const element = waitingList.find((value) => value.x === x && value.y === y);
      if (element) {
        element.successes.push(resolve);
        element.failures.push(reject);
      } else {
        waitingList.push({ x, y, successes: [resolve], failures: [reject] });
        this._state === HitTestState.Free && this.request(x, y, this._sessionManager);
      }
    });
  }

  _onUpdate(): void {
    if (this._state !== HitTestState.HitTesting) return;
    const { _hitTestSource: hitTestSource, _sessionManager: sessionManager } = this;
    const hitTestResults = sessionManager._platformFrame.getHitTestResults(hitTestSource);
    const resLength = hitTestResults.length;
    const { _hitTestList: waitingList, _x: x, _y: y } = this;
    const idx = waitingList.findIndex((value) => value.x === x && value.y === y);
    const { successes, failures } = waitingList[idx];
    waitingList.splice(idx, 1);
    if (resLength >= 0) {
      const results = [];
      const { _platformSpace: platformSpace } = sessionManager;
      for (let i = 0; i < resLength; i++) {
        const { transform } = hitTestResults[i].getPose(platformSpace);
        if (transform) {
          results.push(new Matrix().copyFromArray(transform.matrix));
        }
      }
      successes.forEach((fun) => {
        fun(results);
      });
    } else {
      failures.forEach((fun) => {
        fun(new Error("Hit test fail"));
      });
    }
    if (waitingList.length > 0) {
      const { x, y } = waitingList[0];
      this.request(x, y, sessionManager);
    } else {
      this._state = HitTestState.Free;
    }
  }

  _initialize(descriptor: IXRFeatureDescriptor): Promise<void> {
    return new Promise((resolve, reject) => {
      this.descriptor = descriptor;
      resolve();
    });
  }

  _onDestroy(): void {
    this._hitTestList.length = 0;
    if (this._hitTestSource) {
      this._hitTestSource.cancel();
      this._hitTestSource = null;
    }
    this._state = HitTestState.Free;
  }

  constructor(engine: Engine) {
    this._engine = engine;
    this._sessionManager = <WebXRSessionManager>engine.xrModule.sessionManager;
  }

  private request(x: number, y: number, session: WebXRSessionManager): void {
    const { _platformSession: platformSession, _platformSpace: platformSpace } = session;
    const option: XRHitTestOptionsInit = { space: platformSpace, offsetRay: new XRRay({ x, y }) };
    this._state = HitTestState.Requesting;
    platformSession.requestHitTestSource(option).then((hitTestSource) => {
      this._x = x;
      this._y = y;
      this._hitTestSource = hitTestSource;
      this._state = HitTestState.HitTesting;
    });
  }
}

interface IHitTestItem {
  x: number;
  y: number;
  successes: ((results: readonly Matrix[]) => void)[];
  failures: ((error: Error) => void)[];
}

enum HitTestState {
  Free,
  Requesting,
  HitTesting
}
