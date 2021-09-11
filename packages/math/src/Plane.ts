import { IClone } from "./IClone";
import { Vector3 } from "./Vector3";
import { Quaternion } from "./Quaternion";

/**
 * Represents a plane in three dimensional space.
 */
export class Plane implements IClone {
  /**
   * Normalize the normal vector of the specified plane.
   * @param p - The specified plane
   * @param out - A normalized version of the specified plane
   */
  static normalize(p: Plane, out: Plane): void {
    const { normal } = p;
    const factor = 1.0 / normal.length();

    const outNormal = out.normal;
    outNormal.x = normal.x * factor;
    outNormal.y = normal.y * factor;
    outNormal.z = normal.z * factor;
    out.distance = p.distance * factor;
  }

  /**
   * Calculate the plane that contains the three specified points.
   * @param point0 - The first point
   * @param point1 - The second point
   * @param point2 - The third point
   * @param out - The calculated plane
   */
  static fromPoints(point0: Vector3, point1: Vector3, point2: Vector3, out: Plane): void {
    const x0 = point0.x;
    const y0 = point0.y;
    const z0 = point0.z;
    const x1 = point1.x - x0;
    const y1 = point1.y - y0;
    const z1 = point1.z - z0;
    const x2 = point2.x - x0;
    const y2 = point2.y - y0;
    const z2 = point2.z - z0;
    const yz = y1 * z2 - z1 * y2;
    const xz = z1 * x2 - x1 * z2;
    const xy = x1 * y2 - y1 * x2;
    const invPyth = 1.0 / Math.sqrt(yz * yz + xz * xz + xy * xy);

    const x = yz * invPyth;
    const y = xz * invPyth;
    const z = xy * invPyth;

    const { normal } = out;
    normal.x = x;
    normal.y = y;
    normal.z = z;

    out.distance = -(x * x0 + y * y0 + z * z0);
  }

  /** The normal of the plane. */
  public readonly normal: Vector3 = new Vector3();
  /** The distance of the plane along its normal to the origin. */
  public distance: number = 0;

  /**
   * Constructor of Plane.
   * @param normal - The normal vector
   * @param distance - The distance of the plane along its normal to the origin
   */
  constructor(normal: Vector3 = null, distance: number = 0) {
    normal && normal.cloneTo(this.normal);
    this.distance = distance;
  }

  /**
   * Normalize the normal vector of this plane.
   * @returns The plane after normalize
   */
  normalize(): Plane {
    Plane.normalize(this, this);
    return this;
  }

  transformFromPlaneEquation(outPosition: Vector3, outRotation: Quaternion) {
    this.normalize();
    const q = outRotation;
    const t = outPosition;

    // special case handling for axis aligned planes
    const halfsqrt2 = 0.707106781;
    // special handling for axis aligned planes
    if (2 == (this.normal.x == 0.0 ? 1 : 0) + (this.normal.y == 0.0 ? 1 : 0) + (this.normal.z == 0.0 ? 1 : 0)) {
      if (this.normal.x > 0) {
        q.setValue(0, 0, 0, 1);
      } else if (this.normal.x < 0) {
        q.setValue(0, 0, 1, 0);
      } else {
        q.setValue(0, -this.normal.z * halfsqrt2, -this.normal.y * halfsqrt2, halfsqrt2);
      }
    } else {
      Quaternion.shortestRotation(new Vector3(1.0, 0, 0), this.normal, q);
    }
    Vector3.scale(this.normal, -this.distance, t);
  }

  /**
   * Creates a clone of this plane.
   * @returns A clone of this plane
   */
  clone(): Plane {
    const out = new Plane();
    this.cloneTo(out);
    return out;
  }

  /**
   * Clones this plane to the specified plane.
   * @param out - The specified plane
   * @returns The specified plane
   */
  cloneTo(out: Plane): Plane {
    this.normal.cloneTo(out.normal);
    out.distance = this.distance;
    return out;
  }
}
