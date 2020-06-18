// MarchingLine

import { vec3, mat4, quat } from "@alipay/o3-math";
import { MarchingLine } from "./MarchingLine";

var random = function(min, max) {
  return min + Math.random() * (max - min);
};

const front = vec3.fromValues(0, 0, -1);

function getStartPoint(radius) {
  let point = vec3.fromValues(random(-1, 1), random(-1, 1), random(-1, 1));
  vec3.normalize(point, point);
  vec3.scale(point, point, radius);
  return point;
}

function getAxis() {
  let axis = vec3.create();

  axis = vec3.fromValues(random(-1, 1), random(-1, 1), random(-1, 1));
  vec3.normalize(axis, axis);

  // const t = vec3.create();
  // vec3.cross(t, this._point, front);
  // const m = mat4.create();
  // mat4.rotate(m, m, Math.PI * 0.5, t);
  // vec3.transformMat4(this._axis, this._point, m);
  //*/
  return axis;
}

export class SphereMarchingRule {
  public _radius: any;
  public _point: any;
  public _axis: any;
  public _rotation: any;
  public _angle: any;
  public _dir: any;
  public _onHit: any;
  public checkHit: any;

  constructor(radius, startPoint, axis, onHit) {
    this._radius = radius;
    this._point = startPoint || getStartPoint(radius);
    this._axis = axis || getAxis();

    this._rotation = quat.create();
    this._angle = 0;
    quat.setAxisAngle(this._rotation, this._axis, this._angle);
    this._dir = Math.random() > 0.5 ? 1 : -1;
    this._onHit = onHit;

    this.checkHit = true;
  }

  getMarchPoint() {
    this._angle += 0.01 * this._dir;
    quat.setAxisAngle(this._rotation, this._axis, this._angle);

    const p = vec3.clone(this._point);
    vec3.transformQuat(p, p, this._rotation);
    return p;
  }

  onHit(line) {
    this.spawnPoints(line.points, line._minDistance);
  }

  spawnPoints(points, minDistance) {
    const total = points.length;
    if (total < 20) {
      return;
    }

    const offset = 0.25;
    let i0 = Math.round(random(offset, 0.5) * total);
    let i1 = Math.round(random(1.0 - offset, 0.5) * total);
    let p0 = points[i0];
    let p1 = points[i1];

    const t = vec3.create();
    vec3.cross(t, this._axis, front);
    vec3.normalize(t, t);
    const m = mat4.create();
    mat4.rotate(m, m, Math.PI * 0.5, t);
    const axis = vec3.create();
    vec3.transformMat4(axis, this._axis, m);

    const lines = [
      new MarchingLine(new SphereMarchingRule(this._radius, p0, axis, this._onHit), minDistance),
      new MarchingLine(new SphereMarchingRule(this._radius, p1, axis, this._onHit), minDistance)
    ];

    if (this._onHit) {
      this._onHit({ lines });
    }
  }
}

export class PlaneMarchingRule {
  public w: any;
  public tick: any;
  public type: any;
  public checkHit: any;
  public _rotation: any;

  constructor(axis, angle, w, type) {
    this.w = w;
    this.tick = 0;
    this.type = type || "flower";

    this.checkHit = false;

    this._rotation = quat.create();
    quat.setAxisAngle(this._rotation, axis, angle);
  }

  getMarchPoint() {
    let p = this.getFrontPosition();
    vec3.transformQuat(p, p, this._rotation);
    return p;
  }

  getFrontPosition() {
    let theta = this.tick;
    this.tick += 0.01;
    let w = this.w / 4;
    let r;
    let a;
    let b;
    let x = 0;
    let y = 0;
    switch (this.type) {
      case "love":
        w = w * 0.5;
        r = w * Math.acos(Math.sin(theta));
        y = w + w / 5;
        break;
      case "spiral":
        a = 0.05 * w;
        b = 0.05 * w;
        theta *= 2;
        theta = theta % 30;
        r = a + b * theta;
        break;
      case "flower":
        a = w;
        b = w;
        theta *= 2;
        r = a * Math.sin(b * theta);
        break;
      default:
        r = 1;
        break;
    }
    x += r * Math.cos(theta);
    y += r * Math.sin(theta);
    return [x, y, this.w / 2];
  }

  onHit(line) {}
}

//TODO 给定一组点，沿着这组点的轨迹蔓延
export class PointArrayMarchingRule {
  public pointArray: any;
  public curTargetPoint: any;

  constructor(pointArray) {
    this.pointArray = pointArray;
    this.curTargetPoint = vec3.create();
  }

  getMarchPoint() {
    if (this.pointArray.length > 0) {
    }
  }
}
