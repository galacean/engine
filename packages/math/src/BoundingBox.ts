import { BoundingSphere } from "./BoundingSphere";
import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { Matrix } from "./Matrix";
import { Vector3 } from "./Vector3";

/**
 * Axis Aligned Bound Box (AABB).
 */
export class BoundingBox implements IClone<BoundingBox>, ICopy<BoundingBox, BoundingBox> {
  private static _tempVec30: Vector3 = new Vector3();
  private static _tempVec31: Vector3 = new Vector3();

  /**
   * Calculate a bounding box from the center point and the extent of the bounding box.
   * @param center - The center point
   * @param extent - The extent of the bounding box
   * @param out - The calculated bounding box
   */
  static fromCenterAndExtent(center: Vector3, extent: Vector3, out: BoundingBox): void {
    Vector3.subtract(center, extent, out.min);
    Vector3.add(center, extent, out.max);
  }

  /**
   * Calculate a bounding box that fully contains the given points.
   * @param points - The given points
   * @param out - The calculated bounding box
   */
  static fromPoints(points: Vector3[], out: BoundingBox): void {
    if (!points || points.length === 0) {
      throw new Error("points must be array and length must > 0");
    }

    const { min, max } = out;
    min.x = min.y = min.z = Number.MAX_VALUE;
    max.x = max.y = max.z = -Number.MAX_VALUE;

    for (let i = 0, l = points.length; i < l; ++i) {
      const point = points[i];
      Vector3.min(min, point, min);
      Vector3.max(max, point, max);
    }
  }

  /**
   * Calculate a bounding box from a given sphere.
   * @param sphere - The given sphere
   * @param out - The calculated bounding box
   */
  static fromSphere(sphere: BoundingSphere, out: BoundingBox): void {
    const { center, radius } = sphere;
    const { min, max } = out;

    min.x = center.x - radius;
    min.y = center.y - radius;
    min.z = center.z - radius;
    max.x = center.x + radius;
    max.y = center.y + radius;
    max.z = center.z + radius;
  }

  /**
   * Transform a bounding box.
   * @param source - The original bounding box
   * @param matrix - The transform to apply to the bounding box
   * @param out - The transformed bounding box
   */
  static transform(source: BoundingBox, matrix: Matrix, out: BoundingBox): void {
    // https://zeux.io/2010/10/17/aabb-from-obb-with-component-wise-abs/
    const center = BoundingBox._tempVec30;
    const extent = BoundingBox._tempVec31;
    source.getCenter(center);
    source.getExtent(extent);
    Vector3.transformCoordinate(center, matrix, center);
    const { x, y, z } = extent;
    const e = matrix.elements;
    // prettier-ignore
    const e0 = e[0], e1 = e[1], e2 = e[2],
    e4 = e[4], e5 = e[5], e6 = e[6],
    e8 = e[8], e9 = e[9], e10 = e[10];
    extent.set(
      (e0 === 0 ? 0 : Math.abs(x * e0)) + (e4 === 0 ? 0 : Math.abs(y * e4)) + (e8 === 0 ? 0 : Math.abs(z * e8)),
      (e1 === 0 ? 0 : Math.abs(x * e1)) + (e5 === 0 ? 0 : Math.abs(y * e5)) + (e9 === 0 ? 0 : Math.abs(z * e9)),
      (e2 === 0 ? 0 : Math.abs(x * e2)) + (e6 === 0 ? 0 : Math.abs(y * e6)) + (e10 === 0 ? 0 : Math.abs(z * e10))
    );
    // set min、max
    Vector3.subtract(center, extent, out.min);
    Vector3.add(center, extent, out.max);
  }

  /**
   * Calculate a bounding box that is as large as the total combined area of the two specified boxes.
   * @param box1 - The first box to merge
   * @param box2 - The second box to merge
   * @param out - The merged bounding box
   * @returns The merged bounding box
   */
  static merge(box1: BoundingBox, box2: BoundingBox, out: BoundingBox): BoundingBox {
    Vector3.min(box1.min, box2.min, out.min);
    Vector3.max(box1.max, box2.max, out.max);
    return out;
  }

  /** The minimum point of the box. */
  public readonly min: Vector3 = new Vector3();
  /** The maximum point of the box. */
  public readonly max: Vector3 = new Vector3();

  /**
   * Constructor of BoundingBox.
   * @param min - The minimum point of the box
   * @param max - The maximum point of the box
   */
  constructor(min: Vector3 = null, max: Vector3 = null) {
    min && this.min.copyFrom(min);
    max && this.max.copyFrom(max);
  }

  /**
   * Get the center point of this bounding box.
   * @param out - The center point of this bounding box
   * @returns The center point of this bounding box
   */
  getCenter(out: Vector3): Vector3 {
    const { min, max } = this;
    const centerX = max._x + min._x;
    const centerY = max._y + min._y;
    const centerZ = max._z + min._z;
    out.set(isNaN(centerX) ? 0 : centerX * 0.5, isNaN(centerY) ? 0 : centerY * 0.5, isNaN(centerZ) ? 0 : centerZ * 0.5);
    return out;
  }

  /**
   * Get the extent of this bounding box.
   * @param out - The extent of this bounding box
   * @returns The extent of this bounding box
   */
  getExtent(out: Vector3): Vector3 {
    const { min, max } = this;
    const extentX = max._x - min._x;
    const extentY = max._y - min._y;
    const extentZ = max._z - min._z;
    out.set(isNaN(extentX) ? 0 : extentX * 0.5, isNaN(extentY) ? 0 : extentY * 0.5, isNaN(extentZ) ? 0 : extentZ * 0.5);
    return out;
  }

  /**
   * Get the eight corners of this bounding box.
   * @param out - An array of points representing the eight corners of this bounding box
   * @returns An array of points representing the eight corners of this bounding box
   */
  getCorners(out: Vector3[] = []): Vector3[] {
    const { min, max } = this;
    const minX = min.x;
    const minY = min.y;
    const minZ = min.z;
    const maxX = max.x;
    const maxY = max.y;
    const maxZ = max.z;
    const len = out.length;

    // The array length is less than 8 to make up
    if (len < 8) {
      for (let i = 0, l = 8 - len; i < l; ++i) {
        out[len + i] = new Vector3();
      }
    }

    out[0].set(minX, maxY, maxZ);
    out[1].set(maxX, maxY, maxZ);
    out[2].set(maxX, minY, maxZ);
    out[3].set(minX, minY, maxZ);
    out[4].set(minX, maxY, minZ);
    out[5].set(maxX, maxY, minZ);
    out[6].set(maxX, minY, minZ);
    out[7].set(minX, minY, minZ);

    return out;
  }

  /**
   * Transform a bounding box.
   * @param matrix - The transform to apply to the bounding box
   * @returns The transformed bounding box
   */
  public transform(matrix: Matrix): BoundingBox {
    BoundingBox.transform(this, matrix, this);
    return this;
  }

  /**
   * Creates a clone of this box.
   * @returns A clone of this box
   */
  clone(): BoundingBox {
    return new BoundingBox(this.min, this.max);
  }

  /**
   * Copy this bounding box from the specified box.
   * @param source - The specified box
   * @returns This bounding box
   */
  copyFrom(source: BoundingBox): BoundingBox {
    this.min.copyFrom(source.min);
    this.max.copyFrom(source.max);
    return this;
  }
}
