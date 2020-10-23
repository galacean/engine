import { Vector3 } from "./Vector3";

/**
 * 射线。
 */
export class Ray {
  /** 射线的起点。*/
  readonly origin: Vector3 = new Vector3();
  /** 射线的归一化方向。*/
  readonly direction: Vector3 = new Vector3();

  /**
   * 创建射线实例。
   * @param origin - 起点
   * @param direction - 归一化方向
   */
  constructor(origin: Vector3, direction: Vector3) {
    origin.cloneTo(this.origin);
    direction.cloneTo(this.direction);
  }

  /**
   * 检测本射线与平面相交
   * @param {Vector3} point 平面上的一个点：(p-p0)·n = 0
   * @param {Vector3} normal 平面的法线
   */
  intersectPlane(point: Vector3, normal: Vector3) {
    const origin = this.origin;

    const denom = Vector3.dot(normal, this.direction);
    if (Math.abs(denom) > 1e-6) {
      const p0l0 = new Vector3();
      Vector3.subtract(point, origin, p0l0);

      const t = Vector3.dot(p0l0, normal) / denom;
      if (t >= 0) {
        return t;
      }
    } // end of if

    return false;
  }

  /**
   * 射线方向上，距离起点指定距离的坐标
   * @param {number} distance 距离
   */
  getPoint(distance: number): Vector3 {
    // origin + direction * distance;
    const point = new Vector3();
    Vector3.scale(this.direction, distance, point);
    return point.add(this.origin);
  }

  /**
   * 检测本射线与球体相交
   * @param {Vector3} center 球心坐标
   * @param {number} radius 球的半径
   */
  intersectSphere(center: Vector3, radius: number) {
    // analytic solution
    const dir = this.direction;
    const L = new Vector3();
    Vector3.subtract(this.origin, center, L);

    const a = Vector3.dot(dir, dir);
    const b = 2 * Vector3.dot(dir, L);
    const c = Vector3.dot(L, L) - radius * radius;

    const s = this._solveQuadratic(a, b, c);
    if (s) {
      return s[0];
    } else {
      return false;
    }
  }

  /**
   * 检测本射线与轴对齐的Box的相交
   * @param {Vector3} max Box的最大点
   * @param {Vector3} min Box的最小点
   */
  intersectAABB(max: Vector3, min: Vector3) {
    const dir = this.direction;
    const orig = this.origin;
    const invdir = new Vector3(1 / dir.x, 1 / dir.y, 1 / dir.z);

    const bounds = [min, max];
    const sign = [dir.x < 0 ? 1 : 0, dir.y < 0 ? 1 : 0, dir.z < 0 ? 1 : 0];

    let tmin = (bounds[sign[0]].x - orig.x) * invdir.x;
    let tmax = (bounds[1 - sign[0]].x - orig.x) * invdir.x;
    const tymin = (bounds[sign[1]].y - orig.y) * invdir.y;
    const tymax = (bounds[1 - sign[1]].y - orig.y) * invdir.y;

    if (tmin > tymax || tymin > tmax) {
      return false;
    }

    if (tymin > tmin) {
      tmin = tymin;
    }
    if (tymax < tmax) {
      tmax = tymax;
    }

    const tzmin = (bounds[sign[2]].z - orig.z) * invdir.z;
    const tzmax = (bounds[1 - sign[2]].z - orig.z) * invdir.z;

    if (tmin > tzmax || tzmin > tmax) {
      return false;
    }

    if (tzmin > tmin) {
      tmin = tzmin;
    }
    if (tzmax < tmax) {
      tmax = tzmax;
    }

    let t = tmin;

    if (t < 0) {
      t = tmax;
      if (t < 0) {
        return false;
      }
    }

    return t;
  }

  /**
   * solve: ax^2 + bx + c = 0
   * @returns {null|array} null: no answers; [x0 : float, x1 : float] where x0 <= x1
   */
  private _solveQuadratic(a, b, c) {
    const discr = b * b - 4 * a * c;
    if (discr < 0) {
      return false;
    } else if (discr == 0) {
      const x = (-0.5 * b) / a;
      return [x, x];
    } else {
      const r = Math.sqrt(discr);
      const q = b > 0 ? -0.5 * (b + r) : -0.5 * (b - r);
      const x0 = q / a;
      const x1 = c / q;
      if (x0 <= x1) {
        return [x0, x1];
      } else {
        return [x1, x0];
      }
    } // end of else
  }
}
