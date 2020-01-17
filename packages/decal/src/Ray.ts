import { vec3 } from "@alipay/o3-math";
import { transformDirection } from "./util";

const edge1 = vec3.create();
const edge2 = vec3.create();
const normal = vec3.create();
const diff = vec3.create();
const temp1 = vec3.create();
const temp2 = vec3.create();

type FloatArray = Array<number> | Float32Array;

export class Ray {
  public origin: FloatArray;
  public direction: FloatArray;
  public constructor(origin, direction) {
    this.origin = origin !== undefined ? origin.slice(0) : vec3.create();
    this.direction = direction !== undefined ? direction.slice(0) : vec3.create();
  }

  at(t, target) {
    const directionCopy = this.direction.slice(0);
    const mDirection = [directionCopy[0] * t, directionCopy[1] * t, directionCopy[2] * t];
    vec3.add(target, mDirection, this.origin);
    return target;
  }

  intersectTriangle(_a, _b, _c, backfaceCulling, target) {
    // Compute the offset origin, edges, and normal.
    // from http://www.geometrictools.com/GTEngine/Include/Mathematics/GteIntrRay3Triangle3.h

    const _edge1 = vec3.subtract(edge1, _b, _a);
    const _edge2 = vec3.subtract(edge2, _c, _a);
    const _normal = vec3.cross(normal, _edge1, _edge2);

    // Solve Q + t*D = b1*E1 + b2*E2 (Q = kDiff, D = ray direction,
    // E1 = kEdge1, E2 = kEdge2, N = Cross(E1,E2)) by
    //   |Dot(D,N)|*b1 = sign(Dot(D,N))*Dot(D,Cross(Q,E2))
    //   |Dot(D,N)|*b2 = sign(Dot(D,N))*Dot(D,Cross(E1,Q))
    //   |Dot(D,N)|*t = -sign(Dot(D,N))*Dot(Q,N)
    const _direction = this.direction;
    const _origin = this.origin;
    let DdN = vec3.dot(_direction, _normal);
    let sign;

    if (DdN > 0) {
      if (backfaceCulling) return null;
      sign = 1;
    } else if (DdN < 0) {
      sign = -1;
      DdN = -DdN;
    } else {
      return null;
    }

    const _diff = vec3.subtract(diff, _origin, _a);
    const cde = vec3.cross(temp1, _diff, _edge2);
    const DdQxE2 = sign * vec3.dot(_direction, cde);

    // b1 < 0, no intersection
    if (DdQxE2 < 0) {
      return null;
    }

    const ced = vec3.cross(temp2, _edge1, _diff);
    const DdE1xQ = sign * vec3.dot(_direction, ced);

    // b2 < 0, no intersection
    if (DdE1xQ < 0) {
      return null;
    }

    // b1+b2 > 1, no intersection
    if (DdQxE2 + DdE1xQ > DdN) {
      return null;
    }

    // Line intersects triangle, check if ray does.
    var QdN = -sign * vec3.dot(_diff, _normal);

    // t < 0, no intersection
    if (QdN < 0) {
      return null;
    }
    // Ray intersects triangle.
    return this.at(QdN / DdN, target);
  }

  copy(ray) {
    this.origin = ray.origin.slice(0);
    this.direction = ray.direction.slice(0);
    return this;
  }

  applyMatrix4(matrix4) {
    vec3.transformMat4(this.origin, this.origin, matrix4);
    transformDirection(this.direction, this.direction, matrix4);
    return this;
  }
}
