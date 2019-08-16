import { vec3 } from '@alipay/r3-math';


/**
 * 射线定义&相交运算
 * @class
 */
export class Ray {

  public direction;
  public origin;

  /**
   * @constructor
   * @param {vec3} origin
   * @param {vec3} direction
   */
  constructor(origin, direction) {

    this.origin = origin;
    this.direction = vec3.create();
    vec3.normalize(this.direction, direction);

  }

  /**
   * 检测本射线与平面相交
   * @param {vec3} point 平面上的一个点：(p-p0)·n = 0
   * @param {vec3} normal 平面的法线
   */
  intersectPlane(point, normal) {

    const dir = this.direction;
    const origin = this.origin;

    const denom = vec3.dot(normal, dir);
    if (Math.abs(denom) > 1e-6) {

      const p0l0 = vec3.create();
      vec3.subtract(p0l0, point, origin);

      const t = vec3.dot(p0l0, normal) / denom;
      if (t >= 0) {

        return t;

      }

    }// end of if

    return false;

  }

  /**
   * 射线方向上，距离起点指定距离的坐标
   * @param {number} distance 距离
   */
  getPoint(distance) {

    // origin + direction * distance;
    const point = vec3.create();
    vec3.scale(point, this.direction, distance);
    vec3.add(point, this.origin, point);
    return point;

  }

  /**
   * 检测本射线与球体相交
   * @param {vec3} center 球心坐标
   * @param {number} radius 球的半径
   */
  intersectSphere(center, radius) {

    // analytic solution
    const dir = this.direction;
    const L = vec3.create();
    vec3.sub(L, this.origin, center);

    const a = vec3.dot(dir, dir);
    const b = 2 * vec3.dot(dir, L);
    const c = vec3.dot(L, L) - radius * radius;

    const s = _solveQuadratic(a, b, c);
    if (s) {

      return s[0];

    } else {

      return false;

    }

  }

  /**
   * 检测本射线与轴对齐的Box的相交
   * @param {vec3} max Box的最大点
   * @param {vec3} min Box的最小点
   */
  intersectAABB(max, min) {

    const dir = this.direction;
    const orig = this.origin;
    const invdir = [1 / dir[0], 1 / dir[1], 1 / dir[2]];

    const bounds = [min, max];
    const sign = [dir[0] < 0 ? 1 : 0, dir[1] < 0 ? 1 : 0, dir[2] < 0 ? 1 : 0];

    let tmin = (bounds[sign[0]][0] - orig[0]) * invdir[0];
    let tmax = (bounds[1 - sign[0]][0] - orig[0]) * invdir[0];
    const tymin = (bounds[sign[1]][1] - orig[1]) * invdir[1];
    const tymax = (bounds[1 - sign[1]][1] - orig[1]) * invdir[1];

    if ((tmin > tymax) || (tymin > tmax)) {

      return false;

    }

    if (tymin > tmin) {

      tmin = tymin;

    }
    if (tymax < tmax) {

      tmax = tymax;

    }

    const tzmin = (bounds[sign[2]][2] - orig[2]) * invdir[2];
    const tzmax = (bounds[1 - sign[2]][2] - orig[2]) * invdir[2];

    if ((tmin > tzmax) || (tzmin > tmax)) {

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

}// end of class Ray

/**
 * solve: ax^2 + bx + c = 0
 * @private
 * @returns {null|array} null: no answers; [x0 : float, x1 : float] where x0 <= x1
 */
function _solveQuadratic(a, b, c) {

  const discr = b * b - 4 * a * c;
  if (discr < 0) {

    return false;

  } else if (discr == 0) {

    const x = -0.5 * b / a;
    return [x, x];

  } else {

    const r = Math.sqrt(discr);
    const q = (b > 0) ? -0.5 * (b + r) : -0.5 * (b - r);
    const x0 = q / a;
    const x1 = c / q;
    if (x0 <= x1) {

      return [x0, x1];

    } else {

      return [x1, x0];

    }

  }// end of else

}
