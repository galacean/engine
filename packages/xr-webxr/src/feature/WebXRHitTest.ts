import { Matrix } from "@galacean/engine";
import { IXRHitTest } from "@galacean/engine-design";
import { WebXRSession } from "../WebXRSession";

export class WebXRHitTest implements IXRHitTest {
  private _session: WebXRSession;
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
        this._state === HitTestState.Free && this.request(x, y, this._session);
      }
    });
  }

  onXRFrame(session: WebXRSession): void {
    if (this._state !== HitTestState.HitTesting) return;
    const { _hitTestSource: hitTestSource } = this;
    const hitTestResults = session._platformFrame.getHitTestResults(hitTestSource);
    const resLength = hitTestResults.length;
    const { _hitTestList: waitingList, _x: x, _y: y } = this;
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
      this.request(x, y, session);
    } else {
      this._state = HitTestState.Free;
    }
  }

  onDestroy(): void {
    this._hitTestList.length = 0;
    if (this._hitTestSource) {
      this._hitTestSource.cancel();
      this._hitTestSource = null;
    }
    this._state = HitTestState.Free;
  }

  private request(x: number, y: number, session: WebXRSession): void {
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
