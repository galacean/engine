import { IXRFeatureProvider } from "@galacean/engine-design";
import { EnumXRFeature, Matrix, registerXRProvider } from "@galacean/engine";
import { WebXRSession } from "../WebXRSession";

@registerXRProvider(EnumXRFeature.HitTest)
export class WebXRHitTestProvider implements IXRFeatureProvider {
  private _session: WebXRSession;
  private _attached: boolean = false;
  private _waitingList: { x: number; y: number; resolve: (results: readonly Matrix[]) => void }[] = [];
  private _state: HitTestState = HitTestState.Free;

  private _x: number;
  private _y: number;
  private _hitTestSource: XRHitTestSource;

  hitTest(x: number, y: number): Promise<readonly Matrix[]> {
    return new Promise((resolve, reject) => {
      if (this._attached) {
        this._waitingList.push({ x, y, resolve });
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
    const hitTestResults = session._platformFrame.getHitTestResults(hitTestSource);
    const resLength = hitTestResults.length;
    const results = [];
    if (resLength >= 0) {
      const { _platformSpace: platformSpace } = session;
      for (let i = 0; i < resLength; i++) {
        const { transform } = hitTestResults[i].getPose(platformSpace);
        if (transform) {
          results.push(new Matrix().copyFromArray(transform.matrix));
        }
      }
    }
    const { _waitingList: waitingList, _x: x, _y: y } = this;
    for (let i = waitingList.length - 1; i >= 0; i--) {
      const waitHit = waitingList[i];
      if (waitHit.x === x && waitHit.y === y) {
        waitHit.resolve(results);
        waitingList.splice(i, 1);
      }
    }
    this._state = HitTestState.Free;
    this._next();
  }

  destroy(): void {
    this._session = null;
    this.detach();
  }

  private _next(): void {
    if (this._state !== HitTestState.Free) return;
    const { _waitingList: waitingList } = this;
    if (waitingList.length > 0) {
      const { x, y } = waitingList[0];
      if (x === this._x && y === this._y) {
        this._state = HitTestState.Requesting;
      } else {
        const { _platformSession: platformSession, _platformSpace: platformSpace } = this._session;
        const option: XRHitTestOptionsInit = { space: platformSpace, offsetRay: new XRRay({ x, y }) };
        this._state = HitTestState.Requesting;
        platformSession.requestHitTestSource(option).then((hitTestSource) => {
          if (this._attached) {
            this._x = x;
            this._y = y;
            this._hitTestSource = hitTestSource;
            this._state = HitTestState.Testing;
          }
        });
      }
    }
  }
}

enum HitTestState {
  Free,
  Requesting,
  Testing
}
