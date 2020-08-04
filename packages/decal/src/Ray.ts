import { Vector3, Matrix } from "@alipay/o3-math";
import { transformDirection } from "./util";

const edge1: Vector3 = new Vector3();
const edge2: Vector3 = new Vector3();
const normal: Vector3 = new Vector3();
const diff: Vector3 = new Vector3();
const temp1: Vector3 = new Vector3();
const temp2: Vector3 = new Vector3();

export class Ray {
  public origin: Vector3;
  public direction: Vector3;

  constructor(origin: Vector3, direction: Vector3) {
    this.origin = origin !== undefined ? new Vector3(origin.x, origin.y, origin.z) : new Vector3();
    this.direction = direction !== undefined ? new Vector3(direction.x, direction.y, direction.z) : new Vector3();
  }

  at(t: number, target: Vector3): Vector3 {
    const { x, y, z } = this.direction;
    const mDirection = new Vector3(x * t, y * t, z * t);
    Vector3.add(mDirection, this.origin, target);
    return target;
  }

  intersectTriangle(_a: Vector3, _b: Vector3, _c: Vector3, backfaceCulling: boolean, target: Vector3): Vector3 {
    // Compute the offset origin, edges, and normal.
    // from http://www.geometrictools.com/GTEngine/Include/Mathematics/GteIntrRay3Triangle3.h

    Vector3.subtract(_b, _a, edge1);
    Vector3.subtract(_c, _b, edge2);
    Vector3.cross(edge1, edge2, normal);

    // Solve Q + t*D = b1*E1 + b2*E2 (Q = kDiff, D = ray direction,
    // E1 = kEdge1, E2 = kEdge2, N = Cross(E1,E2)) by
    //   |Dot(D,N)|*b1 = sign(Dot(D,N))*Dot(D,Cross(Q,E2))
    //   |Dot(D,N)|*b2 = sign(Dot(D,N))*Dot(D,Cross(E1,Q))
    //   |Dot(D,N)|*t = -sign(Dot(D,N))*Dot(Q,N)
    const direction = this.direction;
    const origin = this.origin;

    let DdN = Vector3.dot(direction, normal);
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

    Vector3.subtract(origin, _a, diff);
    Vector3.cross(diff, edge2, temp1);
    const DdQxE2 = sign * Vector3.dot(direction, temp1);

    // b1 < 0, no intersection
    if (DdQxE2 < 0) {
      return null;
    }

    Vector3.cross(edge1, diff, temp2);
    const DdE1xQ = sign * Vector3.dot(direction, temp2);

    // b2 < 0, no intersection
    if (DdE1xQ < 0) {
      return null;
    }

    // b1+b2 > 1, no intersection
    if (DdQxE2 + DdE1xQ > DdN) {
      return null;
    }

    // Line intersects triangle, check if ray does.
    var QdN = -sign * Vector3.dot(diff, normal);

    // t < 0, no intersection
    if (QdN < 0) {
      return null;
    }
    // Ray intersects triangle.
    return this.at(QdN / DdN, target);
  }

  copy(ray: Ray): Ray {
    ray.origin.cloneTo(this.origin);
    ray.direction.cloneTo(this.direction);
    return this;
  }

  applyMatrix4(matrix4: Matrix): Ray {
    Vector3.transformMat4x4Coordinate(this.origin, matrix4, this.origin);
    transformDirection(this.direction, this.direction, matrix4);
    return this;
  }
}
