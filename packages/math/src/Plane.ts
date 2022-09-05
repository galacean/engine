import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { Vector3 } from "./Vector3";

/**
 * Represents a plane in three-dimensional space.
 */
export class Plane implements IClone<Plane>, ICopy<Plane, Plane> {
  private static _tempV30: Vector3 = new Vector3();
  private static _tempV31: Vector3 = new Vector3();
  private static _tempV32: Vector3 = new Vector3();
  private static _tempV33: Vector3 = new Vector3();
  private static _tempV34: Vector3 = new Vector3();
  private static _tempV35: Vector3 = new Vector3();
  private static _tempV36: Vector3 = new Vector3();

  /**
   * Normalize the normal vector of the specified plane.
   * @param p - The specified plane
   * @param out - A normalized version of the specified plane
   */
  static normalize(p: Plane, out: Plane): void {
    const { normal } = p;

    const factor = 1.0 / normal.length();
    Vector3.scale(normal, factor, out.normal);
    out.distance = p.distance * factor;
  }

  /**
   * Calculate the intersection point of three plane.
   * @param  p1 - Plane 1
   * @param  p2 - Plane 2
   * @param  p3 - Plane 3
   * @param out - intersection point
   */
  static intersectionPointThreePlanes(p1: Plane, p2: Plane, p3: Plane, out: Vector3): void {
    const p1Nor = p1.normal;
    const p2Nor = p2.normal;
    const p3Nor = p3.normal;

    Vector3.cross(p2Nor, p3Nor, Plane._tempV30);
    Vector3.cross(p3Nor, p1Nor, Plane._tempV31);
    Vector3.cross(p1Nor, p2Nor, Plane._tempV32);

    const a = -Vector3.dot(p1Nor, Plane._tempV30);
    const b = -Vector3.dot(p2Nor, Plane._tempV31);
    const c = -Vector3.dot(p3Nor, Plane._tempV32);

    Vector3.scale(Plane._tempV30, p1.distance / a, Plane._tempV33);
    Vector3.scale(Plane._tempV31, p2.distance / b, Plane._tempV34);
    Vector3.scale(Plane._tempV32, p3.distance / c, Plane._tempV35);

    Vector3.add(Plane._tempV33, Plane._tempV34, Plane._tempV36);
    Vector3.add(Plane._tempV35, Plane._tempV36, out);
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
    normal && this.normal.copyFrom(normal);
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

  /**
   * Creates a clone of this plane.
   * @returns A clone of this plane
   */
  clone(): Plane {
    const out = new Plane();
    out.copyFrom(this);
    return out;
  }

  /**
   * Copy this plane from the specified plane.
   * @param source - The specified plane
   * @returns This plane
   */
  copyFrom(source: Plane): Plane {
    this.normal.copyFrom(source.normal);
    this.distance = source.distance;
    return this;
  }
}
