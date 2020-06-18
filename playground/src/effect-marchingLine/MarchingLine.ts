// MarchingLine

import { vec3, mat4, quat } from "@alipay/o3-math";

export class MarchingLine {
  public _rule: any;
  public _minDistance: any;
  public _points: any;
  public _hasHit: any;

  constructor(rule, minDistance?) {
    this._rule = rule;
    this._minDistance = minDistance || 0.01;
    this._points = [];
  }

  march(allPoints) {
    if (this._hasHit) {
      return;
    }

    const p = this._rule.getMarchPoint();
    let d = 0.0;

    if (this._rule.checkHit) {
      allPoints.forEach(pp => {
        d = vec3.dist(p, pp);
        if (d < this._minDistance) {
          this._hasHit = true;
          //	dispatch event
          this._rule.onHit(this);
          return;
        }
      });
    }

    this._points.push(p);
    return p;
  }

  get points() {
    return this._points;
  }
}
