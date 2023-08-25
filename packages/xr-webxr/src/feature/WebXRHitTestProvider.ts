import { EnumXRFeature, Matrix, XRFeatureProvider, registerXRProvider } from "@galacean/engine";
import { WebXRSession } from "../WebXRSession";

@registerXRProvider(EnumXRFeature.HitTest)
export class WebXRHitTestProvider extends XRFeatureProvider {
  private _state: HitTestState = HitTestState.Free;
  private _waitingList: IHitTestWaitingElement[] = [];

  private _x: number;
  private _y: number;
  private _hitTestSource: XRHitTestSource;

  hitTest(x: number, y: number): Promise<readonly Matrix[]> {
    return new Promise((resolve, reject) => {
      if (this._attached) {
        const { _waitingList: waitingList } = this;
        const element = waitingList.find((value) => value.x === x && value.y === y);
        if (element) {
          element.successes.push(resolve);
          element.failures.push(reject);
        } else {
          waitingList.push({ x, y, successes: [resolve], failures: [reject] });
        }
        this._next();
      } else {
        reject();
      }
    });
  }

  attach(session: WebXRSession): void {
    this._attached = true;
    this._session = session;
  }

  detach(): void {
    this._attached = false;
    this._session = null;
    this._waitingList.length = 0;
    if (this._hitTestSource) {
      this._hitTestSource.cancel();
      this._hitTestSource = null;
    }
    this._state = HitTestState.Free;
  }

  onXRFrame(): void {
    if (!this._attached) return;
    if (this._state !== HitTestState.Requesting) return;
    const { _session: session, _hitTestSource: hitTestSource } = this;
    const hitTestResults = (<WebXRSession>session)._platformFrame.getHitTestResults(hitTestSource);
    const resLength = hitTestResults.length;
    const { _waitingList: waitingList, _x: x, _y: y } = this;
    const idx = waitingList.findIndex((value) => value.x === x && value.y === y);
    const { successes, failures } = waitingList[idx];
    waitingList.splice(idx, 1);
    if (resLength >= 0) {
      const results = [];
      const { _platformSpace: platformSpace } = <WebXRSession>session;
      for (let i = 0; i < resLength; i++) {
        const { transform } = hitTestResults[i].getPose(platformSpace);
        if (transform) {
          results.push(new Matrix().copyFromArray(transform.matrix));
        }
      }
      successes.forEach((value) => {
        value(results);
      });
    } else {
      failures.forEach((value) => {
        new Error("Hit test fail");
      });
    }
    this._state = HitTestState.Free;
    this._next();
  }

  private _next(): void {
    if (this._state !== HitTestState.Free) return;
    const { _waitingList: waitingList } = this;
    if (waitingList.length > 0) {
      const { x, y } = waitingList[0];
      if (x === this._x && y === this._y) {
        this._state = HitTestState.Requesting;
      } else {
        const { _platformSession: platformSession, _platformSpace: platformSpace } = <WebXRSession>this._session;
        const option: XRHitTestOptionsInit = { space: platformSpace, offsetRay: new XRRay({ x, y }) };
        this._state = HitTestState.Requesting;
        platformSession.requestHitTestSource(option).then((hitTestSource) => {
          if (this._attached) {
            this._x = x;
            this._y = y;
            this._hitTestSource = hitTestSource;
            this._state = HitTestState.HitTesting;
          }
        });
      }
    }
  }
}

interface IHitTestWaitingElement {
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
